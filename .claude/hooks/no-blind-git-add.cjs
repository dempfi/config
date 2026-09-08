#!/usr/bin/env node
'use strict'

const { execSync } = require('child_process')

const BLIND_ADD = /\bgit\s+add\s+(?:-A\b|--all\b|-A\s|\.\s*$|\.\s*(?:&&|;|\|))/
const BLIND_COMMIT = /\bgit\s+commit\s+(?:-[a-zA-Z]*a[a-zA-Z]*\b)/

function dirtyCount(cwd) {
  try {
    const out = execSync('git status --porcelain', { cwd, encoding: 'utf8', timeout: 4000 })
    return out.split('\n').filter(l => l.trim()).length
  } catch (e) {
    return null
  }
}

function main(payload) {
  const cmd = (payload.tool_input || {}).command || ''
  if (!cmd.trim()) process.exit(0)

  const blindAdd = BLIND_ADD.test(cmd)
  const blindCommit = BLIND_COMMIT.test(cmd)
  if (!blindAdd && !blindCommit) process.exit(0)

  const cwd = payload.cwd || process.env.CLAUDE_PROJECT_DIR || process.cwd()
  const dirty = dirtyCount(cwd)
  const scope = blindAdd ? 'git add -A / git add .' : 'git commit -a'

  const message =
    `\n⛔ Blind staging blocked — ${scope} sweeps every dirty path in the tree.\n\n` +
    (dirty === null ? '' : `The working tree currently has ${dirty} dirty path(s).\n\n`) +
    `Stage the files this change actually touches, by explicit path:\n` +
    `  git add path/to/one.ts path/to/two.ts\n\n` +
    `Why: a working tree routinely carries work in progress that is not yours to commit —\n` +
    `other sessions' edits, probe output, generated assets. A blind add ships them under\n` +
    `your commit message, and untangling that afterwards costs more than typing the paths.\n\n` +
    `If a commit was not explicitly asked for, do not commit at all — report the change\n` +
    `as ready and let the user call it.\n`

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
