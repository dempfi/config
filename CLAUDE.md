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
- `font/` - Custom Iosevka TTF fonts (copied to `~/Library/Fonts/`)
- `themes/` - iTerm2 (.itermcolors) themes; Xcode themes are installed from [ayu-theme/ayu-xcode](https://github.com/ayu-theme/ayu-xcode)
- `setup.sh` - Main bootstrap script that installs Homebrew packages, copies configs, and sets macOS preferences

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
