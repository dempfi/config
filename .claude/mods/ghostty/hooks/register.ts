import type { EngineInterface, Register } from 'claude-code'
import {
  type Pane,
  type RawPane,
  type SessionRecord,
  describePane,
  findPane,
  headline,
  isUnderTheUser,
  joinPanes,
  parsePs,
  showsPermissionDialog,
  TAB_COLORS,
  isTabColor,
  tabTitle,
  tail,
} from './panes.ts'

const PREFIX = 'mcp__ghostty__'
const TOOL = (name: string) => `${PREFIX}${name}`
const READ_ONLY = new Set([TOOL('panes'), TOOL('read')])
const SPLITS = ['right', 'down', 'left', 'up'] as const
const PLACES = ['tab', 'window', ...SPLITS] as const

const PANE = { type: 'string', description: 'tty (ttys002), Claude session name, or pane id' }

const TOOLS = [
  {
    name: 'panes',
    description:
      'Ghostty panes, one per line: tty, what runs there (Claude session and status, or the program), w<window>t<tab> (* in front), title, and the cwd when it differs from yours.',
    inputSchema: { type: 'object', properties: {} },
    isDeferred: false,
  },
  {
    name: 'read',
    description: "A pane's screen, or its scrollback, cleaned of padding, sidebars and images.",
    inputSchema: {
      type: 'object',
      properties: {
        pane: PANE,
        scope: { type: 'string', enum: ['screen', 'scrollback'] },
        lines: { type: 'number', description: 'last lines; 60 by default' },
      },
      required: ['pane'],
    },
  },
  {
    name: 'type',
    description: "Pastes text into a pane, optionally pressing Enter. Refuses your own pane, and the user's front pane unless evenIfFocused.",
    inputSchema: {
      type: 'object',
      properties: {
        pane: PANE,
        text: { type: 'string' },
        enter: { type: 'boolean' },
        evenIfFocused: { type: 'boolean' },
        userApproved: { type: 'boolean', description: 'the user approved the permission dialog on screen' },
      },
      required: ['pane', 'text'],
    },
  },
  {
    name: 'key',
    description: 'Presses one key (enter, escape, tab, up, down, space, a letter) with optional modifiers (shift,control,option,command).',
    inputSchema: {
      type: 'object',
      properties: {
        pane: PANE,
        key: { type: 'string' },
        modifiers: { type: 'string' },
        evenIfFocused: { type: 'boolean' },
        userApproved: { type: 'boolean', description: 'the user approved the permission dialog on screen' },
      },
      required: ['pane', 'key'],
    },
  },
  {
    name: 'open',
    description: "Opens a split, tab or window the user can watch, optionally running a command in its shell; focus stays with the user unless takeFocus. Returns the new pane's id.",
    inputSchema: {
      type: 'object',
      properties: {
        where: { type: 'string', enum: [...PLACES] },
        cwd: { type: 'string' },
        command: { type: 'string' },
        title: { type: 'string' },
        next: { ...PANE, description: 'pane to split; the front one by default' },
        takeFocus: { type: 'boolean' },
      },
      required: ['where'],
    },
  },
  {
    name: 'tab',
    description: "Renames a pane's tab, led by a colored circle so related tabs group by color; no title and no color clears it.",
    inputSchema: {
      type: 'object',
      properties: {
        pane: PANE,
        title: { type: 'string' },
        color: { type: 'string', enum: Object.keys(TAB_COLORS) },
      },
      required: ['pane'],
    },
  },
  {
    name: 'focus',
    description: 'Brings a pane to the front for the user.',
    inputSchema: { type: 'object', properties: { pane: PANE }, required: ['pane'] },
  },
  {
    name: 'close',
    description: 'Closes a pane and what runs in it; refuses your own.',
    inputSchema: { type: 'object', properties: { pane: PANE }, required: ['pane'] },
  },
] as const

function reply(text: string, isError = false) {
  return isError ? { deny: text } : { result: text }
}

async function helper($: EngineInterface, request: Record<string, unknown>) {
  const run = await $.process.run([
    'osascript',
    '-l',
    'JavaScript',
    `${$.plugin.root}/hooks/ghostty.js`,
    JSON.stringify(request),
  ])
  if (run.exitCode !== 0) throw new Error(run.stderr.trim() || 'osascript failed')
  const answer = JSON.parse(run.stdout) as { ok: boolean; value?: unknown; error?: string }
  if (!answer.ok) throw new Error(answer.error ?? 'Ghostty refused')
  return answer.value
}

async function sessionRecords($: EngineInterface) {
  const home = await $.env.get('HOME')
  if (!home) return []
  const dir = `${home}/.claude/sessions`
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
  return records.filter((record): record is SessionRecord => record !== null && typeof record.pid === 'number')
}

async function panes($: EngineInterface) {
  const [listed, sessions, ps, thisSession] = await Promise.all([
    helper($, { op: 'list' }) as Promise<{ frontmost: boolean; panes: RawPane[] }>,
    sessionRecords($),
    $.process.run(['ps', '-A', '-o', 'pid=,tty=,command=']),
    $.session.id(),
  ])
  return {
    frontmost: listed.frontmost,
    panes: joinPanes(listed.panes, sessions, parsePs(ps.stdout), String(thisSession)),
  }
}

function refuseInput(pane: Pane, frontmost: boolean, evenIfFocused: unknown) {
  if (pane.isThisSession) return 'That pane is the one this session runs in.'
  if (evenIfFocused !== true && isUnderTheUser(pane, frontmost))
    return 'That pane is in front of the user, who may be typing in it; pass evenIfFocused to type there anyway.'
  return null
}

async function serve($: EngineInterface, name: string, args: Record<string, unknown>) {
  if (name === 'panes') {
    const { frontmost, panes: all } = await panes($)
    const cwd = await $.session.cwd()
    const header = frontmost ? '' : 'Ghostty is in the background.\n'
    return reply(header + all.map(pane => describePane(pane, cwd)).join('\n'))
  }

  if (name === 'open') {
    const where = String(args.where)
    if (!(PLACES as readonly string[]).includes(where)) return reply(`where must be one of ${PLACES.join(', ')}`, true)
    let next: string | undefined
    if (typeof args.next === 'string') next = findPane((await panes($)).panes, args.next).id
    const opened = (await helper($, {
      op: 'open',
      where,
      cwd: args.cwd,
      command: args.command,
      title: args.title,
      next,
      keepFocus: args.takeFocus !== true,
    })) as { id: string }
    return reply(`Opened ${where} pane ${opened.id}.`)
  }

  const { frontmost, panes: all } = await panes($)
  const pane = findPane(all, String(args.pane ?? ''))

  if (name === 'read') {
    const scope = args.scope === 'scrollback' ? 'scrollback' : 'screen'
    const lines = typeof args.lines === 'number' && args.lines > 0 ? Math.floor(args.lines) : 60
    const { text } = (await helper($, { op: 'read', pane: pane.id, scope })) as { text: string }
    const kept = tail(text, lines)
    const note = kept.dropped > 0 ? `[${kept.dropped} earlier lines]\n` : ''
    return reply(`${headline(pane)}\n${note}${kept.text}`)
  }

  if (name === 'type' || name === 'key') {
    const refusal = refuseInput(pane, frontmost, args.evenIfFocused)
    if (refusal) return reply(refusal, true)
    if (args.userApproved !== true) {
      const { text } = (await helper($, { op: 'read', pane: pane.id, scope: 'screen' })) as { text: string }
      if (showsPermissionDialog(tail(text, 40).text))
        return reply(
          'That pane shows a permission dialog, which is the user\'s to answer. Ask them on your board; pass userApproved only once they approved this exact prompt.',
          true,
        )
    }
    if (name === 'type') {
      await helper($, { op: 'type', pane: pane.id, text: String(args.text ?? ''), enter: args.enter === true })
      return reply(`Typed into ${pane.id}${args.enter === true ? ' and pressed Enter' : ''}.`)
    }
    await helper($, { op: 'key', pane: pane.id, key: String(args.key), modifiers: args.modifiers })
    return reply(`Pressed ${args.modifiers ? `${args.modifiers}+` : ''}${args.key} in ${pane.id}.`)
  }

  if (name === 'tab') {
    const title = tabTitle(typeof args.title === 'string' ? args.title : undefined, isTabColor(args.color) ? args.color : undefined)
    await helper($, { op: 'tab', pane: pane.id, title })
    return reply(title ? `Tab: ${title}` : 'Tab title cleared.')
  }

  if (name === 'focus') {
    await helper($, { op: 'focus', pane: pane.id })
    return reply(`Focused ${pane.id}.`)
  }

  if (name === 'close') {
    if (pane.isThisSession) return reply('That pane is the one this session runs in.', true)
    await helper($, { op: 'close', pane: pane.id })
    return reply(`Closed ${pane.id}.`)
  }

  return reply(`unknown tool ${name}`, true)
}

async function registerTools($: EngineInterface) {
  for (const tool of TOOLS) await $.tool.register({ ...tool, inputSchema: { ...tool.inputSchema } })
}

async function answer($: EngineInterface, name: string, e: Record<string, unknown>) {
  try {
    return await serve($, name, e)
  } catch (err) {
    return reply(err instanceof Error ? err.message : String(err), true)
  }
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await registerTools($)
    return next(e)
  })

  on('tool.call', { tool: /^mcp__ghostty__/ }, async ($, e) => {
    const call = e as Record<string, unknown>
    return answer($, String(call.tool).slice(PREFIX.length), call)
  }).catch(() => reply('the ghostty tool failed', true))

  on('tool.check', async ($, e, next) => {
    if (READ_ONLY.has(e.tool)) return { decision: 'allow', reason: 'Reading Ghostty panes changes nothing.' }
    return next(e)
  }).catch(($, e, next) => next(e))
}
