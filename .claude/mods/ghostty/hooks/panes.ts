export type RawPane = {
  id: string
  window: number
  tab: number
  tabSelected: boolean
  focusedInTab: boolean
  isFront: boolean
  title: string
  cwd: string
  tty: string
  foregroundPid: number
}

export type SessionRecord = {
  pid: number
  sessionId: string
  name?: string
  status?: string
  kind?: string
}

export type Pane = RawPane & {
  foreground?: string
  session?: { name?: string; id: string; status?: string; kind?: string }
  isThisSession: boolean
}

export function parsePs(output: string) {
  const byPid = new Map<number, { tty: string; command: string }>()
  for (const line of output.split('\n')) {
    const match = /^\s*(\d+)\s+(\S+)\s+(.*)$/.exec(line)
    if (!match?.[1] || !match[2] || match[3] === undefined) continue
    byPid.set(Number(match[1]), { tty: match[2], command: match[3].trim() })
  }
  return byPid
}

function shortTty(tty: string) {
  return tty.replace(/^\/dev\//, '')
}

export function joinPanes(
  raw: RawPane[],
  sessions: SessionRecord[],
  processes: Map<number, { tty: string; command: string }>,
  thisSessionId: string,
) {
  const sessionByTty = new Map<string, SessionRecord>()
  for (const session of sessions) {
    const tty = processes.get(session.pid)?.tty
    if (tty && tty !== '??') sessionByTty.set(tty, session)
  }
  return raw.map((pane): Pane => {
    const session = sessionByTty.get(shortTty(pane.tty))
    const foreground = processes.get(pane.foregroundPid)?.command
    return {
      ...pane,
      ...(foreground ? { foreground: foreground.slice(foreground.lastIndexOf('/') + 1) } : {}),
      ...(session
        ? { session: { name: session.name, id: session.sessionId, status: session.status, kind: session.kind } }
        : {}),
      isThisSession: session?.sessionId === thisSessionId,
    }
  })
}

export function findPane(panes: Pane[], query: string) {
  const wanted = query.trim()
  const tty = shortTty(wanted)
  const matches = panes.filter(
    pane =>
      pane.id === wanted ||
      shortTty(pane.tty) === tty ||
      pane.session?.name === wanted ||
      pane.session?.id === wanted,
  )
  const [match] = matches
  if (matches.length === 1 && match) return match
  if (matches.length > 1) throw new Error(`"${query}" matches ${matches.length} panes; pass a pane id`)
  throw new Error(`no pane matches "${query}"; list them with the panes tool`)
}

export function isUnderTheUser(pane: Pane, frontmost: boolean) {
  return frontmost && pane.isFront
}

const PERMISSION_DIALOG = /Do you want to [^\n?]*\?\s*\n(?:[^\n]*\n){0,3}?\s*(?:❯\s*)?1\.\s*Yes/

export function showsPermissionDialog(screen: string) {
  return PERMISSION_DIALOG.test(screen)
}

const IMAGE_CELLS = /(?:\u{10EEEE}\p{M}*)+/gu
const SIDEBAR_SHARE = 0.4
const SIDEBAR_MIN_COLUMN = 40

const CHROME = [
  /^\s*─{8,}.*$/,
  /^\s*\d[\d,.]*k? tokens\s*$/,
  /^\s*⎿\s+Tip:/,
  /AUTOMATED · /,
  /^\s*◆ [A-Z0-9-]+ /,
]

function sidebarColumn(lines: string[][]) {
  const counts = new Map<number, number>()
  let filled = 0
  for (const chars of lines) {
    if (chars.length === 0) continue
    filled++
    chars.forEach((char, column) => {
      if (char === '│' && column >= SIDEBAR_MIN_COLUMN) counts.set(column, (counts.get(column) ?? 0) + 1)
    })
  }
  let best: number | null = null
  let most = 0
  for (const [column, count] of counts)
    if (count > most) {
      best = column
      most = count
    }
  return best !== null && filled > 0 && most / filled >= SIDEBAR_SHARE ? best : null
}

function cells(line: string) {
  return line.match(/\P{M}\p{M}*/gu) ?? []
}

export function clean(text: string) {
  const lines = text.split('\n').map(cells)
  const cut = sidebarColumn(lines)
  const kept = lines
    .map(row => (cut === null ? row : row.slice(0, cut)).join('').replace(IMAGE_CELLS, '[image]').trimEnd())
    .filter(line => !CHROME.some(pattern => pattern.test(line)))
  return kept
    .join('\n')
    .replace(/^\s*│\s*$/gm, '')
    .replace(/(?:\[image\]\n\s*)+\[image\]/g, '[image]')
    .replace(/\n{3,}/g, '\n\n')
}

export function tail(text: string, lines: number) {
  const rows = clean(text).replace(/\s+$/, '').split('\n')
  const kept = rows.slice(-lines)
  const dropped = rows.length - kept.length
  return { text: kept.join('\n'), dropped }
}

export const TAB_COLORS = {
  blue: '🟦',
  green: '🟩',
  purple: '🟪',
  orange: '🟧',
  red: '🟥',
  yellow: '🟨',
  brown: '🟫',
  teal: '🩵',
  pink: '🩷',
} as const

export type TabColor = keyof typeof TAB_COLORS

export function isTabColor(value: unknown): value is TabColor {
  return typeof value === 'string' && value in TAB_COLORS
}

export function tabTitle(title: string | undefined, color: TabColor | undefined) {
  const text = title?.trim() ?? ''
  const marker = color ? TAB_COLORS[color] : ''
  return [marker, text].filter(Boolean).join(' ')
}

export function headline(pane: Pane) {
  const who = pane.isThisSession
    ? 'this session'
    : pane.session
      ? `${pane.session.name ?? pane.session.id} (${pane.session.status ?? 'unknown'})`
      : (pane.foreground ?? 'shell')
  return `${shortTty(pane.tty)} ${who}`
}

export function describePane(pane: Pane, cwd?: string) {
  const where = `w${pane.window}t${pane.tab}${pane.isFront ? '*' : ''}`
  const place = pane.cwd && pane.cwd !== cwd ? ` ${pane.cwd}` : ''
  return `${headline(pane)} ${where} "${pane.title}"${place}`
}
