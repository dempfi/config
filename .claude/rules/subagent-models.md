# Subagent models (CRITICAL)

Every Agent call passes `model` explicitly. An omitted model inherits the session's model, usually the most expensive one, and silently defeats the routing below.

Never run a subagent on Fable. A `fork` inherits the parent model, so with Fable as the parent a fork is a Fable subagent: never fork. Spawn a fresh agent with an explicit model instead.

## Never above the parent

A subagent's model is capped by the model of the agent that spawns it: pick the parent's tier or below, never above. A `sonnet` agent that spawns an `opus` subagent turns a delegation that was chosen for being cheap into an expensive one, invisibly, and the spend never passes the main context that decided the budget.

The ladder, cheapest first: `haiku` → `sonnet` → `opus`. Fable sits outside it and is never a subagent model at all.

When the routing below calls for a tier above the parent, the subagent is the wrong instrument. Do the work in the parent, or stop and report that the task needs a more capable agent than this one may spawn, and let the main context dispatch it. Escalation obeys the same ceiling: an escalation that would cross above the parent's tier goes back to the main context instead of up.

`~/.claude/hooks/subagent-model-guard.cjs` denies an `Agent` call that omits `model`, asks for a fork, names Fable, or sits above the parent's tier. The hook payload carries no model, so the parent's tier is recovered from the transcript of whoever is spawning — inside a subagent that is the agent's own transcript, never the main session's, which records a different and usually more capable model. When the parent's tier cannot be determined the call is allowed: a guard that cannot see the parent must not block the work, and the rule above is what holds there.

## Routing

Use the least capable model that can do the task well.

**Turn count beats token price.** Cost and wall-clock scale with how many turns an agent takes, and a weaker model routinely takes more turns on multi-step work, gets things subtly wrong, or has to be rerun, and ends up costing more overall. A wrong result that looks right costs the most, because it is acted on.

- **`sonnet` — mechanical work.** Touches 1–2 files with a complete spec; the brief contains the exact code to write, so the job is transcription plus tests; a single-file mechanical fix; a search or lookup; a scripted verification; a render or tuning loop against a numeric check; a scoped re-review of a small fix diff.
- **`opus` — integration and judgment.** Touches multiple files with integration concerns; works from a prose description rather than exact code; debugging; pattern matching across the codebase; reviews, scaled to the diff's size, complexity, and risk; writing prompts or user-facing prose; diagnosing from traces or logs. `opus` is the floor for reviewers and for implementers working from prose.
- **The most capable model available — architecture and design.** Design judgment, broad codebase understanding, and the final review of a whole change. That is the main context, or `opus` when a fresh context is the point, as in a final review.

When unsure between two tiers, take the higher one, up to the parent's ceiling.

**Escalation** goes one tier above the model that got stuck, never a blind retry on the same one.
