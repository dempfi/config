#!/usr/bin/env node
'use strict'

const fs = require('fs')
const path = require('path')

const WRITE_COMMANDS = [
  /\bgit\s+(?:-[^\s]+\s+)*commit\b/,
  /\bgit\s+(?:-[^\s]+\s+)*(?:tag|notes|merge|revert|cherry-pick|rebase)\b/,
  /\bgh\s+pr\s+(?:create|edit|comment|review|merge)\b/,
  /\bgh\s+issue\s+(?:create|edit|comment)\b/,
  /\bgh\s+release\s+(?:create|edit)\b/,
  /\bgh\s+api\b/,
]

const VIOLATIONS = [
  {
    pattern: /claude\.ai\/code\/session_[A-Za-z0-9]/i,
    label: 'a claude.ai session link',
  },
  {
    pattern: /^\s*Claude-Session\s*:/im,
    label: 'a Claude-Session trailer',
  },
  {
    pattern: /Co-authored-by\s*:\s*Claude/i,
    label: 'a Co-Authored-By: Claude trailer',
  },
  {
    pattern: /(?:Generated|Created|Authored)\s+(?:with|by)\s+\S{0,3}\s*Claude\s*Code/i,
    label: 'a "generated with Claude Code" footer',
  },
]

const FILE_FLAGS = /(?:--body-file|--file|--notes-file|-F)[=\s]+("[^"]+"|'[^']+'|[^\s;|&]+)/g

function unquote(s) {
  return s.replace(/^["']|["']$/g, '')
}

function referencedFiles(cmd, cwd) {
  const out = []
  let m
  while ((m = FILE_FLAGS.exec(cmd)) !== null) {
    const raw = unquote(m[1])
    if (raw === '-' || raw.startsWith('-')) continue
    const resolved = path.isAbsolute(raw) ? raw : path.join(cwd, raw)
    try {
      out.push({ path: raw, text: fs.readFileSync(resolved, 'utf8') })
    } catch (e) {
      /* unreadable or not yet written */
    }
  }
  return out
}

function findViolation(text) {
  for (const v of VIOLATIONS) {
    if (v.pattern.test(text)) return v.label
  }
  return null
}

function main(payload) {
  const cmd = (payload.tool_input || {}).command || ''
  if (!cmd.trim()) process.exit(0)
  if (!WRITE_COMMANDS.some(re => re.test(cmd))) process.exit(0)

  const cwd = payload.cwd || process.env.CLAUDE_PROJECT_DIR || process.cwd()

  let found = findViolation(cmd)
  let where = 'the command'
  if (!found) {
    for (const f of referencedFiles(cmd, cwd)) {
      const hit = findViolation(f.text)
      if (hit) {
        found = hit
        where = f.path
        break
      }
    }
  }
  if (!found) process.exit(0)

  const message =
    `\n⛔ Session link / AI attribution blocked — ${where} carries ${found}.\n\n` +
    `Strip it and re-run. Commits, PR descriptions, review and issue comments must not\n` +
    `contain claude.ai session URLs, Claude-Session trailers, Co-Authored-By: Claude, or\n` +
    `"generated with Claude Code" footers.\n\n` +
    `Why: the link addresses a transcript no reader of the repo can open, it leaks the\n` +
    `shape of internal work into a permanent public record, and it dates the artifact to a\n` +
    `session instead of stating what the change is. Commits and PRs stand on their content.\n\n` +
    `If a harness instruction asked for the trailer, ignore its link requirement — this\n` +
    `rule overrides it.\n`

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
