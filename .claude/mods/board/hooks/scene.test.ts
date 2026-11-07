import { expect, test } from 'claude-code/testing'
import type { Shape } from './scene.ts'
import { GRID, niceScale, scene, textWidth, thin } from './scene.ts'

const texts = (shapes: Shape[]) => shapes.filter((shape): shape is Extract<Shape, { type: 'text' }> => shape.type === 'text')
const days = Array.from({ length: 30 }, (_, day) => `Nov ${day + 1}`)

test('the value scale rounds out to tidy steps that cover the data', async () => {
  const scale = niceScale(175, 760)
  expect(scale.ticks).toEqual([0, 200, 400, 600, 800])
  expect(scale.min).toBeLessThanOrEqual(175)
  expect(scale.max).toBeGreaterThanOrEqual(760)
})

test('every gridline is drawn in the grid color and carries its value inside the chart', async () => {
  const drawn = scene({ kind: 'line', series: [{ values: [175, 760] }] }, 100)
  const lines = drawn.shapes.filter(shape => shape.type === 'stroke' && shape.color === GRID)
  const values = texts(drawn.shapes).map(shape => shape.text)
  expect(lines.length).toBe(5)
  for (const value of ['0', '200', '400', '600', '800']) expect(values).toContain(value)
})

test('date labels are thinned so none overlap, and the last always shows', async () => {
  const kept = thin(
    days.map((text, index) => ({ x: 2 + index * 1.5, text })),
    0,
    48,
  )
  expect(kept.at(-1)?.text).toBe('Nov 30')
  for (let i = 1; i < kept.length; i++) {
    const before = kept[i - 1]
    const here = kept[i]
    if (!before || !here) continue
    expect(here.x - textWidth(here.text) / 2).toBeGreaterThan(before.x + textWidth(before.text) / 2)
  }
})

test('a few labels spread evenly across the line, the first at its start and the last at its end', async () => {
  const drawn = scene({ kind: 'line', series: [{ values: Array.from({ length: 14 }, (_, i) => i) }], labels: ['Oct 24', 'Nov 6'] }, 100)
  const dates = texts(drawn.shapes).filter(label => label.text === 'Oct 24' || label.text === 'Nov 6')
  expect(dates.length).toBe(2)
  expect((dates[1]?.x ?? 0) - (dates[0]?.x ?? 0)).toBeGreaterThan(60)
})

test('every label sits inside the chart', async () => {
  for (const kind of ['line', 'scatter', 'bar', 'hbar'] as const) {
    const drawn = scene({ kind, series: [{ name: 'a', values: [3, 900, 40, 1200] }], labels: ['mon', 'tue', 'wed', 'thu'] }, 60)
    for (const label of texts(drawn.shapes)) {
      expect(label.x).toBeGreaterThanOrEqual(0)
      expect(label.x).toBeLessThanOrEqual(drawn.columns)
      expect(label.y).toBeGreaterThanOrEqual(0)
      expect(label.y).toBeLessThanOrEqual(drawn.rows)
    }
  }
})

test('a line chart ends each series with its last value in its own color', async () => {
  const drawn = scene({ kind: 'line', series: [{ values: [1, 760] }, { values: [5, 330] }] }, 80)
  const ends = texts(drawn.shapes).filter(shape => shape.bold)
  expect(ends.map(shape => shape.text)).toEqual(['760', '330'])
  expect(ends[0]?.color).not.toBe(ends[1]?.color)
})

test('bars stand on zero and the tallest reaches the top of the scale', async () => {
  const drawn = scene({ kind: 'bar', series: [{ values: [9, 35] }], height: 8 }, 60)
  const rects = drawn.shapes.filter((shape): shape is Extract<Shape, { type: 'rect' }> => shape.type === 'rect')
  const bottoms = rects.map(rect => rect.y + rect.h)
  expect(Math.abs((bottoms[0] ?? 0) - (bottoms[1] ?? 1))).toBeLessThan(1e-9)
  expect(rects[1]?.h).toBeGreaterThan((rects[0]?.h ?? 0) * 3)
})

test('horizontal bars put each name on the left and each value at the end of its bar', async () => {
  const drawn = scene({ kind: 'hbar', series: [{ values: [939, 195] }], labels: ['board', 'inline-images'] }, 80)
  const labels = texts(drawn.shapes)
  expect(labels.filter(label => label.align === 'right').map(label => label.text)).toEqual(['board', 'inline-images'])
  expect(labels.filter(label => label.bold).map(label => label.text)).toEqual(['939', '195'])
  expect(drawn.rows).toBe(2)
})
