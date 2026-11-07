import type { ChartKind, ChartSeries, ChartSpec } from '../types'

export const CHART_KINDS = ['line', 'scatter', 'bar', 'hbar', 'sparkline'] as const satisfies readonly ChartKind[]

export const PALETTE = ['#399ee6', '#fa8d3e', '#6cbf43', '#a37acc', '#f07171', '#e6b450', '#4cbf99'] as const

export type Piece = { text: string; color?: string; dim?: true }
export type Row = Piece[]

const BRAILLE_BITS = [
  [0x01, 0x08],
  [0x02, 0x10],
  [0x04, 0x20],
  [0x40, 0x80],
] as const

const VERTICAL = ' ▁▂▃▄▅▆▇█'
const HORIZONTAL = ' ▏▎▍▌▋▊▉█'

const DEFAULT_HEIGHT = 10
const MAX_HEIGHT = 30

export function colorOf(index: number) {
  return PALETTE[index % PALETTE.length] ?? PALETTE[0]
}

export function compact(value: number) {
  const magnitude = Math.abs(value)
  if (magnitude >= 1e9) return `${trim(value / 1e9)}B`
  if (magnitude >= 1e6) return `${trim(value / 1e6)}M`
  if (magnitude >= 1e4) return `${trim(value / 1e3)}k`
  if (magnitude >= 100 || Number.isInteger(value)) return String(Math.round(value))
  if (magnitude >= 1) return trim(value)
  return String(Number(value.toPrecision(2)))
}

function trim(value: number) {
  return String(Number(value.toFixed(1)))
}

export function rowWidth(row: Row) {
  return row.reduce((sum, piece) => sum + [...piece.text].length, 0)
}

function pad(text: string, width: number, align: 'left' | 'right') {
  const chars = [...text]
  if (chars.length >= width) return chars.slice(0, width).join('')
  const fill = ' '.repeat(width - chars.length)
  return align === 'left' ? text + fill : fill + text
}

function finite(values: number[]) {
  return values.filter(value => Number.isFinite(value))
}

function pointsOf(series: ChartSeries): [number, number][] {
  if (series.points) return series.points.filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y))
  return (series.values ?? []).map((y, x) => [x, y] as [number, number]).filter(([, y]) => Number.isFinite(y))
}

function extent(values: number[]) {
  const clean = finite(values)
  if (clean.length === 0) return { min: 0, max: 1 }
  let min = Math.min(...clean)
  let max = Math.max(...clean)
  if (min === max) {
    min -= 1
    max += 1
  }
  return { min, max }
}

function heightOf(spec: ChartSpec) {
  return Math.max(3, Math.min(MAX_HEIGHT, Math.floor(spec.height ?? DEFAULT_HEIGHT)))
}

export function legend(spec: ChartSpec): Row[] {
  const named = spec.series.filter(series => series.name)
  if (spec.kind === 'sparkline' || spec.series.length < 2 || named.length === 0) return []
  const row: Row = []
  spec.series.forEach((series, index) => {
    if (index > 0) row.push({ text: '  ' })
    row.push({ text: '● ', color: colorOf(index) })
    row.push({ text: series.name ?? `series ${index + 1}`, dim: true })
  })
  return [row]
}

export function titleRows(spec: ChartSpec): Row[] {
  if (!spec.title) return []
  return [[{ text: spec.title }, ...(spec.unit ? [{ text: ` (${spec.unit})`, dim: true as const }] : [])]]
}

function plot(spec: ChartSpec, width: number, connect: boolean): Row[] {
  const height = heightOf(spec)
  const all = spec.series.map(pointsOf)
  const ys = extent(all.flat().map(([, y]) => y))
  const xs = extent(all.flat().map(([x]) => x))
  const top = compact(ys.max)
  const bottom = compact(ys.min)
  const gutter = Math.max([...top].length, [...bottom].length) + 1
  const columns = Math.max(4, width - gutter - 1)
  const dotsWide = columns * 2
  const dotsHigh = height * 4

  const bits = Array.from({ length: height * columns }, () => 0)
  const owner = Array.from({ length: height * columns }, () => -1)

  const dot = (dx: number, dy: number, series: number) => {
    if (dx < 0 || dy < 0 || dx >= dotsWide || dy >= dotsHigh) return
    const cell = Math.floor(dy / 4) * columns + Math.floor(dx / 2)
    bits[cell] = (bits[cell] ?? 0) | (BRAILLE_BITS[dy % 4]?.[dx % 2] ?? 0)
    owner[cell] = series
  }
  const toDot = ([x, y]: [number, number]) =>
    [
      Math.round(((x - xs.min) / (xs.max - xs.min)) * (dotsWide - 1)),
      Math.round((1 - (y - ys.min) / (ys.max - ys.min)) * (dotsHigh - 1)),
    ] as const

  all.forEach((points, series) => {
    const dots = points.map(toDot)
    dots.forEach(([dx, dy], index) => {
      dot(dx, dy, series)
      const next = dots[index + 1]
      if (!connect || !next) return
      const steps = Math.max(Math.abs(next[0] - dx), Math.abs(next[1] - dy))
      for (let step = 1; step < steps; step++)
        dot(Math.round(dx + ((next[0] - dx) * step) / steps), Math.round(dy + ((next[1] - dy) * step) / steps), series)
    })
  })

  const rows: Row[] = []
  for (let y = 0; y < height; y++) {
    const label = y === 0 ? top : y === height - 1 ? bottom : ''
    const row: Row = [{ text: pad(label, gutter - 1, 'right') + ' ', dim: true }, { text: '│', dim: true }]
    for (let x = 0; x < columns; x++) {
      const cell = y * columns + x
      const glyph = String.fromCharCode(0x2800 + (bits[cell] ?? 0))
      const series = owner[cell] ?? -1
      const last = row.at(-1)
      const color = series >= 0 ? colorOf(series) : undefined
      if (last && last.color === color && !last.dim) last.text += glyph
      else row.push({ text: glyph, ...(color ? { color } : {}) })
    }
    rows.push(row)
  }
  rows.push([{ text: ' '.repeat(gutter) + '└' + '─'.repeat(columns), dim: true }])
  const first = spec.labels?.[0] ?? compact(xs.min)
  const last = spec.labels?.at(-1) ?? compact(xs.max)
  const room = Math.max(0, columns - [...first].length - [...last].length)
  rows.push([{ text: ' '.repeat(gutter + 1) + first + ' '.repeat(room) + last, dim: true }])
  return rows
}

function bars(spec: ChartSpec, width: number): Row[] {
  const height = heightOf(spec)
  const series = spec.series.map(one => one.values ?? pointsOf(one).map(([, y]) => y))
  const count = Math.max(...series.map(values => values.length), 0)
  const { max } = extent([0, ...series.flat()])
  const top = compact(max)
  const gutter = [...top].length + 1
  const columns = Math.max(4, width - gutter - 1)
  const slot = Math.max(1, Math.floor(columns / Math.max(1, count)))
  const barWidth = Math.max(1, Math.floor((slot - (slot > 2 ? 1 : 0)) / Math.max(1, series.length)))

  const rows: Row[] = []
  for (let y = 0; y < height; y++) {
    const row: Row = [{ text: pad(y === 0 ? top : y === height - 1 ? '0' : '', gutter - 1, 'right') + ' ', dim: true }, { text: '│', dim: true }]
    for (let index = 0; index < count; index++) {
      series.forEach((values, s) => {
        const value = Math.max(0, values[index] ?? 0)
        const eighths = Math.round((value / max) * height * 8)
        const fromBottom = height - 1 - y
        const level = Math.max(0, Math.min(8, eighths - fromBottom * 8))
        row.push({ text: (VERTICAL[level] ?? ' ').repeat(barWidth), color: colorOf(s) })
      })
      const used = barWidth * series.length
      if (slot > used) row.push({ text: ' '.repeat(slot - used) })
    }
    rows.push(row)
  }
  rows.push([{ text: ' '.repeat(gutter) + '└' + '─'.repeat(Math.min(columns, slot * count)), dim: true }])
  if (spec.labels?.length) {
    const label = spec.labels.slice(0, count).map(text => pad(text, slot, 'left')).join('')
    rows.push([{ text: ' '.repeat(gutter + 1) + label.slice(0, columns), dim: true }])
  }
  return rows
}

function horizontal(spec: ChartSpec, width: number): Row[] {
  const values = spec.series[0]?.values ?? (spec.series[0] ? pointsOf(spec.series[0]).map(([, y]) => y) : [])
  const labels = values.map((_, index) => spec.labels?.[index] ?? String(index + 1))
  const labelWidth = Math.min(24, Math.max(...labels.map(label => [...label].length), 1))
  const numbers = values.map(compact)
  const numberWidth = Math.max(...numbers.map(text => text.length), 1)
  const room = Math.max(4, width - labelWidth - numberWidth - 3)
  const { max } = extent([0, ...values])
  return values.map((value, index) => {
    const eighths = Math.round((Math.max(0, value) / max) * room * 8)
    const full = Math.floor(eighths / 8)
    const rest = HORIZONTAL[eighths % 8] ?? ''
    const bar = '█'.repeat(full) + (eighths % 8 ? rest : '')
    return [
      { text: pad(labels[index] ?? '', labelWidth, 'right') + ' ', dim: true },
      { text: bar || '▏', color: colorOf(0) },
      { text: ' ' + (numbers[index] ?? ''), dim: true },
    ]
  })
}

function sparkline(spec: ChartSpec, width: number): Row[] {
  return spec.series.map((series, index) => {
    const values = finite(series.values ?? pointsOf(series).map(([, y]) => y))
    const { min, max } = extent(values)
    const name = series.name ? `${series.name} ` : ''
    const tail = values.length ? ` ${compact(values.at(-1) ?? 0)}` : ''
    const room = Math.max(4, width - [...name].length - tail.length)
    const step = values.length > room ? values.length / room : 1
    const sampled =
      values.length > room ? Array.from({ length: room }, (_, i) => values[Math.floor(i * step)] ?? 0) : values
    const line = sampled.map(value => VERTICAL[1 + Math.round(((value - min) / (max - min)) * 7)] ?? ' ').join('')
    return [
      ...(name ? [{ text: name, dim: true as const }] : []),
      { text: line, color: colorOf(index) },
      { text: tail, dim: true },
    ]
  })
}

export function render(spec: ChartSpec, width: number): Row[] {
  const room = Math.max(12, Math.floor(width))
  const body =
    spec.kind === 'line'
      ? plot(spec, room, true)
      : spec.kind === 'scatter'
        ? plot(spec, room, false)
        : spec.kind === 'bar'
          ? bars(spec, room)
          : spec.kind === 'hbar'
            ? horizontal(spec, room)
            : sparkline(spec, room)
  return [...titleRows(spec), ...body, ...legend(spec)]
}

export function describe(spec: ChartSpec) {
  const parts = spec.series.map((series, index) => {
    const values = (series.values ?? pointsOf(series).map(([, y]) => y)).filter(Number.isFinite)
    const name = series.name ?? `series ${index + 1}`
    if (values.length === 0) return `${name} empty`
    return `${name} ${compact(Math.min(...values))}–${compact(Math.max(...values))}`
  })
  return `Drawn: ${parts.join('; ')}`
}

export function validate(spec: ChartSpec) {
  if (!(CHART_KINDS as readonly string[]).includes(spec.kind)) return `kind must be one of ${CHART_KINDS.join(', ')}`
  if (!Array.isArray(spec.series) || spec.series.length === 0) return 'a chart needs at least one series'
  const hasData = spec.series.some(series => (series.values?.length ?? 0) > 0 || (series.points?.length ?? 0) > 0)
  if (!hasData) return 'every series is empty'
  return null
}
