#!/bin/bash
HOOK="node $HOME/.claude/hooks/no-comments-guard.js"
DIR="$(cd "$(dirname "$0")" && pwd)"
PASS=0; FAIL=0

run() {
  local name="$1"; local want="$2"; local payload="$3"
  local out; out=$(printf '%s' "$payload" | $HOOK 2>/dev/null); local code=$?
  local got="pass"; [ $code -eq 2 ] && got="block"
  if [ "$got" = "$want" ]; then PASS=$((PASS+1)); printf '  ok    %-52s %s\n' "$name" "$got"
  else FAIL=$((FAIL+1)); printf '  FAIL  %-52s want=%s got=%s\n' "$name" "$want" "$got"; fi
}

j() { node -e '
const [file, tool, field, val, old] = process.argv.slice(1)
const ti = { file_path: file }
if (tool === "Write") ti.content = val
else if (tool === "NotebookEdit") { delete ti.file_path; ti.notebook_path = file; ti.new_source = val }
else { ti.old_string = old || ""; ti.new_string = val }
process.stdout.write(JSON.stringify({ tool_name: tool, cwd: process.env.TDIR, tool_input: ti }))
' "$@"; }

export TDIR="$DIR"

echo "— authored comments must block —"
run "ts line comment"        block "$(j /x/a.ts Edit s '  // build the prompt from the window')"
run "ts block comment"       block "$(j /x/a.ts Edit s '/*
 * why we do this
 */')"
run "jsdoc"                  block "$(j /x/a.ts Edit s '/** Returns the merged window. */')"
run "jsx comment"            block "$(j /x/a.tsx Edit s '      {/* the sidebar */}')"
run "python hash"            block "$(j /x/a.py Edit s '# helper for the loop')"
run "svelte html comment"    block "$(j /x/a.svelte Edit s '<!-- keeps the scrim stable -->')"
run "rust doc comment"       block "$(j /x/a.rs Edit s '/// Parses the footer.')"
run "sql dash"               block "$(j /x/a.sql Edit s '-- pick the active path')"
run "yaml hash"              block "$(j /x/a.yml Edit s '# the build step')"
run "new file via Write"     block "$(j /x/new.ts Write '' 'const a = 1
// explain a')"
run "notebook cell"          block "$(j /x/a.ipynb NotebookEdit '' '# load the frame
df = read()')"
run "multi-line // run"      block "$(j /x/a.go Edit s '// first line of prose
// second line of prose')"

echo
echo "— directives and non-comments must pass —"
run "eslint-disable"         pass "$(j /x/a.ts Edit s '// eslint-disable-next-line no-console')"
run "ts-expect-error"        pass "$(j /x/a.ts Edit s '// @ts-expect-error legacy shape')"
run "jsdoc @type"            pass "$(j /x/a.js Edit s "/** @type {import('vite').Plugin} */")"
run "vitest environment"     pass "$(j /x/a.test.ts Edit s '// @vitest-environment jsdom')"
run "shebang"                pass "$(j /x/run.sh Write '' '#!/usr/bin/env bash
set -e')"
run "python noqa"            pass "$(j /x/a.py Edit s 'import os  # noqa')"
run "go:build"               pass "$(j /x/a.go Edit s '//go:build linux')"
run "svelte-ignore"          pass "$(j /x/a.svelte Edit s '<!-- svelte-ignore a11y-no-onclick -->')"
run "SPDX"                   pass "$(j /x/a.rs Edit s '// SPDX-License-Identifier: MIT')"
run "prettier-ignore"        pass "$(j /x/a.ts Edit s '// prettier-ignore')"
run "plain code"             pass "$(j /x/a.ts Edit s 'const windowSize = 12')"
run "url in string"          pass "$(j /x/a.ts Edit s "const u = 'https://example.com'")"
run "markdown skipped"       pass "$(j /x/a.md Edit s '<!-- a doc note -->')"
run "json skipped"           pass "$(j /x/a.json Edit s '// nope')"
run "python docstring"       pass "$(j /x/a.py Edit s '\"\"\"Return the frame.\"\"\"')"
BT=$(printf '\140')
run "line inside template"   pass "$(j /x/a.ts Edit s "const t = ${BT}
// not a comment
${BT}")"
run "template then real comment" block "$(j /x/a.ts Edit s "const t = ${BT}hi${BT}
// this one is real")"
run "notebook markdown cell"  pass "$(node -e 'process.stdout.write(JSON.stringify({tool_name:"NotebookEdit",tool_input:{notebook_path:"/x/a.ipynb",cell_type:"markdown",new_source:"# Heading"}}))')"
run "gitignore skipped"      pass "$(j /x/.gitignore Edit s '# build output')"
run "delete-mode notebook"   pass "$(node -e 'process.stdout.write(JSON.stringify({tool_name:"NotebookEdit",tool_input:{notebook_path:"/x/a.ipynb",edit_mode:"delete",cell_id:"c1"}}))')"

echo
echo "— preserved comments must pass —"
run "comment kept from old"  pass "$(j /x/a.ts Edit s 'const a = 1
// build the prompt' '// build the prompt')"
run "comment reindented"     pass "$(j /x/a.ts Edit s '    // build   the prompt' '// build the prompt')"
run "line-run rewrapped"     pass "$(j /x/a.ts Edit s '// build the prompt from
// the warm window' '// build the prompt
// from the warm window')"

echo
printf '\n%d passed, %d failed\n' "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ]
