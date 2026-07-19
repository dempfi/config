Never add "Co-Authored-By" lines to git commit messages or GitHub PR descriptions.

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

**Comments explain the code, not your reasoning.** A code comment states what the code means or does that the code itself can't show — an invariant, a non-obvious constraint, a unit, a gotcha. It never narrates why you chose this approach, the alternatives you weighed, or the investigation that led there; that belongs in the commit message or PR description, not the source. Don't leak your reasoning into comments, and don't restate what the code already shows.

## Code search

Three tools, reached in this order:

**LSP** is available when a language server is configured for the file type. Use it for any **symbol** query — "where is X defined", "who calls Y", "what does Z return", "find all references", "rename". Operations: `goToDefinition`, `findReferences`, `hover`, `documentSymbol`, `workspaceSymbol`, `goToImplementation`, `incomingCalls`, `outgoingCalls`. Returns structured refs (1-5 lines) instead of grep noise.

**ast-grep** for **structural** queries that text can't cleanly express — call shape, control flow, type position, AST context ("all `foo(_, literal)` calls", "`if let Some(x) = …` blocks", codemods). Use `ast-grep --lang <lang> -p '<pattern>'`.

**rg / grep** for **lexical** queries — locating a string, import, error message, anything where the answer is "where does this token appear." Faster for non-code files and unparseable sources.

Rule of thumb: symbol → LSP, syntax → ast-grep, text → rg.
