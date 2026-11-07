import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, Timer } from 'claude-code'
import type { Automated, Lead, ProjectRequest, Worker } from '../types'
import {
  COLORS,
  COLOR_NAMES,
  counts,
  digest,
  isColor,
  leadContext,
  needsAttention,
  pickColor,
  slug,
  spawnCommand,
  workerBrief,
} from './project.ts'
import { BLACK, SIDE, type Run, hazard } from './tape.ts'

const leadAtom = atom({ plugin: 'project', key: 'lead' } as const, null, { shape: 'lead-1' })
const automatedAtom = atom({ plugin: 'project', key: 'automated' } as const, null, { shape: 'automated-1' })

const TOOL = 'mcp__project__project' as const
const POLL_MS = 5000
const ACTIONS = ['define', 'spawn', 'workers', 'close'] as const

let poller: Timer | undefined
let isTicking = false

const DESCRIPTION = [
  'Runs the project this session leads. Only a project lead (started with /project <name>) uses it.',
  '- define {summary, color}: once the user agrees on the problem, a one-line summary for the strip, and a color (' +
    COLOR_NAMES.join(', ') +
    ').',
  '- spawn {role, task, cwd?, model?}: open a real Claude session in a new Ghostty tab for one task. role is a short name (api, tests, docs); task is a self-contained brief with everything the worker needs; cwd is its working directory, this session\'s when absent.',
  '- workers: every worker with its pane, session name and status (busy, idle).',
  '- close {role}: close a finished worker\'s tab.',
].join('\n')

const SCHEMA = {
  type: 'object',
  properties: {
    action: { type: 'string', enum: [...ACTIONS] },
    summary: { type: 'string' },
    color: { type: 'string', enum: COLOR_NAMES },
    role: { type: 'string' },
    task: { type: 'string' },
    cwd: { type: 'string' },
    model: { type: 'string' },
  },
  required: ['action'],
}

type SessionRecord = { sessionId: string; name?: string; status?: string }

async function ownId($: EngineInterface) {
  return String(await $.session.id())
}

async function home($: EngineInterface) {
  return (await $.env.get('HOME')) ?? '/tmp'
}

async function sessionRecords($: EngineInterface) {
  const dir = `${await home($)}/.claude/sessions`
  const entries = await $.fs.list(dir).catch(() => [])
  const records = await Promise.all(
    entries
      .filter(entry => entry.kind === 'file' && entry.name.endsWith('.json'))
      .map(async entry => {
        try {
          return JSON.parse(await $.fs.read(`${dir}/${entry.name}`)) as SessionRecord
        } catch {
          return null
        }
      }),
  )
  return records.filter((record): record is SessionRecord => record !== null && typeof record.sessionId === 'string')
}

async function ownName($: EngineInterface) {
  const id = await ownId($)
  return (await sessionRecords($)).find(record => record.sessionId === id)?.name ?? 'lead'
}

async function saveLead($: EngineInterface, lead: Lead | null) {
  await update($, leadAtom, () => lead)
  const key = `lead:${await ownId($)}`
  if (lead) await $.store.set(key, lead)
  else await $.store.delete(key)
}

async function refreshed($: EngineInterface, lead: Lead) {
  const records = await sessionRecords($)
  return lead.workers.map(worker => ({
    ...worker,
    status: records.find(record => record.sessionId === worker.sessionId)?.status ?? 'gone',
  }))
}

async function tick($: EngineInterface) {
  if (isTicking) return
  isTicking = true
  try {
    const lead = await read($, leadAtom)
    if (!lead || lead.workers.length === 0) return
    const workers = await refreshed($, lead)
    const changed = workers.some((worker, index) => worker.status !== lead.workers[index]?.status)
    if (!changed) return
    await saveLead($, { ...lead, workers })
    const stopped = needsAttention(lead.workers, workers)
    if (stopped.length > 0) await $.prompt.submit({ text: digest(lead, stopped) })
  } finally {
    isTicking = false
  }
}

function startPolling($: EngineInterface) {
  if (poller) return
  poller = $.clock.every(POLL_MS, () => void tick($))
}

function stopPolling() {
  poller?.cancel()
  poller = undefined
}

async function uuid($: EngineInterface) {
  const made = await $.process.run(['uuidgen'])
  return made.stdout.trim().toLowerCase()
}

async function ghostty($: EngineInterface, name: 'open' | 'close', args: Record<string, unknown>) {
  const ran = await $.tool.call({ tool: `mcp__ghostty__${name}`, ...args } as Parameters<EngineInterface['tool']['call']>[0])
  if (ran.deny !== undefined) throw new Error(ran.deny)
  return typeof ran.result === 'string' ? ran.result : (ran.text ?? '')
}

async function spawn($: EngineInterface, lead: Lead, request: ProjectRequest) {
  if (!lead.summary) throw new Error('define the problem with the user first')
  const role = slug(request.role ?? '')
  if (!role) throw new Error('spawn needs a role')
  if (lead.workers.some(worker => worker.role === role)) throw new Error(`a worker "${role}" already runs`)
  const task = request.task?.trim()
  if (!task) throw new Error('spawn needs a task')

  const dir = `${await home($)}/.claude/project-runs/${lead.name}/${role}`
  await $.process.run(['mkdir', '-p', dir])
  const leadName = await ownName($)
  const automated: Automated = { project: lead.name, role, color: lead.color, lead: leadName }
  const briefPath = `${dir}/brief.md`
  const taskPath = `${dir}/task.md`
  await $.fs.write(briefPath, workerBrief({ project: lead.name, summary: lead.summary, role, lead: leadName }))
  await $.fs.write(taskPath, task)

  const sessionId = await uuid($)
  const sessionName = `${lead.name}-${role}`
  const command = spawnCommand({ sessionId, sessionName, briefPath, taskPath, model: request.model, automated })
  const cwd = request.cwd?.trim() || (await $.session.cwd())
  const opened = await ghostty($, 'open', { where: 'tab', cwd, command, title: `${lead.name} · ${role}` })
  const pane = /pane ([0-9A-Fa-f-]{36})/.exec(opened)?.[1]

  const worker: Worker = { role, sessionId, name: sessionName, cwd, status: 'starting', ...(pane ? { pane } : {}) }
  await saveLead($, { ...lead, workers: [...lead.workers, worker] })
  return `Spawned ${sessionName} in ${cwd}${pane ? ` (pane ${pane})` : ''}. It reads its task from ${taskPath}.`
}

async function serve($: EngineInterface, request: ProjectRequest) {
  const lead = await read($, leadAtom)
  if (!lead) throw new Error('this session leads no project; the user starts one with /project <name>')

  if (request.action === 'define') {
    const summary = request.summary?.trim()
    if (!summary) throw new Error('define needs a summary')
    const color = isColor(request.color) ? request.color : lead.color
    await saveLead($, { ...lead, summary, color })
    return `Project "${lead.name}" defined, color ${color}: ${summary}`
  }

  if (request.action === 'spawn') return spawn($, lead, request)

  if (request.action === 'workers') {
    const workers = await refreshed($, lead)
    await saveLead($, { ...lead, workers })
    if (workers.length === 0) return 'No workers yet.'
    return workers
      .map(worker => `${worker.role}: session ${worker.name}, ${worker.status}, pane ${worker.pane ?? 'unknown'}, ${worker.cwd}`)
      .join('\n')
  }

  const role = slug(request.role ?? '')
  const worker = lead.workers.find(one => one.role === role)
  if (!worker) throw new Error(`no worker "${role}"`)
  if (worker.pane) await ghostty($, 'close', { pane: worker.pane })
  await saveLead($, { ...lead, workers: lead.workers.filter(one => one.role !== role) })
  return `Closed ${worker.name}.`
}

async function restore($: EngineInterface) {
  const id = await ownId($)
  const project = await $.env.get('CLAUDE_PROJECT')
  if (project) {
    const color = await $.env.get('CLAUDE_PROJECT_COLOR')
    const automated: Automated = {
      project,
      role: (await $.env.get('CLAUDE_PROJECT_ROLE')) ?? 'worker',
      color: isColor(color) ? color : pickColor(project),
      lead: (await $.env.get('CLAUDE_PROJECT_LEAD')) ?? 'lead',
    }
    await update($, automatedAtom, () => automated)
    await $.store.set(`automated:${id}`, automated)
  } else {
    const saved = (await $.store.get(`automated:${id}`)) as Automated | undefined
    if (saved) await update($, automatedAtom, () => saved)
  }
  const lead = (await $.store.get(`lead:${id}`)) as Lead | undefined
  if (lead) {
    await update($, leadAtom, () => lead)
    startPolling($)
  }
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.tool.register({ name: 'project', description: DESCRIPTION, inputSchema: SCHEMA })
    await $.command.register({
      name: 'project',
      description: 'Lead a project: interview, then run real Claude sessions as workers',
      argumentHint: '<name> | end',
    })
    await restore($)
    return next(e)
  })

  on('command.run', { command: 'project' }, async ($, e) => {
    const args = e.args.trim()
    const current = await read($, leadAtom)
    if (args === '') return { text: current ? `Leading "${current.name}". ${counts(current.workers)}` : 'Usage: /project <name>' }
    if (args === 'end') {
      stopPolling()
      await saveLead($, null)
      return { text: 'Project ended; its workers keep running until you close them.', context: ['This session no longer leads a project.'] }
    }
    const name = slug(args)
    if (!name) return { text: 'Give the project a name.' }
    await saveLead($, { name, color: pickColor(name), workers: [] })
    startPolling($)
    void $.prompt.submit({ text: `Start project "${name}": interview me to pin down the exact problem before anything else.` })
    return { text: `Project "${name}" started; this session leads it.`, context: [leadContext(name)] }
  })

  on('tool.call', { tool: TOOL }, async ($, e) => {
    if (!('action' in e) || !(ACTIONS as readonly string[]).includes(e.action))
      return { deny: `action must be one of ${ACTIONS.join(', ')}` }
    try {
      return { result: await serve($, e) }
    } catch (err) {
      return { deny: err instanceof Error ? err.message : String(err) }
    }
  }).catch(() => ({ deny: 'the project tool failed' }))

  on('ui.render', { component: 'ToolUse' }, async ($, e, next) => {
    if (e.props.tool !== TOOL || e.props.isExpanded) return next(e)
    const given = (e.props.input ?? {}) as Record<string, unknown>
    const input = {
      action: given.action,
      ...(typeof given.role === 'string' ? { role: given.role } : {}),
      ...(typeof given.summary === 'string' ? { summary: given.summary.slice(0, 60) } : {}),
    }
    return next({ ...e, props: { ...e.props, input } })
  })

  on('ui.render', { component: 'PromptHint' }, async ($, e, next) => {
    if (e.surface !== 'terminal') return next(e)
    const lead = await read($, leadAtom)
    const automated = await read($, automatedAtom)
    if (!lead && !automated) return next(e)
    const { Box, Text } = $.ui.resolve(e)
    const theirs = await next(e)
    const spans = (list: Run[]) =>
      list.map(run => (
        <Text color={run.color} backgroundColor={run.backgroundColor} bold={run.bold}>
          {run.text}
        </Text>
      ))

    if (lead) {
      const color = COLORS[lead.color]
      const strip = (
        <Box key="project-strip" flexDirection="row" height={1} backgroundColor={color}>
          <Text color={BLACK} backgroundColor={color} bold wrap="truncate-end">
            {` ◆ ${lead.name.toUpperCase()}  `}
            <Text color={BLACK} backgroundColor={color}>
              {lead.summary ?? 'defining the problem with you'}
            </Text>
          </Text>
          <Box flexGrow={1} />
          <Text color={BLACK} backgroundColor={color}>{` ${counts(lead.workers)} `}</Text>
        </Box>
      )
      return (
        <Box flexDirection="column">
          {theirs}
          {strip}
        </Box>
      )
    }

    if (!automated) return theirs
    const { left, label, right } = hazard(`AUTOMATED · ${automated.role}`, {
      text: automated.project,
      color: COLORS[automated.color],
    })
    const strip = (
      <Box key="automated-strip" flexDirection="row" height={1}>
        <Box flexGrow={1} width={0} overflow="hidden" justifyContent="flex-end">
          <Box flexShrink={0} width={SIDE}>
            <Text>{spans(left)}</Text>
          </Box>
        </Box>
        <Box flexShrink={0}>
          <Text>{spans(label)}</Text>
        </Box>
        <Box flexGrow={1} width={0} overflow="hidden">
          <Box flexShrink={0} width={SIDE}>
            <Text>{spans(right)}</Text>
          </Box>
        </Box>
      </Box>
    )
    return (
      <Box flexDirection="column">
        {theirs}
        {strip}
      </Box>
    )
  })
}
