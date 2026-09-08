# Never post to Slack (CRITICAL)

Nothing may be posted to Slack from a session. This covers every route:

- Slack MCP tools that write: sending a message or reply, scheduling one, adding a reaction, creating or updating a canvas, creating a conversation
- Slack Web API write methods (`chat.postMessage`, `chat.update`, `files.upload`, `reactions.add`, `conversations.create`, canvas endpoints) called from a shell
- incoming webhooks on the Slack hooks host
- typing into Slack through browser automation

Reading Slack is allowed and unaffected — search, channel and thread reads, profiles, canvas reads.

Why: a Slack post is irreversible and lands in front of people who never saw the conversation that produced it, with no way to judge whether the moment or the framing is right. Deciding what to say to colleagues, and when, is the user's call.

When something needs to reach Slack, write the text into the response or a file and hand it to the user. A send-message draft that the user must review and send themselves is the one acceptable Slack-side path.

This holds even when a message seems obviously wanted — a status update, an answer to someone who asked, a link to a finished PR. If the user asks directly for something to be posted, say that posting is blocked here and give them the text to send.

Related: [[no-session-links]].
