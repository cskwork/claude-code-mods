# Changelog

## 0.3.0 - 2026-10-29

- Run recursive deletes without the Proceed/Cancel question when every risk in the
  command is a recursive `rm` and every target resolves (through `realpath`) inside
  system temp (`/tmp`, `/var/tmp`, `/usr/tmp`, or `$TMPDIR` when it sits under
  system temp) or inside a folder named `.scratch`, `tmp` or `.tmp`. The temp
  folder itself, `/tmp/*`, and relative targets that do not name such a folder
  still ask. The Bash result and the log say why the command ran unasked.
- The command text is read, never run. Unknown variables, command or process
  substitution, assignments that may not run, a changed `PATH`, an `rm` behind
  `sudo`/`xargs` or inside a subshell, patterns before the last path part, and any
  other risk in the same command keep the question.
- Treat each line and each bare `&` as a new command when looking for risks.
  Before, `cat <<'EOF' … EOF` followed by `rm -rf dir` on a later line, or
  `rm -rf /tmp/x` then `git reset --hard` on the next line, hid the later command
  from the check.
- Before this, the check ran only after the question failed, so hosts that can show
  the question (Paseo, the terminal) asked even for `/tmp` and `.scratch` cleanup;
  two workers waited 15 and 24 minutes on such deletes on 2026-10-29.

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
