import type { Automated, Lead, ProjectColor, Worker } from '../types'

export const COLORS: Record<ProjectColor, string> = {
  blue: '#5ccfe6',
  green: '#87d96c',
  purple: '#d4bfff',
  orange: '#ffad66',
  yellow: '#ffd173',
  brown: '#c8a07a',
  red: '#ff6666',
}

export const COLOR_NAMES = Object.keys(COLORS) as ProjectColor[]

export function isColor(value: unknown): value is ProjectColor {
  return typeof value === 'string' && value in COLORS
}

export function slug(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
}

export function pickColor(name: string): ProjectColor {
  let hash = 0
  for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) >>> 0
  return COLOR_NAMES[hash % COLOR_NAMES.length] ?? 'blue'
}

const SAFE = /^[A-Za-z0-9_./:@-]+$/

export function shellWord(value: string) {
  if (!SAFE.test(value)) throw new Error(`refusing to put "${value}" on a command line`)
  return value
}

export function spawnCommand(input: {
  sessionId: string
  sessionName: string
  briefPath: string
  taskPath: string
  model?: string
  automated: Automated
}) {
  const env = [
    `CLAUDE_PROJECT=${shellWord(input.automated.project)}`,
    `CLAUDE_PROJECT_ROLE=${shellWord(input.automated.role)}`,
    `CLAUDE_PROJECT_COLOR=${shellWord(input.automated.color)}`,
    `CLAUDE_PROJECT_LEAD=${shellWord(input.automated.lead)}`,
  ]
  const flags = [
    '--session-id',
    shellWord(input.sessionId),
    '-n',
    shellWord(input.sessionName),
    '--append-system-prompt-file',
    shellWord(input.briefPath),
    ...(input.model ? ['--model', shellWord(input.model)] : []),
  ]
  const prompt = `'Your task is in ${shellWord(input.taskPath)} - read it and start.'`
  return ['env', ...env, 'claude', ...flags, prompt].join(' ')
}

export function leadContext(name: string) {
  return [
    `This session is now the lead of project "${name}". You act for the user and run the project with real Claude sessions as your workers, not subagents.`,
    '',
    'First, interview the user. Work out with them the exact problem: what outcome they want, how they will judge it done, what is out of scope, and the constraints. Ask one or two questions at a time and build on their answers; propose your reading of the problem and let them correct it. Do not spawn anything until they agree.',
    '',
    'When the problem is agreed, call the project tool with action "define": a one-line summary for the strip and a color. Split the work into tasks that can run in parallel and spawn one worker per task (role, a self-contained brief, cwd, optionally a model). A worker that changes code in a git repository gets worktree: true, so workers never share a checkout. Put each worker on your board as a step and tick it off when it reports done.',
    '',
    `Talk to workers with SendMessage, addressed to the worker's session name (shown by spawn and the workers action): it is how you answer a question, give the next instruction or ask for status. Type into a worker's pane only for what a message cannot reach: a dialog or a menu on its screen.`,
    '',
    'You are woken when a worker stops. Its message usually says why. When it does not, read its screen with ghostty read using since: true, which returns only what changed. To wait for a worker or a server without polling, use ghostty wait.',
    '',
    'Answer for the user only within their stated intent. Permission prompts, spending, pushes and deploys, migrations, deletes and product or values calls are the user\'s. A permission dialog in a worker is put on your board for the user automatically; when their answer arrives, press its number in that worker with ghostty key and userApproved: true. Anything else that is theirs, ask with the board ask action and carry the answer back.',
    '',
    'When a worker in a worktree is done, the finish action shows its commits; merging them is a step you take with the user\'s go-ahead. The spend action shows the tokens each worker has used.',
  ].join('\n')
}

export function workerBrief(input: { project: string; summary: string; role: string; lead: string; branch?: string }) {
  return [
    `You are an automated worker in project "${input.project}", role "${input.role}".`,
    `The project: ${input.summary}`,
    `Your lead is the Claude session named "${input.lead}". It speaks for the user and answers you by message.`,
    ...(input.branch
      ? [
          `You work in your own git worktree on branch "${input.branch}". Install its dependencies before running checks there, commit your work on this branch, and never switch branches or push.`,
        ]
      : []),
    '',
    'Work your task end to end. Keep your board current: plan your steps, tick them off.',
    `When you finish, or when you are blocked on something only the user or the lead can decide, send the lead a message with SendMessage to "${input.lead}": what you did, what you need, with paths and evidence. Then stop and wait for its reply.`,
  ].join('\n')
}

export function needsAttention(before: Worker[], after: Worker[]) {
  return after.filter(worker => {
    const previous = before.find(one => one.sessionId === worker.sessionId)?.status
    return previous === 'busy' && worker.status !== undefined && worker.status !== 'busy'
  })
}

export function digest(lead: Lead, stopped: Worker[], asked: string[]) {
  const lines = stopped.map(worker => {
    const isAsked = asked.includes(worker.role)
    return `- ${worker.name} is ${worker.status}${isAsked ? '; its permission dialog is on your board for the user' : ''}`
  })
  return [`Project "${lead.name}":`, ...lines].join('\n')
}

const DIALOG_LINES = 12
const MAX_OPTIONS = 4

export function dialogExcerpt(screen: string) {
  const rows = screen.split('\n')
  const at = rows.findIndex(row => /Do you want to /.test(row))
  if (at < 0) return null
  const start = Math.max(0, at - DIALOG_LINES)
  const options = rows.slice(at + 1, at + 1 + MAX_OPTIONS).filter(row => /^\s*(?:❯\s*)?\d\.\s/.test(row))
  return {
    detail: '```\n' + rows.slice(start, at + 1 + MAX_OPTIONS).join('\n').trim() + '\n```',
    options: options.map(row => row.replace(/^\s*(?:❯\s*)?/, '').trim()),
  }
}

export function counts(workers: Worker[]) {
  const busy = workers.filter(worker => worker.status === 'busy').length
  const waiting = workers.length - busy
  if (workers.length === 0) return ''
  return `${workers.length} ${workers.length === 1 ? 'session' : 'sessions'} · ${busy} working · ${waiting} waiting`
}
