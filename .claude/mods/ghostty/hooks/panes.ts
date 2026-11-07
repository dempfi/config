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
  if (matches.length === 1) return matches[0]
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

export function tail(text: string, lines: number) {
  const rows = text.replace(/\s+$/, '').split('\n')
  const kept = rows.slice(-lines)
  const dropped = rows.length - kept.length
  return { text: kept.join('\n'), dropped }
}

export function describePane(pane: Pane) {
  const where = `window ${pane.window} tab ${pane.tab}${pane.isFront ? ' (front)' : ''}`
  const who = pane.isThisSession
    ? 'this session'
    : pane.session
      ? `Claude session ${pane.session.name ?? pane.session.id} (${pane.session.status ?? 'unknown'})`
      : (pane.foreground ?? 'shell')
  return `${pane.id}  ${shortTty(pane.tty)}  ${where}  ${who}  "${pane.title}"  ${pane.cwd}`
}
