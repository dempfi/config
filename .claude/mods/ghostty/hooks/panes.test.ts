import { expect, test } from 'claude-code/testing'
import { type RawPane, findPane, isUnderTheUser, joinPanes, parsePs, tail } from './panes.ts'

function raw(id: string, tty: string, extra: Partial<RawPane> = {}): RawPane {
  return {
    id,
    window: 1,
    tab: 1,
    tabSelected: false,
    focusedInTab: true,
    isFront: false,
    title: id,
    cwd: '/x/app',
    tty,
    foregroundPid: 0,
    ...extra,
  }
}

const PS = [
  '  100 ttys001  /usr/local/bin/claude',
  '  200 ttys002  npm run dev',
  '  300 ttys003  -/opt/homebrew/bin/fish',
  '  400 ??       /Applications/Ghostty.app/Contents/MacOS/ghostty',
].join('\n')

const SESSIONS = [
  { pid: 100, sessionId: 'aaa', name: 'acme-57', status: 'busy', kind: 'interactive' },
  { pid: 400, sessionId: 'bg', name: 'background', status: 'idle', kind: 'bg' },
]

test('a pane running claude is matched to its session through its tty', async () => {
  const panes = joinPanes([raw('A', '/dev/ttys001', { foregroundPid: 100 })], SESSIONS, parsePs(PS), 'zzz')
  expect(panes[0]?.session?.name).toBe('acme-57')
  expect(panes[0]?.session?.status).toBe('busy')
  expect(panes[0]?.isThisSession).toBe(false)
})

test('a session with no terminal claims no pane', async () => {
  const panes = joinPanes([raw('D', '/dev/ttys004')], SESSIONS, parsePs(PS), 'zzz')
  expect(panes[0]?.session).toBe(undefined)
})

test('the pane this session runs in is marked', async () => {
  const panes = joinPanes([raw('A', '/dev/ttys001')], SESSIONS, parsePs(PS), 'aaa')
  expect(panes[0]?.isThisSession).toBe(true)
})

test('a plain pane reports its foreground program by name', async () => {
  const panes = joinPanes([raw('B', '/dev/ttys002', { foregroundPid: 200 })], SESSIONS, parsePs(PS), 'zzz')
  expect(panes[0]?.foreground).toBe('npm run dev')
  expect(panes[0]?.session).toBe(undefined)
})

test('a pane is found by id, tty in either spelling, or session name', async () => {
  const panes = joinPanes(
    [raw('A', '/dev/ttys001'), raw('B', '/dev/ttys002')],
    SESSIONS,
    parsePs(PS),
    'zzz',
  )
  expect(findPane(panes, 'B')?.id).toBe('B')
  expect(findPane(panes, 'ttys002')?.id).toBe('B')
  expect(findPane(panes, '/dev/ttys002')?.id).toBe('B')
  expect(findPane(panes, 'acme-57')?.id).toBe('A')
  expect(() => findPane(panes, 'nope')).toThrow()
})

test('only the front pane of a frontmost Ghostty is under the user', async () => {
  const panes = joinPanes([raw('A', '/dev/ttys001', { isFront: true })], SESSIONS, parsePs(PS), 'zzz')
  const pane = panes[0]
  if (!pane) throw new Error('no pane')
  expect(isUnderTheUser(pane, true)).toBe(true)
  expect(isUnderTheUser(pane, false)).toBe(false)
})

test('a read keeps the last lines and drops the blank rows under them', async () => {
  const screen = 'one\ntwo\nthree\n\n\n\n'
  expect(tail(screen, 2)).toEqual({ text: 'two\nthree', dropped: 1 })
  expect(tail(screen, 10)).toEqual({ text: 'one\ntwo\nthree', dropped: 0 })
})
