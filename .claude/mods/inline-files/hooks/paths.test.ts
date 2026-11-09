import { expect, test } from 'claude-code/testing'
import { excerpt, isMarkdown, shortPath, textPaths } from './paths.ts'

test('a file link on its own line and a bare absolute path are both found', async () => {
  const text = [
    'The draft is ready.',
    '',
    'file:///private/tmp/scratch/tgf/draft.md',
    '',
    'Compare it with /private/tmp/scratch/tgf/current.md, which has the old body.',
  ].join('\n')
  expect(textPaths(text)).toEqual(['/private/tmp/scratch/tgf/draft.md', '/private/tmp/scratch/tgf/current.md'])
})

test('a path inside backticks or ending a sentence is found without the punctuation', async () => {
  expect(textPaths('See `/repo/src/model.ts`. Then /repo/README.md.')).toEqual(['/repo/src/model.ts', '/repo/README.md'])
})

test('images, relative paths, urls and env files are left alone', async () => {
  const text = 'shot /tmp/a.png, src/model.ts, https://example.com/x.md and /repo/.env and /repo/.env.local'
  expect(textPaths(text)).toEqual([])
})

test('a file link with escaped characters is decoded', async () => {
  expect(textPaths('file:///Users/me/My%20Notes/plan.md')).toEqual(['/Users/me/My Notes/plan.md'])
})

test('no more than three files are previewed from one reply', async () => {
  const text = ['/a/1.md', '/a/2.md', '/a/3.md', '/a/4.md', '/a/1.md'].join(' ')
  expect(textPaths(text)).toEqual(['/a/1.md', '/a/2.md', '/a/3.md'])
})

test('an excerpt keeps the first lines and counts what it left out', async () => {
  const content = ['one', 'two', 'three', 'four', ''].join('\n')
  expect(excerpt(content, 2)).toEqual({ text: 'one\ntwo', total: 4, hidden: 2 })
  expect(excerpt(content, 10)).toEqual({ text: 'one\ntwo\nthree\nfour', total: 4, hidden: 0 })
})

test('a markdown excerpt cut inside a code fence closes the fence', async () => {
  const content = ['# Title', '```ts', 'const a = 1', 'const b = 2', '```', 'after'].join('\n')
  expect(excerpt(content, 3, true).text).toBe('# Title\n```ts\nconst a = 1\n```')
})

test('markdown is told apart from other text by its extension', async () => {
  expect(isMarkdown('/a/b/README.md')).toBe(true)
  expect(isMarkdown('/a/b/notes.markdown')).toBe(true)
  expect(isMarkdown('/a/b/model.ts')).toBe(false)
})

test('a path under the home folder is shortened to a tilde', async () => {
  expect(shortPath('/Users/me/Developer/x.md', '/Users/me')).toBe('~/Developer/x.md')
  expect(shortPath('/private/tmp/x.md', '/Users/me')).toBe('/private/tmp/x.md')
})
