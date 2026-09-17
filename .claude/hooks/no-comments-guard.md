# no-comments-guard

A `PreToolUse` hook on `Write`/`Edit`/`MultiEdit`/`NotebookEdit` that refuses any file write in
which Claude authors a new code comment. Registered globally in `~/.claude/settings.json`, so it
applies in every project and to subagents.

## What it guarantees

Claude cannot land a comment it wrote. The block is an `exit 2`, so it holds regardless of which
hook-output shape a given Claude Code version prefers, and the refusal text tells Claude to resend
the identical edit minus the comment rather than to rephrase it or reach for another tool.

## What it deliberately does not block

**Machine directives.** `eslint-disable`, `@ts-expect-error`, `# noqa`, `# type: ignore`,
`//go:build`, shebangs, `SPDX-`, `@vitest-environment`, `prettier-ignore`, `/** @type {...} */` and
their kin are syntax the toolchain reads, not prose. Stripping them changes what the program does.

**Comments Claude did not write.** A comment already present — in the edit's `old_string`, elsewhere
in the file on disk, or anywhere in the notebook — is baseline. Re-indenting, relocating, or
reflowing it passes; only text with no counterpart in the baseline counts as authored. Comparison is
on whitespace-collapsed comment bodies with consecutive line-comments merged, so a Prettier rewrap
does not read as new authorship.

**Trailing comments and unknown file types.** Detection keys on a line whose first non-whitespace
token opens a comment. `x = 1 // why` survives, as does any extension not in the language table
(Markdown and JSON are excluded on purpose). This under-blocks by design: a false block taxes every
legitimate edit, while a missed trailing comment costs nothing but a comment.

**Writes that do not go through the file tools.** A heredoc, `sed`, or a script run via `Bash` is an
unguarded path. That is a known gap, not an oversight — guarding it would mean parsing arbitrary
shell. The refusal text names the bypass so Claude does not discover it by accident.

## Escape hatch

Create `.claude/allow-comments` in the working directory (per-project) or in `$HOME` (everywhere) and
the hook stands down. Only a human can create it — the hook refuses the write that would author the
comment, not the file that disables the hook, so Claude cannot clear its own path. Delete the file to
re-arm; no restart needed.

To relax the policy instead of disabling it, flip `BLOCK_DOC_COMMENTS` at the top of the script and
JSDoc / rustdoc / `///` doc comments become allowed while ordinary prose comments stay blocked.

Python triple-quoted docstrings are string literals rather than comments and are never blocked.

## Note

This is stricter than `~/.config/agents/engineering.md`, which permits a comment that states an
invariant, a unit, or a non-obvious constraint. The guard admits no such exception; the constant
above is the one line that reintroduces it for doc comments.

## Tests

`bash ~/.claude/hooks/no-comments-guard.test.sh` — pipes synthetic hook payloads at the script and
asserts block/pass per case. Run it after touching the language table or the directive allowlist.
