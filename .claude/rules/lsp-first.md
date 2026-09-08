# LSP-First Navigation (CRITICAL)

Two complementary tools are available. Use Serena first — it's query-by-name and LLM-friendly. Fall back to native LSP for position-based operations.

## Serena (preferred — query by name)

| Task | Tool |
|------|------|
| Find symbol definition | `mcp__plugin_serena_serena__find_declaration("SymbolName")` |
| Find all references | `mcp__plugin_serena_serena__find_referencing_symbols("SymbolName")` |
| Search for symbol | `mcp__plugin_serena_serena__find_symbol("SymbolName")` |
| Find implementations | `mcp__plugin_serena_serena__find_implementations("InterfaceName")` |
| All symbols in a file | `mcp__plugin_serena_serena__get_symbols_overview("path/to/file.ts")` |
| File diagnostics | `mcp__plugin_serena_serena__get_diagnostics_for_file("path/to/file.ts")` |

## Native LSP (position-based — for hover and precise navigation)

All operations require `filePath`, `line`, `character` (1-based, no query parameter).

| Task | Operation |
|------|-----------|
| Type/doc info at cursor | `hover` |
| Go to definition at position | `goToDefinition` |
| Find references at position | `findReferences` |
| All symbols in workspace | `workspaceSymbol` |

## Rule

Grep/Glob = fallback ONLY when both LSP tools return empty or the target is non-symbol text (logs, configs, docs).
