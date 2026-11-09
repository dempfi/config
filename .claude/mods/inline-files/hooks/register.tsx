import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, RenderElement } from 'claude-code'
import { excerpt, isMarkdown, shortPath, textPaths } from './paths.ts'

const PREVIEW_LINES = 12
const EXPANDED_LINES = 400
const MAX_BYTES = 512 * 1024
const MUTED = '#8B9099'
const RULE = '─'
const FRAME_INSET = 7
const VSCODE = 'Visual Studio Code'

const opened = atom({ plugin: 'inline-files', key: 'open' } as const, {})

type TextFile = { path: string; content: string }

const loaded = new Map<string, Promise<TextFile | null>>()

async function load($: EngineInterface, path: string): Promise<TextFile | null> {
  const content = await $.fs.read(path).catch(() => null)
  if (typeof content !== 'string' || content.includes('\u0000')) return null
  return { path, content }
}

async function prepare($: EngineInterface, path: string) {
  const stat = await $.fs.stat(path).catch(() => null)
  if (!stat || stat.kind !== 'file' || stat.size > MAX_BYTES) return null
  const key = `${path}@${stat.mtimeMs}`
  let file = loaded.get(key)
  if (!file) {
    file = load($, path)
    loaded.set(key, file)
  }
  return file
}

async function files($: EngineInterface, paths: string[]) {
  const found = await Promise.all(paths.map(path => prepare($, path)))
  return found.filter((file): file is TextFile => file !== null)
}

function basename(path: string) {
  return path.slice(path.lastIndexOf('/') + 1)
}

function folder(path: string) {
  return path.slice(0, path.lastIndexOf('/'))
}

async function toggle($: EngineInterface, path: string) {
  await update($, opened, all => ({ ...all, [path]: !all[path] }))
}

async function openIn($: EngineInterface, path: string, app?: string) {
  const command = app ? ['open', '-a', app, path] : ['open', path]
  const ran = await $.process.run(command, { timeoutMs: 10_000 }).catch(() => null)
  if (!ran || ran.exitCode !== 0) $.ui.toast(`Could not open ${basename(path)}`)
}

async function draw(
  $: EngineInterface,
  e: Parameters<EngineInterface['ui']['resolve']>[0] & { surface: 'terminal' },
  theirs: RenderElement,
  shown: TextFile[],
  columns: number,
) {
  const { Box, Button, Markdown, Text } = $.ui.resolve(e)
  const isOpen = await read($, opened)
  const home = await $.env.get('HOME')
  const inner = Math.max(10, columns - FRAME_INSET)
  const control = (file: TextFile, name: string, label: string, onPress: () => void) => (
    <Button key={`${file.path}:${name}`} label={label} plain dimColor onPress={onPress} />
  )

  const card = (file: TextFile) => {
    const isExpanded = isOpen[file.path] === true
    const markdown = isMarkdown(file.path)
    const cut = excerpt(file.content, isExpanded ? EXPANDED_LINES : PREVIEW_LINES, markdown)
    return (
      <Box
        key={file.path}
        flexDirection="column"
        marginLeft={2}
        marginTop={1}
        borderStyle="round"
        borderColor={MUTED}
        paddingX={1}
      >
        <Box flexDirection="row" gap={1}>
          <Box flexGrow={1} flexShrink={1}>
            <Text wrap="truncate-end">
              <Text bold>{basename(file.path)}</Text>
              <Text color={MUTED}>{` · ${cut.total} lines · ${shortPath(folder(file.path), home)}`}</Text>
            </Text>
          </Box>
          {cut.hidden > 0 || isExpanded
            ? control(file, 'toggle', isExpanded ? ' less ' : ' more ', () => void toggle($, file.path))
            : null}
          {control(file, 'code', ' VS Code ', () => void openIn($, file.path, VSCODE))}
          {control(file, 'open', ' open ', () => void openIn($, file.path))}
        </Box>
        <Text color={MUTED}>{RULE.repeat(inner)}</Text>
        {markdown ? (
          <Markdown key={`${file.path}:md`} text={cut.text} />
        ) : (
          <Box flexDirection="column">
            {cut.text.split('\n').map((line, index) => (
              <Text key={`${file.path}:${index}`} wrap="truncate-end">
                {line || ' '}
              </Text>
            ))}
          </Box>
        )}
        {cut.hidden > 0 && <Text color={MUTED}>{`… ${cut.hidden} more lines`}</Text>}
      </Box>
    )
  }

  return (
    <Box flexDirection="column">
      {theirs}
      {shown.map(card)}
    </Box>
  )
}

export const register: Register = on => {
  on('ui.render', { component: 'AssistantMessage' }, async ($, e, next) => {
    if (e.surface !== 'terminal') return next(e)
    const paths = textPaths(e.props.text)
    if (paths.length === 0) return next(e)
    const shown = await files($, paths)
    const theirs = await next(e)
    if (shown.length === 0) return theirs
    return draw($, e, theirs, shown, e.viewport?.columns ?? 80)
  })
}
