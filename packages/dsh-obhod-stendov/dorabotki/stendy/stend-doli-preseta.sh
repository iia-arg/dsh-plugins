#!/bin/bash
# B-N-1413: историческое имя сохранено; предмет теперь готовый D.defaultRoute, nominal.
# Проверяем двух потребителей D: kontekst-zamer и dsh-compact-watch. Старый профиль/кэш
# не может заменить негодный D. Готовый nominalThreshold не пересчитывается из ratio.
# AST извлекает функции и цикл вывода из настоящих файлов; main/канал сторожа НЕ запускаются.
# Подставы только в TemporaryDirectory; живые F/D читаются независимо как эталон значений.
# Не проверяет компиляцию F/A -> D, effective-порог запроса и живость служб.
# Коды: 0 прошли; 1 расхождение; 2 предмет/эталон не прочитан. ZAMER/COMPACT — пути кандидатов.
set -u
ZAMER="${ZAMER:-/usr/local/sbin/kontekst-zamer}"; COMPACT="${COMPACT:-/usr/local/sbin/dsh-compact-watch}"
python3 -B - "$ZAMER" "$COMPACT" <<'PY'
import ast, contextlib, copy, glob, hashlib, io, json, os, pathlib, shutil, sys, tempfile
import yaml
ok = bad = blind = 0

def check(name, fn):
    global ok, bad
    try:
        fn(); ok += 1; print('  ok   ' + name)
    except Exception as e:
        bad += 1; print('  FAIL ' + name + ': ' + str(e))

def require(value, message):
    if not value: raise AssertionError(message)

def extract(path, compact):
    text = pathlib.Path(path).read_text(); tree = ast.parse(text)
    names = {'KESH_VERSII_ZAPISI', 'REESTR_PRIBOR', '_REESTR', '_gotovy_porog', 'kesh_proekcij'}
    names |= {'davlenie_sessij', 'nemota'} if compact else {'imya_agenta'}
    nodes = []; found = set()
    neobyaz = {'ru', 'tys', 'VIDIMOE'} if compact else set()   # 08.10: помощники короткой строки сторожа (у основы их нет)
    for node in tree.body:
        ids = {node.name} if isinstance(node, ast.FunctionDef) else {t.id for t in node.targets if isinstance(t, ast.Name)} if isinstance(node, ast.Assign) else set()
        if ids & (names | neobyaz): nodes.append(node); found |= ids & names
    if found != names: raise ValueError('отсутствуют элементы нового читателя: ' + str(sorted(names-found)))
    ns = {'os': os, 'sys': sys, 'json': json, 'glob': glob}
    exec(compile(ast.Module(body=nodes, type_ignores=[]), path, 'exec'), ns)
    if not compact:
        loops = [n for n in tree.body if isinstance(n, ast.For) and isinstance(n.target, ast.Name) and n.target.id == 'home' and isinstance(n.iter, ast.Name) and n.iter.id == 'DOMA']
        if len(loops) != 1: raise ValueError('цикл вывода home/DOMA не единственный')
        ns['_output_loop'] = compile(ast.Module(body=loops, type_ignores=[]), path, 'exec')
    return ns

# Числа фикстуры и ожидания ниже раздельны. 617 намеренно не floor(1000 * 0.61):
# потребителю задан готовый nominal, он не имеет права пересчитывать его.
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
            legacy.write_text(json.dumps({'tables':{}}))  # старый кэш не заменяет per-record
    def put(doc):
        if doc is None: target.unlink(missing_ok=True)
        elif isinstance(doc, str): target.write_text(doc)
        else: target.write_text(json.dumps(doc, ensure_ascii=False))
    readers=[]
    for path, compact in zip(sys.argv[1:], [False, True]):
        label=pathlib.Path(path).name
        try: ns=extract(path,compact)
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
                if compact:
                    ns.update(AGENT_PO_SLUZHBE={'fixture.service':'fixture'},NEMOTA_ISKLYUCHENY={},dsh_home=lambda _:str(home))
                    require(ns['davlenie_sessij'](str(home))=={'s':(616,1000)},'окно/давление взято не из D/кэша')
                    state={}
                    with contextlib.redirect_stderr(io.StringIO()):ns['nemota']([],state,False)
                    z=state['nemota']['fixture/s'];require(z['porog']==617 and not z['nad'],'nominal заменён пересчётом/старым окном: '+str(z))
                else:
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
                if compact:
                    state={}
                    with contextlib.redirect_stderr(io.StringIO()):tr=ns['nemota']([],state,False)
                    require(bool(state['nemota_slepo']) and 'fixture/s' not in state['nemota'],'неизвестное давление принято');require(bool(tr),'отказ не назван')
                else:
                    ns.update(DOMA=[str(home)],MASHINNO=True,vsego=0,nazvano=0,doli=[],formy=[]);out=io.StringIO()
                    with contextlib.redirect_stdout(out),contextlib.redirect_stderr(io.StringIO()):exec(ns['_output_loop'],ns)
                    require('status=ne_izmereno reason=D' in out.getvalue(),'отказ не передан в вывод');require('projected=' not in out.getvalue(),'выдано ложное измерение')
            check(label+' негодный D, '+name+', без fallback',refuse)
    for key,value in old_env.items():
        if value is None: os.environ.pop(key,None)
        else: os.environ[key]=value
    # Независимый срез эталона: yaml/json напрямую, НЕ chitat_porog_d и НЕ sobrat.
    try:
        live=yaml.safe_load(pathlib.Path(os.environ.get('AGENTS_REGISTRY','/etc/agent-registry/agents.yaml')).read_text())
        for label,ns in readers:
            ns['_REESTR']=[]
            for a in live['agenty']:
                n=a['namerenie'];name=n.get('kompakt_agent')
                if not name:continue
                f=pathlib.Path(os.environ.get('KOMPAKT_NASTROJKI_KATALOG','/etc/dsh-pamyat/agenty'))/(name+'.json');d=json.loads(f.read_text())['porogi'];route=d['defaultRoute'];expected=[x for x in d['routes'] if (x['provider'],x['model'])==(route['provider'],route['model'])]
                require(len(expected)==1,'эталон неоднозначен '+str(f))
                def live_case(n=n,expected=expected):
                    actual=ns['_gotovy_porog'](n['dom']+'/.dsh');require(all(actual[k]==v for k,v in expected[0].items()),str(actual));require(actual['routeSource']=='defaultRoute' and actual['thresholdKind']=='nominal','не nominal/defaultRoute')
                check(label+' живой D '+a['imya'],live_case)
    except Exception as e: print('СЛЕПОТА живого эталона: '+str(e));blind+=1
print(f'ИТОГ: ok={ok} FAIL={bad} СЛЕПОТА={blind}')
sys.exit(1 if bad else 2 if blind else 0)
PY
