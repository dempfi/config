export type Section = 'claude' | 'you' | 'state'

export type Status = 'open' | 'active' | 'done'

export type Author = 'claude' | 'user'

export type Item = {
  id: number
  section: Section
  text: string
  status: Status
  by: Author
  detail?: string
  options?: string[]
  answer?: string
}

export type Board = { nextId: number; items: Item[] }

export type BoardAction = 'plan' | 'add' | 'start' | 'done' | 'ask' | 'note' | 'remove' | 'clear_done'

export type BoardRequest = {
  action: BoardAction
  items?: string[]
  text?: string
  detail?: string
  options?: string[]
  id?: number
}

declare module 'claude-code' {
  interface PluginState {
    board: { board: Shaped<Board>; expanded: number }
  }
  interface McpToolInputs {
    mcp__board__board: BoardRequest
  }
}
