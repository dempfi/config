#!/usr/bin/env node
'use strict';

/**
 * lsp-session-reset.js — SessionStart hook
 *
 * Wipes stale LSP navigation state for the current cwd at session start.
 *
 * Without this, `nav_count` persists for 24h across sessions (see
 * lsp-first-read-guard.js FLAG_EXPIRY_MS). A new session can inherit
 * "surgical mode" (nav_count >= 2) from previous work and freely Read
 * code files without ever calling LSP — a full bypass of the LSP-first
 * enforcement chain.
 *
 * After reset:
 *   - Gate 1 (warmup): first code Read BLOCKED until mcp__cclsp__get_diagnostics
 *   - Gate 4: read #4 BLOCKED unless nav_count >= 1
 *   - Gate 5: read #6 BLOCKED unless nav_count >= 2
 *
 * Side-effect: first session call forces one warmup (~1 LSP call). Cheap.
 */

const fs = require('fs');
const state = require('./lib/lsp-state');

let raw = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', d => { raw += d; });
process.stdin.on('end', () => {
  let data = {};
  try {
    data = JSON.parse(raw || '{}');
  } catch {}

  try {
    fs.unlinkSync(state.flagPath(data));
  } catch {}

  process.exit(0);
});
