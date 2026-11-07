import type { Board, BoardAction, BoardRequest, Item, Section } from '../types'

export const EMPTY: Board = { nextId: 1, items: [] }

export const MAX_OPTIONS = 6

export const ACTIONS = [
  'plan',
  'add',
  'start',
  'done',
  'ask',
  'note',
  'remove',
  'clear_done',
] as const satisfies readonly BoardAction[]

export type Request = BoardRequest

export type Outcome = { board: Board; said: string } | { error: string }

function fresh(board: Board, fields: Omit<Item, 'id'>): Board {
  return { nextId: board.nextId + 1, items: [...board.items, { ...fields, id: board.nextId }] }
}

function find(board: Board, id: number | undefined) {
  return board.items.find(item => item.id === id)
}

function replace(board: Board, id: number, change: (item: Item) => Item): Board {
  return { ...board, items: board.items.map(item => (item.id === id ? change(item) : item)) }
}

function needText(request: Request) {
  const text = request.text?.trim()
  return text ? text : null
}

export function apply(board: Board, request: Request): Outcome {
  switch (request.action) {
    case 'plan': {
      const steps = (request.items ?? []).map(step => step.trim()).filter(Boolean)
      if (steps.length === 0) return { error: 'plan needs items' }
      let next: Board = {
        ...board,
        items: board.items.filter(item => item.section !== 'claude' || item.status === 'done'),
      }
      for (const step of steps) next = fresh(next, { section: 'claude', text: step, status: 'open', by: 'claude' })
      return { board: next, said: `Planned ${steps.length} steps.` }
    }
    case 'add': {
      const text = needText(request)
      if (!text) return { error: 'add needs text' }
      return { board: fresh(board, { section: 'claude', text, status: 'open', by: 'claude' }), said: `Added #${board.nextId}.` }
    }
    case 'ask': {
      const text = needText(request)
      if (!text) return { error: 'ask needs text' }
      const options = (request.options ?? []).map(option => option.trim()).filter(Boolean).slice(0, MAX_OPTIONS)
      return {
        board: fresh(board, {
          section: 'you',
          text,
          status: 'open',
          by: 'claude',
          ...(request.detail?.trim() ? { detail: request.detail.trim() } : {}),
          ...(options.length > 0 ? { options } : {}),
        }),
        said: `Asked #${board.nextId}; the answer arrives as a message from the board.`,
      }
    }
    case 'note': {
      const text = needText(request)
      if (!text) return { error: 'note needs text' }
      return { board: fresh(board, { section: 'state', text, status: 'done', by: 'claude' }), said: `Noted #${board.nextId}.` }
    }
    case 'start': {
      const item = find(board, request.id)
      if (!item || item.section !== 'claude') return { error: `no step #${request.id}` }
      const next: Board = {
        ...board,
        items: board.items.map(one =>
          one.section === 'claude' && one.status === 'active' ? { ...one, status: 'open' } : one,
        ),
      }
      return { board: replace(next, item.id, one => ({ ...one, status: 'active' })), said: `Started #${item.id}.` }
    }
    case 'done': {
      const item = find(board, request.id)
      if (!item) return { error: `no item #${request.id}` }
      return { board: replace(board, item.id, one => ({ ...one, status: 'done' })), said: `Done #${item.id}.` }
    }
    case 'remove': {
      const item = find(board, request.id)
      if (!item) return { error: `no item #${request.id}` }
      return { board: { ...board, items: board.items.filter(one => one.id !== item.id) }, said: `Removed #${item.id}.` }
    }
    case 'clear_done': {
      const kept = board.items.filter(item => item.section === 'state' || item.status !== 'done')
      return { board: { ...board, items: kept }, said: `Cleared ${board.items.length - kept.length} finished items.` }
    }
  }
}

export function answer(board: Board, id: number, reply: string): Outcome {
  const item = find(board, id)
  if (!item || item.section !== 'you') return { error: `no item #${id} waits on the user` }
  if (item.status === 'done') return { error: `#${id} is already settled` }
  const text = reply.trim()
  const said = text
    ? `The user answered board item #${id} ("${item.text}"): ${text}`
    : `The user marked board item #${id} done: ${item.text}`
  return {
    board: replace(board, id, one => ({ ...one, status: 'done', ...(text ? { answer: text } : {}) })),
    said,
  }
}

export function userAdd(board: Board, section: Section, text: string): Outcome {
  const clean = text.trim()
  if (!clean) return { error: 'nothing to add' }
  const status = section === 'state' ? 'done' : 'open'
  return { board: fresh(board, { section, text: clean, status, by: 'user' }), said: `Added #${board.nextId}.` }
}

export function inSection(board: Board, section: Section) {
  return board.items.filter(item => item.section === section)
}

export function waiting(board: Board) {
  return inSection(board, 'you').filter(item => item.status !== 'done')
}

function line(item: Item) {
  const mark = item.status === 'done' ? 'x' : item.status === 'active' ? '>' : ' '
  const answered = item.answer ? ` -> ${item.answer}` : ''
  const mine = item.by === 'user' ? ' (user)' : ''
  return `  [${mark}] #${item.id} ${item.text}${answered}${mine}`
}

export function summary(board: Board) {
  const parts: string[] = []
  const claude = inSection(board, 'claude')
  const you = inSection(board, 'you')
  const state = inSection(board, 'state')
  if (claude.length) parts.push('Claude:', ...claude.map(line))
  if (you.length) parts.push('Waiting on the user:', ...you.map(line))
  if (state.length) parts.push('State:', ...state.map(item => `  - #${item.id} ${item.text}`))
  return parts.length ? parts.join('\n') : 'The board is empty.'
}
