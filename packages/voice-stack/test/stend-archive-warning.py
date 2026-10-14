#!/usr/bin/env python3
"""RU: Проверить сообщение об отключённом архиве и настоящий захват файлов.
EN: Check the disabled-archive diagnostic and actual archive file capture.
"""
from pathlib import Path
import json
import os
import shlex
import subprocess
import sys
import tempfile


def probe(root, expect_warning):
    script = root / 'bin/transcribe-local-shared'
    cases = [
        ('unset', None, None, 'public fixture', 0, True, False),
        ('empty-env', '', None, 'public fixture', 0, True, False),
        ('config-disables-env', 'enabled', '', 'public fixture', 0, True, False),
        ('env-enabled', 'enabled', None, 'public fixture', 0, False, True),
        ('config-enabled', None, 'enabled', 'public fixture', 0, False, True),
        ('not-keyword', 'enabled', None, 'private fixture', 0, False, False),
        ('empty-transcript', None, None, '', 0, True, False),
        ('transcriber-error', None, None, 'public fixture', 7, True, False),
    ]
    rows = []
    for name, env_dir, config_dir, text, code, disabled, archived in cases:
        with tempfile.TemporaryDirectory(prefix='voice-archive-probe-') as raw:
            d = Path(raw)
            engine = d / 'transcriber'
            engine.write_text('#!/bin/sh\nprintf "%s\\n" "$PROBE_TEXT"\nexit "$PROBE_CODE"\n')
            engine.chmod(0o755)
            pending = d / 'pending'
            wav = d / 'audio.wav'
            wav.write_bytes(b'wave fixture')
            original = d / 'audio.ogg'
            original.write_bytes(b'original fixture')
            conf = d / 'archive.conf'
            config = 'REAL_TRANSCRIBER=' + shlex.quote(str(engine)) + '\n'
            if config_dir is not None:
                config += 'PENDING_DIR=' + shlex.quote(str(pending) if config_dir else '') + '\n'
            conf.write_text(config)
            env = os.environ.copy()
            env.pop('VOICE_ARCHIVE_DIR', None)
            env.pop('VOICE_ARCHIVE_DISABLE', None)
            env.update(VOICE_ARCHIVE_CONF=str(conf), PROBE_TEXT=text, PROBE_CODE=str(code))
            if env_dir is not None:
                env['VOICE_ARCHIVE_DIR'] = str(pending) if env_dir else ''
            p = subprocess.run(['bash', str(script), str(wav), 'ru'], env=env,
                               capture_output=True, text=True, timeout=10)
            assert p.returncode == code, (name, p.returncode, p.stderr)
            assert p.stdout == text, (name, p.stdout)
            warning = 'архив голосовых выключен: PENDING_DIR не задан'
            assert p.stderr.count(warning) == int(disabled and expect_warning), (name, p.stderr)
            if not disabled:
                assert not p.stderr, (name, p.stderr)
            files = sorted(pending.glob('*')) if pending.exists() else []
            assert len(files) == (2 if archived else 0), (name, files)
            if archived:
                assert next(p for p in files if p.suffix == '.ogg').read_bytes() == original.read_bytes()
                assert next(p for p in files if p.suffix == '.txt').read_text() == text + '\n'
            rows.append(dict(name=name, code=p.returncode, stdout=p.stdout,
                             stderr=p.stderr, archived=archived))
    return rows


if __name__ == '__main__':
    root = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(__file__).resolve().parents[1]
    rows = probe(root, '--baseline' not in sys.argv)
    print(json.dumps(rows, ensure_ascii=False, indent=2))
