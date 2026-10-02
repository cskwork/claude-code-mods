import { describe, expect, test } from 'claude-code/testing'

import { forecast, short, sparkline, trend } from '../hooks/register'

const BAND = { component: 'AbovePrompt', props: {
    hasSurvey: false,
    isWorking: false,
    maxRows: 4,
    bodyColumns: 100,
    scroll: { offset: 0, bodyRows: 40 },
    view: {},
  } } as const

describe('token-weather', () => {
  test('forecast bands follow the percentage', async () => {
    expect(forecast(10).word).toBe('Clear')
    expect(forecast(25).word).toBe('Cloudy')
    expect(forecast(74).word).toBe('Showers')
    expect(forecast(89).word).toBe('Storm')
    expect(forecast(95).word).toBe('Compact soon')
  })

  test('helpers format tokens, chart and trend', async () => {
    expect(short(134_400)).toBe('134.4k')
    expect(short(1_000_000)).toBe('1M')
    const history = [
      { tokens: 36_100, window: 200_000, percent: 18 },
      { tokens: 134_400, window: 200_000, percent: 67 },
    ]
    expect(sparkline(history)).toBe('▂█')
    expect(trend(history)).toBe('  ▲ +98.3k last turn')
  })

  test('the band shows the reading taken at session start', async ($, on) => {
    on('session.usage', () => ({
      value: { startedAt: 0, context: { tokens: 36_100, window: 200_000, percent: 18 }, rateLimits: [] },
    }))
    on('session.start', ($, e) => ({ cwd: e.cwd }))
    await $.session.start({ cwd: '/tmp', surface: 'terminal', isInteractive: true })
    for (const surface of ['terminal', 'desktop'] as const) {
      const ui = await $.ui.mount({ plugin: 'token-weather', surface, ...BAND })
      expect(await ui.find({ type: 'Text', text: 'Clear' })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: '18% of context' })).toBeDefined()
      await ui.unmount()
    }
  })
})
