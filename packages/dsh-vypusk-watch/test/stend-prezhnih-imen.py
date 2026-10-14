"""Стенд прежних имён пакета (A-N-1948 шаг 0, 1.1.14): package.json "dsh":{"prezhnie_imena":[…]}.
RU: После переименования каталога/имени пакета (решение владельца 09.10: всё в npm — с приставкой dsh-, каталог = имени) метка
    версии боя, ключ VYPUSK_SOOTVETSTVIYA и каталог внутри метки остаются под ПРЕЖНИМ именем до первого выпуска под новым.
    Три подставных пакета повторяют три настоящих случая:
      pk-t   — каталог staryj → pk-t, имя прежнее; бой по корню имени; метка версии боя staryj-v1.0.0 (как telegram-multiagent);
      dsh-gws — каталог и имя gws → dsh-gws; бой по соответствию «gws=<бой>» (как subscription-gateway, ключ env не правлен);
      dsh-soc — запись derevo: subdir уже packages/dsh-soc, ref ещё soc-v1.0.0 с packages/soc (как socseti в окне).
    Пробы: исправное (поле есть) → сошлось 3, код 0 · порча (поле снято у всех трёх) → прежние ложные исходы: pk-t «невыпущенное»,
    dsh-gws «вне области», dsh-soc «в метке нет packages/dsh-soc/» · возврат → снова код 0 · кривое поле → слепота с именем поля.
EN: Former package names bench (A-N-1948 step 0): healthy → 3 matched; field removed → the old false outcomes; restored → green;
    malformed field → blindness naming the field.
⚠️ ЧЕГО НЕ ЛОВИТ: верность самого поля (что названо действительно прежнее имя) · метку под именем, которого нет в поле ·
    поведение под root · живые пути машины (здесь всё подставное).
Предмет — VYPUSK_TEST_WATCH (по умолчанию src/ этого пакета). Коды: 0 все пробы, 1 есть красная, 2 стенд не собрался.
"""
import grp, hashlib, json, os, pwd, shutil, subprocess, sys, tempfile
from pathlib import Path
try:
    import yaml
except ImportError:
    print("СЛЕПОТА: модуль yaml (PyYAML/python3-yaml) недоступен"); sys.exit(2)

watch = Path(os.environ.get('VYPUSK_TEST_WATCH', Path(__file__).resolve().parent.parent / 'src/vypusk-okno-watch.sh')).resolve()
if not watch.is_file(): print('СЛЕПОТА: предмета нет:', watch); sys.exit(2)
r = Path(tempfile.mkdtemp(prefix='stend-prezhnih-imen-'))
proshlo = vsego = 0
def proba(imya, uslovie, p=None):
    global proshlo, vsego
    vsego += 1
    if uslovie: proshlo += 1; print('  ✅', imya)
    else: print('  ❌', imya, '— код', p.returncode if p else '?', '| вывод:', (p.stdout + p.stderr)[-900:].replace('\n', ' ⏎ ') if p else '')
def sh(*a): return subprocess.run(a, check=True, capture_output=True, text=True)
def sha(p): return hashlib.sha256(Path(p).read_bytes()).hexdigest()[:16]
VLAD = pwd.getpwuid(os.getuid()).pw_name + ':' + grp.getgrgid(os.getgid()).gr_name
try:
    repo = r / 'repo'; korni = r / 'korni'; boj_gw = r / 'boj-gw'; disk = r / 'disk'
    g = ['git', '-C', str(repo), '-c', 'user.name=stend', '-c', 'user.email=stend@local']
    def paket(kat, name, version):
        d = repo / 'packages' / kat; d.mkdir(parents=True, exist_ok=True)
        (d / 'package.json').write_text(json.dumps({'name': name, 'version': version, 'files': ['index.js', 'CHANGELOG.md']}) + '\n')
        (d / 'index.js').write_text(f'export const v = "{version}";\n')
        (d / 'CHANGELOG.md').write_text(f'## {version}\n\nВыпуск {version}.\n')
    sh('git', 'init', '-q', str(repo))
    # Старая линия под именем pk-t (как 12 меток dsh-telegram-multiagent-v1.x): без неё порча дала бы слепоту «меток 0», а не «невыпущенное».
    paket('staryj', 'pk-t', '0.9.0'); sh(*g, 'add', '-A'); sh(*g, 'commit', '-qm', 'v0.9'); sh(*g, 'tag', 'pk-t-v0.9.0')
    paket('staryj', 'pk-t', '1.0.0'); paket('gws', 'gws', '1.0.0'); paket('soc', 'soc-service', '1.0.0')
    sh(*g, 'add', '-A'); sh(*g, 'commit', '-qm', 'v1'); sh(*g, 'tag', 'staryj-v1.0.0'); sh(*g, 'tag', 'gws-v1.0.0'); sh(*g, 'tag', 'soc-v1.0.0')
    # Бой — точные копии выпуска 1.0.0 под ПРЕЖНИМИ именами в package.json (монтажа под новым ещё не было).
    for kat, kuda in (('staryj', korni / 'pk-t'), ('gws', boj_gw)):
        shutil.copytree(repo / 'packages' / kat, kuda)
    loc_soc = disk / 'opt/soc/index.js'; loc_soc.parent.mkdir(parents=True); shutil.copyfile(repo / 'packages/soc/index.js', loc_soc); loc_soc.chmod(0o644)
    # Переименование одним коммитом без меток (шаг 2 плана A-N-1948).
    sh(*g, 'mv', 'packages/staryj', 'packages/pk-t'); sh(*g, 'mv', 'packages/gws', 'packages/dsh-gws'); sh(*g, 'mv', 'packages/soc', 'packages/dsh-soc')
    POLE = {'pk-t': ['staryj'], 'dsh-gws': ['gws'], 'dsh-soc': ['soc-service', 'soc']}
    def manifest(kat, pole):   # pole: список · None — поля нет · иное — кривое значение как есть
        m = {'name': 'pk-t' if kat == 'pk-t' else kat, 'version': '1.0.0', 'files': ['index.js', 'CHANGELOG.md']}
        if pole is not None: m['dsh'] = {'prezhnie_imena': pole}
        f = repo / 'packages' / kat / 'package.json'; do = sha(f); f.write_text(json.dumps(m) + '\n'); return do, sha(f)
    for k, v in POLE.items(): manifest(k, v)
    sh(*g, 'commit', '-qam', 'переименование + prezhnie_imena')
    reestr = r / 'plugins.yaml'
    reestr.write_text(yaml.safe_dump({'plugins': [], 'services': [{'id': 'soc', 'derevo': {
        'address': str(repo), 'ref': 'soc-v1.0.0', 'subdir': 'packages/dsh-soc',
        'files': [{'local': str(loc_soc), 'remote': 'index.js', 'mode': '0644', 'owner': VLAD}],
        'not_installed': ['package.json', 'CHANGELOG.md'], 'expected_diff_files': [], 'links': []}}]}, allow_unicode=True, sort_keys=False))
    (r / 'iskl').write_text(''); calls = r / 'calls'
    alert = r / 'alert'; alert.write_text(f'#!/bin/bash\necho CALL >> "{calls}"\n'); alert.chmod(0o755)
    def zapusk():
        env = {k: v for k, v in os.environ.items() if not k.startswith('VYPUSK_')}
        env.update(VYPUSK_REPO=str(repo), VYPUSK_KORNI=str(korni), VYPUSK_AGENT_KORNI='', VYPUSK_INFO_KORNI='',
                   VYPUSK_SOOTVETSTVIYA=f'gws={boj_gw}', VYPUSK_SSYLKI='', VYPUSK_RASKLADKA='', VYPUSK_REESTR=str(reestr),
                   VYPUSK_TIHO='0', VYPUSK_ALERT=str(alert), VYPUSK_SOSTOYANIE=str(r / 'state'), VYPUSK_ISKLYUCHENIYA=str(r / 'iskl'))
        for f in (r / 'state', r / 'state.slepota', calls):
            if f.exists(): f.unlink()
        p = subprocess.run(['bash', str(watch)], env=env, capture_output=True, text=True, timeout=120)
        p.v = p.stdout + p.stderr
        return p
    print('предмет:', watch, 'sha256', sha(watch))

    print('── ИСПРАВНОЕ: поле называет прежние имена ──')
    p = zapusk()
    proba('исправное → код 0, сошлось 3 (pk-t, dsh-gws по метке прежнего имени; dsh-soc по derevo)',
          p.returncode == 0 and 'сошлось: pk-t' in p.v and 'сошлось: dsh-gws' in p.v and 'сошлось: dsh-soc [derevo' in p.v, p)
    proba('исправное → названо, что метки несут прежние каталоги (staryj, gws, soc)',
          'прежний каталог packages/staryj' in p.v and 'прежний каталог packages/gws' in p.v and 'прежний каталог packages/soc' in p.v, p)

    print('── ПОРЧА: поле снято у всех трёх ──')
    for k in POLE: do, posle = manifest(k, None); print(f'  порча packages/{k}/package.json: sha256 {do} → {posle}'); assert do != posle, 'порча не внесена'
    p = zapusk()
    proba('порча → pk-t «смонтировано невыпущенное» (прежний ложный красный, как telegram после переименования)',
          'pk-t [копия' in p.v and 'смонтировано невыпущенное' in p.v, p)
    proba('порча → dsh-gws вне области (ключ соответствия gws больше не узнан)', 'dsh-gws (каталог dsh-gws)' in p.v and 'сошлось: dsh-gws' not in p.v, p)
    proba('порча → dsh-soc слепота «в метке soc-v1.0.0 нет packages/dsh-soc/»', 'в метке soc-v1.0.0 нет packages/dsh-soc/' in p.v, p)
    proba('порча → код ≠ 0', p.returncode != 0, p)

    print('── ВОЗВРАТ ──')
    for k, v in POLE.items(): manifest(k, v)
    p = zapusk()
    proba('возврат → снова код 0, сошлось 3', p.returncode == 0 and 'сошлось: pk-t' in p.v and 'сошлось: dsh-gws' in p.v and 'сошлось: dsh-soc [derevo' in p.v, p)

    print('── КРИВОЕ ПОЛЕ ──')
    manifest('pk-t', 'staryj'); manifest('dsh-soc', ['soc/../x'])
    p = zapusk()
    proba('prezhnie_imena строкой у пакета по манифесту → слепота с именем поля, код 2',
          p.returncode == 2 and 'pk-t: поле dsh.prezhnie_imena кривое' in p.v, p)
    proba('имя с «/» у записи derevo → слепота с именем поля', 'dsh-soc [derevo, запись soc]: поле dsh.prezhnie_imena кривое' in p.v, p)
    for k, v in POLE.items(): manifest(k, v)
    p = zapusk()
    proba('после кривого — возврат → код 0', p.returncode == 0, p)
except subprocess.CalledProcessError as e:
    print('СЛЕПОТА: стенд не собрался:', e.cmd, (e.stderr or '')[-300:]); sys.exit(2)
finally:
    shutil.rmtree(r, ignore_errors=True)
print(f'итог: {proshlo} из {vsego}')
sys.exit(0 if proshlo == vsego else 1)
