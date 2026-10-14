#!/opt/omega/venv/bin/python3 -B
# Стенд B-P-060 (02.10.2026, Аврора, B-N-028): наши классы памяти в OMEGA — БЕССРОЧНЫ по таблице сроков ПОСТАВКИ.
# Признак 6 omega-kopiya-watch считает строки метки «ЛОКАЛЬНАЯ ПРАВКА ПОСТАВКИ B-P-060» — он ловит СТИРАНИЕ правки
# (pip -U), но слеп к правке, у которой метка цела, а значение сломано (fakt снова 90 сут). Это ловит стенд:
# импортирует omega.types из проверяемого site-packages и спрашивает TTLCategory.for_event_type по каждому классу.
# Запуск: stend-b-p-060.py [site-packages]   (умолчание — /opt/omega/venv/lib/python3.12/site-packages)
# Код: 0 — все 7 бессрочны; 1 — названы классы со сроком; 2 — слепота (не импортировалось / контроль не сошёлся).
import sys, subprocess, json
SP = sys.argv[1] if len(sys.argv) > 1 else '/opt/omega/venv/lib/python3.12/site-packages'
KLASSY = ['fakt', 'poryadok', 'nablyudenie', 'urok', 'reshenie', 'ogranichenie', 'oshibka']
kod = ("import sys,json; sys.path.insert(0, sys.argv[1]); import omega.types as t; "
       "print(json.dumps({'file': t.__file__, 'ttl': {k: t.TTLCategory.for_event_type(k) for k in sys.argv[2:]}}))")
r = subprocess.run([sys.executable, '-B', '-c', kod, SP, *KLASSY, 'memory'], capture_output=True, text=True)
try:
    d = json.loads(r.stdout.strip().splitlines()[-1])
except Exception:
    print(f"СЛЕПОТА: omega.types из {SP} не импортировался: {(r.stderr or r.stdout).strip()[-200:]}"); sys.exit(2)
if not d['file'].startswith(SP):
    print(f"СЛЕПОТА: импортирован чужой omega.types ({d['file']}), а не из {SP}"); sys.exit(2)
if d['ttl']['memory'] is None:
    print(f"СЛЕПОТА: контроль — тип memory бессрочен (ждали 90 сут): прибор читает не ту таблицу"); sys.exit(2)
so_srokom = [k for k in KLASSY if d['ttl'][k] is not None]
print(f"предмет: {d['file']} · контроль memory = {d['ttl']['memory']} с")
if so_srokom:
    print(f"FAIL: со сроком {len(so_srokom)} из {len(KLASSY)}: " + ", ".join(f"{k}={d['ttl'][k]}" for k in so_srokom) + " — B-P-060 сломана или стёрта"); sys.exit(1)
print(f"ok: бессрочны {len(KLASSY)} из {len(KLASSY)}: {', '.join(KLASSY)}"); sys.exit(0)
