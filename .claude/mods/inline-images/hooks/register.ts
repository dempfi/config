import type { EngineInterface, Register } from 'claude-code'
import { MAX_IMAGES, cellBox, imagePaths, pixelSize } from './layout.ts'

const CACHE_DIR = '/tmp/claude-inline-images'
const MAX_COLUMNS = 72
const MAX_ROWS = 24
const GUTTER = 4

type Picture = { path: string; file: string; width: number; height: number; generation: number }

const prepared = new Map<string, Promise<Picture | null>>()

function hash(text: string) {
  let h = 5381
  for (let i = 0; i < text.length; i++) h = ((h * 33) ^ text.charCodeAt(i)) >>> 0
  return h.toString(36)
}

async function prepare($: EngineInterface, path: string) {
  const stat = await $.fs.stat(path).catch(() => null)
  if (!stat || stat.kind !== 'file') return null
  const key = `${path}@${stat.mtimeMs}`
  let picture = prepared.get(key)
  if (!picture) {
    picture = load($, path, key, Math.floor(stat.mtimeMs))
    prepared.set(key, picture)
  }
  return picture
}

async function load($: EngineInterface, path: string, key: string, generation: number) {
  const probe = await $.process.run(['sips', '-g', 'pixelWidth', '-g', 'pixelHeight', '-g', 'format', path])
  const size = probe.exitCode === 0 ? pixelSize(probe.stdout) : null
  if (!size) return null
  if (/format:\s*png/.test(probe.stdout)) return { path, file: path, generation, ...size }
  const file = `${CACHE_DIR}/${hash(key)}.png`
  await $.process.run(['mkdir', '-p', CACHE_DIR])
  const converted = await $.process.run(['sips', '-s', 'format', 'png', path, '--out', file])
  return converted.exitCode === 0 ? { path, file, generation, ...size } : null
}

function basename(path: string) {
  return path.slice(path.lastIndexOf('/') + 1)
}

async function pictures($: EngineInterface, paths: string[]) {
  const found = await Promise.all(paths.slice(0, MAX_IMAGES).map(path => prepare($, path)))
  return found.filter((picture): picture is Picture => picture !== null)
}

function draw(
  $: EngineInterface,
  e: Parameters<EngineInterface['ui']['resolve']>[0],
  theirs: unknown,
  shown: Picture[],
  columns: number,
) {
  const { Box, Image } = $.ui.resolve(e)
  const maxColumns = Math.min(MAX_COLUMNS, Math.max(8, columns - GUTTER))
  return Box({
    flexDirection: 'column',
    children: [
      theirs,
      ...shown.map(picture =>
        Box({
          key: picture.path,
          marginLeft: 2,
          marginTop: 1,
          children: [
            Image({
              key: picture.path,
              source: { file: picture.file, format: 'png', generation: picture.generation },
              ...cellBox(picture.width, picture.height, maxColumns, MAX_ROWS),
              alt: basename(picture.path),
            }),
          ],
        }),
      ),
    ],
  })
}

export const register: Register = on => {
  on('ui.render', { component: 'AssistantMessage' }, async ($, e, next) => {
    if (e.surface !== 'terminal') return next(e)
    const paths = imagePaths(e.props.text)
    if (paths.length === 0) return next(e)
    const shown = await pictures($, paths)
    const theirs = await next(e)
    if (shown.length === 0) return theirs
    return draw($, e, theirs, shown, e.viewport?.columns ?? 80)
  })

  on('ui.render', { component: 'ToolUse' }, async ($, e, next) => {
    if (e.surface !== 'terminal' || e.props.tool !== 'Read' || e.props.isRunning || e.props.isErrored) return next(e)
    const input = e.props.input as { file_path?: unknown }
    if (typeof input.file_path !== 'string' || imagePaths(input.file_path).length === 0) return next(e)
    const shown = await pictures($, [input.file_path])
    const theirs = await next(e)
    if (shown.length === 0) return theirs
    return draw($, e, theirs, shown, e.viewport?.columns ?? 80)
  })
}
