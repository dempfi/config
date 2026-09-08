#!/usr/bin/env node
'use strict'

const fs = require('fs')
const path = require('path')

const SOURCE_EXT = /\.(ts|tsx|js|jsx|mjs|cjs|svelte|vue|css|scss|less|py|rb|rs|go|java|kt|swift|c|h|cpp|hpp|cs|php|sql|sh|bash)$/i
const SCRATCH = /(^|\/)(tmp|temp|out|scratch|\.scratch|node_modules|\.git|dist|build|target|coverage|__pycache__|\.venv|venv|vendor|\.next|\.svelte-kit|\.output)\//
const ABSOLUTE_SCRATCH = /^\/(private\/)?(tmp|var\/folders)\//
const GENERATED = [/(^|\/)(generated|__generated__)\//, /\.generated\.[\w.]+$/, /(^|\/)paraglide\//]
const ALLOW_FILE = path.join('.claude', 'bash-edit-allow')

function projectAllow(dir) {
  try {
    return fs
      .readFileSync(path.join(dir, ALLOW_FILE), 'utf8')
      .split('\n')
      .map(l => l.trim())
      .filter(l => l && !l.startsWith('#'))
      .map(l => new RegExp(l))
  } catch (e) {
    return []
  }
}

function isProtected(p, dir, allow) {
  if (!p) return false
  const clean = p.replace(/^['"]|['"]$/g, '').trim()
  if (!SOURCE_EXT.test(clean)) return false
  if (ABSOLUTE_SCRATCH.test(clean)) return false
  if (clean.includes('/.claude/jobs/')) return false
  const rel = clean.startsWith('/') ? path.relative(dir, clean) : clean
  if (rel.startsWith('..')) return false
  if (SCRATCH.test('/' + rel)) return false
  if (GENERATED.some(g => g.test(rel))) return false
  if (allow.some(a => a.test(rel))) return false
  return true
}

function redirectTargets(cmd) {
  const out = []
  const redirect = /(?:^|[^>|&\d])>>?\s*(["']?[\w./@-]+["']?)/g
  let m
  while ((m = redirect.exec(cmd))) out.push(m[1])
  const tee = /\btee\s+(?:-a\s+)?(["']?[\w./@-]+["']?)/g
  while ((m = tee.exec(cmd))) out.push(m[1])
  return out
}

function inPlaceTargets(cmd) {
  const out = []
  const sed = /\bsed\s+(?:-[a-zA-Z]*i[a-zA-Z]*\b|--in-place)\S*(?:\s+(?:-[a-zA-Z]\S*|'[^']*'|"[^"]*"))*\s+(["']?[\w./@-]+["']?)/g
  let m
  while ((m = sed.exec(cmd))) out.push(m[1])
  const perl = /\bperl\s+(?:-\S+\s+)*-i\S*\s+(?:-\S+\s+)*(["']?[\w./@-]+["']?)/g
  while ((m = perl.exec(cmd))) out.push(m[1])
  return out
}

function scriptRewriteTargets(cmd) {
  if (!/\bpython3?\b|\bnode\b|\bruby\b/.test(cmd)) return []
  const writes = /\.write\s*\(|writeFileSync|open\s*\([^)]*['"][wa]\+?['"]|Path\([^)]*\)\.write_text/
  if (!writes.test(cmd)) return []
  const out = []
  const quoted = /['"]([\w./@-]+\.(?:ts|tsx|js|jsx|mjs|cjs|svelte|vue|css|scss|less|py|rb|rs|go|java|kt|swift|c|h|cpp|hpp|cs|php|sql|sh|bash))['"]/g
  let m
  while ((m = quoted.exec(cmd))) out.push(m[1])
  return out
}

function main(payload) {
  const cmd = (payload.tool_input || {}).command || ''
  if (!cmd.trim()) process.exit(0)

  const dir = payload.cwd || process.env.CLAUDE_PROJECT_DIR || process.cwd()
  const allow = projectAllow(dir)

  const hits = []
  for (const [kind, targets] of [
    ['redirect (> / >> / tee)', redirectTargets(cmd)],
    ['in-place edit (sed -i / perl -i)', inPlaceTargets(cmd)],
    ['script rewrite (python/node string replace)', scriptRewriteTargets(cmd)],
  ]) {
    for (const t of targets) if (isProtected(t, dir, allow)) hits.push(`${t}  —  ${kind}`)
  }

  if (!hits.length) process.exit(0)

  const unique = [...new Set(hits)]
  const message =
    `\n⛔ Source edit through Bash blocked.\n\n` +
    unique.map(h => `  ${h}`).join('\n') +
    `\n\nUse the Edit tool (or Write for a genuinely new file). This is deliberate and it\n` +
    `overrides any general "prefer Bash for file changes" default — that preference does\n` +
    `not apply to tracked source.\n\n` +
    `Why: an Edit shows a reviewable diff and passes through the comment and pronoun\n` +
    `guards. A heredoc, sed -i, or python string-replace shows the user nothing, silently\n` +
    `no-ops when the anchor text has drifted, and bypasses those guards entirely.\n\n` +
    `Unaffected: scratch paths (tmp/, out/, build dirs, /private/tmp, the job dir), data and\n` +
    `config formats (json/yaml/toml/md), and generated trees. Write those through Bash freely.\n\n` +
    `A project can exempt its own generated files by listing regexes, one per line, in\n` +
    `${ALLOW_FILE}.\n`

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
