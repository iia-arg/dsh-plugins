# Local release prefix: installation is root, Autopilot execution is operator-only.
import os as _dsh_os
import sys as _dsh_sys

if _dsh_os.geteuid() == 0:
    print('REFUSED: root runtime forbidden; run Autopilot as operator master', file=_dsh_sys.stderr)
    raise SystemExit(2)

import pwd as _dsh_pwd

if _dsh_pwd.getpwuid(_dsh_os.geteuid()).pw_name != 'master':
    print('REFUSED: Autopilot operator master required', file=_dsh_sys.stderr)
    raise SystemExit(2)

# Preserve interpreter flags and ensure no runtime import creates bytecode.
if __name__ == '__main__' and not _dsh_sys.flags.dont_write_bytecode:
    _dsh_os.execv(_dsh_sys.executable,
                 [_dsh_sys.executable, '-B', *_dsh_sys.orig_argv[1:]])
_dsh_sys.dont_write_bytecode = True
_dsh_os.environ['PYTHONDONTWRITEBYTECODE'] = '1'
_dsh_os.environ['AUTOPILOT_NO_UPDATE_CHECK'] = '1'


def _dsh_refuse(reason):
    print('REFUSED: Autopilot policy: ' + reason, file=_dsh_sys.stderr)
    raise SystemExit(2)


if __name__ == '__main__':
    import json as _dsh_json
    from pathlib import Path as _dsh_Path

    _dsh_commands = {
        '': set(), 'sync': set(), 'init': {'slug', 'title', 'mode', 'depth',
            'memory-file', 'memory-owner', 'skill-dir', 'brief-file', 'force'},
        'stage': {'note'}, 'ticket': {'note', 'tests', 'commit', 'placeholder'},
        'tickets': set(), 'check-plan': set(), 'set': set(), 'add': set(), 'usage': {'snapshot'},
        'coverage': {'item'}, 'blind': {'mismatch'}, 'tests': set(),
        'ask': {'note'}, 'answered': set(), 'finish': {'result'}, 'abandon': set(), 'reopen': set(), 'resume': set(), 'commits': set(),
    }
    _dsh_boolean = {'no-serve', 'force'}
    _dsh_known = set().union(*_dsh_commands.values(), _dsh_boolean)
    _dsh_pos, _dsh_options, _dsh_bools = [], [], []
    _dsh_args = _dsh_sys.argv[1:]
    _dsh_i = 0
    while _dsh_i < len(_dsh_args):
        _dsh_arg = _dsh_args[_dsh_i]
        if _dsh_arg.startswith('--'):
            _dsh_key = _dsh_arg[2:]
            if _dsh_key not in _dsh_known:
                _dsh_refuse('unsupported option ' + _dsh_arg)
            if _dsh_key in _dsh_boolean:
                if _dsh_key != 'no-serve':
                    _dsh_bools.append(_dsh_arg)
                _dsh_i += 1
                continue
            if _dsh_i + 1 == len(_dsh_args) or _dsh_args[_dsh_i + 1].startswith('--'):
                _dsh_refuse('missing option value ' + _dsh_arg)
            _dsh_options.append((_dsh_key, _dsh_args[_dsh_i + 1]))
            _dsh_i += 2
        elif _dsh_arg.startswith('-'):
            _dsh_refuse('unsupported short option')
        else:
            _dsh_pos.append(_dsh_arg)
            _dsh_i += 1
    _dsh_cmd = _dsh_pos[0] if _dsh_pos else ''
    if _dsh_cmd not in _dsh_commands:
        _dsh_refuse('unsupported subcommand')
    if any(k not in _dsh_commands[_dsh_cmd] for k, v in _dsh_options) or \
            (_dsh_bools and 'force' not in _dsh_commands[_dsh_cmd]):
        _dsh_refuse('option not allowed for this subcommand')
    _dsh_rest = _dsh_pos[1:]
    _dsh_counts = {'': (0, 0), 'sync': (0, 0), 'init': (0, 0), 'stage': (1, 2),
        'ticket': (2, None), 'usage': (1, 1), 'tickets': (0, 0), 'check-plan': (0, 0), 'set': (1, None),
        'add': (2, None), 'coverage': (1, None), 'blind': (1, None), 'tests': (1, 1),
        'ask': (1, 1), 'answered': (0, 0), 'finish': (0, 0), 'abandon': (0, 0), 'reopen': (0, 0), 'resume': (0, 0), 'commits': (0, 0)}
    _dsh_min, _dsh_max = _dsh_counts[_dsh_cmd]
    if len(_dsh_rest) < _dsh_min or (_dsh_max is not None and len(_dsh_rest) > _dsh_max):
        _dsh_refuse('unexpected positional arguments')
    if _dsh_cmd == 'usage' and (_dsh_rest[0] not in {'codex','claude'} or not any(k == 'snapshot' for k,v in _dsh_options)):
        _dsh_refuse('usage requires engine and --snapshot')
    if _dsh_cmd == 'stage' and (_dsh_rest[0] not in
            {'preflight', 'manifest', 'briefing', 'spec', 'plan', 'build', 'review', 'final'} or
            (len(_dsh_rest) == 2 and _dsh_rest[1] not in {'start', 'done', 'skip', 'fail'})):
        _dsh_refuse('unsupported stage/action')
    if _dsh_cmd == 'ticket' and (len([x for x in _dsh_rest if x in
            {'start', 'review', 'repair', 'done', 'fail', 'retry', 'reset'}]) != 1):
        _dsh_refuse('unsupported ticket action')
    if _dsh_cmd == 'ask' and _dsh_rest[0] not in {'briefing', 'spec', 'plan', 'action', 'stop'}:
        _dsh_refuse('unsupported wait kind')
    if _dsh_cmd == 'add' and _dsh_rest[0] not in {'concerns', 'additions', 'report',
            'debt.placeholders', 'debt.assumptions', 'debt.emptyEnv'}:
        _dsh_refuse('unsupported list')

    def _dsh_physical(value):
        return value == _DSH_RELEASE_SKILL and str(_dsh_Path(value).resolve()) == value

    _dsh_paths = [v for k, v in _dsh_options if k == 'skill-dir']
    if len(_dsh_paths) > 1 or any(not _dsh_physical(v) for v in _dsh_paths):
        _dsh_refuse('physical pinned release required')
    if _dsh_cmd == 'set' and any(x.startswith('skillDir=') and
            not _dsh_physical(x.split('=', 1)[1]) for x in _dsh_rest):
        _dsh_refuse('skillDir is pinned to the physical release')
    _dsh_state_path = _dsh_Path(_dsh_os.path.abspath(__file__)).parent / 'state.js'
    if _dsh_state_path.exists():
        try:
            _dsh_state = _dsh_json.loads(_dsh_state_path.read_text().split('=', 1)[1])
            if not _dsh_physical(_dsh_state.get('skillDir')):
                _dsh_refuse('stored physical release does not match this entrypoint')
        except (OSError, ValueError, IndexError, AttributeError, TypeError):
            _dsh_refuse('stored release metadata is not readable/valid')
    if _dsh_cmd == 'init' and not _dsh_paths:
        _dsh_options.append(('skill-dir', _DSH_RELEASE_SKILL))
    # Put boolean switches last: upstream otherwise consumes the following command as a value.
    _dsh_sys.argv = [_dsh_sys.argv[0], *_dsh_pos,
        *(v for k, value in _dsh_options for v in ('--' + k, value)),
        *_dsh_bools, '--no-serve']
