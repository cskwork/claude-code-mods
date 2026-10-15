# claude-code-mods

Mods for Claude Code (2.1.287+): plugins of function hooks that observe, rewrite or answer
what Claude Code does and draw their own UI. Based on
[Getting started with Claude Code mods](https://claude.dev/blog/getting-started-with-claude-code-mods/).

Landing page: https://cskwork.github.io/claude-code-mods/

| Mod | What it does |
| --- | --- |
| [`token-weather`](token-weather) | A one-line forecast of the context window above the prompt: ☀ Clear → ↯ Compact soon, tokens used, a sparkline of the last 12 turns, and how much the last turn added. |
| [`blast-radius`](blast-radius) | Before a risky Bash command runs (recursive `rm`, `git reset --hard`, `git clean -f`, force push, `git branch -D`, `git stash drop/clear`, `kubectl delete`, SQL `DROP`/`TRUNCATE`, migrations), dry-runs what it would touch and asks **Proceed** or **Cancel**. Cancel or dismiss denies the call. |
| [`usage-reporter`](usage-reporter) | Shows the weekly (`seven_day`) limit percentage and reset time in `/usage-reporter`. With your receiver URL, account ID and token configured, sends fresh readings on hourly ticks while Claude Code runs. Off by default. |
| [`template`](template) | Starter mod, not installed: a slash command, a status line entry, a band, and a `$.state` contract with a test. |

## Install

Inside Claude Code:

```
/plugin marketplace add cskwork/claude-code-mods
/plugin install token-weather@claude-code-mods
/plugin install blast-radius@claude-code-mods
/plugin install usage-reporter@claude-code-mods
/reload-plugins
```

### usage-reporter 빠른 설치 (한국어)

준비물은 Claude Code 2.1.287 이상(최신 버전 권장), Python 3, git입니다.
GitHub 또는 복제한 Git 저장소 중 **한 곳만** 마켓플레이스로 추가하세요.

GitHub에서 설치:

```bash
git clone https://github.com/cskwork/claude-code-mods.git
cd claude-code-mods
python3 scripts/setup-usage-reporter.py
```

다른 Git 서버에서 설치 (`git.example.com/your-team`은 실제 저장소 주소로 바꾸세요):

```bash
git clone https://git.example.com/your-team/claude-code-mods.git
cd claude-code-mods
python3 scripts/setup-usage-reporter.py --marketplace https://git.example.com/your-team/claude-code-mods.git
```

Windows에서는 `python3` 대신 `py -3`를 사용하세요. macOS와 Claude Code 2.1.300에서 검증했습니다.

스크립트는 설치하는 사람 본인의 계정 UUID, 수신 URL, 수신 키를 물어봅니다. 저장소에는
운영 주소, 실제 UUID, 키가 없습니다. 수신 URL은 직접 입력해야 합니다. 키는 화면에 표시되지
않고, Claude Code 보안 저장소에 들어갑니다.
보고는 마지막 질문에 `y`라고 답할 때만 켜집니다. 끝나면 Claude Code에서 `/reload-plugins`를
실행하고 `/usage-reporter`로 상태를 확인하세요. 자세한 내용은
[usage-reporter/README.md](usage-reporter/README.md)에 있습니다.

## Make a new mod

```bash
scripts/new-mod.sh my-mod "One line about what it does"
claude --plugin-dir "$PWD/my-mod"     # hot-reloads on every save
```

The script copies `template/`, renames it, adds it to `.claude-plugin/marketplace.json`,
then runs `claude plugin validate` and `claude plugin test` on it.

A mod is three files plus an optional state contract:

```
my-mod/
├── .claude-plugin/plugin.json   name, version, description, "types"
├── hooks/hooks.json             { "modules": ["./register.tsx"] }
├── hooks/register.tsx           export const register: Register = on => { ... }
├── types/index.d.ts             PluginState contract for $.state values
└── tests/my-mod.test.ts         claude plugin test my-mod
```

Rules that bite:

- Every hook is `($, e, next)`. Call `next(e)` to pass on, `next({ ...e, x })` to rewrite, return without it to answer.
- Keep values in `$.state` (`atom` / `read` / `update`); module variables reset on every hot reload.
- No Node, no DOM: files, processes, clock and UI go through `$`. UI elements come from `$.ui.resolve(e)`.
- Test mocks are hooks too: `on('process.run', ($, e) => ({ value: ... }))`.
- After the engine loads a mod it writes `.claude-plugin/types/` beside it, so `tsc -p <mod>` type-checks it (gitignored).

## Check

```bash
for m in token-weather blast-radius usage-reporter template; do claude plugin validate $m && claude plugin test $m; done
python3 usage-reporter/scripts/test-enabled.py
python3 -m unittest discover -s scripts -p 'test_setup*.py'
```
