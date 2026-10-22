#!/usr/bin/env python3
"""B-N-2121 (dsh-montazh 3.1.43, Заря): НАСТОЯЩИЕ ворота vypusk-tegom на подставной ОБЩЕЙ копии (владелец nobody, без дома агента)
и живых временных службах systemd-run (свои имена stend-obsh-<случайное>-*; стоп — по сохранённым именам, не по маске).
Каждая проба: исправное · порча (факт внесения печатается) · возврат. Свой реестр, реестр агентов, журнал следа; боевые не трогаются.
Нужен зовущий — зарегистрированный агент с sudo -n (как stend-vypusk-kopii). Довод 1 — путь ворот (умолч. ../bin/vypusk-tegom).
Коды: 0 — все сошлись, 1 — расхождение, 2 — слепота стенда."""
import json,os,pwd,shutil,subprocess,sys,tempfile,uuid,yaml,base64
from pathlib import Path
gate=Path(sys.argv[1]).resolve() if len(sys.argv)>1 else Path(__file__).resolve().parents[1]/'bin/vypusk-tegom'
me=pwd.getpwuid(os.getuid()).pw_name
if subprocess.run(['sudo','-n','true']).returncode:print('СЛЕПОТА стенда: нужен sudo -n');sys.exit(2)
live=yaml.safe_load(Path('/etc/agent-registry/agents.yaml').read_text())['agenty']
caller=next((a['namerenie'] for a in live if a['namerenie']['polzovatel']==me),None)
if caller is None:print('СЛЕПОТА стенда: зовущий '+me+' не зарегистрированный агент');sys.exit(2)
NODE=shutil.which('node') or '/usr/local/bin/node';UCH='nobody';rnd=uuid.uuid4().hex[:8];PFX='stend-obsh-'+rnd+'-'
ok=fail=0;units=[]
def S(*a,check=True):return subprocess.run(['sudo','-n',*a],text=True,capture_output=True,check=check)
def check(name,fn):
 global ok,fail
 try:fn();ok+=1;print('PASS '+name)
 except AssertionError as e:fail+=1;m=str(e);print('FAIL '+name+' — '+(m if len(m)<=3000 else m[:400]+' … '+m[-2500:]))
B=Path(tempfile.mkdtemp(prefix='stend-obsh-',dir=os.environ.get('TMPDIR') or '/var/tmp'));B.chmod(0o755)
try:
 R=B/'dsh-obsh-fixture';(R/'src').mkdir(parents=True);(R/'test').mkdir()
 (R/'package.json').write_text(json.dumps({'name':'dsh-obsh-fixture','version':'0.0.1','files':['src']}))
 (R/'CHANGELOG.md').write_text('# History\n\n## 0.0.1 — fixture\n');(R/'src/srv.mjs').write_text('setInterval(()=>{},1e6);\n')
 FLAG=B/'porcha-flag'
 (R/'test/stend-zhivaya.sh').write_text('#!/bin/sh\n[ -e "'+str(FLAG)+'" ] && : > "$(dirname "$0")/../VZLOM"\necho "PASS стенд общей копии под $(id -un)"\n');(R/'test/stend-zhivaya.sh').chmod(0o755)
 C=B/'obsh';shutil.copytree(R,C);S('chown','-R',UCH+':nogroup',str(C));S('chmod','0750',str(C))
 wrap=B/'wrap.sh';wrap.write_text('#!/bin/sh\nexec '+NODE+' '+str(C)+'/src/srv.mjs\n');wrap.chmod(0o755)
 hid=B/'hid.sh';enc=base64.b64encode(str(C).encode()).decode()
 hid.write_text('#!/bin/sh\nR=$(printf %s "$1" | base64 -d)\nexec '+NODE+' "$R/src/srv.mjs"\n');hid.chmod(0o755)
 men=B/'mention.sh';men.write_text('#!/bin/sh\n# читает '+str(C)+'/package.json, кода корня не исполняет\nexec sleep 900\n');men.chmod(0o755)
 def unit(sfx,*cmd,imya=None):
  u=imya or PFX+sfx+'.service';S('systemd-run','--quiet','--unit='+u,'-p','User='+UCH,'-p','RuntimeMaxSec=900','--collect',*cmd);units.append(u);return u
 def stop(u):S('systemctl','stop',u,check=False);units.remove(u)
 ua=unit('a',NODE,str(C/'src/srv.mjs'));ub=unit('b','/bin/sh',str(wrap))
 reg=B/'plugins.yaml';sc=B/'scope.json';ag=B/'agents.yaml';zh=B/'zhurnal';S('install','-d','-o','root','-g','root','-m','0755',str(zh))
 sc.write_text(json.dumps({'package':'dsh-obsh-fixture','version':'0.0.1','copies':['obsh-fixture']}))
 OB={'uchetka':UCH,'yunity':[PFX+'*.service']}
 def setreg(ob=OB):
  row={'id':'obsh-fixture','path':str(C)}
  if ob is not None:row['obshchaya']=ob
  reg.write_text(yaml.safe_dump({'plugins':[row],'services':[]}))
 def setag(dom=False):
  a=[{'imya':'zovushchij','namerenie':caller}]
  if dom:a.append({'imya':'fixture-dom','namerenie':{'dom':str(C),'polzovatel':me,'sluzhba':caller['sluzhba']}})
  ag.write_text(yaml.safe_dump({'agenty':a}))
 def run():
  env={**os.environ,'VYPUSK_REESTR':str(reg),'VYPUSK_KOPII':str(sc),'VYPUSK_AGENTY':str(ag),'VYPUSK_ZHURNAL_DIR':str(zh)};env.pop('STENDY_INACHE',None)
  p=subprocess.run(['bash',str(gate),str(R)],text=True,capture_output=True,env=env,timeout=900);return p.returncode,p.stdout+p.stderr
 def green(extra=()):
  k,o=run();assert k==0,str(k)+o[-3000:]
  for x in ('ОБЩАЯ КОПИЯ obsh-fixture','учётка стендов '+UCH,'слепок общей копии obsh-fixture ДО','совпал с ДО','можно ставить',*extra):assert x in o,'нет «'+x+'»: '+o[-3000:]
  return o
 def blindt(word):
  k,o=run();assert k==2 and word in o,'код '+str(k)+', ждали 2 и «'+word+'»: '+o[-3000:];assert 'можно ставить' not in o
 setreg();setag()
 check('П1 исправное: общая копия, ExecStart node и обёртка с путём в тексте найдены, стенд под владельцем, слепок совпал → «✅»',
  lambda:green(('исполняют код 2 служб',ua+'('+UCH+') [ExecStart: '+str(C)+'/src/srv.mjs',ub+'('+UCH+') [ExecStart: обёртка '+str(wrap))))
 def p2():
  setreg(None);print('   порча: поле obshchaya снято');blindt('привязок к дому агента 0');setreg();print('   возврат: поле на месте');green()
 check('П2 без объявления → прежняя слепота «привязок 0»; возврат → «✅»',p2)
 def p3():
  S('chown','daemon',str(C));print('   порча: владелец корня → '+S('stat','-c','%U',str(C)).stdout.strip());blindt('принадлежит uid')
  S('chown',UCH,str(C));print('   возврат: владелец → '+S('stat','-c','%U',str(C)).stdout.strip());green()
 check('П3 корень чужого владельца → слепота; возврат → «✅»',p3)
 def p4():setreg({'uchetka':'root','yunity':OB['yunity']});print('   порча: uchetka=root');blindt('uchetka = root');setreg();green()
 check('П4 uchetka=root → слепота; возврат',p4)
 def p5():
  setreg({'uchetka':UCH,'yunity':[ua]});print('   порча: yunity только '+ua);blindt('неучтённый пользователь кода');k,o=run();assert ub in o and 'обёртка' in o,o[-2000:]
  setreg();green()
 check('(а) П5 обёртка вне корня (путь корня в тексте) вне образца → найдена и названа, слепота, не «0»; возврат',p5)
 def p5b():
  uh=unit('h','/bin/sh',str(hid),enc);print('   порча: служба '+uh+' — обёртка без пути корня в тексте (base64), исполняет код корня')
  import time;time.sleep(2)
  setreg({'uchetka':UCH,'yunity':[ua,ub]});k,o=run();assert k==2 and uh in o and 'процесс' in o and 'неучтённый' in o,str(k)+o[-2500:]
  stop(uh);print('   возврат: '+uh+' остановлена по имени');setreg();green()
 check('(а) П5б обёртка, НЕ называющая корень текстом, живая → найдена по процессу (cgroup), слепота; возврат',p5b)
 def p6():setreg({'uchetka':UCH,'yunity':OB['yunity']+['stend-obsh-net-takih-*.service']});print('   порча: лишний образец');blindt('объявление отстало');setreg();green()
 check('П6 образец без живых пользователей → «объявление отстало»; возврат',p6)
 def p7():setag(True);print('   порча: дом агента = корень копии');blindt('двойная привязка');setag();green()
 check('П7 поле + дом агента → «двойная привязка»; возврат',p7)
 def p8():
  FLAG.touch();print('   порча: стенд допишет VZLOM в корень (флаг '+str(FLAG)+')')
  k,o=run();assert k==1 and 'стенд изменил живую копию obsh-fixture' in o and 'VZLOM' in o,str(k)+o[-3000:];assert 'можно ставить' not in o
  FLAG.unlink();S('rm','-f',str(C/'VZLOM'));print('   возврат: флаг снят, VZLOM удалён ('+str(S('test','-e',str(C/'VZLOM'),check=False).returncode)+' = нет)');green()
 check('П8 стенд под владельцем изменил живую копию → ОТКАЗ код 1 с путём; возврат → «✅»',p8)
 def p9():
  um=unit('m','/bin/sh',str(men),imya='stend-obshm-'+rnd+'.service');print('   порча: служба '+um+' называет корень текстом, не исполняет');import time;time.sleep(1)
  blindt('неучтённый пользователь кода')
  setreg({**OB,'ne_ispolnyayut':[um]});green(('называют корень, не исполняют (объявлено): '+um,))
  setreg({**OB,'ne_ispolnyayut':[um,ua]});print('   порча: исполняющая '+ua+' объявлена неисполняющей');blindt('объявлена неисполняющей, а исполняет')
  stop(um);setreg();green()
 check('П9 упоминание корня без исполнения: вне объявления → слепота; в ne_ispolnyayut → «✅»; строгую службу так не скрыть',p9)
 def p11():
  ud=unit('d',sys.executable,'-c','import time;time.sleep(900)','x'*300);import time;time.sleep(1)
  pid=S('systemctl','show','-p','MainPID','--value',ud).stdout.strip();argv=S('cat','/proc/'+pid+'/cmdline').stdout.split('\0')
  print('   порча: служба '+ud+' (pid '+pid+'), довод без «/» длиной '+str(max(map(len,argv)))+' знаков в живом argv (cwd /) — Path.is_file() даёт ENAMETOOLONG')
  assert 'x'*300 in argv,'порча не внесена: довода нет в argv '+str(argv)[:200]
  green();stop(ud);print('   возврат: '+ud+' остановлена по имени');green()
 check('П11 довод процесса — не путь (ENAMETOOLONG): поиск не падает, «✅»; возврат',p11)
 def p10():
  for u in list(units):stop(u)
  print('   порча: все свои службы остановлены по именам');blindt('ни одна служба не исполняет код корня')
 check('П10 пользователей кода 0 → слепота «без пользователей», не «0»',p10)
finally:
 for u in list(units):S('systemctl','stop',u,check=False)
 S('rm','-rf','--',str(B),check=False)
print(f'ИТОГ: сошлось {ok} из {ok+fail}');sys.exit(0 if not fail else 1)
