#!/usr/bin/env python3
"""Run the real mod with enabled fixture defaults and mocked HTTP, never user settings."""
import json
from pathlib import Path
import shutil
import subprocess
import tempfile

source = Path(__file__).resolve().parents[1]
with tempfile.TemporaryDirectory(prefix='usage-reporter-enabled-') as scratch:
    fixture = Path(scratch)
    for folder in ('hooks', 'types'):
        shutil.copytree(source / folder, fixture / folder)
    manifest = json.loads((source / '.claude-plugin/plugin.json').read_text())
    defaults = {
        'enabled': True,
        'postUrl': 'https://receiver.test/ai-accounts/api/accounts/fixture-account/usage',
        'accountId': 'fixture-account',
        'postToken': 'fixture-token',
    }
    for key, value in defaults.items():
        manifest['userConfig'][key]['default'] = value
    (fixture / '.claude-plugin').mkdir()
    (fixture / '.claude-plugin/plugin.json').write_text(json.dumps(manifest))
    (fixture / 'tests').mkdir()
    shutil.copyfile(source / 'tests/enabled.fixture.ts', fixture / 'tests/enabled.test.ts')
    result = subprocess.run(['claude', 'plugin', 'test', str(fixture)], timeout=30)
    raise SystemExit(result.returncode)
