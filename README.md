# claude-code-mods

Mods for Claude Code (2.1.287+): plugins of function hooks that observe, rewrite or answer
what Claude Code does and draw their own UI. Based on
[Getting started with Claude Code mods](https://claude.dev/blog/getting-started-with-claude-code-mods/).

Landing page: https://cskwork.github.io/claude-code-mods/

| Mod | What it does |
| --- | --- |
| [`token-weather`](token-weather) | A one-line forecast of the context window above the prompt: ☀ Clear → ↯ Compact soon, tokens used, a sparkline of the last 12 turns, and how much the last turn added. |
| [`blast-radius`](blast-radius) | Before a risky Bash command runs (recursive `rm`, `git reset --hard`, `git clean -f`, force push, `git branch -D`, `git stash drop/clear`, `kubectl delete`, SQL `DROP`/`TRUNCATE`, migrations), dry-runs what it would touch and asks **Proceed** or **Cancel**. Cancel or dismiss denies the call. |
| [`template`](template) | Starter mod, not installed: a slash command, a status line entry, a band, and a `$.state` contract with a test. |

## Install

Inside Claude Code:

```
/plugin marketplace add cskwork/claude-code-mods
/plugin install token-weather@claude-code-mods
/plugin install blast-radius@claude-code-mods
/reload-plugins
```

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
for m in token-weather blast-radius template; do claude plugin validate $m && claude plugin test $m; done
```
