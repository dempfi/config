#!/bin/bash
REPO_GIT="$(cd "$(dirname "$0")" && pwd)"
PASS=0; FAIL=0
T="$(mktemp -d)"
trap 'rm -rf "$T"' EXIT

expect() {
  local name="$1"; local want="$2"; local got="$3"
  if [ "$got" = "$want" ]; then PASS=$((PASS+1)); printf '  ok    %-52s %s\n' "$name" "$got"
  else FAIL=$((FAIL+1)); printf '  FAIL  %-52s want=%s got=%s\n' "$name" "$want" "$got"; fi
}

home() {
  local h="$T/$1"
  mkdir -p "$h/.config/git" "$h/.config/gh" "$h/.config/gh-work" "$h/Developer/toptal"
  cp "$REPO_GIT/config" "$REPO_GIT/toptal.config" "$REPO_GIT/ignore" "$h/.config/git/"
  echo "$h"
}

logged_in() { printf 'github.com:\n    users:\n        %s:\n    user: %s\n' "$2" "$2" > "$1/hosts.yml"; }

work_identity() { printf '[user]\n\tname = Work\n\temail = work@example.com\n\tuseConfigOnly = true\n' > "$1/.config/git/toptal.local.config"; }

check() { HOME="$1" bash "$REPO_GIT/identities.sh" check >/dev/null 2>&1; [ $? -eq 0 ] && echo complete || echo incomplete; }

in_repo() {
  local dir="$1"; shift
  mkdir -p "$dir" && (cd "$dir" && HOME="$H" XDG_CONFIG_HOME= GIT_CONFIG_NOSYSTEM=1 git init -q 2>/dev/null; HOME="$H" XDG_CONFIG_HOME= GIT_CONFIG_NOSYSTEM=1 git "$@")
}

gh_dir() { in_repo "$1" config --get-all credential.https://github.com.helper | tail -1 | sed -E 's/.*GH_CONFIG_DIR=\$HOME\/\.config\/([^ ]+) .*/\1/'; }

echo "— a restore missing any identity piece must be reported —"
H="$(home bare)"
expect "fresh restore"                                   incomplete "$(check "$H")"
logged_in "$H/.config/gh" dempfi; logged_in "$H/.config/gh-work" work
expect "both logins, no work commit identity"            incomplete "$(check "$H")"
: > "$H/.config/git/toptal.local.config"
expect "empty work commit identity"                      incomplete "$(check "$H")"
work_identity "$H"; rm "$H/.config/gh-work/hosts.yml"
expect "work identity, no work login"                    incomplete "$(check "$H")"
logged_in "$H/.config/gh-work" work; rm "$H/.config/gh/hosts.yml"
expect "work identity, no personal login"                incomplete "$(check "$H")"
printf 'github.com:\n    git_protocol: https\n' > "$H/.config/gh/hosts.yml"
expect "personal hosts file without a user"              incomplete "$(check "$H")"
logged_in "$H/.config/gh" dempfi
expect "everything in place"                             complete   "$(check "$H")"

echo
echo "— work identity applies under ~/Developer/toptal only —"
H="$(home resolve)"; work_identity "$H"
expect "email inside toptal"                             work@example.com "$(in_repo "$H/Developer/toptal/app" config user.email)"
expect "email in nested toptal repo"                     work@example.com "$(in_repo "$H/Developer/toptal/a/b" config user.email)"
expect "email outside toptal"                            mail@dempfi.com  "$(in_repo "$H/Developer/other" config user.email)"
expect "email in sibling named like toptal"              mail@dempfi.com  "$(in_repo "$H/Developer/toptal-fork" config user.email)"
expect "GitHub account inside toptal"                    gh-work "$(gh_dir "$H/Developer/toptal/app")"
expect "GitHub account outside toptal"                   gh      "$(gh_dir "$H/Developer/other")"
expect "ssh remote inside toptal goes over https"        https://github.com/org/r.git "$(in_repo "$H/Developer/toptal/app" ls-remote --get-url git@github.com:org/r.git)"
expect "ssh remote outside toptal stays ssh"             git@github.com:org/r.git     "$(in_repo "$H/Developer/other" ls-remote --get-url git@github.com:org/r.git)"

printf '\n%d passed, %d failed\n' "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ]
