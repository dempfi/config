import { expect, test } from 'claude-code/testing'
import type { Lead, Worker } from '../types'
import { COLOR_NAMES, counts, dialogExcerpt, digest, needsAttention, pickColor, slug, spawnCommand, workerBrief } from './project.ts'
import { SLANT, hazard } from './tape.ts'

function worker(role: string, status: string): Worker {
  return { role, sessionId: `id-${role}`, name: `p-${role}`, cwd: '/x/app', status }
}

test('a name becomes a slug safe for a session name and a path', async () => {
  expect(slug('  Billing Revamp! v2 ')).toBe('billing-revamp-v2')
  expect(slug('***')).toBe('')
})

test('a project keeps the same color every time it is named', async () => {
  expect(pickColor('billing')).toBe(pickColor('billing'))
  expect(COLOR_NAMES).toContain(pickColor('anything'))
})

test('the spawn command tags the worker, names its session and points it at its brief and task', async () => {
  const command = spawnCommand({
    sessionId: 'b5f1c2d0-0000-4000-8000-000000000000',
    sessionName: 'billing-api',
    briefPath: '/Users/me/.claude/project-runs/billing/api/brief.md',
    taskPath: '/Users/me/.claude/project-runs/billing/api/task.md',
    model: 'sonnet',
    automated: { project: 'billing', role: 'api', color: 'blue', lead: 'acme-b6' },
  })
  expect(command.startsWith('env CLAUDE_PROJECT=billing CLAUDE_PROJECT_ROLE=api')).toBe(true)
  expect(command).toContain('--session-id b5f1c2d0-0000-4000-8000-000000000000')
  expect(command).toContain('-n billing-api')
  expect(command).toContain('--append-system-prompt-file /Users/me/.claude/project-runs/billing/api/brief.md')
  expect(command).toContain('--model sonnet')
  expect(command.endsWith("'Your task is in /Users/me/.claude/project-runs/billing/api/task.md - read it and start.'")).toBe(
    true,
  )
})

test('nothing that would need shell quoting reaches the command line', async () => {
  expect(() =>
    spawnCommand({
      sessionId: 'x',
      sessionName: 'a b',
      briefPath: '/b',
      taskPath: '/t',
      automated: { project: 'p', role: 'r', color: 'blue', lead: 'l' },
    }),
  ).toThrow()
})

test('a worker that stops after working wakes the lead; one still working or already stopped does not', async () => {
  const before = [worker('api', 'busy'), worker('docs', 'busy'), worker('tests', 'idle')]
  const after = [worker('api', 'idle'), worker('docs', 'busy'), worker('tests', 'idle')]
  expect(needsAttention(before, after).map(one => one.role)).toEqual(['api'])
})

test('a worker starting up does not wake the lead until it has worked', async () => {
  expect(needsAttention([worker('api', 'starting')], [worker('api', 'idle')])).toEqual([])
})

test('the worker brief names the lead it reports to', async () => {
  const brief = workerBrief({ project: 'billing', summary: 'Move billing to passes', role: 'api', lead: 'acme-b6' })
  expect(brief).toContain('SendMessage to "acme-b6"')
  expect(brief).toContain('Move billing to passes')
})

test('a permission dialog on a worker screen becomes a board question with its own options', async () => {
  const screen = [
    '⏺ Bash(git push origin main)',
    ' Bash command',
    '   git push origin main',
    ' Do you want to proceed?',
    ' ❯ 1. Yes',
    "   2. Yes, and don't ask again for git push commands",
    '   3. No, and tell Claude what to do differently (esc)',
    '',
    '  ~/D/acme (main)',
  ].join('\n')
  const dialog = dialogExcerpt(screen)
  expect(dialog?.options).toEqual(['1. Yes', "2. Yes, and don't ask again for git push commands", '3. No, and tell Claude what to do differently (esc)'])
  expect(dialog?.detail).toContain('git push origin main')
  expect(dialogExcerpt('⏺ All tests pass.')).toBe(null)
})

test('the lead is told which stopped workers have a dialog waiting on the user', async () => {
  const lead: Lead = { name: 'billing', color: 'blue', workers: [] }
  const text = digest(lead, [worker('api', 'busy'), worker('docs', 'idle')], ['api'])
  expect(text).toContain('p-api is busy; its permission dialog is on your board')
  expect(text).toContain('p-docs is idle')
})

test('the strip counts working and waiting sessions', async () => {
  expect(counts([worker('a', 'busy'), worker('b', 'idle'), worker('c', 'busy')])).toBe('3 sessions · 2 working · 1 waiting')
  expect(counts([])).toBe('')
})

test('the automated tape carries its label and the project chip between slanted stripes', async () => {
  const { left, label, right } = hazard('AUTOMATED · api', { text: 'billing', color: '#5ccfe6' })
  expect(label.map(run => run.text).join('')).toBe(' AUTOMATED · api  billing  ')
  expect(label.some(run => run.backgroundColor === '#5ccfe6' && run.text.includes('billing'))).toBe(true)
  expect(left.at(-1)?.text.endsWith(SLANT)).toBe(true)
  expect(right[0]?.text.startsWith(SLANT)).toBe(true)
})

test('a lead with no workers yet still renders an empty count', async () => {
  const lead: Lead = { name: 'x', color: 'blue', workers: [] }
  expect(counts(lead.workers)).toBe('')
})
