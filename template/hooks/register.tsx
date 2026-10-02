// mod-template: the three moves a mod makes, in one file.
//   observe  -> `await next(e)`, then act on the result   (turn.complete)
//   answer   -> return without `next`                     (command.run)
//   draw     -> a ui.render hook returns a tree           (AbovePrompt band)
// Values live in `$.state` (atoms), never module variables: a hot reload resets those.
import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

const NAME = 'mod-template'
const turns = atom({ plugin: 'mod-template', key: 'turns' } as const, 0)

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: NAME, description: 'Say how many turns this session has run' })
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    if (!e.agentId) {
      const count = await update($, turns, n => n + 1)
      $.ui.status(`${NAME}: ${count} turns`)
    }
    return result
  })

  on('command.run', { command: NAME }, async $ => ({ text: `${await read($, turns)} turns so far.` }))

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const count = await read($, turns)
    if (e.props.hasSurvey || count === 0) return next(e)
    const { Box, Text } = $.ui.resolve(e)
    return (
      <Box paddingX={1}>
        <Text dimColor>{`${NAME}: ${count} turns`}</Text>
      </Box>
    )
  })
}
