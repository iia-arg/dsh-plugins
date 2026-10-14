#!/usr/bin/env python3
"""RU: Исполнение настоящего сторожа с изолированными нижними утилитами, без GPU/журнала/смены системной учётки.
EN: Execute the actual watcher with isolated lower-level tools; no GPU, system journal or account switching.
"""
from pathlib import Path
import os,sys,json,tempfile,subprocess,pwd,hashlib
root=Path(sys.argv[1]) if len(sys.argv)>1 else Path(__file__).resolve().parents[1]
if os.geteuid()!=0:
    print("СЛЕПОТА: stend-voice-tools требует root для договора golos-watch"); sys.exit(2)
results=[]
with tempfile.TemporaryDirectory(prefix='voice-tools-test-') as raw:
    d=Path(raw);bindir=d/'bin';bindir.mkdir();fixture=d/'input.ogg';fixture.write_bytes(b'fixture audio');alert_log=d/'alerts';account=pwd.getpwuid(os.getuid()).pw_name
    helpers={
      'espeak-ng':"import os,sys; from pathlib import Path; a=sys.argv[1:]; Path(a[a.index('-w')+1]).write_bytes(b'speech'); sys.exit(int(os.environ.get('VOICE_TEST_SYNTH_FAIL','0')))",
      'ffmpeg':"import os,sys; from pathlib import Path;\nif os.environ.get('VOICE_TEST_CONVERT_FAIL')=='1': print('conversion failed',file=sys.stderr); sys.exit(1)\nPath(sys.argv[-1]).write_bytes(b'converted')",
      'runuser':"import os,sys; a=sys.argv[1:]; assert a[:1]==['-u']; a=a[2:]; a=a[1:] if a[:1]==['--'] else a; os.execvpe(a[0],a,os.environ)",
      'journalctl':"import os,sys;\nif os.environ.get('VOICE_TEST_JOURNAL')=='fail': print('journal unavailable',file=sys.stderr); sys.exit(1)\nif os.environ.get('VOICE_TEST_JOURNAL')=='red': print('🔴 correction unavailable')",
      'alert':"import os,sys; from pathlib import Path; p=Path(os.environ['VOICE_TEST_ALERT_LOG']); p.write_text(p.read_text()+'\\n'+str(sys.argv[1:]) if p.exists() else str(sys.argv[1:])); sys.exit(int(os.environ.get('VOICE_TEST_ALERT_FAIL','0')))",
      'engine':"import os; print('не та фраза' if os.environ.get('VOICE_TEST_ENGINE_BAD')=='1' else 'проверка голоса')",
      'agent-command':"import os,sys; sys.stdin.read(); print('не та фраза' if os.environ.get('VOICE_TEST_AGENT_BAD')=='1' else 'проверка голоса'); sys.exit(int(os.environ.get('VOICE_TEST_AGENT_CODE','0')))",
      'logger':"import sys; sys.exit(0)",
    }
    for name,body in helpers.items():
        p=bindir/name;p.write_text('#!'+sys.executable+'\n'+body+'\n');p.chmod(0o755)
    env=os.environ.copy();env.update({'PATH':str(bindir)+':/usr/bin:/bin','GOLOS_REESTR':str(d/'agents.json'),'GOLOS_ALERT':str(bindir/'alert'),'GOLOS_DVIZHOK':str(bindir/'engine'),'GOLOS_PREDEL_PROBY':'2','GOLOS_KURSOR':str(d/'cursor'),'VOICE_TEST_ALERT_LOG':str(alert_log)})
    for name in list(env):
        if name.startswith('VOICE_TEST_') and name!='VOICE_TEST_ALERT_LOG':env.pop(name)
    def agents():
        out=[]
        for i in range(3):
            home=d/('agent-'+str(i));profile=home/'.dsh/profiles/web/cordis.patch.yml';profile.parent.mkdir(parents=True,exist_ok=True);profile.write_text('transcribeCommand: '+str(bindir/'agent-command')+'\n');out.append({'imya':'probe-'+str(i),'namerenie':{'platforma':'dsh','dom':str(home),'polzovatel':account}})
        (d/'agents.json').write_text(json.dumps({'agenty':out}));return out
    def trial(name,script,args,code,setting=None,change=None,contains=None):
        records=agents();out=d/'out.txt';out.unlink(missing_ok=True);alert_log.unlink(missing_ok=True);tenv=env.copy();tenv.update(setting or {})
        if change:change(records)
        q=subprocess.run(['bash',str(root/'bin'/script),*args],env=tenv,capture_output=True,text=True,timeout=10);assert q.returncode==code,(name,q.returncode,q.stdout,q.stderr)
        if contains:assert contains in q.stdout+q.stderr,(name,q.stdout,q.stderr)
        result={'name':name,'code':q.returncode,'stdout':q.stdout.replace(raw,'<temporary>').replace(str(root),'<subject>'),'stderr':q.stderr.replace(raw,'<temporary>').replace(str(root),'<subject>'),'output_exists':out.exists(),'output':out.read_text() if out.exists() else None}
        results.append(result);print('OK '+name)
    trial('watch-good-three','golos-watch',[],0,contains='3 из 3')
    trial('watch-missing-setting','golos-watch',[],1,change=lambda a:(Path(a[0]['namerenie']['dom'])/'.dsh/profiles/web/cordis.patch.yml').write_text('enabled: true\n'),contains='НЕТ transcribeCommand')
    trial('watch-duplicate','golos-watch',[],1,change=lambda a:(Path(a[0]['namerenie']['dom'])/'.dsh/profiles/web/cordis.patch.yml').write_text(('transcribeCommand: '+str(bindir/'agent-command')+'\n')*2),contains='задан 2 раз')
    trial('watch-missing-profile','golos-watch',[],1,change=lambda a:(Path(a[0]['namerenie']['dom'])/'.dsh/profiles/web/cordis.patch.yml').unlink(),contains='не читается')
    def missing_user(a):a[0]['namerenie']['polzovatel']='nonexistent-voice-probe-user';(d/'agents.json').write_text(json.dumps({'agenty':a}))
    trial('watch-missing-user','golos-watch',[],1,change=missing_user,contains='учётки')
    trial('watch-common-blind','golos-watch',[],2,setting={'VOICE_TEST_ENGINE_BAD':'1'},contains='СЛЕПОТА')
    trial('watch-agent-wrong-text','golos-watch',[],1,setting={'VOICE_TEST_AGENT_BAD':'1'},contains='фраза не узнана')
    trial('watch-agent-failure','golos-watch',[],1,setting={'VOICE_TEST_AGENT_CODE':'7'},contains='код 7')
    trial('watch-empty-registry','golos-watch',[],2,change=lambda a:(d/'agents.json').write_text('{"agenty":[]}'),contains='нет ни одного')
    trial('watch-unreadable-registry','golos-watch',[],2,change=lambda a:(d/'agents.json').unlink(),contains='не разобран')
    trial('watch-synth-failure','golos-watch',[],2,setting={'VOICE_TEST_SYNTH_FAIL':'1'},contains='не синтезирована')
    trial('watch-journal-red','golos-watch',[],1,setting={'VOICE_TEST_JOURNAL':'red'},contains='корректор')
    trial('watch-journal-blind','golos-watch',[],1,setting={'VOICE_TEST_JOURNAL':'fail'},contains='СЛЕПОТА читателя')
    trial('watch-alert-failure','golos-watch',[],3,setting={'VOICE_TEST_ENGINE_BAD':'1','VOICE_TEST_ALERT_FAIL':'1'},contains='НЕ ДОСТАВЛЕНА')
    trial('watch-unknown-argument','golos-watch',['--dry-run'],2,contains='ОТКАЗ')
assert not Path(raw).exists()
if len(sys.argv)>2:Path(sys.argv[2]).write_text(json.dumps({'root':str(root),'rows':results,'temporary_removed':True,'scope':'runuser/recognizer/synthesis/journal/alert stubbed; no real privilege/GPU/service; live scripts executed'},ensure_ascii=False,indent=2)+'\n')
print(f'PASS {len(results)}/{len(results)}')
