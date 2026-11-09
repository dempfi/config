const EXTENSIONS = [
  'md',
  'markdown',
  'mdx',
  'txt',
  'json',
  'jsonl',
  'yaml',
  'yml',
  'toml',
  'csv',
  'tsv',
  'ts',
  'tsx',
  'js',
  'jsx',
  'mjs',
  'cjs',
  'py',
  'rb',
  'go',
  'rs',
  'swift',
  'java',
  'kt',
  'sh',
  'zsh',
  'fish',
  'sql',
  'html',
  'css',
  'scss',
  'xml',
  'log',
  'ini',
  'conf',
  'diff',
  'patch',
]

const EDGE = `[\\s<>()[\\]"'\`]`

const TEXT_PATH = new RegExp(
  `(?<=^|${EDGE})(?:file://)?(/[^\\s<>()[\\]"'\`]+?\\.(?:${EXTENSIONS.join('|')}))(?=$|${EDGE}|[,:;!?]|[.](?:$|\\s))`,
  'gi',
)

export const MAX_FILES = 3

export function textPaths(text: string) {
  const found = new Set<string>()
  for (const match of text.matchAll(TEXT_PATH)) {
    const raw = match[1]
    if (raw === undefined) continue
    if (match.index > 0 && /[\w.:/-]/.test(text.charAt(match.index - 1)) && !match[0].startsWith('file://')) continue
    found.add(match[0].startsWith('file://') ? safeDecode(raw) : raw)
    if (found.size === MAX_FILES) break
  }
  return [...found]
}

function safeDecode(path: string) {
  try {
    return decodeURIComponent(path)
  } catch {
    return path
  }
}

export function isMarkdown(path: string) {
  return /\.(?:md|markdown|mdx)$/i.test(path)
}

export type Excerpt = { text: string; total: number; hidden: number }

export function excerpt(content: string, maxLines: number, isMarkdownText = false): Excerpt {
  const lines = content.replace(/\n+$/, '').split('\n')
  const shown = lines.slice(0, maxLines)
  const fences = shown.filter(line => /^\s*(```|~~~)/.test(line)).length
  if (isMarkdownText && fences % 2 === 1) shown.push('```')
  return { text: shown.join('\n'), total: lines.length, hidden: Math.max(0, lines.length - maxLines) }
}

export function shortPath(path: string, home: string | undefined) {
  return home && path.startsWith(`${home}/`) ? `~${path.slice(home.length)}` : path
}
