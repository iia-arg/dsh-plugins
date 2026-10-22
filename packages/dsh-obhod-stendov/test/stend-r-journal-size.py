#!/usr/bin/env python3
"""Сторож R (учёт 0.1.10, упрощённый): журнал расхода каждого источника против ОДНОГО policy-файла писателя и читателя.
Решение Забавы по policy (18.10, письмо 15:01:18Z; Вениамин согласен 18:01 МСК) + его добавка «писатель молчит». Заря.
Только stat (lstat) и `systemctl is-active` — содержимое R не читается. Своих пределов нет: предел — fileMaxBytes из policy.
КРАСНОЕ ровно в трёх случаях, каждое с предметом:
  (а) policy нет / нечитаема / не защищена / форма не та — {schemaVersion:1, fileMaxBytes, recordMaxBytes}, целые, 0<record<file;
  (б) R-файл источника БОЛЬШЕ fileMaxBytes — обрезка не сработала (писатель обрезает при size+строка > fileMaxBytes: ровно предел законен);
  (в) служба TG источника active, а её R нет или mtime старше 300 с — «писатель молчит» (heartbeat писателя 15 с, usage-runtime.js).
Жёлтого нет. СЛЕПОТА (код 2, не красное): источник не судится — каталог/файл R unsafe, служба не опрошена, конфиг источников не задан.
Служба не active и R нет — «не судится, писать некому», не красное. Код: 0 — молчит, 1 — есть красное, 2 — слепота/отказ без красного.
Доводы (неизвестный ввод — ОТКАЗ, код 2):
  --otlozheno               включение отложено до окна учёта 0.1.10: «не ведётся», код 0, ничего не читается;
  --istochniki <профиль>    профиль источников ЧИТАТЕЛЯ Гаммы (b33 c633f007: /var/lib/autopilot-usage/source-profile.json; при --profile
                            у collect — тот же путь): participants[] → name, uid, runtimeSource.raw (путь R), служба — поле POLE_SLUZHBY.
                            Свой список — нет. Профиля нет / не root-защищён / не той формы / у участника нет поля службы — СЛЕПОТА с именем;
  --policy <путь>           только для проб (печатается как ПОДМЕНА); по умолчанию /etc/dsh-telegram-multiagent/usage-runtime-policy.json.
Строки начинаются с «STEND-R-METRIC: » (фильтр обхода ^STEND-(…|R-METRIC): ), признак FAIL/СЛЕПОТА — внутри строки.
Один проход: <=7 источников, общий таймер 30 с.
НЕ ЛОВИТ: чужой touch R (ложное зелёное по mtime); молчание и переполнение между прогонами — сторож судит раз в сутки (ночь 03:40Z);
  содержимое и целость R (gap, порча строк, отставший watermark) — это читатель; service active ≠ писатель включён в этой службе.
"""
import argparse,hashlib,json,os,re,signal,stat,subprocess,sys,time
POLICY='/etc/dsh-telegram-multiagent/usage-runtime-policy.json'
MOLCHANIE_S=300   # правило Вениамина 18:01 МСК: 5 мин при heartbeat писателя 15 с
# Поле службы TG у участника — ПЛЕЙСХОЛДЕР (письмо Забавы 16:23:13Z: Гамма поле не назвала). Значение взято из коммита Гаммы
# 3e8f1713 (18.10 16:38:55Z, «require TG writer service in shared R source profile»: participants[].tgService, *.service) —
# П7 Гаммы его ещё не принял; назовёт иначе — правится ТОЛЬКО эта строка.
POLE_SLUZHBY='tgService'
SLUZHBA_RE=re.compile(r'[A-Za-z0-9][A-Za-z0-9_.@:-]*\.service')   # форма имени у Гаммы (usage_registration.py, profile_record)
class Blind(Exception):pass
class Krasnoe(Exception):pass

def policy(path):
 """(а): → (fileMaxBytes, recordMaxBytes, sha256) или Krasnoe с предметом."""
 try:info=os.lstat(path);parent=os.lstat(os.path.dirname(os.path.abspath(path)))
 except OSError as e:raise Krasnoe(f'(а) policy {path}: нет или не прочитана — {e.strerror}') from None
 if not stat.S_ISREG(info.st_mode) or info.st_uid!=0 or info.st_mode&0o022:raise Krasnoe(f'(а) policy {path}: не защищена (нужен обычный файл root без записи группе/прочим)')
 if not stat.S_ISDIR(parent.st_mode) or parent.st_uid!=0 or parent.st_mode&0o022:raise Krasnoe(f'(а) policy {path}: каталог не защищён')
 def pairs(p):
  if len({k for k,v in p})!=len(p):raise ValueError('повтор ключа')
  return dict(p)
 try:
  with open(path,'rb') as f:raw=f.read(64*1024+1)
  if len(raw)>64*1024:raise ValueError('больше 64 КиБ')
  d=json.loads(raw.decode('utf-8'),object_pairs_hook=pairs,parse_constant=lambda c:(_ for _ in ()).throw(ValueError(c)))
 except (OSError,UnicodeError,ValueError,RecursionError) as e:raise Krasnoe(f'(а) policy {path}: негодный JSON ({e})') from None
 ok=isinstance(d,dict) and set(d)=={'schemaVersion','fileMaxBytes','recordMaxBytes'} and type(d.get('schemaVersion')) is int and d['schemaVersion']==1
 n,r=(d.get('fileMaxBytes'),d.get('recordMaxBytes')) if isinstance(d,dict) else (None,None)
 if not (ok and type(n) is int and type(r) is int and 0<r<n<=2**53-1):
  raise Krasnoe(f'(а) policy {path}: форма не та — нужно ровно {{schemaVersion:1, fileMaxBytes, recordMaxBytes}}, целые, 0<recordMaxBytes<fileMaxBytes')
 return n,r,hashlib.sha256(raw).hexdigest()

def istochniki(path):
 """Профиль источников читателя Гаммы → [{istochnik, uid, root, r, sluzhba}]. Любой изъян — Blind с предметом (не свой список)."""
 try:info=os.lstat(path);parent=os.lstat(os.path.dirname(os.path.abspath(path)))
 except OSError as e:raise Blind(f'профиль источников {path}: нет или не прочитан — {e.strerror}') from None
 if not stat.S_ISREG(info.st_mode) or info.st_uid!=0 or info.st_mode&0o022 or not stat.S_ISDIR(parent.st_mode) or parent.st_uid!=0 or parent.st_mode&0o022:
  raise Blind(f'профиль источников {path}: не защищён (нужен обычный файл root в каталоге root, без записи группе/прочим)')
 try:
  with open(path,'rb') as f:raw=f.read(1024*1024+1)
  if len(raw)>1024*1024:raise ValueError('больше 1 МиБ')
  d=json.loads(raw.decode('utf-8'))
 except (OSError,UnicodeError,ValueError,RecursionError) as e:raise Blind(f'профиль источников {path}: негодный JSON ({e})') from None
 uch=d.get('participants') if isinstance(d,dict) else None
 if not isinstance(uch,list) or not uch:raise Blind(f'профиль источников {path}: нет списка participants[]')
 out=[]
 for k,p in enumerate(uch):
  i=p.get('name') if isinstance(p,dict) else None
  kto=f'участник {i}' if isinstance(i,str) and i else f'участник №{k+1}'
  if not (isinstance(i,str) and re.fullmatch(r'[a-z_][a-z0-9_-]{0,31}',i)):raise Blind(f'профиль {path}: {kto} — name не имя учётки')
  rs=p.get('runtimeSource');rp=rs.get('raw') if isinstance(rs,dict) else None
  if not (type(p.get('uid')) is int and p['uid']>0):raise Blind(f'профиль {path}: {kto} — uid не целое > 0')
  if not (isinstance(rp,str) and os.path.isabs(rp) and os.path.normpath(rp)==rp and len(rp)<=4096):raise Blind(f'профиль {path}: {kto} — runtimeSource.raw не абсолютный нормальный путь')
  sv=p.get(POLE_SLUZHBY)
  if not (isinstance(sv,str) and len(sv)<=255 and SLUZHBA_RE.fullmatch(sv)):raise Blind(f'профиль {path}: {kto} — нет поля службы {POLE_SLUZHBY} (*.service): (в) не проверить')
  out.append(dict(istochnik=i,uid=p['uid'],root=os.path.dirname(rp),r=rp,sluzhba=sv))
 if len({x['istochnik'] for x in out})!=len(out):raise Blind(f'профиль {path}: повтор имени участника')
 return out

def sluzhba_active(unit):
 try:q=subprocess.run(['systemctl','is-active','--',unit],capture_output=True,text=True,timeout=5)
 except (OSError,subprocess.SubprocessError) as e:raise Blind(f'служба {unit} не опрошена: {e}') from None
 sost=q.stdout.strip()
 if not sost:raise Blind(f'служба {unit} не опрошена: пустой ответ systemctl (код {q.returncode})')
 return sost=='active',sost

def sudit(policy_path,src,now=None):
 """→ (код, строки). src — [{istochnik, uid, root, sluzhba}] (нормализованный вид из конфига источников)."""
 out=[];now=time.time() if now is None else now
 try:n,r,sha=policy(policy_path)
 except Krasnoe as e:return 1,['STEND-R-METRIC: FAIL '+str(e),'STEND-R-METRIC: FAIL итог · КРАСНОЕ (а) · источники не судились — предела нет']
 if not 1<=len(src)<=7:return 2,[f'STEND-R-METRIC: СЛЕПОТА конфиг источников: {len(src)} источников (нужно 1..7)']
 kr={'б':0,'в':0};sl=0
 for s in src:
  i=s['istochnik']
  try:
   akt,sost=sluzhba_active(s['sluzhba'])
   try:d=os.lstat(s['root'])
   except FileNotFoundError:d=None
   if d is not None and (not stat.S_ISDIR(d.st_mode) or d.st_uid!=s['uid'] or d.st_mode&0o077):raise Blind(f"{i}: каталог R unsafe (не каталог / чужой uid / доступ группе-прочим): {s['root']}")
   p=s['r']
   try:f=os.lstat(p) if d is not None else None
   except FileNotFoundError:f=None
   if f is not None and (not stat.S_ISREG(f.st_mode) or f.st_uid!=s['uid'] or f.st_mode&0o777!=0o600 or f.st_nlink!=1):
    raise Blind(f'{i}: R unsafe (не обычный файл / uid / режим ≠0600 / nlink ≠1): {p}')
  except Blind as e:
   sl+=1;out.append('STEND-R-METRIC: СЛЕПОТА '+str(e));continue
  if f is None:
   if akt:kr['в']+=1;out.append(f"STEND-R-METRIC: FAIL {i} · КРАСНОЕ (в) писатель молчит · служба {s['sluzhba']} active, а R нет: {p}")
   else:out.append(f"STEND-R-METRIC: {i} · служба {s['sluzhba']} {sost}, R нет · не судится (писать некому)")
   continue
  vozr=now-f.st_mtime;bedy=[]
  if f.st_size>n:kr['б']+=1;bedy.append(f'КРАСНОЕ (б) обрезка не сработала · {f.st_size} Б > fileMaxBytes {n} Б')
  if akt and vozr>MOLCHANIE_S:kr['в']+=1;bedy.append(f"КРАСНОЕ (в) писатель молчит · служба {s['sluzhba']} active, mtime R {int(vozr)} с назад > {MOLCHANIE_S} с")
  out.append('STEND-R-METRIC: '+('FAIL ' if bedy else '')+f"{i} · {f.st_size} Б из {n} · mtime {int(vozr)} с назад · служба {sost}"+(' · '+' · '.join(bedy) if bedy else ' · норма'))
 vsego=kr['б']+kr['в']
 out.append('STEND-R-METRIC: '+('FAIL ' if vsego else '')+f"итог · policy {policy_path} sha256 {sha[:16]} · fileMaxBytes {n} · recordMaxBytes {r} · источников {len(src)}"
            f" · КРАСНЫХ {vsego} (б {kr['б']}, в {kr['в']})"+(f' · СЛЕПОТА {sl} из {len(src)}' if sl else ''))
 return (1 if vsego else (2 if sl else 0)),out

def main(argv=None):
 class Tiho(argparse.ArgumentParser):
  def error(self,message):raise SystemExit(2)   # своя строка ОТКАЗ ниже — без usage/error argparse
 p=Tiho(description=__doc__,allow_abbrev=False,formatter_class=argparse.RawDescriptionHelpFormatter)
 p.add_argument('--otlozheno',action='store_true');p.add_argument('--istochniki');p.add_argument('--policy')
 try:a=p.parse_args(argv)
 except SystemExit as e:
  if e.code==0:return 0
  print('ОТКАЗ: доводы — --otlozheno | [--policy <путь>] --istochniki <конфиг>; ничего не мерилось');return 2
 if a.otlozheno:
  if a.istochniki or a.policy:print('ОТКАЗ: --otlozheno не сочетается с другими доводами');return 2
  print('STEND-R-METRIC: не ведётся, включение отложено (до окна учёта 0.1.10) · ничего не читалось');return 0
 pp=a.policy or POLICY
 if a.policy:print(f'STEND-R-METRIC: ПОДМЕНА policy {pp} — только для проб')
 def expired(s,f):raise Blind('предел 30 с')
 old=signal.signal(signal.SIGALRM,expired);signal.alarm(30)
 try:
  try:policy(pp)
  except Krasnoe as e:
   for x in sudit(pp,[])[1]:print(x)
   return 1
  if not a.istochniki:print('STEND-R-METRIC: СЛЕПОТА конфиг источников не задан (--istochniki <конфиг читателя Гаммы>) — свой список источников сторож не держит');return 2
  k,out=sudit(pp,istochniki(a.istochniki))
  for x in out:print(x)
  return k
 except Blind as e:print('STEND-R-METRIC: СЛЕПОТА '+str(e));return 2
 finally:signal.alarm(0);signal.signal(signal.SIGALRM,old)
if __name__=='__main__':raise SystemExit(main())
