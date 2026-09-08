---
name: pr-description
description: Write or rewrite a pull request description (also PR body, PR summary, `gh pr create`/`gh pr edit` text, or the description for a stacked/draft PR). Use whenever you are about to open a PR, update an existing PR's description, or the user says "write the PR description", "open a PR", "PR body", "summarize this branch for review", or asks you to clean up a bloated PR description. Produces a compact description of what the PR contains and why, with no development history or archaeology.
---

# PR descriptions

A PR description exists to get the diff reviewed. It states what the branch changes and what a reviewer must judge. Nothing else.

## Shape

Default to this, and drop any section that would be empty:

```markdown
One or two sentences: what this changes and why it must change.

## What changed
- <area/module>: <the change, stated as behavior now, not as a diff walkthrough>
- ...

## Notes for review
- <a decision a reviewer should push back on, a tradeoff taken, a risk>
- <migration/rollout/config step, if any>
```

A one-line PR gets a one-line description — no headings at all. Scale the description to the diff, never to the effort it took.

## Rules

**Present tense, current state.** Describe what the branch does, not what you did to it. "Tracking-param URLs are noindexed" — not "I added a check that noindexes...".

**No archaeology.** The branch's development history is in the commits; the reasoning is in the review thread. The description must not contain: what you tried first, what was reverted, what a previous approach did, "initially / originally / used to / turns out / after some debugging", commit-by-commit narration, session or transcript links, dates, or an AI-attribution footer. A reviewer who has never seen the branch's history must lose nothing.

**No restating the diff.** Do not list every file, every renamed symbol, or the call chain. Anchor to modules and behavior; the diff already shows the lines. If a bullet only tells the reviewer what they would see in the first ten seconds of scrolling, cut it.

**Say why, once.** The intent — the bug it fixes, the guarantee it adds, the constraint it satisfies — is the one thing the diff cannot show. Put it in the opening sentences and do not repeat it under every heading.

**Link, don't transcribe.** Reference the issue or ticket by ID; do not paste its contents. Reference an external spec by URL rather than summarizing it.

**Numbers only when they are the point.** A benchmark that justifies the change stays. Measurement transcripts, sample counts, and "before/after" tables from your own iteration go in a comment if the reviewer asks, not in the description.

**No filler.** No "This PR...", no restating the title, no "Testing: ran the tests", no emoji headers, no checklists the repo template does not ask for. If the repo has a PR template, fill its sections and add nothing beyond them.

**Screenshots for visual changes only**, and only the after state unless the before is genuinely needed to see the fix.

## Before posting

Read the description back and ask of every line: *would a reviewer act differently without it?* If not, delete the line. A shorter description that gets read beats a complete one that gets skimmed.
