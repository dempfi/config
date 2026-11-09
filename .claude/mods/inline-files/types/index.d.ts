export type OpenFiles = Record<string, boolean>

declare module 'claude-code' {
  interface PluginState {
    'inline-files': { open: OpenFiles }
  }
}
