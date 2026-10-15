"""Tests for setup-usage-reporter.py with mocked terminal, CLI lookup and subprocess.

Run: python3 -m unittest discover -s scripts -p 'test_setup*.py'
"""
import contextlib
import getpass
import importlib.util
import io
import json
from pathlib import Path
import subprocess
import unittest
from unittest import mock
import warnings

spec = importlib.util.spec_from_file_location('setup_usage_reporter', Path(__file__).with_name('setup-usage-reporter.py'))
assert spec is not None and spec.loader is not None
setup = importlib.util.module_from_spec(spec)
spec.loader.exec_module(setup)

ACCOUNT = '12345678-90ab-cdef-1234-567890abcdef'
URL = f'https://receiver.test/api/accounts/{ACCOUNT}/usage'
KEY = 'fake-receiver-key-123'
CLAUDE = '/fake/bin/claude'


class SetupHelperTest(unittest.TestCase):
    def run_helper(self, answers, argv=(), key=KEY, tty=True, which=CLAUDE, codes=(0, 0)):
        """Run main() with mocks; returns (exit code, subprocess calls, stdout+stderr)."""
        results = iter(subprocess.CompletedProcess([], code, f'echo {KEY}', f'error {KEY}') for code in codes)
        getpass_mock = key if callable(key) else mock.Mock(return_value=key)
        out = io.StringIO()
        with mock.patch.object(setup.shutil, 'which', return_value=which), \
                mock.patch.object(setup.sys.stdin, 'isatty', return_value=tty), \
                mock.patch('builtins.input', side_effect=list(answers)), \
                mock.patch.object(setup.getpass, 'getpass', getpass_mock), \
                mock.patch.object(setup.subprocess, 'run', side_effect=lambda *a, **k: next(results)) as run, \
                contextlib.redirect_stdout(out), contextlib.redirect_stderr(out):
            code = setup.main(list(argv))
        return code, run.call_args_list, out.getvalue()

    def assert_no_secret(self, calls, output):
        self.assertNotIn(KEY, output)
        for call in calls:
            self.assertNotIn(KEY, ' '.join(call.args[0]))

    def test_installs_then_configures_with_secret_only_on_stdin(self):
        code, calls, output = self.run_helper([ACCOUNT, URL, 'n'])
        self.assertEqual(code, 0)
        self.assertEqual(calls[0].args[0], [CLAUDE, 'plugin', 'install', 'usage-reporter', '--marketplace',
                                            'cskwork/claude-code-mods', '--scope', 'user'])
        self.assertEqual(calls[1].args[0], [CLAUDE, 'plugin', 'configure', 'usage-reporter@claude-code-mods',
                                            '--values-stdin'])
        stdin = calls[1].kwargs['input']
        self.assertNotIn('\n', stdin)
        self.assertEqual(json.loads(stdin), {
            'enabled': 'false',
            'postUrl': URL,
            'accountId': ACCOUNT,
            'postToken': KEY,
        })
        self.assertTrue(calls[1].kwargs['capture_output'])
        self.assert_no_secret(calls, output)

    def test_explicit_yes_enables_and_alternate_sources_are_used(self):
        argv = ['--skip-install', '--plugin-id', 'usage-reporter@skills-dir']
        code, calls, output = self.run_helper([ACCOUNT, URL, 'y'], argv=argv, codes=(0,))
        self.assertEqual(code, 0)
        self.assertEqual(len(calls), 1)
        self.assertEqual(calls[0].args[0][3], 'usage-reporter@skills-dir')
        values = json.loads(calls[0].kwargs['input'])
        self.assertEqual((values['enabled'], values['postUrl']), ('true', URL))

        gitea = 'https://git.example.com/your-team/claude-code-mods.git'
        _, calls, _ = self.run_helper([ACCOUNT, URL, ''], argv=['--marketplace', gitea])
        self.assertEqual(calls[0].args[0][5], gitea)
        self.assertEqual(json.loads(calls[1].kwargs['input'])['enabled'], 'false')

    def test_missing_cli_or_terminal_stops_before_prompts(self):
        for kwargs, message in (({'which': None}, 'claude CLI not found'),
                                ({'tty': False}, 'interactive terminal')):
            key = mock.Mock(return_value=KEY)
            code, calls, output = self.run_helper([], key=key, **kwargs)
            self.assertEqual(code, 1)
            self.assertEqual(calls, [])
            key.assert_not_called()
            self.assertIn(message, output)

    def test_echoing_getpass_fallback_is_refused(self):
        def fallback(prompt):
            warnings.warn('Can not control echo', getpass.GetPassWarning)
            return KEY
        code, calls, output = self.run_helper([ACCOUNT, URL], key=fallback)
        self.assertEqual((code, calls), (1, []))
        self.assertIn('cannot hide the key input', output)

    def test_invalid_values_are_rejected_without_running_claude(self):
        cases = (
            (['not-a-uuid'], 'account UUID'),
            ([ACCOUNT, ''], 'https://'),
            ([ACCOUNT, URL.replace('https:', 'http:')], 'https://'),
            ([ACCOUNT, URL.replace('https://', 'https://user:pw@')], 'user:password'),
            ([ACCOUNT, 'https://receiver.test/api/accounts/other/usage'], 'same account UUID'),
        )
        for answers, message in cases:
            with self.subTest(message):
                code, calls, output = self.run_helper(answers)
                self.assertEqual((code, calls), (1, []))
                self.assertIn(message, output)
                self.assertNotIn('pw', output)
        code, calls, output = self.run_helper([ACCOUNT, URL], key='two words')
        self.assertEqual((code, calls), (1, []))

    def test_failed_install_or_configure_reports_exit_code_without_secret(self):
        code, calls, output = self.run_helper([ACCOUNT, URL, 'y'], codes=(3,))
        self.assertEqual((code, len(calls)), (1, 1))
        self.assertIn('plugin install failed (exit code 3)', output)

        code, calls, output = self.run_helper([ACCOUNT, URL, 'y'], codes=(0, 5))
        self.assertEqual((code, len(calls)), (1, 2))
        self.assertIn('plugin configure', output)
        self.assertIn('(exit code 5)', output)
        self.assert_no_secret(calls, output)

    def test_ctrl_c_and_eof_cancel(self):
        for error in (KeyboardInterrupt, EOFError):
            code, calls, output = self.run_helper([error])
            self.assertEqual((code, calls), (130, []))
            self.assertIn('cancelled', output)


if __name__ == '__main__':
    unittest.main()
