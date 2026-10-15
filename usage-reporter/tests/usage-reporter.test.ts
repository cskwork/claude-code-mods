import { describe, expect, mock, test } from 'claude-code/testing'
import type { HttpInit, HttpResponse, SessionRateLimit } from 'claude-code'

import { HOUR, describeStatus, hourlySender, isStale, observe, readConfig, send, weeklyFrom } from '../hooks/report'
import type { Io } from '../hooks/report'
import type { UsageReporterState } from '../types'

const T0 = Date.parse('2026-10-15T09:00:00.000Z')
const RESET = '2026-10-20T08:00:00.000Z'
const WEEK: SessionRateLimit[] = [
  { kind: 'five_hour', percentUsed: 80, resetsAt: '2026-10-15T12:00:00.000Z' },
  { kind: 'seven_day', percentUsed: 42.5, resetsAt: RESET },
]
const READY = { enabled: true, postUrl: 'https://receiver.test/hook/s3cret-path', accountId: 'acct-7', postToken: 'tok-1' }
const RUN = {
  command: 'usage-reporter',
  args: '',
  origin: { kind: 'composer' },
  presentation: { isFullscreen: false, columns: 120 },
} as const
const turn = (agentId?: string) =>
  ({ answer: '', durationMs: 1, isAborted: false, turnId: 't', reason: 'answer', ...(agentId ? { agentId } : {}) }) as const

// A clock, a store and a fetch in memory: what register.ts gets from `$.clock`, `$.state` and `$.http`.
function fakeIo(respond: (url: string, init: HttpInit) => HttpResponse | Promise<HttpResponse>) {
  const world = { now: T0, state: {} as UsageReporterState, calls: [] as { url: string; init: HttpInit }[] }
  const io: Io = {
    now: async () => world.now,
    fetch: async (url, init) => {
      world.calls.push({ url, init })
      return respond(url, init)
    },
    load: async () => world.state,
    save: async fn => (world.state = fn(world.state)),
  }
  return { io, world }
}
const reply = (status: number): HttpResponse => ({ status, ok: status >= 200 && status < 300, headers: {}, text: '' })

describe('config', () => {
  test('off by default and while enabled is anything but true', async () => {
    expect(readConfig({ enabled: false, postUrl: '', accountId: '', postToken: '' })).toEqual({ kind: 'disabled' })
    expect(readConfig({ ...READY, enabled: 'true' })).toEqual({ kind: 'disabled' })
  })

  test('enabled without setup names what is missing', async () => {
    expect(readConfig({ enabled: true, postUrl: '', accountId: '', postToken: '' })).toEqual({
      kind: 'invalid',
      problems: ['postUrl is not set', 'accountId is not set', 'postToken is not set'],
    })
  })

  test('only https without embedded credentials is accepted', async () => {
    const problems = (postUrl: string) => {
      const c = readConfig({ ...READY, postUrl })
      return c.kind === 'invalid' ? c.problems : []
    }
    expect(problems('http://receiver.test/hook')).toEqual(['postUrl must use https'])
    expect(problems('https://user:pw@receiver.test/hook')).toEqual(['postUrl must not carry user:password; use postToken'])
    expect(problems('not a url')).toEqual(['postUrl is not a valid URL'])
    expect(readConfig({ ...READY, postToken: 'a\nb' })).toEqual({ kind: 'invalid', problems: ['postToken must be one line'] })
    expect(readConfig(READY)).toEqual({
      kind: 'ready',
      url: READY.postUrl,
      origin: 'https://receiver.test',
      accountId: 'acct-7',
      token: 'tok-1',
    })
  })
})

describe('weekly reading', () => {
  test('reads seven_day only, and never turns a missing or bad figure into 0', async () => {
    expect(weeklyFrom(WEEK)).toEqual({ ok: true, percentUsed: 42.5, resetsAt: RESET })
    expect(weeklyFrom([]).ok).toBe(false)
    expect(weeklyFrom([WEEK[0]!]).ok).toBe(false)
    for (const percentUsed of [NaN, Infinity, -1, 100.5, '7' as unknown as number]) {
      expect(weeklyFrom([{ kind: 'seven_day', percentUsed, resetsAt: RESET }]).ok).toBe(false)
    }
    expect(weeklyFrom([{ kind: 'seven_day', percentUsed: 0 }])).toEqual({ ok: true, percentUsed: 0, resetsAt: null })
    expect(weeklyFrom([{ kind: 'seven_day', percentUsed: 3, resetsAt: 'soon' }])).toEqual({ ok: true, percentUsed: 3, resetsAt: null })
  })

  test('a reading is stale at one hour or at its reset', async () => {
    const w = { percentUsed: 1, resetsAt: RESET, observedAt: new Date(T0).toISOString() }
    expect(isStale(w, T0 + HOUR - 1)).toBe(false)
    expect(isStale(w, T0 + HOUR)).toBe(true)
    expect(isStale(w, T0 + HOUR + 1)).toBe(true)
    expect(isStale({ ...w, resetsAt: new Date(T0 + 60_000).toISOString() }, T0 + 60_000)).toBe(true)
    expect(isStale({ ...w, resetsAt: null }, T0 + 1)).toBe(false)
  })
})

describe('sending', () => {
  test('an unavailable observation stops reports until a valid reading returns', async () => {
    const { io, world } = fakeIo(() => reply(200))
    const config = readConfig(READY)
    for (const limits of [[], [{ kind: 'seven_day', percentUsed: NaN }]]) {
      await observe(io, WEEK)
      await observe(io, limits)
      await send(io, config)
      expect(world.state.weekly).toBeUndefined()
      expect(describeStatus(config, world.state, world.now)).toContain('Weekly limit: unknown')
    }
    expect(world.calls.length).toBe(0)
    await observe(io, WEEK)
    await send(io, config)
    expect(world.calls.length).toBe(1)
  })

  test('a request pending beyond an hour never overlaps the next tick', async () => {
    let resolveResponse!: (response: HttpResponse) => void
    let signalStarted!: () => void
    const started = new Promise<void>(resolve => { signalStarted = resolve })
    const pending = new Promise<HttpResponse>(resolve => { resolveResponse = resolve })
    const { io, world } = fakeIo(() => {
      signalStarted()
      return pending
    })
    await observe(io, WEEK)
    const tick = hourlySender(io, readConfig(READY))
    const first = tick()
    await started
    world.now += 2 * HOUR
    await tick()
    expect(world.calls.length).toBe(1)
    resolveResponse(reply(200))
    await first
    await observe(io, WEEK)
    await tick()
    expect(world.calls.length).toBe(2)
  })

  test('an hourly tick POSTs the exact body, token in the header only', async () => {
    const { io, world } = fakeIo(() => reply(200))
    const config = readConfig(READY)
    await observe(io, WEEK)
    world.now = T0 + 30 * 60_000
    await send(io, config)
    expect(world.calls.length).toBe(1)
    const { url, init } = world.calls[0]!
    expect(url).toBe(READY.postUrl)
    expect(init.method).toBe('POST')
    expect(init.headers).toEqual({ 'content-type': 'application/json', authorization: 'Bearer tok-1' })
    expect(init.auth).toBeUndefined()
    expect(JSON.parse(init.body!)).toEqual({
      weekly_usage_percent: 42.5,
      weekly_resets_at: RESET,
    })
    expect(init.body!).not.toContain('tok-1')
    expect(world.state.lastPost).toEqual({ at: '2026-10-15T09:30:00.000Z', ok: true, status: 200 })
  })

  test('missing reset or receiver token prevents POST', async () => {
    const { io, world } = fakeIo(() => reply(204))
    await observe(io, [{ kind: 'seven_day', percentUsed: 10 }])
    await send(io, readConfig(READY))
    await observe(io, WEEK)
    await send(io, readConfig({ ...READY, postToken: '' }))
    expect(world.calls.length).toBe(0)
    expect(readConfig({ ...READY, postToken: '' })).toEqual({ kind: 'invalid', problems: ['postToken is not set'] })
  })

  test('cached observations are not re-submitted as newly collected data', async () => {
    const { io, world } = fakeIo(() => reply(200))
    const config = readConfig(READY)
    await observe(io, WEEK)
    world.now += HOUR
    await send(io, config)
    expect(world.calls.length).toBe(0) // stale, never sent
    await observe(io, WEEK)
    await send(io, config)
    expect(world.calls.length).toBe(1)
    await send(io, config)
    expect(world.calls.length).toBe(1) // already submitted
    expect(describeStatus(config, world.state, world.now)).toContain('already been reported')
    world.now += 1
    await observe(io, WEEK)
    await send(io, config)
    expect(world.calls.length).toBe(2) // new observation, even when its percentage is unchanged
  })

  test('disabled, unconfigured, invalid or not yet observed: nothing is sent', async () => {
    const { io, world } = fakeIo(() => reply(200))
    await send(io, readConfig(READY)) // no observation yet
    await observe(io, WEEK)
    for (const options of [
      { ...READY, enabled: false },
      { enabled: true, postUrl: '', accountId: '', postToken: '' },
      { ...READY, postUrl: 'http://receiver.test/hook' },
    ]) {
      await send(io, readConfig(options))
    }
    expect(world.calls.length).toBe(0)
    expect(world.state.lastPost).toBeUndefined()
  })

  test('4xx, 5xx and network failures are recorded and the next tick recovers', async () => {
    const outcomes: (number | Error)[] = [404, 503, new Error(`connect ECONNREFUSED ${READY.postUrl}; Authorization: Bearer ${READY.postToken}`), 200, 500]
    const { io, world } = fakeIo(() => {
      const next = outcomes.shift()!
      if (next instanceof Error) throw next
      return reply(next)
    })
    const config = readConfig(READY)
    await observe(io, WEEK)
    const tick = async () => {
      world.now += HOUR
      await observe(io, WEEK)
      await send(io, config)
      return world.state
    }
    expect((await tick()).lastPost).toMatchObject({ ok: false, status: 404, error: 'HTTP 404' })
    expect((await tick()).lastPost).toMatchObject({ ok: false, status: 503, error: 'HTTP 503' })
    const network = (await tick()).lastPost!
    expect(network.ok).toBe(false)
    expect(network.error).toBe('network request failed (receiver credentials hidden)')
    expect(JSON.stringify(network)).not.toContain('s3cret-path')
    expect(JSON.stringify(network)).not.toContain('tok-1')
    expect(world.state.lastSuccess).toBeUndefined()
    const ok = await tick()
    expect(ok.lastPost).toMatchObject({ ok: true, status: 200 })
    expect(ok.lastSuccess).toEqual({ at: ok.lastPost!.at, status: 200, observedAt: ok.lastPost!.at })
    const failedAgain = await tick()
    expect(failedAgain.lastPost).toMatchObject({ ok: false, status: 500 })
    expect(failedAgain.lastSuccess).toEqual(ok.lastSuccess) // kept apart from the later error
    expect(world.calls.length).toBe(5) // one try per tick, no retry loop
    const text = describeStatus(config, failedAgain, world.now)
    expect(text).toContain('Last POST: failed at')
    expect(text).toContain(`Last success: ${ok.lastSuccess!.at} (200)`)
    expect(text).not.toContain('s3cret-path')
    expect(text).not.toContain('tok-1')
  })
})

describe('usage-reporter hooks (default config: off)', () => {
  test('observes main-thread turns only, keeps observed_at through timer ticks and never POSTs', async ($, on) => {
    const clock = mock.clock(on, { now: T0 })
    let rateLimits: SessionRateLimit[] = []
    let usageError = false
    let posts = 0
    on('session.start', ($, e) => ({ cwd: e.cwd }))
    on('command.register', ($, e) => ({ value: { command: e.name } }))
    on('turn.complete', () => ({ text: '' }))
    on('session.usage', () => {
      if (usageError) throw new Error('fake source failure')
      return { value: { context: { window: 200_000 }, rateLimits } }
    })
    on('http.fetch', () => {
      posts++
      return { value: reply(200) }
    })
    const status = async () => (await $.command.run(RUN)).text

    await $.session.start({ cwd: '/tmp', surface: 'terminal', isInteractive: true })
    expect(await status()).toContain('Weekly limit: unknown, no seven_day reading observed yet')
    expect(await status()).toContain('Reporting: off (enabled is false). Nothing is sent.')

    await $.turn.complete(turn()) // no subscription windows yet: still unknown, not 0%
    expect(await status()).toContain('Weekly limit: unknown')
    expect(await status()).toContain('Last turn without a reading')

    rateLimits = WEEK
    await $.turn.complete(turn())
    rateLimits = [{ kind: 'seven_day', percentUsed: 99, resetsAt: RESET }]
    await $.turn.complete(turn('agent-1')) // a subagent's turn changes nothing
    await clock.advance(3 * HOUR) // three timer ticks
    const text = await status()
    expect(text).toContain(`Weekly limit: 42.5% used, resets ${RESET}`)
    expect(text).toContain('Observed: 2026-10-15T09:00:00.000Z (3 h 0 min ago')
    expect(text).toContain('Last POST: none yet')
    expect(posts).toBe(0)
    usageError = true
    await $.turn.complete(turn())
    expect(await status()).toContain('Weekly limit: unknown')
    expect(await status()).toContain('could not read usage')
  })

  // A real hot reload swaps the module (the host cancels its timers); this covers a repeated session.start.
  test('session.start again keeps the observation and still never POSTs', async ($, on) => {
    const clock = mock.clock(on, { now: T0 })
    let posts = 0
    on('session.start', ($, e) => ({ cwd: e.cwd }))
    on('command.register', ($, e) => ({ value: { command: e.name } }))
    on('turn.complete', () => ({ text: '' }))
    on('session.usage', () => ({ value: { context: { window: 200_000 }, rateLimits: WEEK } }))
    on('http.fetch', () => {
      posts++
      return { value: reply(200) }
    })
    await $.session.start({ cwd: '/tmp', surface: 'terminal', isInteractive: true })
    await $.turn.complete(turn())
    await $.session.start({ cwd: '/tmp', surface: 'terminal', isInteractive: true })
    await clock.advance(2 * HOUR)
    expect(posts).toBe(0)
    expect((await $.command.run(RUN)).text).toContain('Observed: 2026-10-15T09:00:00.000Z')
  })
})
