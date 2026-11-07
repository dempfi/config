import type { ChartSeries, ChartSpec } from '../types'
import { colorOf, compact } from './chart.ts'

export type Cmd = ['M', number, number] | ['L', number, number] | ['C', number, number, number, number, number, number]

export type Shape =
  | { type: 'stroke'; d: Cmd[]; color: string; alpha: number; width: number; dash?: number[] }
  | { type: 'gradient'; d: Cmd[]; color: string; top: number; bottom: number; y0: number; y1: number }
  | { type: 'rect'; x: number; y: number; w: number; h: number; radius: number; color: string; alpha: number }
  | { type: 'dot'; x: number; y: number; r: number; color: string; alpha: number }
  | {
      type: 'text'
      x: number
      y: number
      text: string
      color: string
      alpha: number
      align: 'left' | 'right' | 'center'
      baseline: 'top' | 'middle' | 'bottom'
      bold?: boolean
    }

export type Scene = { columns: number; rows: number; shapes: Shape[] }

export const GRID = '#d9a54a'
export const GRID_ALPHA = 0.38
export const INK = '#968d7c'
export const LABEL_WIDTH = 0.8

const DEFAULT_ROWS = 10
const MAX_ROWS = 30
const TICKS = 4
const PAD_TOP = 0.6
const PAD_X = 0.4
const AXIS_ROWS = 1
const LINE_WIDTH = 2
const DOT = 3
const SCATTER_DOT = 2.6
const LABEL_GAP = 2

function heightOf(spec: ChartSpec) {
  return Math.max(3, Math.min(MAX_ROWS, Math.floor(spec.height ?? DEFAULT_ROWS)))
}

function pointsOf(series: ChartSeries): [number, number][] {
  if (series.points) return series.points.filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y))
  return (series.values ?? []).map((y, x) => [x, y] as [number, number]).filter(([, y]) => Number.isFinite(y))
}

function valuesOf(series: ChartSeries) {
  return (series.values ?? pointsOf(series).map(([, y]) => y)).map(value => (Number.isFinite(value) ? value : 0))
}

export function niceStep(range: number, count: number) {
  const raw = range / Math.max(1, count) || 1
  const power = 10 ** Math.floor(Math.log10(raw))
  const unit = raw / power
  const nice = unit <= 1 ? 1 : unit <= 2 ? 2 : unit <= 2.5 ? 2.5 : unit <= 5 ? 5 : 10
  return nice * power
}

export function niceScale(min: number, max: number, count = TICKS) {
  if (min === max) {
    min -= 1
    max += 1
  }
  const step = niceStep(max - min, count)
  const low = Math.floor(min / step) * step
  const high = Math.ceil(max / step) * step
  const ticks: number[] = []
  for (let tick = low; tick <= high + step / 2; tick += step) ticks.push(Number(tick.toPrecision(12)))
  return { min: low, max: high, ticks }
}

export function textWidth(text: string) {
  return [...text].length * LABEL_WIDTH
}

export function thin(labels: { x: number; text: string }[], from: number, to: number) {
  const kept: { x: number; text: string }[] = []
  const last = labels.at(-1)
  const lastLeft = last ? Math.min(to - textWidth(last.text), last.x - textWidth(last.text) / 2) : to
  let free = from
  for (const label of labels.slice(0, -1)) {
    if (!label.text) continue
    const half = textWidth(label.text) / 2
    const left = Math.max(from, label.x - half)
    const right = left + half * 2
    if (left >= free && right + LABEL_GAP <= lastLeft) {
      kept.push(label)
      free = right + LABEL_GAP
    }
  }
  if (last?.text) kept.push(last)
  return kept
}

function smooth(points: [number, number][]): Cmd[] {
  if (points.length === 0) return []
  const [first] = points as [[number, number]]
  if (points.length < 3) return [['M', first[0], first[1]], ...points.slice(1).map(([x, y]) => ['L', x, y] as Cmd)]
  const n = points.length
  const slopes: number[] = []
  for (let i = 0; i < n - 1; i++) {
    const [x0, y0] = points[i] as [number, number]
    const [x1, y1] = points[i + 1] as [number, number]
    slopes.push((y1 - y0) / (x1 - x0 || 1))
  }
  const tangents: number[] = [slopes[0] ?? 0]
  for (let i = 1; i < n - 1; i++) {
    const a = slopes[i - 1] ?? 0
    const b = slopes[i] ?? 0
    tangents.push(a * b <= 0 ? 0 : (3 * (a + b)) / ((2 * b + a) / a + (b + 2 * a) / b))
  }
  tangents.push(slopes[n - 2] ?? 0)
  const d: Cmd[] = [['M', first[0], first[1]]]
  for (let i = 0; i < n - 1; i++) {
    const [x0, y0] = points[i] as [number, number]
    const [x1, y1] = points[i + 1] as [number, number]
    const h = (x1 - x0) / 3
    d.push(['C', x0 + h, y0 + (tangents[i] ?? 0) * h, x1 - h, y1 - (tangents[i + 1] ?? 0) * h, x1, y1])
  }
  return d
}

function grid(columns: number, top: number, bottom: number, scale: { min: number; max: number; ticks: number[] }) {
  const toY = (value: number) => bottom - ((value - scale.min) / (scale.max - scale.min || 1)) * (bottom - top)
  const shapes: Shape[] = []
  for (const tick of scale.ticks) {
    const y = toY(tick)
    shapes.push({ type: 'stroke', d: [['M', 0, y], ['L', columns, y]], color: GRID, alpha: GRID_ALPHA, width: 1, dash: [2, 3] })
    shapes.push({ type: 'text', x: PAD_X, y: y - 0.08, text: compact(tick), color: INK, alpha: 1, align: 'left', baseline: 'bottom' })
  }
  return { shapes, toY }
}

function xLabels(labels: { x: number; text: string }[], columns: number, rows: number): Shape[] {
  return thin(labels, PAD_X, columns - PAD_X).map(label => ({
    type: 'text' as const,
    x: label.x,
    y: rows - AXIS_ROWS / 2,
    text: label.text,
    color: INK,
    alpha: 1,
    align: 'center' as const,
    baseline: 'middle' as const,
  }))
}

function lineScene(spec: ChartSpec, columns: number): Scene {
  const plotRows = heightOf(spec)
  const rows = plotRows + AXIS_ROWS
  const series = spec.series.map((one, index) => ({ color: colorOf(index), points: [...pointsOf(one)].sort((a, b) => a[0] - b[0]) }))
  const all = series.flatMap(one => one.points)
  const xs = all.map(([x]) => x)
  const xMin = Math.min(...xs)
  const xMax = Math.max(...xs)
  const scale = niceScale(Math.min(...all.map(([, y]) => y)), Math.max(...all.map(([, y]) => y)))
  const top = PAD_TOP
  const bottom = plotRows
  const { shapes, toY } = grid(columns, top, bottom, scale)
  const labelRoom = Math.max(...scale.ticks.map(tick => textWidth(compact(tick)))) + PAD_X * 2
  const left = labelRoom
  const right = columns - PAD_X - 4
  const toX = (x: number) => left + ((x - xMin) / (xMax - xMin || 1)) * (right - left)
  const isFilled = spec.kind === 'line' && series.length <= 2

  series.forEach(one => {
    const points = one.points.map(([x, y]) => [toX(x), toY(y)] as [number, number])
    if (points.length === 0) return
    if (spec.kind === 'scatter') {
      for (const [x, y] of points) shapes.push({ type: 'dot', x, y, r: SCATTER_DOT, color: one.color, alpha: 0.9 })
      return
    }
    const d = smooth(points)
    if (isFilled) {
      const lastX = points.at(-1)?.[0] ?? right
      const firstX = points[0]?.[0] ?? left
      shapes.push({
        type: 'gradient',
        d: [...d, ['L', lastX, bottom], ['L', firstX, bottom]],
        color: one.color,
        top: series.length === 1 ? 0.3 : 0.16,
        bottom: 0,
        y0: Math.min(...points.map(([, y]) => y)),
        y1: bottom,
      })
    }
    shapes.push({ type: 'stroke', d, color: one.color, alpha: 1, width: LINE_WIDTH })
  })

  if (spec.kind === 'line') {
    const taken: number[] = []
    series.forEach(one => {
      const last = one.points.at(-1)
      if (!last) return
      const x = toX(last[0])
      let y = toY(last[1]) - 0.35
      while (taken.some(other => Math.abs(other - y) < 0.9)) y += 0.9
      taken.push(y)
      shapes.push({ type: 'dot', x, y: toY(last[1]), r: DOT, color: one.color, alpha: 1 })
      shapes.push({ type: 'text', x: x + 0.7, y, text: compact(last[1]), color: one.color, alpha: 1, align: 'left', baseline: 'middle', bold: true })
    })
  }

  const count = Math.max(...series.map(one => one.points.length))
  const given = spec.labels ?? []
  const names = given.length
    ? given.map((text, index) => {
        const at = given.length === count ? xMin + index : xMin + (index / Math.max(1, given.length - 1)) * (xMax - xMin)
        return { x: toX(at), text }
      })
    : Array.from({ length: 5 }, (_, step) => {
        const value = xMin + (step / 4) * (xMax - xMin)
        return { x: toX(value), text: compact(value) }
      })
  shapes.push(...xLabels(names, columns, rows))
  return { columns, rows, shapes }
}

function barScene(spec: ChartSpec, columns: number): Scene {
  const plotRows = heightOf(spec)
  const rows = plotRows + AXIS_ROWS
  const series = spec.series.map((one, index) => ({ color: colorOf(index), values: valuesOf(one) }))
  const count = Math.max(...series.map(one => one.values.length))
  const scale = niceScale(0, Math.max(0, ...series.flatMap(one => one.values)))
  const top = PAD_TOP + 0.8
  const bottom = plotRows
  const { shapes, toY } = grid(columns, top, bottom, scale)
  const left = Math.max(...scale.ticks.map(tick => textWidth(compact(tick)))) + PAD_X * 2
  const right = columns - PAD_X
  const slot = (right - left) / Math.max(1, count)
  const group = slot * 0.7
  const bar = group / Math.max(1, series.length)
  series.forEach((one, s) => {
    one.values.forEach((value, index) => {
      const x = left + index * slot + (slot - group) / 2 + s * bar
      const y = toY(Math.max(0, value))
      shapes.push({ type: 'rect', x: x + 0.15, y, w: bar - 0.3, h: bottom - y, radius: 3, color: one.color, alpha: 0.92 })
      if (bar >= textWidth(compact(value)) * 0.8)
        shapes.push({ type: 'text', x: x + bar / 2, y: y - 0.1, text: compact(value), color: one.color, alpha: 1, align: 'center', baseline: 'bottom', bold: true })
    })
  })
  const names = (spec.labels ?? []).slice(0, count).map((text, index) => ({ x: left + (index + 0.5) * slot, text }))
  shapes.push(...xLabels(names, columns, rows))
  return { columns, rows, shapes }
}

function horizontalScene(spec: ChartSpec, columns: number): Scene {
  const values = valuesOf(spec.series[0] ?? {}).slice(0, MAX_ROWS)
  const rows = Math.max(1, values.length)
  const color = colorOf(0)
  const names = values.map((_, index) => spec.labels?.[index] ?? String(index + 1))
  const labelRoom = Math.min(24, Math.max(...names.map(name => [...name].length))) * LABEL_WIDTH + PAD_X * 2
  const numberRoom = Math.max(...values.map(value => textWidth(compact(value)))) + PAD_X * 2
  const left = labelRoom
  const right = columns - numberRoom
  const max = Math.max(0, ...values) || 1
  const shapes: Shape[] = []
  values.forEach((value, row) => {
    const center = row + 0.5
    const length = (Math.max(0, value) / max) * (right - left)
    shapes.push({ type: 'text', x: labelRoom - PAD_X, y: center, text: names[row] ?? '', color: INK, alpha: 1, align: 'right', baseline: 'middle' })
    if (length > 0) shapes.push({ type: 'rect', x: left, y: center - 0.3, w: length, h: 0.6, radius: 3, color, alpha: 0.92 })
    shapes.push({ type: 'text', x: left + length + PAD_X, y: center, text: compact(value), color, alpha: 1, align: 'left', baseline: 'middle', bold: true })
  })
  return { columns, rows, shapes }
}

export function isPainted(spec: ChartSpec) {
  return spec.kind !== 'sparkline'
}

export function scene(spec: ChartSpec, columns: number): Scene {
  const width = Math.max(20, Math.min(255, Math.floor(columns)))
  if (spec.kind === 'hbar') return horizontalScene(spec, width)
  if (spec.kind === 'bar') return barScene(spec, width)
  return lineScene(spec, width)
}
