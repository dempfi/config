#!/bin/bash
HOOK="node $HOME/.claude/hooks/no-large-read.cjs"
PASS=0; FAIL=0
T="$(mktemp -d)"
trap 'rm -rf "$T"' EXIT

run() {
  local name="$1"; local want="$2"; local payload="$3"
  printf '%s' "$payload" | $HOOK >/dev/null 2>&1; local code=$?
  local got="pass"; [ $code -eq 2 ] && got="block"
  if [ "$got" = "$want" ]; then PASS=$((PASS+1)); printf '  ok    %-44s %s\n' "$name" "$got"
  else FAIL=$((FAIL+1)); printf '  FAIL  %-44s want=%s got=%s\n' "$name" "$want" "$got"; fi
}

j() { node -e '
const [file, offset, limit, pages] = process.argv.slice(1)
const ti = { file_path: file }
if (offset) ti.offset = Number(offset)
if (limit) ti.limit = Number(limit)
if (pages) ti.pages = pages
process.stdout.write(JSON.stringify({ tool_name: "Read", tool_input: ti }))
' "$@"; }

lines() { node -e 'const [f, n, nl] = process.argv.slice(1); require("fs").writeFileSync(f, Array.from({ length: Number(n) }, (_, i) => "line " + i).join("\n") + (nl === "no" ? "" : "\n"))' "$@"; }

lines "$T/small.ts" 10
lines "$T/edge.ts" 300
lines "$T/edge-no-newline.ts" 300 no
lines "$T/over.ts" 301
lines "$T/big.swift" 2000
head -c 200000 /dev/zero > "$T/blob.dat"
cp "$T/big.swift" "$T/looks-like.png"

echo "— whole-file reads of long text files must block —"
run "301 lines, no range"                  block "$(j "$T/over.ts")"
run "2000 lines, no range"                 block "$(j "$T/big.swift")"

echo
echo "— short files, explicit ranges and non-text must pass —"
run "10 lines"                             pass "$(j "$T/small.ts")"
run "exactly 300 lines"                    pass "$(j "$T/edge.ts")"
run "300 lines without trailing newline"   pass "$(j "$T/edge-no-newline.ts")"
run "long file with limit"                 pass "$(j "$T/big.swift" '' 120)"
run "long file with offset"                pass "$(j "$T/big.swift" 400)"
run "long file with offset and limit"      pass "$(j "$T/big.swift" 400 80)"
run "image extension"                      pass "$(j "$T/looks-like.png")"
run "pdf with pages"                       pass "$(j "$T/doc.pdf" '' '' 1-5)"
run "binary content"                       pass "$(j "$T/blob.dat")"
run "missing file"                         pass "$(j "$T/nope.ts")"
run "malformed payload"                    pass "not json"

printf '\n%d passed, %d failed\n' "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ]
