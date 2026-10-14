#!/usr/bin/env python3
"""СТЕНД «порог и отказ канала» сторожа dsh-compact-watch (A-N-1948 модуль №5, находка №10; Искра, 10.10.2026).

Предмет: довод 1, иначе БОЕВОЙ /usr/local/sbin/dsh-compact-watch. Модуль грузится из файла (main не зовётся); подменены прибор
занятости (одна сессия за обоими порогами), канал poslat (отказ/успех по такту) и запись состояния (в память). При импорте
предмет только читает реестр агентов. В Telegram и в /var/lib не уходит ничего.
Пробы: П1 канал отказал на такте 1, исправен на такте 2 → на такте 2 тревоги ДОШЛИ (обе доли) · П2 канал исправен → такт 1
две тревоги, такт 2 без повтора · П3 вид zapolnenie в DSH_COMPACT_WATCH_MOLCHAT → канал не зовётся ни разу, повтора нет.
Коды: 0 — все пробы; 1 — красные; 2 — слепота.
ЧЕГО НЕ ЛОВИТ: журнальную часть main (сброс флагов в конце такта); настоящий прибор kontekst-zamer и настоящий канал.
"""
import importlib.machinery, importlib.util, os, sys
sys.dont_write_bytecode = True   # не класть __pycache__ рядом с предметом (боевой /usr/local/sbin от root)

P = sys.argv[1] if len(sys.argv) > 1 else "/usr/local/sbin/dsh-compact-watch"
if not os.access(P, os.R_OK):
    print(f"СЛЕПОТА: предмет не читается: {P}"); sys.exit(2)


def zagruzit(molchat):
    os.environ["DSH_COMPACT_WATCH_MOLCHAT"] = molchat
    os.environ["DSH_COMPACT_WATCH_KATALOG"] = "/nonexistent/stend-porogov"   # запись подменена; путь — чтобы не задеть бой
    imya = f"stend_cw_{abs(hash((P, molchat)))}"
    zagr = importlib.machinery.SourceFileLoader(imya, P)
    spec = importlib.util.spec_from_loader(imya, zagr)
    m = importlib.util.module_from_spec(spec)
    zagr.exec_module(m)
    for nado in ("porogi_nezavisimo", "PRIBOR_SESSII", "poslat", "pisat_sostoyanie", "zanyatost_iz_pribora"):
        if not hasattr(m, nado):
            print(f"СЛЕПОТА: в предмете нет {nado}"); sys.exit(2)
    m.zanyatost_iz_pribora = lambda: ({"iskra": 1}, None)
    m.PRIBOR_SESSII.clear()
    m.PRIBOR_SESSII[("iskra", "stend")] = (950_000, 1_000_000, 1_000_000)   # 95 % порога — за 85 и 90
    m.pisat_sostoyanie = lambda s: None
    return m


def takty(m, kanal):
    """kanal — список исходов poslat по тактам; возвращает [(вызовов, дошло)] по тактам."""
    s, itog = {}, []
    for ishod in kanal:
        vyz = []
        m.poslat = lambda text, kratko=None, _i=ishod, _v=vyz: (_v.append(text), _i)[1]
        m.porogi_nezavisimo(s)
        itog.append((len(vyz), len(vyz) if ishod else 0))
    return itog


ok = bad = 0


def pr(imya, uslovie, podrobno):
    global ok, bad
    if uslovie:
        ok += 1; print(f"✅ {imya} — {podrobno}")
    else:
        bad += 1; print(f"❌ {imya} — {podrobno}")


import hashlib
print(f"== стенд порогов и канала: предмет {P} ({hashlib.sha256(open(P, 'rb').read()).hexdigest()[:16]})")
m = zagruzit("")
r = takty(m, [False, True])
pr("П1 отказ на такте 1, канал жив на такте 2 → тревоги дошли", r[1][1] >= 2, f"такт 1: вызовов {r[0][0]}, дошло 0; такт 2: вызовов {r[1][0]}, дошло {r[1][1]}")
m = zagruzit("")
r = takty(m, [True, True])
pr("П2 канал исправен → 2 тревоги, затем без повтора", r[0][1] == 2 and r[1][0] == 0, f"такт 1: дошло {r[0][1]}; такт 2: вызовов {r[1][0]}")
m = zagruzit("zapolnenie")
r = takty(m, [True, True])
pr("П3 zapolnenie молчит → канал не зовётся", r[0][0] == 0 and r[1][0] == 0, f"вызовов: такт 1 {r[0][0]}, такт 2 {r[1][0]}")
print(f"итог: {ok} из {ok + bad}")
sys.exit(1 if bad else 0)
