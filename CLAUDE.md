# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository Purpose

This is a macOS dotfiles repository that bootstraps a complete development environment. It configures Fish shell, Git, window management (yabai), keyboard shortcuts (skhd), custom fonts (Iosevka), and terminal/IDE themes (Ayu).

## Setup

Run the bootstrap script (requires Full Disk Access for Terminal):

```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/dempfi/config/main/setup.sh)"
```

Or run locally:

```bash
./setup.sh
```

## Architecture

### Configuration Structure

- `.config/` - XDG-style configs symlinked to `~/.config/`
- `.claude/` - Claude Code agent layer: settings, hooks, and rules (see below)
- `.codex/` - Codex instruction files, copied to `~/.codex/`
- `font/` - Custom Iosevka TTF fonts (copied to `~/Library/Fonts/`)
- `themes/` - iTerm2 (.itermcolors) themes; Xcode themes are installed from [ayu-theme/ayu-xcode](https://github.com/ayu-theme/ayu-xcode)
- `setup.sh` - Main bootstrap script that installs Homebrew packages, copies configs, and sets macOS preferences

### AI Agent Layer

Shared engineering instructions live in `.config/agents/engineering.md`; both `.claude/CLAUDE.md`
and `.codex/AGENTS.md` are thin files that include it, so Claude Code and Codex work from one
source of truth.

Third-party skills are **declared, not vendored**. `.config/agents/skills.tsv` maps each skill to
the upstream repo and path it comes from, and `install-skills.sh` shallow-clones each repo once
and copies the listed paths into place. A skill whose upstream path has moved is reported and
skipped rather than silently missing, so a rename upstream surfaces as a line to fix in the
manifest. Two destinations:

- `shared` → `~/.agents/skills/`, the tool-agnostic location. Claude Code does not read it
  directly, so anything living there is symlinked into `~/.claude/skills/`.
- `claude` → `~/.claude/skills/`, Claude Code only.

Skills written here rather than pulled from upstream live in `.config/agents/skills/`, beside the
instructions they encode. They install to the shared location and are symlinked into Claude Code,
so a rule stated once in `engineering.md` and a skill that applies it stay in the same directory
and reach every tool.

Skills installed by an enabled plugin are not listed here — the plugin already carries them, and
listing them again would install a second copy that shadows the plugin's.

`.claude/` splits into three kinds of artifact:

- `.claude/settings.json` - the shareable half of Claude Code settings: hooks, permissions,
  plugins, model and UI preferences. It is **merged** into `~/.claude/settings.json` rather than
  copied, so machine-local keys (API keys under `.env`, per-project auto-mode entries) survive a
  re-bootstrap. Tracked keys win on conflict; arrays are replaced wholesale. `__HOME__` is
  substituted at install time — keep absolute paths out of the tracked file.
- `.claude/rules/` - prose rules Claude Code loads into every session. They state a constraint
  and the reason it must hold; they are advisory, and the hooks below are what enforce them.
- `.claude/hooks/` - Node scripts wired to `PreToolUse`/`PostToolUse`/`SessionStart`. A hook exits
  0 to allow and prints a block message to deny, so it is the only layer that can actually stop a
  tool call. Two families:
  - **LSP-first** (`lsp-*.js`, `bash-grep-block.js`) - refuse symbol lookups done by text search,
    naming the LSP call to use instead. `lib/detect-lsp-provider.js` resolves which provider is
    live (Serena, cclsp, native LSP) so the suggestion is callable rather than generic. Read gates
    escalate with a per-project counter in `~/.claude/state/`, reset each session.
  - **Guardrails** (`no-*.cjs`, `no-comments-guard.js`) - block comment authoring, source edits
    smuggled through Bash, `git add -A`, session links and AI attribution in commits and PRs, and
    every write path into Slack. `no-comments-guard.md` documents the language table and the
    `.claude/allow-comments` escape hatch; `no-comments-guard.test.sh` is its test suite.

A hook that crashes fails open, so each one coerces its inputs and exits 0 on anything it cannot
parse. Changing that means the guard silently stops guarding.

### Fish Shell Functions

The Fish prompt system in `.config/fish/functions/` uses interconnected git helper functions:

- `fish_prompt.fish` - Main prompt; calls `git_branch_name` and `git_is_dirty`
- `fish_right_prompt.fish` - Right prompt showing command duration and git upstream status via `git_upstream_status`
- `git_branch_name.fish` - Returns current branch name
- `git_is_dirty.fish` - Returns `*` if working tree has changes
- `git_upstream_status.fish` - Shows ahead/behind counts relative to upstream
- `git_is_repo.fish`, `git_is_stashed.fish`, `git_is_staged.fish`, `git_is_touched.fish` - Status helpers

### Key Homebrew Dependencies

Installed by setup.sh: fish, asdf (version manager), yabai, skhd, iTerm2, VS Code
