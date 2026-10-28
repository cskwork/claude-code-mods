import type { EngineInterface } from 'claude-code'

import { analyze } from './analyze'

type Segment = { words: string[]; after?: string }

// A deliberately small shell subset. Never run the command to expand it: an
// unsupported construct must keep the human-confirmation requirement.
function segments(command: string): Segment[] {
  const result: Segment[] = []
  let words: string[] = []
  let word = ''
  let quote = ''
  const flush = () => { if (word) words.push(word); word = '' }
  for (let i = 0; i < command.length; i++) {
    const c = command[i]!
    if (c === '\\' && quote !== "'") {
      word += c + (command[++i] ?? '')
    } else if (c === quote) {
      quote = ''
      word += c
    } else if (quote) {
      word += c
    } else if (c === '"' || c === "'") {
      quote = c
      word += c
    } else if (c === '&' && command[i + 1] === '&') {
      flush()
      result.push({ words, after: '&&' })
      words = []
      i++
    } else if (c === ';' || c === '\n') {
      flush()
      result.push({ words, after: ';' })
      words = []
    } else if (/\s/.test(c)) {
      flush()
    } else if ('|&<>()`'.includes(c)) {
      throw new Error('unsupported shell operator or substitution')
    } else {
      word += c
    }
  }
  if (quote) throw new Error('unterminated shell quote')
  flush()
  if (words.length) result.push({ words })
  return result
}

function expand(raw: string, variables: Map<string, string>, home: string): string {
  let value = ''
  let quote = ''
  for (let i = 0; i < raw.length; i++) {
    const c = raw[i]!
    if (c === quote) { quote = ''; continue }
    if (!quote && (c === '"' || c === "'")) { quote = c; continue }
    if (c === '\\' && quote !== "'") {
      const next = raw[++i]
      if (!next || (quote === '"' && !'$`"\\'.includes(next))) throw new Error('unsupported shell escape')
      value += next
    } else if (c === '$' && quote !== "'") {
      const match = raw.slice(i).match(/^\$(?:\{([A-Za-z_]\w*)\}|([A-Za-z_]\w*))/)
      const name = match?.[1] ?? match?.[2]
      const replacement = name ? variables.get(name) : undefined
      if (!match || replacement === undefined) throw new Error('unresolvable variable or substitution')
      if (!quote && /[\s*?\[\]{}]/.test(replacement)) throw new Error('unquoted variable may split or expand')
      value += replacement
      i += match[0].length - 1
    } else if (!quote && i === 0 && c === '~' && (raw[1] === '/' || raw.length === 1)) {
      value += home
    } else {
      if (quote !== "'" && (c === '`' || (!quote && '*?[]{}'.includes(c)))) throw new Error('unresolvable shell expansion')
      value += c
    }
  }
  return value
}

function absolute(path: string, cwd: string): string {
  if (!path || /[$~\n\r\0]/.test(path) || path.startsWith(':')) throw new Error('unresolvable affected path')
  return path.startsWith('/') ? path : `${cwd}/${path}`
}

// Includes the execution directory as well as explicit targets. Ref names are
// not paths; remote effects and file-supplied pathspecs cannot be bounded here.
function affectedScope(command: string, cwd: string, home: string) {
  const parsed = segments(command)
  const variables = new Map<string, string>()
  const paths: string[] = []
  const repositories: string[] = []
  let found = 0
  for (let i = 0; i < parsed.length; i++) {
    const { words } = parsed[i]!
    if (!words.length) continue
    if (words.every(w => /^[A-Za-z_]\w*=/.test(w))) {
      if (parsed[i - 1]?.after === '&&') throw new Error('conditional variable assignment')
      for (const word of words) {
        const at = word.indexOf('=')
        const name = word.slice(0, at)
        if (/^(HOME|PATH|CDPATH|IFS|ENV|BASH_ENV|GLOBIGNORE|SHELLOPTS|BASHOPTS)$|^(GIT_|LD_|DYLD_)/.test(name)) throw new Error('assignment changes shell or git execution context')
        variables.set(name, expand(word.slice(at + 1), variables, home))
      }
      continue
    }
    const [cmd, ...args] = words.map(w => expand(w, variables, home))
    if (cmd === 'cd') {
      if (args.length !== 1 || parsed.slice(i, -1).some(s => s.after !== '&&')) throw new Error('ambiguous directory change')
      cwd = absolute(args[0]!, cwd)
      continue
    }
    if (cmd !== 'rm' && cmd !== 'git') throw new Error('command has no bounded filesystem scope')
    const risks = analyze([cmd, ...args].join(' '))
    if (risks.length === 0) throw new Error('unsupported command in unattended sequence')
    if (risks.length !== 1 || risks[0]!.checks.length === 0) throw new Error('risk has no bounded filesystem scope')
    found++
    if (cmd === 'rm') {
      if (args.some(a => a.startsWith('--') && !['--', '--recursive', '--force', '--verbose'].includes(a))) throw new Error('unsupported rm option')
      paths.push(cwd, ...args.filter(a => !a.startsWith('-')).map(p => absolute(p, cwd)))
      continue
    }
    let at = cwd
    while (args[0]?.startsWith('-')) {
      if (args.shift() !== '-C' || !args[0]) throw new Error('unsupported git directory or configuration option')
      at = absolute(args.shift()!, at)
      paths.push(at)
    }
    paths.push(at)
    repositories.push(at)
    const [sub, ...opts] = args
    if (sub === 'push') throw new Error('force push has remote scope')
    if (sub === 'worktree') {
      const targets = opts.slice(1).filter(o => !o.startsWith('-'))
      if (targets.length !== 1 || opts.slice(1).some(o => o.startsWith('-') && !['--', '-f', '--force'].includes(o))) throw new Error('unresolvable worktree target')
      paths.push(absolute(targets[0]!, at))
    } else if (sub === 'checkout' || sub === 'restore' || sub === 'clean') {
      const separator = opts.indexOf('--')
      const targets: string[] = []
      for (let n = 0; n < opts.length; n++) {
        const opt = opts[n]!
        if (n === separator) continue
        if (separator >= 0 && n > separator) { targets.push(opt); continue }
        if (sub === 'restore' && ['-s', '--source'].includes(opt)) { n++; continue }
        if (opt.startsWith('-')) {
          if (!/^-[fdxXnqWS]+$/.test(opt) && !['--force', '--worktree', '--staged', '--ours', '--theirs'].includes(opt) && !(sub === 'restore' && opt.startsWith('--source='))) throw new Error('unsupported git path option')
        } else if (sub !== 'checkout' || separator < 0) targets.push(opt)
      }
      paths.push(...targets.map(p => absolute(p, at)))
    } else if (!['reset', 'branch', 'stash'].includes(sub!)) {
      throw new Error('risk has no bounded filesystem scope')
    }
  }
  if (!found || found !== analyze(command).length) throw new Error('not every risk has resolvable affected paths')
  return { paths: [...new Set(paths)], repositories: [...new Set(repositories)] }
}

export async function unattendedReason($: EngineInterface, command: string): Promise<string> {
  const [home, override, cwd] = await Promise.all([$.env.get('HOME'), $.env.get('BLAST_RADIUS_ALLOW_FILE'), $.session.cwd()])
  const file = override || '~/.config/blast-radius/unattended-allow'
  const allowFile = file === '~' || file.startsWith('~/') ? `${home ?? ''}${file.slice(1)}` : file
  if (!home?.startsWith('/') || !allowFile.startsWith('/') || !cwd.startsWith('/')) throw new Error('HOME, cwd and allowlist file must resolve to absolute paths')
  const prefixes = (await $.fs.read(allowFile)).split('\n').map(line => line.split('#')[0]!.trim()).filter(Boolean)
  if (!prefixes.length || prefixes.some(p => !p.startsWith('/'))) throw new Error('allowlist needs one absolute prefix per line')
  const canonical = async (path: string) => {
    const ran = await $.process.run(['realpath', '--', path], { timeoutMs: 5_000 })
    const resolved = ran.stdout.replace(/\n$/, '')
    if (ran.exitCode !== 0 || ('isStdoutTruncated' in ran && ran.isStdoutTruncated) || !resolved.startsWith('/') || /[\n\r\0]/.test(resolved)) throw new Error(`cannot resolve affected path: ${path}`)
    return resolved.replace(/\/$/, '') || '/'
  }
  const allowed = await Promise.all(prefixes.map(canonical))
  const scope = affectedScope(command, cwd, home)
  // Commands such as reset --hard affect the repository root even when -C
  // names a subdirectory. Do not let an allowed subdirectory conceal that root.
  for (const cwd of scope.repositories) {
    const ran = await $.process.run(['git', 'rev-parse', '--show-toplevel'], { cwd, timeoutMs: 5_000 })
    const root = ran.stdout.replace(/\n$/, '')
    if (ran.exitCode !== 0 || ('isStdoutTruncated' in ran && ran.isStdoutTruncated) || !root.startsWith('/') || /[\n\r\0]/.test(root)) throw new Error(`cannot resolve git working tree: ${cwd}`)
    scope.paths.push(root)
  }
  for (const path of scope.paths) {
    const resolved = await canonical(path)
    if (!allowed.some(p => p === '/' || resolved === p || resolved.startsWith(`${p}/`))) throw new Error(`affected path is outside the unattended allowlist: ${path}`)
  }
  return `blast-radius: auto-proceed because the confirmation dialog is unavailable and every affected path is under ${allowFile}`
}
