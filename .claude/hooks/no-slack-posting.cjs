#!/usr/bin/env node
'use strict'

const BLOCKED_TOOLS = /_(?:send_message|schedule_message|add_reaction|create_canvas|update_canvas|create_conversation|post_message|upload_file)$/

const SLACK_TOOL = /slack/i

const SLACK_WRITE_API =
  /slack\.com\/api\/(?:chat\.(?:postMessage|postEphemeral|scheduleMessage|update|meMessage|delete)|files\.(?:upload|completeUpload|uploadV2)|reactions\.add|conversations\.(?:create|invite|archive|setTopic|setPurpose)|canvases\.[a-z]|assistant\.threads\.setStatus|pins\.add|bookmarks\.add)/i

const SLACK_WEBHOOK = /hooks\.slack\.com\/(?:services|workflows|triggers)\//i

const SLACK_CLI = /\bslack\s+(?:chat|message|msg)\s+(?:send|post)\b/i

const BROWSER_WRITE = /\bagent-browser\b/i
const BROWSER_WRITE_VERB = /\b(?:type|fill|press|click|keys?|submit|paste)\b/i
const SLACK_HOST = /\b(?:app\.)?slack\.com\b/i

function deny(what, detail) {
  const message =
    `\n⛔ Slack posting blocked — ${what}.\n\n` +
    (detail ? `${detail}\n\n` : '') +
    `Nothing may be posted to Slack from this session: no messages, replies, scheduled\n` +
    `sends, reactions, canvases, new conversations, webhook payloads, or messages typed\n` +
    `into Slack through a browser.\n\n` +
    `Why: a Slack post is irreversible and lands in front of people who never saw the\n` +
    `conversation that produced it. Deciding what to say to colleagues, and when, is the\n` +
    `user's call, not something delegated to a session.\n\n` +
    `Instead: put the text in your response, or in a file, and let the user send it.\n` +
    `Reading Slack (search, channel and thread reads, profiles) is unaffected, and a\n` +
    `send-message draft the user has to approve and send themselves is still allowed.\n`

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
  const tool = payload.tool_name || ''

  if (SLACK_TOOL.test(tool)) {
    if (BLOCKED_TOOLS.test(tool)) {
      deny(`${tool} writes to Slack`)
    }
    process.exit(0)
  }

  const cmd = (payload.tool_input || {}).command || ''
  if (!cmd.trim()) process.exit(0)

  if (SLACK_WEBHOOK.test(cmd)) deny('the command posts to a Slack incoming webhook')
  if (SLACK_WRITE_API.test(cmd)) deny('the command calls a Slack write API method')
  if (SLACK_CLI.test(cmd)) deny('the command sends a Slack message via CLI')
  if (BROWSER_WRITE.test(cmd) && SLACK_HOST.test(cmd) && BROWSER_WRITE_VERB.test(cmd)) {
    deny(
      'the command drives a browser to type into Slack',
      'Navigating and reading Slack in the browser is fine; entering text is not.'
    )
  }

  process.exit(0)
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
