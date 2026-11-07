import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, Timer } from 'claude-code'
import type { Automated, Lead, ProjectAction, ProjectRequest, Worker } from '../types'
import {
  COLORS,
  COLOR_NAMES,
  counts,
  dialogExcerpt,
  digest,
  isColor,
  leadContext,
  needsAttention,
  pickColor,
  slug,
  spawnCommand,
  spawnRefusal,
  WORKER_SETTINGS,
  KINDS,
  MAX_ACTIVE,
  active,
  nextPhase,
  phaseOf,
  workerBrief,
} from './project.ts'
import { BLACK, SIDE, type Run, hazard } from './tape.ts'

const leadAtom = atom({ plugin: 'project', key: 'lead' } as const, null, { shape: 'lead-1' })
const automatedAtom = atom({ plugin: 'project', key: 'automated' } as const, null, { shape: 'automated-1' })

const TOOL = 'mcp__project__project' as const
const POLL_MS = 5000
const ACTIONS = ['define', 'spawn', 'advance', 'workers', 'finish', 'close', 'spend'] as const satisfies readonly ProjectAction[]

let poller: Timer | undefined
let isTicking = false

const DESCRIPTION = [
  'Runs the project this session leads (started with /project <name>), phase by phase: frame, research, design, build, qa, ship.',
  `define {summary, color}: the agreed problem, ending frame; color is one of ${COLOR_NAMES.join(', ')}.`,
  `spawn {kind, role, question, task, cwd?, model?, worktree?}: one specialist (${KINDS.join(', ')}) the current phase takes, for the question its report answers; at most ${MAX_ACTIVE} run at once. worktree: true for code changes.`,
  'advance {decision}: record what the phase decided and move to the next; build and ship need the user\'s go-ahead first.',
  'workers: status and report paths. finish {role}: a worktree\'s commits. close {role}: ends a worker, removing a merged, clean worktree. spend: tokens per worker.',
].join('\n')

const SCHEMA = {
  type: 'object',
  properties: {
    action: { type: 'string', enum: [...ACTIONS] },
    summary: { type: 'string' },
    color: { type: 'string', enum: COLOR_NAMES },
    kind: { type: 'string', enum: [...KINDS] },
    role: { type: 'string' },
    question: { type: 'string' },
    task: { type: 'string' },
    cwd: { type: 'string' },
    model: { type: 'string' },
    worktree: { type: 'boolean' },
    decision: { type: 'string' },
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

async function runDir($: EngineInterface, project: string, role: string) {
  return `${await home($)}/.claude/project-runs/${project}/${role}`
}

async function blockedSince($: EngineInterface, project: string, worker: Worker) {
  const stat = await $.fs.stat(`${await runDir($, project, worker.role)}/blocked.json`).catch(() => null)
  return stat?.kind === 'file' && stat.mtimeMs > (worker.blockedAt ?? 0) ? stat.mtimeMs : null
}

async function escalate($: EngineInterface, worker: Worker) {
  if (!worker.pane) return false
  const screen = await ghostty($, 'read', { pane: worker.pane, lines: 40 }).catch(() => '')
  const dialog = dialogExcerpt(screen)
  if (!dialog) return false
  const text = `${worker.name} asks permission`
  await $.tool.call({
    tool: 'mcp__board__board',
    action: 'ask',
    text,
    detail: `${dialog.detail}\n\nYour answer is pressed in ${worker.name} (pane ${worker.pane}).`,
    options: dialog.options,
  } as Parameters<EngineInterface['tool']['call']>[0]).catch(() => null)
  return true
}

async function tick($: EngineInterface) {
  if (isTicking) return
  isTicking = true
  try {
    const lead = await read($, leadAtom)
    if (!lead || lead.workers.length === 0) return
    const workers = await refreshed($, lead)
    const asked: string[] = []
    for (const worker of workers) {
      const since = await blockedSince($, lead.name, worker)
      if (since === null) continue
      worker.blockedAt = since
      if (await escalate($, worker)) asked.push(worker.role)
    }
    const changed =
      asked.length > 0 ||
      workers.some((worker, index) => worker.status !== lead.workers[index]?.status || worker.blockedAt !== lead.workers[index]?.blockedAt)
    if (!changed) return
    await saveLead($, { ...lead, workers })
    const stopped = needsAttention(lead.workers, workers)
    const woken = [...stopped, ...workers.filter(worker => asked.includes(worker.role) && !stopped.includes(worker))]
    if (woken.length > 0) await $.prompt.submit({ text: digest(lead, woken, asked) })
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

async function markTab($: EngineInterface, pane: string, title: string, color: string) {
  await ghostty($, 'tab', { pane, title, color }).catch(() => '')
}

async function ghostty($: EngineInterface, name: 'open' | 'close' | 'tab' | 'read', args: Record<string, unknown>) {
  const ran = await $.tool.call({ tool: `mcp__ghostty__${name}`, ...args } as Parameters<EngineInterface['tool']['call']>[0])
  if (ran.deny !== undefined) throw new Error(ran.deny)
  return typeof ran.result === 'string' ? ran.result : (ran.text ?? '')
}

async function spawn($: EngineInterface, lead: Lead, request: ProjectRequest) {
  const kind = request.kind
  if (!kind || !(KINDS as readonly string[]).includes(kind)) throw new Error(`spawn needs a kind: ${KINDS.join(', ')}`)
  const refusal = spawnRefusal({ ...lead, workers: await refreshed($, lead) }, kind, request.question)
  if (refusal) throw new Error(refusal)
  const summary = lead.summary ?? ''
  const question = request.question?.trim() ?? ''
  const role = slug(request.role ?? '')
  if (!role) throw new Error('spawn needs a role')
  if (lead.workers.some(worker => worker.role === role)) throw new Error(`a worker "${role}" already runs`)
  const task = request.task?.trim()
  if (!task) throw new Error('spawn needs a task')

  const dir = await runDir($, lead.name, role)
  await $.process.run(['mkdir', '-p', dir])
  let cwd = request.cwd?.trim() || (await $.session.cwd())
  let worktree: Worker['worktree']
  if (request.worktree === true) {
    const made = await makeWorktree($, cwd, `project/${lead.name}/${role}`, `${dir}/tree`)
    worktree = made.worktree
    cwd = made.cwd
  }

  const leadName = await ownName($)
  const automated: Automated = { project: lead.name, role, color: lead.color, lead: leadName }
  const briefPath = `${dir}/brief.md`
  const taskPath = `${dir}/task.md`
  const report = `${dir}/report.md`
  await $.fs.write(
    briefPath,
    workerBrief({
      project: lead.name,
      summary,
      role,
      kind,
      question,
      report,
      lead: leadName,
      ...(worktree ? { branch: worktree.branch } : {}),
    }),
  )
  await $.fs.write(taskPath, task)
  const settingsPath = `${dir}/settings.json`
  await $.fs.write(settingsPath, JSON.stringify(WORKER_SETTINGS))

  const sessionId = await uuid($)
  const sessionName = `${lead.name}-${role}`
  const command = spawnCommand({ sessionId, sessionName, briefPath, taskPath, settingsPath, model: request.model, automated })
  const opened = await ghostty($, 'open', { where: 'tab', cwd, command, title: `${lead.name} · ${role}` })
  const pane = /pane ([0-9A-Fa-f-]{36})/.exec(opened)?.[1]
  if (pane) await markTab($, pane, `${lead.name} · ${role}`, lead.color)

  const worker: Worker = {
    role,
    sessionId,
    name: sessionName,
    cwd,
    kind,
    report,
    status: 'starting',
    ...(pane ? { pane } : {}),
    ...(worktree ? { worktree } : {}),
  }
  await saveLead($, { ...lead, workers: [...lead.workers, worker] })
  return `Spawned ${sessionName} (${kind}); report at ${report}${worktree ? `; branch ${worktree.branch}` : ''}`
}

async function git($: EngineInterface, args: string[]) {
  const ran = await $.process.run(['git', ...args])
  return { isOk: ran.exitCode === 0, out: ran.stdout.trim(), err: ran.stderr.trim() }
}

async function makeWorktree($: EngineInterface, cwd: string, branch: string, path: string) {
  const top = await git($, ['-C', cwd, 'rev-parse', '--show-toplevel'])
  if (!top.isOk) throw new Error(`${cwd} is not in a git repository`)
  const repo = top.out
  const base = (await git($, ['-C', repo, 'rev-parse', 'HEAD'])).out
  const added = await git($, ['-C', repo, 'worktree', 'add', '-b', branch, path, base])
  if (!added.isOk) throw new Error(`git worktree add failed: ${added.err}`)
  const inside = cwd.startsWith(repo) ? cwd.slice(repo.length) : ''
  return { worktree: { repo, path, branch, base }, cwd: `${path}${inside}` }
}

async function finish($: EngineInterface, worker: Worker) {
  const tree = worker.worktree
  if (!tree) return `${worker.name} has no worktree; its changes are in ${worker.cwd}`
  const log = await git($, ['-C', tree.path, 'log', '--oneline', `${tree.base}..HEAD`])
  const stat = await git($, ['-C', tree.path, 'diff', '--stat', tree.base])
  const dirty = await git($, ['-C', tree.path, 'status', '--porcelain'])
  return [
    `${tree.branch} in ${tree.path}`,
    log.out ? log.out : 'no commits yet',
    dirty.out ? `uncommitted: ${dirty.out.split('\n').length} files` : '',
    stat.out.split('\n').slice(-12).join('\n'),
  ]
    .filter(Boolean)
    .join('\n')
}

async function removeWorktree($: EngineInterface, worker: Worker) {
  const tree = worker.worktree
  if (!tree) return ''
  const dirty = await git($, ['-C', tree.path, 'status', '--porcelain'])
  const merged = await git($, ['-C', tree.repo, 'branch', '--merged', 'HEAD', '--list', tree.branch])
  if (dirty.out || !merged.out) return ` Kept ${tree.path}: ${dirty.out ? 'uncommitted changes' : `${tree.branch} is not merged`}.`
  await git($, ['-C', tree.repo, 'worktree', 'remove', tree.path])
  await git($, ['-C', tree.repo, 'branch', '-d', tree.branch])
  return ' Removed its worktree and branch.'
}

async function serve($: EngineInterface, request: ProjectRequest) {
  const lead = await read($, leadAtom)
  if (!lead) throw new Error('this session leads no project; the user starts one with /project <name>')

  if (request.action === 'define') {
    const summary = request.summary?.trim()
    if (!summary) throw new Error('define needs a summary')
    const color = isColor(request.color) ? request.color : lead.color
    const isFraming = phaseOf(lead) === 'frame'
    const decisions = isFraming ? [...(lead.decisions ?? []), { phase: 'frame' as const, text: summary }] : lead.decisions
    await saveLead($, { ...lead, summary, color, phase: isFraming ? 'research' : phaseOf(lead), ...(decisions ? { decisions } : {}) })
    await markTab($, await ownName($), `${lead.name} · lead`, color)
    for (const worker of lead.workers) if (worker.pane) await markTab($, worker.pane, `${lead.name} · ${worker.role}`, color)
    return `Defined, ${color}; phase ${isFraming ? 'research' : phaseOf(lead)}`
  }

  if (request.action === 'spawn') return spawn($, lead, request)

  if (request.action === 'advance') {
    const decision = request.decision?.trim()
    if (!decision) throw new Error('advance needs the decision this phase reached')
    const from = phaseOf(lead)
    const to = nextPhase(from)
    if (!to) throw new Error('the project is at ship; the user decides what happens next')
    if (from === 'frame') throw new Error('define the problem to leave frame')
    const running = active(await refreshed($, lead))
    if (running.length > 0) throw new Error(`${running.map(worker => worker.role).join(', ')} still working; wait for their reports`)
    await saveLead($, { ...lead, phase: to, decisions: [...(lead.decisions ?? []), { phase: from, text: decision }] })
    return `Phase ${to}`
  }

  if (request.action === 'workers') {
    const workers = await refreshed($, lead)
    await saveLead($, { ...lead, workers })
    const head = `phase ${phaseOf(lead)}`
    if (workers.length === 0) return `${head}; no workers yet`
    return [
      head,
      ...workers.map(worker => `${worker.name} ${worker.kind ?? ''} ${worker.status}${worker.report ? ` report ${worker.report}` : ''}`),
    ].join('\n')
  }

  if (request.action === 'spend') {
    const usage = await spendOf($, lead.workers)
    const rows = lead.workers.map(worker => ({ worker, tokens: usage[worker.sessionId] ?? null }))
    const counted = rows.filter(row => row.tokens !== null)
    if (counted.length > 0)
      await $.tool.call({
        tool: 'mcp__board__chart',
        kind: 'hbar',
        title: `${lead.name}: tokens per worker`,
        series: [{ values: counted.map(row => total(row.tokens)) }],
        labels: counted.map(row => row.worker.role),
        pin: true,
      } as Parameters<EngineInterface['tool']['call']>[0]).catch(() => null)
    return rows
      .map(({ worker, tokens }) =>
        tokens
          ? `${worker.role}: ${short(total(tokens))} (in ${short(tokens.input)}, cache ${short(tokens.cacheRead + tokens.cacheWrite)}, out ${short(tokens.output)})`
          : `${worker.role}: no transcript yet`,
      )
      .join('\n')
  }

  const role = slug(request.role ?? '')
  const worker = lead.workers.find(one => one.role === role)
  if (!worker) throw new Error(`no worker "${role}"`)
  if (request.action === 'finish') return finish($, worker)
  if (worker.pane) await ghostty($, 'close', { pane: worker.pane }).catch(() => '')
  const kept = await removeWorktree($, worker)
  await saveLead($, { ...lead, workers: lead.workers.filter(one => one.role !== role) })
  return `Closed ${worker.name}.${kept}`
}

type Tokens = { input: number; cacheRead: number; cacheWrite: number; output: number }

const SPEND_SCRIPT = `
import sys, json, glob, os
out = {}
for sid in sys.argv[1:]:
    seen, t, found = set(), {'input': 0, 'cacheRead': 0, 'cacheWrite': 0, 'output': 0}, False
    for path in glob.glob(os.path.expanduser('~/.claude/projects/*/' + sid + '.jsonl')):
        found = True
        for line in open(path, errors='replace'):
            if '"usage"' not in line:
                continue
            try:
                message = json.loads(line).get('message') or {}
            except ValueError:
                continue
            usage = message.get('usage') if isinstance(message, dict) else None
            key = message.get('id') if isinstance(message, dict) else None
            if not usage or key in seen:
                continue
            seen.add(key)
            t['input'] += usage.get('input_tokens') or 0
            t['cacheRead'] += usage.get('cache_read_input_tokens') or 0
            t['cacheWrite'] += usage.get('cache_creation_input_tokens') or 0
            t['output'] += usage.get('output_tokens') or 0
    if found:
        out[sid] = t
print(json.dumps(out))
`

async function spendOf($: EngineInterface, workers: Worker[]) {
  if (workers.length === 0) return {}
  const ran = await $.process.run(['python3', '-I', '-c', SPEND_SCRIPT, ...workers.map(worker => worker.sessionId)], {
    timeoutMs: 60_000,
  })
  try {
    return JSON.parse(ran.stdout) as Record<string, Tokens>
  } catch {
    return {}
  }
}

function total(tokens: Tokens | null) {
  return tokens ? tokens.input + tokens.cacheRead + tokens.cacheWrite + tokens.output : 0
}

function short(value: number) {
  return value >= 1e6 ? `${(value / 1e6).toFixed(1)}M` : value >= 1e3 ? `${Math.round(value / 1e3)}k` : String(value)
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
  const saved = (await $.store.get(`lead:${id}`)) as Lead | undefined
  if (saved) {
    const lead = isColor(saved.color) ? saved : { ...saved, color: pickColor(saved.name) }
    await update($, leadAtom, () => lead)
    startPolling($)
  }
}

export const register: Register = on => {
  on('classic.Notification', async ($, e, next) => {
    const automated = await read($, automatedAtom)
    if (automated && /permission/i.test(`${e.notification_type} ${e.message}`)) {
      const dir = await runDir($, automated.project, automated.role)
      await $.process.run(['mkdir', '-p', dir])
      await $.fs.write(`${dir}/blocked.json`, JSON.stringify({ message: e.message }))
    }
    return next(e)
  }).catch(($, e, next) => next(e))

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
    const color = pickColor(name)
    await saveLead($, { name, color, workers: [] })
    await markTab($, await ownName($), `${name} · lead`, color)
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
            {` ◆ ${lead.name.toUpperCase()} · ${phaseOf(lead).toUpperCase()}  `}
            <Text color={BLACK} backgroundColor={color}>
              {lead.summary ?? 'framing the problem with you'}
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
