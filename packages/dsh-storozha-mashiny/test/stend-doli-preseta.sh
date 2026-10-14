#!/bin/bash
# RU: Стенд доли и порога D для kontekst-zamer (перенесён из стенда фермы; часть про второго читателя D — сторож
# RU:   компакта — в этот пакет не входит и убрана). Прибор обязан брать ГОТОВЫЙ D.defaultRoute (nominal) и НЕ подменять
# RU:   негодный D старым профилем или кэшем; готовый nominalThreshold не пересчитывается из ratio.
# RU: AST извлекает функции и цикл вывода из настоящего файла прибора; сам прибор целиком НЕ запускается.
# RU: Подставы — только во временном каталоге. Живой эталон (необязательно): если заданы AGENTS_REGISTRY и
# RU:   KOMPAKT_NASTROJKI_KATALOG — реестр и файлы D читаются независимо (yaml/json напрямую) и сверяются с прибором.
# RU: Нужен модуль реестра agent-registry (KONTEKST_REESTR_PRIBOR, по умолчанию /usr/local/bin/agent-registry) и python3-yaml.
# RU: Не проверяет: сборку D из настроек, effective-порог запроса, живость служб.
# EN: Stand for the D ratio/threshold of kontekst-zamer (ported from the farm stand; the part about the second D reader —
# EN:   the compaction watcher — is not in this package and was removed). The instrument must take the READY D.defaultRoute
# EN:   (nominal) and must NOT replace an invalid D with an old profile or cache; a ready nominalThreshold is not recomputed.
# EN: AST extracts the functions and the output loop from the real instrument file; the instrument itself is NOT run whole.
# EN: Fixtures live only in a temporary directory. Live reference (optional): if AGENTS_REGISTRY and
# EN:   KOMPAKT_NASTROJKI_KATALOG are set, the registry and D files are read independently (yaml/json directly) and compared.
# EN: Requires the agent-registry module (KONTEKST_REESTR_PRIBOR, default /usr/local/bin/agent-registry) and python3-yaml.
# EN: Does not check: building D from settings, the effective request threshold, service liveness.
# RU: Коды: 0 прошли; 1 расхождение; 2 предмет/эталон не прочитан. ZAMER — путь кандидата (умолчание: bin/ пакета).
# EN: Exit codes: 0 passed; 1 mismatch; 2 subject/reference unreadable. ZAMER — path of the candidate (default: bin/ of the package).
set -u
ZAMER="${ZAMER:-$(cd "$(dirname "$0")/.." && pwd)/bin/kontekst-zamer}"
# RU: 1.0.6: файл настроек машины стенду не нужен — без этого живой /etc/dsh-storozha-mashiny/*.conf подменял пробы.
# EN: 1.0.6: isolate from the machine settings file (a live /etc/dsh-storozha-mashiny/*.conf altered the probes).
IZ=$(mktemp -d) || exit 2; trap 'rm -rf "$IZ"' EXIT; export DSH_STOROZHA_MASHINY_CONF="$IZ/net-fajla-nastroek.conf"
python3 -B - "$ZAMER" <<'PY'
import ast, contextlib, copy, glob, hashlib, io, json, os, pathlib, shutil, sys, tempfile
try:import yaml
except ImportError:print('СЛЕПОТА: нет python3-yaml');sys.exit(2)
ok = bad = blind = 0

def check(name, fn):
    global ok, bad
    try:
        fn(); ok += 1; print('  ok   ' + name)
    except Exception as e:
        bad += 1; print('  FAIL ' + name + ': ' + str(e))

def require(value, message):
    if not value: raise AssertionError(message)

def extract(path):
    text = pathlib.Path(path).read_text(); tree = ast.parse(text)
    names = {'KESH_VERSII_ZAPISI', 'REESTR_PRIBOR', '_REESTR', '_gotovy_porog', 'kesh_proekcij', 'imya_agenta'}
    nodes = []; found = set()
    for node in tree.body:
        ids = {node.name} if isinstance(node, ast.FunctionDef) else {t.id for t in node.targets if isinstance(t, ast.Name)} if isinstance(node, ast.Assign) else set()
        if ids & names: nodes.append(node); found |= ids & names
    if found != names: raise ValueError('отсутствуют элементы нового читателя: ' + str(sorted(names-found)))
    ns = {'os': os, 'sys': sys, 'json': json, 'glob': glob}
    exec(compile(ast.Module(body=nodes, type_ignores=[]), path, 'exec'), ns)
    loops = [n for n in tree.body if isinstance(n, ast.For) and isinstance(n.target, ast.Name) and n.target.id == 'home' and isinstance(n.iter, ast.Name) and n.iter.id == 'DOMA']
    if len(loops) != 1: raise ValueError('цикл вывода home/DOMA не единственный')
    ns['_output_loop'] = compile(ast.Module(body=loops, type_ignores=[]), path, 'exec')
    return ns

# RU: Числа фикстуры и ожидания ниже раздельны. 617 намеренно не floor(1000 * 0.61):
# RU: потребителю задан готовый nominal, он не имеет права пересчитывать его.
# EN: Fixture numbers and expectations below are separate. 617 is deliberately not floor(1000 * 0.61):
# EN: the consumer is given a ready nominal and has no right to recompute it.
# Missing registry tooling is environment blindness, before any fixture verdicts.
registry_tool=os.environ.get('KONTEKST_REESTR_PRIBOR','/usr/local/bin/agent-registry')
if not os.path.isfile(registry_tool) or not os.access(registry_tool,os.X_OK):
    print('СЛЕПОТА: не исполняется KONTEKST_REESTR_PRIBOR '+registry_tool);sys.exit(2)
D = {'porogi': {'schema': 1, 'defaultRoute': {'provider': 'fixture', 'model': 'main'}, 'routes': [
    {'provider': 'fixture', 'model': 'other', 'window': 5000, 'ratio': 0.9, 'nominalThreshold': 4317},
    {'provider': 'fixture', 'model': 'main', 'window': 1000, 'ratio': 0.61, 'nominalThreshold': 617}]}}
old_env = {k: os.environ.get(k) for k in ['AGENTS_REGISTRY', 'KOMPAKT_NASTROJKI_KATALOG']}
with tempfile.TemporaryDirectory(prefix='stend-doli-D-') as temp:
    root = pathlib.Path(temp); home = root/'fixture/.dsh'; home.mkdir(parents=True)
    (home/'profiles/web').mkdir(parents=True); (home/'profiles/web/cordis.patch.yml').write_text('thresholdRatio: 0.99\ncontextWindow: 99999\n')
    registry = root/'agents.yaml'; registry.write_text(yaml.safe_dump({'agenty':[{'imya':'fixture','namerenie':{'dom':str(home.parent),'kompakt_agent':'fixture'}}]}))
    kat = root/'D'; kat.mkdir(); target = kat/'fixture.json'
    os.environ.update(AGENTS_REGISTRY=str(registry), KOMPAKT_NASTROJKI_KATALOG=str(kat))
    cp = {'pressureTokens':600, 'surfaceTokens':36, 'sampledSurfaceTokens':20, 'contextWindow':9000}
    (home/'storages').mkdir()
    legacy = home/'storages/session_projcache.json'
    def cache(records):
        if not records: shutil.rmtree(home/'storages/session_projcache', ignore_errors=True)
        legacy.write_text(json.dumps({'tables':{'sessions':{'s':{'rows':{'contextPressure':{'val':cp}}}}}}))
        if records:
            p = home/'storages/session_projcache/sessions'; p.mkdir(parents=True, exist_ok=True)
            (p/'s.json').write_text(json.dumps({'version':7,'record':{'identity':{'id':'s'},'rows':{'contextPressure':{'ver':1,'seq':1,'val':cp}}}}))
            legacy.write_text(json.dumps({'tables':{}}))  # RU: старый кэш не заменяет per-record · EN: the old cache does not replace per-record
    def put(doc):
        if doc is None: target.unlink(missing_ok=True)
        elif isinstance(doc, str): target.write_text(doc)
        else: target.write_text(json.dumps(doc, ensure_ascii=False))
    readers=[]
    for path in sys.argv[1:2]:
        label=pathlib.Path(path).name
        try: ns=extract(path)
        except Exception as e: print('СЛЕПОТА '+label+': '+str(e));blind+=1;continue
        readers.append((label,ns));print(label+' SHA256='+hashlib.sha256(pathlib.Path(path).read_bytes()).hexdigest())
        put(D);print('fixture D SHA256='+hashlib.sha256(target.read_bytes()).hexdigest())
        def policy():
            p=ns['_gotovy_porog'](str(home));require((p['model'],p['window'],p['ratio'],p['nominalThreshold'],p['routeSource'],p['thresholdKind'])==('main',1000,0.61,617,'defaultRoute','nominal'),str(p))
        check(label+' D/defaultRoute, готовые числа, не профиль',policy)
        switched=copy.deepcopy(D);switched['porogi']['defaultRoute']['model']='other';put(switched)
        check(label+' смена defaultRoute',lambda: require(ns['_gotovy_porog'](str(home))['nominalThreshold']==4317,'выбран не defaultRoute'))
        put(D)
        for records in [False,True]:
            cache(records)
            def consumer():
                ns.update(DOMA=[str(home)],MASHINNO=True,vsego=0,nazvano=0,doli=[],formy=[])
                out=io.StringIO()
                with contextlib.redirect_stdout(out):exec(ns['_output_loop'],ns)
                fields=dict(v.split('=',1) for v in out.getvalue().split() if '=' in v)
                for k,v in {'projected':'616','okno':'1000','porog':'617','route_source':'defaultRoute','threshold_kind':'nominal','okno_ist':'D'}.items():require(fields.get(k)==v,k+': '+out.getvalue())
            check(label+' потребитель, кэш '+('0.2' if records else '0.1'),consumer)
        invalid=[('нет файла',None),('JSON битый','{bad'),('нет porogi',{}),('schema',{'porogi':{**D['porogi'],'schema':9}})]
        for key,value in [('window',0),('ratio',1.2),('nominalThreshold',1000)]:
            broken=copy.deepcopy(D);broken['porogi']['routes'][1][key]=value;invalid.append(('негодное число '+key,broken))
        duplicate=copy.deepcopy(D);duplicate['porogi']['routes'].append(duplicate['porogi']['routes'][1]);invalid.append(('повтор маршрута',duplicate))
        absent=copy.deepcopy(D);absent['porogi']['defaultRoute']['model']='absent';invalid.append(('нет defaultRoute в routes',absent))
        for name,doc in invalid:
            put(doc)
            def refuse():
                try: ns['_gotovy_porog'](str(home))
                except ValueError: pass
                else: raise AssertionError('негодный D принят')
                ns.update(DOMA=[str(home)],MASHINNO=True,vsego=0,nazvano=0,doli=[],formy=[]);out=io.StringIO()
                with contextlib.redirect_stdout(out),contextlib.redirect_stderr(io.StringIO()):exec(ns['_output_loop'],ns)
                require('status=ne_izmereno reason=D' in out.getvalue(),'отказ не передан в вывод');require('projected=' not in out.getvalue(),'выдано ложное измерение')
            check(label+' негодный D, '+name+', без fallback',refuse)
        # RU: 1.0.1: ветка «доли нет» (ratio=None) — без NameError, доля «слепо (…)».
        put(D); orig=ns['_gotovy_porog']
        def bez_doli():
            ns['_gotovy_porog']=lambda h: {**orig(h),'ratio':None}
            try:
                ns.update(DOMA=[str(home)],MASHINNO=True,vsego=0,nazvano=0,doli=[],formy=[]);out=io.StringIO()
                with contextlib.redirect_stdout(out),contextlib.redirect_stderr(io.StringIO()):exec(ns['_output_loop'],ns)
            finally: ns['_gotovy_porog']=orig
            require(any('слепо (' in d for d in ns['doli']),'доля без числа не названа: '+str(ns['doli']))
        check(label+' 1.0.1: доли нет — «слепо (…)», без NameError',bez_doli)
    for key,value in old_env.items():
        if value is None: os.environ.pop(key,None)
        else: os.environ[key]=value
    # RU: Независимый срез эталона: yaml/json напрямую, НЕ chitat_porog_d. Только если оба пути заданы явно.
    # EN: Independent reference slice: yaml/json directly, NOT chitat_porog_d. Only if both paths are set explicitly.
    if not (os.environ.get('AGENTS_REGISTRY') and os.environ.get('KOMPAKT_NASTROJKI_KATALOG')):
        print('живой эталон пропущен: AGENTS_REGISTRY и KOMPAKT_NASTROJKI_KATALOG не заданы · live reference skipped')
        readers=[]
    try:
        live=yaml.safe_load(pathlib.Path(os.environ['AGENTS_REGISTRY']).read_text()) if readers else {'agenty':[]}
        for label,ns in readers:
            ns['_REESTR']=[]
            for a in live['agenty']:
                n=a['namerenie'];name=n.get('kompakt_agent')
                if not name:continue
                f=pathlib.Path(os.environ['KOMPAKT_NASTROJKI_KATALOG'])/(name+'.json');d=json.loads(f.read_text())['porogi'];route=d['defaultRoute'];expected=[x for x in d['routes'] if (x['provider'],x['model'])==(route['provider'],route['model'])]
                require(len(expected)==1,'эталон неоднозначен '+str(f))
                def live_case(n=n,expected=expected):
                    actual=ns['_gotovy_porog'](n['dom']+'/.dsh');require(all(actual[k]==v for k,v in expected[0].items()),str(actual));require(actual['routeSource']=='defaultRoute' and actual['thresholdKind']=='nominal','не nominal/defaultRoute')
                check(label+' живой D '+a['imya'],live_case)
    except Exception as e: print('СЛЕПОТА живого эталона: '+str(e));blind+=1
print(f'ИТОГ: ok={ok} FAIL={bad} СЛЕПОТА={blind}')
sys.exit(1 if bad else 2 if blind else 0)
PY
