// Pure: turns a shell command into the risks it carries and the read-only
// commands that show how far each one reaches. No `$`, so tests import it as is.

export type Check = { label: string; argv: string[]; cwd?: string; countOnly?: true }
export type Risk = { reason: string; checks: Check[] }

const SQL_WIPE = /\b(drop\s+(table|database|schema)|truncate\s+table|delete\s+from\s+\w+\s*(;|$|"|'))/i
const MIGRATION = /\b(flyway\s+(migrate|clean)|liquibase\s+update|prisma\s+migrate|alembic\s+upgrade|rails\s+db:|knex\s+migrate|sequelize\s+db:migrate)/i
const WIDE = ['/', '/*', '~', '~/', '.', '..', '*']

export function analyze(command: string): Risk[] {
  const risks: Risk[] = []
  if (SQL_WIPE.test(command)) risks.push({ reason: 'SQL that drops or wipes data (no dry run possible)', checks: [] })
  if (MIGRATION.test(command)) risks.push({ reason: 'Database migration (no dry run possible)', checks: [] })

  // Follows `cd dir && ...` so each check runs where the command would.
  let cwd: string | undefined
  for (const segment of command.split(/&&|\|\||;|\|/)) {
    const words = segment.trim().split(/\s+/).filter(Boolean)
    while (words[0] && (words[0] === 'sudo' || /^\w+=/.test(words[0]))) words.shift()
    const [cmd, ...args] = words
    if (!cmd) continue
    if (cmd === 'cd' && args[0]) {
      cwd = args[0].startsWith('/') || !cwd ? args[0] : `${cwd}/${args[0]}`
      continue
    }
    const risk = cmd === 'rm' ? rm(args) : cmd === 'git' ? git(args) : cmd === 'kubectl' ? kubectl(args) : undefined
    if (risk) risks.push({ ...risk, checks: risk.checks.map(c => (c.cwd || !cwd ? c : { ...c, cwd })) })
  }
  return risks
}

function rm(args: string[]): Risk | undefined {
  const isRecursive = args.some(a => a === '--recursive' || /^-[a-zA-Z]*[rR]/.test(a))
  const paths = args.filter(a => !a.startsWith('-'))
  if (!isRecursive || paths.length === 0) return undefined
  const isWide = paths.some(p => WIDE.includes(p))
  return {
    reason: `Recursive delete of ${paths.join(' ')}${isWide ? ' (VERY WIDE TARGET)' : ''}`,
    checks: [
      { label: 'size', argv: ['du', '-sh', '--', ...paths] },
      { label: 'files', argv: ['find', ...paths, '-type', 'f'], countOnly: true },
    ],
  }
}

function git(args: string[]): Risk | undefined {
  let cwd: string | undefined
  const rest = [...args]
  while (rest[0]?.startsWith('-')) {
    if (rest.shift() === '-C') cwd = rest.shift()
  }
  const [sub, ...opts] = rest
  const has = (...names: string[]) => opts.some(o => names.includes(o))
  const short = (letter: string) => opts.some(o => new RegExp(`^-[a-zA-Z]*${letter}`).test(o))
  const at = (risk: Risk): Risk => (cwd ? { ...risk, checks: risk.checks.map(c => ({ ...c, cwd })) } : risk)

  if (sub === 'reset' && has('--hard'))
    return at({
      reason: 'git reset --hard discards every uncommitted change',
      checks: [
        { label: 'uncommitted', argv: ['git', 'status', '--short'] },
        { label: 'diff', argv: ['git', 'diff', '--stat', 'HEAD'] },
      ],
    })
  if (sub === 'clean' && (short('f') || has('--force')))
    return at({
      reason: 'git clean deletes untracked files',
      checks: [{ label: 'would remove', argv: ['git', 'clean', '-n', ...(short('d') ? ['-d'] : []), ...(short('x') ? ['-x'] : [])] }],
    })
  if (sub === 'push' && opts.some(o => o === '-f' || o.startsWith('--force') || o.startsWith('+')))
    return at({
      reason: 'Force push rewrites the remote branch',
      checks: [{ label: 'remote commits lost', argv: ['git', 'log', '--oneline', 'HEAD..@{u}'] }],
    })
  if ((sub === 'checkout' && has('--', '.')) || (sub === 'restore' && !has('--staged')))
    return at({ reason: `git ${sub} overwrites working-tree changes`, checks: [{ label: 'diff', argv: ['git', 'diff', '--stat'] }] })
  if (sub === 'branch' && (has('-D') || (has('-d', '--delete') && has('--force', '-f')))) {
    const names = opts.filter(o => !o.startsWith('-'))
    return at({
      reason: `Force-deleting branch ${names.join(' ')}`,
      checks: names.map(n => ({ label: `unpushed on ${n}`, argv: ['git', 'log', '--oneline', n, '--not', '--remotes'] })),
    })
  }
  if (sub === 'stash' && (opts[0] === 'drop' || opts[0] === 'clear'))
    return at({ reason: `git stash ${opts[0]} loses stashed work`, checks: [{ label: 'stashes', argv: ['git', 'stash', 'list'] }] })
  return undefined
}

function kubectl(args: string[]): Risk | undefined {
  if (args[0] !== 'delete') return undefined
  return {
    reason: 'kubectl delete removes cluster resources',
    checks: [{ label: 'would delete', argv: ['kubectl', ...args, '--dry-run=client', '-o', 'name'] }],
  }
}
