"""Consumes actual DSH turn-end measurements. A drop alone is a signal, not proof of Codex compaction."""
import json,os,re,subprocess,time
from pathlib import Path
LIMIT=8*1024*1024
KEEP=5

def append(path,row):
    data=json.dumps(row,ensure_ascii=False)+'\n'
    if path.exists() and path.stat().st_size+len(data.encode())>LIMIT:
        for i in range(KEEP,0,-1):
            old=Path(str(path)+('.'+str(i-1) if i>1 else ''));new=Path(str(path)+'.'+str(i))
            if old.exists():os.replace(old,new)
    with path.open('a') as f:f.write(data)
    os.chmod(path,0o600)

def classify_drop(a,b,ratio):
    if not a or any(a.get(k)!=b.get(k) for k in ('agent','session','created','uuid','model','window')):return None
    if not a.get('uuid') or a.get('error') or b.get('error') or b['turn']!=a['turn']+1:return None
    if not all(isinstance(x,int) and not isinstance(x,bool) and x>=0 for x in (a.get('tokens'),b.get('tokens'))):return None
    if not all(isinstance(x,int) for x in (a.get('platform_seq'),b.get('platform_seq'))):return None
    if b['platform_seq']<=a['platform_seq'] and (a['tokens']==0 or b['tokens']>=a['tokens']*ratio):return None
    return dict(kind='platform' if b['platform_seq']>a['platform_seq'] else 'codex-suspected',agent=b['agent'],before=a['tokens'],after=b['tokens'],threshold=a.get('threshold'),window=a.get('window'),time=b['time'],turn=b['turn'],session=b['session'])

# B-N-1175 (29.09.2026, Аврора; повод — вопрос владельца 16:09 МСК «про Марка тревоги нет»): агенты БЕЗ датчика хода
# (marc: платформа под своей учёткой, плагина compact-outcomes нет) — второй источник: ТОЧНОЕ событие шлюза
# codex_compacted (codex-compaction-watch.mjs шлюза, 0.4.13). Узкий канал (решение Забавы, условие Вениамина 13:23Z):
# журнал шлюза читает root — /usr/local/libexec/codex-compaction-vyborka (ExecStartPre=-+ этой службы) выбирает
# ТОЛЬКО строки «[codex-compaction]» в файл root:coders 0640; служба под coders читает файл, не журнал.
# Конфиг: agents.json «shlyuzy_bez_datchika»: [{name, unit, fajl}]. Агента с датчиком сюда не вписывать — двойная тревога.
# Курсор (смещение в файле) — в состоянии; первый прогон ставит его в конец и историю НЕ тревожит. Файл не читается
# или не тронут выборкой дольше SVEZHEST — СЛЕПОТА в problems, не тишина. ⚠️ НЕ ЛОВИТ: сжатие, о котором шлюз не
# написал события (иная версия шлюза); problems уходят только в журнал службы — тревоги по слепоте нет (как у датчиков).
IMYA_SHLYUZA=re.compile(r'^coder-gateway(-[a-z]+|@[a-z]+)\.service$')
NEDOST_MAX=50 # B-N-1178: потолок копилки недоставленных
SVEZHEST=600 # с; выборка трогает файл каждый прогон службы (таймер: 60 с после конца прогона)
def sobytiya_vyborki(fajl,smeshchenie):
    """(события codex_compacted, новое смещение, (вид, текст) беды | None). smeshchenie None — первый прогон: только конец файла."""
    try:
        with open(fajl,'rb') as f:st=os.fstat(f.fileno());data=f.read()
    except OSError as e:return [],smeshchenie,('vyborka-ne-chitaetsya',f'файл выборки {fajl} не читается ({e.strerror}) — канал шлюза слеп')
    davno=time.time()-st.st_mtime
    if davno>SVEZHEST:return [],smeshchenie,('vyborka-stoit',f'файл выборки {fajl} не тронут {int(davno)} с — выборка шлюза стоит, канал слеп')
    if smeshchenie is None:return [],len(data),None
    if len(data)<smeshchenie:return [],len(data),('vyborka-koroche-kursora',f'файл выборки {fajl} короче курсора — подменён; курсор в конец, пропущенное не читано')
    hvost=data[smeshchenie:];hvost=hvost[:hvost.rfind(b'\n')+1]
    sobytiya=[]
    for l in hvost.splitlines():
        try:d=json.loads(l)
        except ValueError:continue
        if isinstance(d,dict) and d.get('event')=='codex_compacted':sobytiya.append(d)
    return sobytiya,smeshchenie+len(hvost),None

def monitor(config,root,logs,alert,ratio=.5):
    if not 0<ratio<1:raise ValueError('drop ratio must be between 0 and 1')
    root=Path(root);logs=Path(logs);path=root/'turn-watch-state.json'
    state=json.loads(path.read_text()) if path.exists() else {'last':{},'pending':[]}
    problems=[];read=0;bedy={}
    def save():
        temp=path.with_suffix('.tmp');temp.write_text(json.dumps(state,ensure_ascii=False));os.chmod(temp,0o600);os.replace(temp,path)
    for agent in config['agents']:
        name=agent['name']
        if name not in ('alfa','beta','gamma'):raise ValueError('unexpected agent')
        files=[logs/(name+'.jsonl'+suffix) for suffix in ['.5','.4','.3','.2','.1','']];files=[f for f in files if f.exists()]
        if not files:problems.append(name+': turn log missing');bedy[name+'|turn-log-missing']='журнал датчика хода не найден ('+str(logs/(name+'.jsonl'))+') — «сжал Codex» по падению токенов для '+name+' не видно';continue
        for f in files:
            if f.stat().st_size>LIMIT+65536:raise ValueError('turn log exceeds bound')
            for line in f.read_bytes().splitlines(keepends=True):
                if not line.endswith(b'\n'):problems.append(name+': trailing row incomplete');break
                b=json.loads(line)
                if b['agent']!=name:raise ValueError('agent mismatch')
                key=json.dumps([name,b['session'],b['created']]);a=state['last'].get(key)
                if a and b['seq']<=a['seq']:continue
                read+=1;event=classify_drop(a,b,ratio)
                if event:
                    if event['kind']=='platform':event['message']=f"платформа: событие сжатия DSH; было {event['before']} → стало {event['after']}"
                    append(root/'turn-alerts.jsonl',event)
                    if event['kind']=='codex-suspected':state['pending'].append(dict(event,attempts=0))
                state['last'][key]=b
    kursory=state.setdefault('kursory_vyborki',{})
    for sh in config.get('shlyuzy_bez_datchika',[]):
        name,unit,fajl=sh.get('name'),sh.get('unit'),sh.get('fajl')
        if not isinstance(name,str) or not re.fullmatch('[a-z]+',name) or not isinstance(unit,str) or not IMYA_SHLYUZA.match(unit) or not isinstance(fajl,str) or not fajl.startswith('/'):raise ValueError('shlyuzy_bez_datchika: name/unit/fajl')
        if name in [a['name'] for a in config['agents']]:raise ValueError(name+': агент с датчиком — событие шлюза дало бы двойную тревогу')
        sobytiya,kursor,beda=sobytiya_vyborki(fajl,kursory.get(fajl))
        kursory[fajl]=kursor
        if beda:problems.append(name+': '+beda[1]);bedy[name+'|'+beda[0]]=beda[1];continue
        for d in sobytiya:
            event=dict(kind='codex-gateway',agent=name,unit=unit,time=d.get('event_time'),ordinary_time=d.get('ordinary_time'),
                       tekst=f"⚠️ {name}: Codex СЖАЛ беседу сам — событие шлюза {unit} в {d.get('event_time')} (последний обычный ход {d.get('ordinary_time')}). Нашей сводки перед этим сжатием не было. Замечаю, не лечу.")
            append(root/'turn-alerts.jsonl',event);state['pending'].append(dict(event,attempts=0))
    # B-N-1177 (29.09.2026, Аврора; слово владельца 16:37 МСК «согласен»): СЛЕПОТА — тревогой тем же каналом, а не только в журнал.
    # Ключ «агент|вид»: ОДНА тревога на вход в состояние, ОДИН отбой на выход; пока держится — молчу (иначе каждые 60 с).
    # Память — state['slepota'] {ключ: {s: с какого, tekst}}; первый прогон без неё = вход (одна тревога на ключ, не пачка по тактам).
    # ⚠️ НЕ ЛОВИТ: «trailing row incomplete» (недописанная строка датчика — проходит сама, тревогу не шлю); исключения monitor
    # (unexpected agent, agent mismatch, turn log exceeds bound — падает весь прогон); смерть самой службы/таймера; тревогу,
    # не доставленную за 3 попытки (ключ уже запомнен — повтора не будет).
    byli=state.get('slepota',{});teper=dict(byli);sejchas=time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime())
    for k in sorted(set(bedy)-set(byli)):
        agent,vid=k.split('|',1);teper[k]=dict(s=sejchas,tekst=bedy[k])
        event=dict(kind='slepota',agent=agent,vid=vid,time=sejchas,tekst=f"🔴 dsh-compact-outcomes: СЛЕПОТА {agent} ({vid}): {bedy[k]}. Одна тревога на вход; отбой придёт строкой.")
        append(root/'turn-alerts.jsonl',event);state['pending'].append(dict(event,attempts=0))
    for k in sorted(set(byli)-set(bedy)):
        agent,vid=k.split('|',1);s=teper.pop(k).get('s')
        event=dict(kind='otboj',agent=agent,vid=vid,time=sejchas,tekst=f"✅ dsh-compact-outcomes: ОТБОЙ слепоты {agent} ({vid}) — снова видно (слепо было с {s}).")
        append(root/'turn-alerts.jsonl',event);state['pending'].append(dict(event,attempts=0))
    state['slepota']=teper
    # B-N-1178 (29.09.2026, Аврора; находка Вениамина 13:41Z): РАЗОВАЯ тревога (codex-suspected, событие шлюза, отбой слепоты),
    # не доставленная за 3 попытки, не теряется молча — копится в state['nedostavleno'] и уходит СВОДКОЙ. Сводка сама стоит в
    # очереди (1 попытка за прогон, как все) — ждать чужой удачной доставки нельзя: других тревог может не быть. Сводка не
    # доставлена за 3 попытки — её события возвращаются в копилку. Потолок копилки NEDOST_MAX, сверх — счёт «потеряно».
    # ⚠️ НЕ ЛОВИТ: смерть службы/таймера; тревогу о слепоте (она повторяется сама, B-N-1177).
    nedost=state.get('nedostavleno') or []
    if nedost and not any(e.get('kind')=='svodka-nedostavlennyh' for e in state['pending']):
        sverh=state.pop('nedostavleno_sverh',0);state['nedostavleno']=[]
        spisok='\n'.join(f"• {x.get('time') or '?'} {x.get('agent') or '?'} ({x.get('kind')}): {(x.get('soobshchenie') or '')[:300]}" for x in nedost[:10])
        event=dict(kind='svodka-nedostavlennyh',agent='*',time=time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime()),sobytiya=nedost,sverh=sverh,
                   tekst=f"⚠️ dsh-compact-outcomes: канал тревог лежал — НЕ ДОСТАВЛЕНО {len(nedost)} тревог (сводка):\n{spisok}"
                         +(f"\n… и ещё {len(nedost)-10} — в turn-alerts.jsonl" if len(nedost)>10 else '')+(f"\n🔴 сверх потолка потеряно {sverh}" if sverh else ''))
        append(root/'turn-alerts.jsonl',event);state['pending'].append(dict(event,attempts=0))
    save() # persist pending before attempting delivery; crash after delivery may duplicate once
    for event in state['pending'][:2]:
        event['attempts']+=1
        message=event.get('tekst') or f"⚠️ {event['agent']}: признак «сжал Codex»: было {event['before']} → стало {event['after']}, порог платформы {event['threshold']}. Между соседними ходами события сжатия DSH нет; compacted этим признаком НЕ подтверждён."
        try:r=subprocess.run([alert,message],capture_output=True,text=True,timeout=15);ok=r.returncode==0
        except (OSError,subprocess.TimeoutExpired):ok=False
        if ok or event['attempts']>=3:
            state['pending'].remove(event);append(root/'turn-alerts.jsonl',dict(event,notification='accepted' if ok else 'failed-after-3'))
            # B-N-1177 условие Вениамина 13:41Z: отметка «сказано» — по УСПЕХУ, не по попытке. Тревога о слепоте не доставлена
            # за 3 попытки — ключ снять: следующий прогон при живой слепоте поставит её заново (класс B-P-100).
            if not ok and event.get('kind')=='slepota':state.setdefault('slepota',{}).pop(event['agent']+'|'+event['vid'],None)
            elif not ok:   # B-N-1178: разовое — в копилку сводки (сводка — своими событиями обратно)
                nov=event.get('sobytiya') if event.get('kind')=='svodka-nedostavlennyh' else [dict(kind=event.get('kind'),agent=event.get('agent'),time=event.get('time'),soobshchenie=message)]
                if event.get('kind')=='svodka-nedostavlennyh':state['nedostavleno_sverh']=state.get('nedostavleno_sverh',0)+event.get('sverh',0)
                kop=((nov or [])+state.get('nedostavleno',[])) if event.get('kind')=='svodka-nedostavlennyh' else state.get('nedostavleno',[])+nov   # порядок: старые → новые
                if len(kop)>NEDOST_MAX:state['nedostavleno_sverh']=state.get('nedostavleno_sverh',0)+len(kop)-NEDOST_MAX;kop=kop[-NEDOST_MAX:]   # храню новейшие
                state['nedostavleno']=kop
        save()
    print(json.dumps({'turn_rows_new':read,'turn_log_problems':problems,'pending_alerts':len(state['pending'])},ensure_ascii=False))
