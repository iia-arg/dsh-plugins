"""Periodic observer; production inputs are read-only. State lives in its own directory."""
import argparse,copy,datetime as dt,fcntl,json,os,re,sqlite3,subprocess,time,uuid as uuidlib
from pathlib import Path
from observer import VERSION,classify,key
DAY=86400000
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


def read_rows(path,compressed=False):
    if path.stat().st_size>128*1024*1024:raise ValueError('input exceeds 128 MiB: coverage incomplete')
    data=subprocess.check_output(['zstd','-dc','--long=27','--',str(path)],stderr=subprocess.PIPE,timeout=20) if compressed else path.read_bytes()
    if not data.endswith(b'\n'):raise ValueError('incomplete trailing record: retry next poll')
    if len(data)>256*1024*1024:raise ValueError('decoded input exceeds 256 MiB')
    rows=[json.loads(l) for l in data.splitlines() if l.strip()]
    if not rows:raise ValueError('empty journal')
    return rows

def sql(path,query):
    with sqlite3.connect(Path(path).resolve().as_uri()+'?mode=ro',uri=True,timeout=5) as db:
        db.row_factory=sqlite3.Row
        return [dict(r) for r in db.execute(query)]

def collect(config,state,now):
    names=[a['name'] for a in config['agents']]
    if not names or len(names)!=len(set(names)) or set(names)-{'alfa','beta','gamma'}:raise ValueError('scope must be a unique subset of alfa,beta,gamma')
    state=copy.deepcopy(state)
    state['max_poll_gap_ms']=max(state.get('max_poll_gap_ms',0),max(0,now-state.get('as_of',now)))
    state['as_of']=now;state['version']=VERSION
    state.setdefault('bindings',{});state.setdefault('agents',{})
    for a in config['agents']:
        n=a['name'];old=state['agents'].get(n,{})
        events={r['id']:{**r,'category':'unknown','reason':'not reverified in current snapshot'} for r in old.get('events',[])};drops={r['id']:r for r in old.get('drops',[])}
        problems=[];attempts=[];coverage={'dsh_files':0,'dsh_read':0,'map_rows':0,'bound_uuids':0,'rollouts_read':0,'rollout_rows':0}
        try:
            mappings=sql(a['gateway_db'],'SELECT kluch,sessionId FROM sessions');coverage['map_rows']=len(mappings)
            memory=sql(a['memory_db'],"SELECT id,istochnik,soderzhim FROM zapisi WHERE klass='svodka-kompakcii'")
            mp={}
            for row in mappings:mp.setdefault(row['kluch'],set()).add(row['sessionId'])
            root=Path(a['dsh_dir'])
            if not root.is_dir():raise ValueError('DSH directory missing')
            paths=novejshie_pokoleniya(root.rglob('session*.jsonl.zstd'),tolko_zstd=True);coverage['dsh_files']=len(paths)
            if not paths:raise ValueError('no DSH journals')
            journals={}
            for path in paths:
                try:
                    rows=read_rows(path,True);header=rows[0]
                    if header.get('type')!='session':raise ValueError('invalid DSH session header')
                    if header.get('cwd')!=a['cwd']:problems.append(f'{path}: legacy header cwd differs; provenance must come from local gateway mapping')
                    sid=header['id'];identity=str(path)+'#'+str(header['createdAt']);journals[identity]=(sid,rows[1:])
                    coverage['dsh_read']+=1
                    for event in rows[1:]:
                        if event.get('type')!='user/message':continue
                        matches=mp.get(key(event['data']),set())
                        if len(matches)>1:raise ValueError('ambiguous gateway key')
                        for uuid in matches:
                            # Never use a mapping as an arbitrary path pattern.
                            if str(uuidlib.UUID(uuid))!=uuid.lower():raise ValueError('invalid UUID in map')
                            links=state['bindings'].setdefault(n,{}).setdefault(uuid,[])
                            if identity not in links:links.append(identity)
                except (ValueError,KeyError,OSError,subprocess.SubprocessError) as ex:problems.append(f'{path}: {type(ex).__name__}: {ex}')
            if not Path(a['codex_dir']).is_dir():raise ValueError('Codex sessions directory missing')
            bindings=state['bindings'].get(n,{})
            coverage['bound_uuids']=len(bindings)
            if not bindings:problems.append('no proven DSH ↔ gateway UUID mappings; cannot report complete zero')
            by_session={}
            for uuid,identities in bindings.items():
                if len(identities)!=1:problems.append(f'{uuid}: ambiguous DSH session binding');continue
                identity=identities[0]
                if identity not in journals:problems.append(f'{uuid}: previously bound DSH history unavailable');continue
                files=list(Path(a['codex_dir']).rglob('*-'+uuid+'.jsonl'))
                if len(files)!=1:problems.append(f'{uuid}: expected one rollout, found {len(files)}');continue
                try:
                    rows=read_rows(files[0]);by_session.setdefault(identity,{})[uuid]=rows
                    coverage['rollouts_read']+=1;coverage['rollout_rows']+=len(rows)
                except (ValueError,OSError) as ex:problems.append(f'{uuid}: {type(ex).__name__}: {ex}')
            for identity,(sid,ds) in journals.items():
                try:
                    # Without a verified rollout, even a saved DSH summary has unknown ordering.
                    xs=by_session.get(identity,{})
                    result=classify(sid,ds,xs,memory,state['start'],min(now,state['deadline']))
                    attempts.extend(result['attempts'])
                    for row in result['events']:
                        row['platform_session']=identity
                        row['id']=identity+'|'+row['id']
                        if not xs or len(xs)!=sum(identity in ids for ids in bindings.values()):row.update(category='unknown',reason='incomplete verified rollout coverage: ordering unmeasured')
                        events[row['id']]=row
                    for row in result['drops']:drops[identity+'|'+row['id']]=row
                except (ValueError,KeyError,TypeError) as ex:problems.append(f'{identity}: {type(ex).__name__}: {ex}')
        except (OSError,ValueError,sqlite3.Error,KeyError) as ex:problems.append(f'{n}: {type(ex).__name__}: {ex}')
        state['agents'][n]={'events':list(events.values()),'drops':list(drops.values()),'attempts':attempts,'coverage':coverage,'problems':problems}
    return state

def iso(ms):return dt.datetime.fromtimestamp(ms/1000,dt.timezone.utc).isoformat()
def report(state,start,end):
    lines=[f'Альфа → Главной Забаве. Счётчик компактов {VERSION}.', 'Наблюдались: '+', '.join(sorted(state['agents']))+'. Полнота покрытия каждого узла указана ниже.',f'Окно UTC: {iso(start)} — {iso(end)}; срез {iso(state["as_of"])}.',
      'Наш = сводка нашего провайдера сохранена в SQLite и checkpoint удержан до конца хода, без Codex compacted в том же ходе. Это не гарантия вечного хранения.',
      'Знаменатель — подтверждённые события компакта, НЕ число ходов и НЕ доля побед. Два компакта одного хода считаются двумя событиями.',
      'Падения без compacted отдельно: они не объявлены компактом. Причина не установлена также при неполной цепочке/порядке.',
      '| Узел | Компактов | Наша сводка выжила | Codex опередил | Причина не установлена | Падения без compacted |',
      '|---|---:|---:|---:|---:|---:|']
    details=[]
    for name,a in state['agents'].items():
        ev=[x for x in a['events'] if start<=x['time']<end];dr=[x for x in a['drops'] if start<=x['time']<end]
        nums=[sum(x['category']==k for x in ev) for k in ('ours','codex','unknown')]
        lines.append(f'| {name} | {len(ev)} | {nums[0]} | {nums[1]} | {nums[2]} | {len(dr)} |')
        details.append(f'Покрытие {name}: {json.dumps(a["coverage"],ensure_ascii=False)}. Ошибки/неполнота: {json.dumps(a["problems"],ensure_ascii=False)}.')
        for x in ev:details.append(f'- {name}: {x["id"]}; {x["category"]}; {x["reason"]}')
        for x in a.get('attempts',[]):
            if start<=x['time']<end:details.append(f"- {name}: {x['id']}; попытка вне знаменателя: {x['reason']}")
        for x in dr:details.append(f'- {name}: {x["id"]}; неизвестное падение {x["before"]}→{x["after"]}')
    lines+=['']+details
    lines+=[f'Максимальный промежуток между опросами: {state.get("max_poll_gap_ms",0)} мс.',
      'Карта шлюза хранит текущее соответствие. Сохраняем однажды увиденные связи; смена нескольких UUID между минутными опросами может остаться вне покрытия. Испытательные UUID без подтверждённой связи с DSH не читаются.',
      'Читатель — Главная Забава через существующий сборщик a2a/out. Нулевая строка при ошибках не доказывает отсутствия событий. Отчёт является снимком доказательств на указанное время.']
    return '\n'.join(lines)+'\n'

def atomic(path,data):
    tmp=path.with_name('.'+path.name+'.tmp');tmp.write_text(data);os.chmod(tmp,0o600);os.replace(tmp,path)

def main():
    p=argparse.ArgumentParser();p.add_argument('--config',required=True);p.add_argument('--state-dir',required=True);p.add_argument('--outbox');p.add_argument('--turn-log-dir');p.add_argument('--alert',default='/usr/local/bin/agent-alert');p.add_argument('--drop-ratio',type=float,default=0.5);args=p.parse_args()
    os.umask(0o077);root=Path(args.state_dir);root.mkdir(parents=True,exist_ok=True)
    with (root/'lock').open('w') as lock:
        fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
        if args.turn_log_dir:
            from turn_watch import monitor
            monitor(json.loads(Path(args.config).read_text()),root,Path(args.turn_log_dir),args.alert,args.drop_ratio)
        if (root/'DONE').exists():
            print('Seven-day observation already closed');return
        path=root/'state.json';now=int(time.time()*1000)
        state=json.loads(path.read_text()) if path.exists() else {'start':now,'deadline':now+7*DAY,'bindings':{},'agents':{},'sent':[]}
        if not (0<=state['start']<state['deadline']<=state['start']+7*DAY):raise ValueError('invalid observation lifetime')
        state=collect(json.loads(Path(args.config).read_text()),state,now)
        atomic(path,json.dumps(state,ensure_ascii=False,indent=2)+'\n')
        atomic(root/'latest.md',report(state,state['start'],min(now,state['deadline'])))
        if args.outbox:
            out=Path(args.outbox)
            if not out.is_dir():raise ValueError('outbox does not exist')
            first=state['start']//DAY;last=min(now,state['deadline'])//DAY
            for day in range(first,last+1):
                finish=min((day+1)*DAY,state['deadline'])
                if now<finish+5*60000 or str(day) in state['sent']:continue
                content=report(state,max(day*DAY,state['start']),finish)
                name=f'compact-outcomes-{dt.datetime.fromtimestamp(day*86400,dt.timezone.utc).date()}.md'
                atomic(out/name,content);state['sent'].append(str(day));atomic(path,json.dumps(state,ensure_ascii=False,indent=2)+'\n')
            if now>=state['deadline']+5*60000:
                atomic(out/f'compact-outcomes-week-{state["start"]}.md',report(state,state['start'],state['deadline']))
                atomic(root/'DONE','Seven-day observation finished. Re-arm only by explicit decision.\n')
        print(json.dumps({'as_of':iso(now),'coverage':{n:a['coverage'] for n,a in state['agents'].items()},'problems':{n:a['problems'] for n,a in state['agents'].items()}},ensure_ascii=False))
if __name__=='__main__':main()
