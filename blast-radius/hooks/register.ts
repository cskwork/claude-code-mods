// Blast Radius: before a risky Bash command runs, dry-run what it would touch
// and let the person choose Proceed or Cancel.
import type { EngineInterface, Register } from 'claude-code'

import { analyze } from './analyze'
import type { Check, Risk } from './analyze'
import { unattendedReason } from './unattended'

const PROCEED = 'Proceed'
const CANCEL = 'Cancel'
const MAX_LINES = 8

export const register: Register = on => {
  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    const risks = analyze(e.command)
    if (risks.length === 0) return next(e)

    const report = (await Promise.all(risks.map(risk => describe($, risk)))).join('\n\n')
    const question = `Blast radius of: ${e.command.slice(0, 120)}\n\n${report}\n\nRun it?`
    $.ui.status('blast-radius: waiting for your call')
    let reason: string | undefined
    try {
      let answer: string | undefined
      try {
        answer = await $.ui.ask(question, { header: 'Blast', options: [PROCEED, CANCEL] })
      } catch {
        try {
          reason = await unattendedReason($, e.command)
        } catch (error) {
          return { deny: `blast-radius: nobody confirmed this risky command (dialog dismissed or no one to ask).\nUnattended denied: ${error instanceof Error ? error.message : String(error)}` }
        }
      }
      if (!reason && answer !== PROCEED) return { deny: `blast-radius: the user cancelled this command after seeing its dry run.\n${report}` }
    } finally {
      $.ui.status(undefined)
    }
    if (reason) $.ui.log(reason)
    const ran = await next(e)
    if (reason && ran.deny === undefined && ran.result && typeof ran.result === 'object' && 'stdout' in ran.result && typeof ran.result.stdout === 'string')
      return { ...ran, result: { ...ran.result, stdout: `${ran.result.stdout}\n${reason}` } }
    return ran
  })
}

async function describe($: EngineInterface, risk: Risk) {
  const lines = await Promise.all(risk.checks.map(check => runCheck($, check)))
  return [`⚠ ${risk.reason}`, ...lines].join('\n')
}

async function runCheck($: EngineInterface, check: Check) {
  try {
    const ran = await $.process.run(check.argv, { cwd: check.cwd, timeoutMs: 5_000 })
    const out = ran.stdout.trim().split('\n').filter(Boolean)
    if (check.countOnly) return `  ${check.label}: ${out.length}${ran.isStdoutTruncated ? '+' : ''}`
    if (out.length === 0) return `  ${check.label}: ${ran.exitCode === 0 ? '(nothing)' : ran.stderr.trim().split('\n')[0] ?? 'failed'}`
    const shown = out.slice(0, MAX_LINES).map(l => `    ${l}`)
    const more = out.length > MAX_LINES ? [`    … ${out.length - MAX_LINES} more`] : []
    return [`  ${check.label}:`, ...shown, ...more].join('\n')
  } catch (error) {
    return `  ${check.label}: dry run failed (${error instanceof Error ? error.message : String(error)})`
  }
}
