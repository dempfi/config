'use strict';

/**
 * detect-lsp-provider.js — shared helper for LSP enforcement hooks
 *
 * Detects which LSP provider is active and maps navigation intents to
 * the correct tool calls.
 *
 * Supports:
 *   - serena  (plugin: serena@claude-plugins-official — query-by-name API, LLM-friendly)
 *   - native  (Claude Code built-in LSP tool via typescript-lsp plugin — position-based)
 *   - cclsp   (standalone MCP server — legacy)
 *
 * Preference order: serena > native > cclsp
 * Serena is preferred because it accepts symbol names directly, making it far
 * more useful for LLM-driven navigation than the position-based native LSP tool.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const HOME = os.homedir();

// ── Provider registry ──────────────────────────────────────────────────────
const PROVIDERS = {
  // serena: query-by-name API — the LLM-friendly option
  // Installed as plugin (mcp__plugin_serena_serena__*), or standalone (mcp__serena__*)
  serena: {
    label:      'Serena',
    prefix:     'mcp__plugin_serena_serena__',
    matchToken: 'serena',
    tools: {
      definition:     'find_declaration',
      references:     'find_referencing_symbols',
      symbol_search:  'find_symbol',
      implementation: 'find_implementations',
      hover:          null,
      diagnostics:    'get_diagnostics_for_file',
      incoming_calls: 'find_referencing_symbols',
      outgoing_calls: null,
      overview:       'get_symbols_overview',
    },
    warmup: { tool: 'get_symbols_overview', note: "lists file's top-level symbols" },
  },
  // native: position-based LSP tool — useful for hover/precise navigation
  native: {
    label:      'LSP',
    prefix:     'LSP_NATIVE',  // sentinel — handled specially in formatSuggestionLine
    matchToken: 'LSP_NATIVE',
    tools: {
      definition:     'goToDefinition',
      references:     'findReferences',
      symbol_search:  'workspaceSymbol',
      implementation: 'goToImplementation',
      hover:          'hover',
      diagnostics:    null,
      incoming_calls: 'incomingCalls',
      outgoing_calls: 'outgoingCalls',
      overview:       'documentSymbol',
    },
    warmup: { tool: 'documentSymbol', note: 'lists file symbols, primes LSP index' },
  },
  // cclsp: legacy standalone MCP server
  cclsp: {
    label:      'cclsp',
    prefix:     'mcp__cclsp__',
    matchToken: 'cclsp',
    tools: {
      definition:     'find_definition',
      references:     'find_references',
      symbol_search:  'find_workspace_symbols',
      implementation: 'find_implementation',
      hover:          'get_hover',
      diagnostics:    'get_diagnostics',
      incoming_calls: 'get_incoming_calls',
      outgoing_calls: 'get_outgoing_calls',
    },
    warmup: { tool: 'get_diagnostics', note: 'primes TS server' },
  },
};

// ── Config-file readers ────────────────────────────────────────────────────
function readJsonSilent(filePath) {
  try {
    if (!fs.existsSync(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function collectMcpServerNames() {
  const names = new Set();
  const candidates = [
    path.join(HOME, '.claude.json'),
    path.join(HOME, '.claude', 'settings.json'),
    path.join(HOME, '.claude', 'mcp.json'),
    path.join(HOME, '.mcp.json'),
    path.join(process.cwd(), '.mcp.json'),
  ];

  for (const p of candidates) {
    const data = readJsonSilent(p);
    const servers = data?.mcpServers;
    if (servers && typeof servers === 'object') {
      for (const name of Object.keys(servers)) {
        names.add(String(name).toLowerCase());
      }
    }
  }

  return names;
}

function hasBundledTypescriptLspPlugin() {
  const settings = readJsonSilent(path.join(HOME, '.claude', 'settings.json'));
  return Boolean(settings?.enabledPlugins?.['typescript-lsp@claude-plugins-official']);
}

function hasBundledSerenaPlugin() {
  const settings = readJsonSilent(path.join(HOME, '.claude', 'settings.json'));
  return Boolean(settings?.enabledPlugins?.['serena@claude-plugins-official']);
}

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Returns array of active provider keys in preference order.
 * Serena is listed first when available — it's query-by-name and more LLM-friendly.
 */
function detectProviders() {
  const active = [];
  const mcpNames = collectMcpServerNames();

  // Serena: plugin or standalone — query-by-name, preferred
  if (hasBundledSerenaPlugin() || mcpNames.has('serena')) {
    active.push('serena');
  }

  // Native: typescript-lsp plugin (position-based, good for hover/precise nav)
  if (hasBundledTypescriptLspPlugin() && !mcpNames.has('cclsp')) {
    active.push('native');
  }

  // cclsp: legacy standalone
  if (mcpNames.has('cclsp')) {
    active.push('cclsp');
  }

  return active;
}

/**
 * Format a single suggestion line for a provider + symbol + intent.
 * Native LSP uses operation-based syntax; MCP providers use call syntax.
 */
function formatSuggestionLine(key, prov, symbol, intent, indent) {
  const toolName = prov.tools[intent] || prov.tools.symbol_search;
  if (!toolName) return null;

  if (key === 'native') {
    return `${indent}LSP(operation: "${toolName}", filePath: "<file where ${symbol} appears>", line: N, character: N)`;
  }

  if (key === 'serena') {
    return `${indent}${prov.prefix}${toolName}(name_path_pattern: "${symbol}")`;
  }

  return `${indent}${prov.prefix}${toolName}("${symbol}")  (${prov.label})`;
}

/**
 * Build a multi-line suggestion block for a given symbol and navigation intent.
 */
function buildSuggestion(symbol, intent, indent = '  ') {
  const providers = detectProviders();

  if (providers.length === 0) {
    return `${indent}LSP(operation: "workspaceSymbol", filePath: "<any project file>", line: 1, character: 1)  (enable typescript-lsp plugin)`;
  }

  const lines = [];
  for (const key of providers) {
    const prov = PROVIDERS[key];
    if (!prov) continue;
    const line = formatSuggestionLine(key, prov, symbol, intent, indent);
    if (line) lines.push(line);
  }
  return lines.join('\n');
}

/**
 * Get warmup call instructions for Gate 1 in lsp-first-read-guard.js.
 */
function buildWarmupInstructions(indent = '  ') {
  const providers = detectProviders();

  if (providers.length === 0) {
    return [
      `${indent}Enable the typescript-lsp plugin to activate native LSP.`,
      `${indent}Then call: LSP(operation: "workspaceSymbol", filePath: "<any project file>", line: 1, character: 1)`,
    ];
  }

  const lines = [];
  for (const key of providers) {
    const prov = PROVIDERS[key];
    if (!prov?.warmup) continue;
    if (key === 'native') {
      lines.push(`${indent}LSP(operation: "documentSymbol", filePath: "<any project file>")`);
      lines.push(`${indent}  → ${prov.warmup.note}`);
    } else {
      lines.push(`${indent}${prov.prefix}${prov.warmup.tool}(<any project file>)`);
      lines.push(`${indent}  → ${prov.warmup.note}`);
    }
  }
  return lines;
}

/**
 * Build a warmup call for the specific file the agent is about to Read.
 */
function buildFileWarmupCall(filePath, indent = '  ') {
  if (!filePath) return '';
  const providers = detectProviders();
  if (providers.length === 0) return '';
  const safeFile = String(filePath).replace(/"/g, '\\"');
  const lines = [];
  for (const key of providers) {
    const prov = PROVIDERS[key];
    if (!prov?.warmup) continue;
    if (key === 'native') {
      lines.push(`${indent}LSP(operation: "documentSymbol", filePath: "${safeFile}")`);
    } else {
      lines.push(`${indent}${prov.prefix}${prov.warmup.tool}("${safeFile}")  (${prov.label})`);
    }
  }
  return lines.join('\n');
}

/**
 * Returns a regex fragment matching tool_name strings for all known providers.
 */
function getTrackerToolNameRegex() {
  // Native LSP is just 'LSP'; cclsp uses mcp__ prefix
  return 'LSP|' + Object.values(PROVIDERS)
    .filter(p => p.prefix !== 'LSP_NATIVE')
    .map(p => `mcp__(?:plugin_[^_]+_)?${p.matchToken}__`)
    .join('|');
}

// Pre-compile plugin-wrapped regexes for MCP providers
const PLUGIN_WRAPPED_RE = new Map();
for (const key of Object.keys(PROVIDERS)) {
  const token = PROVIDERS[key].matchToken;
  if (token === 'LSP_NATIVE') continue;
  PLUGIN_WRAPPED_RE.set(token, new RegExp(`^mcp__plugin_[^_]+_${token}__`));
}

/**
 * Check whether a tool_name string belongs to any known LSP provider.
 *   'LSP'                             → true (native)
 *   'mcp__cclsp__find_definition'     → true (cclsp standalone)
 */
function isLspProviderTool(toolName) {
  if (!toolName || typeof toolName !== 'string') return false;
  // Native LSP tool
  if (toolName === 'LSP') return true;
  // MCP-based providers
  if (!toolName.startsWith('mcp__')) return false;
  for (const key of Object.keys(PROVIDERS)) {
    const token = PROVIDERS[key].matchToken;
    if (token === 'LSP_NATIVE') continue;
    if (toolName.startsWith(`mcp__${token}__`)) return true;
    const pluginRegex = PLUGIN_WRAPPED_RE.get(token);
    if (pluginRegex && pluginRegex.test(toolName)) return true;
  }
  return false;
}

/**
 * Build structured suggestion objects for programmatic consumers.
 */
function buildStructuredSuggestions(symbol, intent) {
  const providers = detectProviders();
  const out = [];
  const safeSym = String(symbol).replace(/"/g, '\\"');
  for (const key of providers) {
    const prov = PROVIDERS[key];
    if (!prov) continue;
    const toolName = prov.tools[intent] || prov.tools.symbol_search;
    if (!toolName) continue;

    if (key === 'native') {
      out.push({
        provider:    key,
        label:       prov.label,
        tool:        'LSP',
        args:        { operation: toolName },
        displayTool: `LSP(operation: "${toolName}", filePath: "<file where ${safeSym} appears>", line: N, character: N)`,
      });
    } else if (key === 'serena') {
      out.push({
        provider:    key,
        label:       prov.label,
        tool:        `${prov.prefix}${toolName}`,
        args:        { name_path_pattern: String(symbol) },
        displayTool: `${prov.prefix}${toolName}(name_path_pattern: "${safeSym}")`,
      });
    } else {
      out.push({
        provider:    key,
        label:       prov.label,
        tool:        `${prov.prefix}${toolName}`,
        args:        { query: String(symbol) },
        displayTool: `${prov.prefix}${toolName}("${safeSym}")`,
      });
    }
  }
  return out;
}

/**
 * Assemble a structured block response for blocking hooks.
 */
function buildStructuredBlockResponse({ hook, symbols, intent, reason }) {
  const providers = detectProviders();
  const suggestions = [];
  const symbolList = Array.isArray(symbols) ? symbols : [];
  for (const sym of symbolList) {
    for (const s of buildStructuredSuggestions(sym, intent)) {
      suggestions.push({ symbol: String(sym), ...s });
    }
  }
  return {
    decision: 'block',
    reason:   String(reason ?? ''),
    hook:     String(hook ?? ''),
    symbols:  symbolList.map(String),
    intent:   String(intent ?? ''),
    providers,
    suggestions,
  };
}

module.exports = {
  PROVIDERS,
  detectProviders,
  buildSuggestion,
  buildWarmupInstructions,
  buildFileWarmupCall,
  getTrackerToolNameRegex,
  isLspProviderTool,
  buildStructuredSuggestions,
  buildStructuredBlockResponse,
};
