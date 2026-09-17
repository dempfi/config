#!/usr/bin/env node
'use strict'

const fs = require('fs')
const path = require('path')

const MAX_LINES = 300
const MAX_BYTES = 2 * 1024 * 1024
const NON_TEXT = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.heic', '.bmp', '.tiff', '.pdf', '.ipynb'])

function head(file) {
  const fd = fs.openSync(file, 'r')
  try {
    const buffer = Buffer.alloc(8192)
    const read = fs.readSync(fd, buffer, 0, buffer.length, 0)
    return buffer.subarray(0, read)
  } finally {
    fs.closeSync(fd)
  }
}

function lineCount(buffer) {
  let count = 0
  for (const byte of buffer) if (byte === 10) count++
  return buffer.length && buffer[buffer.length - 1] !== 10 ? count + 1 : count
}

function deny(message) {
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

function main(payload) {
  const input = payload.tool_input || {}
  const file = input.file_path
  if (!file || input.offset != null || input.limit != null || input.pages != null) process.exit(0)
  if (NON_TEXT.has(path.extname(file).toLowerCase())) process.exit(0)

  let stat
  try {
    stat = fs.statSync(file)
  } catch (e) {
    process.exit(0)
  }
  if (!stat.isFile() || head(file).includes(0)) process.exit(0)

  const size = stat.size > MAX_BYTES ? `${Math.round(stat.size / 1024)} KB` : null
  const lines = size ? null : lineCount(fs.readFileSync(file))
  if (lines !== null && lines <= MAX_LINES) process.exit(0)

  deny(
    `\n⛔ Whole-file read blocked — ${file} is ${size || `${lines} lines`}.\n\n` +
      `Read the part the task needs, not the file:\n` +
      `  1. Locate it — LSP documentSymbol for code, rg -n for text.\n` +
      `  2. Read that range — Read with offset and limit.\n\n` +
      `If the whole file is genuinely needed, pass limit explicitly (for example limit: ${lines || 2000}).\n\n` +
      `Why: every line read stays in context and is re-read by every later request in the session.\n`
  )
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
