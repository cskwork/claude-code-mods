// Token Weather: a live forecast of the context window, above the prompt.
import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { TokenWeatherReading } from '../types'

const HISTORY = 12
const BARS = '▁▂▃▄▅▆▇█'
const FORECAST = [
  { upTo: 25, icon: '☀', word: 'Clear', color: 'yellow' },
  { upTo: 50, icon: '☁', word: 'Cloudy', color: 'cyan' },
  { upTo: 75, icon: '☂', word: 'Showers', color: 'blue' },
  { upTo: 90, icon: '☇', word: 'Storm', color: 'magenta' },
  { upTo: Infinity, icon: '↯', word: 'Compact soon', color: 'red' },
] as const

// Held by the host, so the history survives a hot reload of this file.
const readings = atom({ plugin: 'token-weather', key: 'readings' } as const, [] as TokenWeatherReading[])

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const result = await next(e)
    await takeReading($)
    return result
  })

  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    if (!e.agentId) await takeReading($) // main-loop turns only, not subagents
    return result
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const history = await read($, readings)
    const now = history[history.length - 1]
    if (e.props.hasSurvey || !now) return next(e)

    const { Box, Text } = $.ui.resolve(e)
    const f = forecast(now.percent)
    const isWide = (e.props.bodyColumns ?? 80) >= 60

    return (
      <Box flexDirection="row" paddingX={1}>
        <Text color={f.color} bold>{`${f.icon}  ${f.word}`}</Text>
        <Text>{`  ${now.percent}% of context`}</Text>
        <Text dimColor>{`  ${short(now.tokens)} / ${short(now.window)}`}</Text>
        {isWide && <Text dimColor>{'   last turns '}</Text>}
        {isWide && <Text color={f.color}>{sparkline(history)}</Text>}
        {isWide && history.length > 1 && <Text dimColor>{trend(history)}</Text>}
      </Box>
    )
  })
}

async function takeReading($: EngineInterface) {
  const { context } = await $.session.usage()
  if (!context?.window) return
  const tokens = context.tokens ?? 0
  const percent = context.percent ?? Math.round((tokens / context.window) * 100)
  await update($, readings, list => [...list, { tokens, window: context.window, percent }].slice(-HISTORY))
}

export function forecast(percent: number) {
  return FORECAST.find(b => percent < b.upTo) ?? FORECAST[FORECAST.length - 1]!
}

export function sparkline(history: readonly TokenWeatherReading[]) {
  const top = Math.max(...history.map(r => r.tokens), 1)
  return history.map(r => BARS[Math.floor((r.tokens / top) * (BARS.length - 1))]).join('')
}

export function trend(history: readonly TokenWeatherReading[]) {
  const delta = history[history.length - 1]!.tokens - history[history.length - 2]!.tokens
  if (delta === 0) return '  steady'
  return delta > 0 ? `  ▲ +${short(delta)} last turn` : `  ▼ ${short(-delta)} last turn`
}

export function short(n: number) {
  if (n >= 1_000_000) return `${+(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${+(n / 1_000).toFixed(1)}k`
  return String(n)
}
