#!/usr/bin/env python3
"""Стенд сверки по записям derevo реестра (VYPUSK_REESTR, 1.1.13). Предмет — VYPUSK_TEST_WATCH (по умолчанию
../src/vypusk-okno-watch.sh). Всё во временном каталоге: подставное дерево с метками, подставной «диск» и подставной
реестр; записи derevo указывают на «диск» абсолютными путями. Боевые диск, дерево, реестр и канал тревог не трогаются:
канал — подставной сценарий, пишущий одну строку на вызов.
Пакеты: pk-d — без package.json, с нестандартным верхом etc/ (раскладка его не знает); pk-s — с package.json (как socseti).
Пробы: исправное молчит · порча файла — КРАСНОЕ с пакетом и путём, канал 1 · возврат — снова 0 · режим ≠ записи — КРАСНОЕ ·
запись отстала от метки — СЛЕПОТА · ref нет в дереве — СЛЕПОТА · expected_diff_files — INFO с причиной, код 0 ·
метка новее ref — INFO · derevo раньше раскладки — INFO «можно убрать», раскладка 0 · ссылка не та — КРАСНОЕ ·
запись на каталог вне дерева — СЛЕПОТА · реестр битый — СЛЕПОТА · VYPUSK_REESTR пусто — выключено (как 1.1.12);
во всех прогонах охват распределён без «ОХВАТ НЕ СОШЁЛСЯ».
ЧЕГО НЕ ПРОВЕРЯЕТ: чтение от root закрытых файлов (стенд идёт своей учёткой) · боевой реестр (его даёт живой прогон).
Код: 0 — все пробы, 1 — есть красная проба, 2 — стенд слеп.
"""
import grp, hashlib, os, pwd, shutil, subprocess, sys, tempfile
from pathlib import Path
try:
    import yaml
except ImportError:
    print("СЛЕПОТА: модуль yaml (PyYAML/python3-yaml) недоступен"); sys.exit(2)

watch = Path(os.environ.get('VYPUSK_TEST_WATCH', Path(__file__).resolve().parent.parent / 'src/vypusk-okno-watch.sh')).resolve()
if not watch.is_file(): print('СЛЕПОТА: предмета нет:', watch); sys.exit(2)
r = Path(tempfile.mkdtemp(prefix='stend-derevo-'))
proshlo = vsego = 0
def proba(imya, uslovie, p=None):
    global proshlo, vsego
    vsego += 1
    if uslovie: proshlo += 1; print('  ✅', imya)
    else: print('  ❌', imya, '— код', p.returncode if p else '?', '| вывод:', (p.stdout + p.stderr)[-700:].replace('\n', ' ⏎ ') if p else '')
def sh(*a): return subprocess.run(a, check=True, capture_output=True, text=True)
def sha(p): return hashlib.sha256(Path(p).read_bytes()).hexdigest()[:16]
VLAD = pwd.getpwuid(os.getuid()).pw_name + ':' + grp.getgrgid(os.getgid()).gr_name
try:
    repo = r / 'repo'; disk = r / 'disk'
    pd = repo / 'packages/pk-d'; ps = repo / 'packages/pk-s'
    for d in (pd / 'bin', pd / 'etc', ps / 'src'): d.mkdir(parents=True)
    (pd / 'bin/x').write_text('x-1\n'); (pd / 'etc/y.conf').write_text('y=1\n')
    (pd / 'README.md').write_text('readme\n'); (pd / 'CHANGELOG.md').write_text('## 1.0.1\n')
    (ps / 'package.json').write_text('{"name":"pk-s-service","version":"1.0.0"}\n'); (ps / 'src/a.js').write_text('a\n')
    (ps / 'PAKET.md').write_text('paket\n')
    g = ['git', '-C', str(repo), '-c', 'user.name=stend', '-c', 'user.email=stend@local']
    sh('git', 'init', '-q', str(repo)); sh(*g, 'add', '-A'); sh(*g, 'commit', '-qm', 'v1')
    sh(*g, 'tag', 'pk-d-v1.0.1'); sh(*g, 'tag', 'pk-s-v1.0.0')
    FD = [('bin/x', disk / 'usr/local/bin/x', '0755'), ('etc/y.conf', disk / 'etc/sadik/y.conf', '0644')]
    FS = [('package.json', disk / 'opt/pk-s/package.json', '0644'), ('src/a.js', disk / 'opt/pk-s/src/a.js', '0644')]
    def postavit():
        if disk.exists(): shutil.rmtree(disk)
        for (rem, loc, mo), src in [(f, pd) for f in FD] + [(f, ps) for f in FS]:
            loc.parent.mkdir(parents=True, exist_ok=True); shutil.copyfile(src / rem, loc); loc.chmod(int(mo, 8))
        (disk / 'link').symlink_to('opt/pk-s')
    def zapis(**pravka):
        d = {'id': 'pk-d', 'derevo': {'address': str(repo), 'ref': 'pk-d-v1.0.1', 'subdir': 'packages/pk-d',
             'files': [{'local': str(l), 'remote': rm, 'mode': mo, 'owner': VLAD} for rm, l, mo in FD],
             'not_installed': ['README.md', 'CHANGELOG.md'], 'expected_diff_files': [], 'links': []}}
        s = {'id': 'pk-s', 'derevo': {'address': str(repo), 'ref': 'pk-s-v1.0.0', 'subdir': 'packages/pk-s',
             'files': [{'local': str(l), 'remote': rm, 'mode': mo, 'owner': VLAD} for rm, l, mo in FS],
             'not_installed': ['PAKET.md'], 'expected_diff_files': [],
             'links': [{'local': str(disk / 'link'), 'target': 'opt/pk-s'}]}}
        for k, v in pravka.items(): (d if k.startswith('d_') else s)['derevo'][k[2:]] = v(d['derevo'] if k.startswith('d_') else s['derevo'])
        return {'plugins': [], 'services': [d, s]}
    reestr = r / 'plugins.yaml'
    def pisat(z): reestr.write_text(yaml.safe_dump(z, allow_unicode=True, sort_keys=False))
    (r / 'empty').mkdir(); (r / 'iskl').write_text(''); calls = r / 'calls'
    alert = r / 'alert'; alert.write_text(f'#!/bin/bash\necho CALL >> "{calls}"\n'); alert.chmod(0o755)  # одна строка на вызов
    def zapusk(reestr_val=None, raskladka=''):
        env = {k: v for k, v in os.environ.items() if not k.startswith('VYPUSK_')}
        env.update(VYPUSK_REPO=str(repo), VYPUSK_KORNI=str(r / 'empty'), VYPUSK_AGENT_KORNI='', VYPUSK_INFO_KORNI='',
                   VYPUSK_SOOTVETSTVIYA='', VYPUSK_SSYLKI='', VYPUSK_RASKLADKA=raskladka,
                   VYPUSK_REESTR=str(reestr) if reestr_val is None else reestr_val,
                   VYPUSK_TIHO='0', VYPUSK_ALERT=str(alert), VYPUSK_SOSTOYANIE=str(r / 'state'), VYPUSK_ISKLYUCHENIYA=str(r / 'iskl'))
        for f in (r / 'state', r / 'state.slepota', calls):
            if f.exists(): f.unlink()
        p = subprocess.run(['bash', str(watch)], env=env, capture_output=True, text=True, timeout=120)
        p.kanal = len(calls.read_text().splitlines()) if calls.exists() else 0
        p.ohvat_ok = 'ОХВАТ НЕ СОШЁЛСЯ' not in p.stdout and 'не распределены' not in p.stdout and 'распределены дважды' not in p.stdout
        p.v = p.stdout + p.stderr
        return p
    print('предмет:', watch, 'sha256', sha(watch))
    postavit(); pisat(zapis())
    p = zapusk()
    proba('исправное: 2 записи → код 0, «записей 2 · сошлось 2 · разошлось 0 · слепота 0», канал 0; pk-s не «вне области», pk-d не «без манифеста»',
          p.returncode == 0 and 'записей 2 · сошлось 2 · разошлось 0 · слепота 0' in p.stdout and p.kanal == 0 and p.ohvat_ok
          and 'вне области: pk-s' not in p.stdout and 'без манифеста: pk-d' not in p.stdout, p)
    x = disk / 'usr/local/bin/x'; do = sha(x); x.write_text('x-ПОРЧА\n'); x.chmod(0o755); print(f'  порча внесена: {x} {do} → {sha(x)}')
    p = zapusk()
    proba('порча файла → код 1, «🔴 pk-d [derevo», путь файла, канал 1', do != sha(x) and p.returncode == 1 and '🔴 pk-d [derevo' in p.stdout and f'иные суммы: {x}' in p.stdout and p.kanal == 1 and p.ohvat_ok, p)
    postavit(); print('  возврат: сумма', sha(x))
    p = zapusk()
    proba('возврат → код 0, сошлось 2, канал 0', p.returncode == 0 and 'записей 2 · сошлось 2' in p.stdout and p.kanal == 0, p)
    y = disk / 'etc/sadik/y.conf'; y.chmod(0o600); print(f'  порча режима: {y} → {oct(y.stat().st_mode & 0o777)}')
    p = zapusk()
    proba('режим ≠ записи → код 1, «режим: …y.conf 0600, в записи 0644»', p.returncode == 1 and f'режим: {y} 0600, в записи 0644' in p.stdout and p.ohvat_ok, p)
    postavit()
    pisat(zapis(d_files=lambda d: d['files'][:1]))
    p = zapusk()
    proba('из files убран etc/y.conf → СЛЕПОТА «запись отстала от метки», код 2', p.returncode == 2 and '«etc/y.conf» не в files и не в not_installed — запись отстала' in p.v and p.ohvat_ok, p)
    pisat(zapis(d_ref=lambda d: 'pk-d-v9.9.9'))
    p = zapusk()
    proba('ref на несуществующую метку → СЛЕПОТА, код 2', p.returncode == 2 and 'метки pk-d-v9.9.9 в дереве нет' in p.v and p.ohvat_ok, p)
    # B-N-2033: один remote на два места. Первым стоит ИСПОРЧЕННОЕ: словарь по remote оставлял последнее (исправное), и порча
    # проходила молча кодом 0. Теперь — слепота записи с id и обоими путями.
    zlo = disk / 'usr/local/bin/x-zlo'; zlo.write_text('x-ZLO\n'); zlo.chmod(0o755)
    pisat(zapis(d_files=lambda d: [{'local': str(zlo), 'remote': 'bin/x', 'mode': '0755', 'owner': VLAD}] + d['files']))
    p = zapusk()
    proba('2033 один remote на два места (первое испорчено) → СЛЕПОТА «запись pk-d: files.remote «bin/x» повторён в 2 местах (оба пути)», код 2',
          p.returncode == 2 and f'запись pk-d: files.remote «bin/x» повторён в 2 местах ({zlo}, {disk / "usr/local/bin/x"})' in p.v and p.ohvat_ok, p)
    zlo.unlink()
    y.write_text('y=машинное\n'); print('  порча под прощение:', y, sha(y))
    pisat(zapis(d_expected_diff_files=lambda d: ['etc/y.conf'], d_expected_diff_reason=lambda d: 'до разбора Б-1'))
    p = zapusk()
    proba('expected_diff_files → код 0, INFO с обеими суммами и причиной', p.returncode == 0 and 'прощено expected_diff_files (до разбора Б-1)' in p.stdout and 'записей 2 · сошлось 2' in p.stdout and p.kanal == 0, p)
    postavit(); pisat(zapis())
    sh(*g, 'tag', 'pk-d-v1.0.2')
    p = zapusk()
    proba('метка новее ref → INFO «новее записанной», код 0', p.returncode == 0 and 'метка новее записанной pk-d-v1.0.1: pk-d-v1.0.2' in p.stdout, p)
    sh(*g, 'tag', '-d', 'pk-d-v1.0.2')
    p = zapusk(raskladka='pk-d')
    proba('pk-d и в раскладке, и в derevo → derevo, INFO «можно убрать», раскладка 0, код 0',
          p.returncode == 0 and 'pk-d: назван в VYPUSK_RASKLADKA, но сверён по записи derevo' in p.stdout and 'раскладка (без манифеста, VYPUSK_RASKLADKA): пакетов 0' in p.stdout and p.ohvat_ok, p)
    (disk / 'link').unlink(); (disk / 'link').symlink_to('opt/inoe')
    p = zapusk()
    proba('ссылка ведёт не туда → код 1, «ссылка не туда»', p.returncode == 1 and 'ссылка не туда:' in p.stdout and p.ohvat_ok, p)
    postavit()
    # B-N-2033: ДВЕ записи на один каталог (pk-s и pk-s-anna — тот же пакет на двух местах): каждая судится своим id, порча одной не
    # прячется за другой, порядок записей исхода не меняет. До правки — СЛЕПОТА «две записи derevo на один каталог».
    def dve(obratno=False):
        z = zapis(); s2 = {'id': 'pk-s-anna', 'derevo': dict(z['services'][1]['derevo'], links=[],
             files=[{'local': str(disk / 'anna' / rm), 'remote': rm, 'mode': mo, 'owner': VLAD} for rm, _, mo in FS])}
        for rm, _, mo in FS:
            l = disk / 'anna' / rm; l.parent.mkdir(parents=True, exist_ok=True); shutil.copyfile(ps / rm, l); l.chmod(int(mo, 8))
        z['services'].append(s2)
        if obratno: z['services'].reverse()
        pisat(z)
    dve(); p = zapusk()
    proba('2033 две записи одного каталога чисты → обе «сошлось» по своему id, код 0',
          p.returncode == 0 and 'сошлось: pk-s [derevo, запись pk-s]' in p.stdout and 'сошлось: pk-s [derevo, запись pk-s-anna]' in p.stdout
          and 'две записи' not in p.v and p.ohvat_ok, p)
    x2 = disk / 'anna/src/a.js'; x2.write_text('B-N-2033 PORCHA\n')
    p = zapusk()
    proba('2033 порча места второй записи → код 1 «🔴 pk-s [derevo, запись pk-s-anna]», первая «сошлось»',
          p.returncode == 1 and '🔴 pk-s [derevo, запись pk-s-anna]' in p.stdout and f'иные суммы: {x2}' in p.stdout
          and 'сошлось: pk-s [derevo, запись pk-s]' in p.stdout and p.ohvat_ok, p)
    dve(obratno=True); p = zapusk()
    proba('2033 обратный порядок записей → тот же исход по тем же id', p.returncode == 0 and 'сошлось: pk-s [derevo, запись pk-s-anna]' in p.stdout
          and 'сошлось: pk-s [derevo, запись pk-s]' in p.stdout and p.ohvat_ok, p)
    # B-N-2033, условие Вениамина (MED): тело PY_DEREVO исполняет и montazh-okno — на реестре из ОДНОЙ записи (как verify_derevo,
    # sbin/montazh-okno: тело между <<'PY_DEREVO' и PY_DEREVO, реестр {'services':[{id, derevo}]}) строки обязаны быть прежней формы:
    # ключ — сам каталог, не «каталог#id». Через bash этого не видно (печать снимает «#id»), поэтому — прямым исполнением тела.
    postavit(); telo = watch.read_text().split("<<'PY_DEREVO'\n", 1)[1].split("\nPY_DEREVO\n", 1)[0]
    odna = r / 'odna.yaml'; odna.write_text(yaml.safe_dump({'services': [zapis()['services'][0]]}))
    q = subprocess.run([sys.executable, '-B', '-', str(odna), str(repo)], input=telo, capture_output=True, text=True, timeout=60)
    zap1 = [l for l in q.stdout.splitlines() if l.startswith('ZAP\t')]
    proba('2033 тело PY_DEREVO на реестре из одной записи (как montazh-okno) → «ZAP\\tpk-d\\tpk-d\\tpk-d-v1.0.1\\t2», ключи без «#»',
          q.returncode == 0 and zap1 == ['ZAP\tpk-d\tpk-d\tpk-d-v1.0.1\t2'] and all(l.split('\t')[1] == 'pk-d' for l in q.stdout.splitlines() if l), q)
    postavit()
    z = zapis(); z['services'].append({'id': 'pk-net', 'derevo': {'ref': 'pk-d-v1.0.1', 'subdir': 'packages/pk-net', 'files': []}}); pisat(z)
    p = zapusk()
    proba('запись на каталог вне дерева → СЛЕПОТА с именем, код 2', p.returncode == 2 and 'pk-net [derevo, запись pk-net]: каталога packages/pk-net в дереве нет' in p.v and p.ohvat_ok, p)
    reestr.write_text('services: [ {id: x, derevo: {\n')
    p = zapusk()
    proba('реестр битый → СЛЕПОТА «VYPUSK_REESTR: реестр … не прочитан», код 2', p.returncode == 2 and 'VYPUSK_REESTR: реестр' in p.v and 'не прочитан' in p.v, p)
    p = zapusk(reestr_val='')
    proba('VYPUSK_REESTR пусто → выключено: pk-d «без манифеста», «записей 0», код 0',
          p.returncode == 0 and 'без манифеста: pk-d' in p.stdout and 'записей 0 · сошлось 0' in p.stdout and p.ohvat_ok, p)
except subprocess.CalledProcessError as e:
    print('СЛЕПОТА стенда:', e, e.stderr); shutil.rmtree(r, ignore_errors=True); sys.exit(2)
shutil.rmtree(r, ignore_errors=True)
print(f'итог: {proshlo} из {vsego}')
sys.exit(0 if proshlo == vsego else 1)
