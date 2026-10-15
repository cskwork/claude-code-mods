// usage-reporter: keeps the weekly (seven_day) limit reading seen after each main-thread turn
// and, only when configured, POSTs it hourly while this Claude Code session runs.
//   observe -> turn.complete, after `next(e)`, main thread only
//   answer  -> /usage-reporter
//   timer   -> one `$.clock.every(HOUR)` per load; a hot reload cancels the old one
import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, Timer } from 'claude-code'

import type { UsageReporterState } from '../types'
import { HOUR, describeStatus, hourlySender, observe, readConfig } from './report'
import type { Io } from './report'

const NAME = 'usage-reporter'
const reporter = atom({ plugin: 'usage-reporter', key: 'reporter' } as const, {} as UsageReporterState)

const io = ($: EngineInterface): Io => ({
  now: () => $.clock.now(),
  fetch: (url, init) => $.http.fetch(url, init),
  load: () => read($, reporter),
  save: fn => update($, reporter, fn),
})

export const register: Register = (on, options) => {
  const config = readConfig(options)
  // Per load: session.start runs once per load, so these never outlive this module.
  let timer: Timer | undefined
  let tick: ReturnType<typeof hourlySender> | undefined

  on('session.start', async ($, e, next) => {
    await $.command.register({ name: NAME, description: 'Show the weekly limit reading and reporting status' })
    if (config.kind === 'invalid') $.ui.status(`${NAME}: setup error, see /${NAME}`)
    timer?.cancel()
    tick ??= hourlySender(io($), config)
    const runTick = tick
    timer = $.clock.every(HOUR, () => {
      void runTick().catch(() => $.ui.log(`${NAME}: tick failed (request details hidden)`, { to: 'debug' }))
    })
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    if (!e.agentId) {
      try {
        await observe(io($), (await $.session.usage()).rateLimits)
      } catch {
        await update($, reporter, s => ({ ...s, weekly: undefined, unreadable: { reason: 'could not read usage' } }))
          .catch(() => $.ui.log(`${NAME}: could not clear unavailable usage`, { to: 'debug' }))
        $.ui.log(`${NAME}: could not read usage (details hidden)`, { to: 'debug' })
      }
    }
    return result
  })

  on('command.run', { command: NAME }, async $ => ({
    text: describeStatus(config, await read($, reporter), await $.clock.now()),
  }))
}
