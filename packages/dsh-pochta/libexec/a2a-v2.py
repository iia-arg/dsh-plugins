#!/usr/bin/env python3
"""Local v2 transport. No fallback to v1. Ledger reads only; no model-text trust."""
import contextlib
import argparse, hashlib, json, os, pwd, re, sqlite3, sys, tempfile, time, uuid
from pathlib import Path
ID = re.compile(r'[a-zA-Z0-9:_-]{1,128}\Z')

def valid(value):
    return isinstance(value, str) and ID.fullmatch(value)

@contextlib.contextmanager
def ledger(route):
    path = Path(route['ledger']).resolve(strict=True)
    db = sqlite3.connect(path.as_uri()+'?mode=ro', uri=True, timeout=1)
    db.row_factory = sqlite3.Row
    db.execute('PRAGMA query_only=ON')
    if db.execute('PRAGMA user_version').fetchone()[0] != 2:
        db.close(); raise ValueError('ledger не v2')
    try:
        yield db
    finally:
        db.close()

def identity(db, route):
    values = dict(db.execute('SELECT key,value FROM meta'))
    if Path(values['root']).resolve() != Path(route['ledger']).resolve().parent:
        raise ValueError('ledger другого экземпляра')
    return values['ledger_uuid']

def wire(metadata, body):
    return ('[a2a-envelope version=2]\n'+json.dumps(metadata,ensure_ascii=False,separators=(',',':'))+'\n'+body).encode('utf8')

def put(route, metadata, body):
    data = wire(metadata, body)
    folder = Path(route['spool']).resolve(strict=True)
    if folder.name != metadata['recipient']['id']:
        raise ValueError('spool не совпадает с recipient')
    # B-N-1090: имя по договору ящика <метка>-<отправитель>- (читатель: spoolSender/spoolAgeHours telegram-multiagent), как у
    # a2a-send (id -un). B-N-2021: грамматика учётки a2a-pochtalon, дефис допустим. Хвост sha(delivery_id): повтор в ту же
    # секунду сверяется побайтно здесь; в другую — два файла, дубль ловит получатель по logical_key v2:<delivery_id>.
    kto = pwd.getpwuid(os.geteuid()).pw_name
    if not re.fullmatch(r'[a-z_][a-z0-9_-]*', kto): raise ValueError('учётка отправителя не годится для имени ящика: '+repr(kto))
    target = folder/(time.strftime('%Y%m%dT%H%M%SZ', time.gmtime())+'-'+kto+'-v2-'+hashlib.sha256(metadata['delivery_id'].encode()).hexdigest()+'.txt')
    fd, tmp = tempfile.mkstemp(prefix='.v2-', dir=folder)
    try:
        with os.fdopen(fd,'wb') as f: f.write(data); f.flush(); os.fsync(f.fileno())
        try: os.link(tmp,target)
        except FileExistsError:
            if target.is_symlink() or target.read_bytes()!=data: raise ValueError('delivery_id: конфликт байтов')
    finally: os.unlink(tmp)
    return target

def verify_response(route, metadata, started):
    with ledger(route) as db:
        current = identity(db,route)
        row = db.execute('SELECT r.*,e.metadata_json,e.kind AS envelope_kind,e.state AS envelope_state FROM receipts r JOIN protocol_envelopes e ON e.receipt_id=r.id WHERE r.logical_key=?',('v2:'+metadata['delivery_id'],)).fetchone()
        if row is None or row['finished_at'] is None: return None
        if (row['outcome']!='capability_response' or row['dispatch_started'] or row['claimed_turn'] is not None
            or row['envelope_kind']!='capability_probe' or row['envelope_state']!='probe_replied'
            or row['received_at']<started or json.loads(row['metadata_json'])!=metadata):
            raise ValueError('ответ не является исходом машинной пробы')
        evidence=json.loads(row['result_json'])
        if evidence.get('kind')!='receiver-code': raise ValueError('ответ модели не доказывает поддержку')
        reply_key='machineReplyBody' if metadata.get('reply_channel')=='ledger' else 'ownerReplyBody'
        response=json.loads(evidence[reply_key].split('\n\n',1)[1])
        expected={'protocol':'a2a-envelope','version':2,'kind':'capability_response',
                  'delivery_id':metadata['delivery_id'],'target_decision_id':metadata['supersedes']['decision_id'],
                  'recipient':metadata['recipient']['id'],'ledger_uuid':current,'status':'decision_not_found','cancellation':True}
        if metadata.get('reply_channel')=='ledger': expected['reply_channel']='ledger'
        if any(type(response.get(k)) is not type(v) or response.get(k)!=v for k,v in expected.items()):
            raise ValueError('корреляция capability_response не сошлась')
        if not {'receive','hold','capability_probe','cancel_pending'}.issubset(response.get('capabilities',[])):
            raise ValueError('нет нужных capabilities')
        return response

def probe(route, recipient):
    # Every operation gets a NEW inert probe; no cached capability survives rollback/restart.
    # B-N-1090(б) (28.09 Аврора): reply_channel=ledger, как zabava-v2-pismo:59 — читатель 1.5.45 кладёт ответ только в machineReplyBody
    # квитанции: без a2a-outbox и без копии владельцу. Без поля проба шла прежним маршрутом — ответ координатору и копия в Telegram.
    m={'kind':'capability_probe','reply_channel':'ledger','delivery_id':'probe:'+str(uuid.uuid4()),'recipient':{'id':recipient},
       'supersedes':{'decision_id':'absent:'+str(uuid.uuid4())}}
    with ledger(route) as db: identity(db,route)  # unreadable/unsupported => no dispatch
    started=int(time.time()*1000);put(route,m,'')
    deadline=time.monotonic()+60
    while True:
        reply=verify_response(route,m,started)
        if reply is not None:return reply
        if time.monotonic()>=deadline:raise TimeoutError('60с: поддержка не доказана; решение НЕ отправлено')
        time.sleep(.2)

class Razbor(argparse.ArgumentParser):
    # B-N-714 п.4 (28.09 Аврора): ошибка аргументов — ОТКАЗ v2 с кодом 3, как прочие отказы (argparse сам выходит с 2)
    def error(self, message): raise ValueError('аргументы: '+message)

def main():
    parser=Razbor()
    parser.add_argument('mode',choices=['probe','decision'])
    parser.add_argument('recipient')
    parser.add_argument('metadata',nargs='?')
    args=parser.parse_args()
    routes=json.loads(Path(os.environ.get('A2A_V2_ROUTES','/etc/a2a/v2-receivers.json')).read_text())
    route=routes.get(args.recipient)
    if not route or route.get('machine')!='sadik':raise ValueError('v2 разрешён только явному локальному маршруту sadik')
    m=None;body=''
    if args.mode=='decision':
        if not args.metadata:raise ValueError('нужен файл metadata')
        m=json.loads(Path(args.metadata).read_text());body=sys.stdin.read()
        if not isinstance(m,dict) or m.get('kind')!='decision' or not valid(m.get('delivery_id')) or not valid(m.get('decision_id')):
            raise ValueError('негодные идентификаторы decision')
        if not isinstance(m.get('recipient'),dict) or not isinstance(m.get('supersedes'),dict):raise ValueError('нет области decision')
        if m['recipient'].get('id')!=args.recipient or m['supersedes'].get('recipient')!=args.recipient or not valid(m['supersedes'].get('decision_id')):
            raise ValueError('цель другого получателя или нет decision_id')
        if not body.strip():raise ValueError('пустое решение')
    elif args.metadata:raise ValueError('лишний аргумент probe')
    reply=probe(route,args.recipient)
    if m is not None:
        if m['recipient'].get('ledger_uuid')!=reply['ledger_uuid'] or m['supersedes'].get('ledger_uuid')!=reply['ledger_uuid']:
            raise ValueError('ledger решения сменился; решение НЕ отправлено')
        with ledger(route) as db:
            if identity(db,route)!=reply['ledger_uuid']:raise ValueError('ledger сменился после пробы')
        target=put(route,m,body)
        print(json.dumps({'status':'submitted_not_executed','delivery_id':m['delivery_id'],'file':str(target)},ensure_ascii=False))
    else: print(json.dumps(reply,ensure_ascii=False))

if __name__=='__main__':
    try:main()
    except (OSError,ValueError,KeyError,IndexError,AttributeError,TypeError,sqlite3.Error,TimeoutError) as error:
        print('ОТКАЗ v2: '+str(error),file=sys.stderr);sys.exit(3)
