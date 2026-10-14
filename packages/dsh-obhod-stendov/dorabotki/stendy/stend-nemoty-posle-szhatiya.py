#!/usr/bin/python3 -I
# stend-nemoty-posle-szhatiya.py — ложная «немота сжатия» после сжатия (07.10.2026, Аврора; наряд Забавы 12:43Z, пункт B).
# Предмет: довод 1, без довода — боевой /usr/local/sbin/dsh-compact-watch. Как stend-doli-preseta: AST вынимает функции из
# НАСТОЯЩЕГО файла, main и канал тревог не запускаются; реестр, D (готовый порог) и кэш проекций — во временном каталоге;
# тревоги — это возвращённый nemota() список, никуда не шлётся.
# Проверяет: после compaction/start сессии немота не считает ходы «над порогом», пока pressureTokens кэша не сменится
# (общий помощник zhdu_posle_szhatiya с порогами), с пределом POSLE_SZHATIYA_PREDEL_S. НЕ проверяет: разбор журнала
# сторожем (строки подаются готовыми), блок порогов целиком (только помощник напрямую), живой кэш.
# Коды: 0 — всё сошлось; 1 — расхождение; 2 — предмет не прочитан.
import ast, contextlib, glob, io, json, os, pathlib, re, sys, tempfile, time

PREDMET = sys.argv[1] if len(sys.argv) > 1 else '/usr/local/sbin/dsh-compact-watch'
NUZHNY = {'KESH_VERSII_ZAPISI', 'REESTR_PRIBOR', '_REESTR', '_gotovy_porog', 'kesh_proekcij', 'davlenie_sessij',
          'nemota', 'pressure_iz_kesha', 'POSLE_SZHATIYA_PREDEL_S', 'NEMOTA_HODOV', 'NEMOTA_ISKLYUCHENY',
          'RE_SOB_SESSII', 'imya_agenta'}
NEOBYAZ = {'zhdu_posle_szhatiya', 'ru', 'tys', 'VIDIMOE'}   # 08.10: помощники короткой строки (у основы их нет)   # у основы (до правки) его нет — стенд обязан её прогнать и показать беду


def vynut(path):
    tree = ast.parse(pathlib.Path(path).read_text(encoding='utf-8'))
    nodes, found = [], set()
    for n in tree.body:
        ids = ({n.name} if isinstance(n, ast.FunctionDef) else
               {t.id for t in n.targets if isinstance(t, ast.Name)} if isinstance(n, ast.Assign) else set())
        if ids & (NUZHNY | NEOBYAZ): nodes.append(n); found |= ids
    if not NUZHNY <= found: raise ValueError('нет в предмете: ' + str(sorted(NUZHNY - found)))
    ns = {'os': os, 'sys': sys, 'json': json, 'glob': glob, 're': re, 'time': time}
    exec(compile(ast.Module(body=nodes, type_ignores=[]), path, 'exec'), ns)
    return ns, bool(found & NEOBYAZ)


try:
    NS, EST_POMOSHCHNIK = vynut(PREDMET)
except Exception as e:
    print(f'СЛЕПОТА: {PREDMET} не прочитан: {e}'); sys.exit(2)
print(f'предмет {PREDMET}; общий помощник: {"есть" if EST_POMOSHCHNIK else "НЕТ (основа)"}')

ok = bad = 0
def proba(imya, uslovie, pokaz=''):
    global ok, bad
    if uslovie: ok += 1; print(f'  ✅ {imya}')
    else: bad += 1; print(f'  FAIL {imya}{" — " + str(pokaz)[:300] if pokaz else ""}')

POROG, NAD, NAD2, POD = 617, 800, 900, 300   # готовый nominalThreshold фикстуры; давления над/под ним
with tempfile.TemporaryDirectory(prefix='stend-nemoty-') as tmp:
    root = pathlib.Path(tmp); home = root / 'fixture/.dsh'; (home / 'storages').mkdir(parents=True)
    (root / 'agents.yaml').write_text(json.dumps({'agenty': [{'imya': 'fixture', 'namerenie': {'dom': str(home.parent), 'kompakt_agent': 'fixture'}}]}))
    kat = root / 'D'; kat.mkdir()
    (kat / 'fixture.json').write_text(json.dumps({'porogi': {'schema': 1, 'defaultRoute': {'provider': 'f', 'model': 'main'},
        'routes': [{'provider': 'f', 'model': 'main', 'window': 1000, 'ratio': 0.61, 'nominalThreshold': POROG}]}}))
    os.environ.update(AGENTS_REGISTRY=str(root / 'agents.yaml'), KOMPAKT_NASTROJKI_KATALOG=str(kat))
    NS.update(AGENT_PO_SLUZHBE={'fixture.service': 'fixture'}, NEMOTA_ISKLYUCHENY={}, dsh_home=lambda _u: str(home))

    def kesh(p):   # кэш проекций 0.1.1 (один файл), давление = p
        (home / 'storages/session_projcache.json').write_text(json.dumps({'tables': {'sessions': {'s': {'rows': {
            'contextPressure': {'val': {'pressureTokens': p, 'surfaceTokens': 0, 'sampledSurfaceTokens': 0, 'contextWindow': 1000}}}}}}}))

    def takt(s, *sobytiya):   # один такт сторожа: строки журнала → nemota(); вернуть тексты тревог
        stroki = [('fixture.service', f'12:{i:02d}:00', f'[варвара] [event] type={e} session.id=s knownSessions=s', None)
                  for i, e in enumerate(sobytiya)]
        with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
            return [t for _k, t in NS['nemota'](stroki, s, False)]

    def nemota_est(tr): return any('НЕМОТА СЖАТИЯ' in (t[0] if isinstance(t, tuple) else t) for t in tr)   # 08.10: тревога — пара (полное, коротко)

    try:
        kesh(NAD); s = {}
        takt(s); tr = takt(s, 'turn/start', 'turn/start')
        proba('(в) без сжатия: 2 хода над порогом → тревога ЕСТЬ (как прежде)', nemota_est(tr), tr)

        kesh(NAD); s = {}
        takt(s); takt(s, 'compaction/start'); tr = takt(s, 'turn/start', 'turn/start')
        proba('(а) сжатие → 2 хода при прежнем (досжатом) кэше → тревоги НЕТ', not nemota_est(tr), tr)

        kesh(NAD); s = {}
        takt(s); takt(s, 'compaction/start'); kesh(NAD2); takt(s); tr = takt(s, 'turn/start', 'turn/start')
        proba('(б) сжатие → кэш сменился на ≥ порога → такт → 2 хода → тревога ЕСТЬ', nemota_est(tr), tr)

        kesh(NAD); s = {}
        takt(s); takt(s, 'compaction/start'); kesh(POD); takt(s); tr = takt(s, 'turn/start', 'turn/start')
        proba('(б2) сжатие → кэш сменился НИЖЕ порога → 2 хода → тревоги нет', not nemota_est(tr), tr)

        kesh(NAD); s = {}
        takt(s); takt(s, 'compaction/start')
        for v in s.get('posle_szhatiya', {}).values(): v['ts'] -= NS['POSLE_SZHATIYA_PREDEL_S'] + 60
        takt(s); tr = takt(s, 'turn/start', 'turn/start')
        proba('(г) кэш не сменился дольше предела (6 ч) → сужу по кэшу, тревога ЕСТЬ',
              nemota_est(tr), tr)

        # (д) отметку поставил compaction/end (разбор журнала сторожем), ходы — в том же такте, nad с прошлого такта True
        kesh(NAD); s = {}
        takt(s)
        s.setdefault('posle_szhatiya', {})['fixture/s'] = {'pressure': None, 'ts': time.time()}
        tr = takt(s, 'turn/start', 'turn/start')
        proba('(д) отметка от compaction/end, ходы в том же такте при nad с прошлого такта → тревоги НЕТ', not nemota_est(tr), tr)

        # помощник напрямую — то же правило, что у блока порогов (B-N-1758): поведение порогов не изменилось
        if EST_POMOSHCHNIK:
            z = NS['zhdu_posle_szhatiya']
            with contextlib.redirect_stderr(io.StringIO()):
                kesh(NAD); s = {}; kd = {}
                r0 = z(s, 'fixture', 's', kd)
                s['posle_szhatiya'] = {'fixture/s': {'pressure': None, 'ts': time.time()}}
                r1 = z(s, 'fixture', 's', {}); zap = s['posle_szhatiya']['fixture/s'].get('pressure')
                r2 = z(s, 'fixture', 's', {})
                kesh(NAD2); r3 = z(s, 'fixture', 's', {}); snyata = 'fixture/s' not in s['posle_szhatiya']
                s['posle_szhatiya'] = {'fixture/s': {'pressure': None, 'ts': time.time()}}
                (home / 'storages/session_projcache.json').write_text('{"tables": {}}'); r4 = z(s, 'fixture', 's', {})
            proba('помощник: нет отметки → не жду; первый замер → жду и запоминаю; тот же → жду; сменился → не жду, отметка снята; '
                  'кэш не прочитан → жду', (r0, r1, zap, r2, r3, snyata, r4) == (False, True, NAD, True, False, True, True),
                  (r0, r1, zap, r2, r3, snyata, r4))
        else:
            proba('помощник zhdu_posle_szhatiya в предмете есть', False, 'нет — основа до правки')
    except Exception as e:
        bad += 1; print(f'  FAIL стенд упал: {type(e).__name__}: {e}')

print(f'итог: {ok} из {ok + bad}')
sys.exit(0 if bad == 0 else 1)
