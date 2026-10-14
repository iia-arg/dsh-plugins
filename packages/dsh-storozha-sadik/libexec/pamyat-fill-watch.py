#!/usr/bin/python3 -B
"""Observe registry agents' memory; never write their data or send agent tasks."""
import argparse,datetime as dt,fcntl,json,os,re,math,sqlite3,subprocess,tempfile,threading,time
from pathlib import Path
import yaml
DAY=86400
DEFAULT_DAYS=14
MAX_BYTES=256*1024*1024
MAX_FILES=2000
MAX_LINE=16*1024*1024
FINISH=re.compile(r'^\[dsh-pamyat-secretary(?: [^\]]+)?\] дистилляция: ЗАКОНЧЕНА(?:\s|$)')
class Unmeasured(Exception):pass
def is_finished(line):return bool(FINISH.search(line))

def registry(path):
    value=yaml.safe_load(path.read_text())
    agents=value.get('agenty') if isinstance(value,dict) else None
    if not isinstance(agents,list) or not agents:raise Unmeasured('реестр не содержит непустого agenty')
    output=[];seen=set()
    for i,a in enumerate(agents):
        name=a.get('imya') if isinstance(a,dict) else None
        row={'agent':name if isinstance(name,str) else f'строка-{i+1}'}
        n=a.get('namerenie',{}) if isinstance(a,dict) else {}
        if not isinstance(n,dict):n={}
        home,unit=n.get('dom'),n.get('sluzhba')
        if (not isinstance(name,str) or not re.fullmatch(r'[a-z][a-z0-9_-]{0,63}',name)
                or name in seen or not isinstance(home,str) or not home.startswith('/')
                or '..' in Path(home).parts or not isinstance(unit,str)
                or not re.fullmatch(r'[a-zA-Z0-9][a-zA-Z0-9_.@:-]*\.service',unit)):
            row['config_error']='неполная/повторная запись реестра (imya/dom/sluzhba)'
        else:row.update(home=home,unit=unit);seen.add(name)
        output.append(row)
    return output

def stream_json(command,budget,deadline,otbor=False):
    remaining=min(30,deadline-time.monotonic())
    if remaining<=0:raise Unmeasured('предел времени обхода')
    # Spool stderr locally, not into report: log text can contain private content.
    with tempfile.TemporaryFile() as err:
        proc=subprocess.Popen(command,stdout=subprocess.PIPE,stderr=err)
        # B-N-2040: убитый таймером поток отдаёт readline оборванный хвост строки; без флага он уходил в json.loads и
        # подавался как «JSONDecodeError» (iskra/zarya 09–14.10). Срабатывание таймера и строка без \n — честный отказ.
        ubit=[False]
        def predel():ubit[0]=True;proc.kill()
        timer=threading.Timer(remaining,predel);timer.daemon=True;timer.start()
        try:
            while True:
                line=proc.stdout.readline(MAX_LINE+1)
                if not line:break
                budget[0]+=len(line)
                if len(line)>MAX_LINE or budget[0]>MAX_BYTES:
                    raise Unmeasured('предел размера журнала; окно не измерено')
                if time.monotonic()>deadline:raise Unmeasured('предел времени обхода')
                if ubit[0] or not line.endswith(b'\n'):
                    raise Unmeasured(f'предел {remaining:.0f} c чтения журнала; окно не измерено')
                yield json.loads(line)
            if ubit[0]:raise Unmeasured(f'предел {remaining:.0f} c чтения журнала; окно не измерено')
            rc=proc.wait();err.seek(0);diag=err.read(1)
            # A-N-1710: journalctl --grep без совпадений — код 1 при ПУСТЫХ stdout и stderr (замер 07.10, systemd 255).
            # Только при отборе, ни байта прочитанного и пустом stderr это «совпадений нет»; иначе — прежний отказ.
            if rc!=0 and not (otbor and rc==1 and budget[0]==0 and not diag):raise Unmeasured('чтение журнала отказало/таймаут')
            if diag:raise Unmeasured('чтение журнала выдало диагностику; полнота неизвестна')
        finally:
            timer.cancel()
            if proc.poll() is None:proc.kill()
            proc.wait();proc.stdout.close()

# B-N-738: DSH 0.1.7+/0.2.0 пишет журнал новым ПОКОЛЕНИЕМ в session.vN.jsonl(.zstd) рядом со старым session.jsonl(.zstd),
# а старый замирает (dsh-session-format 0.2.0 :474 «session.v${N}.jsonl»). Читаем в каждом каталоге сессии ТОЛЬКО новейшее
# поколение. Имена — точные (копии вида session.jsonl.zstd.bak-… не подходят: урок 22.08).
POKOLENIE_ZHURNALA=re.compile(r'^session(?:\.v([1-9][0-9]*))?\.jsonl(\.zstd)?$')
def novejshie_pokoleniya(puti,tolko_zstd=False):
    luchshee={}
    for p in puti:
        m=POKOLENIE_ZHURNALA.match(p.name)
        if not m or (tolko_zstd and not m.group(2)):continue
        k=(int(m.group(1) or 0),1 if m.group(2) else 0)
        if p.parent not in luchshee or k>luchshee[p.parent][0]:luchshee[p.parent]=(k,p)
    return sorted(p for _,p in luchshee.values())

def turns(home,start,now,deadline):
    root=Path(home)/'.dsh/sessions'
    if not root.is_dir():raise Unmeasured('нет каталога журнала ходов')
    files=[];budget=[0];events=set();rows=0;earliest=None
    for p in root.rglob('session*.jsonl*'):
        if time.monotonic()>deadline:raise Unmeasured('предел времени обхода')
        if not POKOLENIE_ZHURNALA.match(p.name):continue
        if p.is_symlink():raise Unmeasured('ссылка вместо журнала ходов')
        if p.is_file():files.append(p)
        if len(files)>MAX_FILES:raise Unmeasured('предел числа журналов')
    files=novejshie_pokoleniya(files)
    if not files:raise Unmeasured('нет файлов журнала ходов')
    for p in sorted(files):
        identity=None
        command=['/usr/bin/zstd','-dc','--',str(p)] if p.suffix=='.zstd' else ['/usr/bin/cat','--',str(p)]
        for event in stream_json(command,budget,deadline):
            rows+=1
            if not isinstance(event,dict):raise Unmeasured('неверная запись журнала ходов')
            if event.get('type')=='session':
                identity=(event.get('id'),event.get('createdAt'),event.get('cwd'))
                if not all(isinstance(event.get(k),str) and event[k] for k in ('id','cwd')) or not isinstance(identity[1],(str,int,float)) or isinstance(identity[1],bool) or identity[1]=='':raise Unmeasured('неверный заголовок session')
                if isinstance(identity[1],(int,float)) and not math.isfinite(identity[1]):raise Unmeasured('неверное время session')
                continue
            if identity is None:raise Unmeasured('журнал без заголовка session')
            # DSH packed delta storage rows cannot contain turn/start events.
            if event.get('type') in ('text-chunks','reasoning-chunks','tool-call-chunks'):continue
            stamp=event.get('time')
            if type(stamp) not in (int,float) or not math.isfinite(stamp) or stamp<=0:raise Unmeasured('событие без корректного времени')
            earliest=stamp if earliest is None else min(earliest,stamp)
            if event.get('type')!='turn/start':continue
            if type(event.get('seq')) is not int:raise Unmeasured('ход без seq')
            if start*1000<=stamp<=now*1000:events.add((identity,event['seq']))
    if not events and (earliest is None or earliest>start*1000):raise Unmeasured('нет опоры журнала ходов до начала окна')
    return {'turns':len(events),'session_files':len(files),'session_rows':rows,'session_bytes':budget[0]}

def db_counts(path,start,now):
    try:path.stat()
    except FileNotFoundError:return {'db_exists':False,'new_rows':None,'total_rows':None}
    conn=sqlite3.connect(path.resolve().as_uri()+'?mode=ro',uri=True,timeout=5)
    try:
        conn.execute('pragma query_only=ON')
        conn.set_progress_handler(lambda: int(time.monotonic()>db_counts.deadline),10000)
        total,recent,invalid=conn.execute("SELECT count(*),coalesce(sum(sozdano>=? AND sozdano<=?),0),coalesce(sum(typeof(sozdano)!='integer'),0) FROM zapisi WHERE klass IS NOT 'proba-zavedeniya'",(int(start*1000),int(now*1000))).fetchone()
        if invalid:raise Unmeasured('sozdano не целое число миллисекунд')
        return {'db_exists':True,'new_rows':recent,'total_rows':total}
    finally:conn.close()
db_counts.deadline=float('inf')

# A-N-1173 (29.09.2026, Аврора; решение Забавы — (в) + ЧИТАТЕЛЬ): ядро a92 на ответ OMEGA «Deduped/Reconfirmed/Evolved»
# связь не пишет, а кладёт строку zhurnal priroda='svyaz-omega-skleena' (исход obrabotano — сводка её не читает). Здесь —
# её читатель: mem_id из строки → корень записи в OMEGA. Находка — ЧУЖОЙ корень или записи нет; склейка в СВОЁМ корне
# законна (и после правки поставки (б) останется) — не находка. НЕ ЛОВИТ: склейку без строки журнала (ядро старше a92,
# ответ без mem_id); эволюцию, уже переписавшую чужую запись, — видит только сам факт склейки, не ущерб.
OMEGA_DB=Path('/var/lib/omega/.omega/omega.db')
MEM=re.compile(r'mem-[0-9a-f]{12}')
def skleiki(path,start,now,agent,omega_db=None):
    omega_db=omega_db or OMEGA_DB
    try:path.stat()
    except FileNotFoundError:return {'skleeno':None,'skleeno_chuzhoe':[]}
    conn=sqlite3.connect(path.resolve().as_uri()+'?mode=ro',uri=True,timeout=5)
    try:
        conn.execute('pragma query_only=ON')
        if not conn.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name='zhurnal'").fetchone():return {'skleeno':0,'skleeno_chuzhoe':[]}
        rows=conn.execute("SELECT pochemu FROM zhurnal WHERE priroda='svyaz-omega-skleena' AND kogda>=? AND kogda<=?",(int(start*1000),int(now*1000))).fetchall()
    finally:conn.close()
    ids=sorted({m for (p,) in rows for m in MEM.findall(p or '')})
    if not ids:return {'skleeno':len(rows),'skleeno_chuzhoe':[]}
    try:o=sqlite3.connect(omega_db.resolve().as_uri()+'?mode=ro',uri=True,timeout=5)
    except sqlite3.Error as e:raise Unmeasured('OMEGA не открыта: '+type(e).__name__)
    try:korni=dict(o.execute(f"SELECT node_id,entity_id FROM memories WHERE node_id IN ({','.join('?'*len(ids))})",ids).fetchall())
    except sqlite3.Error as e:raise Unmeasured('OMEGA не прочитана: '+type(e).__name__)
    finally:o.close()
    return {'skleeno':len(rows),'skleeno_chuzhoe':[m+'→'+(korni[m] or 'без корня' if m in korni else 'нет в OMEGA') for m in ids if korni.get(m,'')!=agent]}

def journal_window(now,deadline):
    if time.monotonic()>deadline:raise Unmeasured('предел времени обхода')
    p=subprocess.run(['/usr/bin/journalctl','--list-boots','-o','json','--no-pager'],capture_output=True,timeout=20,check=True)
    if p.stderr:raise Unmeasured('границы journald не измерены')
    boots=json.loads(p.stdout)
    if not isinstance(boots,list) or not boots:raise Unmeasured('journald пуст')
    start=min(b['first_entry'] for b in boots)/1e6
    if not 0<start<=now:raise Unmeasured('неверные границы journald')
    return start

def completions(unit,start,now,deadline):
    # A-N-1710 (07.10, Михалыч; находка Зари): журнал iskra.service за 14 сут — 749 МБ при MAX_BYTES 256 МиБ, и замер
    # честно сдавался («предел размера журнала»). Нужны ТОЛЬКО строки завершения секретаря — отбор делает journald
    # (--grep по MESSAGE, PCRE2, регистр строго); is_finished() ниже по-прежнему проверяет КАЖДУЮ строку, предел
    # MAX_BYTES остаётся. ⚠️ journal_rows теперь — число ОТОБРАННЫХ строк, а не всех строк журнала службы.
    # B-N-2040: _TRANSPORT=stdout — индексное поле: строки секретаря идут stdout службы, а наплыв sudo/pam_unix
    # (syslog) journald больше не перебирает (14 сут: zarya 73→10 c, iskra 42→17 c, счёт строк тот же). НЕ ЛОВИТ:
    # секретарь, пишущий не в stdout, — тогда finished 0 и note «не измерено», без тревоги.
    command=['/usr/bin/journalctl','-u',unit,'_TRANSPORT=stdout','--since','@'+str(int(start)),
             '--until','@'+str(int(now)),'--no-pager','-o','json','--all',
             '--grep','дистилляция: ЗАКОНЧЕНА','--case-sensitive=true']
    stamps=[];rows=0
    for event in stream_json(command,[0],deadline,otbor=True):
        rows+=1
        # B-N-1391: без --all journald отдаёт поле длиннее 4096 байт как null (у zarya строка моста 18 009 байт),
        # невалидный UTF-8 — массивом байтов. Массив раскодируем; иное не-строковое — честный отказ, а не TypeError.
        m=event.get('MESSAGE','')
        if isinstance(m,list):m=bytes(m).decode('utf-8','replace')
        if not isinstance(m,str):raise Unmeasured('MESSAGE журнала не строка')
        if is_finished(m):
            t=int(event['__REALTIME_TIMESTAMP'])/1e6
            if start<=t<=now:stamps.append(t)
    return stamps,rows

def journal_history(previous,identity,stamps,oldest,now,start):
    if not isinstance(previous,dict) or previous.get('identity')!=identity:previous={}
    times=sorted(set(t for t in previous.get('finished',[])+stamps if start<=t<=now))
    # Positive witnesses only. Neither old records nor polling prove absence of gaps.
    observed_since=previous.get('observed_since',now)
    if type(observed_since) not in (int,float) or not math.isfinite(observed_since) or observed_since>now:observed_since=now
    state={'identity':identity,'until':now,'observed_since':observed_since,'finished':times}
    return state,False

def assess(row):
    result=dict(row);issues=list(row.get('errors',[]));notes=[]
    if row.get('db_exists') is False:issues.append('нет pamyat.db')
    ch=row.get('skleeno_chuzhoe') or []
    if ch:issues.append(f'знание склеено OMEGA в ЧУЖОЙ корень: {len(ch)} ('+', '.join(ch[:5])+(' …' if len(ch)>5 else '')+')')
    if row.get('turns') is None:
        status='не измерено'
    elif row['turns']==0:
        status='не звали'
    else:
        status='проверен'
        if row.get('db_exists') and row.get('new_rows')==0:issues.append('память не наполняется: нет новых записей при ходах')
        if row.get('finished')==0:
            if row.get('journal_complete'):issues.append('нет завершения секретаря ЗАКОНЧЕНА')
            else:
                age=row.get('cache_age_days',0);window=row.get('window_days',DEFAULT_DAYS)
                phase='кэш прогревается' if age<window else 'срок кэша накоплен, полнота журнала не доказана'
                notes.append(f'завершение секретаря не измерено: {phase}; кэшу {age:.2f} из {window:g} суток')
    if status=='проверен' and (row.get('errors') or (row.get('finished')==0 and not row.get('journal_complete'))):status='неполный замер'
    result.update(status=status,issues=issues,notes=notes)
    return result

def collect_one(agent,start,now,previous,oldest,deadline):
    row={**agent,'db_exists':None,'new_rows':None,'total_rows':None,'turns':None,'skleeno':None,'skleeno_chuzhoe':[],
         'finished':None,'journal_complete':False,'window_days':(now-start)/DAY,'errors':[]}
    if agent.get('config_error'):
        row['errors'].append(agent['config_error']);return assess(row),None
    try:row.update(turns(agent['home'],start,now,deadline))
    except Exception as e:row['errors'].append('ходы не измерены: '+(str(e) if isinstance(e,Unmeasured) else type(e).__name__))
    try:
        db_counts.deadline=deadline
        row.update(db_counts(Path(agent['home'])/'pamyat/pamyat.db',start,now))
    except Exception as e:row['errors'].append('база не измерена: '+(str(e) if isinstance(e,Unmeasured) else type(e).__name__))
    try:row.update(skleiki(Path(agent['home'])/'pamyat/pamyat.db',start,now,agent['agent']))
    except Exception as e:row['errors'].append('склейка не измерена: '+(str(e) if isinstance(e,Unmeasured) else type(e).__name__))
    next_state=None
    # No need to require a secretary completion from an uncalled agent.
    if row['turns']!=0:
        try:
            stamps,count=completions(agent['unit'],start,now,deadline)
            identity=[agent['home'],agent['unit']]
            next_state,complete=journal_history(previous,identity,stamps,oldest,now,start)
            row.update(finished=len(next_state['finished']),journal_complete=complete,
                       journal_rows=count,journal_oldest_global=oldest,cache_age_days=max(0,(now-next_state['observed_since'])/DAY))
        except Exception as e:row['errors'].append('секретарь не измерен: '+(str(e) if isinstance(e,Unmeasured) else type(e).__name__))
    return assess(row),next_state

def collect(registry_path,state,days,now=None):
    now=time.time() if now is None else now;start=now-days*DAY;deadline=time.monotonic()+240
    agents=registry(registry_path)
    if state.get('days')!=days:state={'agents':{}}  # changed window invalidates truncated historical evidence
    try:oldest=journal_window(now,deadline)
    except Exception:oldest=None
    rows=[];new_state={'version':1,'days':days,'agents':{}}
    for agent in agents:
        row,history=collect_one(agent,start,now,state.get('agents',{}).get(agent['agent'],{}),oldest,deadline)
        rows.append(row)
        if history is not None:new_state['agents'][agent['agent']]=history
        elif agent['agent'] in state.get('agents',{}):
            new_state['agents'][agent['agent']]=state['agents'][agent['agent']]
    return {'utc':dt.datetime.fromtimestamp(now,dt.timezone.utc).isoformat(),'start':start,'end':now,'days':days,
            'registry':str(registry_path),'agents_total':len(agents),'rows':rows},new_state

def notifications(report):
    lines=[]
    for row in report['rows']:
        if not row['issues']:continue
        counts=[f'{label}={row[key]}' for key,label in (('turns','ходы'),('new_rows','новые')) if row.get(key) is not None]
        lines.append(row['agent']+': '+'; '.join(row['issues'])+(' · '+', '.join(counts) if counts else ''))
    if not lines:return []
    header=f"🔴 sadik: память за {report['days']} суток; проблем {len(lines)} из {report['agents_total']} агентов"
    chunks=[];chunk=header
    for line in lines:
        if len(line)>2000:line=line[:1950]+' [подробности в отчёте]'
        if len(chunk)+len(line)+1>3000:chunks.append(chunk);chunk=header
        chunk+='\n'+line
    chunks.append(chunk);return chunks

REMINDER_SECONDS=7*DAY

def notification_plan(report,previous,now):
    names=sorted({r['agent'] for r in report['rows'] if r['issues']})
    if not names:
        return {'send':False,'reason':'no_measured_findings','agents':[],
                'next_state':{'version':1,'agents':[],'last_sent':None}}
    changed=names!=previous.get('agents',[])
    last=previous.get('last_sent')
    due=last is None or now-last>=REMINDER_SECONDS
    send=changed or due
    return {'send':send,'reason':('changed' if changed else 'weekly') if send else 'unchanged',
            'agents':names,'next_state':{'version':1,'agents':names,'last_sent':now} if send else previous}

def read_notification_state(path):
    state=json.loads(path.read_text()) if path.exists() else {'version':1,'agents':[],'last_sent':None}
    names=state.get('agents');stamp=state.get('last_sent')
    if (state.get('version')!=1 or not isinstance(names,list) or not all(isinstance(n,str) for n in names)
            or names!=sorted(set(names)) or (names and stamp is None)
            or (stamp is not None and (type(stamp) not in (int,float) or not math.isfinite(stamp) or stamp<0))):
        raise ValueError('notification state schema')
    return state

def dispatch_notifications(report,path,send,now=None):
    clock=time.time if now is None else lambda:now
    now=clock()
    previous=read_notification_state(path)
    plan=notification_plan(report,previous,now)
    report['notification']={k:v for k,v in plan.items() if k!='next_state'}
    if plan['send']:
        report['notification']['delivery']='pending'
        prefix='Недельное напоминание. ' if plan['reason']=='weekly' else 'Изменился набор находок. '
        try:
            for message in notifications(report):send(prefix+message)
        except Exception:
            report['notification']['delivery']='failed'
            raise
        plan['next_state']['last_sent']=clock()
        report['notification']['delivery']='sender_accepted'
        report['notification']['last_sent']=plan['next_state']['last_sent']
    else:report['notification']['delivery']='not_requested'
    # Commit only after ALL chunks succeeded; failed delivery stays due next time.
    if plan['next_state']!=previous:atomic_json(path,plan['next_state'])
    return plan

def atomic_json(path,value):
    fd,name=tempfile.mkstemp(prefix='.watch-',dir=path.parent)
    try:
        with os.fdopen(fd,'w') as f:
            json.dump(value,f,ensure_ascii=False);f.write('\n');f.flush();os.fsync(f.fileno())
        os.replace(name,path)
    finally:
        if os.path.exists(name):os.unlink(name)

def notify(text):
    subprocess.run(['/usr/local/bin/agent-alert','--plain'],input=text,text=True,
                   stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,timeout=90,check=True)

def main():
    ap=argparse.ArgumentParser(description=__doc__,allow_abbrev=False)
    mode=ap.add_mutually_exclusive_group(required=True)
    mode.add_argument('--check',action='store_true',help='read-only report, no state/alert')
    mode.add_argument('--run',action='store_true')
    mode.add_argument('--failure',action='store_true',help='systemd failure hook')
    ap.add_argument('--registry',type=Path,default=Path('/etc/agent-registry/agents.yaml'))
    ap.add_argument('--state-dir',type=Path,default=Path('/var/lib/pamyat-fill-watch'))
    ap.add_argument('--days',type=int,default=DEFAULT_DAYS)
    a=ap.parse_args()
    if not 1<=a.days<=90:ap.error('days must be 1..90')
    os.umask(0o077)
    if a.failure:
        if os.environ.get('SERVICE_RESULT')!='success':notify('🔴 sadik: сторож наполнения памяти не завершился; проверка не измерена')
        return 0
    lock=None
    try:
        if a.run:
            # Refuse aliases into agents' directories: state is this monitor's own area.
            if a.state_dir.resolve()!=Path('/var/lib/pamyat-fill-watch'):
                raise ValueError('run state must be /var/lib/pamyat-fill-watch')
            a.state_dir.mkdir(mode=0o700,parents=True,exist_ok=True)
            lock=(a.state_dir/'lock').open('a');fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
        path=a.state_dir/'history.json'
        state=json.loads(path.read_text()) if path.exists() else {'version':1,'agents':{}}
        if state.get('version')!=1 or not isinstance(state.get('agents'),dict):raise ValueError('state schema')
        report,new_state=collect(a.registry,state,a.days)
        if a.run:
            atomic_json(a.state_dir/'history.json',new_state)
            try:dispatch_notifications(report,a.state_dir/'notifications.json',notify)
            finally:atomic_json(a.state_dir/'last-report.json',report)
        if a.check:
            plan=notification_plan(report,read_notification_state(a.state_dir/'notifications.json'),time.time())
            report['notification']={k:v for k,v in plan.items() if k!='next_state'}
        print(json.dumps(report,ensure_ascii=False))
        return 0 if a.run else int(bool(notifications(report)))
    except Exception as e:
        # Do not print exception body: source content may be private.
        if a.run and 'report' in locals() and report.get('notification',{}).get('delivery')=='failed':
            message='🔴 sadik: отправка измеренных находок не подтверждена ('+type(e).__name__+')'
        else:message='🔴 sadik: сторож наполнения памяти не измерил область ('+type(e).__name__+')'
        print(message)
        if a.run:
            try:notify(message)
            except Exception:pass
        return 2
    finally:
        if lock:lock.close()
if __name__=='__main__':raise SystemExit(main())
