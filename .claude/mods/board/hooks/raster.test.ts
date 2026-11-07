import { expect, test } from 'claude-code/testing'
import { MAX_BYTES, draw, monotone, pixelSize } from './raster.ts'

function pixel(image: ReturnType<typeof draw>, x: number, y: number) {
  const at = (y * image.width + x) * 4
  return { r: image.rgba[at] ?? 0, g: image.rgba[at + 1] ?? 0, b: image.rgba[at + 2] ?? 0, a: image.rgba[at + 3] ?? 0 }
}

test('the smoothed curve passes through every data point and never overshoots between them', async () => {
  const points: [number, number][] = [
    [0, 0],
    [1, 10],
    [2, 10],
    [3, 2],
  ]
  const curve = monotone(points)
  for (const [x, y] of points) expect(Math.abs(curve(x) - y)).toBeLessThan(1e-9)
  for (let x = 1; x <= 2; x += 0.1) expect(curve(x)).toBeLessThanOrEqual(10 + 1e-9)
})

test('the image never goes past the byte budget or the side an Image may carry', async () => {
  for (const [columns, rows] of [
    [255, 60],
    [255, 3],
    [20, 30],
  ] as const) {
    const { width, height } = pixelSize(columns, rows)
    expect(width * height * 4).toBeLessThanOrEqual(MAX_BYTES)
    expect(width).toBeLessThanOrEqual(2048)
    expect(height).toBeLessThanOrEqual(2048)
  }
})

test('the line is drawn opaque in its color, and the sky above it stays transparent', async () => {
  const image = draw({
    width: 200,
    height: 100,
    rows: 10,
    grid: [0, 9],
    series: [{ color: '#ff0000', points: [[0, 5], [10, 5]] }],
    connect: true,
    xRange: { min: 0, max: 10 },
    yRange: { min: 0, max: 10 },
  })
  const onLine = pixel(image, 100, 50)
  expect(onLine.a).toBeGreaterThan(200)
  expect(onLine.r).toBeGreaterThan(200)
  expect(onLine.g).toBeLessThan(60)
  expect(pixel(image, 100, 20).a).toBe(0)
})

test('a lone line gets a fill under it that fades toward the axis', async () => {
  const image = draw({
    width: 200,
    height: 100,
    rows: 10,
    grid: [0, 9],
    series: [{ color: '#00ff00', points: [[0, 8], [10, 8]] }],
    connect: true,
    xRange: { min: 0, max: 10 },
    yRange: { min: 0, max: 10 },
  })
  const near = pixel(image, 100, 30).a
  const far = pixel(image, 100, 90).a
  expect(near).toBeGreaterThan(far)
  expect(near).toBeGreaterThan(0)
})

test('a scatter draws dots and no line between them', async () => {
  const image = draw({
    width: 200,
    height: 100,
    rows: 10,
    grid: [0, 9],
    series: [{ color: '#0000ff', points: [[0, 5], [10, 5]] }],
    connect: false,
    xRange: { min: 0, max: 10 },
    yRange: { min: 0, max: 8 },
  })
  const row = Math.round(5 + (1 - 5 / 8) * 90)
  expect(pixel(image, 100, row).a).toBe(0)
  expect(pixel(image, 5, row).a).toBeGreaterThan(0)
})
