"""B-N-2048: actual ohvat_paketov in private mount/net namespaces, no host writes.

Run as root with --helper <npm-sostav> and --npm-dir <actual npm library>.
No PATH shim: both npm and sudo npm see the bind-mounted library. This is a
manual candidate test, not a nightly guard; namespace exits after each case.
The mount setup needs root; the measured function runs as its real caller iskra.
"""
import argparse
import hashlib
import json
import os
import pwd
from pathlib import Path
import re
import shlex
import shutil
import subprocess
import tempfile

NPM_TARGET = '/opt/nodejs/node-v24.19.0-linux-x64/lib/node_modules/npm'
NODE = '/opt/nodejs/node-v24.19.0-linux-x64/bin/node'
PLUGIN_ROOT = '/opt/iskra/plugins'


def block(source):
    text = source.read_text()
    start = text.index('ohvat_paketov() {')
    end = text.index('\n}\n', start) + 3
    return text[start:end]


def run(source, helper, npm_dir, scenario='healthy', plugins=None, manifest=None):
    if scenario == 'hooks' and plugins is not None:
        raise ValueError('hooks requires generated fixtures; external --plugins is read-only')
    with tempfile.TemporaryDirectory(prefix='nashi-ohvat-') as temporary:
        root = Path(temporary)
        root.chmod(0o755)
        caller = pwd.getpwnam('iskra')
        damage = None
        source_plugins = plugins
        if source_plugins is None:
            source_plugins = root / 'plugins'
            source_plugins.mkdir()
            for name, files in [('alfa', ['a.js']), ('beta', ['a.js', 'b.js']), ('polnyj', ['a.js'])]:
                package = source_plugins / name
                package.mkdir()
                (package / 'package.json').write_text(json.dumps(dict(name='fixture-'+name, version='1.0.0', files=files)))
                for name in files:
                    (package / name).write_text('fixture\n')
            (source_plugins / 'bez-manifesta').mkdir()
            if scenario == 'broken-manifest':
                bad = source_plugins / 'bityj'
                bad.mkdir()
                target = bad / 'package.json'
                target.write_text('{"name":"fixture-bityj","version":"1.0.0"}')
                before = hashlib.sha256(target.read_bytes()).hexdigest()
                target.write_text('{broken')
                after = hashlib.sha256(target.read_bytes()).hexdigest()
                witness = subprocess.run(['grep', '-cF', '{broken', str(target)], capture_output=True, text=True)
                assert before != after and witness.stdout.strip() == '1'
                damage = dict(target='/opt/iskra/plugins/bityj/package.json', before=before, after=after, fixed_string_count=1)
                print('DAMAGE', json.dumps(damage))
        manifest_path = root / 'manifest'
        if manifest is None:
            manifest_path.write_text('A|/opt/iskra/plugins/alfa/a.js|x\nA|/opt/iskra/plugins/beta/a.js|x\nA|/opt/iskra/plugins/polnyj/a.js|x\nA|/opt/iskra/plugins/polnyj/package.json|x\n')
        else:
            shutil.copyfile(manifest, manifest_path)
        home = root / 'home'
        home.mkdir()
        os.chown(home, caller.pw_uid, caller.pw_gid)
        hooks = {}
        if scenario == 'hooks':
            target = source_plugins / 'alfa/package.json'
            before = hashlib.sha256(target.read_bytes()).hexdigest()
            package = json.loads(target.read_text())
            hooks = {name: home / (name + '-ran') for name in ('prepack', 'prepare')}
            assert all(not marker.exists() for marker in hooks.values())
            package['scripts'] = {name: 'touch ' + shlex.quote(str(marker)) for name, marker in hooks.items()}
            target.write_text(json.dumps(package))
            after = hashlib.sha256(target.read_bytes()).hexdigest()
            witness = subprocess.run(['grep', '-cF', '"prepack"', str(target)], capture_output=True, text=True)
            assert before != after and witness.stdout.strip() == '1'
            damage = dict(target='/opt/iskra/plugins/alfa/package.json', before=before, after=after, fixed_string_count=1)
            print('HOOK FIXTURE', json.dumps(damage))
        trace_path = root / 'trace'
        trace_path.touch(mode=0o600)
        os.chown(trace_path, caller.pw_uid, caller.pw_gid)
        private_helper = root / 'helper'
        shutil.copyfile(helper, private_helper)
        private_helper.chmod(0o755)
        wrapper = root / 'parser'
        if scenario in ('empty-input', 'error-input', 'empty-files'):
            payload = {'empty-input': '', 'error-input': '{"error":{"code":"FIXTURE"}}', 'empty-files': '[{"files":[]}]'}[scenario]
            wrapper.write_text('#!/bin/bash\ncat >/dev/null\nprintf %s '+shlex.quote(payload)+' | '+shlex.quote(str(private_helper))+' "$@"\n')
        else:
            wrapper.write_text('#!/bin/bash\nexec '+shlex.quote(str(private_helper))+' "$@"\n')
        wrapper.chmod(0o755)
        program = root / 'coverage.sh'
        program.write_text('set -u\nexport LC_ALL=C.UTF-8\nprintf "CALLER user="; id -un\nprintf "VERSION outside="; npm --version\nprintf "VERSION sudo="; sudo -n bash -c "npm --version"\nNASHI_HOME='+shlex.quote(str(home))+'\nMANIFEST='+shlex.quote(str(manifest_path))+'\n'+block(source)+'\nexec 9>'+shlex.quote(str(root/'trace'))+'\nBASH_XTRACEFD=9\nset -x\nohvat_paketov\ncode=$?\nset +x\nexit "$code"\n')
        mount_script = root / 'mount.sh'
        commands = ['set -euo pipefail', 'mount --make-rprivate /', 'mount --bind '+shlex.quote(str(npm_dir))+' '+NPM_TARGET,
                    'mount -t tmpfs -o mode=755 tmpfs /usr/local/bin', 'ln -s '+NODE+' /usr/local/bin/node',
                    'ln -s '+NPM_TARGET+'/bin/npm-cli.js /usr/local/bin/npm']
        if scenario != 'missing-helper':
            commands += ['cp '+shlex.quote(str(wrapper))+' /usr/local/bin/npm-sostav', 'chmod 755 /usr/local/bin/npm-sostav']
        commands += ['mount --bind '+shlex.quote(str(source_plugins))+' '+PLUGIN_ROOT,
                     'mount -o remount,bind,ro '+PLUGIN_ROOT,
                    'exec sudo -n -u iskra env HOME='+shlex.quote(str(home))+' bash '+shlex.quote(str(program))]
        mount_script.write_text('\n'.join(commands)+'\n')
        q = subprocess.run(['unshare', '--mount', '--net', '--', 'bash', str(mount_script)], capture_output=True, text=True, timeout=120,
                           env=dict(PATH='/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin', HOME=str(home), LANG='C.UTF-8'))
        trace = (root/'trace').read_text() if (root/'trace').exists() else ''
        # Independent name witness from actual loop execution, including fully covered packages.
        current = None
        names = []
        for line in trace.splitlines():
            try:
                fields = shlex.split(line.lstrip('+ '))
            except ValueError:
                fields = []
            if len(fields) == 4 and fields[0] == '[' and fields[1] in ('-r', '-e') and fields[2].endswith('/package.json'):
                current = Path(fields[2]).parent.name
            if re.match(r'^\++ paketov=\d+$', line) and current and current not in names:
                names.append(current)
        return dict(code=q.returncode, output=q.stdout+q.stderr, trace=trace, names=names, scenario=scenario, damage=damage, hooks={name: dict(path=str(marker), appeared=marker.exists()) for name, marker in hooks.items()})


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--source', type=Path, default=Path(__file__).resolve().parents[1]/'dorabotki/nashi-dorabotki.sh')
    parser.add_argument('--helper', type=Path, default=Path('/usr/local/bin/npm-sostav'))
    parser.add_argument('--npm-dir', type=Path, default=Path(NPM_TARGET))
    parser.add_argument('--scenario', choices=['healthy','broken-manifest','empty-input','error-input','empty-files','missing-helper','hooks'], default='healthy')
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--observe', action='store_true')
    parser.add_argument('--plugins', type=Path)
    parser.add_argument('--manifest', type=Path)
    args = parser.parse_args()
    if os.geteuid() != 0:
        parser.error('root needed only for the private bind mounts')
    result = run(args.source.resolve(), args.helper.resolve(), args.npm_dir.resolve(), args.scenario, args.plugins, args.manifest)
    args.output.write_text(json.dumps(result, ensure_ascii=False, indent=2)+'\n')
    print(result['output'])
    print('NAMES',json.dumps(result['names'],ensure_ascii=False))
    assert 'CALLER user=iskra' in result['output'], result['output']
    if args.observe:
        return
    if args.scenario in ('healthy', 'hooks'):
        assert result['code'] == 0, result['output']
        if args.plugins is None:
            assert result['names'] == ['alfa','beta','polnyj'], result['names']
            assert 'под учётом 4 файлов из 7 (пакетов 3)' in result['output']
            assert 'bez-manifesta' not in result['output']
        if args.scenario == 'hooks':
            assert result['hooks'] and not any(h['appeared'] for h in result['hooks'].values()), result['hooks']
    else:
        assert result['code'] == 2, result['output']
        assert 'СЛЕПОТА охвата:' in result['output'] and 'не измерен' in result['output']
        assert 'под учётом' not in result['output'].split('не измерен')[-1]
        if args.scenario == 'broken-manifest':
            assert '/opt/iskra/plugins/bityj' in result['output']
        if args.scenario == 'missing-helper':
            assert 'npm-sostav не найден — нужен dsh-pribory ≥ 3.1.2' in result['output']


if __name__ == '__main__':
    main()
