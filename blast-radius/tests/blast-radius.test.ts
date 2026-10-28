import type { On } from 'claude-code'
import { describe, expect, mock, test } from 'claude-code/testing'

import { analyze } from '../hooks/analyze'

describe('analyze', () => {
  test('safe commands carry no risk', async () => {
    expect(analyze('ls -la && git status')).toEqual([])
    expect(analyze('rm file.txt')).toEqual([])
  })

  test('rm -rf sizes its targets in the cd it runs under', async () => {
    const [risk] = analyze('cd app && rm -rf build dist')
    expect(risk?.reason).toBe('Recursive delete of build dist')
    expect(risk?.checks[0]).toEqual({ label: 'size', argv: ['du', '-sh', '--', 'build', 'dist'], cwd: 'app' })
    expect(analyze('rm -rf /')[0]?.reason).toContain('VERY WIDE TARGET')
  })

  test('destructive git commands get matching dry runs', async () => {
    expect(analyze('git clean -fdx')[0]?.checks[0]?.argv).toEqual(['git', 'clean', '-n', '-d', '-x'])
    expect(analyze('git -C repo push --force origin main')[0]?.checks[0]?.cwd).toBe('repo')
    expect(analyze('git branch -D old')[0]?.checks[0]?.argv).toEqual(['git', 'log', '--oneline', 'old', '--not', '--remotes'])
    expect(analyze('git restore --staged a.ts')).toEqual([])
    expect(analyze('git -C repo worktree remove ../old')[0]?.checks[0]).toEqual({ label: 'worktrees', argv: ['git', 'worktree', 'list', '--porcelain'], cwd: 'repo' })
    expect(analyze('git checkout origin/dev -- src/a.ts')[0]?.reason).toContain('overwrites')
  })

  test('SQL wipes and migrations are flagged without a dry run', async () => {
    expect(analyze('mysql -e "DROP TABLE users"')[0]?.checks).toEqual([])
    expect(analyze('npx prisma migrate deploy')).toHaveLength(1)
  })

  test('each line and each & starts a new command', async () => {
    expect(analyze('rm -rf /tmp/build\ngit reset --hard').map(r => r.reason)).toEqual(['Recursive delete of /tmp/build', 'git reset --hard discards every uncommitted change'])
    expect(analyze('rm -rf /tmp/build & git clean -fd')).toHaveLength(2)
    expect(analyze("cat <<'EOF'\nnotes\nEOF\nrm -rf /etc/old")[0]?.reason).toBe('Recursive delete of /etc/old')
    expect(analyze('rm -rf \\\n  build')[0]?.reason).toBe('Recursive delete of build')
    expect(analyze('rm -rf build 2>&1')).toHaveLength(1)
    expect(analyze('rm -rf build &>/dev/null')).toHaveLength(1)
  })
})

describe('blast-radius hook', () => {
  const RM = { tool: 'Bash', command: 'rm -rf build', description: 'clean' } as const

  test('Proceed runs the command, with the dry run in the question', async ($, on) => {
    let asked = ''
    on('process.run', ($, e) => ({
      value: {
        exitCode: 0,
        stdout: e.argv[0] === 'du' ? '12M\tbuild\n' : 'a\nb\nc\n',
        stderr: '',
        isStdoutTruncated: false,
        isStderrTruncated: false,
      },
    }))
    on('tool.call', { tool: 'AskUserQuestion' }, ($, e) => {
      asked = e.questions[0]?.question ?? ''
      return { result: { questions: e.questions, answers: { [asked]: 'Proceed' } } }
    })
    on('tool.call', { tool: 'Bash' }, () => ({
      result: { stdout: 'removed', stderr: '', interrupted: false },
    }))

    const ran = await $.tool.call(RM)
    expect(ran.deny).toBeUndefined()
    expect(asked).toContain('12M')
    expect(asked).toContain('files: 3')
  })

  test('Cancel denies the command', async ($, on) => {
    let didRun = false
    on('process.run', () => ({
      value: { exitCode: 0, stdout: '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false },
    }))
    on('tool.call', { tool: 'AskUserQuestion' }, ($, e) => ({
      result: { questions: e.questions, answers: { [e.questions[0]?.question ?? '']: 'Cancel' } },
    }))
    on('tool.call', { tool: 'Bash' }, () => {
      didRun = true
      return { result: { stdout: '', stderr: '', interrupted: false } }
    })

    const ran = await $.tool.call(RM)
    expect(didRun).toBe(false)
    expect(ran.deny).toContain('cancelled')
  })
})

const ROOT = '/Users/agent/project'
const REPO = `${ROOT}/service-api`
const WORKTREE = `${ROOT}/worktrees/TICKET-1-viewer-api-stg`

function unattended(on: On, options: {
  allow?: string; cwd?: string; file?: string; answer?: string; readError?: string
  canonical?: (path: string) => string | undefined
  repositoryRoot?: string
  logs?: string[]
} = {}) {
  let didRun = false
  const file = options.file ?? '/Users/agent/.config/blast-radius/unattended-allow'
  mock.env(on, { HOME: '/Users/agent', ...(options.file ? { BLAST_RADIUS_ALLOW_FILE: options.file } : {}) })
  on('session.cwd', () => ({ value: options.cwd ?? ROOT }))
  on('ui.status', () => ({ value: undefined }))
  on('ui.log', ($, e) => { options.logs?.push(e.text); return { value: undefined } })
  on('fs.read', ($, e) => {
    expect(e.path).toBe(file.replace(/^~/, '/Users/agent'))
    return options.readError ? { deny: options.readError } : { value: options.allow ?? `${ROOT}\n` }
  })
  on('process.run', ($, e) => {
    const path = e.argv[e.argv.length - 1]!
    const resolved = options.canonical ? options.canonical(path) : path
    return { value: {
      exitCode: resolved === undefined ? 1 : 0,
      stdout: e.argv[0] === 'realpath' && resolved ? `${resolved}\n` : e.argv[1] === 'rev-parse' ? `${options.repositoryRoot ?? e.init?.cwd}\n` : '', stderr: '',
      isStdoutTruncated: false, isStderrTruncated: false,
    } }
  })
  on('tool.call', { tool: 'AskUserQuestion' }, ($, e) => options.answer ? {
    result: { questions: e.questions, answers: { [e.questions[0]?.question ?? '']: options.answer } },
  } : { deny: 'no one to ask' })
  on('tool.call', { tool: 'Bash' }, () => {
    didRun = true
    return { result: { stdout: 'command ran', stderr: '', interrupted: false } }
  })
  return () => didRun
}

describe('unattended allowlist', () => {
  test('worktree removal checks both the repository and the target and explains auto-proceed', async ($, on) => {
    const logs: string[] = []
    unattended(on, { allow: `# factory-owned directories\n${ROOT}/\n\n`, logs })
    const ran = await $.tool.call({ tool: 'Bash', command: `git -C ${REPO} worktree remove ${WORKTREE}` })
    expect(ran.deny).toBeUndefined()
    expect(ran.result?.stdout).toContain('auto-proceed')
    expect(ran.result?.stdout).toContain('unattended-allow')
    expect(logs[0]).toContain('auto-proceed')
  })

  test('expands earlier assignments for checkout of specific files', async ($, on) => {
    unattended(on)
    const ran = await $.tool.call({ tool: 'Bash', command: `W=${WORKTREE}; git -C $W checkout origin/dev -- src/a.ts src/b.ts` })
    expect(ran.deny).toBeUndefined()
    expect(ran.result?.stdout).toContain('auto-proceed')
  })

  test('expands tilde, braces, quotes and sequential cd', async ($, on) => {
    unattended(on)
    const ran = await $.tool.call({ tool: 'Bash', command: 'W=~/project; cd "$W" && cd worktrees && rm -rf "${W}/old tree"' })
    expect(ran.deny).toBeUndefined()
    expect(ran.result?.stdout).toContain('auto-proceed')
  })

  const denied = [
    ['one of multiple targets is outside', `rm -rf ${ROOT}/old /outside/old`],
    ['cwd is outside even with an allowed absolute target', `cd /outside && rm -rf ${ROOT}/old`],
    ['git -C is outside', `git -C /outside worktree remove ${WORKTREE}`],
    ['worktree target is outside', `git -C ${REPO} worktree remove /outside/tree`],
    ['checkout target is outside', `git -C ${REPO} checkout HEAD -- /outside/a.ts`],
    ['checkout without a separator checks all paths', `git -C ${REPO} checkout . /outside/a.ts`],
    ['a sibling prefix does not match', `rm -rf ${ROOT}-other/old`],
    ['an unresolved variable is denied', `git -C $UNKNOWN reset --hard`],
    ['later assignments cannot resolve earlier risks', `git -C $W reset --hard; W=${ROOT}`],
    ['HOME assignments cannot redirect tilde expansion', 'HOME=/outside; rm -rf ~/project/old'],
    ['git environment overrides cannot redirect writes', `GIT_WORK_TREE=/outside; git -C ${REPO} reset --hard`],
    ['a single-quoted variable stays literal', `rm -rf '$UNKNOWN/old'`],
    ['command substitution is never evaluated', `rm -rf $(echo ${ROOT})/old`],
    ['conditional assignments are ambiguous', `W=${ROOT} || W=/outside; git -C $W reset --hard`],
    ['git directory overrides are denied', `git --work-tree=/outside -C ${REPO} reset --hard`],
    ['pathspec files are unresolved', `git -C ${REPO} restore --pathspec-from-file=/outside/list`],
    ['SQL wipe has no filesystem scope', 'mysql -e "DROP TABLE users"'],
    ['migration has no filesystem scope', 'npx prisma migrate deploy'],
    ['cluster deletion has no filesystem scope', 'kubectl delete pod worker'],
    ['force push has remote scope', `git -C ${REPO} push --force origin main`],
    ['every risk must qualify', `rm -rf ${ROOT}/old; mysql -e "TRUNCATE TABLE users"`],
  ]
  for (const [name, command] of denied) {
    test(name!, async ($, on) => {
      const didRun = unattended(on)
      const ran = await $.tool.call({ tool: 'Bash', command: command! })
      expect(ran.deny).toContain('blast-radius:')
      expect(didRun()).toBe(false)
    })
  }

  test('an allowlist never overrides an attended Cancel', async ($, on) => {
    const didRun = unattended(on, { answer: 'Cancel', readError: 'allowlist must not be read' })
    const ran = await $.tool.call({ tool: 'Bash', command: `rm -rf ${ROOT}/old` })
    expect(ran.deny).toContain('cancelled')
    expect(didRun()).toBe(false)
  })

  test('attended Proceed needs no allowlist and preserves the result', async ($, on) => {
    unattended(on, { answer: 'Proceed', readError: 'allowlist must not be read' })
    const ran = await $.tool.call({ tool: 'Bash', command: `git -C ${REPO} worktree remove ${WORKTREE}` })
    expect(ran.deny).toBeUndefined()
    expect(ran.result?.stdout).toBe('command ran')
  })

  test('multiple allowed risks and prefixes qualify together', async ($, on) => {
    unattended(on, { allow: `${ROOT}\n/other-owned # second prefix\n` })
    const ran = await $.tool.call({ tool: 'Bash', command: `git -C ${REPO} reset --hard && rm -rf /other-owned/build` })
    expect(ran.deny).toBeUndefined()
    expect(ran.result?.stdout).toContain('auto-proceed')
  })

  test('reads the configured allowlist file, including a tilde in its name', async ($, on) => {
    unattended(on, { file: '~/factory/allow' })
    const ran = await $.tool.call({ tool: 'Bash', command: `rm -rf ${ROOT}/old` })
    expect(ran.deny).toBeUndefined()
    expect(ran.result?.stdout).toContain('/Users/agent/factory/allow')
  })

  for (const allow of ['', '# no prefixes\n', 'relative/prefix\n']) {
    test(`invalid allowlist denies: ${JSON.stringify(allow)}`, async ($, on) => {
      const didRun = unattended(on, { allow })
      const ran = await $.tool.call({ tool: 'Bash', command: `rm -rf ${ROOT}/old` })
      expect(ran.deny).toContain('absolute prefix')
      expect(didRun()).toBe(false)
    })
  }

  test('an allowed target cannot excuse an outside initial cwd', async ($, on) => {
    const didRun = unattended(on, { cwd: '/outside' })
    const ran = await $.tool.call({ tool: 'Bash', command: `rm -rf ${ROOT}/old` })
    expect(ran.deny).toContain('outside the unattended allowlist')
    expect(didRun()).toBe(false)
  })

  for (const target of ['escape/secret', '../outside']) {
    test(`canonical paths cannot escape: ${target}`, async ($, on) => {
      const didRun = unattended(on, { canonical: path => path.includes(target) ? '/outside/secret' : path })
      const ran = await $.tool.call({ tool: 'Bash', command: `rm -rf ${ROOT}/${target}` })
      expect(ran.deny).toContain('outside the unattended allowlist')
      expect(didRun()).toBe(false)
    })
  }

  test('a failed realpath lookup denies explicitly', async ($, on) => {
    const didRun = unattended(on, { canonical: path => path.endsWith('/old') ? undefined : path })
    const ran = await $.tool.call({ tool: 'Bash', command: `rm -rf ${ROOT}/old` })
    expect(ran.deny).toContain('cannot resolve affected path')
    expect(didRun()).toBe(false)
  })

  test('an allowed git subdirectory cannot hide an outside repository root', async ($, on) => {
    const didRun = unattended(on, { repositoryRoot: '/outside/repository' })
    const ran = await $.tool.call({ tool: 'Bash', command: `git -C ${REPO} reset --hard` })
    expect(ran.deny).toContain('outside the unattended allowlist')
    expect(didRun()).toBe(false)
  })

  test('canonicalization preserves trailing spaces in outside sibling names', async ($, on) => {
    const didRun = unattended(on, { canonical: path => path.endsWith('/old') ? `${ROOT} ` : path })
    const ran = await $.tool.call({ tool: 'Bash', command: `rm -rf ${ROOT}/old` })
    expect(ran.deny).toContain('outside the unattended allowlist')
    expect(didRun()).toBe(false)
  })

  test('missing allowlist denies with the read failure', async ($, on) => {
    unattended(on, { readError: 'ENOENT: allowlist missing' })
    const ran = await $.tool.call({ tool: 'Bash', command: `rm -rf ${ROOT}/old` })
    expect(ran.deny).toContain('ENOENT')
  })
})

const LINKS: Record<string, string> = { '/tmp': '/private/tmp', '/var/tmp': '/private/var/tmp', '/var/folders': '/private/var/folders' }

function safeTargets(on: On, options: {
  env?: Record<string, string>; links?: Record<string, string>; missing?: string[]; logs?: string[]
} = {}) {
  const state = { asked: false, didRun: false }
  const links = Object.entries({ ...LINKS, ...options.links }).sort(([a], [b]) => b.length - a.length)
  mock.env(on, { HOME: '/Users/agent', ...options.env })
  on('session.cwd', () => ({ value: ROOT }))
  on('ui.status', () => ({ value: undefined }))
  on('ui.log', ($, e) => { options.logs?.push(e.text); return { value: undefined } })
  on('fs.read', () => ({ deny: 'safe targets must not need the unattended allowlist' }))
  on('process.run', ($, e) => {
    const path = e.argv[e.argv.length - 1]!
    const link = links.find(([from]) => path === from || path.startsWith(`${from}/`))
    const resolved = link ? link[1] + path.slice(link[0].length) : path
    const missing = e.argv[0] === 'realpath' && options.missing?.includes(path)
    return { value: {
      exitCode: missing ? 1 : 0, stdout: e.argv[0] === 'realpath' && !missing ? `${resolved}\n` : '', stderr: '',
      isStdoutTruncated: false, isStderrTruncated: false,
    } }
  })
  on('tool.call', { tool: 'AskUserQuestion' }, ($, e) => {
    state.asked = true
    return { result: { questions: e.questions, answers: { [e.questions[0]?.question ?? '']: 'Cancel' } } }
  })
  on('tool.call', { tool: 'Bash' }, () => {
    state.didRun = true
    return { result: { stdout: 'command ran', stderr: '', interrupted: false } }
  })
  return state
}

// Shapes of two worker commands that waited on the question for 15 and 24 minutes.
const SCRATCH_RUN = [
  `cd ${ROOT}/.worktrees/s2-player; E=${ROOT}/.forge/e2e/s2; mkdir -p scripts/.scratch; python3 - <<'EOF'`,
  `s=open('scripts/drive-class.mjs').read()`,
  `a="""await shot('17-eng-phase3')`,
  `"""`,
  `b="""ok('Esc', (await cls.count()) === 0 && (await p.locator('[data-testid="preview"] .f-stage').count()) === 1)`,
  `"""`,
  `open('scripts/.scratch/drive-class.mjs','w').write(s.replace(a,b))`,
  `EOF`,
  `timeout 300 node scripts/.scratch/drive-class.mjs http://127.0.0.1:5302 $E/drive-class > $E/drive-class.log 2>&1; echo exit=$?; cp scripts/.scratch/drive-class.mjs $E/drive-class.patched.mjs; rm -r scripts/.scratch; grep -E "FAIL|PASS|errs" $E/drive-class.log | tail -8`,
].join('\n')
const TEMP_CHECKOUT = `W=${ROOT}/.worktrees/s5-ai; B=/tmp/s5-before; rm -rf $B; mkdir -p $B && git -C $W archive 7352b09 | tar -x -C $B && ln -s $W/node_modules $B/node_modules && for d in runtime worlds; do [ -e $B/public/$d ] || ln -s $W/public/$d $B/public/$d; done; ls $B/public | head; cd $B && (PORT=5316 nohup npx vite --port 5306 --strictPort > /tmp/s5-before.log 2>&1 &) ; sleep 4; curl -s -o /dev/null -w "%{http_code}\\n" http://127.0.0.1:5306/`

describe('safe targets', () => {
  test('a system temp checkout is replaced without asking, and the reason is shown', async ($, on) => {
    const logs: string[] = []
    const state = safeTargets(on, { missing: ['/tmp/s5-before'], logs })
    const ran = await $.tool.call({ tool: 'Bash', command: TEMP_CHECKOUT })
    expect(state.asked).toBe(false)
    expect(ran.deny).toBeUndefined()
    expect(ran.result?.stdout).toContain('auto-proceed')
    expect(ran.result?.stdout).toContain('/private/tmp/s5-before')
    expect(logs[0]).toContain('auto-proceed')
  })

  test('a .scratch folder is removed after a heredoc without asking', async ($, on) => {
    const state = safeTargets(on)
    const ran = await $.tool.call({ tool: 'Bash', command: SCRATCH_RUN })
    expect(state.asked).toBe(false)
    expect(ran.result?.stdout).toContain(`${ROOT}/.worktrees/s2-player/scripts/.scratch`)
  })

  const auto = [
    ['a JavaScript heredoc with template literals', `cd ${ROOT}/.worktrees/s2; cat > scripts/.scratch/a.mjs <<'EOF'\nawait p.screenshot({ path: \`\${out}/a.png\` })\nEOF\nnode scripts/.scratch/a.mjs; cp scripts/.scratch/*.mjs out/; rm -r scripts/.scratch; git status --short`],
    ['$TMPDIR under the system temp folder', 'rm -rf "$TMPDIR/build-cache"'],
    ['a pattern in the last part of a temp path', 'rm -rf /tmp/run-*'],
    ['strict mode and several scratch folders', `set -euo pipefail; cd ${ROOT}/app && rm -rf .tmp node_modules/.cache/tmp`],
    ['a tmp folder under home', 'rm -rf ~/.cache/tmp'],
    ['a redirected delete', 'rm -rf /tmp/build 2>&1 | tail -1'],
  ]
  for (const [name, command] of auto) {
    test(`proceeds without asking: ${name}`, async ($, on) => {
      const state = safeTargets(on, { env: { TMPDIR: '/var/folders/xy/T/' } })
      const ran = await $.tool.call({ tool: 'Bash', command: command! })
      expect(state.asked).toBe(false)
      expect(ran.result?.stdout).toContain('auto-proceed')
    })
  }

  const asks: [string, string, Parameters<typeof safeTargets>[1]?][] = [
    ['the temp folder itself', 'rm -rf /tmp'],
    ['everything in the temp folder', 'rm -rf /tmp/*'],
    ['a path that climbs out of temp', 'rm -rf /tmp/../Users/agent'],
    ['a project folder', `rm -rf ${ROOT}/src`],
    ['one of two targets outside', `rm -rf /tmp/build ${ROOT}/src`],
    ['a relative folder that is not scratch, even after cd /tmp', 'cd /tmp; rm -rf build'],
    ['a name that only starts with tmp', 'rm -rf ~/tmp-notes'],
    ['a temp symlink that points into the project', 'rm -rf /tmp/link/src', { links: { '/tmp/link': ROOT } }],
    ['a pattern before the last part', 'rm -rf /tmp/*/src'],
    ['$TMPDIR set outside system temp', 'rm -rf "$TMPDIR/project"', { env: { TMPDIR: '/Users/agent' } }],
    ['an unknown variable', 'rm -rf $UNKNOWN/tmp'],
    ['a command substitution', 'rm -rf "$(mktemp -d)"'],
    ['an assignment that may not run', `W=/tmp/x; false && W=${ROOT}; rm -rf $W`],
    ['rm behind sudo', 'sudo rm -rf /tmp/x'],
    ['another rm behind xargs', 'find /tmp/x -print0 | xargs -0 rm -rf; rm -rf /tmp/y'],
    ['an rm inside a substitution', 'echo "$(rm -rf ~)"; rm -rf /tmp/x'],
    ['an rm inside a subshell', `(cd ${ROOT} && rm -rf src); rm -rf /tmp/x`],
    ['a changed PATH', 'PATH=/tmp/bin:/usr/bin; rm -rf /tmp/x'],
    ['a git reset beside it', 'rm -rf /tmp/x; git reset --hard'],
    ['a git reset on the next line', 'rm -rf /tmp/build\ngit reset --hard'],
    ['a git clean on the next line', 'rm -rf /tmp/build\ngit clean -fdx'],
    ['a git reset after a background delete', 'rm -rf /tmp/build & git reset --hard'],
    ['a cluster delete on the next line', 'rm -rf /tmp/build\nkubectl delete ns prod'],
    ['a git reset inside a group', 'rm -rf /tmp/build; { git reset --hard; }'],
    ['a git reset behind nohup', 'rm -rf /tmp/build; nohup git reset --hard'],
    ['a SQL wipe beside it', 'rm -rf /tmp/x && mysql -e "DROP TABLE users"'],
  ]
  for (const [name, command, options] of asks) {
    test(`still asks: ${name}`, async ($, on) => {
      const state = safeTargets(on, options)
      const ran = await $.tool.call({ tool: 'Bash', command })
      expect(state.asked).toBe(true)
      expect(state.didRun).toBe(false)
      expect(ran.deny).toContain('cancelled')
    })
  }
})
