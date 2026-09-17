#!/usr/bin/env node
'use strict';

/**
 * lsp-usage-tracker.js — PostToolUse hook
 *
 * Tracks successful LSP-provider calls in ~/.claude/state/lsp-ready-<hash>.
 * Sibling hook lsp-first-read-guard.js reads this state to make gate
 * decisions.
 *
 * Provider-aware: counts calls from any known LSP MCP server (cclsp,
 * Serena, ...) via ./lib/detect-lsp-provider.js — not hardcoded to cclsp.
 */

const { isLspProviderTool } = require('./lib/detect-lsp-provider');
const state = require('./lib/lsp-state');

// cclsp-specific upstream bug (ktnyt/cclsp#43). Serena has its own LSP
// wrapper and doesn't hit this class of error — skip the hint for non-cclsp.
function isColdStartError(resp) {
  const s = typeof resp === 'string' ? resp : JSON.stringify(resp || {});
  return /No Project\.|ThrowNoProject|TypeScript Server Error|Server not initialized|Project not loaded|tsserver.*starting|LSP server.*not ready/i.test(s);
}

function isAnyError(resp) {
  if (!resp) return true;
  if (resp.is_error === true || resp.isError === true || resp.error) return true;
  if (Array.isArray(resp.content)) {
    for (const item of resp.content) {
      if (item && (item.is_error === true || item.isError === true)) return true;
      if (item && item.type === 'tool_result_error') return true;
    }
  }
  const s = typeof resp === 'string' ? resp : JSON.stringify(resp);
  if (/^Error[: ]|Error searching|Error finding|Error at /i.test(s)) return true;
  // NOTE: an empty object/array is a legitimate "found nothing" result (e.g.
  // documentSymbol on a file with no top-level symbols, or a cold-indexing
  // rust-analyzer that hasn't populated yet) -- not a failed call. Treating
  // it as an error left warmup_done permanently unset whenever the first
  // warmup call happened to return empty, forcing the same blocked-retry
  // loop every Read.
  return false;
}

let raw = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', d => { raw += d; });
process.stdin.on('end', () => {
  try {
    const data = JSON.parse(raw);
    const toolName = data.tool_name || '';
    if (!isLspProviderTool(toolName)) process.exit(0);

    const resp = data.tool_response || data.result || {};

    // Cold-start hint only for cclsp (upstream bug)
    if (toolName.startsWith('mcp__cclsp__') && isColdStartError(resp)) {
      const isSymbolSearch = toolName.includes('find_workspace_symbols');
      console.log(JSON.stringify({ systemMessage:
        `⚠️ cclsp "No Project" error (known upstream bug ktnyt/cclsp#43)\n\n` +
        `${isSymbolSearch ? 'find_workspace_symbols does NOT prime the project context.\n' : ''}` +
        `Fix: call mcp__cclsp__get_diagnostics(<any .ts file>) first, then retry.\n` +
        `This is an ordering bug, not a timing issue. Do NOT fall back to Grep.`
      }));
      process.exit(0);
    }

    if (isAnyError(resp)) process.exit(0);

    const existing = state.readFlag(data) || {
      cwd: process.cwd(), warmup_done: false, nav_count: 0, read_count: 0, read_files: [],
    };

    if (!existing.warmup_done) {
      existing.warmup_done = true;
      existing.cold_start_retries = 0;
    } else {
      existing.nav_count = (existing.nav_count || 0) + 1;
    }

    if (state.isEmptyResult(resp)) existing.last_empty_at = Date.now();
    existing.timestamp = Date.now();
    existing.last_tool = toolName;
    state.writeFlag(data, existing);
  } catch {}
  process.exit(0);
});
