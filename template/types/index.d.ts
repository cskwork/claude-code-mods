// The mod's state contract: every `$.state` value the module names, under the mod's name.
export type ModTemplateTurns = number

declare module 'claude-code' {
  interface PluginState {
    'mod-template': { turns: ModTemplateTurns }
  }
}
