# Delegate heavy, self-contained work to a subagent (CRITICAL)

Subagents exist to cut token spend. A subagent runs work whose output the main conversation will never need again, in a context that holds only its brief and its own results, on the cheapest model that can do that work well, and the main conversation receives one short conclusion. Decisions, and everything that needs the conversation's accumulated context, stay in the main context.

## The trade

Every request re-reads the whole conversation. A round of work kept in the main context pays for everything above it, and whatever it produces stays in context for every request after it.

A subagent avoids that but starts empty. It re-reads files, re-runs setup, and rediscovers what the main context already knew. Anything the brief leaves out is lost, including the reasons behind decisions already made. Every agent spawned pays this cold start again.

Delegate only when isolation saves more than the cold start costs. When a script or a single command can do the job, run that instead; no agent beats it.

## Delegate when both hold

- **The work is heavy.** It produces output the main context will never need again (screenshots, logs, build output, diffs, eval dumps), or it runs many rounds.
- **The brief is small.** The agent can start from a few named files and a command, not from understanding built up over the conversation.

Typical fits: render a preview → compare → tweak; tune a value against an eval or a baseline; clear a long list of failures of one kind; profile → attribute → change → re-profile; a sweep through many files for one fact; verifying finished work against a written spec, which needs none of the history of how the work was built.

## Keep inline when any holds

- **The loop is short.** A few rounds with small output, such as a test that fails once or a build error with an obvious fix.
- **The work leans on context already loaded.** Files read, a design settled, a bug understood. Briefing an agent means paying to rebuild all of it.
- **The pieces are coupled.** A change whose parts depend on each other's decisions stays with one worker.
- **It is a single check** that confirms a finished change.
- **It is a decision that belongs to the user**, or a loop whose every round ends in a product judgment that would come back for a decision anyway.

## Split by context, not by phase

One agent owns a piece of work end to end. Never chain a planning agent, an implementing agent, a testing agent, and a reviewing agent over the same change: each handoff drops the reasons behind the last agent's choices, and the next one works blind. The one handoff that loses nothing is verification against a spec.

Run agents in parallel only when their work is disjoint — no shared files, no shared question. Use the fewest agents that isolate the heavy work: at most three running at once. Many small items of one kind go to one agent as a batch, never one agent each.

## Model

Route every agent by [[subagent-models]]: `sonnet` for mechanical work, `opus` for integration and judgment, the most capable model available for architecture and design. Never fork.

## The brief

The main context decides; the agent executes. Settle what to change and what done means before dispatch.

The brief stands on its own: the goal, the files, the instruments (commands, previews, scripts, baselines), the acceptance check with numbers, a cap on rounds, what not to touch, and when to stop and report instead of guessing. It is closed: the agent reads what the brief names, runs what it names, and does nothing else.

## The return

The agent writes its full report to a file in the scratchpad directory and replies with only:

- a status: done, done with concerns, blocked, or needs context
- the paths changed
- the measured result against the acceptance check
- what failed or was skipped, and open questions
- the report file's path

No logs, no diffs, no images in the reply.

A report is a claim. Check anything surprising, decision-changing, or favorable to the approach being tested against the artifact it cites before acting on it.

## Follow-up rounds

A round is one fix plus the check that confirms it. Five rounds at most per task.

- **Rounds 1–3: resume the same agent** with SendMessage and the open problems verbatim. Its context is intact: it knows the task, the code, and its own choices. A fresh agent pays the cold start again.
- **Rounds 4–5: a fresh agent one tier up** per [[subagent-models]], carrying the brief, the report file, and the open problems, told that a prior agent attempted the task and the report file records what was tried. An agent still failing after three rounds usually cannot see its own problem; fresh eyes and more capability address both at once.
- **Every round** appends to the same report file, so the file is the memory whether the agent is resumed or replaced.
- **Needs context:** send it and resume. **Blocked:** go one tier up, or re-plan in the main context.
- **After round 5**, stop dispatching. Decide the open problems in the main context, or bring them to the user.

## Finishing

- **Confirm cheaply:** one build, one test run, or one numeric check in the main context, never a rerun of the work.
- **Project gates still apply.** A delegated run waits on the same spend and approval gates as one run in the main context.
