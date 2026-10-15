#!/usr/bin/env python3
"""Install usage-reporter and store your own receiver settings through Claude Code.

Asks for the account UUID, receiver URL and receiver key, then runs
`claude plugin install` and `claude plugin configure --values-stdin`.
The key is read without echo and passed only on the child's stdin.
Python 3 standard library only; no HTTP requests are made.
"""
import argparse
import getpass
import json
import re
import shutil
import subprocess
import sys
import urllib.parse
import warnings

DEFAULT_MARKETPLACE = 'cskwork/claude-code-mods'
DEFAULT_PLUGIN_ID = 'usage-reporter@claude-code-mods'
UUID_RE = re.compile(r'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')


class SetupError(Exception):
    """A failure whose message is safe to print: it never contains entered values."""


def parse_args(argv):
    parser = argparse.ArgumentParser(description='Install usage-reporter and save your receiver settings.')
    parser.add_argument('--marketplace', default=DEFAULT_MARKETPLACE,
                        help='owner/repo, git URL or local path (default: %(default)s)')
    parser.add_argument('--plugin-id', default=DEFAULT_PLUGIN_ID,
                        help='installed plugin to configure (default: %(default)s)')
    parser.add_argument('--skip-install', action='store_true',
                        help='only configure an already installed plugin')
    return parser.parse_args(argv)


def check_uuid(value):
    value = value.strip().lower()
    if not UUID_RE.match(value):
        raise SetupError('account UUID must look like 00000000-0000-0000-0000-000000000000')
    return value


def check_url(value, account):
    value = value.strip()
    try:
        parts = urllib.parse.urlsplit(value)
        has_credentials = parts.username is not None or parts.password is not None
        host = parts.hostname
    except ValueError:
        raise SetupError('receiver URL is not a valid URL') from None
    if parts.scheme != 'https' or not host or any(c.isspace() for c in value):
        raise SetupError('receiver URL must be a full https:// URL')
    if has_credentials:
        raise SetupError('receiver URL must not contain user:password; the key goes in the next prompt')
    if account not in parts.path.lower():
        raise SetupError('receiver URL must contain the same account UUID')
    return value


def read_key():
    # getpass falls back to echoing input when it cannot hide it; make that fallback an error.
    with warnings.catch_warnings():
        warnings.simplefilter('error', getpass.GetPassWarning)
        try:
            key = getpass.getpass('Receiver key (hidden): ').strip()
        except getpass.GetPassWarning:
            raise SetupError('cannot hide the key input here; run this in an interactive terminal') from None
    if not key or any(c.isspace() or not c.isprintable() for c in key):
        raise SetupError('receiver key must be one non-empty line without spaces')
    return key


def ask_yes(prompt):
    return input(prompt).strip().lower() in ('y', 'yes')


def collect(stdin_is_tty):
    if not stdin_is_tty:
        raise SetupError('this helper needs an interactive terminal for the hidden key prompt')
    account = check_uuid(input('Account UUID: '))
    url = check_url(input('Receiver HTTPS URL (required): '), account)
    key = read_key()
    print('Reports go out hourly only while a Claude Code session is open and the computer is awake.')
    print('Each report carries the last weekly reading Claude Code received; stale or repeated readings are skipped.')
    enabled = ask_yes('Enable reporting now? [y/N]: ')
    return {
        'enabled': 'true' if enabled else 'false',
        'postUrl': url,
        'accountId': account,
        'postToken': key,
    }


def run(argv, step, **kwargs):
    try:
        result = subprocess.run(argv, **kwargs)
    except (OSError, subprocess.SubprocessError):
        raise SetupError(f'{step} could not start') from None
    if result.returncode != 0:
        raise SetupError(f'{step} failed (exit code {result.returncode})')


def main(argv=None):
    args = parse_args(argv)
    claude = shutil.which('claude')
    try:
        if not claude:
            raise SetupError('claude CLI not found on PATH; install Claude Code 2.1.287 or later first')
        values = collect(sys.stdin.isatty())
        if not args.skip_install:
            print(f'Installing usage-reporter from {args.marketplace} ...')
            run([claude, 'plugin', 'install', 'usage-reporter', '--marketplace', args.marketplace,
                 '--scope', 'user'], 'plugin install')
        # The child's output is hidden: it could repeat the values sent on stdin.
        run([claude, 'plugin', 'configure', args.plugin_id, '--values-stdin'],
            'plugin configure (output hidden because it may contain the values you entered)',
            input=json.dumps(values), capture_output=True, text=True, encoding='utf-8', errors='replace')
    except SetupError as error:
        print(f'usage-reporter setup: {error}', file=sys.stderr)
        return 1
    except (KeyboardInterrupt, EOFError):
        print('\nusage-reporter setup: cancelled', file=sys.stderr)
        return 130
    state = 'on' if values['enabled'] == 'true' else 'off (to turn it on, rerun with --skip-install and answer y)'
    print(f'Saved settings for {args.plugin_id}. Reporting is {state}.')
    print('In Claude Code, run /reload-plugins, then /usage-reporter to check the status.')
    return 0


if __name__ == '__main__':
    sys.exit(main())
