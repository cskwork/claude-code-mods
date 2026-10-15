// usage-reporter's logic, kept free of `$` so tests can drive it with a fake clock,
// fetch and store. register.ts wires it to `$.clock`, `$.http` and `$.state`.
import type { HttpInit, HttpResponse, PluginOptions, SessionRateLimit } from 'claude-code'

import type { UsageReporterState, UsageReporterWeekly } from '../types'

export const HOUR = 3_600_000
const WEEKLY_KIND = 'seven_day'

export type Config =
  | { kind: 'disabled' }
  | { kind: 'invalid'; problems: string[] }
  | { kind: 'ready'; url: string; origin: string; accountId: string; token: string }

export type Io = {
  now: () => Promise<number>
  fetch: (url: string, init: HttpInit) => Promise<HttpResponse>
  load: () => Promise<UsageReporterState>
  save: (fn: (s: UsageReporterState) => UsageReporterState) => Promise<unknown>
}

// The plugin's userConfig, checked. Off unless `enabled` is true and every field is usable.
export function readConfig(options: PluginOptions): Config {
  if (options.enabled !== true) return { kind: 'disabled' }
  const problems: string[] = []
  const rawUrl = typeof options.postUrl === 'string' ? options.postUrl.trim() : ''
  const accountId = typeof options.accountId === 'string' ? options.accountId.trim() : ''
  const token = typeof options.postToken === 'string' ? options.postToken.trim() : ''
  let url: URL | undefined
  if (!rawUrl) problems.push('postUrl is not set')
  else {
    try {
      url = new URL(rawUrl)
    } catch {
      problems.push('postUrl is not a valid URL')
    }
    if (url && url.protocol !== 'https:') problems.push('postUrl must use https')
    if (url && (url.username || url.password)) problems.push('postUrl must not carry user:password; use postToken')
  }
  if (!accountId) problems.push('accountId is not set')
  if (!token) problems.push('postToken is not set')
  if (/[\r\n]/.test(token)) problems.push('postToken must be one line')
  if (problems.length || !url) return { kind: 'invalid', problems }
  return { kind: 'ready', url: url.href, origin: url.origin, accountId, token }
}

// The seven_day window from a usage reading, or why there is none. Never a made-up 0.
export function weeklyFrom(
  rateLimits: readonly SessionRateLimit[] | undefined,
): { ok: true; percentUsed: number; resetsAt: string | null } | { ok: false; reason: string } {
  const week = rateLimits?.find(r => r.kind === WEEKLY_KIND)
  if (!week) return { ok: false, reason: 'no seven_day window in the last API response' }
  const p = week.percentUsed
  if (typeof p !== 'number' || !Number.isFinite(p) || p < 0 || p > 100) {
    return { ok: false, reason: `seven_day percentUsed out of range: ${String(p)}` }
  }
  const ms = typeof week.resetsAt === 'string' ? Date.parse(week.resetsAt) : NaN
  return { ok: true, percentUsed: p, resetsAt: Number.isFinite(ms) ? new Date(ms).toISOString() : null }
}

// After a main-thread turn: record what the cached usage says, stamped with when we looked.
export async function observe(io: Io, rateLimits: readonly SessionRateLimit[] | undefined) {
  const at = new Date(await io.now()).toISOString()
  const week = weeklyFrom(rateLimits)
  await io.save(s =>
    week.ok
      ? { ...s, weekly: { percentUsed: week.percentUsed, resetsAt: week.resetsAt, observedAt: at }, unreadable: undefined }
      : { ...s, weekly: undefined, unreadable: { at, reason: week.reason } },
  )
}

export function isStale(weekly: UsageReporterWeekly, now: number) {
  const resetMs = weekly.resetsAt ? Date.parse(weekly.resetsAt) : NaN
  return now - Date.parse(weekly.observedAt) >= HOUR || now >= resetMs
}

export function reportBody(weekly: UsageReporterWeekly) {
  return {
    weekly_usage_percent: weekly.percentUsed,
    weekly_resets_at: weekly.resetsAt,
  }
}

// One hourly tick: POST the last observed reading, or do nothing when not set up or nothing observed.
// The outcome lands in state; a failure waits for the next tick, never a retry loop.
export async function send(io: Io, config: Config) {
  if (config.kind !== 'ready') return
  const { weekly, lastSuccess } = await io.load()
  if (!weekly) return
  const now = await io.now()
  // The provided receiver contract has no source timestamp field. Do not make
  // old or already submitted observations appear newly collected on the site.
  if (!weekly.resetsAt || isStale(weekly, now) || lastSuccess?.observedAt === weekly.observedAt) return
  const at = new Date(now).toISOString()
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  if (config.token) headers.authorization = `Bearer ${config.token}`
  try {
    const res = await io.fetch(config.url, { method: 'POST', headers, body: JSON.stringify(reportBody(weekly)) })
    await io.save(s =>
      res.ok
        ? { ...s, lastPost: { at, ok: true, status: res.status }, lastSuccess: { at, status: res.status, observedAt: weekly.observedAt } }
        : { ...s, lastPost: { at, ok: false, status: res.status, error: `HTTP ${res.status}` } },
    )
  } catch {
    // Transport errors can contain request headers or capability URLs.
    await io.save(s => ({ ...s, lastPost: { at, ok: false, error: 'network request failed (receiver credentials hidden)' } }))
  }
}

// Keep one request in flight even if a receiver takes longer than an hourly period.
export function hourlySender(io: Io, config: Config) {
  let inFlight = false
  return async () => {
    if (inFlight) return
    inFlight = true
    try {
      await send(io, config)
    } finally {
      inFlight = false
    }
  }
}

// What /usage-reporter prints. Shows the receiver's origin only: its path may be a capability.
export function describeStatus(config: Config, s: UsageReporterState, now: number) {
  const lines = ['usage-reporter']
  const w = s.weekly
  if (w) {
    lines.push(`Weekly limit: ${w.percentUsed}% used, resets ${w.resetsAt ?? 'unknown (not in the API response)'}`)
    lines.push(`Observed: ${w.observedAt} (${age(now - Date.parse(w.observedAt))} ago, locally after a turn; not a server update time)`)
    if (w.resetsAt && now >= Date.parse(w.resetsAt)) lines.push('Reset time has passed: the reading is out of date until the next turn.')
    if (!w.resetsAt) lines.push('Reporting waits for a known weekly reset time.')
    else if (isStale(w, now)) lines.push('Reporting waits for a fresh observation; old readings are not re-submitted as new collections.')
    if (s.lastSuccess?.observedAt === w.observedAt) lines.push('This observation has already been reported; waiting for the next main-thread turn.')
  } else {
    lines.push('Weekly limit: unknown, no seven_day reading observed yet (it arrives after a turn on a subscription)')
  }
  if (s.unreadable) lines.push(`Last turn without a reading${s.unreadable.at ? ` at ${s.unreadable.at}` : ''}: ${s.unreadable.reason}`)
  if (config.kind === 'disabled') lines.push('Reporting: off (enabled is false). Nothing is sent.')
  else if (config.kind === 'invalid') lines.push(`Reporting: setup error, nothing is sent: ${config.problems.join('; ')}`)
  else lines.push(`Reporting: hourly POST to ${config.origin} (path hidden) as account ${config.accountId}`)
  const p = s.lastPost
  if (!p) lines.push('Last POST: none yet')
  else if (p.ok) lines.push(`Last POST: ok (${p.status}) at ${p.at}`)
  else lines.push(`Last POST: failed at ${p.at}: ${p.error}; retries at the next hourly tick`)
  if (s.lastSuccess && !p?.ok) lines.push(`Last success: ${s.lastSuccess.at} (${s.lastSuccess.status})`)
  return lines.join('\n')
}

function age(ms: number) {
  const min = Math.max(0, Math.floor(ms / 60_000))
  return min < 60 ? `${min} min` : `${Math.floor(min / 60)} h ${min % 60} min`
}
