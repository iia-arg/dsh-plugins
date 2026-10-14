# -*- coding: utf-8 -*-
"""Конфиг подписок dsh-limity — ЕДИНСТВЕННЫЙ источник (B-N-1776 r4; слово владельца 07.10 22:12 МСК: «подписки могут добавляться,
изменяться — управлять конфигом, без перекомпиляции и перевыпуска»). Файл /etc/dsh-limity/podpiski.json — список записей:
  provajder  claude | codex | deepseek             (обязательно)
  nomer      1..99, уникален в пределах поставщика  (обязательно)
  kluch      ключ выдачи (podpiska-5 …), уникален   (обязательно)
  vkl        true|false — выключенная не замеряется и в выдаче помечена «выключена» (не пропадает молча); по умолчанию true
  sposob     claude_usage | codex_limit_watch       (по умолчанию — по поставщику)
  podpis     подпись для страницы («Клод-3 (Med)»); poryadok — место на странице (число); по умолчанию — kluch и место в списке
  organizaciya  UUID организации (claude) — сверяется со входом замера; у включённой — обязательна (r11); вписывает vojti после явного «да» владельца, подтвердивший — в коммит
  email      подсказка входа владельцу (claude)
  zamer, zamer_katalog  учётка и каталог входа замера (claude_usage); по умолчанию limity-zamer-p<nomer>, /var/lib/dsh-limity-zamer/p<nomer>
  token_shlyuza  путь (или список путей) токена шлюза этой подписки — по нему приёмная узнаёт подписку шлюза
  zametka, tarif  — свободные (tarif — для Codex на странице)
  r6 DeepSeek (provajder deepseek, sposob deepseek_balance — GET /user/balance, прямой запрос: штатного клиента нет):
  klyuch_fajl  ПУТЬ к файлу ключа API (значение в конфиг не пишется); porog_ostatka — число: остаток ниже ⇒ тревога (по переходу);
  valyuta_poroga  валюта порога (CNY, USD …) — ОБЯЗАТЕЛЬНА при porog_ostatka: порядок валют в ответе меняется от вызова к вызову
  mashina      ключ живёт на другой машине (aclaude …) — sadik его не видит: «не измеряется», ключ сюда не копировать без слова владельца
Неизвестное поле — ОШИБКА (опечатка «vkljuchena» не должна молча значить «включена»). Ошибки — списком; читатели при ошибках
работают в СЛЕПОТЕ с причиной, а не на угаданном конфиге.
"""
import json, math, os, stat, sys, tempfile, time
from pathlib import Path

PUT = Path(os.environ.get('DSH_LIMITY_PODPISKI', '/etc/dsh-limity/podpiski.json'))
# r7 (Вениамин 19:13Z): последняя ГОДНАЯ редакция — рядом с базой службы (стенды задают DSH_LIMITY_BAZA ⇒ копия уходит к ним, не на бой)
GODEN = Path(os.environ.get('DSH_LIMITY_PODPISKI_GODEN') or
             Path(os.environ.get('DSH_LIMITY_BAZA', '/var/lib/dsh-limity/limity.db')).with_name('podpiski.goden.json'))
POLYA = {'provajder', 'nomer', 'kluch', 'vkl', 'sposob', 'podpis', 'poryadok', 'organizaciya', 'email', 'zamer', 'zamer_katalog',
         'token_shlyuza', 'zametka', 'tarif', 'klyuch_fajl', 'porog_ostatka', 'valyuta_poroga', 'mashina'}
KOREN = os.environ.get('DSH_LIMITY_ZAMER_KOREN', '/var/lib/dsh-limity-zamer/')   # r9 (Вениамин LOW): каталоги входа — только прямые подкаталоги
SPOSOBY = {'claude': {'claude_usage'}, 'codex': {'codex_limit_watch'}, 'deepseek': {'deepseek_balance'}}

class SostoyanieError(Exception):
    pass

def zapisat_json(put, dannye, mode=0o600):
    """Состояние: новый файл рядом, fsync файла и каталога; прежнее не truncates."""
    put = Path(put); tmp = None
    try:
        put.parent.mkdir(parents=True, exist_ok=True)
        try: mode = stat.S_IMODE(put.stat().st_mode)
        except FileNotFoundError: pass
        fd, tmp = tempfile.mkstemp(prefix='.' + put.name + '.', dir=str(put.parent))
        with os.fdopen(fd, 'w', encoding='utf-8') as f:
            os.fchmod(f.fileno(), mode)
            json.dump(dannye, f, ensure_ascii=False, allow_nan=False)
            f.write('\n'); f.flush(); os.fsync(f.fileno())
        os.replace(tmp, put)
        # 3.1.4: fsync каталога — лучшее усилие. Приёмная пишется вслепую (-wx, чтения у пишущих нет по замыслу) — каталог
        # на чтение не открыть, а запись уже состоялась: не отказ, одна строка в журнал. Прочие ошибки — отказ, как прежде.
        try: dfd = os.open(put.parent, os.O_RDONLY | os.O_DIRECTORY)
        except PermissionError:
            print(f'fsync каталога {put.parent} пропущен: нет права чтения; запись {put.name} состоялась', file=sys.stderr)
        else:
            try: os.fsync(dfd)
            finally: os.close(dfd)
    except (OSError, ValueError, TypeError) as e:
        raise SostoyanieError(f'состояние {put} не записано ({type(e).__name__}); запись после replace могла состояться') from e
    finally:
        if tmp is not None:
            try: os.unlink(tmp)
            except FileNotFoundError: pass
            except OSError as e: raise SostoyanieError(f'состояние {put}: временный файл {tmp} не убран ({type(e).__name__})') from e

def prochitat_sostoyanie(put, vid):
    """Негодный ledger не обнуляем: иначе теряются выдержка и суточный потолок."""
    try:
        try: s = json.loads(Path(put).read_text(encoding='utf-8'))
        except FileNotFoundError: return {}
        if not isinstance(s, dict): raise ValueError('не объект')
        def chislo(x): return type(x) in (int, float) and math.isfinite(x) and x >= 0
        if vid == 'avtoperekl':
            for k, v in s.items():
                if (k == 'popytka' and not chislo(v)) or (k != 'popytka' and not isinstance(v, str)): raise ValueError(k)
        else:
            for k, v in s.items():
                if vid == 'deepseek' or k.isdigit():
                    if not isinstance(v, dict) or not isinstance(v.get('popytki'), list): raise ValueError(k)
                    if any(not chislo(t) or t > time.time() + 60 for t in v['popytki']): raise ValueError(k)
                    if vid == 'zamer' and any(v.get(x) not in (None, 'izmereno', 'ne_izmereno') for x in ('ishod', 'skazano')): raise ValueError(k)
                    if vid == 'zamer' and not {'ishod', 'skazano'} <= v.keys(): raise ValueError(k)
                    if vid == 'zamer':
                        for pole in ('refresh_do', 'refresh_skazano', 'kredity_skazano'):
                            if v.get(pole) is not None and not chislo(v[pole]): raise ValueError(k + '.' + pole)
                        for pole in ('kredity', 'weekly_all', 'okna_skazano'):
                            if v.get(pole) is not None and not isinstance(v[pole], dict): raise ValueError(k + '.' + pole)
                        kr = v.get('kredity') or {}
                        if kr.get('dolya') is not None and not chislo(kr['dolya']): raise ValueError(k + '.kredity.dolya')
                        for o in (v.get('okna_skazano') or {}).values():
                            if not isinstance(o, dict) or not {'uroven', 'sbros'} <= o.keys() or not chislo(o.get('uroven')) or (o.get('sbros') is not None and not chislo(o['sbros'])): raise ValueError(k + '.okna_skazano')
                elif k == 'vydacha_molchit_skazano':
                    if type(v) is not bool: raise ValueError(k)
                elif not isinstance(v, dict): raise ValueError(k)
            if 'konfig' in s and type(s['konfig'].get('negoden_skazano')) is not bool: raise ValueError('konfig')
            if 'tokeny' in s and not isinstance(s['tokeny'].get('skazano'), list): raise ValueError('tokeny')
        return s
    except (OSError, ValueError, TypeError) as e:
        raise SostoyanieError(f'состояние {put} не прочитано или негодно ({type(e).__name__}); ledger сохранён, требуется ручное восстановление') from e

def prochitat(put=None):
    """→ (список записей с заполненными умолчаниями, список ошибок). Ошибки не пусты ⇒ список НЕ использовать."""
    put = Path(put or PUT)
    try: syroe = json.loads(put.read_text(encoding='utf-8'))
    except FileNotFoundError: return [], [f'нет конфига {put}']
    except (OSError, ValueError) as e: return [], [f'конфиг {put} не прочитан ({type(e).__name__})']
    if not isinstance(syroe, list): return [], [f'конфиг {put}: ждём список записей, а там {type(syroe).__name__}']
    spisok, oshibki, vidano = [], [], {}
    for i, z in enumerate(syroe):
        gde = f'запись {i + 1}'
        if not isinstance(z, dict): oshibki.append(f'{gde}: не объект'); continue
        if set(z) - POLYA: oshibki.append(f'{gde}: неизвестные поля {", ".join(sorted(set(z) - POLYA))}'); continue
        p, n, k = z.get('provajder'), z.get('nomer'), z.get('kluch')
        if p not in SPOSOBY: oshibki.append(f'{gde}: provajder {p!r} не {"/".join(SPOSOBY)}'); continue
        if type(n) is not int or not 1 <= n <= 99: oshibki.append(f'{gde}: nomer {n!r} не целое 1..99'); continue
        if not (isinstance(k, str) and k and len(k) <= 40): oshibki.append(f'{gde}: kluch {k!r} негоден'); continue
        gde = f'{gde} ({k})'
        for kl, imya in (((p, n), f'{p} {n}'), ((None, k), f'ключ {k}')):
            if kl in vidano: oshibki.append(f'{gde}: {imya} уже есть в записи {vidano[kl]}')
            vidano[kl] = i + 1
        vkl = z.get('vkl', True)
        if not isinstance(vkl, bool): oshibki.append(f'{gde}: vkl не true/false'); continue
        sp = z.get('sposob') or next(iter(SPOSOBY[p]))
        if sp not in SPOSOBY[p]: oshibki.append(f'{gde}: sposob {sp!r} не годится для {p}'); continue
        po = z.get('poryadok', i)
        if type(po) is not int: oshibki.append(f'{gde}: poryadok не целое'); continue
        ts = z.get('token_shlyuza')
        ts = [ts] if isinstance(ts, str) else ts
        if ts is not None and not (isinstance(ts, list) and all(isinstance(x, str) and x.startswith('/') for x in ts)):
            oshibki.append(f'{gde}: token_shlyuza — абсолютный путь или список путей'); continue
        po_ = z.get('porog_ostatka')
        if po_ is not None and (isinstance(po_, bool) or not isinstance(po_, (int, float)) or po_ < 0): oshibki.append(f'{gde}: porog_ostatka — число ≥ 0'); continue
        vp = z.get('valyuta_poroga')
        if (po_ is None) != (vp is None) or (vp is not None and not (isinstance(vp, str) and vp)):
            oshibki.append(f'{gde}: porog_ostatka и valyuta_poroga — только вместе (валюта — строка)'); continue
        kf = z.get('klyuch_fajl')
        if kf is not None and not (isinstance(kf, str) and kf.startswith('/')): oshibki.append(f'{gde}: klyuch_fajl — абсолютный путь'); continue
        if sp == 'deepseek_balance' and not kf and not z.get('mashina'): oshibki.append(f'{gde}: deepseek без klyuch_fajl и без mashina'); continue
        if (kf or po_ is not None) and p != 'deepseek': oshibki.append(f'{gde}: klyuch_fajl/porog_ostatka — только у deepseek'); continue
        for pole in ('podpis', 'organizaciya', 'email', 'zamer', 'zamer_katalog', 'zametka', 'tarif', 'mashina'):
            if z.get(pole) is not None and not isinstance(z.get(pole), str): oshibki.append(f'{gde}: {pole} не строка')
        zapis = dict(z, vkl=vkl, sposob=sp, poryadok=po, podpis=z.get('podpis') or k, token_shlyuza=ts or [])
        if sp == 'claude_usage':
            zapis.setdefault('zamer', f'limity-zamer-p{n}'); zapis.setdefault('zamer_katalog', f'/var/lib/dsh-limity-zamer/p{n}')
            zapis['zamer'] = zapis['zamer'] or f'limity-zamer-p{n}'; zapis['zamer_katalog'] = zapis['zamer_katalog'] or f'/var/lib/dsh-limity-zamer/p{n}'
            if vkl and not z.get('organizaciya'):   # r11 (Вениамин 19:13Z п.1): включённая подписка Claude без эталона организации — отказ
                oshibki.append(f'{gde}: включённая подписка Claude без organizaciya — впишет dsh-limity-podpiski vojti (явное «да» владельца)')
                # r13 (Забава 20:07Z: «добавлять одной командой»): запись остаётся в списке — по ней работает vojti; службы при ЛЮБОЙ ошибке берут прежнюю годную
            kat = zapis['zamer_katalog']   # r9: та же проверка, что в snyat — после resolve родитель обязан быть корнем (опечатка «…/../..» или сам корень — ошибка)
            if not (os.path.isabs(kat) and kat.startswith(KOREN) and Path(kat).resolve().parent == Path(KOREN.rstrip('/'))):
                oshibki.append(f'{gde}: zamer_katalog {kat!r} — не прямой подкаталог {KOREN} (после resolve)'); continue
        spisok.append(zapis)
    return spisok, oshibki

def prochitat_rabochij(put=None, goden=None):
    """r7 (Вениамин 19:13Z: «тревога + прежний годный конфиг действует до исправления») → (список, ошибки, na_godnom).
    Конфиг годен ⇒ его байты кладутся в goden (через временный файл, который ПЕРЕД заменой проверяется тем же разбором — туда попадает
    только годное); негоден ⇒ список из goden, ошибки — наружу (для тревоги и журнала); годной копии нет ⇒ ([], ошибки, False) — СЛЕПОТА."""
    put, goden = Path(put or PUT), Path(goden or GODEN)
    spisok, oshibki = prochitat(put)
    if not oshibki:
        try:
            b = put.read_bytes()
            if not goden.is_file() or goden.read_bytes() != b:
                goden.parent.mkdir(parents=True, exist_ok=True)
                fd, tmp = tempfile.mkstemp(prefix='.' + goden.name + '.', dir=str(goden.parent))
                with os.fdopen(fd, 'wb') as f: f.write(b)
                if prochitat(tmp)[1]: os.unlink(tmp)   # файл сменился между чтениями — копию не обновляем
                else: os.chmod(tmp, 0o644); os.replace(tmp, goden)
        except OSError: pass   # копия — запас, а не условие работы
        return spisok, [], False
    if goden.is_file():
        s2, o2 = prochitat(goden)
        if not o2: return s2, oshibki, True
    return [], oshibki, False

def zapisat(syroe, put=None):
    """Атомарная запись СЫРОГО списка (без умолчаний); прежний файл — копией рядом <имя>.<время>.bak. → путь копии или None."""
    put = Path(put or PUT); kopiya = None
    if put.exists():
        kopiya = put.with_name(f'{put.name}.{time.strftime("%Y%m%dT%H%M%SZ", time.gmtime())}.bak')
        kopiya.write_bytes(put.read_bytes()); os.chmod(kopiya, 0o644)
    fd, tmp = tempfile.mkstemp(prefix='.' + put.name + '.', dir=str(put.parent))
    with os.fdopen(fd, 'w', encoding='utf-8') as f: f.write(json.dumps(syroe, ensure_ascii=False, indent=1) + '\n')
    os.chmod(tmp, 0o644); os.replace(tmp, put)
    return kopiya
