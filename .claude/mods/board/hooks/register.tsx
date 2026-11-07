import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'
import type { Board, ChartRequest, ChartSpec, Item } from '../types'
import { CHART_KINDS, type Row, describe as describeChart, render as renderChart, validate as validateChart } from './chart.ts'
import { ACTIONS, EMPTY, type Outcome, answer, apply, inSection, summary, userAdd, waiting } from './model.ts'

const PANE = 'board'
const TOOL = 'mcp__board__board' as const
const CHART_TOOL = 'mcp__board__chart' as const
const OPTION_KEYS = 'abcdef'
const DONE_SHOWN = 4
const PINNED_CHARTS = 4

const boardAtom = atom({ plugin: 'board', key: 'board' } as const, EMPTY, { shape: 'board-1' })
const expandedAtom = atom({ plugin: 'board', key: 'expanded' } as const, 0)
const chartsAtom = atom({ plugin: 'board', key: 'charts' } as const, [], { shape: 'charts-1' })

const CHART_DESCRIPTION = [
  'Draws a chart inline in the transcript, where the user sees it under this call. Use it whenever numbers are easier seen than read: trends over time, comparisons, distributions, progress.',
  '- kind: line (trends), scatter (x/y points), bar (compare a few values, grouped when there are several series), hbar (ranked labelled values), sparkline (one compact row per series).',
  '- series: [{ name?, values: number[] }] or [{ name?, points: [[x, y], ...] }]; labels name the x positions (or the bars).',
  '- pin: true also keeps the chart on the board; pinning again under the same title replaces it, so a chart can track live progress. unpin: true with the title removes it.',
  'The result tells you the range of what was drawn; you do not see the picture.',
].join('\n')

const CHART_SCHEMA = {
  type: 'object',
  properties: {
    kind: { type: 'string', enum: [...CHART_KINDS] },
    title: { type: 'string' },
    unit: { type: 'string' },
    series: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          values: { type: 'array', items: { type: 'number' } },
          points: { type: 'array', items: { type: 'array', items: { type: 'number' }, minItems: 2, maxItems: 2 } },
        },
      },
    },
    labels: { type: 'array', items: { type: 'string' } },
    height: { type: 'number', description: 'Rows the plot takes, 3 to 30; 10 when absent' },
    pin: { type: 'boolean' },
    unpin: { type: 'boolean' },
  },
  required: ['kind', 'series'],
}

function specOf(request: ChartRequest): ChartSpec {
  return {
    kind: request.kind,
    series: request.series,
    ...(request.title ? { title: request.title } : {}),
    ...(request.labels ? { labels: request.labels } : {}),
    ...(request.unit ? { unit: request.unit } : {}),
    ...(request.height ? { height: request.height } : {}),
  }
}

async function chartsKey($: EngineInterface) {
  return `charts:${String(await $.session.id())}`
}

async function pinChart($: EngineInterface, spec: ChartSpec, isUnpin: boolean) {
  const charts = await update($, chartsAtom, current => {
    const rest = (current ?? []).filter(one => (one.title ?? '') !== (spec.title ?? ''))
    return isUnpin ? rest : [...rest, spec].slice(-PINNED_CHARTS)
  })
  await $.store.set(await chartsKey($), charts)
  if (!isUnpin) await openPane($)
}

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
    await $.tool.register({ name: 'chart', description: CHART_DESCRIPTION, inputSchema: CHART_SCHEMA, isDeferred: false })
    const savedCharts = (await $.store.get(await chartsKey($))) as ChartSpec[] | undefined
    if (Array.isArray(savedCharts) && savedCharts.length > 0) await update($, chartsAtom, () => savedCharts)
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

  on('tool.call', { tool: CHART_TOOL }, async ($, e) => {
    if (!('kind' in e)) return { deny: 'a chart needs a kind and series' }
    const spec = specOf(e)
    if (e.unpin === true) {
      await pinChart($, spec, true)
      return { result: `Unpinned "${spec.title ?? ''}" from the board.` }
    }
    const problem = validateChart(spec)
    if (problem) return { deny: problem }
    if (e.pin === true) await pinChart($, spec, false)
    return { result: describeChart(spec) + (e.pin === true ? ' Pinned to the board.' : '') }
  }).catch(() => ({ deny: 'the chart failed' }))

  on('tool.check', { tool: CHART_TOOL }, async () => ({ decision: 'allow', reason: 'A chart only draws.' })).catch(
    ($, e, next) => next(e),
  )

  on('ui.render', { component: 'ToolUse' }, async ($, e, next) => {
    if (e.props.tool !== CHART_TOOL || e.props.isRunning || e.props.isErrored) return next(e)
    const request = e.props.input as ChartRequest
    if (request.unpin === true || validateChart(specOf(request))) return next(e)
    const { Box, Text } = $.ui.resolve(e)
    const theirs = await next(e)
    const width = Math.min(120, Math.max(20, (e.viewport?.columns ?? 100) - 6))
    return (
      <Box flexDirection="column">
        {theirs}
        <Box flexDirection="column" paddingLeft={2} marginTop={1}>
          {renderChart(specOf(request), width).map((row: Row, index: number) => (
            <Text key={`r${index}`} wrap="truncate-end">
              {row.map(piece => (
                <Text color={piece.color} dimColor={piece.dim === true}>
                  {piece.text}
                </Text>
              ))}
            </Text>
          ))}
        </Box>
      </Box>
    )
  })

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
    const charts = (await read($, chartsAtom)) ?? []
    const chartWidth = Math.max(20, e.props.bodyColumns - 1)

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
        {charts.map((chart, index) => (
          <Box key={`c${index}`} flexDirection="column">
            {renderChart(chart, chartWidth).map((row: Row, line: number) => (
              <Text key={`c${index}-${line}`} wrap="truncate-end">
                {row.map(piece => (
                  <Text color={piece.color} dimColor={piece.dim === true}>
                    {piece.text}
                  </Text>
                ))}
              </Text>
            ))}
          </Box>
        ))}
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
