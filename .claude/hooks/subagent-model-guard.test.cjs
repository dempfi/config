#!/usr/bin/env node
'use strict'

const { execFileSync } = require('child_process')
const fs = require('fs')
const os = require('os')
const path = require('path')

const HOOK = path.join(__dirname, 'subagent-model-guard.cjs')
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'subagent-model-guard-'))

const assistant = (model, isSidechain) =>
  JSON.stringify({ type: 'assistant', isSidechain, message: { model } })

const transcript = (name, lines) => {
  const file = path.join(dir, name)
  fs.writeFileSync(file, lines.join('\n') + '\n')
  return file
}

const run = payload => {
  const out = execFileSync('node', [HOOK], { input: JSON.stringify(payload), encoding: 'utf8' })
  if (!out.trim()) return null
  return JSON.parse(out).hookSpecificOutput.permissionDecision
}

const mainOpus = transcript('main-opus.jsonl', [assistant('claude-opus-5', false)])
const mainSonnet = transcript('main-sonnet.jsonl', [assistant('claude-sonnet-5', false)])
const mainHaiku = transcript('main-haiku.jsonl', [assistant('claude-haiku-4-5-20251001', false)])
fs.mkdirSync(path.join(dir, 'tasks'))
fs.mkdirSync(path.join(dir, 'scratchpad'))
const scratchpad = path.join(dir, 'scratchpad')
transcript(path.join('tasks', 'sonnet-agent.output'), [assistant('claude-sonnet-5', true)])

const agent = tool_input => ({ tool_name: 'Agent', transcript_path: mainOpus, tool_input })
const at = (payload, extra) => Object.assign({}, payload, extra)
const inAgent = (agent_id, payload) =>
  at(payload, { agent_id, agent_type: 'general-purpose', scratchpad_dir: scratchpad })

const cases = [
  ['non-Agent tool is ignored', { tool_name: 'Bash', tool_input: { command: 'ls' } }, null],
  ['missing model is denied', agent({ prompt: 'x' }), 'deny'],
  ['empty model is denied', agent({ prompt: 'x', model: '  ' }), 'deny'],
  ['fork is denied', agent({ prompt: 'x', subagent_type: 'fork', model: 'sonnet' }), 'deny'],
  ['fable is denied', agent({ prompt: 'x', model: 'fable' }), 'deny'],
  ['opus under opus parent is allowed', agent({ prompt: 'x', model: 'opus' }), null],
  [
    'opus under sonnet parent is denied',
    at(agent({ prompt: 'x', model: 'opus' }), { transcript_path: mainSonnet }),
    'deny',
  ],
  [
    'sonnet under haiku parent is denied',
    at(agent({ prompt: 'x', model: 'sonnet' }), { transcript_path: mainHaiku }),
    'deny',
  ],
  [
    'sonnet under sonnet parent is allowed',
    at(agent({ prompt: 'x', model: 'sonnet' }), { transcript_path: mainSonnet }),
    null,
  ],
  ['haiku under opus parent is allowed', agent({ prompt: 'x', model: 'haiku' }), null],
  [
    'a sonnet agent spawning opus is denied, not read off the opus main thread',
    inAgent('sonnet-agent', agent({ prompt: 'x', model: 'opus' })),
    'deny',
  ],
  [
    'a sonnet agent spawning sonnet is allowed',
    inAgent('sonnet-agent', agent({ prompt: 'x', model: 'sonnet' })),
    null,
  ],
  [
    'a sonnet agent spawning haiku is allowed',
    inAgent('sonnet-agent', agent({ prompt: 'x', model: 'haiku' })),
    null,
  ],
  [
    'an agent with no transcript of its own fails open',
    inAgent('no-such-agent', agent({ prompt: 'x', model: 'opus' })),
    null,
  ],
  [
    'unreadable transcript fails open',
    at(agent({ prompt: 'x', model: 'opus' }), { transcript_path: path.join(dir, 'missing.jsonl') }),
    null,
  ],
  [
    'absent transcript path fails open',
    { tool_name: 'Agent', tool_input: { prompt: 'x', model: 'opus' } },
    null,
  ],
]

let failed = 0
for (const [name, payload, want] of cases) {
  const got = run(payload)
  const ok = got === want
  if (!ok) failed++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  (want ${want}, got ${got})`}`)
}

fs.rmSync(dir, { recursive: true, force: true })
console.log(failed ? `\n${failed} failing` : `\n${cases.length} passing`)
process.exit(failed ? 1 : 0)
