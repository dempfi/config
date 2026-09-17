# swift-lsp-quiet

SourceKit-LSP for Swift code navigation — definitions, references, hover, symbols — with diagnostics kept out of the conversation.

SourceKit-LSP resolves a project through its build server, and until that resolves, every file reports the project's own types as missing. Pushed after each edit, those reports cost context and say nothing true. Compile errors come from the build instead: Xcode's `XcodeRefreshCodeIssuesInFile` or `BuildProject`.

Enable this plugin in place of `swift-lsp@claude-plugins-official`, not alongside it; both would start a server for `.swift` files.
