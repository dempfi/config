#!/usr/bin/env bash
# Claude Code statusLine — ported from ~/.config/fish/functions/fish_prompt.fish
# Shows: cwd (dimmed, prompt_pwd-style abbreviation) + git branch/dirty/staged markers,
# ahead/behind arrows, stash count, then weekly (7-day) Claude Code usage. No trailing
# prompt arrow — a statusline has no live exit status to report, unlike a shell prompt.

input=$(cat)
cwd=$(printf '%s' "$input" | jq -r '.cwd // .workspace.current_dir // empty')
[ -z "$cwd" ] && cwd="$PWD"

RESET='\033[0m'
GREY='\033[38;2;171;176;182m'   # #ABB0B6 — matches fish prompt's cwd color
GREEN='\033[32m'
YELLOW='\033[33m'
RED='\033[31m'
BOLD='\033[1m'

# Repeat a (possibly multibyte) glyph n times — printf/tr can't, since they count bytes.
bar_repeat() { local n=$1 ch=$2 out=''; while [ "$n" -gt 0 ]; do out="$out$ch"; n=$(( n - 1 )); done; printf '%s' "$out"; }

# prompt_pwd-style abbreviation: parent segments -> first char, last segment kept full,
# $HOME -> ~ (e.g. /Users/dempfi/Developer/paramour -> ~/D/paramour)
abbreviate_path() {
  local path="$1" home="$HOME" prefix="" out="" seg i n
  local -a segs

  if [ "$path" = "$home" ]; then
    printf '~'
    return
  fi
  if [ "$path" = "/" ]; then
    printf '/'
    return
  fi

  case "$path" in
    "$home"/*)
      prefix="~"
      path="${path#"$home"/}"
      ;;
    /*)
      path="${path#/}"
      ;;
  esac

  local IFS='/'
  read -ra segs <<< "$path"
  n=${#segs[@]}
  out="$prefix"
  i=0
  for seg in "${segs[@]}"; do
    i=$((i + 1))
    if [ "$i" -eq "$n" ]; then
      out="$out/$seg"
    else
      out="$out/${seg:0:1}"
    fi
  done
  printf '%s' "$out"
}

pwd_display=$(abbreviate_path "$cwd")

# Git: branch + staged/dirty markers + ahead/behind + stash, scoped to cwd (not process cwd),
# optional locks skipped so the statusline never blocks a concurrent git command.
git_segment=""
if git -C "$cwd" --no-optional-locks rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  g() { git -C "$cwd" --no-optional-locks "$@" 2>/dev/null; }

  branch=$(g symbolic-ref --quiet --short HEAD)
  detached=false
  if [ -z "$branch" ]; then
    detached=true
    branch=$(g rev-parse --short HEAD)
  fi

  is_staged=false
  g diff --cached --quiet || is_staged=true
  is_dirty=false
  g diff --quiet || is_dirty=true

  marker=""
  if $is_staged && $is_dirty; then
    marker="± "
  elif $is_staged; then
    marker="+ "
  elif $is_dirty; then
    marker="╍ "
  fi

  color="$GREEN"
  if $is_staged || $is_dirty; then
    color="$YELLOW"
  fi

  display_branch="($branch)"
  if $detached; then
    color="$RED"
    display_branch="→$display_branch"
  fi

  right=""
  counts=$(g rev-list --left-right --count 'HEAD...@{upstream}')
  if [ -n "$counts" ]; then
    ahead=$(printf '%s' "$counts" | awk '{print $1}')
    behind=$(printf '%s' "$counts" | awk '{print $2}')
    [ "${ahead:-0}" -gt 0 ] 2>/dev/null && right="↑ $ahead"
    if [ "${behind:-0}" -gt 0 ] 2>/dev/null; then
      [ -n "$right" ] && right="$right "
      right="${right}↓ $behind"
    fi
  fi

  stash_count=$(g stash list | wc -l | tr -d ' ')
  if [ -n "$stash_count" ] && [ "$stash_count" -gt 0 ] 2>/dev/null; then
    right="⟀${stash_count}${right:+ $right}"
  fi

  git_segment=$(printf "%s${BOLD}${color}%s${RESET}" "$marker" "$display_branch")
  [ -n "$right" ] && git_segment="$git_segment $right"
fi

# Weekly (7-day, all-models) usage — Claude Code's own cached /usage snapshot in
# ~/.claude.json. The CLI writes this cache (it can't be polled from here without the
# OAuth token); it refreshes it roughly per turn, so during idle/long turns it goes stale.
# We read it every statusline refresh and, when the cache is older than STALE_AFTER, append
# a dim "↺<age>" sync marker so a stale number reads as stale rather than silently current.
# Color follows the severity the CLI computed (threshold fallback). Omitted if cache absent.
usage_segment=""
usage_file="$HOME/.claude.json"
STALE_AFTER=3600  # seconds (1h); staleness is only flagged once it's hours old, shown in hours
BAR_W=10          # progress-bar width in cells (each cell = 10%)
if [ -f "$usage_file" ]; then
  usage_raw=$(jq -r '.cachedUsageUtilization as $c | $c.utilization as $u
    | "\($u.seven_day.utilization // "")|\(($u.limits // [] | map(select(.kind=="weekly_all")) | first | .severity) // "")|\($c.fetchedAtMs // "")"' \
    "$usage_file" 2>/dev/null)
  IFS='|' read -r wk_pct wk_sev wk_fetched <<< "$usage_raw"
  if [ -n "$wk_pct" ] && [ "$wk_pct" != "null" ]; then
    case "$wk_sev" in
      critical) ucolor="$RED" ;;
      warning)  ucolor="$YELLOW" ;;
      normal)   ucolor="$GREEN" ;;
      *)
        if   [ "$wk_pct" -ge 85 ] 2>/dev/null; then ucolor="$RED"
        elif [ "$wk_pct" -ge 60 ] 2>/dev/null; then ucolor="$YELLOW"
        else ucolor="$GREEN"; fi ;;
    esac

    stale_suffix=""
    if [ -n "$wk_fetched" ] && [ "$wk_fetched" != "null" ]; then
      age_s=$(( $(date +%s) - wk_fetched / 1000 ))
      if [ "$age_s" -gt "$STALE_AFTER" ] 2>/dev/null; then
        if [ "$age_s" -lt 86400 ]; then human="$(( age_s / 3600 ))h"
        else                            human="$(( age_s / 86400 ))d"; fi
        stale_suffix=$(printf " ${GREY}↺ %s${RESET}" "$human")
      fi
    fi

    # Progress bar: BAR_W parallelogram segments (10% each). Filled run in the severity
    # color, empty segments dimmed — e.g. "wk ▰▰▰▰▰▰▱▱▱▱ 63%". Integer part only for the math.
    wk_int="${wk_pct%%.*}"; [ -z "$wk_int" ] && wk_int=0
    filled=$(( (wk_int * BAR_W + 50) / 100 ))
    [ "$filled" -gt "$BAR_W" ] && filled=$BAR_W
    [ "$filled" -lt 0 ] && filled=0
    empty=$(( BAR_W - filled ))
    bar="$(bar_repeat "$filled" '▰')"
    track="$(bar_repeat "$empty" '▱')"
    usage_segment=$(printf "${GREY}wk ${RESET}${ucolor}%s${RESET}${GREY}%s %s%%${RESET}%s" \
      "$bar" "$track" "$wk_pct" "$stale_suffix")
  fi
fi

printf "${GREY}%s${RESET}" "$pwd_display"
[ -n "$git_segment" ] && printf ' %s' "$git_segment"
[ -n "$usage_segment" ] && printf ' %s' "$usage_segment"
printf '\n'
