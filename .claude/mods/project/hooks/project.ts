import type { Automated, Lead, Phase, ProjectColor, Worker, WorkerKind } from '../types'

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
  settingsPath: string
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
    '--settings',
    shellWord(input.settingsPath),
    ...(input.model ? ['--model', shellWord(input.model)] : []),
  ]
  const prompt = `'Your task is in ${shellWord(input.taskPath)} - read it and start.'`
  return ['env', ...env, 'claude', ...flags, prompt].join(' ')
}

export const WORKER_SETTINGS = { preferredNotifChannel: 'notifications_disabled' }

export const PHASES = ['frame', 'research', 'design', 'build', 'qa', 'ship'] as const satisfies readonly Phase[]

export const KINDS = ['research', 'user-research', 'design', 'build', 'qa'] as const satisfies readonly WorkerKind[]

export const PHASE_KINDS: Record<Phase, readonly WorkerKind[]> = {
  frame: [],
  research: ['research', 'user-research'],
  design: ['design', 'research'],
  build: ['build'],
  qa: ['qa', 'build'],
  ship: [],
}

export const MAX_ACTIVE = 2

export function phaseOf(lead: Lead): Phase {
  return lead.phase ?? 'frame'
}

export function nextPhase(phase: Phase): Phase | null {
  const at = PHASES.indexOf(phase)
  return PHASES[at + 1] ?? null
}

export function active(workers: Worker[]) {
  return workers.filter(worker => worker.status === 'busy' || worker.status === 'starting')
}

export function spawnRefusal(lead: Lead, kind: WorkerKind, question: string | undefined) {
  const phase = phaseOf(lead)
  if (!lead.summary) return 'frame the problem with the user and define it first'
  if (!PHASE_KINDS[phase].includes(kind)) {
    const allowed = PHASE_KINDS[phase]
    return allowed.length
      ? `the ${phase} phase takes ${allowed.join(' or ')} workers, not ${kind}`
      : `the ${phase} phase is yours alone; advance when its decision is made`
  }
  if (!question?.trim()) return 'name the question or decision this worker answers'
  if (active(lead.workers).length >= MAX_ACTIVE)
    return `${MAX_ACTIVE} workers are already running; read their reports and decide before starting more`
  return null
}

export function leadContext(name: string) {
  return [
    `This session now leads project "${name}". You are its product and engineering manager: you own the problem, the decisions and the conversation with the user. Real Claude sessions are your specialists; they do the individual jobs and report to you. The user wants this done well, not fast.`,
    '',
    'The project moves through phases, in order, and the project tool holds you to them: frame, research, design, build, qa, ship.',
    '- frame: yours alone. Interview the user until you both can state the problem: the outcome they want, how they will judge it done, what is out of scope, the constraints. One or two questions at a time; propose your reading and let them correct it. Then define the project.',
    '- research: send a researcher to study the code, the data or the market, and a user researcher to study what users actually need (analytics, transcripts, feedback, the docs). Their reports, not your guesses, ground the design.',
    '- design: a designer turns the research into a design with real alternatives and a recommendation. Review it, take the open calls to the user, and settle the design with them. Do not leave design without their go-ahead.',
    '- build: engineers implement the agreed design, test first, each in its own worktree.',
    '- qa: a tester who did not build it checks the result against the design and the user\'s definition of done, and reports defects; engineers fix them.',
    '- ship: you summarize what was built and verified, and the user decides what to merge and ship.',
    '',
    `Spawn few workers: one per open question, at most ${MAX_ACTIVE} running at once, each naming the question or decision its report feeds. A worker writes its report to the file its brief names and messages you a summary. Read the report, decide what it means for the project, record the decision with the advance action when the phase is done, and only then start the next phase\'s work. When a report raises something that is the user\'s call, bring it to them instead of deciding.`,
    '',
    'Talk to workers with SendMessage to their session name. Type into a worker\'s pane only for a dialog or a menu. You are woken when a worker stops; read its screen with ghostty read since: true only when its message is not enough, and use ghostty wait instead of polling.',
    '',
    'Permission prompts, spending, pushes and deploys, migrations, deletes and product or values calls are the user\'s. A worker\'s permission dialog reaches your board by itself; when the user answers, press that number in the worker with ghostty key and userApproved: true. Ask anything else that is theirs with the board ask action.',
  ].join('\n')
}

const KIND_BRIEFS: Record<WorkerKind, string> = {
  research:
    'You research: study the code, data, documents or market the question needs, and report what is true with evidence. Change nothing.',
  'user-research':
    'You do user research: find what users actually need and do, from whatever evidence exists (analytics, transcripts, feedback, support threads, the docs), and report it with examples. Change nothing.',
  design:
    'You design: from the research and the problem, write a design with at least two real alternatives, what each costs and risks, and your recommendation. Change no code.',
  build:
    'You build: implement the agreed design, tests first, and commit on your branch. Stop and ask the lead when the design does not cover what you meet.',
  qa: 'You do QA: verify the build independently against the design and the definition of done, on real inputs, and report every defect with how to reproduce it. Do not fix anything.',
}

export function workerBrief(input: {
  project: string
  summary: string
  role: string
  kind: WorkerKind
  question: string
  report: string
  lead: string
  branch?: string
}) {
  return [
    `You are the ${input.kind} specialist "${input.role}" in project "${input.project}".`,
    `The project: ${input.summary}`,
    `The question your work answers: ${input.question}`,
    KIND_BRIEFS[input.kind],
    `Your lead is the Claude session named "${input.lead}": it manages the project, speaks for the user and answers you by message.`,
    ...(input.branch
      ? [
          `You work in your own git worktree on branch "${input.branch}". Install its dependencies before running checks there, commit on this branch, and never switch branches or push.`,
        ]
      : []),
    '',
    'Work carefully; depth matters more than speed. Keep your board current.',
    `When you are done, write your report to ${input.report}: what you found or did, the evidence, what remains open. Then send the lead a short summary with SendMessage to "${input.lead}" and wait. When you are blocked on something only the lead or the user can decide, message the lead the same way.`,
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
