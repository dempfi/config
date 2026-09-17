#!/bin/bash
set -u

GIT_CONF="$HOME/.config/git"
WORK_LOCAL="$GIT_CONF/toptal.local.config"

logged_in() { grep -Eq '^[[:space:]]+user: [^[:space:]]' "$HOME/.config/$1/hosts.yml" 2>/dev/null; }

missing() {
  [ -s "$WORK_LOCAL" ] || echo "work commit identity ($WORK_LOCAL)"
  logged_in gh || echo "personal GitHub login (~/.config/gh)"
  logged_in gh-work || echo "work GitHub login (~/.config/gh-work)"
}

check() {
  local gaps
  gaps="$(missing)"
  [ -z "$gaps" ] && return 0
  echo "$gaps"
  return 1
}

login() {
  GH_CONFIG_DIR="$HOME/.config/$1" gh auth status >/dev/null 2>&1 && return
  echo "Log in to GitHub as $2"
  GH_CONFIG_DIR="$HOME/.config/$1" gh auth login --hostname github.com --git-protocol https --web
}

setup() {
  mkdir -p "$HOME/Developer/toptal"

  if [ ! -s "$WORK_LOCAL" ]; then
    local email=""
    while [ -z "$email" ]; do
      read -r -p "Work git email for ~/Developer/toptal: " email
    done
    printf '[user]\n\tname = Ike Kurghinyan\n\temail = %s\n\tuseConfigOnly = true\n' "$email" > "$WORK_LOCAL"
    chmod 600 "$WORK_LOCAL"
  fi

  local tracked
  tracked="$(mktemp)"
  cp "$GIT_CONF/config" "$tracked"
  login gh dempfi
  login gh-work ikekurghinyan
  cp "$tracked" "$GIT_CONF/config"
  rm -f "$tracked"

  echo "  personal: $(GH_CONFIG_DIR="$HOME/.config/gh" gh api user -q .login)"
  echo "  work:     $(GH_CONFIG_DIR="$HOME/.config/gh-work" gh api user -q .login)"
  check
}

case "${1:-}" in
  check) check ;;
  setup) setup ;;
  *) echo "usage: $0 check|setup" >&2; exit 2 ;;
esac
