# Changelog

## 0.2.0 - 2026-10-28

- Let unattended workers proceed after a failed confirmation dialog only when all
  affected targets and cwd / git `-C` directories are inside the configured
  `BLAST_RADIUS_ALLOW_FILE` (default `~/.config/blast-radius/unattended-allow`).
- Resolve earlier command-local assignments, tilde, quotes and relative paths;
  check canonical paths and directory boundaries, and explain auto-proceed in the
  returned Bash result. Unresolved or non-filesystem risks still deny explicitly.
- Add `git worktree remove` previews and allow eligible unattended file checkouts,
  covering the factory worktree removal and delivery-checkout incidents from the
  2026-10-28 retrospective. Attended Proceed/Cancel behavior is preserved.

## 0.1.0

- Preview risky Bash commands and require Proceed before running them.
