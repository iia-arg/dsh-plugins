#!/usr/bin/env python3
"""stend-init-zavesti.py — пробы B-N-2071 (dsh-reestr 3.1.4): agent-registry init, zavesti и «владелец-тревог» по правилу TG 3.1.11.

Run (НЕ от root — проба слепоты chmod 000 от root не слепнет): python3 -B test/stend-init-zavesti.py [candidate/bin/agent-registry].
Всё на подставных файлах во временном каталоге; живой реестр, /etc и службы не трогаются. Ожидание каждой пробы — в её строке.
Порча — сама проба (поле-тождество оставлено как у образца, ownerChatId снят); возврат — годный вызов следом. Коды: 0 все сошлись, 1 нет.
"""
import copy, hashlib, importlib.machinery, importlib.util, json, os, subprocess, sys, tempfile
from pathlib import Path
import yaml
sys.dont_write_bytecode = True  # imports candidate source without creating package __pycache__

SOURCE = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(__file__).resolve().parents[1] / 'bin/agent-registry'
OK = FAIL = 0


def proba(imya, uslovie, podrobno=''):
    global OK, FAIL
    if uslovie:
        OK += 1; print(f'ok   {imya}')
    else:
        FAIL += 1; print(f'FAIL {imya}' + (f' — {podrobno}' if podrobno else ''))


def ar(reestr, *args):
    env = dict(os.environ, AGENTS_REGISTRY=str(reestr), LC_ALL='C.UTF-8')
    r = subprocess.run([sys.executable, '-B', str(SOURCE), *args], capture_output=True, text=True, env=env, timeout=60)
    return r.returncode, r.stdout + r.stderr


def sha(p):
    return hashlib.sha256(Path(p).read_bytes()).hexdigest() if Path(p).is_file() else None   # нет файла — None, не обрыв стенда


def agent(n, port):
    return {'imya': n, 'rol': 'proba', 'namerenie': {
        'port': port, 'dom': f'/opt/{n}', 'polzovatel': n, 'sluzhba': f'{n}.service', 'zhurnal_sessij': f'/opt/{n}/.dsh/sessions',
        'kanal': {'nastrojka_dostavki_sha256': hashlib.sha256(n.encode()).hexdigest(), 'token_fajl': f'/etc/x/{n}.token'}}}


TOZH = {'namerenie.port': '3999', 'namerenie.dom': '/opt/novyj', 'namerenie.polzovatel': 'novyj', 'namerenie.sluzhba': 'novyj.service',
        'namerenie.zhurnal_sessij': '/opt/novyj/.dsh/sessions', 'namerenie.kanal.nastrojka_dostavki_sha256': 'f' * 64}

with tempfile.TemporaryDirectory(prefix='stend-2071-') as td:
    T = Path(td)
    # ── init ──
    (T / 'n').mkdir()
    obr = T / 'obrazec.yaml'
    baza = {'shema': 1, 'mashina': {'imya': 'proba', 'kanal_trevog': {'otpravitel': '/usr/local/bin/agent-alert'},
                                    'kompakt_obshchee': {'model': 'm'}}, 'agenty': [agent('a1', 3001), agent('a2', 3002)]}
    obr.write_text('shema: 1\n# комментарий файла — должен пережить zavesti\n' +
                   yaml.safe_dump({k: v for k, v in baza.items() if k != 'shema'}, allow_unicode=True, sort_keys=False) +
                   'obshchee:\n  korni: []\n')
    novyj = T / 'n/agents.yaml'
    kod, out = ar(novyj, 'init', '--mashina', 'bclaude', '--iz', str(obr))
    d = yaml.safe_load(novyj.read_text()) if novyj.exists() else None
    proba('I1 init на новом месте → 0, shema/mashina/agenty: []', kod == 0 and d == {'shema': 1, 'mashina': {
        'imya': 'bclaude', 'kanal_trevog': baza['mashina']['kanal_trevog'], 'kompakt_obshchee': baza['mashina']['kompakt_obshchee']},
        'agenty': []}, f'код {kod}: {out[-200:]}')
    s0 = sha(novyj)
    kod, out = ar(novyj, 'init', '--mashina', 'bclaude')
    proba('I2 порча: init поверх существующего → 1, файл не тронут', kod == 1 and 'уже есть' in out and sha(novyj) == s0, f'код {kod}')
    kod, out = ar(novyj, 'init', '--mashina', 'bclaude', '--dry-run')
    proba('I3 чужая привычка --dry-run → 3 (отказ вызова, не действие)', kod == 3 and sha(novyj) == s0, f'код {kod}')
    kod, out = ar(T / 'net/agents.yaml', 'init', '--mashina', 'x')
    proba('I4 нет каталога → 1, каталог не создан', kod == 1 and not (T / 'net').exists(), f'код {kod}')
    pust = T / 'pust.yaml'; pust.write_text('shema: 1\nmashina: {imya: z}\nagenty: []\n')
    kod, out = ar(T / 'n/i5.yaml', 'init', '--mashina', 'x', '--iz', str(pust))
    proba('I5 образец без kanal_trevog → 1', kod == 1 and 'kanal_trevog' in out and not (T / 'n/i5.yaml').exists(), f'код {kod}')
    kod, out = ar(T / 'n/i6.yaml', 'init', '--mashina', 'x')
    proba('I6 без --iz → 0 и напоминание «ЗАПОЛНИТЬ»', kod == 0 and out.count('ЗАПОЛНИТЬ') == 2, f'код {kod}')

    # ── zavesti ──
    def zav(reestr, kuda, tozh, *dop, iz=None):
        args = ['zavesti', 'novyj', '--po-obrazcu', 'a1', '--kuda', str(kuda), *dop]
        if iz:
            args += ['--iz', str(iz)]
        for k, v in tozh.items():
            args += ['--pole', f'{k}={v}']
        return ar(reestr, *args)

    s_obr = sha(obr)
    k1 = T / 'k1.yaml'
    kod, out = zav(obr, k1, TOZH)
    zap = copy.deepcopy(agent('a1', 3001)); zap['imya'] = 'novyj'
    for k, v in TOZH.items():
        *verh, x = k.split('.'); cur = zap
        for y in verh: cur = cur[y]
        cur[x] = yaml.safe_load(v)
    ozhid = copy.deepcopy(baza); ozhid['agenty'] = baza['agenty'] + [zap]; ozhid['obshchee'] = {'korni': []}
    dk = yaml.safe_load(k1.read_text()) if k1.exists() else None
    proba('Z1 все шесть тождеств заменены → 0; кандидат = прежний + одна запись; живой не тронут; комментарий жив',
          kod == 0 and dk == ozhid and sha(obr) == s_obr and '# комментарий файла' in k1.read_text(), f'код {kod}: {out[-300:]}')
    for pole in TOZH:
        bez = {k: v for k, v in TOZH.items() if k != pole}
        kod, out = zav(obr, T / f'p-{pole}.yaml', bez)
        proba(f'Z2 порча: {pole} как у образца → 1, поле названо, кандидата нет',
              kod == 1 and pole in out and 'образца a1' in out and not (T / f'p-{pole}.yaml').exists(), f'код {kod}')
    kod, out = zav(obr, T / 'k3.yaml', dict(TOZH, **{'namerenie.port': '3002'}))
    proba('Z3 порт как у ДРУГОГО агента (a2) → 1, назван a2', kod == 1 and 'агента a2' in out, f'код {kod}')
    kod, out = zav(obr, T / 'k4.yaml', dict(TOZH, **{'namerenie.net_takogo': '1'}))
    proba('Z4 неизвестное поле → 1', kod == 1 and 'net_takogo' in out and not (T / 'k4.yaml').exists(), f'код {kod}')
    kod, out = zav(obr, obr, TOZH)
    proba('Z5 --kuda = живой реестр → 1, файл не тронут', kod == 1 and 'живой реестр' in out and sha(obr) == s_obr, f'код {kod}')
    s1 = sha(k1)
    kod, out = zav(obr, k1, TOZH)
    proba('Z6 --kuda уже есть → 1, не перезаписан', kod == 1 and sha(k1) == s1, f'код {kod}')
    kod, out = zav(obr, T / 'k7.yaml', TOZH, '--dry-run')
    proba('Z7 --dry-run → 3', kod == 3 and not (T / 'k7.yaml').exists(), f'код {kod}')
    k8 = T / 'k8.yaml'
    kod, out = zav(novyj, k8, TOZH, iz=obr)
    d8 = yaml.safe_load(k8.read_text()) if k8.exists() else None
    proba('Z8 в реестр после init (agenty: []) по образцу из --iz → 0, ровно одна запись',
          kod == 0 and d8 and [a['imya'] for a in d8['agenty']] == ['novyj'] and d8['mashina']['imya'] == 'bclaude', f'код {kod}: {out[-200:]}')

    # ── zavesti --iz с ДРУГОЙ машины (находка Альфы 16.10 11:43Z; наряд Забавы 11:43:28Z) ──
    k9 = T / 'k9.yaml'
    kod, out = ar(novyj, 'zavesti', 'a1', '--po-obrazcu', 'a1', '--iz', str(obr), '--kuda', str(k9))
    d9 = yaml.safe_load(k9.read_text()) if k9.exists() else None
    proba('Z9 клон a1 с машины proba в пустой реестр bclaude БЕЗ замен → 0, совпадение с образцом напечатано (6 полей)',
          kod == 0 and d9 and [a['imya'] for a in d9['agenty']] == ['a1'] and 'совпадает с образцом другой машины (proba → bclaude)' in out
          and all(x in out for x in ('port', 'dom', 'polzovatel', 'sluzhba', 'zhurnal_sessij', 'nastrojka_dostavki_sha256')), f'код {kod}: {out[-300:]}')
    kod, out = ar(k9, 'zavesti', 'a1', '--po-obrazcu', 'a1', '--iz', str(obr), '--kuda', str(T / 'k10.yaml'))
    proba('Z10 клон a1 в реестр, где a1 уже есть → 1 (агент уже есть)', kod == 1 and 'уже есть' in out and not (T / 'k10.yaml').exists(), f'код {kod}')
    kod, out = ar(k9, 'zavesti', 'a3', '--po-obrazcu', 'a1', '--iz', str(obr), '--kuda', str(T / 'k11.yaml'))
    proba('Z11 тождества как у a1 ЦЕЛЕВОГО реестра (другое имя) → 1, назван a1', kod == 1 and 'как у агента a1' in out and not (T / 'k11.yaml').exists(), f'код {kod}')
    obr2 = T / 'obrazec-ta-zhe.yaml'; obr2.write_text(obr.read_text().replace('imya: proba', 'imya: bclaude', 1))
    kod, out = ar(novyj, 'zavesti', 'a1', '--po-obrazcu', 'a1', '--iz', str(obr2), '--kuda', str(T / 'k12.yaml'))
    proba('Z12 порча: у образца то же имя машины, что у цели → 1 (как у образца), кандидата нет',
          kod == 1 and 'как у образца a1' in out and not (T / 'k12.yaml').exists(), f'код {kod}: {out[-200:]}')

    # ── владелец-тревог: правило TG 3.1.11 ──
    ld = importlib.machinery.SourceFileLoader('ar2071', str(SOURCE))
    spec = importlib.util.spec_from_loader('ar2071', ld); m = importlib.util.module_from_spec(spec); ld.exec_module(m)

    def vt(config, nastr, prava=None):
        k = T / f'vt{OK + FAIL}'; k.mkdir()
        conf = dict(config, tokenFile=str(k / 'b.token'))
        (k / 'A.yml').write_text(yaml.safe_dump({'preset': 'proba', 'plugins': [{'module': 'dsh-telegram-multiagent', 'config': conf}]}))
        if nastr is not None:
            (k / 'b.json').write_text(nastr if isinstance(nastr, str) else json.dumps(nastr))
            if prava is not None:
                os.chmod(k / 'b.json', prava)
        out = []
        try:
            m.sverit_proizvodnye({'istochnik_modeli': {'fajl': str(k / 'A.yml')}, 'dom': str(k)}, 'proba',
                                 lambda pole, v, o, f: out.append((pole, v, f)))
        except Exception:
            pass   # прочие сверки подставной записи неполны; судим только строки «владелец-тревог»
        return [(v, f) for p, v, f in out if p == 'владелец-тревог']

    r = vt({'allowedUsers': [111, 222]}, {'ownerChatId': 111})
    proba('V1 без почты a2a, ownerChatId JSON ∈ allowedUsers → ok', [v for v, f in r] == ['ok'], r)
    r = vt({'allowedUsers': [111, 222], 'mergeChatIntoA2A': 111}, {'deliveryMode': 'owner-all'})
    proba('V2 порча: нет ownerChatId (ни JSON, ни конфиг), mergeChatIntoA2A ∈ allowed → красное', [v for v, f in r] == ['расхождение'], r)
    r = vt({'allowedUsers': [111, 222]}, {'deliveryMode': 'owner-all'})
    proba('V3 порча: без почты и без ownerChatId → красное (условие (3))', [v for v, f in r] == ['расхождение'], r)
    r = vt({'allowedUsers': [111, 222]}, {'ownerChatId': 111})
    proba('V4 возврат: ownerChatId в JSON → снова ok', [v for v, f in r] == ['ok'], r)
    r = vt({'allowedUsers': [111, 222], 'ownerChatId': 222}, {'deliveryMode': 'owner-all'})
    proba('V5 ключа в JSON нет → ownerChatId конфига (222) → ok', [v for v, f in r] == ['ok'] and '222' in r[0][1], r)
    r = vt({'allowedUsers': [111, 222], 'ownerChatId': 222}, {'ownerChatId': None})
    proba('V6 ключ в JSON есть, но null → конфиг НЕ подставляется → красное (как hasOwn в пакете)', [v for v, f in r] == ['расхождение'], r)
    r = vt({'allowedUsers': ['111', 222]}, {'ownerChatId': '111'})
    proba('V7 строки из цифр (JSON и allowedUsers) → ok', [v for v, f in r] == ['ok'], r)
    r = vt({'allowedUsers': [111, 222]}, {'ownerChatId': 333})
    proba('V8 владелец не в allowedUsers → красное', [v for v, f in r] == ['расхождение'], r)
    r = vt({'allowedUsers': [111, 222]}, None)
    proba('V9 JSON доставки нет → красное (пакет тогда без владельца)', [v for v, f in r] == ['расхождение'], r)
    r = vt({'allowedUsers': [111, 222]}, '[1]')
    proba('V10 JSON не объект → красное', [v for v, f in r] == ['расхождение'], r)
    if os.geteuid() != 0:
        denied = T / 'sudo-denied'; denied.mkdir(); (denied / 'sudo').write_text('#!/bin/sh\nexit 1\n'); (denied / 'sudo').chmod(0o755)
        old_path = os.environ['PATH']
        try:
            os.environ['PATH'] = str(denied) + ':' + old_path
            r = vt({'allowedUsers': [111, 222]}, {'ownerChatId': 111}, prava=0)
        finally:
            os.environ['PATH'] = old_path
        proba('V11 JSON не читается и sudo отказал → СЛЕПОТА, не конфиг', [v for v, f in r] == ['СЛЕПОТА'], r)
    else:
        print('     V11 пропущена: от root chmod 000 читается — проба слепоты негодна')

print(f'ИТОГО: сошлось {OK}, расхождений {FAIL}')
sys.exit(0 if FAIL == 0 else 1)
