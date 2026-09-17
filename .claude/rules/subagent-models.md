# Subagent models (CRITICAL)

Every Agent call passes `model` explicitly. An omitted model inherits the session's model, usually the most expensive one, and silently defeats the routing below.

Never run a subagent on Fable. A `fork` inherits the parent model, so with Fable as the parent a fork is a Fable subagent: never fork. Spawn a fresh agent with an explicit model instead.

## Routing

Use the least capable model that can do the task well.

**Turn count beats token price.** Cost and wall-clock scale with how many turns an agent takes, and a weaker model routinely takes more turns on multi-step work, gets things subtly wrong, or has to be rerun, and ends up costing more overall. A wrong result that looks right costs the most, because it is acted on.

- **`sonnet` — mechanical work.** Touches 1–2 files with a complete spec; the brief contains the exact code to write, so the job is transcription plus tests; a single-file mechanical fix; a search or lookup; a scripted verification; a render or tuning loop against a numeric check; a scoped re-review of a small fix diff.
- **`opus` — integration and judgment.** Touches multiple files with integration concerns; works from a prose description rather than exact code; debugging; pattern matching across the codebase; reviews, scaled to the diff's size, complexity, and risk; writing prompts or user-facing prose; diagnosing from traces or logs. `opus` is the floor for reviewers and for implementers working from prose.
- **The most capable model available — architecture and design.** Design judgment, broad codebase understanding, and the final review of a whole change. That is the main context, or `opus` when a fresh context is the point, as in a final review.

When unsure between two tiers, take the higher one.

**Escalation** goes one tier above the model that got stuck, never a blind retry on the same one.
