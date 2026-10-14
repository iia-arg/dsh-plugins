#!/usr/bin/env python3
"""Private UID-transfer chain: v2 put -> actual postman -> actual receiver/ledger.

Root is needed only to change the owner of files INSIDE the temporary fixture.
Account lookup and owner notification are substitutes; no accounts or services are created.
"""
import argparse
import importlib.util
import json
import os
from pathlib import Path
import pwd
import subprocess
import tempfile
from types import SimpleNamespace
from unittest.mock import patch

PACKAGE = Path(__file__).resolve().parents[1]


def load(path, name):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--telegram', type=Path, default=PACKAGE.parent/'dsh-telegram-multiagent')
    parser.add_argument('--postman', type=Path, default=PACKAGE.parent/'a2a-bus/sbin/a2a-pochtalon.py')
    parser.add_argument('--receiver-user', default='nobody')
    args = parser.parse_args()
    if os.geteuid() != 0:
        print('СЛЕПОТА: private UID-transfer требует root; боевых ящиков не касается')
        return 2
    receiver = pwd.getpwnam(args.receiver_user)
    if receiver.pw_uid == 0:
        raise ValueError('receiver must differ from the root fixture sender')
    v2 = load(PACKAGE/'libexec/a2a-v2.py', 'chain_v2')
    postman = load(args.postman, 'chain_postman')
    # Every accidental subprocess in the postman is an error, not a live notification.
    def no_transport(*args, **kwargs):
        raise AssertionError('live transport is forbidden in this fixture')

    node = r'''
import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import vm from 'node:vm';
const [pkg,folder,filename,ledger]=process.argv.slice(1);
const {extractFunction}=await import(path.join(pkg,'test/extract.mjs'));
const {MessageReceipts,mailEnvelope}=await import(path.join(pkg,'src/message-receipts.js'));
const source=fs.readFileSync(path.join(pkg,'src/index.js'),'utf8');
const scope=vm.createContext({fs,process,os:{userInfo:()=>({username:'receiver-agent'})}});
scope.spoolSender=vm.runInContext('('+extractFunction(source,'spoolSender')+')',scope);
const shown=vm.runInContext('('+extractFunction(source,'spoolPokazanPochtalonom')+')',scope);
const raw=fs.readFileSync(path.join(folder,filename)),e=mailEnvelope(raw);
const receipts=new MessageReceipts(ledger,{owner:'chain-fixture'});
try {
 const sender=scope.spoolSender(filename);assert.equal(sender,'my-agent');assert.equal(shown(filename,folder),true);
 const r=receipts.receive('file:'+filename,raw,{sourcePath:path.join(folder,filename),sender,logicalKey:e.logicalKey,expectsReply:e.expectsReply});
 assert.equal(receipts.get(r.id).sender,'my-agent');assert.equal(e.protocol.metadata.recipient.id,'receiver-agent');
 assert.equal(receipts.acceptEnvelope(r.id,e.protocol,'receiver-agent').action,'terminal');
 assert.equal(receipts.get(r.id).outcome,'capability_response');
 console.log('ЗЕЛЁНОЕ полный sender в ledger; capability_probe terminal; совместимость показа почтальона');
} finally {receipts.close();}
'''
    with tempfile.TemporaryDirectory(prefix='chain-agent-name-') as temp:
        root = Path(temp)
        root.chmod(0o755)
        spool = root/'receiver-agent'
        spool.mkdir(mode=0o733)
        os.chown(spool, receiver.pw_uid, receiver.pw_gid)
        ledger = root/'ledger'
        ledger.mkdir(mode=0o700)
        os.chown(ledger, receiver.pw_uid, receiver.pw_gid)
        metadata = {'kind': 'capability_probe', 'reply_channel': 'ledger', 'delivery_id': 'hyphen-chain',
                    'recipient': {'id': 'receiver-agent'}, 'supersedes': {'decision_id': 'absent:chain'}}
        original = pwd.getpwuid
        def names(uid):
            entry = original(uid)
            return SimpleNamespace(pw_name='my-agent' if uid == 0 else 'receiver-agent', pw_gid=entry.pw_gid)
        with patch.object(pwd, 'getpwuid', side_effect=names):
            target = v2.put({'spool': str(spool)}, metadata, '')
            before = target.stat()
            assert before.st_uid == 0
            wire = target.read_bytes()
            assert postman.eto_pismo(target.name, 'my-agent', wire)[0]
            postman.KOREN = str(root)
            with patch.object(postman, 'uvedomit', return_value=(True, '', None)), patch.object(postman.subprocess, 'run', side_effect=no_transport):
                assert postman.razobrat_yashchik(spool.name) == (1, 0)
                assert postman.razobrat_yashchik(spool.name) == (0, 0)
            after = target.stat()
            assert after.st_uid == receiver.pw_uid and after.st_ino != before.st_ino
            assert after.st_mode & 0o777 == 0o600 and target.read_bytes() == wire
            print(json.dumps({'sender_uid_before': before.st_uid, 'receiver_uid_after': after.st_uid,
                              'inode_before': before.st_ino, 'inode_after': after.st_ino, 'private_file': target.name}))
        def receiver_identity():
            os.setgid(receiver.pw_gid)
            os.setuid(receiver.pw_uid)
        result = subprocess.run(['node', '--input-type=module', '-e', node, str(args.telegram.resolve()),
                                 str(spool), target.name, str(ledger)], capture_output=True, text=True,
                                timeout=20, preexec_fn=receiver_identity)
        print(result.stdout, end='')
        if result.returncode:
            print(result.stderr, end='')
        return result.returncode


if __name__ == '__main__':
    raise SystemExit(main())
