import { expect, mock, test } from 'claude-code/testing'

const HOUR = 3_600_000
const T0 = Date.parse('2026-10-15T09:00:00.000Z')
const RESET = '2026-10-20T08:00:00.000Z'
const TURN = { answer: '', durationMs: 1, isAborted: false, turnId: 'fixture', reason: 'answer' } as const
const COMMAND = {
  command: 'usage-reporter', args: '', origin: { kind: 'composer' },
  presentation: { isFullscreen: false, columns: 120 },
} as const

test('enabled mod POSTs on hourly ticks, retries new observations and skips cached or unavailable data', async ($, on) => {
  const clock = mock.clock(on, { now: T0 })
  let rateLimits = [{ kind: 'seven_day', percentUsed: 42.5, resetsAt: RESET }]
  const requests: { url: string; init: { method?: string; headers?: Record<string, string>; body?: string; auth?: string } }[] = []
  const statuses = [503, 200]
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('command.register', ($, e) => ({ value: { command: e.name } }))
  on('turn.complete', () => ({ text: '' }))
  on('session.usage', () => ({ value: { context: { window: 200_000 }, rateLimits } }))
  on('http.fetch', ($, e) => {
    requests.push(e)
    const status = statuses.shift() ?? 200
    return { value: { status, ok: status === 200, headers: {}, text: '' } }
  })
  const status = async () => (await $.command.run(COMMAND)).text

  await $.session.start({ cwd: '/tmp', surface: 'terminal', isInteractive: true })
  expect(await status()).toContain('Reporting: hourly POST')
  await clock.advance(HOUR / 2)
  await $.turn.complete(TURN)
  expect(requests.length).toBe(0) // never POST on a turn
  await clock.advance(HOUR / 2)
  expect(requests.length).toBe(1)
  expect(requests[0]!.url).toBe('https://receiver.test/ai-accounts/api/accounts/fixture-account/usage')
  expect(requests[0]!.init.method).toBe('POST')
  expect(requests[0]!.init.headers).toEqual({ 'content-type': 'application/json', authorization: 'Bearer fixture-token' })
  expect(requests[0]!.init.auth).toBeUndefined()
  expect(JSON.parse(requests[0]!.init.body!)).toEqual({ weekly_usage_percent: 42.5, weekly_resets_at: RESET })
  expect(await status()).toContain('HTTP 503')

  await clock.advance(HOUR / 2)
  rateLimits = [{ kind: 'seven_day', percentUsed: 43, resetsAt: RESET }]
  await $.turn.complete(TURN)
  await clock.advance(HOUR / 2)
  expect(requests.length).toBe(2)
  expect(JSON.parse(requests[1]!.init.body!)).toEqual({ weekly_usage_percent: 43, weekly_resets_at: RESET })
  expect(await status()).toContain('Last POST: ok (200)')
  await clock.advance(HOUR)
  expect(requests.length).toBe(2) // never replay old data as a new collection

  await clock.advance(HOUR / 2)
  rateLimits = [{ kind: 'seven_day', percentUsed: 99, resetsAt: RESET }]
  await $.turn.complete({ ...TURN, agentId: 'fixture-subagent' })
  await clock.advance(HOUR / 2)
  expect(requests.length).toBe(2)
  await clock.advance(HOUR / 2)
  rateLimits = []
  await $.turn.complete(TURN)
  await clock.advance(HOUR / 2)
  expect(requests.length).toBe(2)
  expect(await status()).toContain('Weekly limit: unknown')
})
