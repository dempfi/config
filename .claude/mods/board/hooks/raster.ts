export type Plot = {
  width: number
  height: number
  rows: number
  grid: number[]
  series: { color: string; points: [number, number][] }[]
  connect: boolean
  xRange: { min: number; max: number }
  yRange: { min: number; max: number }
}

export const PIXELS_PER_COLUMN = 12
export const PIXELS_PER_ROW = 24
export const MAX_BYTES = 1_900_000

const LINE_WIDTH = 2.4
const DOT_RADIUS = 3.2
const PAD = 5
const GRID = { r: 128, g: 128, b: 128, a: 0.16 }

const MAX_SIDE = 2048

export function pixelSize(columns: number, rows: number) {
  let width = Math.min(MAX_SIDE, Math.max(8, Math.round(columns * PIXELS_PER_COLUMN)))
  let height = Math.min(MAX_SIDE, Math.max(8, Math.round(rows * PIXELS_PER_ROW)))
  const bytes = width * height * 4
  if (bytes > MAX_BYTES) {
    const scale = Math.sqrt(MAX_BYTES / bytes)
    width = Math.floor(width * scale)
    height = Math.floor(height * scale)
  }
  return { width, height }
}

function hex(color: string) {
  const value = Number.parseInt(color.replace('#', ''), 16)
  return { r: (value >> 16) & 255, g: (value >> 8) & 255, b: value & 255 }
}

export function monotone(points: [number, number][]) {
  const n = points.length
  if (n < 3) return (x: number) => linear(points, x)
  const xs = points.map(([x]) => x)
  const ys = points.map(([, y]) => y)
  const slopes: number[] = []
  for (let i = 0; i < n - 1; i++) slopes.push(((ys[i + 1] ?? 0) - (ys[i] ?? 0)) / ((xs[i + 1] ?? 0) - (xs[i] ?? 0) || 1))
  const tangents: number[] = [slopes[0] ?? 0]
  for (let i = 1; i < n - 1; i++) {
    const a = slopes[i - 1] ?? 0
    const b = slopes[i] ?? 0
    tangents.push(a * b <= 0 ? 0 : (3 * (a + b)) / ((2 * b + a) / a + (b + 2 * a) / b))
  }
  tangents.push(slopes[n - 2] ?? 0)
  return (x: number) => {
    let i = 0
    while (i < n - 2 && x > (xs[i + 1] ?? 0)) i++
    const x0 = xs[i] ?? 0
    const x1 = xs[i + 1] ?? x0
    const h = x1 - x0 || 1
    const t = Math.max(0, Math.min(1, (x - x0) / h))
    const t2 = t * t
    const t3 = t2 * t
    return (
      (2 * t3 - 3 * t2 + 1) * (ys[i] ?? 0) +
      (t3 - 2 * t2 + t) * h * (tangents[i] ?? 0) +
      (-2 * t3 + 3 * t2) * (ys[i + 1] ?? 0) +
      (t3 - t2) * h * (tangents[i + 1] ?? 0)
    )
  }
}

function linear(points: [number, number][], x: number) {
  if (points.length === 0) return 0
  if (points.length === 1) return points[0]?.[1] ?? 0
  const [a, b] = points as [[number, number], [number, number]]
  const t = (x - a[0]) / (b[0] - a[0] || 1)
  return a[1] + (b[1] - a[1]) * Math.max(0, Math.min(1, t))
}

class Canvas {
  readonly data: Uint8ClampedArray
  constructor(
    readonly width: number,
    readonly height: number,
  ) {
    this.data = new Uint8ClampedArray(width * height * 4)
  }

  blend(x: number, y: number, color: { r: number; g: number; b: number }, alpha: number) {
    if (alpha <= 0 || x < 0 || y < 0 || x >= this.width || y >= this.height) return
    const at = (y * this.width + x) * 4
    const da = (this.data[at + 3] ?? 0) / 255
    const sa = Math.min(1, alpha)
    const oa = sa + da * (1 - sa)
    const mix = (src: number, dst: number) => (src * sa + dst * da * (1 - sa)) / oa
    this.data[at] = mix(color.r, this.data[at] ?? 0)
    this.data[at + 1] = mix(color.g, this.data[at + 1] ?? 0)
    this.data[at + 2] = mix(color.b, this.data[at + 2] ?? 0)
    this.data[at + 3] = oa * 255
  }

  segment(ax: number, ay: number, bx: number, by: number, color: { r: number; g: number; b: number }, width: number) {
    const half = width / 2
    const minX = Math.floor(Math.min(ax, bx) - half - 1)
    const maxX = Math.ceil(Math.max(ax, bx) + half + 1)
    const minY = Math.floor(Math.min(ay, by) - half - 1)
    const maxY = Math.ceil(Math.max(ay, by) + half + 1)
    const dx = bx - ax
    const dy = by - ay
    const length2 = dx * dx + dy * dy || 1
    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const t = Math.max(0, Math.min(1, ((x + 0.5 - ax) * dx + (y + 0.5 - ay) * dy) / length2))
        const distance = Math.hypot(x + 0.5 - (ax + t * dx), y + 0.5 - (ay + t * dy))
        const coverage = half + 0.5 - distance
        if (coverage > 0) this.blendMax(x, y, color, Math.min(1, coverage))
      }
    }
  }

  private coverage = new Map<number, number>()

  blendMax(x: number, y: number, color: { r: number; g: number; b: number }, alpha: number) {
    const key = y * this.width + x
    const had = this.coverage.get(key) ?? 0
    if (alpha <= had) return
    this.coverage.set(key, alpha)
    this.blend(x, y, color, (alpha - had) / (1 - had || 1))
  }

  resetCoverage() {
    this.coverage = new Map()
  }

  dot(cx: number, cy: number, color: { r: number; g: number; b: number }, radius: number) {
    for (let y = Math.floor(cy - radius - 1); y <= Math.ceil(cy + radius + 1); y++)
      for (let x = Math.floor(cx - radius - 1); x <= Math.ceil(cx + radius + 1); x++) {
        const coverage = radius + 0.5 - Math.hypot(x + 0.5 - cx, y + 0.5 - cy)
        if (coverage > 0) this.blend(x, y, color, Math.min(1, coverage))
      }
  }
}

export function draw(plot: Plot) {
  const canvas = new Canvas(plot.width, plot.height)
  const rowHeight = plot.height / Math.max(1, plot.rows)
  const left = PAD
  const right = plot.width - PAD
  const top = rowHeight / 2
  const bottom = plot.height - rowHeight / 2
  const toX = (x: number) => left + ((x - plot.xRange.min) / (plot.xRange.max - plot.xRange.min || 1)) * (right - left)
  const toY = (y: number) => bottom - ((y - plot.yRange.min) / (plot.yRange.max - plot.yRange.min || 1)) * (bottom - top)
  const fromX = (px: number) => plot.xRange.min + ((px - left) / (right - left || 1)) * (plot.xRange.max - plot.xRange.min)

  for (const row of plot.grid) {
    const y = Math.round(top + ((bottom - top) * row) / Math.max(1, plot.rows - 1))
    for (let x = left; x < right; x += 1) if (x % 4 < 2) canvas.blend(x, y, GRID, GRID.a)
  }

  const isFilled = plot.connect && plot.series.length <= 2
  plot.series.forEach(series => {
    const color = hex(series.color)
    const points = [...series.points].sort((a, b) => a[0] - b[0])
    if (points.length === 0) return
    if (!plot.connect) {
      for (const [x, y] of points) canvas.dot(toX(x), toY(y), color, DOT_RADIUS)
      return
    }
    const curve = monotone(points)
    const firstX = Math.ceil(toX(points[0]?.[0] ?? 0))
    const lastX = Math.floor(toX(points.at(-1)?.[0] ?? 0))
    const path: [number, number][] = []
    for (let px = firstX; px <= lastX; px++) path.push([px, toY(curve(fromX(px)))])
    if (isFilled) {
      const peak = plot.series.length === 1 ? 0.3 : 0.16
      for (const [px, py] of path) {
        const span = bottom - py
        for (let y = Math.ceil(py); y <= bottom; y++) canvas.blend(px, y, color, peak * (1 - (y - py) / (span || 1)) ** 1.6)
      }
    }
    canvas.resetCoverage()
    for (let i = 1; i < path.length; i++) {
      const [ax, ay] = path[i - 1] ?? [0, 0]
      const [bx, by] = path[i] ?? [0, 0]
      canvas.segment(ax, ay, bx, by, color, LINE_WIDTH)
    }
    const end = path.at(-1)
    if (end) canvas.dot(end[0], end[1], color, DOT_RADIUS)
  })

  return { width: plot.width, height: plot.height, rgba: canvas.data }
}

type Base64Bytes = Uint8Array & { toBase64(): string }

export type Bars = {
  width: number
  height: number
  rows: number
  grid: number[]
  series: { color: string; values: number[] }[]
  max: number
  isHorizontal: boolean
}

const BAR_SHARE = 0.72
const BAND_SHARE = 0.56
const BAR_GAP = 2
const BAR_ALPHA = 0.92

function roundedBar(
  canvas: Canvas,
  box: { x0: number; y0: number; x1: number; y1: number },
  color: { r: number; g: number; b: number },
  radius: number,
  roundEnd: 'top' | 'right',
) {
  for (let y = Math.floor(box.y0); y < Math.ceil(box.y1); y++)
    for (let x = Math.floor(box.x0); x < Math.ceil(box.x1); x++) {
      const cx = x + 0.5
      const cy = y + 0.5
      const coverX = Math.min(1, Math.max(0, Math.min(cx - box.x0 + 0.5, box.x1 - cx + 0.5)))
      const coverY = Math.min(1, Math.max(0, Math.min(cy - box.y0 + 0.5, box.y1 - cy + 0.5)))
      let coverage = coverX * coverY
      const corners =
        roundEnd === 'top'
          ? [
              [box.x0 + radius, box.y0 + radius],
              [box.x1 - radius, box.y0 + radius],
            ]
          : [
              [box.x1 - radius, box.y0 + radius],
              [box.x1 - radius, box.y1 - radius],
            ]
      for (const [kx = 0, ky = 0] of corners) {
        const isOutX = roundEnd === 'top' ? (kx < (box.x0 + box.x1) / 2 ? cx < kx : cx > kx) : cx > kx
        const isOutY = roundEnd === 'top' ? cy < ky : ky < (box.y0 + box.y1) / 2 ? cy < ky : cy > ky
        if (isOutX && isOutY) coverage = Math.min(coverage, Math.max(0, radius + 0.5 - Math.hypot(cx - kx, cy - ky)))
      }
      canvas.blend(x, y, color, coverage * BAR_ALPHA)
    }
}

export function drawBars(bars: Bars) {
  const canvas = new Canvas(bars.width, bars.height)
  const rowHeight = bars.height / Math.max(1, bars.rows)
  const count = Math.max(0, ...bars.series.map(one => one.values.length))
  const max = bars.max || 1

  if (bars.isHorizontal) {
    const left = PAD
    const right = bars.width - PAD
    bars.series[0]?.values.forEach((value, row) => {
      const band = rowHeight * BAND_SHARE
      const center = (row + 0.5) * rowHeight
      const length = (Math.max(0, value) / max) * (right - left)
      if (length <= 0) return
      roundedBar(
        canvas,
        { x0: left, y0: center - band / 2, x1: left + length, y1: center + band / 2 },
        hex(bars.series[0]?.color ?? '#888888'),
        Math.min(band / 2, length / 2, 5),
        'right',
      )
    })
    return { width: bars.width, height: bars.height, rgba: canvas.data }
  }

  const top = rowHeight / 2
  const bottom = bars.height - rowHeight / 2
  for (const row of bars.grid) {
    const y = Math.round(top + ((bottom - top) * row) / Math.max(1, bars.rows - 1))
    for (let x = PAD; x < bars.width - PAD; x += 1) if (x % 4 < 2) canvas.blend(x, y, GRID, GRID.a)
  }
  const slot = (bars.width - 2 * PAD) / Math.max(1, count)
  const group = slot * BAR_SHARE
  const barWidth = group / Math.max(1, bars.series.length)
  bars.series.forEach((series, s) => {
    const color = hex(series.color)
    series.values.forEach((value, index) => {
      const height = (Math.max(0, value) / max) * (bottom - top)
      if (height <= 0) return
      const x0 = PAD + index * slot + (slot - group) / 2 + s * barWidth + BAR_GAP / 2
      const x1 = x0 + barWidth - BAR_GAP
      roundedBar(canvas, { x0, y0: bottom - height, x1, y1: bottom }, color, Math.min((x1 - x0) / 2, height, 5), 'top')
    })
  })
  return { width: bars.width, height: bars.height, rgba: canvas.data }
}

export function toBase64(bytes: Uint8ClampedArray) {
  return (new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength) as Base64Bytes).toBase64()
}
