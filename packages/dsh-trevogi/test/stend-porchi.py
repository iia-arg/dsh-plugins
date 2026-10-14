#!/usr/bin/env python3
# RU: Временные копии настоящего кода: исправное → порча → восстановление. Не трогает исходный пакет.
# EN: Temporary copies of real code: healthy → damaged → restored. Does not modify the source package.
import hashlib, os, pathlib, shutil, subprocess, sys, tempfile
ROOT=pathlib.Path(__file__).resolve().parents[1]
CASES=[
    ('DSH_PROBA', 'bin/agent-alert', "  1) echo 'agent-alert: проба, не отправлено'", "  99) echo 'agent-alert: проба, не отправлено'", 'test_probe_blocks_all_outputs_except_journal'),
    ('PROBA_TEXT', 'bin/agent-alert', 'не отправлено текст[0:120]=$nachalo"', 'не отправлено"', 'test_probe_journal_names_text'),
    ('TOKEN_ARGV', 'bin/agent-alert', 'curl -sS -m "$TAJMAUT"', 'curl -sS "$token" -m "$TAJMAUT"', 'test_unmarked_sends_and_keeps_token_out_of_argv'),
    ('TOKEN_LOG', 'bin/agent-alert', '  resp="${resp//"$token"/[redacted]}"', "  : 'MUTATION_TOKEN_LOG'", 'test_echoed_provider_token_is_redacted'),
]
def checksum(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def check(root, name):
    env=os.environ.copy();env.update(TREVOGI_TEST_ROOT=str(root),PYTHONDONTWRITEBYTECODE='1')
    p=subprocess.run(['python3',str(ROOT/'test/stend-nastroek-proby.py'),'AlertTests.'+name],env=env,text=True,capture_output=True,timeout=20)
    return p.returncode
with tempfile.TemporaryDirectory(prefix='trevogi-damage-') as tmp:
    root=pathlib.Path(tmp)/'package';shutil.copytree(ROOT,root,ignore=shutil.ignore_patterns('.git','__pycache__'))
    for name,rel,old,new,test in CASES:
        p=root/rel;before=p.read_bytes();good=check(root,test)
        if good!=0:sys.exit('healthy stand failed: '+name)
        text=before.decode();n=text.count(old)
        if n!=1:sys.exit('mutation anchor mismatch: '+name)
        sha=checksum(p);p.write_text(text.replace(old,new))
        # RU: Внесение подтверждается фиксированной строкой и независимой суммой файла.
        # EN: Insertion is confirmed by a fixed-string search and an independent file hash.
        grep=subprocess.run(['grep','-cF','--',new,str(p)],capture_output=True,text=True)
        changed=checksum(p);print(name,'replacements',n,'grep-F',grep.stdout.strip(),'sha',sha,'->',changed,flush=True)
        if grep.returncode!=0 or grep.stdout.strip()!='1' or changed==sha:sys.exit('mutation was not inserted')
        bad=check(root,test);p.write_bytes(before);restored=check(root,test)
        print(name,'rc',good,bad,restored,'restored-sha',checksum(p),flush=True)
        if (good,bad,restored)!=(0,1,0) or checksum(p)!=sha:sys.exit('mutation/recovery failed: '+name)
