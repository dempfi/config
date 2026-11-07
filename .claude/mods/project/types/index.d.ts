export type ProjectColor = 'blue' | 'green' | 'purple' | 'orange' | 'yellow' | 'brown' | 'red'

export type Phase = 'frame' | 'research' | 'design' | 'build' | 'qa' | 'ship'

export type WorkerKind = 'research' | 'user-research' | 'design' | 'build' | 'qa'

export type Decision = { phase: Phase; text: string }

export type Worker = {
  role: string
  sessionId: string
  name: string
  cwd: string
  kind?: WorkerKind
  report?: string
  pane?: string
  status?: string
  blockedAt?: number
  worktree?: { repo: string; path: string; branch: string; base: string }
}

export type Lead = {
  name: string
  color: ProjectColor
  summary?: string
  phase?: Phase
  decisions?: Decision[]
  workers: Worker[]
}

export type Automated = {
  project: string
  role: string
  color: ProjectColor
  lead: string
}

export type ProjectAction = 'define' | 'spawn' | 'advance' | 'workers' | 'finish' | 'close' | 'spend'

export type ProjectRequest = {
  action: ProjectAction
  summary?: string
  color?: ProjectColor
  role?: string
  kind?: WorkerKind
  question?: string
  task?: string
  cwd?: string
  model?: string
  worktree?: boolean
  decision?: string
}

declare module 'claude-code' {
  interface PluginState {
    project: { lead: Shaped<Lead | null>; automated: Shaped<Automated | null> }
  }
  interface McpToolInputs {
    mcp__project__project: ProjectRequest
  }
}
