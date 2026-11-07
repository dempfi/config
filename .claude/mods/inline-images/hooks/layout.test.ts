import { expect, test } from 'claude-code/testing'
import { cellBox, imagePaths, pixelSize } from './layout.ts'

test('a file link on its own line is found and decoded', async () => {
  expect(imagePaths('The render:\n\nfile:///private/tmp/a%20b/compare.png\n')).toEqual(['/private/tmp/a b/compare.png'])
})

test('a bare path in prose is found without the punctuation after it', async () => {
  expect(imagePaths('Saved to /Users/me/out/cards.png, then /Users/me/out/sky.JPG.')).toEqual([
    '/Users/me/out/cards.png',
    '/Users/me/out/sky.JPG',
  ])
})

test('a path in backticks or brackets is found, a relative one is not', async () => {
  expect(imagePaths('see `/a/b.webp` and (/c/d.gif) but not out/e.png')).toEqual(['/a/b.webp', '/c/d.gif'])
})

test('a path that only starts like an image is not one', async () => {
  expect(imagePaths('/a/b.png.txt and /a/c.pngx')).toEqual([])
})

test('the same image named twice draws once, and at most four draw', async () => {
  const text = ['/1.png', '/1.png', '/2.png', '/3.png', '/4.png', '/5.png'].join(' ')
  expect(imagePaths(text)).toEqual(['/1.png', '/2.png', '/3.png', '/4.png'])
})

test('a wide picture fills the columns and keeps its shape', async () => {
  const box = cellBox(1600, 900, 72, 24)
  expect(box.columns).toBe(72)
  expect(box.rows).toBe(19)
})

test('a tall picture is held to the row limit and narrowed to keep its shape', async () => {
  const box = cellBox(800, 1600, 72, 24)
  expect(box.rows).toBe(24)
  expect(box.columns).toBe(25)
})

test('a small icon is not blown up', async () => {
  expect(cellBox(64, 64, 72, 24).columns).toBe(8)
})

test('sips output gives the pixel size', async () => {
  expect(pixelSize('/x.png\n  pixelWidth: 1024\n  pixelHeight: 768\n  format: png\n')).toEqual({
    width: 1024,
    height: 768,
  })
  expect(pixelSize('Error: not an image')).toBe(null)
})
