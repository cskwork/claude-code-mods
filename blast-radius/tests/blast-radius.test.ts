import { describe, expect, test } from 'claude-code/testing'

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
  })

  test('SQL wipes and migrations are flagged without a dry run', async () => {
    expect(analyze('mysql -e "DROP TABLE users"')[0]?.checks).toEqual([])
    expect(analyze('npx prisma migrate deploy')).toHaveLength(1)
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
