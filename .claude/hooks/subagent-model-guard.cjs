#!/usr/bin/env node
'use strict'

const fs = require('fs')
const path = require('path')

const RULE = 'see ~/.claude/rules/subagent-models.md'
const LADDER = ['haiku', 'sonnet', 'opus']
const TAIL_BYTES = 512 * 1024

function tierOf(name) {
  const s = String(name ?? '').toLowerCase()
  if (!s) return null
  if (s.includes('fable')) return 'fable'
  return LADDER.find(t => s.includes(t)) ?? null
}

function deny(reason) {
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason: reason,
      },
    }),
  )
  process.exit(0)
}

function readTail(file) {
  const { size } = fs.statSync(file)
  const len = Math.min(size, TAIL_BYTES)
  const buf = Buffer.alloc(len)
  const fd = fs.openSync(file, 'r')
  try {
    fs.readSync(fd, buf, 0, len, size - len)
  } finally {
    fs.closeSync(fd)
  }
  return buf.toString('utf8')
}

function lastAssistantTier(file) {
  let lines
  try {
    lines = readTail(file).split('\n')
  } catch {
    return null
  }

  for (let i = lines.length - 1; i >= 0; i--) {
    let entry
    try {
      entry = JSON.parse(lines[i])
    } catch {
      continue
    }
    if (entry.type !== 'assistant') continue
    const tier = tierOf(entry.message && entry.message.model)
    if (tier) return tier
  }

  return null
}

function agentTranscript(data) {
  if (!data.agent_id || !data.scratchpad_dir) return null
  return path.join(path.dirname(data.scratchpad_dir), 'tasks', `${data.agent_id}.output`)
}

function parentTier(data) {
  const own = agentTranscript(data)
  if (own) return lastAssistantTier(own)
  if (!data.transcript_path) return null
  return lastAssistantTier(data.transcript_path)
}

let input = ''
process.stdin.setEncoding('utf8')
process.stdin.on('data', d => {
  input += d
})
process.stdin.on('end', () => {
  let data
  try {
    data = JSON.parse(input)
  } catch {
    process.exit(0)
  }
  if (data.tool_name !== 'Agent') process.exit(0)

  const toolInput = data.tool_input || {}
  const model = String(toolInput.model ?? '').trim()

  if (String(toolInput.subagent_type ?? '') === 'fork') {
    deny(
      `A fork inherits the parent model and ignores \`model\`, so it cannot be routed or capped. Spawn a fresh agent with an explicit model instead — ${RULE}.`,
    )
  }

  if (!model) {
    deny(
      `Agent call with no explicit \`model\`. An omitted model inherits this session's model, usually the most expensive one. Pass model: "haiku" | "sonnet" | "opus" — ${RULE}.`,
    )
  }

  const child = tierOf(model)

  if (child === 'fable') {
    deny(`Fable is never a subagent model. Pick "haiku", "sonnet" or "opus" — ${RULE}.`)
  }
  if (!child) process.exit(0)

  const parent = parentTier(data)
  if (!parent || parent === 'fable') process.exit(0)

  if (LADDER.indexOf(child) > LADDER.indexOf(parent)) {
    deny(
      `Subagent model "${model}" is above the parent (${parent}); a subagent runs at the parent's tier or below (haiku → sonnet → opus). Do the work here, or stop and report that the task needs an agent this one may not spawn — ${RULE}.`,
    )
  }

  process.exit(0)
})
