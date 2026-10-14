#!/usr/bin/env python3
# СТЕНД МАШИННОЙ РЕДАКЦИИ (B-N-1877, Искра, 08.10.2026, sadik): «дерево ↔ бой» юнитов systemd пакетов, у которых на машине
# сознательно МАШИННАЯ редакция. Только чтение. Зовёт ночной обход (перечень боевых стендов), рука — iskra.
# 🔴 ГРАНИЦА (Вениамин): ЖИВЫЕ drop-in'ы ВНЕ ДЕРЕВА (50-mashina.conf и пр. в /etc/systemd/system/*.d) сверщик НЕ ВИДИТ —
#    сверяются только файлы, которые есть в packages/<пакет>/systemd; лишний машинный drop-in пройдёт молча.
# Данные ожидаемых различий — /etc/agent-registry/ozhidaemye-razlichiya.yaml (переменная OZHIDAEMOE); правка — рукой Забавы.
# Правило: обе стороны нормализуются — долой пустые строки, комментарии (# ;) и строки Description=; остаток (рабочие
# строки) сравнивается ПО ПОРЯДКУ. Из дерева вычитаются строки only_derevo, из боя — only_boj ровно по разу каждая;
# остатки обязаны совпасть. Любая другая разница — РАЗОШЛОСЬ (код 1).
# ЧЕГО НЕ ЛОВИТ: правку комментариев и Description= (вычитаются по построению — для этого класса и заведено);
# drop-in'ы машины вне пакета (50-mashina.conf и пр. — их нет в дереве); живое состояние systemd (сверяются файлы, не
# загруженные юниты — для этого systemctl cat/show); пакеты, не названные в PAKETY.
# Коды: 0 — сошлось; 1 — РАЗОШЛОСЬ (или прощение устарело); 2 — слепота (нет данных, дерева, каталога боя).
import os, subprocess, sys, yaml
TREE = os.environ.get('DEREVO', '/opt/iskra/workspace/dsh-plugins')
REF = os.environ.get('DEREVO_REF', 'master')
SYS = os.environ.get('BOJ_KOREN', '/etc/systemd/system')
DATA = os.environ.get('OZHIDAEMOE', '/etc/agent-registry/ozhidaemye-razlichiya.yaml')
PAKETY = {'dsh-storozha-mashiny': 'packages/dsh-storozha-mashiny/systemd', 'oom-watch': 'packages/oom-watch/systemd',
          'omega-memory': 'packages/omega-memory/systemd'}

def slep(msg): print('СЛЕПОТА: ' + msg); sys.exit(2)
def rabochie(b):
    out = []
    for l in b.decode('utf-8', 'replace').split('\n'):
        s = l.strip()
        if not s or s[0] in '#;' or s.startswith('Description='): continue
        out.append(s)
    return out
def vychest(lines, ubrat):
    lines = list(lines); net = []
    for u in ubrat:
        if u in lines: lines.remove(u)
        else: net.append(u)
    return lines, net

try: data = yaml.safe_load(open(DATA)) or {}
except Exception as e: slep('данные ожидаемых различий не прочитаны: %s (%s)' % (DATA, e))
ozh = {}
for z in data.get('razlichiya') or []:
    ozh[(z['paket'], z['fajl'])] = z
if not os.path.isdir(SYS): slep('каталог боя %s не виден' % SYS)
def boj(p):  # юниты 644 — читаются рукой обхода; sudo -n — только запасной путь для закрытого файла
    try: return open(p, 'rb').read()
    except FileNotFoundError: return None
    except PermissionError:
        r = subprocess.run(['sudo', '-n', 'cat', p], capture_output=True)
        return r.stdout if r.returncode == 0 else None

razoshlos = 0; soshlos = 0; vsego = 0; ispolzovano = set()
for pk, d in PAKETY.items():
    r = subprocess.run(['git', '-C', TREE, 'ls-tree', '-r', '--name-only', REF, d], capture_output=True, text=True)
    files = r.stdout.split()
    if r.returncode or not files: slep('дерево %s:%s пусто или не читается' % (REF, d))
    for rel in files:
        f = rel[len(d) + 1:]; vsego += 1
        z = ozh.get((pk, f)); ispolzovano.add((pk, f))
        bf = (z or {}).get('boj') or f
        t = subprocess.run(['git', '-C', TREE, 'show', '%s:%s' % (REF, rel)], capture_output=True).stdout
        b = boj(os.path.join(SYS, bf))
        if b is None:
            razoshlos += 1; print('🔴 РАЗОШЛОСЬ %s %s: в бою нет (или не читается) %s' % (pk, f, os.path.join(SYS, bf))); continue
        tr, net_t = vychest(rabochie(t), (z or {}).get('only_derevo') or [])
        br, net_b = vychest(rabochie(b), (z or {}).get('only_boj') or [])
        if net_t or net_b:
            razoshlos += 1
            print('🔴 УСТАРЕЛО %s %s: прощённой строки нет (дерево: %s; бой: %s) — бой/дерево изменены либо данные ожидания отстали; рабочие строки боя: %s' % (pk, f, net_t, net_b, [x for x in rabochie(b) if '=' in x and x.split('=')[0] in {u.split('=')[0] for u in net_b + net_t}][:4])); continue
        if tr != br:
            razoshlos += 1
            lt = [x for x in tr if x not in br]; lb = [x for x in br if x not in tr]
            print('🔴 РАЗОШЛОСЬ %s %s: рабочие строки — только в дереве %s; только в бою %s%s' % (
                pk, f, lt[:4], lb[:4], '' if (lt or lb) else ' (порядок)')); continue
        soshlos += 1
        if z: print('  ✅ %s %s — сошлось с ожидаемым (%s: %s)' % (pk, f, z.get('vid'), z.get('prichina', 'причина не названа')))
lishnie = set(ozh) - ispolzovano
for k in sorted(lishnie):
    razoshlos += 1; print('🔴 УСТАРЕЛО %s %s: запись ожидания на файл, которого нет в дереве' % k)
print('итог: файлов %d · сошлось %d · разошлось %d · записей ожидания %d (данные %s)' % (vsego, soshlos, razoshlos, len(ozh), DATA))
sys.exit(1 if razoshlos else 0)
