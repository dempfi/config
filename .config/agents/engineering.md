Never add "Co-Authored-By" lines to git commit messages or GitHub PR descriptions.

Never use Playwright (`playwright-cli`, the Playwright MCP, or the Playwright plugin) for browser automation — use `agent-browser` instead.

`agent-browser` shares one daemon across every agent and terminal on this machine. Each caller gets its own session, preset via `AGENT_BROWSER_SESSION` — never override it, and never run `close --all`, which kills the other callers' browsers too. Close your own with `agent-browser close`.

Under Codex, Chrome cannot start inside the seatbelt sandbox, so `agent-browser` always runs escalated — approve it once with the prefix rule `["agent-browser"]`. Codex skips prefix-rule matching for any command segment containing `$(...)`, a `FOO=bar` prefix, redirection, or a glob, and re-prompts for it every time; write plain `agent-browser …` segments with literal flags. `&&` chains match per segment and are fine.

## How I work — engineering methodology

These override default helpfulness instincts.

**Measure, don't ask.** Faced with a choice — model, threshold, design, architecture — build the variants and bring numbers, failures, and a diagnosis, not "A or B?". Only ask on a genuine product/values call no experiment can settle.

**Be honest about the numbers.** Separate measured from estimated; name every eval-to-prod gap (distribution, sample size, proxy-vs-live, aggregate-vs-exact); never quote a favorable-condition or synthetic-data number as the production number — it's an upper bound until measured live. If a target isn't reachable, say so and why.

**Fix the ruler before chasing the number.** If the eval/gold disagrees with reality, fix it first — don't tune the system to mimic stale labels. Hand-judge a sample of failures before blaming the system over the eval; re-gold blind, by majority vote, when in doubt.

**Fix upstream first.** Wrong output? Check the input before tuning the component. The biggest wins come from fixing what feeds the broken thing. Prefer a safe fallback over a confident wrong answer.

**Cost always.** Never default to the expensive path (per-item LLM call, heavyweight model) when embeddings, a classifier, retrieval, or a small model might do — think cost per million invocations. The expensive option is a last-resort tiebreak, used only if it *measurably* beats the tuned cheap one. Once something's shown not to help, don't reintroduce it without new evidence.

**Red/Green TDD, by default.** Tests first, on any feature or bugfix, unasked. For non-deterministic code (LLM, fuzzy matching), assert precision/recall thresholds against a labeled dataset of real production data, not exact equality on synthetic inputs. For prompts: simple output formats, absorb harmless variation in code over over-prompting, validate external identifiers before writing them.

**No change-detector tests.** A test's failure must mean behavior broke. If a failing assertion can only mean "someone edited the config/literal it mirrors," it has negative value — it taxes every intended change and stays green through real breakage. Never deep-equal a config/data literal back at itself. Data gets **invariant** tests (facts that must survive any deliberate edit, each commented with its why); code gets **behavior** tests on synthetic fixtures decoupled from prod data shape; never re-assert per prod-data instance a mechanism a synthetic test already covers. Before every assertion ask: "if this fails, what broke?" — if the answer is "the configuration changed," delete it.

**Effort in t-shirt sizes** (XS–XL), never time units, everywhere effort comes up.

**Don't write comments.** Write code that reads without them. What you were about to explain goes in the commit message or the PR description, not the source. Match the comment density of the file you're editing — which, in a file you are adding to, means adding none. Leave existing comments alone unless the code under them changed and made them wrong.

**Docs carry intent; specs may carry mechanism; neither restates the code.** Three layers, and each belongs in exactly one place. **Intent** — what this is for, what it must guarantee, what it deliberately refuses to do, what breaks if you change it — is what documentation exists to hold, because it is the one thing the source cannot tell you. **Mechanism** — how the thing works, described conceptually — is legitimate in a spec or design doc. **Code artifacts** — function and symbol names, file paths, call order, signatures — belong in the source, never transcribed into prose: a doc that walks `a() → b() → c()` is a stale rename away from lying, and a reader learns more from the code it paraphrases. Anchor to modules and directories (and their READMEs), which rot slowly; never to a call chain, which rots on every refactor. Reference *data* the code cannot supply — external vocabularies, event taxonomies, config keys, price bands — is content, not restatement, and stays. When rewriting a doc toward intent, SOURCE the intent from the existing prose, module READMEs, or commit history; if it cannot be sourced, write a shorter honest doc rather than inventing a rationale.

**Archaeology lives in git — not in the source, and not in the docs.** How something got this way is already recorded in commits, PRs and the issue tracker, so it must not be duplicated anywhere else: comments, test names, fixture headers, docstrings, specs, design docs, READMEs. Documentation states what is true NOW and why it must be — never what changed, when, what it replaced, or what was tried first. A doc written as a changelog decays into a list of claims a reader cannot tell apart from the current ones. That means **no** session/message/turn/commit ids, dates, ticket refs, "previously / used to / was tried / re-added / re-locked", A/B results, measurement transcripts (`4/6`, `n=4`, `~140 tok`, `measured 2026-…`), or before/after framing. State the behavior in the present tense and the constraint that makes it necessary — if a past failure is the reason a guard exists, describe **the failure the guard prevents**, not when it happened or where it was found. Keep a number only when the number *is* the constraint (a budget, threshold, price band, unit), never when it is the evidence. Write it so a reader who has never seen the git history loses nothing.

## Code search

Three tools, reached in this order:

**LSP** is available when a language server is configured for the file type. Use it for any **symbol** query — "where is X defined", "who calls Y", "what does Z return", "find all references", "rename". Operations: `goToDefinition`, `findReferences`, `hover`, `documentSymbol`, `workspaceSymbol`, `goToImplementation`, `incomingCalls`, `outgoingCalls`. Returns structured refs (1-5 lines) instead of grep noise.

**ast-grep** for **structural** queries that text can't cleanly express — call shape, control flow, type position, AST context ("all `foo(_, literal)` calls", "`if let Some(x) = …` blocks", codemods). Use `ast-grep --lang <lang> -p '<pattern>'`.

**rg / grep** for **lexical** queries — locating a string, import, error message, anything where the answer is "where does this token appear." Faster for non-code files and unparseable sources.

Rule of thumb: symbol → LSP, syntax → ast-grep, text → rg.
