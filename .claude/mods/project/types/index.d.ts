export type ProjectColor = 'blue' | 'green' | 'purple' | 'orange' | 'teal' | 'pink' | 'red'

export type Worker = {
  role: string
  sessionId: string
  name: string
  cwd: string
  pane?: string
  status?: string
}

export type Lead = {
  name: string
  color: ProjectColor
  summary?: string
  workers: Worker[]
}

export type Automated = {
  project: string
  role: string
  color: ProjectColor
  lead: string
}

export type ProjectAction = 'define' | 'spawn' | 'workers' | 'close'

export type ProjectRequest = {
  action: ProjectAction
  summary?: string
  color?: ProjectColor
  role?: string
  task?: string
  cwd?: string
  model?: string
}

declare module 'claude-code' {
  interface PluginState {
    project: { lead: Shaped<Lead | null>; automated: Shaped<Automated | null> }
  }
  interface McpToolInputs {
    mcp__project__project: ProjectRequest
  }
}
