#!/usr/bin/env python3
"""Покрытие installed_check (B-N-2082, наряд Забавы 17:10Z, правило Вениамина 20:10 МСК): каждый local из derevo.files записи реестра
назван в её installed_check ОТДЕЛЬНЫМ СЛОВОМ — иначе verify подмену этого файла не видит (17.10: dsh-montazh montazh-okno 0ea088d7 →
bdd9e3ca прошёл «совпадает»). Исключение — ДАННЫМИ: строка «id<TAB>признак<TAB>причина» в файле исключений, и признак обязан стоять
в installed_check записи (проверка по манифесту, напр. dsh-autopilot «--manifest») — иначе исключение не действует.
Вызов без аргументов. PLUGINS_REGISTRY (по умолчанию /etc/agent-registry/plugins.yaml), POKRYTIE_ISKL (по умолчанию файл рядом).
Коды: 0 — все записи покрыты; 1 — есть непокрытые (поимённо запись и путь); 2 — слепота (реестр/исключения не прочитаны, кривые).
НЕ ЛОВИТ: слово в installed_check, которое не участвует в сумме (стоит в комментарии/echo); записи без derevo; links derevo;
проверку по манифесту — верит признаку, сам манифест не открывает."""
import os, re, sys
if len(sys.argv) > 1: print(f'ОТКАЗ: аргументов прибор не принимает ({" ".join(sys.argv[1:])})'); sys.exit(2)
def slep(t): print('СЛЕПОТА: ' + t); sys.exit(2)
try: import yaml
except Exception as e: slep(f'нет PyYAML: {e}')
reg = os.environ.get('PLUGINS_REGISTRY', '/etc/agent-registry/plugins.yaml')
isk = os.environ.get('POKRYTIE_ISKL', os.path.join(os.path.dirname(os.path.abspath(__file__)), 'pokrytie-installed-check.isklyucheniya.tsv'))
try: d = yaml.safe_load(open(reg, encoding='utf-8'))
except Exception as e: slep(f'реестр {reg} не прочитан: {e}')
if not isinstance(d, dict): slep(f'реестр {reg} — не словарь')
iskl = {}
try:
    for n, s in enumerate(open(isk, encoding='utf-8').read().split('\n'), 1):
        if not s.strip() or s.startswith('#'): continue
        f = s.split('\t')
        if len(f) != 3 or not all(x.strip() for x in f): slep(f'{isk}:{n}: нужно «id<TAB>признак<TAB>причина»')
        if f[0] in iskl: slep(f'{isk}:{n}: запись {f[0]} названа дважды')
        iskl[f[0]] = f[1]
except FileNotFoundError: slep(f'нет файла исключений {isk} (пустой — допустим, отсутствие — нет)')
SLOVO = re.compile(r"[^\s'\"`|;()<>&]+")
zapisej = s_derevo = pokryto = po_iskl = 0; bedy = []; ne_ispolz = set(iskl)
for razdel in ('plugins', 'services'):
    for p in d.get(razdel) or []:
        if not isinstance(p, dict): continue
        zapisej += 1; dv = p.get('derevo')
        if not isinstance(dv, dict): continue
        files = dv.get('files') or []
        if not isinstance(files, list) or any(not isinstance(x, dict) or not isinstance(x.get('local'), str) for x in files):
            slep(f'{p.get("id")}: derevo.files кривой')
        if not files: continue
        s_derevo += 1; pid = p.get('id'); ic = p.get('installed_check')
        if pid in iskl:
            ne_ispolz.discard(pid)
            if isinstance(ic, str) and iskl[pid] in ic: po_iskl += 1; continue
            bedy.append(f'{pid}: в исключениях, но признака «{iskl[pid]}» в installed_check нет — исключение не действует'); continue
        if not isinstance(ic, str) or not ic.strip():
            bedy.append(f'{pid}: installed_check нет, а derevo.files {len(files)}'); continue
        slova = set(SLOVO.findall(ic)); vne = [x['local'] for x in files if x['local'] not in slova]
        if vne:
            for v in vne: bedy.append(f'{pid}: {v} — в derevo.files, но не в installed_check (из {len(files)} вне {len(vne)})')
        else: pokryto += 1
for i in sorted(ne_ispolz): bedy.append(f'{i}: исключение есть, записи с derevo.files нет — снять строку')
print(f'реестр {reg}: записей {zapisej}, с derevo.files {s_derevo}: покрыто {pokryto}, по исключению {po_iskl}, с бедой {s_derevo - pokryto - po_iskl}')
for b in bedy: print('КРАСНОЕ: ' + b)
sys.exit(1 if bedy else 0)
