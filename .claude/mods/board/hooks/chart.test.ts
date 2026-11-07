import { expect, test } from 'claude-code/testing'
import { colorOf, compact, describe, render, rowWidth, validate } from './chart.ts'

const text = (rows: ReturnType<typeof render>) => rows.map(row => row.map(piece => piece.text).join(''))

test('no chart row is wider than the room it was given', async () => {
  const series = [{ name: 'p95', values: [120, 180, 90, 480, 300, 250, 410] }, { name: 'p50', values: [40, 60, 50, 90, 80, 70, 65] }]
  for (const kind of ['line', 'scatter', 'bar', 'hbar', 'sparkline'] as const) {
    for (const width of [20, 47, 90]) {
      const rows = render({ kind, title: 'latency', series, labels: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] }, width)
      for (const row of rows) expect(rowWidth(row)).toBeLessThanOrEqual(width)
    }
  }
})

test('a rising line puts its first dot at the bottom left and its last at the top right', async () => {
  const rows = render({ kind: 'line', series: [{ values: [0, 1, 2, 3, 4, 5, 6, 7] }], height: 4 }, 30)
  const plot = text(rows).slice(0, 4).map(line => line.slice(line.indexOf('│') + 1))
  expect(plot[3]?.[0]).not.toBe('⠀')
  expect(plot[0]?.at(-1)).not.toBe('⠀')
  expect(plot[0]?.[0]).toBe('⠀')
})

test('the y axis is labelled with the top and bottom of the data', async () => {
  const lines = text(render({ kind: 'line', series: [{ values: [3, 1200, 40] }], height: 5 }, 40))
  expect(lines[0]?.trimStart().startsWith('1200')).toBe(true)
  expect(lines[4]?.trimStart().startsWith('3')).toBe(true)
})

test('the tallest bar fills the full height and a zero bar draws nothing', async () => {
  const lines = text(render({ kind: 'bar', series: [{ values: [0, 10] }], height: 3 }, 20))
  const plots = lines.slice(0, 3).map(line => line.slice(line.indexOf('│') + 1))
  expect(plots.every(line => line.includes('█'))).toBe(true)
  expect(plots.every(line => line.trimStart().startsWith('█'))).toBe(true)
})

test('horizontal bars scale to the largest value and show each value', async () => {
  const lines = text(render({ kind: 'hbar', series: [{ values: [50, 100] }], labels: ['half', 'full'] }, 40))
  const half = (lines[0]?.match(/█/g) ?? []).length
  const full = (lines[1]?.match(/█/g) ?? []).length
  expect(Math.abs(full - half * 2)).toBeLessThanOrEqual(1)
  expect(lines[1]?.endsWith('100')).toBe(true)
})

test('a sparkline climbs from the lowest block to the highest', async () => {
  const [line] = text(render({ kind: 'sparkline', series: [{ values: [1, 2, 3, 4, 5, 6, 7, 8] }] }, 40))
  expect(line?.startsWith('▁')).toBe(true)
  expect(line?.includes('█')).toBe(true)
})

test('several named series get a legend in their own colors', async () => {
  const rows = render({ kind: 'line', series: [{ name: 'a', values: [1, 2] }, { name: 'b', values: [2, 1] }] }, 40)
  const legend = rows.at(-1) ?? []
  expect(legend.some(piece => piece.color === colorOf(0))).toBe(true)
  expect(legend.some(piece => piece.color === colorOf(1))).toBe(true)
})

test('numbers are written short', async () => {
  expect(compact(1234567)).toBe('1.2M')
  expect(compact(45200)).toBe('45.2k')
  expect(compact(980)).toBe('980')
  expect(compact(0.0456)).toBe('0.046')
})

test('a chart with no data or an unknown kind is refused', async () => {
  expect(validate({ kind: 'line', series: [] })).not.toBe(null)
  expect(validate({ kind: 'line', series: [{ values: [] }] })).not.toBe(null)
  expect(validate({ kind: 'pie' as 'line', series: [{ values: [1] }] })).not.toBe(null)
  expect(validate({ kind: 'bar', series: [{ values: [1] }] })).toBe(null)
})

test('the model is told the range of what it drew', async () => {
  expect(describe({ kind: 'bar', title: 'cost', series: [{ name: 'usd', values: [3, 9, 1] }] })).toContain('usd: 3 points, 1 to 9')
})
