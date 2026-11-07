import { expect, test } from 'claude-code/testing'
import { EMPTY, answer, apply, progress, summary, userAdd, waiting } from './model.ts'
import type { Board } from '../types'

function must(outcome: ReturnType<typeof apply>): Board {
  if ('error' in outcome) throw new Error(outcome.error)
  return outcome.board
}

test('a plan lists its steps open, numbered from one', async () => {
  const board = must(apply(EMPTY, { action: 'plan', items: ['read', 'write', ' '] }))
  expect(board.items.map(item => [item.id, item.text, item.status])).toEqual([
    [1, 'read', 'open'],
    [2, 'write', 'open'],
  ])
})

test('a new plan replaces the open steps and keeps the finished ones', async () => {
  let board = must(apply(EMPTY, { action: 'plan', items: ['a', 'b'] }))
  board = must(apply(board, { action: 'done', id: 1 }))
  board = must(apply(board, { action: 'plan', items: ['c'] }))
  expect(board.items.map(item => item.text)).toEqual(['a', 'c'])
})

test('only one step is active at a time', async () => {
  let board = must(apply(EMPTY, { action: 'plan', items: ['a', 'b'] }))
  board = must(apply(board, { action: 'start', id: 1 }))
  board = must(apply(board, { action: 'start', id: 2 }))
  expect(board.items.map(item => item.status)).toEqual(['open', 'active'])
})

test('an ask waits on the user until it is answered, and the answer names the question', async () => {
  let board = must(apply(EMPTY, { action: 'ask', text: 'Batch answers?', options: ['now', 'batch'] }))
  expect(waiting(board).length).toBe(1)
  const answered = answer(board, 1, 'now')
  if ('error' in answered) throw new Error(answered.error)
  board = answered.board
  expect(waiting(board).length).toBe(0)
  expect(board.items[0]?.answer).toBe('now')
  expect(answered.said).toContain('Batch answers?')
  expect(answered.said).toContain('now')
})

test('an ask settled with no words reads as marked done', async () => {
  const board = must(apply(EMPTY, { action: 'ask', text: 'Approve the push' }))
  const settled = answer(board, 1, '  ')
  if ('error' in settled) throw new Error(settled.error)
  expect(settled.said).toContain('marked board item #1 done')
  expect(settled.board.items[0]?.answer).toBe(undefined)
})

test('an ask cannot be answered twice, and a step is not something to answer', async () => {
  let board = must(apply(EMPTY, { action: 'ask', text: 'q' }))
  board = must(apply(board, { action: 'add', text: 'step' }))
  const first = answer(board, 1, 'yes')
  if ('error' in first) throw new Error(first.error)
  expect('error' in answer(first.board, 1, 'again')).toBe(true)
  expect('error' in answer(board, 2, 'yes')).toBe(true)
})

test('options are held to six', async () => {
  const board = must(apply(EMPTY, { action: 'ask', text: 'q', options: ['1', '2', '3', '4', '5', '6', '7'] }))
  expect(board.items[0]?.options?.length).toBe(6)
})

test('clearing finished items keeps the state record', async () => {
  let board = must(apply(EMPTY, { action: 'plan', items: ['a'] }))
  board = must(apply(board, { action: 'done', id: 1 }))
  board = must(apply(board, { action: 'note', text: 'shipped' }))
  board = must(apply(board, { action: 'clear_done' }))
  expect(board.items.map(item => item.text)).toEqual(['shipped'])
})

test('an item the user adds is marked as theirs in the summary', async () => {
  const board = must(userAdd(EMPTY, 'you', 'call the bank'))
  expect(summary(board)).toContain('#1 call the bank (user)')
})

test('a board call answers in one line: what changed and where the work stands', async () => {
  let board = must(apply(EMPTY, { action: 'plan', items: ['a', 'b', 'c'] }))
  board = must(apply(board, { action: 'done', id: 1 }))
  board = must(apply(board, { action: 'ask', text: 'push?' }))
  expect(progress(board)).toBe('1/3 done · 1 waiting on the user')
  expect(progress(EMPTY)).toBe('0/0 done')
})

test('a missing id or text is an error, not a change', async () => {
  expect('error' in apply(EMPTY, { action: 'done', id: 9 })).toBe(true)
  expect('error' in apply(EMPTY, { action: 'add', text: '  ' })).toBe(true)
  expect('error' in apply(EMPTY, { action: 'plan', items: [] })).toBe(true)
})
