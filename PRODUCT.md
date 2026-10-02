# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Static single-file HTML/CSS/JS at `docs/index.html`, served by GitHub Pages from `main`/`docs` (user's choice, 2026-10-02). No build step.

## Users

1. Primary: Claude Code users (2.1.287+) who want ready-made mods. Job: see what each mod does, then copy the three install commands.
2. Secondary: developers who want to write their own mod. Job: understand the mod shape and start from the template with `scripts/new-mod.sh`.

## Product Purpose

`cskwork/claude-code-mods` is a Claude Code plugin marketplace of mods (function-hook plugins). Success: a visitor installs a mod, or scaffolds a new one, within a minute of landing.

## Positioning

Two working mods that live inside the Claude Code terminal itself, plus the template they were built from. token-weather turns context-window usage into a one-line weather forecast; blast-radius dry-runs destructive shell commands and makes the person choose Proceed or Cancel.

## Operating Context

Visitors arrive from GitHub or a shared link, usually on desktop, often with a terminal open beside the browser. Install happens inside Claude Code: `/plugin marketplace add cskwork/claude-code-mods`, `/plugin install <mod>@claude-code-mods`, `/reload-plugins`.

## Capabilities and Constraints

- token-weather bands: under 25% ☀ Clear (yellow), 25–49% ☁ Cloudy (cyan), 50–74% ☂ Showers (blue), 75–89% ☇ Storm (magenta), 90%+ ↯ Compact soon (red). Shows percent, tokens used / window, sparkline of last 12 turns (▁▂▃▄▅▆▇█), last-turn delta.
- blast-radius gates: recursive `rm`, `git reset --hard`, `git clean -f`, force push, `git checkout -- .`/`git restore`, `git branch -D`, `git stash drop/clear`, `kubectl delete`, SQL DROP/TRUNCATE/DELETE without WHERE, DB migrations. Dry runs: `du -sh`, file count, `git status`, `git clean -n`, unpushed commits, `kubectl --dry-run`. Cancel or dismiss denies the call. With no one to ask (headless), it denies.
- Requires Claude Code 2.1.287 or later. Mods API is early access.
- Template: slash command, status line, band, `$.state` contract, test.

## Brand Commitments

Names: `claude-code-mods`, `token-weather`, `blast-radius`, author `cskwork`. Based on the post "Getting started with Claude Code mods" (claude.dev). Unofficial; not an Anthropic product.

## Evidence on Hand

Source in this repo; tests: 10 passing across three mods. No users, stars, testimonials or benchmarks exist; do not invent them. Terminal renders on the page are illustrative recreations, labelled as such.

## Product Principles

1. Show the mod working, in the terminal's own terms, before explaining it.
2. The install commands are the primary action; always one click to copy.
3. Honest scope: early-access API, unofficial, what each mod does and does not catch.
4. Bilingual: English default, Korean toggle.
