import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'
import type { Board, ChartRequest, ChartSpec, Item } from '../types'
import {
  CHART_KINDS,
  type Row,
  describe as describeChart,
  legend,
  render as renderChart,
  titleRows,
  validate as validateChart,
} from './chart.ts'
import { type Scene, isPainted, scene } from './scene.ts'
import { ACTIONS, EMPTY, type Outcome, answer, apply, inSection, progress, summary, userAdd, waiting } from './model.ts'

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
  'Draws a chart the user sees under this call; use it when numbers read better as a picture.',
  'kind: line, scatter (points [[x,y]]), bar, hbar (ranked, labelled), sparkline. series: [{name?, values}] or [{name?, points}].',
  'labels: one per value, or just a few (e.g. first and last date), spread evenly. height: rows, 10 by default.',
  'pin keeps it on the board, replacing one of the same title; unpin with the title removes it.',
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
          points: { type: 'array', items: { type: 'array', items: { type: 'number' } } },
        },
      },
    },
    labels: { type: 'array', items: { type: 'string' } },
    height: { type: 'number' },
    pin: { type: 'boolean' },
    unpin: { type: 'boolean' },
  },
  required: ['kind', 'series'],
}

const BRIEF_TEXT = 60

function clip(text: string) {
  return text.length > BRIEF_TEXT ? `${text.slice(0, BRIEF_TEXT - 1)}…` : text
}

export function briefInput(tool: string, input: unknown) {
  const given = (input ?? {}) as Record<string, unknown>
  if (tool === CHART_TOOL)
    return {
      kind: given.kind,
      ...(typeof given.title === 'string' ? { title: clip(given.title) } : {}),
      ...(given.pin === true ? { pin: true } : {}),
    }
  return {
    action: given.action,
    ...(typeof given.id === 'number' ? { id: given.id } : {}),
    ...(typeof given.text === 'string' ? { text: clip(given.text) } : {}),
    ...(Array.isArray(given.items) ? { items: `${given.items.length} steps` } : {}),
  }
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

const CHART_DIR = '/tmp/claude-charts'
const LABEL_SCALE = 0.8
const PIXEL_SCALE = 2

type Font = { family: string; size: number; heightAdjust: number; labelScale: number }
type Painted = { file: string; columns: number; rows: number }

const PAINT_TICK_MS = 200

let terminalFont: Font | undefined
let isDraining = false
const ready = new Map<string, Painted>()
const pending = new Set<string>()
const queue: { drawn: Scene; font: Font; key: string }[] = []

function hash(text: string) {
  let h = 5381
  for (let i = 0; i < text.length; i++) h = ((h * 33) ^ text.charCodeAt(i)) >>> 0
  return h.toString(36)
}

export function parseFont(config: string): Font {
  const family = /^font-family = (.+)$/m.exec(config)?.[1]?.trim()
  const size = Number(/^font-size = ([\d.]+)/m.exec(config)?.[1])
  const adjust = /^adjust-cell-height = ([\d.]+)%/m.exec(config)?.[1]
  return {
    family: family || 'Menlo',
    size: size > 0 ? size : 13,
    heightAdjust: adjust ? Number(adjust) / 100 : 0,
    labelScale: LABEL_SCALE,
  }
}

async function fontOf($: EngineInterface) {
  if (!terminalFont) {
    const shown = await $.process.run(['ghostty', '+show-config']).catch(() => null)
    terminalFont = parseFont(shown?.stdout ?? '')
  }
  return terminalFont
}

async function paintFile($: EngineInterface, drawn: Scene, font: Font, file: string) {
  const isThere = await $.fs
    .stat(file)
    .then(stat => stat.kind === 'file')
    .catch(() => false)
  if (isThere) return true
  await $.process.run(['mkdir', '-p', CHART_DIR])
  const job = file.replace(/\.png$/, '.json')
  await $.fs.write(job, JSON.stringify({ scene: drawn, font, scale: PIXEL_SCALE, out: file }))
  const ran = await $.process.run(['osascript', '-l', 'JavaScript', `${$.plugin.root}/hooks/paint.js`, job])
  return ran.exitCode === 0
}

async function drain($: EngineInterface) {
  if (isDraining || queue.length === 0) return
  isDraining = true
  try {
    while (queue.length > 0) {
      const job = queue.shift()
      if (!job) break
      const file = `${CHART_DIR}/${job.key}.png`
      const isDone = await paintFile($, job.drawn, job.font, file).catch(() => false)
      if (isDone) ready.set(job.key, { file, columns: job.drawn.columns, rows: job.drawn.rows })
      pending.delete(job.key)
    }
  } finally {
    isDraining = false
  }
  $.ui.invalidate('ui.render')
}

function artFor(spec: ChartSpec, width: number) {
  if (!isPainted(spec) || !terminalFont) return null
  const drawn = scene(spec, width)
  const font = terminalFont
  const key = hash(JSON.stringify([drawn, font]))
  const done = ready.get(key)
  if (done) return done
  if (!pending.has(key)) {
    pending.add(key)
    queue.push({ drawn, font, key })
  }
  return 'drawing' as const
}

async function startPainter($: EngineInterface) {
  await fontOf($)
  $.clock.every(PAINT_TICK_MS, () => void drain($))
}

type Elements = ReturnType<EngineInterface['ui']['resolve']>

function textRows(els: Elements, rows: Row[], prefix: string) {
  const { Text } = els
  return rows.map((row, index) => (
    <Text key={`${prefix}${index}`} wrap="truncate-end">
      {row.map(piece => (
        <Text color={piece.color} dimColor={piece.dim === true}>
          {piece.text}
        </Text>
      ))}
    </Text>
  ))
}

function chartTree(els: Elements, spec: ChartSpec, width: number, prefix: string, art: Painted | 'drawing' | null) {
  const { Box, Text } = els
  const Image = 'Image' in els ? els.Image : undefined
  if (art === 'drawing' && Image)
    return (
      <Box flexDirection="column">
        {textRows(els, titleRows(spec), `${prefix}h`)}
        <Text dimColor>drawing…</Text>
      </Box>
    )
  if (!art || art === 'drawing' || !Image) return <Box flexDirection="column">{textRows(els, renderChart(spec, width), prefix)}</Box>
  return (
    <Box flexDirection="column">
      {textRows(els, titleRows(spec), `${prefix}h`)}
      <Box flexShrink={0}>
        <Image
          key={`${prefix}chart`}
          source={{ file: art.file, format: 'png' }}
          columns={art.columns}
          rows={art.rows}
          alt={`${spec.kind} chart${spec.title ? `: ${spec.title}` : ''}`}
        />
      </Box>
      {textRows(els, legend(spec), `${prefix}f`)}
    </Box>
  )
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
  'The checklist the user watches beside this session; keep it true.',
  'plan {items} lists a task\'s steps; start/done {id} as you go; add {text} a found step.',
  'ask {text, detail?, options?}: a decision only the user can make, parked so you keep working; detail is markdown evidence; the answer arrives later as a board message.',
  'note {text}: a settled outcome. remove {id}, clear_done tidy. show returns the whole board; other actions return one line.',
].join('\n')

const SCHEMA = {
  type: 'object',
  properties: {
    action: { type: 'string', enum: [...ACTIONS] },
    items: { type: 'array', items: { type: 'string' } },
    text: { type: 'string' },
    detail: { type: 'string' },
    options: { type: 'array', items: { type: 'string' } },
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
    await startPainter($)
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
    if (e.action === 'show') return { result: summary((await read($, boardAtom)) ?? EMPTY) }
    const outcome = await change($, board => apply(board, e))
    if ('error' in outcome) return { deny: outcome.error }
    if (e.action === 'ask' && e.text) void $.ui.notify(e.text, { title: 'Waiting on you' })
    return { result: `${outcome.said} · ${progress(outcome.board)}` }
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
    return { result: describeChart(spec) + (e.pin === true ? ' · pinned' : '') }
  }).catch(() => ({ deny: 'the chart failed' }))

  on('tool.check', { tool: CHART_TOOL }, async () => ({ decision: 'allow', reason: 'A chart only draws.' })).catch(
    ($, e, next) => next(e),
  )

  on('ui.render', { component: 'ToolUse' }, async ($, e, next) => {
    const isChart = e.props.tool === CHART_TOOL
    if (!isChart && e.props.tool !== TOOL) return next(e)
    const quiet = e.props.isExpanded ? e : { ...e, props: { ...e.props, input: briefInput(e.props.tool, e.props.input) } }
    if (!isChart || e.props.isRunning || e.props.isErrored) return next(quiet)
    const request = e.props.input as ChartRequest
    if (request.unpin === true || validateChart(specOf(request))) return next(quiet)
    const els = $.ui.resolve(e)
    const { Box } = els
    const theirs = await next(quiet)
    const width = Math.min(120, Math.max(20, (e.viewport?.columns ?? 100) - 6))
    const spec = specOf(request)
    const art = artFor(spec, width)
    return (
      <Box flexDirection="column">
        {theirs}
        <Box flexDirection="column" paddingLeft={2} marginTop={1}>
          {chartTree(els, spec, width, 't', art)}
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
    const els = $.ui.resolve(e)
    const { Box, Text, Button, Markdown, Input } = els
    const board = (await read($, boardAtom)) ?? EMPTY
    const expanded = (await read($, expandedAtom)) ?? 0
    const charts = (await read($, chartsAtom)) ?? []
    const chartWidth = Math.max(20, e.props.bodyColumns - 1)
    const arts = charts.map(chart => artFor(chart, chartWidth))

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
            {chartTree(els, chart, chartWidth, `c${index}`, arts[index] ?? null)}
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
