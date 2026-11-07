import { expect, test } from 'claude-code/testing'
import {
  type RawPane,
  clean,
  findPane,
  isUnderTheUser,
  joinPanes,
  matcher,
  parsePs,
  showsPermissionDialog,
  tabTitle,
  tail,
  unseen,
} from './panes.ts'

const WIDE = 130
const row = (left: string, right = '') => left.padEnd(WIDE, ' ') + '│' + right

test('a read cuts the docked sidebar off at its border and keeps the session text', async () => {
  const screen = [
    row('⏺ Tests pass (77). The scan is still running.', 'Claude 3/5'),
    row('  next I write the report', '✓ Write tests'),
    row('', '▶ Implement'),
    row('', ''),
    row('✻ Cogitated for 1m 21s', 'State'),
  ].join('\n')
  const text = clean(screen)
  expect(text).toContain('Tests pass (77)')
  expect(text).not.toContain('Claude 3/5')
  expect(text).not.toContain('Write tests')
  expect(text.split('\n').every(line => line === line.trimEnd())).toBe(true)
})

test('a read keeps a box-drawing bar that belongs to the content, such as a chart axis', async () => {
  const text = clean(['  20 │█████', '     │███', '   0 │█'].join('\n'))
  expect(text).toContain('20 │█████')
})

test('a read drops Claude Code chrome: dividers, the token counter, tips and the role strips', async () => {
  const screen = [
    '⏺ Done.',
    '─'.repeat(80) + ' lantern-docs-review ─',
    '❯ ',
    '                    166740 tokens',
    '  ⎿  Tip: Press shift+↑ to raise effort',
    '                AUTOMATED · review  lantern-docs',
  ].join('\n')
  expect(clean(screen)).toBe('⏺ Done.\n❯')
})

test('rows that hold an image are cut at the sidebar border like every other row', async () => {
  const cell = '\u{10EEEE}̅̍'
  const plot = (label: string) => (label.padEnd(6) + cell.repeat(100)).padEnd(6 + 300, ' ')
  const screen = [
    '  title'.padEnd(WIDE, ' ') + '│State',
    plot('760') + ' '.repeat(WIDE - 106) + '│• first note',
    plot('') + ' '.repeat(WIDE - 106) + '│• second note',
    row('  Nov 1   Nov 14', ''),
  ].join('\n')
  const text = clean(screen)
  expect(text).toMatch(/760\s+\[image\]/)
  expect(text).not.toContain('note')
  expect(text).not.toContain('│')
})

test('an image on screen reads as one marker, not its placeholder cells', async () => {
  const cell = '\u{10EEEE}̅̍'
  const screen = ['  340 ' + cell.repeat(50), '      ' + cell.repeat(50), '      Oct 24        Nov 6'].join('\n')
  const text = clean(screen)
  expect(text).toContain('[image]')
  expect(text).not.toContain('\u{10EEEE}')
  expect(text.length).toBeLessThan(80)
})

test('a read since the last one returns only the lines the pane did not show before', async () => {
  const before = ['[vite] ready', 'GET /a 200', '❯', '  ~/D/acme (main)'].join('\n')
  const now = ['[vite] ready', 'GET /a 200', 'GET /b 500', 'error: boom', '❯', '  ~/D/acme (main)'].join('\n')
  expect(unseen(before, now)).toBe('GET /b 500\nerror: boom')
  expect(unseen(now, now)).toBe('')
})

test('a line repeated more often than before counts as new', async () => {
  expect(unseen('GET /a 200', 'GET /a 200\nGET /a 200')).toBe('GET /a 200')
})

test('a wait pattern is plain text, or a regex between slashes', async () => {
  expect(matcher('ready in')('VITE ready in 312 ms')).toBe(true)
  expect(matcher('/\\d+ passed/')('Tests: 42 passed')).toBe(true)
  expect(matcher('/FAIL/i')('fail')).toBe(true)
  expect(matcher('ready')('starting')).toBe(false)
})

test('a tab title leads with its color marker, and empty input clears the override', async () => {
  expect(tabTitle('render · frame', 'blue')).toBe('🔵 render · frame')
  expect(tabTitle('render · frame', undefined)).toBe('render · frame')
  expect(tabTitle(undefined, 'green')).toBe('🟢')
  expect(tabTitle('  ', undefined)).toBe('')
})

test('a Claude permission dialog on screen is recognised', async () => {
  const dialog = [
    ' Bash command',
    '   git push origin main',
    ' Do you want to proceed?',
    ' ❯ 1. Yes',
    "   2. Yes, and don't ask again for git push commands",
    '   3. No, and tell Claude what to do differently (esc)',
  ].join('\n')
  expect(showsPermissionDialog(dialog)).toBe(true)
})

test('a question or a plain prompt is not a permission dialog', async () => {
  expect(showsPermissionDialog('Which option do you want?\n 1. Batch\n 2. Send now')).toBe(false)
  expect(showsPermissionDialog('❯ continue with the migration\n')).toBe(false)
})

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
