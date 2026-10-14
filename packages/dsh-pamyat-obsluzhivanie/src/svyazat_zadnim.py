#!/usr/bin/env python3
"""RU: svyazat_zadnim.py — разовый проход A-N-1731: связать задним числом уроки, уже доставленные ступенью уроков в
OMEGA до выпуска 1.1.17, у которых в базе агента нет строки svyaz_omega.
Зовущий — человек (рука монтажа), под учёткой службы (omega), по одному агенту; не таймер, не служба.
Откуда берёт: квитанции ступени уроков (lessons.json: omega_verified, local_id, omega_id) — какие пары проверять;
базу агента pamyat.db — локальную запись; базу OMEGA — ТОЛЬКО SQL в режиме mode=ro (без сервера OMEGA: запрос через
сервер меняет access_count). Квитанция — лишь подсказка: связь ставится, только если чтением сошлось всё:
  локальная запись: агент, класс urok, источник = источник квитанции, связи ещё нет;
  узел OMEGA: тот же корень (entity_id), active, lesson_learned, без superseded/ttl/valid_until, текст побайтно равен
  локальному, source_uri = источник, у не-legacy — source_key = ключ квитанции (lessons_store.verify); и узел
  единственный по (корень, source_key) — у legacy по (корень, source_uri).
Связь пишет штатная операция link моста local_lessons.mjs (1.1.17): kak=dostavka или vosstanovleno-tekstom (legacy),
отметка журнала ядра dostavleno/podtverzhdeno-chteniem.
Режимы (ровно один):
  --suho        только перечень: что свяжет и что пропустит с причиной; ничего не пишет (базы открыты mode=ro).
  --v-boj       копия pamyat.db (sqlite backup, integrity_check) → под замком писателя уроков связи по одной;
                перед каждой связью строка намерения в список отката, после — строка подтверждения (fsync).
  --otkat ФАЙЛ  по списку отката: удалить ровно вставленные строки svyaz_omega (zapis_id+mem_id) и отметки журнала.
Служба агента (A-N-1732): --v-boj до копии и замка читает у службы из реестра (namerenie.sluzhba) LoadState и MainPID
(systemctl show). Служба неизвестна/не читается — отказ; MainPID ≠ 0 — отказ sluzhba_zhiva. Осознанный обход —
--pri-zhivoj-sluzhbe ПРИЧИНА (например, пустой ход по решению ворот): причина и увиденный MainPID пишутся в шапку списка.
Неизвестный довод, сокращение довода, --dry-run и т. п. — отказ (код 2), а не действие.
Коды: 0 — сделано (в --suho — перечень снят); 1 — есть пропуски/отказы связи; 2 — отказ до действия.
Чего НЕ делает: не трогает OMEGA (только чтение), не пишет квитанции lessons.json, не связывает уроки без квитанции.
Чего НЕ ловит: запись агента в свою базу между сверкой и связью другим писателем (замок берёт только ступень
уроков; агент пишет мимо него) — поэтому проход по бою — при остановленном агенте или в паузе между ходами; проверка
MainPID разовая, до прохода: подъём службы во время прохода она не увидит.
EN: One-off A-N-1731 pass: backfill svyaz_omega links for lessons delivered to OMEGA before 1.1.17, verified by
read-only SQL against OMEGA; modes --suho (list only), --v-boj (backup, link, rollback list), --otkat (rollback)."""
import argparse
import datetime
import fcntl
import json
import os
import sqlite3
import subprocess
import sys
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import lessons
from lessons_store import verify, Refused

STATE = Path('/var/lib/dsh-pamyat-obsluzhivanie/lessons.json')


def ro(path):
    c = sqlite3.connect(f'file:{Path(path).resolve()}?mode=ro', uri=True)
    c.row_factory = sqlite3.Row
    return c


def sluzhba_agenta(agent, registry=None):
    import yaml
    reg = registry if registry is not None else lessons.REGISTRY
    if reg is None:
        raise Refused('registry_not_set')
    for e in yaml.safe_load(Path(reg).read_text()).get('agenty') or []:
        if e.get('imya') == agent:
            s = (e.get('namerenie') or {}).get('sluzhba')
            if isinstance(s, str) and s.endswith('.service'):
                return s
            break
    raise Refused('sluzhba_ne_v_reestre')


def mainpid(sluzhba):
    """RU: MainPID службы по systemctl show; неизвестная или нечитаемая служба — Refused (не «0 — значит стоит»)."""
    try:
        r = subprocess.run(['systemctl', 'show', sluzhba, '-p', 'LoadState', '-p', 'MainPID'],
                           capture_output=True, text=True, timeout=10)
    except Exception:
        raise Refused('sluzhba_ne_chitaetsya') from None
    pole = dict(l.split('=', 1) for l in r.stdout.splitlines() if '=' in l)
    if r.returncode or pole.get('LoadState') != 'loaded':
        raise Refused('sluzhba_neizvestna')
    if not pole.get('MainPID', '').isdigit():
        raise Refused('sluzhba_ne_chitaetsya')
    return int(pole['MainPID'])


def kandidaty(agent, state_path):
    rec = json.loads(Path(state_path).read_text())['records']
    return [dict(v, key=k) for k, v in rec.items()
            if v.get('agent') == agent and v.get('status') == 'omega_verified' and v.get('local_id') and v.get('omega_id')]


def proverit(k, agent, loc, om):
    """RU: Сверка одной квитанции чтением. Выход ('svyazat'|'uzhe'|'propusk', причина)."""
    z = loc.execute('SELECT id, agent, klass, soderzhim, istochnik FROM zapisi WHERE id=?', (k['local_id'],)).fetchone()
    if z is None:
        return 'propusk', 'lokalnoj_net'
    if z['agent'] != agent or z['klass'] != 'urok' or z['istochnik'] != k.get('source'):
        return 'propusk', 'lokalnaya_ne_ta'
    s = loc.execute('SELECT mem_id FROM svyaz_omega WHERE zapis_id=?', (k['local_id'],)).fetchone()
    if s is not None:
        return ('uzhe', 'ta_zhe') if s['mem_id'] == k['omega_id'] else ('propusk', 'svyaz_chuzhaya')
    rows = [dict(r) for r in om.execute('SELECT * FROM memories WHERE node_id=?', (k['omega_id'],))]
    if not rows:
        return 'propusk', 'uzla_net'
    legacy = bool(k.get('legacy'))
    try:
        found = verify(rows, z['soderzhim'], agent, k['source'], k['key'], legacy=legacy)
    except Refused as e:
        return 'propusk', str(e)
    if found is None or found['id'] != k['omega_id']:
        return 'propusk', 'uzel_ne_tot'
    if legacy:
        n = om.execute('SELECT count(*) FROM memories WHERE entity_id=? AND source_uri=?', (agent, k['source'])).fetchone()[0]
    else:
        n = om.execute("SELECT count(*) FROM memories WHERE entity_id=? AND json_valid(metadata) AND json_extract(metadata,'$.source_key')=?",
                       (agent, k['key'])).fetchone()[0]
    if n != 1:
        return 'propusk', 'uzel_ne_edinstvennyj'
    return 'svyazat', 'vosstanovleno-tekstom' if legacy else 'dostavka'


def perechen(agent, state_path, db, omega_db):
    loc, om = ro(db), ro(omega_db)
    try:
        out = []
        for k in kandidaty(agent, state_path):
            ishod, prichina = proverit(k, agent, loc, om)
            out.append((k, ishod, prichina))
        return out
    finally:
        loc.close(); om.close()


def pisat(f, obj):
    f.write(json.dumps(obj, ensure_ascii=False) + '\n'); f.flush(); os.fsync(f.fileno())


def v_boj(agent, state_path, db, omega_db, kopiya_v, spisok_v, sluzhba=None):
    # Метка с микросекундами; копия и список — только новыми файлами: два прохода в одну секунду прежде делили путь,
    # и backup второго перезаписывал копию «до» первого.
    shtamp = datetime.datetime.now(datetime.UTC).strftime('%Y%m%dT%H%M%S%fZ')
    Path(kopiya_v).mkdir(parents=True, exist_ok=True, mode=0o700)
    Path(spisok_v).mkdir(parents=True, exist_ok=True, mode=0o700)
    kopiya = Path(kopiya_v) / f'pamyat-{agent}-{shtamp}.db'
    spisok = Path(spisok_v) / f'svyazano-{agent}-{shtamp}.jsonl'
    with Path(omega_db).resolve().with_name('uroki-exact-writer.lock').open('a') as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            raise Refused('writer_busy') from None
        if kopiya.exists() or spisok.exists():
            raise Refused('kopiya_uzhe_est')
        os.close(os.open(kopiya, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600))
        src = sqlite3.connect(f'file:{Path(db).resolve()}?mode=ro', uri=True)
        dst = sqlite3.connect(kopiya)
        try:
            src.backup(dst)
            if dst.execute('PRAGMA integrity_check').fetchone()[0] != 'ok':
                raise Refused('kopiya_negodna')
            if dst.execute('SELECT count(*) FROM zapisi').fetchone()[0] != src.execute('SELECT count(*) FROM zapisi').fetchone()[0]:
                raise Refused('kopiya_ne_sovpala')
        finally:
            src.close(); dst.close()
        os.chmod(kopiya, 0o600)
        itog = Counter()
        with open(spisok, 'x') as f:
            os.chmod(spisok, 0o600)
            pisat(f, {'vid': 'shapka', 'agent': agent, 'db': str(Path(db).resolve()), 'kopiya': str(kopiya), 'kogda': shtamp,
                      **({'sluzhba': sluzhba} if sluzhba else {})})
            for k, ishod, prichina in perechen(agent, state_path, db, omega_db):
                if ishod != 'svyazat':
                    itog[ishod + ':' + prichina] += 1
                    continue
                c = sqlite3.connect(db)
                try:
                    do = c.execute('SELECT coalesce(max(id),0) FROM zhurnal').fetchone()[0]
                finally:
                    c.close()
                pisat(f, {'vid': 'namerenie', 'zapis_id': k['local_id'], 'mem_id': k['omega_id'], 'kak': prichina,
                          'istochnik': k['source'], 'zhurnal_do': do})
                try:
                    r = lessons.local('link', agent, db, {'source': k['source'], 'body': ''},
                                      extra={'local_id': k['local_id'], 'mem_id': k['omega_id'], 'sposob': 'lookup',
                                             'legacy': bool(k.get('legacy'))})
                except Exception as e:
                    itog['otkaz:' + (str(e) if isinstance(e, Refused) else type(e).__name__)] += 1
                    continue
                c = sqlite3.connect(db)
                try:
                    est = c.execute('SELECT 1 FROM svyaz_omega WHERE zapis_id=? AND mem_id=?', (k['local_id'], k['omega_id'])).fetchone()
                    zh = [x[0] for x in c.execute(
                        "SELECT id FROM zhurnal WHERE id>? AND agent=? AND istochnik=? AND priroda='podtverzhdeno-chteniem' AND instr(pochemu,?)>0",
                        (do, agent, k['source'], k['omega_id']))]
                finally:
                    c.close()
                if not est:
                    itog['otkaz:svyaz_ne_legla'] += 1
                    continue
                pisat(f, {'vid': 'svyazano', 'zapis_id': k['local_id'], 'mem_id': k['omega_id'], 'linked': r.get('linked'), 'zhurnal': zh})
                itog['svyazano:' + prichina] += 1
    return {'agent': agent, 'kopiya': str(kopiya), 'spisok': str(spisok), 'itog': dict(itog)}


def otkat(spisok, db):
    stroki = [json.loads(l) for l in Path(spisok).read_text().splitlines() if l.strip()]
    shapka = stroki[0] if stroki and stroki[0].get('vid') == 'shapka' else None
    if shapka is None or shapka.get('db') != str(Path(db).resolve()):
        raise Refused('spisok_ne_k_etoj_baze')
    agent = shapka['agent']
    c = sqlite3.connect(db)
    try:
        c.execute('BEGIN IMMEDIATE')
        svyazej = zhurnala = 0
        zh_iz_podtv = {}
        for s in stroki:
            if s.get('vid') == 'svyazano':
                zh_iz_podtv[(s['zapis_id'], s['mem_id'])] = s['zhurnal']
        for s in stroki:
            if s.get('vid') != 'namerenie':
                continue
            svyazej += c.execute('DELETE FROM svyaz_omega WHERE zapis_id=? AND mem_id=?', (s['zapis_id'], s['mem_id'])).rowcount
            ids = zh_iz_podtv.get((s['zapis_id'], s['mem_id']))
            if ids is None:   # обрыв между намерением и подтверждением: найти отметку тем же признаком
                ids = [x[0] for x in c.execute(
                    "SELECT id FROM zhurnal WHERE id>? AND agent=? AND istochnik=? AND priroda='podtverzhdeno-chteniem' AND instr(pochemu,?)>0",
                    (s['zhurnal_do'], agent, s['istochnik'], s['mem_id']))]
            for i in ids:
                zhurnala += c.execute('DELETE FROM zhurnal WHERE id=?', (i,)).rowcount
        c.execute('COMMIT')
    except Exception:
        c.execute('ROLLBACK'); raise
    finally:
        c.close()
    return {'agent': agent, 'snyato_svyazej': svyazej, 'snyato_otmetok': zhurnala}


def main(argv=None):
    p = argparse.ArgumentParser(allow_abbrev=False, description='A-N-1731: связать задним числом уроки службы с OMEGA')
    p.add_argument('--agent', required=True)
    rezhim = p.add_mutually_exclusive_group(required=True)
    rezhim.add_argument('--suho', action='store_true')
    rezhim.add_argument('--v-boj', dest='v_boj', action='store_true')
    rezhim.add_argument('--otkat', metavar='SPISOK')
    p.add_argument('--state', default=str(STATE))
    p.add_argument('--db', help='pamyat.db агента (по умолчанию — из реестра: <дом>/pamyat/pamyat.db)')
    p.add_argument('--omega-db', default=str(lessons.OMEGA_DB))
    p.add_argument('--kopiya-v', default='/var/lib/dsh-pamyat-obsluzhivanie/A-N-1731/kopii')
    p.add_argument('--spisok-v', default='/var/lib/dsh-pamyat-obsluzhivanie/A-N-1731/spiski')
    p.add_argument('--perechen', action='store_true', help='в --suho печатать каждую пару')
    p.add_argument('--pri-zhivoj-sluzhbe', dest='pri_zhivoj', metavar='PRICHINA',
                   help='только с --v-boj: осознанный проход при живой службе агента; причина пишется в список')
    try:
        a = p.parse_args(argv)
    except SystemExit:
        return 2
    try:
        if not a.agent.replace('-', '').replace('_', '').isalnum() or a.agent != a.agent.lower():
            raise Refused('agent_negoden')
        db = a.db
        if db is None:
            homes = {x['agent']: x['home'] for x in lessons.load_agents(lessons.REGISTRY)}
            if a.agent not in homes:
                raise Refused('agent_ne_v_reestre')
            db = str(homes[a.agent] / 'pamyat/pamyat.db')
        if not Path(db).is_file():
            raise Refused('bazy_agenta_net')
        if a.pri_zhivoj is not None and not a.v_boj:
            raise Refused('pri_zhivoj_tolko_s_v_boj')
        if a.pri_zhivoj is not None and (not a.pri_zhivoj.strip() or len(a.pri_zhivoj) > 200 or '\n' in a.pri_zhivoj):
            raise Refused('prichina_negodna')
        if a.otkat:
            r = otkat(a.otkat, db)
            print(json.dumps(r, ensure_ascii=False)); return 0
        if a.suho:
            spisok = perechen(a.agent, a.state, db, a.omega_db)
            itog = Counter(ishod + ':' + prichina for _, ishod, prichina in spisok)
            if a.perechen:
                for k, ishod, prichina in spisok:
                    print(json.dumps({'zapis_id': k['local_id'], 'mem_id': k['omega_id'], 'ishod': ishod, 'prichina': prichina}, ensure_ascii=False))
            svyazhet = sum(v for kk, v in itog.items() if kk.startswith('svyazat:'))
            print(json.dumps({'agent': a.agent, 'kvitancij': len(spisok), 'svyazhet': svyazhet, 'itog': dict(itog)}, ensure_ascii=False))
            return 0 if all(kk.split(':')[0] in ('svyazat', 'uzhe') for kk in itog) else 1
        sl = sluzhba_agenta(a.agent)
        pid = mainpid(sl)
        if pid != 0 and a.pri_zhivoj is None:
            raise Refused('sluzhba_zhiva')
        r = v_boj(a.agent, a.state, db, a.omega_db, a.kopiya_v, a.spisok_v,
                  sluzhba={'imya': sl, 'mainpid': pid, **({'pri_zhivoj': a.pri_zhivoj} if pid != 0 else {})})
        if pid != 0:
            r['pri_zhivoj_sluzhbe'] = {'mainpid': pid, 'prichina': a.pri_zhivoj}
        print(json.dumps(r, ensure_ascii=False))
        return 0 if all(kk.startswith('svyazano:') or kk.startswith('uzhe:') for kk in r['itog']) else 1
    except Refused as e:
        print(json.dumps({'otkaz': str(e)}, ensure_ascii=False)); return 2


if __name__ == '__main__':
    sys.exit(main())
