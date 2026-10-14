#!/usr/bin/env python3
# B-N-2023: actual candidate sources, private root settings, fake external IO only.
import atexit,os,subprocess,sys,tempfile,shutil
from pathlib import Path
if subprocess.run(['sudo','-n','true'],capture_output=True).returncode != 0:
 print('СЛЕПОТА: нужен sudo для приватного root-файла и mount namespace');sys.exit(2)
repo=Path(os.environ.get('B2023_REPO',Path(__file__).resolve().parents[3]))
r=Path(tempfile.mkdtemp(prefix='b2023-evidence-'));(r/'evidence').mkdir()
atexit.register(lambda: subprocess.run(['sudo','-n','rm','-rf','--',str(r)],check=False))
from pathlib import Path
import tempfile,subprocess,json,shutil,os,sys,datetime
phase="PACKAGE";rows=[]
with tempfile.TemporaryDirectory(prefix='alfa-b2023-',dir='/var/tmp') as td:
 t=Path(td);t.chmod(0o755);subprocess.run(["sudo","-n","chown","coders:coders",str(t)],check=True);bin=t/'bin';bin.mkdir();config=t/'config';config.mkdir();setting=config/'telegram-id';setting.write_text('712345678\n');(config/'approvers.json').write_text('[823456789,934567891]\n');subprocess.run(['sudo','-n','chown','-R','0:0',str(config)],check=True);subprocess.run(['sudo','-n','chmod','755',str(config)],check=True);subprocess.run(['sudo','-n','chmod','644',str(setting)],check=True)
 for name in ['curl','logger']:
  p=bin/name;p.write_text('#!/usr/bin/python3\nimport sys,os,json\nwith open(os.environ["PROBE_CALLS"],"a") as f:f.write(json.dumps({"tool":'+repr(name)+',"argv":sys.argv[1:]})+"\\n")\n'+('sys.stdin.read();print(\'{"ok":true}\')\n' if name=='curl' else ''));p.chmod(0o755)
 # No production token files are opened; old private settings are deliberately stale.
 (bin/'cat').write_text('#!/bin/bash\ncase "$1" in /etc/dsh-alert.token|/etc/claudeclaw-alert.token) echo fixture-token;; /etc/dsh-alert.chat|/etc/claudeclaw-alert.chat) echo 619876543;; *) exec /usr/bin/cat "$@";; esac\n');(bin/'cat').chmod(0o755)
 reader=repo/'packages/dsh-storozha-sadik/bin/vladelec-tg-id'
 if reader.exists():shutil.copy2(reader,bin/'vladelec-tg-id')
 # Commands: exercise the actual owner_id function, with a pinned stand reader path.
 (t/'command.py').write_text("import runpy,json,os\nm=runpy.run_path(os.environ['PROBE_RECEIVER']);m['owner_id'].__globals__['OWNER_READER']='/usr/local/bin/vladelec-tg-id'\ntry:print(json.dumps({'owner':m['owner_id']()}))\nexcept Exception as e:print(str(e));raise SystemExit(2)\n")
 # Real Store/TelegramQueue decision, local fake card acknowledgement, no Telegram IO.
 (t/'social.mjs').write_text("import fs from 'node:fs';import {Store} from '"+str(repo/'packages/dsh-socseti/src/store.mjs')+"';import {TelegramQueue} from '"+str(repo/'packages/dsh-socseti/src/telegram-queue.mjs')+"';\nconst s=new Store(process.env.PROBE_STATE,{telegram:'-100222',vk:'123'}),q=new TelegramQueue(s,{approvalChatId:-100111,botId:999});s.execute('varvara','draft_post',{request_id:'request-0001',platform:'telegram',text:'Synthetic'});q.enqueueCards();const card=q.claim(),message={message_id:7,date:1,chat:{id:-100111},from:{id:999,is_bot:true},text:card.request.args.text,reply_markup:card.request.args.reply_markup};q.finish(card.id,{ok:true,result:message});console.log(JSON.stringify(q.processUpdate({update_id:1,callback_query:{id:'fixture',from:{id:712345678,is_bot:false},message,data:'publish:'+card.nonce}})));s.close();\n")
 namespace=t/'ns.py';namespace.write_text("from pathlib import Path\nimport subprocess,os,sys,json\nt=Path(sys.argv[1]);c=json.loads((t/'run.json').read_text());subprocess.run(['mount','--bind',str(t/'bin'),'/usr/local/bin'],check=True);p=subprocess.run(['sudo','-n','-u','coders','env',*[k+'='+v for k,v in c['env'].items()],*c['cmd']]);sys.exit(p.returncode)\n")
 rootenv={'PATH':str(bin)+':/usr/bin:/bin','HOME':str(t),'LC_ALL':'C.UTF-8','VLADELEC_TG_ID_FILE':str(setting),'SOCSETI_APPROVERS_FILE':str(config/'approvers.json'),'SOCSETI_OWNER_READER':str(bin/'vladelec-tg-id'),'PROBE_CALLS':str(t/'calls'),'PROBE_RECEIVER':str(repo/'packages/dsh-podpiski/sbin/sadik-komandy-priyomnik'),'SADIK_STEND':'1','SADIK_OWNER_FILE':str(t/'missing-old-owner'),'PROBE_STATE':str(t/'state')}
 for kind in ['dsh-alert','claudeclaw-alert','commands','social']:
  for status in ['present','missing','restored']:
   if status=='missing':subprocess.run(['sudo','-n','mv',str(setting),str(config/'saved')],check=True)
   if status=='restored':subprocess.run(['sudo','-n','mv',str(config/'saved'),str(setting)],check=True)
   if (t/'calls').exists():(t/'calls').unlink()
   if (t/'state').exists():shutil.rmtree(t/'state')
   cmd=['bash',str(repo/'packages/dsh-storozha-sadik/bin'/kind),'synthetic alert'] if kind.endswith('alert') else ['python3',str(t/'command.py')] if kind=='commands' else ['/opt/nodejs/node-v24.19.0-linux-x64/bin/node',str(t/'social.mjs')]
   (t/'run.json').write_text(json.dumps({'env':rootenv,'cmd':cmd}));got=subprocess.run(['sudo','-n','unshare','-m','--propagation','private','python3',str(namespace),str(t)],capture_output=True,text=True,timeout=20);calls=[json.loads(l) for l in (t/'calls').read_text().splitlines()] if (t/'calls').exists() else [];network=[x for x in calls if x['tool']=='curl'];want=(1 if kind=='social' else 2) if status=='missing' else 0
   good=got.returncode==want
   if status=='missing':good=good and not network
   elif kind.endswith('alert'):good=good and any(any('chat_id=712345678' in a for a in x['argv']) for x in network)
   elif kind=='commands':good=good and '"owner": 712345678' in got.stdout
   else:good=good and '"decision":"approved"' in got.stdout
   row={'type':kind,'state':status,'expectedCode':want,'actualCode':got.returncode,'passed':good,'curlCalls':len(network)};rows.append(row);(r/'evidence'/f'{phase}-{kind}-{status}.log').write_text(got.stdout+got.stderr);print(row,flush=True)
 subprocess.run(['sudo','-n','rm','-rf','--',str(config)],check=True)
(r/'evidence'/f'CONSUMERS-{phase}.json').write_text(json.dumps({'utc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'cases':rows,'privateRootOnly':True,'noModelTelegram':True},ensure_ascii=False,indent=2)+'\n');sys.exit(0 if all(x['passed'] for x in rows) else 1)
