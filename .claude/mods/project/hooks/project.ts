import type { Automated, Lead, ProjectColor, Worker } from '../types'

export const COLORS: Record<ProjectColor, string> = {
  blue: '#5ccfe6',
  green: '#87d96c',
  purple: '#d4bfff',
  orange: '#ffad66',
  teal: '#95e6cb',
  pink: '#f28779',
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
    'When the problem is agreed, call the project tool with action "define": a one-line summary (it goes on the strip under the prompt) and a color for the project. Then split the work into tasks that can run in parallel and spawn one worker per task with action "spawn" (role, a self-contained task brief with everything the worker needs, the working directory, optionally a model). Put each worker on your board as a step and tick it off when it reports done.',
    '',
    'While they run, you are woken when a worker stops. Read its screen with the ghostty read tool, then unblock it: answer its question from what the user wants, or type the next instruction into its pane. Answer for the user only within their stated intent. Permission prompts, spending, pushes and deploys, migrations, deletes and product or values calls are the user\'s: put them on your board with the board ask action and carry the answer back to the worker once they reply.',
  ].join('\n')
}

export function workerBrief(input: { project: string; summary: string; role: string; lead: string }) {
  return [
    `You are an automated worker in project "${input.project}", role "${input.role}".`,
    `The project: ${input.summary}`,
    `Your lead is the Claude session named "${input.lead}". It speaks for the user and may type into this session to answer you.`,
    '',
    'Work your task end to end. Keep your board current: plan your steps, tick them off.',
    `When you finish, or when you are blocked on something only the user or the lead can decide, send the lead a message with SendMessage to "${input.lead}": what you did, what you need, with paths and evidence. Then stop and wait; the lead answers in this session.`,
  ].join('\n')
}

export function needsAttention(before: Worker[], after: Worker[]) {
  return after.filter(worker => {
    const previous = before.find(one => one.sessionId === worker.sessionId)?.status
    return previous === 'busy' && worker.status !== undefined && worker.status !== 'busy'
  })
}

export function digest(lead: Lead, stopped: Worker[]) {
  const lines = stopped.map(
    worker => `- ${worker.role} (session ${worker.name}, pane ${worker.pane ?? 'unknown'}) is now ${worker.status}`,
  )
  return [
    `Project "${lead.name}": ${stopped.length === 1 ? 'a worker stopped' : `${stopped.length} workers stopped`}.`,
    ...lines,
    'Read each screen with the ghostty read tool and unblock or acknowledge it; put anything that is the user\'s call on the board.',
  ].join('\n')
}

export function counts(workers: Worker[]) {
  const busy = workers.filter(worker => worker.status === 'busy').length
  const waiting = workers.length - busy
  if (workers.length === 0) return ''
  return `${workers.length} ${workers.length === 1 ? 'session' : 'sessions'} · ${busy} working · ${waiting} waiting`
}
