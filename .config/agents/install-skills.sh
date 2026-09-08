#!/bin/bash
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
MANIFEST="${1:-$HERE/skills.tsv}"
OWN_SKILLS="$HERE/skills"
SHARED_DIR="$HOME/.agents/skills"
CLAUDE_DIR="$HOME/.claude/skills"
CHECKOUTS="$(mktemp -d)"
trap 'rm -rf "$CHECKOUTS"' EXIT

mkdir -p "$SHARED_DIR" "$CLAUDE_DIR"

checkout() {
  local repo="$1" dir="$CHECKOUTS/${1//\//__}"
  if [ ! -d "$dir" ]; then
    git clone --depth 1 --quiet "https://github.com/$repo.git" "$dir" || return 1
  fi
  printf '%s' "$dir"
}

while IFS=$'\t' read -r dest repo subpath name; do
  case "$dest" in ''|'#'*) continue ;; esac

  case "$dest" in
    shared) target="$SHARED_DIR/$name" ;;
    claude) target="$CLAUDE_DIR/$name" ;;
    *) echo "  skip $name — unknown destination '$dest'" >&2; continue ;;
  esac

  if ! src="$(checkout "$repo")"; then
    echo "  skip $name — could not clone $repo" >&2
    continue
  fi

  if [ ! -d "$src/$subpath" ]; then
    echo "  skip $name — $repo no longer has $subpath" >&2
    continue
  fi

  rm -rf "$target"
  cp -R "$src/$subpath" "$target"
  echo "  $dest/$name"
done < "$MANIFEST"

for skill in "$OWN_SKILLS"/*/; do
  [ -d "$skill" ] || continue
  name="$(basename "$skill")"
  rm -rf "${SHARED_DIR:?}/$name"
  cp -R "$skill" "$SHARED_DIR/$name"
  ln -snf "$SHARED_DIR/$name" "$CLAUDE_DIR/$name"
  echo "  shared/$name (local)"
done

ln -snf "$SHARED_DIR/agent-browser" "$CLAUDE_DIR/agent-browser"
