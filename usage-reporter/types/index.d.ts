// The mod's state contract: every `$.state` value the module names, under the mod's name.
// `observedAt` is when this mod read the cached usage after a turn, not a provider timestamp.
export type UsageReporterWeekly = { percentUsed: number; resetsAt: string | null; observedAt: string }

export type UsageReporterState = {
  weekly?: UsageReporterWeekly
  unreadable?: { at?: string; reason: string }
  lastPost?: { at: string; ok: boolean; status?: number; error?: string }
  lastSuccess?: { at: string; status: number; observedAt: string }
}

declare module 'claude-code' {
  interface PluginState {
    'usage-reporter': { reporter: UsageReporterState }
  }
}
