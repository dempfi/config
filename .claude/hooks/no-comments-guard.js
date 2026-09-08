#!/usr/bin/env node
'use strict'

const fs = require('fs')
const path = require('path')
const os = require('os')

const BLOCK_DOC_COMMENTS = true
const SENTINEL_NAME = path.join('.claude', 'allow-comments')

const SLASH = { token: '//', kind: 'line' }
const SLASH_DOC = { token: '///', kind: 'line', doc: true }
const BANG_DOC = { token: '//!', kind: 'line', doc: true }
const STAR = { token: '/*', kind: 'block', close: '*/' }
const STAR_DOC = { token: '/**', kind: 'block', close: '*/', doc: true }
const JSX_STAR = { token: '{/*', kind: 'block', close: '*/' }
const HASH = { token: '#', kind: 'line' }
const DASH = { token: '--', kind: 'line' }
const SEMI = { token: ';', kind: 'line' }
const HTML = { token: '<!--', kind: 'block', close: '-->' }

const C_LIKE = [SLASH, SLASH_DOC, BANG_DOC, STAR, STAR_DOC]
const JS_LIKE = C_LIKE.concat([JSX_STAR])
const MARKUP_MIX = JS_LIKE.concat([HTML])

const LANGS = {
  js: { openers: JS_LIKE, backticks: true },
  clike: { openers: C_LIKE, backticks: false },
  go: { openers: C_LIKE, backticks: true },
  hash: { openers: [HASH], backticks: false },
  python: { openers: [HASH], triples: true },
  sql: { openers: [DASH, STAR], backticks: false },
  dash: { openers: [DASH], backticks: false },
  semi: { openers: [SEMI], backticks: false },
  markup: { openers: [HTML], backticks: false },
  css: { openers: [STAR, STAR_DOC], backticks: false },
  cssish: { openers: [SLASH, STAR, STAR_DOC], backticks: false },
  mixed: { openers: MARKUP_MIX, backticks: true },
}

const BY_EXT = {
  js: 'js', jsx: 'js', mjs: 'js', cjs: 'js', ts: 'js', tsx: 'js', mts: 'js', cts: 'js',
  java: 'clike', c: 'clike', h: 'clike', cpp: 'clike', cxx: 'clike', cc: 'clike',
  hpp: 'clike', hxx: 'clike', cs: 'clike', rs: 'clike', swift: 'clike', kt: 'clike',
  kts: 'clike', scala: 'clike', dart: 'clike', php: 'clike', sol: 'clike', zig: 'clike',
  groovy: 'clike', gradle: 'clike', proto: 'clike', m: 'clike', mm: 'clike',
  go: 'go',
  py: 'python', pyi: 'python',
  rb: 'hash', sh: 'hash', bash: 'hash', zsh: 'hash', fish: 'hash', pl: 'hash', pm: 'hash',
  r: 'hash', jl: 'hash', nim: 'hash', cr: 'hash', tf: 'hash', hcl: 'hash', tfvars: 'hash',
  toml: 'hash', yaml: 'hash', yml: 'hash', ex: 'hash', exs: 'hash', coffee: 'hash',
  sql: 'sql',
  lua: 'dash', hs: 'dash', elm: 'dash',
  clj: 'semi', cljs: 'semi', cljc: 'semi', el: 'semi', lisp: 'semi', scm: 'semi', rkt: 'semi',
  html: 'markup', htm: 'markup', xml: 'markup', svg: 'markup',
  vue: 'mixed', svelte: 'mixed', astro: 'mixed',
  css: 'css', sass: 'css', scss: 'cssish', less: 'cssish', styl: 'cssish',
}

const NOTEBOOK_EXT = {
  python: 'py', python3: 'py', r: 'r', julia: 'jl', ruby: 'rb', scala: 'scala',
  javascript: 'js', typescript: 'ts', rust: 'rs', go: 'go', bash: 'sh', sql: 'sql',
}

const BY_BASENAME = {
  makefile: 'hash', dockerfile: 'hash', justfile: 'hash', rakefile: 'hash',
  gemfile: 'hash', brewfile: 'hash', vagrantfile: 'hash', procfile: 'hash',
}

const DIRECTIVE = new RegExp([
  '^!',
  '-\\*-\\s*(coding|mode)\\s*:',
  'eslint-(disable|enable|env)',
  '^globals\\s', '^exported\\b',
  '@ts-(ignore|expect-error|nocheck|check)',
  '@(type|satisfies)\\s*\\{',
  'prettier-ignore', 'biome-ignore', 'oxlint-disable', 'dprint-ignore',
  'deno-lint-ignore', '@deno-types',
  '\\bnoqa\\b', 'type:\\s*ignore', '\\b(pylint|mypy|pyright|ruff|flake8)\\s*:',
  '\\bfmt:\\s*(on|off)', '\\bpragma\\b', '\\bnosec\\b', '\\brubocop\\s*:',
  'shellcheck\\s+(disable|shell|source)', 'noinspection',
  '(istanbul|[cv]8)\\s+ignore',
  '^go:(build|generate|embed|linkname|noinline|nosplit)', '^\\+build\\b', '\\bnolint\\b',
  'frozen_string_literal\\s*:', '\\bencoding\\s*:',
  'SPDX-', '\\bCopyright\\b', '@generated\\b', 'Code generated .*DO NOT EDIT',
  '@(vitest|jest|playwright)-environment', '@vitest-',
  'svelte-ignore', '@jsx(ImportSource|Runtime|Frag)?\\b', '<reference\\s',
  '@flow\\b', '@license\\b', '@preserve\\b', '@vite-ignore', 'webpackChunkName',
  'sourceMappingURL', '@charset', '@ts-', '\\bLINT\\.(If|Then|End)',
].join('|'), 'i')

function main(data) {
  const tool = String(data.tool_name || '')
  if (!/^(Write|Edit|MultiEdit|NotebookEdit)$/.test(tool)) return
  if (sentinelPresent(data.cwd)) return

  const input = data.tool_input || {}
  const target = String(input.file_path || input.notebook_path || '')
  if (!target) return

  const lang = tool === 'NotebookEdit' ? notebookLang(target, input) : langFor(target)
  if (!lang) return

  const proposed = proposedText(tool, input)
  if (!proposed) return

  const authored = collect(proposed, lang).filter(c => !isExempt(c))
  if (authored.length === 0) return

  const baseline = new Set()
  for (const chunk of baselineTexts(tool, input, target)) {
    for (const c of collect(chunk, lang)) baseline.add(c.body)
  }

  const added = authored.filter(c => !baseline.has(c.body))
  if (added.length === 0) return

  deny(target, added)
}

function proposedText(tool, input) {
  if (tool === 'Write') return str(input.content)
  if (tool === 'NotebookEdit') {
    if (input.edit_mode === 'delete') return ''
    return str(input.new_source)
  }
  if (Array.isArray(input.edits)) return input.edits.map(e => str(e.new_string)).join('\n')
  return str(input.new_string)
}

function baselineTexts(tool, input, target) {
  const texts = []
  if (tool === 'Edit' || tool === 'MultiEdit') {
    if (Array.isArray(input.edits)) for (const e of input.edits) texts.push(str(e.old_string))
    texts.push(str(input.old_string))
  }
  if (tool === 'NotebookEdit') {
    texts.push(notebookSource(target))
  } else {
    texts.push(readFile(target))
  }
  return texts.filter(Boolean)
}

function notebookSource(file) {
  const nb = notebook(file)
  if (!nb) return ''
  return (nb.cells || [])
    .filter(c => c.cell_type !== 'markdown')
    .map(c => (Array.isArray(c.source) ? c.source.join('') : str(c.source)))
    .join('\n')
}

function notebookLang(file, input) {
  const nb = notebook(file)
  const cell = nb && (nb.cells || []).find(c => c.id === input.cell_id)
  const type = input.cell_type || (cell && cell.cell_type) || 'code'
  if (type === 'markdown') return null
  const meta = (nb && nb.metadata) || {}
  const name = String(
    (meta.kernelspec && meta.kernelspec.language) || (meta.language_info && meta.language_info.name) || 'python'
  ).toLowerCase()
  const family = BY_EXT[NOTEBOOK_EXT[name] || 'py']
  return family ? LANGS[family] : LANGS.python
}

function notebook(file) {
  try {
    return JSON.parse(readFile(file))
  } catch (e) {
    return null
  }
}

function readFile(file) {
  try {
    return fs.readFileSync(file, 'utf8')
  } catch (e) {
    return ''
  }
}

function sentinelPresent(cwd) {
  const roots = [cwd || process.cwd(), os.homedir()]
  return roots.some(root => {
    try {
      return fs.existsSync(path.join(root, SENTINEL_NAME))
    } catch (e) {
      return false
    }
  })
}

function langFor(file) {
  const base = path.basename(file).toLowerCase()
  if (BY_BASENAME[base]) return LANGS[BY_BASENAME[base]]
  const ext = base.includes('.') ? base.slice(base.lastIndexOf('.') + 1) : ''
  const family = BY_EXT[ext]
  return family ? LANGS[family] : null
}

function collect(text, lang) {
  const lines = String(text).split('\n')
  const openers = lang.openers.slice().sort((a, b) => b.token.length - a.token.length)
  const found = []
  let backticks = 0
  let triples = 0
  let i = 0

  while (i < lines.length) {
    const trimmed = lines[i].trim()
    const shadowed = (lang.backticks && backticks % 2 === 1) || (lang.triples && triples % 2 === 1)
    const opener = shadowed || !trimmed ? null : openers.find(o => trimmed.startsWith(o.token))

    if (opener) {
      const chunk = opener.kind === 'block' ? readBlock(lines, i, opener) : readRun(lines, i, opener)
      if (chunk.body) found.push({ line: i + 1, body: chunk.body, head: trimmed, doc: !!opener.doc })
      i += chunk.consumed
      continue
    }

    if (lang.backticks) backticks += occurrences(lines[i].replace(/\\./g, ''), '`')
    if (lang.triples) triples += occurrences(lines[i], '"""') + occurrences(lines[i], "'''")
    i += 1
  }
  return found
}

function readRun(lines, start, opener) {
  const parts = []
  let i = start
  while (i < lines.length) {
    const trimmed = lines[i].trim()
    if (!trimmed.startsWith(opener.token)) break
    parts.push(trimmed.slice(opener.token.length))
    i += 1
  }
  return { body: normalize(parts.join(' ')), consumed: Math.max(1, i - start) }
}

function readBlock(lines, start, opener) {
  const parts = []
  let i = start
  let head = lines[i].trim().slice(opener.token.length)
  while (i < lines.length) {
    const end = head.indexOf(opener.close)
    if (end !== -1) {
      parts.push(head.slice(0, end))
      i += 1
      break
    }
    parts.push(head)
    i += 1
    head = i < lines.length ? lines[i].trim().replace(/^\*+/, '') : ''
  }
  return { body: normalize(parts.join(' ')), consumed: Math.max(1, i - start) }
}

function isExempt(comment) {
  if (comment.doc && !BLOCK_DOC_COMMENTS) return true
  if (/^#!/.test(comment.head)) return true
  return DIRECTIVE.test(comment.body)
}

function normalize(s) {
  return String(s).replace(/[-*\s]+$/, '').replace(/\s+/g, ' ').trim()
}

function occurrences(haystack, needle) {
  let n = 0
  let at = haystack.indexOf(needle)
  while (at !== -1) {
    n += 1
    at = haystack.indexOf(needle, at + needle.length)
  }
  return n
}

function str(v) {
  return typeof v === 'string' ? v : ''
}

function deny(target, added) {
  const listing = added
    .map(c => `  line ${c.line}: ${c.head.length > 96 ? c.head.slice(0, 96) + '…' : c.head}`)
    .join('\n')

  const message =
    `\n⛔ NO-COMMENTS — this edit authors ${added.length} new code comment(s) in ${path.basename(target)}\n` +
    `\n${listing}\n` +
    `\nComments are never part of the deliverable in this environment. Resend the SAME\n` +
    `edit with those comment lines deleted — nothing else about it changes.\n` +
    `\n❌ Do NOT rephrase or shorten the comment. No comment is the goal, not a better one.\n` +
    `❌ Do NOT route around this by writing the file through Bash (heredoc, sed, printf,\n` +
    `   tee, python). That is the same violation and it defeats the point.\n` +
    `✅ If the code needs the explanation, put it in the code: a clearer name, a named\n` +
    `   constant, a smaller function. If it explains WHY, it belongs in the commit message.\n` +
    `\nMachine directives are already exempt (eslint-disable, @ts-expect-error, # noqa,\n` +
    `//go:build, shebangs, SPDX, @vitest-environment, prettier-ignore, …). If one of the\n` +
    `lines above is genuinely load-bearing and the allowlist missed it, say so to the user\n` +
    `instead of retrying — only they can create the .claude/allow-comments escape hatch.\n\n`

  process.stderr.write(message)
  console.log(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason: message.trim(),
      },
    })
  )
  process.exit(2)
}

let raw = ''
process.stdin.setEncoding('utf8')
process.stdin.on('data', d => {
  raw += d
})
process.stdin.on('end', () => {
  try {
    main(JSON.parse(raw))
  } catch (e) {
    process.exit(0)
  }
  process.exit(0)
})
