#!/usr/bin/env python3
"""site-sroki — срок 30 суток для переписки посетителей сайта у Варвары (B-N-1499; решение владельца 03.10 21:19 МСК).

ЧТО УДАЛЯЕТ — только гостевые сессии: сайта, id с префиксом «telegram-site-» (маршрут site-N → сессия telegram-site-N; кандидат
dsh-telegram-multiagent B-N-1499, README «Источник сайта») и гостей открытого Telegram-бота, «telegram-gost-»
(канал ≥2.5.86, B-N-1642; срок тот же — B-N-1650), не менявшиеся дольше срока (по самому свежему mtime внутри):
  1) каталог сессии DSH  <дом>/.dsh/sessions/<проект>/<id>/  — ГЛАВНОЕ хранилище (журнал session.v4.jsonl*; хранилище
     DSH — каталог на сессию, общего индекса нет: dsh-session-persistence-jsonl listSessionDirs = readdir);
  2) кэш проекции    <дом>/.dsh/storages/session_projcache/sessions/<id>.json;
  3) расшифровку SDK шлюза  <дом>/.claude/projects/*/<sessionId>.jsonl (+ каталог <sessionId>/) — sessionId берётся из
     карты шлюза <sessii.db> по dshId=<id> (только чтение).
ЖИВУЮ СЕССИЮ НЕ ТРОГАЕТ: перед удалением берёт flock(LOCK_EX|LOCK_NB) на session.lock — тот же замок, которым платформа
держит запись (lease.js); занят — пропуск со строкой.
ЖУРНАЛ — без содержимого: id, возраст, сколько файлов и байт по видам.
ЧЕГО НЕ ДЕЛАЕТ (границы, названы в П7): строки БД квитанций плагина (receipts.sqlite: тексты конвертов и копий) — живая БД
чужого модуля; вложения attachments/v1 (общие по хэшу, к сессии не привязаны); спул сайта vhod/kopii/vyhod/otkaz;
память агента (ядро, OMEGA, .claude/projects/*/memory); журналы systemd; строку карты в sessii.db.
КОДЫ: 0 сделано (живые сессии под замком пропускаются — штатно) · 1 отказ (не удалено то, что должно) · 2 слепота (дома нет / корень сессий не читается).
"""
import fcntl, glob, os, shutil, sqlite3, sys, time

DOM = os.environ.get("SITE_DOM", "/opt/varvara")
SROK_SUT = float(os.environ.get("SITE_SROK_SUT", "30"))
PREFIKSY = ("telegram-site-", "telegram-gost-")   # B-N-1650: гости Telegram — тот же срок, что сайт (решение Забавы 09:36Z)
KARTA = os.environ.get("SITE_KARTA_SHLYUZA", "/var/lib/claude-oauth-gateway-varvara/sessii.db")
SEJCHAS = float(os.environ.get("SITE_SEJCHAS", str(time.time())))

def skazat(s): print("[site-sroki] " + s, flush=True)

def svezhee(put):
    m = os.lstat(put).st_mtime
    for kor, katalogi, fajly in os.walk(put, followlinks=False):
        for x in katalogi + fajly:
            try: m = max(m, os.lstat(os.path.join(kor, x)).st_mtime)
            except FileNotFoundError: pass
    return m

def schet(put):
    if os.path.islink(put) or os.path.isfile(put): return 1, os.lstat(put).st_size
    n = b = 0
    for kor, _k, fajly in os.walk(put, followlinks=False):
        for x in fajly:
            try: b += os.lstat(os.path.join(kor, x)).st_size; n += 1
            except FileNotFoundError: pass
    return n, b

def vnutri(put, koren):
    return os.path.realpath(put).startswith(os.path.realpath(koren) + os.sep)

def sessiya_sdk(dsh_id):
    try:
        db = sqlite3.connect(f"file:{KARTA}?mode=ro", uri=True, timeout=5)
        try: return [r[0] for r in db.execute("SELECT sessionId FROM sessions WHERE dshId=? AND sessionId IS NOT NULL", (dsh_id,))]
        finally: db.close()
    except sqlite3.Error as e:
        skazat(f"⚠️ карта шлюза не прочитана ({e.__class__.__name__}) — расшифровки SDK для {dsh_id} не удаляю"); return None

def udalit(put):
    if os.path.islink(put) or os.path.isfile(put): os.unlink(put)
    else: shutil.rmtree(put)

def main():
    koren = os.path.join(DOM, ".dsh", "sessions")
    if not os.path.isdir(koren):
        skazat(f"🔴 СЛЕПОТА: нет {koren}"); return 2
    granica = SEJCHAS - SROK_SUT * 86400
    udaleno = propuskov = zanyato = vsego = 0
    for proekt in sorted(os.listdir(koren)):
        pp = os.path.join(koren, proekt)
        if os.path.islink(pp) or not os.path.isdir(pp): continue
        for imya in sorted(os.listdir(pp)):
            if not imya.startswith(PREFIKSY): continue
            sd = os.path.join(pp, imya)
            if os.path.islink(sd) or not os.path.isdir(sd): continue
            vsego += 1
            vozrast = (SEJCHAS - svezhee(sd)) / 86400
            if svezhee(sd) > granica: continue
            zamok = os.path.join(sd, "session.lock"); fd = None
            try:
                if os.path.lexists(zamok):
                    fd = os.open(zamok, os.O_RDWR | os.O_NOFOLLOW)
                    try: fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
                    except BlockingIOError:
                        skazat(f"пропуск {imya}: сессия занята записью (session.lock держат), возраст {vozrast:.1f} сут — следующим прогоном"); zanyato += 1; continue
                celi = [("сессия", sd)]
                kesh = os.path.join(DOM, ".dsh", "storages", "session_projcache", "sessions", imya + ".json")
                if os.path.lexists(kesh): celi.append(("кэш", kesh))
                sids = sessiya_sdk(imya)
                if sids is None: propuskov += 1
                for sid in sids or []:
                    if not sid or "/" in sid or sid.startswith("."): continue
                    for c in glob.glob(os.path.join(DOM, ".claude", "projects", "*", glob.escape(sid) + ".jsonl")) + \
                             glob.glob(os.path.join(DOM, ".claude", "projects", "*", glob.escape(sid))):
                        celi.append(("расшифровка SDK", c))
                itog = []
                for vid, c in celi:
                    if not vnutri(c, DOM):
                        skazat(f"🔴 {imya}: {vid} вне дома — не трогаю"); propuskov += 1; continue
                    n, b = schet(c); udalit(c); itog.append(f"{vid} {n} ф./{b} Б")
                udaleno += 1
                skazat(f"удалено {imya}: возраст {vozrast:.1f} сут; " + "; ".join(itog))
            except OSError as e:
                skazat(f"🔴 {imya}: отказ {e.__class__.__name__} errno={e.errno}"); propuskov += 1
            finally:
                if fd is not None: os.close(fd)
    skazat(f"итог: гостевых сессий (сайт и Telegram) {vsego}, удалено {udaleno}, занято записью {zanyato}, отказов {propuskov}, срок {SROK_SUT:g} сут")
    return 1 if propuskov else 0

if __name__ == "__main__":
    sys.exit(main())
