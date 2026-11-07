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
  tail,
} from './panes.ts'

const TOOL = (name: string) => `mcp__ghostty__${name}`
const READ_ONLY = new Set([TOOL('panes'), TOOL('read')])
const SPLITS = ['right', 'down', 'left', 'up'] as const
const PLACES = ['tab', 'window', ...SPLITS] as const

const PANE = {
  type: 'string',
  description: 'A pane id, its tty (ttys002), or the name or id of the Claude session running in it',
}

const TOOLS = [
  {
    name: 'panes',
    description:
      'Lists every Ghostty pane: id, tty, window and tab, what runs in it (a Claude session with its name and busy/idle status, or the foreground program), title and working directory. The pane marked "this session" is the one you run in.',
    inputSchema: { type: 'object', properties: {} },
    isDeferred: false,
  },
  {
    name: 'read',
    description:
      "Reads the text a Ghostty pane shows: the visible screen, or the scrollback for what scrolled off. Use it to see another Claude session's screen, a dev server's log, or a prompt waiting for an answer.",
    inputSchema: {
      type: 'object',
      properties: {
        pane: PANE,
        scope: { type: 'string', enum: ['screen', 'scrollback'], description: 'screen when absent' },
        lines: { type: 'number', description: 'How many of the last lines to return; 60 when absent' },
      },
      required: ['pane'],
    },
  },
  {
    name: 'type',
    description:
      'Types text into a Ghostty pane as a paste, optionally pressing Enter after it. Refuses the pane you run in, and the pane in front of the user unless evenIfFocused is true.',
    inputSchema: {
      type: 'object',
      properties: {
        pane: PANE,
        text: { type: 'string' },
        enter: { type: 'boolean', description: 'Press Enter after the text' },
        evenIfFocused: { type: 'boolean', description: 'Type into the pane the user is looking at' },
        userApproved: { type: 'boolean', description: 'The user approved answering the permission dialog this pane shows' },
      },
      required: ['pane', 'text'],
    },
  },
  {
    name: 'key',
    description:
      'Presses one key in a Ghostty pane: enter, escape, tab, up, down, space, a letter or digit, with optional modifiers (shift, control, option, command, comma-separated). Answers a menu or a y/n prompt, or sends ctrl+c with key "c" and modifiers "control".',
    inputSchema: {
      type: 'object',
      properties: {
        pane: PANE,
        key: { type: 'string' },
        modifiers: { type: 'string' },
        evenIfFocused: { type: 'boolean', description: 'Press it in the pane the user is looking at' },
        userApproved: { type: 'boolean', description: 'The user approved answering the permission dialog this pane shows' },
      },
      required: ['pane', 'key'],
    },
  },
  {
    name: 'open',
    description:
      "Opens a Ghostty pane where the user can watch it: a split beside a pane (right, down, left, up), a tab, or a window, in a working directory, optionally running a command in its shell so the pane stays when the command ends. Focus returns to where the user was unless takeFocus is true. Returns the new pane's id.",
    inputSchema: {
      type: 'object',
      properties: {
        where: { type: 'string', enum: [...PLACES] },
        cwd: { type: 'string', description: 'Absolute working directory' },
        command: { type: 'string', description: 'Typed into the new shell and run' },
        title: { type: 'string', description: 'A fixed title for the pane' },
        next: { ...PANE, description: 'The pane to split; the front pane when absent' },
        takeFocus: { type: 'boolean' },
      },
      required: ['where'],
    },
  },
  {
    name: 'focus',
    description: "Brings a Ghostty pane to the front, to show the user something that needs them.",
    inputSchema: { type: 'object', properties: { pane: PANE }, required: ['pane'] },
  },
  {
    name: 'close',
    description: 'Closes a Ghostty pane, ending what runs in it. Refuses the pane you run in.',
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
    const header = frontmost ? 'Ghostty is frontmost.' : 'Ghostty is in the background.'
    return reply([header, ...all.map(describePane)].join('\n'))
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

  for (const tool of TOOLS) {
    on('tool.call', { tool: TOOL(tool.name) }, async ($, e) => answer($, tool.name, e as Record<string, unknown>)).catch(
      () => reply('the ghostty tool failed', true),
    )
  }

  on('tool.check', async ($, e, next) => {
    if (READ_ONLY.has(e.tool)) return { decision: 'allow', reason: 'Reading Ghostty panes changes nothing.' }
    return next(e)
  }).catch(($, e, next) => next(e))
}
