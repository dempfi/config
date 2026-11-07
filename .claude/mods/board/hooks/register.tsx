import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'
import type { Board, Item } from '../types'
import { ACTIONS, EMPTY, type Outcome, answer, apply, inSection, summary, userAdd, waiting } from './model.ts'

const PANE = 'board'
const TOOL = 'mcp__board__board' as const
const OPTION_KEYS = 'abcdef'
const DONE_SHOWN = 4

const boardAtom = atom({ plugin: 'board', key: 'board' } as const, EMPTY, { shape: 'board-1' })
const expandedAtom = atom({ plugin: 'board', key: 'expanded' } as const, 0)

const DESCRIPTION = [
  'The board the user keeps beside this session: a live checklist of your work, the things you need from the user, and the settled state of the work. The user watches it, so keep it true.',
  'Actions:',
  '- plan {items}: at the start of a multi-step task, list its steps (replaces the open steps).',
  '- start {id} when you begin a step, done {id} the moment it is finished; add {text} for a step you discover.',
  '- ask {text, detail?, options?}: when you need a decision, approval or fact from the user and other work can go on meanwhile, ask here and keep working instead of stopping. detail is markdown: the evidence and what each option costs. The answer arrives later as a message from the board.',
  '- note {text}: record a settled outcome (a decision made, something shipped or verified, with its link or path).',
  '- remove {id}, clear_done: tidy the board.',
  'Every call returns the whole board.',
].join('\n')

const SCHEMA = {
  type: 'object',
  properties: {
    action: { type: 'string', enum: [...ACTIONS] },
    items: { type: 'array', items: { type: 'string' }, description: 'plan: the steps, in order' },
    text: { type: 'string' },
    detail: { type: 'string', description: 'ask: markdown context the user reads before answering' },
    options: { type: 'array', items: { type: 'string' }, description: 'ask: up to 6 answers the user can pick' },
    id: { type: 'number' },
  },
  required: ['action'],
}

async function storeKey($: EngineInterface) {
  return `board:${String(await $.session.id())}`
}

async function showStatus($: EngineInterface, board: Board) {
  const count = waiting(board).length
  $.ui.status(count > 0 ? `${count} waiting on you` : undefined)
}

async function openPane($: EngineInterface) {
  return $.ui.open({ id: PANE, title: 'Board', backgroundColor: 'transparent' })
}

async function change($: EngineInterface, step: (board: Board) => Outcome) {
  let outcome = { error: 'no change' } as Outcome
  const board = await update($, boardAtom, current => {
    outcome = step(current ?? EMPTY)
    return 'board' in outcome ? outcome.board : (current ?? EMPTY)
  })
  if ('board' in outcome) {
    await $.store.set(await storeKey($), board)
    await showStatus($, board)
    await openPane($)
  }
  return outcome
}

async function settle($: EngineInterface, id: number, reply: string) {
  const outcome = await change($, board => answer(board, id, reply))
  if ('error' in outcome) {
    $.ui.toast(outcome.error)
    return
  }
  await update($, expandedAtom, () => 0)
  await $.prompt.submit({ text: outcome.said })
}

async function toggle($: EngineInterface, id: number) {
  await update($, expandedAtom, current => (current === id ? 0 : id))
}

async function restore($: EngineInterface) {
  const current = await read($, boardAtom)
  if (current && current.items.length > 0) return current
  const saved = (await $.store.get(await storeKey($))) as Board | undefined
  if (!saved || !Array.isArray(saved.items) || saved.items.length === 0) return current ?? EMPTY
  return update($, boardAtom, () => saved)
}

function runCommand(board: Board, args: string): Outcome | null {
  const [verb = '', ...rest] = args.trim().split(/\s+/)
  const text = rest.join(' ')
  if (verb === '' || verb === 'open') return null
  if (verb === 'add') return userAdd(board, 'you', text)
  if (verb === 'note') return userAdd(board, 'state', text)
  if (verb === 'clear') return apply(board, { action: 'clear_done' })
  if (verb === 'done' || verb === 'rm') {
    const id = Number(text.replace(/^#/, ''))
    if (!Number.isInteger(id)) return { error: `usage: /board ${verb} <number>` }
    return verb === 'rm' ? apply(board, { action: 'remove', id }) : apply(board, { action: 'done', id })
  }
  return { error: 'usage: /board [open | add <text> | note <text> | done <n> | rm <n> | clear]' }
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.tool.register({ name: 'board', description: DESCRIPTION, inputSchema: SCHEMA, isDeferred: false })
    await $.command.register({
      name: 'board',
      description: 'Open the board, or add, note, tick off or remove an item',
      argumentHint: '[add <text> | note <text> | done <n> | rm <n> | clear]',
    })
    const board = await restore($)
    await showStatus($, board)
    if (board.items.length > 0) void openPane($)
    return next(e)
  })

  on('tool.call', { tool: TOOL }, async ($, e) => {
    if (!('action' in e) || !(ACTIONS as readonly string[]).includes(e.action))
      return { deny: `action must be one of ${ACTIONS.join(', ')}` }
    const outcome = await change($, board => apply(board, e))
    if ('error' in outcome) return { deny: outcome.error }
    return { result: `${outcome.said}\n\n${summary(outcome.board)}` }
  }).catch(() => ({ deny: 'the board failed' }))

  on('tool.check', { tool: TOOL }, async () => ({ decision: 'allow', reason: 'The board only records the plan.' })).catch(
    ($, e, next) => next(e),
  )

  on('command.run', { command: 'board' }, async ($, e) => {
    const board = (await read($, boardAtom)) ?? EMPTY
    const step = runCommand(board, e.args)
    if (step === null) {
      await openPane($)
      return { text: summary(board) }
    }
    if ('error' in step) return { text: step.error }
    const outcome = await change($, current => runCommand(current, e.args) ?? { error: 'no change' })
    return 'error' in outcome ? { text: outcome.error } : { text: outcome.said, context: [summary(outcome.board)] }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button, Markdown, Input } = $.ui.resolve(e)
    const board = (await read($, boardAtom)) ?? EMPTY
    const expanded = (await read($, expandedAtom)) ?? 0

    const claude = inSection(board, 'claude')
    const finished = claude.filter(item => item.status === 'done')
    const open = claude.filter(item => item.status !== 'done')
    const asks = inSection(board, 'you')
    const openAsks = asks.filter(item => item.status !== 'done')
    const settledAsks = asks.filter(item => item.status === 'done')
    const state = inSection(board, 'state')

    const step = (item: Item) =>
      item.status === 'done' ? (
        <Text key={`s${item.id}`} dimColor strikethrough>
          {'✓ '}
          {item.text}
        </Text>
      ) : item.status === 'active' ? (
        <Text key={`s${item.id}`} color="claude" bold>
          {'▶ '}
          {item.text}
        </Text>
      ) : (
        <Text key={`s${item.id}`}>
          {'○ '}
          {item.text}
        </Text>
      )

    const ask = (item: Item, index: number) => {
      const isOpen = expanded === item.id
      const hotkey = index < 9 ? String(index + 1) : undefined
      return (
        <Box key={`a${item.id}`} flexDirection="column">
          <Button key={`ask-${item.id}`} plain hotkey={hotkey} onPress={() => toggle($, item.id)}>
            <Text color="warning">{isOpen ? '▾ ' : '▸ '}</Text>
            {item.text}
            {item.by === 'user' ? <Text dimColor> · yours</Text> : ''}
          </Button>
          {isOpen && (
            <Box flexDirection="column" paddingLeft={2} marginBottom={1}>
              {item.detail ? <Markdown key={`d${item.id}`} text={item.detail} /> : <Text dimColor>No detail.</Text>}
              {(item.options ?? []).map((option, n) => (
                <Button
                  key={`opt-${item.id}-${n}`}
                  plain
                  hotkey={OPTION_KEYS[n]}
                  onPress={() => settle($, item.id, option)}
                >
                  {option}
                </Button>
              ))}
              <Input
                key={`answer-${item.id}`}
                label="Answer"
                placeholder={item.options?.length ? 'or type your own' : 'type an answer'}
                submitLabel="send"
                onSubmit={value => settle($, item.id, value)}
              />
              <Button key={`done-${item.id}`} plain hotkey="x" onPress={() => settle($, item.id, '')}>
                Done, no answer needed
              </Button>
            </Box>
          )}
        </Box>
      )
    }

    return (
      <Box flexDirection="column" gap={1}>
        <Box flexDirection="column">
          <Text bold>
            Claude <Text dimColor>{claude.length ? `${finished.length}/${claude.length}` : ''}</Text>
          </Text>
          {claude.length === 0 && <Text dimColor>No plan yet.</Text>}
          {finished.length > DONE_SHOWN && <Text dimColor>{`✓ ${finished.length - DONE_SHOWN} earlier steps`}</Text>}
          {finished.slice(-DONE_SHOWN).map(step)}
          {open.map(step)}
        </Box>
        <Box flexDirection="column">
          <Text bold color={openAsks.length ? 'warning' : undefined}>
            Waiting on you <Text dimColor>{openAsks.length ? String(openAsks.length) : ''}</Text>
          </Text>
          {openAsks.length === 0 && <Text dimColor>Nothing.</Text>}
          {openAsks.map(ask)}
          {settledAsks.slice(-DONE_SHOWN).map(item => (
            <Text key={`r${item.id}`} dimColor>
              {'✓ '}
              {item.text}
              {item.answer ? ` → ${item.answer}` : ''}
            </Text>
          ))}
        </Box>
        {state.length > 0 && (
          <Box flexDirection="column">
            <Text bold>State</Text>
            {state.map(item => (
              <Text key={`n${item.id}`}>
                {'• '}
                {item.text}
              </Text>
            ))}
          </Box>
        )}
      </Box>
    )
  })
}
