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

export type BoardAction = 'plan' | 'add' | 'start' | 'done' | 'ask' | 'note' | 'remove' | 'clear_done' | 'show'

export type BoardRequest = {
  action: BoardAction
  items?: string[]
  text?: string
  detail?: string
  options?: string[]
  id?: number
}

export type ChartKind = 'line' | 'scatter' | 'bar' | 'hbar' | 'sparkline'

export type ChartSeries = {
  name?: string
  values?: number[]
  points?: [number, number][]
}

export type ChartSpec = {
  kind: ChartKind
  title?: string
  series: ChartSeries[]
  labels?: string[]
  unit?: string
  height?: number
}

export type ChartRequest = ChartSpec & { pin?: boolean; unpin?: boolean }

declare module 'claude-code' {
  interface PluginState {
    board: { board: Shaped<Board>; expanded: number; charts: Shaped<ChartSpec[]> }
  }
  interface McpToolInputs {
    mcp__board__board: BoardRequest
    mcp__board__chart: ChartRequest
  }
}
