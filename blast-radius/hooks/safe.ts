// Deletes nobody needs to confirm. A command proceeds without the question only
// when every risk it carries is a recursive rm and every target is inside system
// temp (/tmp, /var/tmp, $TMPDIR) or inside a folder named .scratch, tmp or .tmp.
// The command text is read, never run: anything the reader cannot follow
// (command substitution, unknown variables, a directory it cannot pin down, an
// rm hidden in a wrapper or subshell) keeps the Proceed/Cancel question.
import type { EngineInterface } from 'claude-code'

import { analyze } from './analyze'
import type { Risk } from './analyze'

const SCRATCH = new Set(['.scratch', 'tmp', '.tmp'])
const TEMP_ROOTS = ['/tmp', '/var/tmp', '/usr/tmp']
const MACOS_USER_TEMP = ['/var/folders/', '/private/var/folders/']
// Can change variables or the directory of later commands in this shell.
const STATEFUL = new Set([
  'export', 'declare', 'typeset', 'local', 'readonly', 'read', 'readarray', 'mapfile', 'unset', 'set', 'shift',
  'getopts', 'let', 'pushd', 'popd', 'command', 'builtin', 'vared', 'zparseopts', 'setopt', 'unsetopt', 'emulate',
  'if', 'then', 'elif', 'else', 'fi', 'for', 'foreach', 'while', 'until', 'do', 'done', 'case', 'esac', 'select',
  'repeat', 'coproc', 'time', '!', '{', '}',
])
// Can also change what a later command name means, so a later `rm` may not be rm.
const REDEFINING = new Set(['eval', 'source', '.', 'alias', 'function', 'enable', 'hash', 'exec', 'trap', 'autoload', 'functions'])
const ASSIGN = /^([A-Za-z_]\w*)=/
const RM_WORD = /(^|[^\w.-])rm(?![\w.-])/g
// Assigning these changes which program a later `rm` runs.
const LOOKUP = /^(PATH|path|ENV|BASH_ENV|FPATH|fpath)$/
// `set -e`, `set -euo pipefail` and the like change no variable or directory.
const SET_FLAGS = /^([-+][euxv]+|[-+][euxv]*o|pipefail|errexit|nounset|xtrace|verbose)$/
// ${x:=1} and $((x = 1)) assign while they expand.
const ASSIGNING_EXPANSION = /\$\{[^}]*=|\$\(\(/

type Separator = '&&' | '||' | '|' | '&' | ';'
type Segment = { words: string[]; after?: Separator; stateful: boolean }
type Expanded = { value: string; glob: boolean[] }
type Scope = { get: (name: string) => string; plainIfs: boolean }
type Delete = { targets: Expanded[]; cwds: string[] | null }
type Heredoc = { delimiter: string; tabs: boolean; quoted: boolean }

class Unsupported extends Error {}
function unsupported(why: string): never {
  throw new Unsupported(why)
}

export async function safeReason($: EngineInterface, command: string, risks: Risk[]): Promise<string | undefined> {
  const deletesOnly = (list: Risk[]) => list.every(risk => risk.reason.startsWith('Recursive delete'))
  if (!deletesOnly(risks) || !/tmp|scratch/i.test(command)) return undefined
  const hidden = hiddenRisks(command)
  if (!deletesOnly(hidden)) return undefined
  try {
    const [HOME, TMPDIR, CDPATH, cwd] = await Promise.all([$.env.get('HOME'), $.env.get('TMPDIR'), $.env.get('CDPATH'), $.session.cwd()])
    if (!cwd.startsWith('/')) return undefined
    const { deletes, rmWords } = plan(command, { HOME, TMPDIR, CDPATH }, cwd)
    // Every rm in the text must be a command this reader followed, so none hides
    // behind sudo, xargs or sh -c, or inside a subshell or heredoc.
    if (deletes.length !== risks.length || deletes.length !== hidden.length || rmWords !== command.match(RM_WORD)?.length) return undefined
    const roots = await tempRoots($, TMPDIR)
    const paths: string[] = []
    for (const { targets, cwds } of deletes) for (const target of targets) paths.push(...(await confine($, target, cwds, roots)))
    return `blast-radius: auto-proceed without asking because every recursive delete stays inside system temp or a .scratch/tmp/.tmp folder: ${[...new Set(paths)].join(', ')}`
  } catch {
    return undefined
  }
}

// Judges every rm, git or kubectl word wherever it sits (after `{`, `then`,
// `nohup`, inside quotes, a substitution, a subshell or a heredoc body) as the
// start of a command, so no destructive command hides beside a safe delete.
function hiddenRisks(command: string): Risk[] {
  const flat = command.replace(/\\\n/g, ' ').replace(/['"\\]/g, '').replace(/[(){}`]/g, ';')
  const risks: Risk[] = []
  for (const segment of flat.split(/&&|\|\||;|\||\n|(?<![<>])&(?!>)/)) {
    const words = segment.trim().split(/\s+/)
    words.forEach((word, k) => {
      const name = /^(?:.*\/)?(rm|git|kubectl)$/.exec(word)?.[1]
      if (name) risks.push(...analyze([name, ...words.slice(k + 1)].join(' ')))
    })
  }
  return risks
}

// Follows variables and the working directory up to the last recursive rm and
// returns what each recursive rm deletes, from where.
function plan(command: string, env: { HOME?: string; TMPDIR?: string; CDPATH?: string }, cwd: string) {
  const segments = parse(command)
  const rmIndex = (words: string[]) => words.findIndex(w => !ASSIGN.test(w))
  const rmWords = segments.filter(s => s.words[rmIndex(s.words)] === 'rm').length
  // Same test analyze() applies, so both count the same recursive deletes.
  const recursive = (words: string[]) => words[rmIndex(words)] === 'rm' && words.slice(rmIndex(words) + 1).some(a => a === '--recursive' || /^-[a-zA-Z]*[rR]/.test(a))
  let last = -1
  segments.forEach((s, k) => { if (recursive(s.words)) last = k })

  const vars = new Map<string, string>()
  for (const name of ['HOME', 'TMPDIR'] as const) if (env[name] !== undefined) vars.set(name, env[name]!)
  let plainIfs = true
  let cdpathClear = !env.CDPATH
  let redefined = false
  // Directories the next command may run in. `outside` holds the ones that apply
  // again once the current `&&` chain ends, because a `cd` in it may have failed.
  let cwds: string[] | null = [cwd]
  let outside: string[] | null = []
  const scope: Scope = { get: name => vars.get(name) ?? unsupported(`unknown variable ${name}`), get plainIfs() { return plainIfs } }
  const forget = () => {
    vars.clear()
    plainIfs = false
    cdpathClear = false
    cwds = null
  }
  const deletes: Delete[] = []

  for (let k = 0; k <= last; k++) {
    const { words, after, stateful } = segments[k]!
    const before = segments[k - 1]?.after
    const maybe = before === '&&' || before === '||' || before === '|' || after === '|' || after === '&'
    if (stateful) forget()
    const assign = (list: string[]) => {
      for (const word of list) {
        const name = ASSIGN.exec(word)![1]!
        let value: string | undefined
        try { value = expand(word.slice(name.length + 1), scope, true).value } catch { value = undefined }
        if (name === 'IFS') plainIfs = false
        if (name === 'CDPATH') cdpathClear = !maybe && value === ''
        if (name === 'cdpath') cdpathClear = false
        if (LOOKUP.test(name)) redefined = true
        if (value === undefined || (maybe && vars.get(name) !== value)) vars.delete(name)
        else vars.set(name, value)
      }
    }
    const n = rmIndex(words)
    if (n < 0) {
      assign(words)
    } else {
      // A prefix assignment applies to that one command only.
      for (const word of words.slice(0, n)) {
        const name = ASSIGN.exec(word)![1]!
        vars.delete(name)
        if (LOOKUP.test(name)) redefined = true
      }
      const raw = words[n]!
      const args = words.slice(n + 1)
      let name: string | undefined
      if (STATEFUL.has(raw) || REDEFINING.has(raw)) name = raw
      else if (!/^[A-Za-z_]\w*(\[|\+=)/.test(raw)) try { name = raw.startsWith('(') ? '(' : expand(raw, scope).value } catch { name = undefined }
      if (name === '(') {
        // A subshell cannot change this shell's variables or directory.
      } else if (name === undefined || REDEFINING.has(name)) {
        forget()
        redefined = true
      } else if (name === 'export' && args.length && args.every(a => ASSIGN.test(a))) {
        assign(args)
      } else if (name === 'set' && args.length && args.every(a => SET_FLAGS.test(a))) {
        // Shell options only.
      } else if (STATEFUL.has(name) || (name === 'printf' && args.some(a => a.startsWith('-v')))) {
        forget()
      } else if (name.includes('/')) {
        // zsh AUTO_CD turns a bare directory name into a cd.
        cwds = null
      } else if (name === 'cd') {
        let next: string[] | null = null
        try {
          if (n > 0 || args.length > 1 || /^[-+]/.test(args[0] ?? '')) unsupported('cd option, stack entry or prefix assignment')
          const target = args.length ? expand(args[0]!, scope) : { value: scope.get('HOME'), glob: [] }
          if (!target.value || target.glob.some(Boolean) || target.value.split('/').includes('..')) unsupported('unresolvable cd')
          if (target.value.startsWith('/')) next = [target.value]
          else if (cdpathClear && cwds) next = cwds.map(c => `${c}/${target.value}`)
        } catch {
          next = null
        }
        if (after === '&&' && before !== '||' && before !== '|') {
          outside = union(outside, cwds)
          cwds = next
        } else {
          cwds = union(cwds, next)
        }
      } else if (name === 'rm' && recursive(words)) {
        if (redefined || raw !== 'rm') unsupported('rm may be redefined')
        deletes.push({ targets: rmTargets(args, scope), cwds })
      }
    }
    if (after !== '&&') {
      cwds = union(cwds, outside)
      outside = []
    }
  }
  return { deletes, rmWords }
}

function rmTargets(args: string[], scope: Scope): Expanded[] {
  const targets: Expanded[] = []
  let options = true
  for (const arg of args) {
    const word = expand(arg, scope)
    if (options && word.value === '--') {
      options = false
    } else if (options && word.value.startsWith('-')) {
      if (!/^-[rRfv]+$/.test(word.value) && !['--recursive', '--force', '--verbose'].includes(word.value)) unsupported(`rm option ${word.value}`)
    } else {
      targets.push(word)
    }
  }
  return targets.length ? targets : unsupported('rm without targets')
}

function union(a: string[] | null, b: string[] | null) {
  return a && b ? [...new Set([...a, ...b])] : null
}

// Splits a command into simple commands and the operator after each. Quoted
// text, substitutions and subshells stay inside their word; heredoc bodies and
// comments are dropped; redirection targets are not arguments.
function parse(command: string): Segment[] {
  const segments: Segment[] = []
  const heredocs: Heredoc[] = []
  let words: string[] = []
  let word = ''
  let inWord = false
  let redirect = false
  let stateful = false
  const flush = () => {
    if (inWord) {
      if (redirect) redirect = false
      else words.push(word)
    }
    word = ''
    inWord = false
  }
  const end = (after?: Separator) => {
    flush()
    if (redirect) unsupported('redirection without a target')
    if (words.length) segments.push({ words, after, stateful })
    words = []
    stateful = false
  }
  const take = (from: number, to: number) => {
    const text = command.slice(from, to)
    if (ASSIGNING_EXPANSION.test(text)) stateful = true
    word += text
    inWord = true
    return to
  }

  let i = 0
  while (i < command.length) {
    const c = command[i]!
    const next = command[i + 1]
    if (c === '\\') {
      if (next === '\n') i += 2
      else if (next === undefined) unsupported('trailing backslash')
      else i = take(i, i + 2)
    } else if (c === "'" || c === '"' || c === '`') {
      i = take(i, skip(command, i))
    } else if (c === '$' && next === "'") {
      let j = i + 2
      while (j < command.length && command[j] !== "'") j += command[j] === '\\' ? 2 : 1
      if (j >= command.length) unsupported('unterminated quote')
      i = take(i, j + 1)
    } else if (c === '$' && (next === '(' || next === '{')) {
      i = take(i, skip(command, i + 1))
    } else if (c === '#' && !inWord) {
      const j = command.indexOf('\n', i)
      i = j < 0 ? command.length : j
    } else if (c === '\n') {
      end(';')
      i = bodies(command, i + 1, heredocs.splice(0))
    } else if (c === ' ' || c === '\t') {
      flush()
      i++
    } else if (c === ';') {
      end(';')
      i++
    } else if (c === '&') {
      if (next === '&') {
        end('&&')
        i += 2
      } else if (next === '>') {
        flush()
        redirect = true
        i += command[i + 2] === '>' ? 3 : 2
      } else {
        end('&')
        i++
      }
    } else if (c === '|') {
      end(next === '|' ? '||' : '|')
      i += next === '|' || next === '&' ? 2 : 1
    } else if (c === '<' || c === '>') {
      if (next === '(') unsupported('process substitution')
      // zsh reads `a<1-9>` as a numeric glob, not a redirection.
      if (/^<\d*-\d*>/.test(command.slice(i)) || (inWord && !/^\d+$/.test(word))) unsupported('glob or redirection inside a word')
      word = ''
      inWord = false
      if (redirect) unsupported('redirection without a target')
      if (c === '<' && next === '<' && command[i + 2] !== '<') {
        let j = i + 2
        const tabs = command[j] === '-'
        if (tabs) j++
        while (command[j] === ' ' || command[j] === '\t') j++
        let raw = ''
        while (j < command.length && !/[\s;&|<>()]/.test(command[j]!)) {
          const k = command[j] === "'" || command[j] === '"' ? skip(command, j) : command[j] === '\\' ? j + 2 : j + 1
          raw += command.slice(j, k)
          j = k
        }
        const delimiter = raw.replace(/["'\\]/g, '')
        if (!delimiter) unsupported('heredoc without a delimiter')
        heredocs.push({ delimiter, tabs, quoted: delimiter !== raw })
        i = j
        continue
      }
      let j = i + 1
      if (command.startsWith('<<<', i)) j = i + 3
      else if ('>|&'.includes(command[j] ?? ' ') || (c === '<' && command[j] === '>')) j++
      redirect = true
      i = j
    } else if (c === '(') {
      if (inWord || words.length) unsupported('function definition, array or glob qualifier')
      if (next === '(') stateful = true
      i = take(i, skip(command, i))
    } else if (c === ')') {
      unsupported('unbalanced )')
    } else {
      i = take(i, i + 1)
    }
  }
  if (heredocs.length) unsupported('heredoc without a body')
  end()
  return segments
}

// Returns the index just past the quoted or bracketed construct that starts at i.
function skip(s: string, i: number): number {
  const open = s[i]
  if (open === "'") {
    const j = s.indexOf("'", i + 1)
    return j < 0 ? unsupported('unterminated quote') : j + 1
  }
  if (open === '`' || open === '"') {
    for (let j = i + 1; j < s.length; j++) {
      const c = s[j]
      if (c === '\\') j++
      else if (c === open) return j + 1
      else if (open === '"' && c === '`') j = skip(s, j) - 1
      else if (open === '"' && c === '$' && (s[j + 1] === '(' || s[j + 1] === '{')) j = skip(s, j + 1) - 1
    }
    return unsupported('unterminated quote')
  }
  const close = open === '(' ? ')' : open === '{' ? '}' : unsupported('nothing to skip')
  let depth = 0
  for (let j = i; j < s.length; j++) {
    const c = s[j]
    if (c === '\\') j++
    else if (c === "'" || c === '"' || c === '`') j = skip(s, j) - 1
    else if (c === open) depth++
    else if (c === close && --depth === 0) return j + 1
  }
  return unsupported('unbalanced brackets')
}

// Skips the bodies of heredocs opened on the line that just ended. An unquoted
// body expands, and ${x:=1} there assigns, so that is left to the person.
function bodies(s: string, start: number, heredocs: Heredoc[]): number {
  let i = start
  for (const { delimiter, tabs, quoted } of heredocs) {
    const from = i
    for (;;) {
      if (i >= s.length) unsupported('heredoc without its end marker')
      const n = s.indexOf('\n', i)
      const line = s.slice(i, n < 0 ? s.length : n)
      i = n < 0 ? s.length : n + 1
      if ((tabs ? line.replace(/^\t+/, '') : line) === delimiter) break
    }
    if (!quoted && ASSIGNING_EXPANSION.test(s.slice(from, i))) unsupported('assignment inside a heredoc')
  }
  return i
}

// Expands one word the way bash or zsh would, or throws when only running it
// could tell. `glob` marks unquoted pattern characters in the result.
function expand(raw: string, scope: Scope, assignment = false): Expanded {
  let value = ''
  const glob: boolean[] = []
  const add = (text: string, active = false) => {
    value += text
    for (let k = 0; k < text.length; k++) glob.push(active)
  }
  let quoted = false
  for (let i = 0; i < raw.length; i++) {
    const c = raw[i]!
    if (c === "'" && !quoted) {
      const j = raw.indexOf("'", i + 1)
      if (j < 0) unsupported('unterminated quote')
      add(raw.slice(i + 1, j))
      i = j
    } else if (c === '"') {
      quoted = !quoted
    } else if (c === '\\') {
      const n = raw[i + 1] ?? unsupported('trailing backslash')
      if (quoted && !'$`"\\'.includes(n)) {
        add(c)
      } else {
        add(n)
        i++
      }
    } else if (c === '$') {
      const m = /^\$(?:\{([A-Za-z_]\w*)\}|([A-Za-z_]\w*))/.exec(raw.slice(i))
      if (!m) unsupported('expansion that needs the shell')
      const text = scope.get(m[1] ?? m[2]!)
      if (!quoted && !assignment && (!scope.plainIfs || /[\s*?[\]{}~#^]/.test(text))) unsupported('unquoted variable may split or glob')
      add(text)
      i += m[0].length - 1
    } else if (c === '`') {
      unsupported('command substitution')
    } else if (!quoted && c === '~' && i === 0 && (raw.length === 1 || raw[1] === '/')) {
      add(scope.get('HOME'))
    } else if (!quoted && assignment && c === '~' && raw[i - 1] === ':') {
      unsupported('tilde after a colon in an assignment')
    } else if (!quoted && !assignment && '*?[]'.includes(c)) {
      add(c, true)
    } else if (!quoted && !assignment && '{}~^#='.includes(c)) {
      unsupported('unquoted brace, tilde, equals or extended glob character')
    } else {
      add(c)
    }
  }
  if (quoted) unsupported('unterminated quote')
  return { value, glob }
}

// Returns the canonical paths one target can delete, or throws when any of them
// is outside system temp and scratch folders.
async function confine($: EngineInterface, target: Expanded, cwds: string[] | null, roots: string[]): Promise<string[]> {
  const { value, glob } = target
  if (!value || /[\0\n\r]/.test(value)) unsupported('target needs a plain path')
  const comps: { text: string; glob: boolean[] }[] = []
  let at = 0
  for (const text of value.split('/')) {
    if (text && text !== '.') comps.push({ text, glob: glob.slice(at, at + text.length) })
    at += text.length + 1
  }
  if (!comps.length || comps.some(p => p.text === '..') || value.endsWith('/.')) unsupported('target leaves or names its folder')
  // `.*` and `..*` can match `.` or `..` in older bash.
  if (comps.some(p => p.text.startsWith('.') && (p.glob[1] || (p.text[1] === '.' && p.glob.some(Boolean))))) unsupported('pattern may match dot entries')
  const g = comps.findIndex(p => p.glob.some(Boolean))
  const absolute = value.startsWith('/')
  // A pattern may match a symlink. rm removes the link itself only when the
  // pattern is the last part and no slash follows it.
  if (g >= 0 && (g !== comps.length - 1 || value.endsWith('/'))) unsupported('pattern before the last part or before a slash')
  if (!absolute && value.endsWith('/')) unsupported('relative target with a trailing slash')
  const fixed = comps.slice(0, g < 0 ? comps.length : g).map(p => p.text)
  const pattern = g < 0 ? undefined : comps[g]!
  const tail = pattern ? `/${pattern.text}` : ''
  // A relative target must itself name the scratch folder, whatever the cwd.
  if (!absolute && !fixed.some(c => SCRATCH.has(c))) unsupported('relative target is not a scratch folder')
  const out: string[] = []
  for (const base of absolute ? [''] : (cwds ?? unsupported('unknown working directory'))) {
    const path = await canonical($, `${base}/${fixed.join('/')}`)
    const literalInPattern = pattern ? pattern.glob.some(active => !active) : false
    if (!allowed(path, literalInPattern, roots)) unsupported(`outside temp and scratch folders: ${path}`)
    out.push(`${path === '/' ? '' : path}${tail}` || '/')
  }
  return out
}

// Inside a temp root but not the whole root (a pattern such as /tmp/build-*
// counts as inside), or inside a folder named .scratch, tmp or .tmp that is not
// itself a temp root.
function allowed(path: string, literalInPattern: boolean, roots: string[]) {
  if (roots.some(r => path.startsWith(`${r}/`) || (path === r && literalInPattern))) return true
  const comps = path.split('/').filter(Boolean)
  return comps.some((c, k) => k >= 1 && SCRATCH.has(c) && !roots.includes(`/${comps.slice(0, k + 1).join('/')}`))
}

async function tempRoots($: EngineInterface, tmpdir?: string) {
  const roots = [...TEMP_ROOTS]
  for (const p of TEMP_ROOTS) roots.push(await canonical($, p).catch(() => p))
  const user = tmpdir?.startsWith('/') ? await canonical($, tmpdir).catch(() => undefined) : undefined
  // Trust $TMPDIR only where the system puts it, so a stray value such as
  // TMPDIR=$HOME cannot make a whole home folder count as temp.
  if (user && user !== '/' && [...MACOS_USER_TEMP, ...roots.map(r => `${r}/`)].some(p => user.startsWith(p))) roots.push(user)
  return [...new Set(roots)]
}

// realpath of the deepest existing ancestor plus the missing rest, so a target
// that does not exist yet still resolves through symlinks above it.
async function canonical($: EngineInterface, path: string): Promise<string> {
  const comps = path.split('/').filter(c => c && c !== '.')
  for (let n = comps.length; n >= 0; n--) {
    const head = `/${comps.slice(0, n).join('/')}`
    const ran = await $.process.run(['realpath', '--', head], { timeoutMs: 5_000 })
    if (ran.exitCode !== 0) continue
    const resolved = ran.stdout.replace(/\n$/, '')
    if (ran.isStdoutTruncated || !resolved.startsWith('/') || /[\n\r\0]/.test(resolved)) unsupported(`cannot resolve ${head}`)
    return [resolved.replace(/\/+$/, ''), ...comps.slice(n)].join('/') || '/'
  }
  return unsupported(`cannot resolve ${path}`)
}
