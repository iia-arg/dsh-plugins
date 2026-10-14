#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Копия машины sadik — собирается САМОЙ машиной и уезжает на Google Drive.

Написал Михалыч (server/aclaude) 25.08.2026. Ставит и принимает Искра — машина её.

ЧЕМ ЭТО ОТЛИЧАЕТСЯ ОТ НАШЕЙ ЦЕПИ НА aclaude, И ПОЧЕМУ ЭТО НЕ «ПЕРЕНОС»
  Было: наша машина ходила по сети на sadik, тянула архив к себе и клала на Drive.
  Стало: sadik собирает сам и кладёт сам. Нас скоро не будет — цепь, зависящая от нас,
  умрёт вместе с нами.
  Отправка на Drive у нас сделана библиотекой google-api-python-client. 🔴 НА SADIK ЕЁ НЕТ,
  и ставить ради этого целое дерево зависимостей — плохая цена. Поэтому здесь то же самое
  сделано прямыми запросами через requests (он есть). Замысел перенесён, код написан заново.

ЧТО КЛАСТЬ — РЕШАЕТ НЕ ЭТОТ СКРИПТ
  Состав копии читается из реестра `/etc/agent-registry/agents.yaml` через `agent-registry`.
  🔴 Своего списка агентов и путей здесь НЕТ и быть не должно. Пока у потребителя есть свой
  список, реестр ничего не чинит: он лишь второе место, где та же правда протухает молча.
  Не смог прочитать реестр — ОТКАЗ с ненулевым кодом, а не работа по умолчанию.

🔴 ССЫЛКИ КОПИРУЮТСЯ КАК ССЫЛКИ (tar без -h)
  Замер Искры 25.08: 5,4 МБ против 302 МБ при разыменовании — внутри ссылка на app/node_modules,
  а сам app в реестре стоит «не класть». Разыменование втащило бы ровно то, что владелец дома
  осознанно исключил.

🔴 ПОД ЧЬИМ ИМЕНЕМ ЗАПУСКАТЬ
  Под тем пользователем, ЧЕЙ КЛЮЧ от хранилища секретов. Замер 24.08: от root запись
  не читается, от iskra читается. Служба, работающая от root, из хранилища не прочитает.

КОДЫ ВОЗВРАТА
  0 — копия собрана и уехала; полнота отдельно: STATE.polnaya и backup-coverage.json
  1 — собрана, но не уехала (сеть, доступ) — предмет на месте, повторить можно
  3 — реестр не читается: состав копии неизвестен, собирать вслепую нельзя
  4 — сборка не удалась
  5 — токен не читается из хранилища
"""
import glob
import html
import shutil
import re
import io
import hashlib
import json
import os
import subprocess
import sys
import time
import tarfile
import tempfile
from datetime import datetime, timezone
from pathlib import Path
# B-N-762 (24.09.2026, Михалыч): УЗКИЙ ПУТЬ выгрузки. Задан BACKUP_SO_MARK — все сокеты ЭТОГО процесса
# метятся ДО connect() (адрес источника выбирается уже по пути метки); правило fwmark → таблица → awg0
# ставит drop-in 30-put-nl.conf. Без переменной поведение прежнее. Список дополняется НА МЕСТЕ:
# urllib3 связывает его значением по умолчанию параметра socket_options при определении класса.
if os.environ.get("BACKUP_SO_MARK"):
    import socket as _socket
    import urllib3.connection as _u3c
    _u3c.HTTPConnection.default_socket_options.append(
        (_socket.SOL_SOCKET, _socket.SO_MARK, int(os.environ["BACKUP_SO_MARK"], 0)))
    print(f"[B-N-762] сокеты процесса метятся {os.environ['BACKUP_SO_MARK']} — выход по правилу fwmark", file=sys.stderr)

# B-N-762: момент старта процесса — от него считается общий срок выгрузки (см. srok_vygruzki()).
T0 = time.monotonic()

REGISTRY = os.environ.get("AGENT_REGISTRY_BIN", "/usr/local/bin/agent-registry")
PASS_DIR = os.environ.get("PASSWORD_STORE_DIR", "/etc/agent-secrets")
# 🔴 25.08, ПОСЛЕ ОСМОТРА ХРАНИЛИЩА НА SADIK: готового токена диска там НЕТ и быть
# не должно — он живёт час. Лежит то, из чего он ДОБЫВАЕТСЯ: ключ обновления и
# учётные данные приложения. Значит скрипт обязан ОБНОВЛЯТЬ токен сам, а не брать
# готовый: иначе он проработает час после установки и потом будет молча падать.
# Первая версия искала ключ `uzkij-dostup/google-drive` — такого в хранилище нет вовсе,
# это было моё предположение о том, как назовут запись, а не осмотр.
KEY_CLIENT = os.environ.get("DRIVE_CLIENT_KEY", "ferma/google/oauth-client-secret-json")
KEY_REFRESH = os.environ.get("DRIVE_REFRESH_KEY", "ferma/google/refresh-token-iia")
# Владелец ключа от хранилища. От root ходим за секретом к нему; см. token().
KEY_OWNER = os.environ.get("SECRET_KEY_OWNER", "iskra")
LOCAL_DIR = Path(os.environ.get("BACKUP_LOCAL_DIR", "/backups"))
STATE = Path(os.environ.get("BACKUP_STATE", "/var/lib/sadik-backup/last.json"))
RETAIN = int(os.environ.get("BACKUP_RETAIN", "30"))
# 🔴 B-N-740 (слово владельца 24.09 09:34): ЛОКАЛЬНО хранить 15. RETAIN выше чистит ТОЛЬКО Drive; локальную полку
# до этой правки не чистил никто — 37 архивов с 25.08, 78,6 ГБ. Предел локальной полки — отдельная величина.
RETAIN_LOCAL = int(os.environ.get("BACKUP_RETAIN_LOCAL", "15"))
# Своя маска для ротации. Чужие файлы в общей папке не трогаем — см. rotirovat().
# 🔴 ПРИСТАВКА ИМЕНИ — ВТОРАЯ ЛИНИЯ, НЕ ПЕРВАЯ (правка 25.08 13:4x, решение главной
# по доводу Искры). Первая линия — КОНТЕЙНЕР: ротация отбирает по `parents` своей
# подпапки (`own-chain`, id <ID-папки-own-chain> внутри общей sadik-backups).
# Зачем тогда приставка вообще: контейнер защищает от отбора по `parents`, но НЕ защищает
# от отбора по МАСКЕ, а чужой отбор владельцу этой цепи НЕ ВИДЕН — он знает о нём только
# с чужих слов. Замер Искры: `name contains 'aclaude-'` по всему диску даёт 52 объекта,
# то есть соседняя маска ШИРЕ соседней папки. Значит имя обязано держаться независимо.
# 🔴 НЕ СТАВИТЬ приставкой `sadik-`, `aclaude-` и голое `*.tar.gz`: имя `sadik-*` попадает
# под две чужие маски из трёх. Окончательно имя решает владелец цепи — здесь только умолчание.
PRISTAVKA = os.environ.get("BACKUP_PRISTAVKA", "own-chain-")
ALERT = os.environ.get("AGENT_ALERT_BIN", "/usr/local/bin/agent-alert")
DRY = os.environ.get("DRY") == "1"


# 🔴 УЧЁТ ПРОПУЩЕННОГО — ХУК НА ЕДИНСТВЕННЫЙ ПУТЬ ВЫВОДА, А НЕ ПРАВКА КАЖДОГО МЕСТА
# (04.09.2026, приём взят у соседней машины и перенесён целиком).
#
# ЗАЧЕМ. Сборка милосердна: отказ отдельного источника пишется в журнал, и работа
# ПРОДОЛЖАЕТСЯ. Загрузка проходит, отметка зелёная, сторож доволен — и ЧАСТИЧНАЯ копия
# неотличима от полной по всем признакам, которые мы проверяем. Пропажу целого источника
# заметили бы при попытке восстановиться, то есть в худший момент.
#
# Учёт источников отделён от печати. Новые пути отказа обязаны звать propusk().
# Ошибки ротации и объявления исключений не являются пропусками источников.
PROPUSHCHENO: list = []
NEPOKRYTYE: list = []
NEPOKRYTYE_DOMA: list = []


def _utf16(text):
    return len(text.encode('utf-16-le')) // 2


def _check_alert_contract():
    """Check three source anchors in the actual ALERT executable; warning only.

    B-N-1833: agent-alert builds PREFIX once and sends text=${PREFIX}${msg};
    the html-fallback line PREFIX="${PREFIX}..." does not start with [${host}] and is not counted.

    This detects drift of the known wrapper, not arbitrary shell semantics.
    Unreadable or unfamiliar implementations still get an attempted delivery.
    """
    target = ALERT
    try:
        target = str(Path(ALERT).resolve()) if '/' in ALERT else shutil.which(ALERT)
        if not target:
            raise FileNotFoundError('ALERT not found in PATH')
        lines = [line.strip() for line in Path(target).read_text().splitlines()
                 if line.strip() and not line.lstrip().startswith('#')]
        payloads = [match.group(1) for line in lines
                    if (match := re.fullmatch(r'--data-urlencode "text=(.*)"\s*\\?', line))]
        prefixes = [match.group(1) for line in lines
                    if (match := re.fullmatch(r'PREFIX="(\[\$\{host\}\].*)"', line))]
        missing = []
        if len(prefixes) != 1 or len(payloads) != 1 or not payloads[0].startswith('${PREFIX}'):
            missing.append('host-prefix')
        if (len(payloads) != 1 or payloads[0] != '${PREFIX}${msg}'
                or prefixes != ['[${host}]${ISTOCHNIK:+ ⚠️ $ISTOCHNIK ·} ']):
            missing.append('origin-wrapper')
        if not any(re.fullmatch(r'''\[ -n "\$tb" \] && \{ printf ''; return; \}(?:\s*#.*)?''', line)
                   for line in lines):
            missing.append('timer-empty-origin')
        if not missing:
            return True
        detail = ', '.join(missing)
    except Exception as error:
        detail = type(error).__name__ + ': ' + str(error)
    log(f'ПРЕДУПРЕЖДЕНИЕ: договор ALERT={target or ALERT} не подтверждён: {detail}; '
        'точность бюджета обёртки не гарантирована; отправка НЕ запрещена')
    return False


def _alert_budget():
    """Upper-bound agent-alert's wrapper; same cgroup/environment as its child.

    Current contract: [host] + optional origin + body. Assume the LONGEST non-timer origin
    even for timers (B-N-1830: manual/service/cron/unknown, unknown tail capped at 64). Raw HTML length is a conservative bound on visible text.
    Reserve (UTF-16): timer without MONITOR_UNIT saves len(origin)+6 units;
    for sadik-backup.service on host sadik this is 42 (budget 4046 vs 4088).
    Manual/OnFailure origin reserve can be 0: no universal positive minimum.
    Raw HTML reserve: list titles contain <b></b> = 7 units; each &/< /> adds
    4/3/3, quotes add 5 after escaping. Minimum for arbitrary plain text is 0.
    Keep this contract aligned with agent-alert when either wrapper changes.
    """
    host = subprocess.run(['hostname', '-s'], capture_output=True, timeout=5, check=True).stdout.decode().strip()
    if not host:
        raise ValueError('hostname empty')
    units = re.findall(r'[a-zA-Z0-9@._-]+\.(?:service|scope)', Path('/proc/self/cgroup').read_text())
    # B-N-1830: верхняя граница по ВСЕМ меткам agent-alert, кроме пустой у таймера (метки — istochnik_trevogi там же).
    u = units[-1] if units else ''
    origin = ('ПО ОТКАЗУ СЛУЖБЫ ' + os.environ['MONITOR_UNIT'] if os.environ.get('MONITOR_UNIT')
              else max(('ПОЗВАНО РУКОЙ (' + u + ')', 'служба ' + u, 'по cron (' + u + ')',
                        'источник не установлен (' + 'x' * 64 + ')'), key=_utf16))
    budget = 4096 - _utf16(f'[{host}] ⚠️ {origin} · ')
    if budget <= 0:
        raise ValueError('wrapper consumes entire Telegram budget')
    return budget


def _alert_reference():
    stamp = datetime.now(timezone.utc).isoformat()
    invocation = os.environ.get('INVOCATION_ID')
    return ('INVOCATION_ID=' + invocation + '; ' if invocation else '') + 'UTC=' + stamp


def _format_list_alert(title, items):
    budget = _alert_budget()
    reference = html.escape(_alert_reference())
    n = len(items)
    lines = []
    def render(proposed):
        k = len(proposed)
        return (f'{title}\nпоказано источников {k} из {n}; не показано {n-k}\n'
                f'Полный перечень: журнал sadik-backup.service; {reference}\n'
                + '\n'.join(proposed))
    if _utf16(render([])) > budget:
        raise ValueError('coverage header and reference do not fit')
    for item in items:
        # Preserve the entire name, escape HTML and render embedded newlines visibly.
        name = html.escape(str(item['istochnik']).replace('\n', '\\n').replace('\r', '\\r'))
        reason = str(item['prichina']).replace('\n', '\\n').replace('\r', '\\r')
        line = name + ': ' + html.escape(reason)
        if _utf16(render(lines + [line])) <= budget:
            lines.append(line)
            continue
        suffix = ' [причина усечена]'
        if _utf16(render(lines + [name + ': ' + suffix])) > budget:
            break
        low, high = 0, len(reason)
        while low < high:
            middle = (low + high + 1) // 2
            if _utf16(render(lines + [name + ': ' + html.escape(reason[:middle]) + suffix])) <= budget:
                low = middle
            else:
                high = middle - 1
        lines.append(name + ': ' + html.escape(reason[:low]) + suffix)
    return render(lines), budget


def _send_alert(message, budget=None):
    """Pin the channel cutoff so it cannot silently invalidate the reported K."""
    try:
        available = _alert_budget()
        budget = available if budget is None else min(budget, available)
        if _utf16(message) > budget:
            raise ValueError('prepared message exceeds final wrapper budget')
        # budget is UTF-16 units; channel compares code points (<= UTF-16), so no second cut.
        env = dict(os.environ, AGENT_ALERT_PREDEL=str(budget))
        result = subprocess.run([ALERT, message], capture_output=True, timeout=60, env=env)
        if result.returncode:
            detail = (result.stderr or result.stdout or b'no diagnostic')
            if isinstance(detail, bytes):
                detail = detail.decode('utf-8', errors='replace')
            log(f'ТРЕВОГА НЕ ДОСТАВЛЕНА: ALERT={ALERT}, код {result.returncode}, '
                f'таймаут 60 с; причина: {str(detail)[:300]!r}')
            return False
        log(f'ALERT={ALERT}: код 0, таймаут 60 с; канал подтвердил отправку, чтение не проверено')
        return True
    except subprocess.TimeoutExpired:
        log(f'ТРЕВОГА НЕ ДОСТАВЛЕНА: ALERT={ALERT}, истёк таймаут 60 с; исход доставки неизвестен')
    except Exception as error:
        log(f'ТРЕВОГА НЕ ДОСТАВЛЕНА: ALERT={ALERT}, таймаут 60 с; '
            f'{type(error).__name__}: {str(error)[:300]}')
    return False


def svodka_polnoty(pokrytie=None):
    """Сказать вслух, полна ли копия. Зовётся ИЗ ОБЕИХ веток выхода.

    🔴 Вынесено в функцию по своему же классу «правка в одну ветку вместо функции»:
    сперва сводка стояла только в конце main, а при DRY=1 возврат случается раньше —
    то есть сухой прогон, которым правку и проверяют, её не исполнял НИ РАЗУ.
    Поймано первым же прогоном: архив собрался, а строки о полноте не было.
    """
    propushcheno = PROPUSHCHENO if pokrytie is None else pokrytie["propushcheno"]
    skolko = len(propushcheno)
    otmetka = datetime.now(timezone.utc).strftime('%H:%M:%S')
    if not skolko:
        print(f"[{otmetka}] копия полна: зарегистрированных пропусков источников нет",
              flush=True)
        return
    print(f"[{otmetka}] 🔴 КОПИЯ СОБРАНА, НО НЕПОЛНА: пропущено источников {skolko}", flush=True)
    for m in propushcheno[:skolko]:
        print(f"    {m['istochnik']}: {m['prichina']}", flush=True)
    # Тревога отдельная от «копия не сделана»: у неё другое лечение — не пересобрать,
    # а разобраться, почему источник пропал. Слить их значило бы учить не читать тревоги.
    if TREVOZHIT and os.access(ALERT, os.X_OK) and not DRY:
        try:
            message, budget = _format_list_alert("⚠️ <b>Копия sadik НЕПОЛНА</b>", propushcheno)
            _send_alert(message, budget)
        except Exception as error:
            log(f"ТРЕВОГА НЕ ДОСТАВЛЕНА: не удалось сформировать охват; {type(error).__name__}: {error}")



def log(msg: str):
    print(f"[{datetime.now(timezone.utc).strftime('%H:%M:%S')}] {msg}", flush=True)


def propusk(istochnik: str, prichina: str):
    PROPUSHCHENO.append({"istochnik": istochnik, "prichina": prichina})
    log(f"⚠️ ПРОПУСК ИСТОЧНИКА: {istochnik}; {prichina}")


# 🔴 ПРАВКА ИСКРЫ 25.08 ПО СВОЕЙ ЖЕ ОШИБКЕ, пойманной в тот же час.
# Проверяя новый режим --skachat тремя отказными вызовами, я отправила владельцу три
# тревоги «Копия sadik не сделана» — при том, что копия была сделана и лежала на месте.
# Причина устройства, а не невнимательности: у инструмента был ОДИН способ отказа,
# и он приписывал ЛЮБОМУ режиму смысл единственного — сборки по расписанию.
# Правило: тревогу шлёт тот, кто знает КОНТЕКСТ. Сборка по расписанию знает (её
# отказ = копии нет). Ручной вызов и перевозка байтов не знают — они молчат в журнал,
# а тревожит вызывающий, если сочтёт нужным. Иначе ложная тревога учит не читать тревоги.
TREVOZHIT = True


def fail(code: int, msg: str, items=None):
    print(f"ОТКАЗ: {msg}", file=sys.stderr)
    if items is not None:
        for item in items:
            print(f"    {item['istochnik']}: {item['prichina']}", file=sys.stderr)
    if TREVOZHIT and os.access(ALERT, os.X_OK) and not DRY:
        title = "🔴 <b>Копия sadik не сделана</b>\n" + html.escape(msg)
        if items is None:
            _send_alert(title)
        else:
            try:
                message, budget = _format_list_alert(title, items)
                _send_alert(message, budget)
            except Exception as error:
                log(f"ТРЕВОГА НЕ ДОСТАВЛЕНА: не удалось сформировать охват; {type(error).__name__}: {error}")
    sys.exit(code)


# ── СОСТАВ КОПИИ: только из реестра ─────────────────────────────────────────
def registry(*args, codes=(0,), with_code=False):
    if not os.access(REGISTRY, os.X_OK):
        fail(3, f"нет {REGISTRY} — состав копии читать нечем. "
                f"Свой список заводить нельзя: он протухнет молча.")
    r = subprocess.run([REGISTRY, *args], capture_output=True, text=True, timeout=60)
    if r.returncode not in codes:
        fail(3, f"реестр не ответил на «{' '.join(args)}» (код {r.returncode}): "
                f"{r.stderr.strip()[:200]}")
    return (r.stdout.strip(), r.returncode) if with_code else r.stdout.strip()


def sostav() -> dict:
    """Новый вход: частичная рамка годна для сборки, но не для заявления полноты."""
    global NEPOKRYTYE, NEPOKRYTYE_DOMA
    raw, code = registry("pokrytie", "--json", "--s-nepolnymi", codes=(0, 4), with_code=True)
    try:
        d = json.loads(raw)
        if not isinstance(d, dict) or d.get("format") != "pokrytie-s-nepolnymi-v1":
            raise ValueError("неизвестный формат рамки")
        bad = d.get("nepolnye")
        if not isinstance(bad, list) or type(d.get("polnoe")) is not bool:
            raise ValueError("нет явного признака полноты и списка nepolnye")
        if d["polnoe"] != (not bad) or code != (4 if bad else 0):
            raise ValueError("код возврата и поля полноты противоречат друг другу")
        if not isinstance(d.get("doma"), dict) or not isinstance(d.get("komnaty"), dict):
            raise ValueError("нет карт doma/komnaty")
        if set(d["doma"]) != set(d["komnaty"]):
            raise ValueError("состав doma и komnaty расходится")
        names = set()
        for item in bad:
            if not isinstance(item, dict):
                raise ValueError("неполная запись не является объектом")
            name, reasons = item.get("imya"), item.get("prichiny")
            if not isinstance(name, str) or not name.strip() or name in names or name in d["doma"]:
                raise ValueError("неоднозначное имя непокрытого агента")
            if not isinstance(reasons, list) or not reasons or any(not isinstance(x, str) or not x for x in reasons):
                raise ValueError("не названа причина неполноты")
            names.add(name)
    except (ValueError, TypeError) as e:
        fail(3, f"реестр отдал негодный договор покрытия: {e}")
    # Имя неполного есть в новом ответе, но его дом не включён в карту полных.
    # Спрашиваем только существующее поле, ничего не дописывая в реестр.
    # Без него нельзя гарантировать исключение из общих каталогов/масок.
    homes = []
    for item in bad:
        try:
            home = json.loads(registry("pole", item["imya"], "dom", "--json"))
            if not isinstance(home, str) or not Path(home).is_absolute() or Path(home) == Path("/"):
                raise ValueError("нужен известный абсолютный дом непокрытого агента")
            home = os.path.normpath(home)
            if home == "/" or os.path.realpath(home) == "/":
                raise ValueError("дом непокрытого агента не может быть корнем машины")
            homes.append(home)
        except (ValueError, TypeError) as e:
            fail(3, f"граница непокрытого агента не установлена: {e}")
    NEPOKRYTYE, NEPOKRYTYE_DOMA = bad, homes
    for item in bad:
        log(f"⚠️ НЕПОКРЫТ АГЕНТ {item['imya']}: " + json.dumps(item['prichiny'], ensure_ascii=False)
            + "; собираю НЕПОЛНУЮ копию остальных объявленных источников")
    return d


def polnota_kopii():
    """Признак предмета, не синоним exit0 (собрано/отправлено)."""
    d = {"format": "sadik-backup-coverage-v1", "polnaya": not PROPUSHCHENO and not NEPOKRYTYE,
         "nepokrytye": NEPOKRYTYE, "propushcheno": list(PROPUSHCHENO)}
    if ACL_SNIMOK is not None:
        d["acl"] = ACL_SNIMOK   # B-N-1611: читает proverka-kopii.sh (раздел 5г)
    return d


# B-N-1611 (05.10.2026, Аврора; условие Вениамина): копия теряла ВСЕ ACL. tarfile расширенных атрибутов
# не хранит (в его API их нет), поэтому восстановленные пути возвращались голыми — замер 05.10: 159 путей
# копии с ACL (*/pamyat, /opt/coders/*, a2a агентов, UROKI-*), проба /opt/zarya/a2a: user:claude:--x пропал.
# ЛЕЧЕНИЕ: снимок `getfacl --skip-base --absolute-names` РОВНО по положенному в архив (polozheno, без ссылок:
# getfacl по ссылке читает ACL цели) — отдельной записью backup-acl.txt рядом с манифестом; число путей и
# ошибка снимка — в манифест (поле acl). Восстановление: `setfacl --restore=backup-acl.txt` после распаковки.
# ⚠️ ЧЕГО НЕ ЛОВИТ: снимок — на момент конца обхода; ACL, изменённый между `tar.add` и снимком, ляжет новым.
# Пути с переводом строки в имени getfacl по stdin не принимает — их число называется в манифесте, ACL их не снят.
ACL_FAJL = "backup-acl.txt"
ACL_SNIMOK = None
ACL_SROK = int(os.environ.get("BACKUP_ACL_SROK_SEK", "1800"))


def snyat_acl(polozheno) -> bytes:
    """Снимок расширенных ACL положенного; заполняет ACL_SNIMOK. Не бросает: отказ — в манифест и журнал."""
    global ACL_SNIMOK
    puti = sorted(p for p in polozheno if "\n" not in p and not os.path.islink(p))
    s_perevodom = sum(1 for p in polozheno if "\n" in p)
    try:
        r = subprocess.run(["getfacl", "--skip-base", "--absolute-names", "-"],
                           input=("\n".join(puti) + "\n").encode("utf-8", "surrogateescape"),
                           capture_output=True, timeout=ACL_SROK)
    except (OSError, subprocess.TimeoutExpired) as e:
        ACL_SNIMOK = {"fajl": ACL_FAJL, "putej": None, "oshibka": f"getfacl не исполнился: {e}"[:200]}
        log(f"🔴 СНИМОК ACL НЕ СНЯТ: {ACL_SNIMOK['oshibka']} — при восстановлении ACL вернуть будет нечем")
        return b""
    putej = sum(1 for s in r.stdout.split(b"\n") if s.startswith(b"# file: "))
    stderr_ = [s for s in r.stderr.decode("utf-8", "replace").splitlines() if s.strip()]
    # Код 1 у getfacl — «часть путей не прочиталась» (живое дерево: файл исчез после tar.add); прочее — отказ.
    oshibka = None if r.returncode in (0, 1) else f"getfacl код {r.returncode}: {(stderr_[:1] or [''])[0][:150]}"
    ACL_SNIMOK = {"fajl": ACL_FAJL, "putej": None if oshibka else putej, "oshibka": oshibka,
                  "proshlo_putej": len(puti), "ne_prochitano": len(stderr_), "imena_s_perevodom_stroki": s_perevodom}
    if oshibka:
        log(f"🔴 СНИМОК ACL НЕ СНЯТ: {oshibka}")
        return b""
    log(f"ACL: снято {putej} путей с расширенным ACL из {len(puti)} положенных (без ссылок); "
        f"не прочитано {len(stderr_)}, имён с переводом строки {s_perevodom}")
    return r.stdout


def papka_na_diske() -> str:
    """Куда класть — тоже из реестра, но из ДРУГОГО его раздела.

    🔴 Правка Искры 25.08. Было: `d.get("drive_folder_id")` из ответа `pokrytie`.
    Замер: в `pokrytie --json` ключей всего пять — doma, komnaty, korni_obhoda,
    obshchee, obshchee_ne_v_kopiyu, и `drive_folder_id` среди них НЕТ. Скрипт собирал
    архив (3 с работы) и падал уже ПОСЛЕ сборки: «не назван каталог».
    Причина не в скрипте: раздел `mashina.kopiya` в реестре завела я 25.08, ПОСЛЕ того
    как скрипт был написан. Потребитель не знал о новом месте — рассинхрон, а не ошибка.
    Запасной ход через переменную окружения убран НАРОЧНО: он и есть «свой список
    у потребителя», против которого написан весь этот файл. Место — свойство машины,
    и живёт оно в реестре, в одном месте.
    """
    raw = registry("mashina", "--json")
    try:
        m = json.loads(raw)
    except json.JSONDecodeError as e:
        fail(3, f"реестр отдал не JSON на «mashina»: {e}")
    papka = ((m.get("kopiya") or {}).get("drive_folder_id") or "").strip()
    if not papka:
        fail(3, "в реестре нет mashina.kopiya.drive_folder_id — куда класть неизвестно. "
                "Гадать нельзя: чужая папка чистится чужой ротацией.")
    return papka


def sobrat_puti(d: dict) -> list:
    """Пути для копии — из реестра, СТРОГО по его структуре.

    🔴 Структура прочитана ГЛАЗАМИ, а не угадана: первая версия этого скрипта искала
    ключи `klast_puti`/`puti`, которых в ответе нет вовсе. Реестр отдаёт:
      doma     {агент: путь_дома}
      komnaty  {агент: {klast: [...], ne_klast: {...}}}
    ⚠️ В yaml этот ключ называется `ne_klast_prichina`, а реестр отдаёт его как
    `ne_klast`. Код читает ПОСРЕДНИКА (json реестра), а не источник (yaml).
      obshchee [{put, zachem}]  — общемашинное, что КЛАСТЬ
    Полный путь комнаты = дом + имя из klast. Разложить иначе — значит собрать не то.
    """
    doma = d.get("doma") or {}
    komnaty = d.get("komnaty") or {}
    obshchee = d.get("obshchee") or []
    if not doma:
        fail(3, "реестр не назвал ни одного дома — собирать нечего и не с чем сверяться")

    puti = []
    for agent, dom in doma.items():
        k = (komnaty.get(agent) or {}).get("klast") or []
        if not k:
            # Дом есть, а что из него класть — не сказано. Это не «ничего»,
            # это неизвестность: молча пропустить дом целиком нельзя.
            fail(3, f"у агента «{agent}» дом {dom} есть, а раздела klast нет — "
                    f"состав его копии неизвестен")
        puti += [str(Path(dom) / x) + ("/" if x.endswith("/") else "") for x in k]

    for item in obshchee:
        put = item.get("put") if isinstance(item, dict) else item
        if put:
            puti.append(str(put))

    if not puti:
        fail(3, "из реестра не собралось ни одного пути")
    return puti


# ── СБОРКА ──────────────────────────────────────────────────────────────────
# B-N-1436 (02.10.2026, Заря; находка Вениамина): marshal не защищён от испорченных и нарочных данных — разбор чужого
# .pyc в процессе сборки (root) мог уронить её целиком (сегфолт try не ловит), и копии не было бы. Теперь compile и
# marshal.loads идут в ОТДЕЛЬНОМ процессе (python -I -B, без site и путей домов), одним вызовом на каталог __pycache__,
# под сроком. Упал, убит, не уложился, ответил не по договору ⇒ кэш НЕвосстановим (кладётся как есть) + строка в журнал.
# ⚠️ НЕ ЛОВИТ: .pyc, который marshal разбирает без падения, но долго жрёт память — его держит только срок и MemoryMax юнита.
PYC_SROK = int(os.environ.get("BACKUP_PYC_SROK_SEK", "60"))
PYC_RAZBOR = r"""
import json, marshal, sys
for pyc, py, opt in json.load(sys.stdin):
    try:
        rebuilt = compile(open(py, 'rb').read(), py, 'exec', dont_inherit=True, optimize=opt)
        with open(pyc, 'rb') as f:
            if marshal.loads(f.read()[16:]) != rebuilt:
                print('NE'); sys.exit(0)
    except (OSError, ValueError, NotImplementedError, SyntaxError, EOFError, TypeError):
        print('NE'); sys.exit(0)
print('DA')
"""


def razobrat_pyc(source, pary):
    """True — каждый .pyc равен перекомпиляции своего .py; иначе False. Разбор — в подпроцессе (B-N-1436)."""
    try:
        r = subprocess.run([sys.executable, "-I", "-B", "-c", PYC_RAZBOR], input=json.dumps(pary),
                           capture_output=True, text=True, timeout=PYC_SROK)
    except subprocess.TimeoutExpired:
        log(f"⚠️ КЭШ НЕ РАЗОБРАН (не уложился в {PYC_SROK} с): {source} — кладётся как есть")
        return False
    except OSError as e:
        log(f"⚠️ КЭШ НЕ РАЗОБРАН (подпроцесс не запустился: {e}): {source} — кладётся как есть")
        return False
    otvet = r.stdout.strip()
    if r.returncode == 0 and otvet in ("DA", "NE"):
        return otvet == "DA"
    pochemu = f"убит сигналом {-r.returncode}" if r.returncode < 0 else f"код {r.returncode}"
    log(f"⚠️ КЭШ НЕ РАЗОБРАН ({pochemu}, ответ «{otvet[:40]}»): {source} — кладётся как есть")
    return False


def vosstanovimyj_pycache(source, included_roots):
    """Только проверенный bytecode-кэш: исходники входят в эту же копию.
    .git, node_modules и остальные кэши НЕ исключаются по имени.
    """
    import importlib.util, struct, re
    p = Path(source)
    if p.name != "__pycache__" or p.is_symlink() or not p.is_dir():
        return False
    pary = []
    try:
        files = list(p.iterdir())
        if not files:
            return False
        for f in files:
            if f.is_symlink() or not f.is_file() or f.suffix != ".pyc":
                return False
            py = Path(importlib.util.source_from_cache(str(f)))
            if py.is_symlink() or not py.is_file() or py.resolve() != py:
                return False
            if not any(str(py) == r or str(py).startswith(r.rstrip("/") + "/") for r in included_roots):
                return False
            with f.open("rb") as stream:
                head = stream.read(16)
            if len(head) != 16 or head[:4] != importlib.util.MAGIC_NUMBER:
                return False
            flags, mtime, size = struct.unpack("<III", head[4:])
            st = py.stat()
            if flags != 0 or mtime != (int(st.st_mtime) & 0xffffffff) or size != (st.st_size & 0xffffffff):
                return False
            opt = re.search(r"\.opt-([12])\.pyc$", f.name)
            # B-N-1434 (02.10.2026): сравниваем РАЗОБРАННЫЙ объект кода, а не байты marshal. Байты зависят от состояния
            # интерпретатора: marshal ставит FLAG_REF объекту, на который в момент записи больше одной ссылки, а это
            # зависит от того, что компилятор уже разделил в процессе. Замер: c_parser.py, два compile в одном
            # процессе — объекты равны, байты 97 777 и 97 827 (первое различие — FLAG_REF у кортежа-константы);
            # отсюда «первый вызов в процессе False, далее True». Равенство code-объектов (co_code, константы
            # рекурсивно, имена, таблицы строк/исключений) от этого не зависит. Не разобралось — сомнение ⇒ класть.
            # Даже ручная правка bytecode не должна потеряться: неравенство ⇒ False (решает подпроцесс, B-N-1436).
            pary.append((str(f), str(py), int(opt.group(1)) if opt else 0))
    except (OSError, ValueError, NotImplementedError, SyntaxError, EOFError, TypeError):
        return False
    return razobrat_pyc(source, pary)


def raskryt_puti(puti):
    """Литерал каталога или шаблон с завершающим / — явный выбор дерева.
    Остальные шаблоны выбирают файлы и сами ссылки, включая скрытые имена.
    Ссылки не разыменовываются при выборе типа. Нет молчаливого включения дерева.
    """
    import stat
    est, net, zapret = [], [], []
    for pattern in puti:
        magic = glob.has_magic(pattern)
        directories = pattern.endswith("/")
        # glob скрывает ошибки обхода; сами выбранные объекты проверяем lstat.
        matches = sorted(glob.glob(pattern.rstrip("/"), include_hidden=True)) if magic else [pattern.rstrip("/") or "/"]
        if not matches:
            net.append(f"{pattern} (шаблон, совпадений нет)")
        selected = 0
        for name in matches:
            try:
                mode = os.lstat(name).st_mode
            except FileNotFoundError:
                net.append(name); continue
            except OSError:
                zapret.append(name); continue
            is_dir = stat.S_ISDIR(mode)
            if magic and is_dir and not directories:
                propusk(name, f"КАТАЛОГ НЕ ВЫБРАН: шаблон {pattern} выбирает файлы/ссылки; дерево задайте точным путём или шаблоном с / в конце")
                continue
            if directories and not is_dir:
                propusk(name, f"НЕ КАТАЛОГ: шаблон {pattern} требует дерево")
                continue
            if not (is_dir or stat.S_ISREG(mode) or stat.S_ISLNK(mode)):
                propusk(name, "НЕПОДДЕРЖИВАЕМЫЙ ТИП: объект не выбран")
                continue
            est.append(name); selected += 1
        if magic:
            log(f"шаблон {pattern} → выбрано {selected} из {len(matches)}; тип: {'каталоги' if directories else 'файлы/ссылки'}, скрытые включены")
    return est, net, zapret


def sverka_dvojnaya(seg: list, obr: list) -> tuple:
    """Путь (сегментами) против образца с «**»: (точно, можно_глубже).

    «**» отдельным сегментом — 0…N уровней, как у glob(recursive=True); прочие сегменты — fnmatch
    (скрытые имена «*» берёт, как glob с include_hidden). «можно_глубже» — путь есть начало совпадения.
    """
    import fnmatch
    from functools import lru_cache

    @lru_cache(maxsize=None)
    def m(i, j):
        if j == len(obr):
            return (i == len(seg), False)
        if i == len(seg):
            return (all(s == "**" for s in obr[j:]), True)
        if obr[j] == "**":
            a, b = m(i, j + 1), m(i + 1, j)
            return (a[0] or b[0], a[1] or b[1])
        if fnmatch.fnmatchcase(seg[i], obr[j]):
            return m(i + 1, j + 1)
        return (False, False)
    return m(0, 0)


def raskryt_ne_klast(put: str) -> list:
    """Раскрыть образец «не класть» в абсолютные пути.

    Без «**» — прежний glob.glob(…, include_hidden=True), тот же вызов: поведение прежних масок не меняется.
    С «**» (B-N-1431, 02.10.2026) — СВОЙ обход os.walk(followlinks=False), а НЕ glob(recursive=True):
    в Python 3.12 recursive-glob ходит по ссылкам на каталоги — петля «→ ..» даёт десятки призраков до ELOOP,
    ссылка наружу уводит в чужое дерево; в песочницах 02.10 ссылок на каталоги 4837 (4490 → /opt/iskra),
    и recursive-glob по шести домам не уложился в 600 с. Здесь по ссылкам не ходим: ссылка совпадает
    как объект; совпавший каталог не раскрываем — он и так вычитается целиком.
    ⚠️ ЧЕГО НЕ ЛОВИТ: совпадение ВНУТРИ каталога, в который ведёт ссылка (туда не ходим по построению).
    """
    if "**" not in put.split("/"):
        return glob.glob(put, include_hidden=True)
    chasti = [s for s in put.split("/") if s]
    i = next(k for k, s in enumerate(chasti) if glob.has_magic(s))
    koren, obr = "/" + "/".join(chasti[:i]), tuple(chasti[i:])
    if os.path.islink(koren) or not os.path.isdir(koren):
        return []
    najdeno = []
    for tek, katalogi, fajly in os.walk(koren, followlinks=False):
        otn = os.path.relpath(tek, koren)
        pref = () if otn == "." else tuple(otn.split(os.sep))
        dalshe = []
        for imya in katalogi:
            tochno, glubzhe = sverka_dvojnaya(pref + (imya,), obr)
            if tochno:
                najdeno.append(os.path.join(tek, imya))
            elif glubzhe and not os.path.islink(os.path.join(tek, imya)):
                dalshe.append(imya)
        katalogi[:] = dalshe
        najdeno.extend(os.path.join(tek, f) for f in fajly if sverka_dvojnaya(pref + (f,), obr)[0])
    return najdeno


# B-N-1490 (03.10.2026, Михалыч; находка Авроры, сверка Вениамина): ЖИВАЯ SQLite НЕ кладётся байтами.
# tarfile.add читал только главный файл: несброшенное из -wal в копию не ехало (omega.db: WAL ~0,5 МБ), а при
# совпадении с checkpoint ложилась рваная страница. Теперь — снимок sqlite3 backup API во временный файл рядом
# с архивом и в tar ИМЕННО он, под исходным именем и с исходными владельцем/правами/mtime.
# 🔴 УЗНАЁМ ПО ЗАГОЛОВКУ «SQLite format 3\0», а не по «*.db»: замер 03.10 — в охвате 309 SQLite, из них «*.db»
# только 138; живые receipts.sqlite и .codex/*.sqlite маска «*.db» пропустила бы молча.
# -wal/-shm базы, снятой снимком, в копию НЕ кладутся (их содержимое уже в снимке). Снимок не удался —
# база и её -wal/-shm кладутся КАК РАНЬШЕ байтами + строка в журнал: потеря свежести, а не потеря файла.
# Побочный след: открытие базы в режиме WAL без -wal/-shm СОЗДАЁТ их рядом (пустые, владелец — владелец базы,
# SQLite делает fchown сам; проверено 03.10 от root на базе nobody). Удалять их нельзя: в этот миг базу мог
# открыть хозяин, и снятый из-под него -shm рвёт его соединение.
# ЧЕГО НЕ ЛОВИТ: базы, отданные ссылкой (ссылка кладётся ссылкой, как прежде); rollback-журнал «-journal»
# кладётся как есть (снимок под общей блокировкой его не требует, но состав здесь не меняли).
SQLITE_MAGIC = b"SQLite format 3\x00"


def eto_sqlite(put: str) -> bool:
    try:
        with open(put, "rb") as h:
            return h.read(16) == SQLITE_MAGIC
    except OSError:
        return False


def snimok_sqlite(source: str, tmpdir: str) -> str:
    """Снимок через backup API; возвращает путь временного файла. Бросает при отказе."""
    import sqlite3
    import urllib.parse
    fd, tmp = tempfile.mkstemp(dir=tmpdir, suffix=".sqlite-snimok")
    os.close(fd)
    src = sqlite3.connect("file:" + urllib.parse.quote(source) + "?mode=ro", uri=True, timeout=60)
    try:
        dst = sqlite3.connect(tmp)
        try:
            src.backup(dst)
        finally:
            dst.close()
    finally:
        src.close()
    return tmp


def sobrat(puti: list, dest: Path, d_pokrytie: dict | None = None) -> Path:
    """Архив без разыменования ссылок.

    🔴 dereference=False обязателен: см. замер в шапке. Ссылка на исключённый каталог
    раздула бы копию в 56 раз и втащила то, что владелец дома исключил намеренно.
    """
    # 🔴 Path.exists() БРОСАЕТ PermissionError, а не возвращает False: прогон 25.08
    # упал на /opt/dsh/.dsh/settings.yaml. «Нет доступа» и «нет пути» — РАЗНЫЕ вещи,
    # и вторая молча превратила бы первую в «этого не бывает».
    # 🔴 ШАБЛОНЫ РАСКРЫВАЮТСЯ, а не понимаются буквально. Прогон 25.08: в реестре
    # стоят `workspace/otchet-*.md` и `workspace/zamysel-*.md`, скрипт счёл их
    # обычными путями, не нашёл и сообщил «в реестре есть, на диске нет» —
    # сообщение правдоподобное и НЕВЕРНОЕ. 60 файлов не попали бы в копию,
    # а человек прочитал бы предупреждение как «реестр устарел».
    est, net, zapret = raskryt_puti(puti)
    if zapret:
        fail(4, f"нет доступа к {len(zapret)} путям. "
                f"Копия собралась бы НЕПОЛНОЙ и молча — это хуже отказа. "
                f"Запускать от root либо дать права.",
             items=[{"istochnik": source, "prichina": "нет доступа"} for source in zapret])
    if net:
        # Отсутствие пути из реестра — не повод молчать: либо реестр устарел, либо
        # каталог пропал. И то и другое человек должен увидеть.
        for source in net:
            propusk(source, "в реестре есть, на диске нет")
    if not est:
        fail(4, "ни одного пути из реестра нет на диске — так не бывает, "
                "проверка не состоялась")
    try:
        skipped = set()
        boundaries = {x for h in NEPOKRYTYE_DOMA for x in (os.path.abspath(h), os.path.realpath(h))}
        if "/" in boundaries:
            fail(3, "граница непокрытого агента разрешилась в корень машины")
        with tarfile.open(dest, "w:gz", dereference=False) as t:
            # Раскрываем исключения разметки в АБСОЛЮТНЫЕ пути один раз: сравнение идёт
            # по пути, а не по образцу, — иначе каждый файл дерева стоил бы fnmatch.
            # ⚠️ ИМЯ КЛЮЧА: в yaml это `ne_klast_prichina`, реестр отдаёт как `ne_klast`.
            # Ищущий связь по имени из yaml её НЕ НАЙДЁТ — переименование делает реестр.
            ne_klast_puti = set()
            ne_klast_pusto = []
            for agent_, dom_ in ((d_pokrytie or {}).get("doma") or {}).items():
                for obr_ in (((d_pokrytie or {}).get("komnaty") or {}).get(agent_) or {}).get("ne_klast") or {}:
                    # B-N-1431 (условие Вениамина): «**» ПЕРВЫМ сегментом — это «весь дом/вся машина».
                    # Лишнее вычитание = молчаливая потеря данных в копии, поэтому ОТКАЗ: маска не применяется
                    # (в копию ляжет больше, а не меньше). Сторож (sopostavit_zvezdy) отвечает так же — None.
                    if [s for s in obr_.split("/") if s][:1] == ["**"]:
                        log(f"🔴 ОТКАЗ: маска «не класть» начинается с «**» — {obr_} (агент {agent_}): "
                            "это «весь дом», не применяю (B-N-1431)")
                        continue
                    put_ = obr_ if obr_.startswith("/") else os.path.join(dom_, obr_)
                    # 🔴 include_hidden=True — 20.09.2026, находка Вениамина при разборе #247.
                    # ОТБОР (:348) раскрывает маски со скрытыми, ВЫЧИТАНИЕ раскрывало БЕЗ них.
                    # Асимметрия односторонняя: скрытый предмет мог быть ПОЛОЖЕН маской klast
                    # (а также взят рекурсией — os.listdir скрытое видит) и НЕ ВЫЧТЕН маской
                    # ne_klast. Ошибка всегда в сторону «положить лишнее», и МОЛЧА: строка
                    # «ИСКЛЮЧЕНО РАЗМЕТКОЙ» просто не печаталась бы.
                    # Не сработало только потому, что НА 20.09.2026 все 7 объявлений
                    # ne_klast_prichina были ЯВНЫМИ именами, а на явном пути glob скрытое
                    # возвращает. ⚠️ ЧИСЛО РАСТУЩЕЕ: объявлений станет больше, и первая же
                    # маска вида '.env*' или '*.key' увезла бы объявленное ненужным ИЛИ
                    # СЕКРЕТНЫМ в копию на Drive — молча. Проверять надо СОСТАВ объявлений
                    # на день чтения, а не верить этой семёрке.
                    najdeno_ = raskryt_ne_klast(put_)   # B-N-1431: «**» — свой обход без ссылок
                    if not najdeno_:
                        # 🔴 Объявление без совпадений раньше исчезало бесследно. У ОТБОРА
                        # это сказано (:350 «шаблон, совпадений нет»), у вычитания не было:
                        # «объявил и думает, что сработало». Та же немота, что лечили
                        # у сторожа покрытия.
                        ne_klast_pusto.append(f"{obr_} (агент {agent_})")
                    for r_ in najdeno_:
                        ne_klast_puti.add(os.path.abspath(r_))
            if ne_klast_pusto:
                log("⚠️ ОБЪЯВЛЕНО «не класть», но СОВПАДЕНИЙ НЕТ — вычитать нечего: "
                    + " · ".join(ne_klast_pusto))
            skipped_ne = set()
            # B-N-1433 (02.10.2026): путь кладётся в архив РОВНО ОДИН РАЗ. Корень est, лежащий под другим корнем
            # (в разметке iskra: klast «workspace» и ещё 40 путей внутри), прежде ложился второй раз — копия 02.10:
            # 22 938 путей дважды, 23 131 лишний член, ~0.80 ГБ. Учёт по положенному, а НЕ отбрасывание вложенного
            # корня заранее: родитель до вложенного может НЕ дойти (каталог-ссылка по пути — рекурсия по ссылкам не
            # спускается; вычтенный разметкой промежуточный каталог) — тогда вложенный обязан лечь сам, как прежде.
            polozheno = set()
            # B-N-1490: снимки SQLite — во временном каталоге рядом с архивом (тот же диск, что и копия).
            tmpdir_ = tempfile.mkdtemp(dir=str(dest.parent), prefix=".sqlite-snimki-")
            sqlite_snyato = [0, 0, 0.0]   # число снимков, самый большой (байт), суммарное время (с)
            sqlite_syroe = set()          # базы, у которых снимок не удался (лежат байтами с -wal/-shm)

            def add_path(source):
                source = os.path.abspath(source)
                if source in polozheno:
                    return   # B-N-1433: уже лёг (с родителем или своим корнем) — второй раз не кладём
                is_link = os.path.islink(source)
                candidates = [source] if is_link else [source, os.path.realpath(source)]
                for home in boundaries:
                    if any(x == home or x.startswith(home.rstrip("/") + "/") for x in candidates):
                        if home not in skipped:
                            skipped.add(home)
                            log(f"⚠️ дом {home} исключён из общего пути: агент не покрыт реестром")
                        return
                if vosstanovimyj_pycache(source, [os.path.abspath(p) for p in est]):
                    log(f"ВОССТАНОВИМЫЙ КЭШ ПРОПУЩЕН: {source}; исходники .py включены, заголовки pyc сверены")
                    return
                # 🔴 ВЫЧИТАНИЕ ne_klast_prichina (20.09.2026, #247). ТРЕТЬЕ использование
                # этой же точки — рядом стоят исключение непокрытых домов и восстановимого
                # кэша. Новое устройство НЕ заводится.
                # ЗАЧЕМ: без вычитания разметка описывает НЕ ТО, что делает сборщик —
                # исключения объявлены и не исполняются. Замер 20.09: 844 МБ объявленного
                # ненужным попадало в копию, и 17 пар «объявлен И класть, И не класть»
                # делали сумму ложной; сторож покрытия кричал «РАЗМЕТКА НЕНАДЁЖНА».
                # ⇒ Это позволяет класть КАТАЛОГ ЦЕЛИКОМ и вычитать названное, вместо
                # поимённого перечня подкаталогов, который слеп к новым ПО ПОСТРОЕНИЮ.
                if source in ne_klast_puti:
                    if source not in skipped_ne:
                        skipped_ne.add(source)
                        log(f"ИСКЛЮЧЕНО РАЗМЕТКОЙ: {source} — объявлено ne_klast_prichina")
                    return
                # B-N-1490: -wal/-shm SQLite-базы не кладём — её содержимое придёт снимком.
                # Решение по БАЗЕ, а не по порядку обхода: «x.db» может лечь и после «x.db-wal».
                for hvost_ in ("-wal", "-shm"):
                    baza_ = source[:-len(hvost_)]
                    if (source.endswith(hvost_) and not is_link and baza_ not in sqlite_syroe
                            and os.path.isfile(baza_) and not os.path.islink(baza_) and eto_sqlite(baza_)):
                        return
                if not is_link and os.path.isfile(source) and eto_sqlite(source):
                    try:
                        t0_ = time.monotonic()
                        snimok_ = snimok_sqlite(source, tmpdir_)
                        try:
                            ti_ = t.gettarinfo(source, arcname=source.lstrip("/"))
                            ti_.size = os.path.getsize(snimok_)
                            with open(snimok_, "rb") as fh_:
                                t.addfile(ti_, fh_)
                        finally:
                            os.remove(snimok_)
                        sqlite_snyato[0] += 1
                        sqlite_snyato[1] = max(sqlite_snyato[1], ti_.size)
                        sqlite_snyato[2] += time.monotonic() - t0_
                        polozheno.add(source)
                        return
                    except Exception as e_:
                        # Снимок не удался — кладём байтами как раньше, ВМЕСТЕ с -wal/-shm.
                        log(f"⚠️ SQLite: снимок не удался, база положена байтами (без гарантии целостности): {source}: {e_}")
                        sqlite_syroe.add(source)
                # Исключение ДО gettarinfo: tarfile запоминает inode ещё до filter.
                # Иначе последующая разрешённая hardlink может сослаться на невключённый файл.
                t.add(source, arcname=source.lstrip("/"), recursive=False)
                polozheno.add(source)
                if source in sqlite_syroe:
                    for hvost_ in ("-wal", "-shm"):
                        if os.path.isfile(source + hvost_) and not os.path.islink(source + hvost_):
                            t.add(source + hvost_, arcname=(source + hvost_).lstrip("/"), recursive=False)
                            polozheno.add(source + hvost_)
                if not is_link and os.path.isdir(source):
                    for child in sorted(os.listdir(source)):
                        add_path(os.path.join(source, child))
            try:
                for p in est:
                    add_path(p)
            finally:
                shutil.rmtree(tmpdir_, ignore_errors=True)
            log(f"SQLite: снято снимком {sqlite_snyato[0]}, самый большой {sqlite_snyato[1] / 1e6:.1f} МБ, "
                f"время снимков {sqlite_snyato[2]:.1f} с; байтами (снимок не удался) {len(sqlite_syroe)}")
            if not t.getnames():
                fail(4, "после исключения непокрытых домов в архиве нет источников")
            if "backup-coverage.json" in t.getnames():
                fail(4, "источник конфликтует с именем манифеста backup-coverage.json")
            # B-N-1611: снимок ACL — ДО манифеста (манифест несёт его число); имя проверяется так же.
            if ACL_FAJL in t.getnames():
                fail(4, f"источник конфликтует с именем снимка ACL {ACL_FAJL}")
            acl_ = snyat_acl(polozheno)
            if ACL_SNIMOK.get("oshibka") is None:
                ti_acl = tarfile.TarInfo(ACL_FAJL)
                ti_acl.size = len(acl_)
                ti_acl.mode = 0o600
                t.addfile(ti_acl, io.BytesIO(acl_))
            content = json.dumps(polnota_kopii(), ensure_ascii=False, indent=2).encode("utf-8")
            manifest = tarfile.TarInfo("backup-coverage.json")
            manifest.size = len(content)
            manifest.mode = 0o600
            t.addfile(manifest, io.BytesIO(content))
    except (OSError, tarfile.TarError) as e:
        fail(4, f"сборка не удалась: {e}")
    return dest


def proverit_arhiv(arh: Path, puti: list) -> None:
    """Проверка ПРЕДМЕТА, а не кода возврата.

    🔴 Грубым признаком, а не точным сравнением: предмет живой и растёт во время
    замера (Искра намерила +694 байта за минуту). Точное сравнение дало бы ложную
    тревогу на исправной копии — а ложная тревога хуже молчания, её перестают читать.
    """
    if not arh.exists() or arh.stat().st_size == 0:
        fail(4, "архив пуст или отсутствует — сборка не состоялась")
    try:
        with tarfile.open(arh, "r:gz") as t:
            vnutri = sum(1 for _ in t)
    except tarfile.TarError as e:
        fail(4, f"архив не читается обратно: {e}. Целость не доказана.")
    if vnutri == 0:
        fail(4, "архив собрался, но внутри ноль записей")
    log(f"архив: {arh.stat().st_size / 1048576:.1f} МБ, записей {vnutri}")


# ── ОТПРАВКА: прямыми запросами, без библиотеки google ───────────────────────
def pass_show(key: str) -> str:
    """Одна запись из хранилища. НИКОГДА не печатать значение — цена известна (24.08)."""
    env = dict(os.environ, PASSWORD_STORE_DIR=PASS_DIR)
    if os.geteuid() == 0 and KEY_OWNER:
        # 🔴 РАЗВЯЗКА ПРОТИВОРЕЧИЯ, найденного прогоном 25.08:
        #   записи из хранилища читает ТОЛЬКО владелец ключа (iskra);
        #   дом соседа /opt/dsh (750 dsh:dsh) она НЕ читает.
        # Под ней копию не собрать, под root секрет не взять — в лоб неразрешимо.
        # Решение: работаем от root (он читает оба дома), а за секретом ходим
        # к владельцу ключа. Проверено на живой машине.
        cmd = ["sudo", "-n", "-u", KEY_OWNER, "env", f"PASSWORD_STORE_DIR={PASS_DIR}",
               "pass", "show", key]
    else:
        cmd = ["pass", "show", key]
    r = subprocess.run(cmd, capture_output=True, text=True, timeout=60, env=env)
    if r.returncode != 0 or not r.stdout.strip():
        fail(5, f"запись «{key}» не читается из {PASS_DIR}"
                + (f" даже от имени {KEY_OWNER}" if os.geteuid() == 0 else
                   ". Запускать надо от root либо от владельца ключа"))
    return r.stdout.strip()


_UCHET = None  # (inst, refresh) последнего token(): повторное обновление без второго чтения хранилища


def _zaprosit_token(inst, refresh):
    import requests
    r = requests.post("https://oauth2.googleapis.com/token", timeout=60, data={
        "client_id": inst["client_id"], "client_secret": inst["client_secret"],
        "refresh_token": refresh, "grant_type": "refresh_token"})
    if r.status_code != 200:
        # Тело ответа НЕ печатаем целиком — там бывают отголоски учётных данных.
        return None, f"обновление токена отклонено: HTTP {r.status_code}"
    tok = r.json().get("access_token")
    if not tok:
        return None, "обновление прошло, но токена в ответе нет"
    return tok, None


def token() -> str:
    """Свежий токен диска: добываем обновлением, а не берём готовый.

    Готовый живёт час — скрипт с зашитым токеном проработал бы один раз.
    """
    global _UCHET
    client_json = pass_show(KEY_CLIENT)
    refresh = pass_show(KEY_REFRESH).splitlines()[0]
    try:
        inst = json.loads(client_json)["installed"]
    except (json.JSONDecodeError, KeyError) as e:
        fail(5, f"учётные данные приложения не разбираются ({KEY_CLIENT}): {e}")
    _UCHET = (inst, refresh)
    tok, prichina = _zaprosit_token(inst, refresh)
    if tok is None:
        fail(5, prichina)
    return tok


def token_dlya_rotacii():
    """A-N-1948 №4 (№3): свежий токен для ротации ПОСЛЕ выгрузки. Выгрузка идёт часами, а токен живёт 3600 с:
    прежде ротация брала токен, добытый до выгрузки, получала 401 и каждую ночь молча не чистила Drive.
    Отказ здесь — не отказ копии (она уже на Drive): предупреждение в журнал и None, без fail и без тревоги."""
    prichina = "учётные данные не добыты"
    if _UCHET is not None:
        try:
            tok, prichina = _zaprosit_token(*_UCHET)
        except Exception as e:
            tok, prichina = None, f"{type(e).__name__}"
        if tok:
            return tok
    log(f"⚠️ ротация не состоялась: свежий токен не получен ({prichina}) — старое НЕ удалено. "
        f"Это не отказ копии, но место будет расти.")
    return None


def srok_vygruzki():
    """B-N-762: момент (monotonic), к которому выгрузка обязана кончиться, и откуда он взят.
    Срок = старт процесса + TimeoutStartSec юнита − 600 с запаса на fail() и тревогу. Предел юнита читается у systemd:
    вне юнита или при нечитаемом ответе — BACKUP_SROK_SEK либо 3 ч − 10 мин, и это НАЗЫВАЕТСЯ в строке журнала."""
    yavno = os.environ.get("BACKUP_SROK_SEK")
    if yavno:
        return T0 + int(yavno), f"{int(yavno)} с от старта (BACKUP_SROK_SEK)"
    try:
        z = subprocess.run(["systemctl", "show", "sadik-backup.service", "-p", "TimeoutStartUSec", "--value"],
                           capture_output=True, text=True, timeout=10).stdout.strip()
        ed = {"d": 86400, "h": 3600, "min": 60, "s": 1, "ms": 0.001}
        chasti = re.findall(r"(\d+)\s*(d|h|min|ms|s)\b", z)
        sek = sum(int(n) * ed[e] for n, e in chasti)
        if chasti and sek > 1200:
            return T0 + sek - 600, f"TimeoutStartSec юнита {z} − 10 мин = {int(sek - 600)} с от старта"
    except Exception:
        pass
    return T0 + 10800 - 600, "3 ч − 10 мин от старта (предел юнита НЕ прочитан — умолчание)"


def otpravit(arh: Path, papka_id: str, tok: str) -> dict:
    # 🔴 B-N-739 (24.09): ПОТОКОМ, КУСКАМИ. Прежде — uploadType=multipart через requests files=: requests собирает
    # ВСЁ тело в памяти, и архив 22 955 МБ дал процессу 24,8 ГиБ anon-rss → глобальный OOM в 03:20Z, копии нет.
    # Теперь протокол resumable Drive: сеанс открывается метаданными, файл идёт кусками по 64 МиБ (кратно 256 КиБ),
    # в памяти — один кусок. Ответ 308 говорит, докуда дошло (Range) — следующий кусок с этого места.
    # Обрыв связи или 5xx — до 5 попыток куска, перед каждой спрашиваем сеанс, что уже принято.
    # Адрес сеанса (Location) и токен НЕ печатаем: по адресу сеанса можно дописать файл без токена.
    import requests
    import signal
    razmer = arh.stat().st_size
    KUSOK = 64 * 1024 * 1024
    kuskov = max(1, (razmer + KUSOK - 1) // KUSOK)
    # 🔴 B-N-762 (24.09): выгрузка встала на 2,8 ч без единой строки и умерла по TimeoutStartSec (SIGTERM минует fail()).
    # timeout= у requests — предел на ОПЕРАЦИЮ сокета, не на запрос: тело, принимаемое по капле, и DNS им не ограничены.
    # Поэтому каждый сетевой вызов — под будильником SIGALRM: предел на кусок и общий срок выгрузки, по исходу — fail().
    # Общий срок — ФОРМУЛОЙ от TimeoutStartSec юнита минус 10 мин запаса, а не числом: сменят предел юнита — срок поедет с ним.
    # ЧЕГО НЕ ЛОВИТ: зависание в C-вызове, который не отдаёт управление по сигналу (getaddrinfo с внутренними повторами) —
    # тогда останется убийство systemd и тревога OnFailure (B-N-741).
    predel_kuska = int(os.environ.get("BACKUP_KUSOK_SEK", "600"))
    srok, istochnik_sroka = srok_vygruzki()

    class Zavislo(Exception):
        pass

    def budilnik(signum, frame):
        raise Zavislo()

    signal.signal(signal.SIGALRM, budilnik)

    def pod_budilnikom(chto, fn, *a, **k):
        ostalos = srok - time.monotonic()
        if ostalos <= 0:
            fail(1, f"выгрузка не уложилась в общий срок ({istochnik_sroka}); последнее действие: {chto}")
        signal.setitimer(signal.ITIMER_REAL, min(predel_kuska, ostalos))
        try:
            return fn(*a, **k)
        finally:
            signal.setitimer(signal.ITIMER_REAL, 0)

    log(f"выгрузка: {razmer} Б, кусков {kuskov} по 64 МиБ; предел на запрос {predel_kuska} с; общий срок {istochnik_sroka}")
    meta = {"name": arh.name, "parents": [papka_id]}
    try:
        r = pod_budilnikom("открытие сеанса", requests.post,
        "https://www.googleapis.com/upload/drive/v3/files"
        "?uploadType=resumable&supportsAllDrives=true",
        headers={"Authorization": f"Bearer {tok}",
                 "Content-Type": "application/json; charset=UTF-8",
                 "X-Upload-Content-Type": "application/gzip",
                 "X-Upload-Content-Length": str(razmer)},
        data=json.dumps(meta), timeout=60)
    except Zavislo:
        fail(1, f"сеанс загрузки не открылся за {predel_kuska} с (нет ответа)")
    url = r.headers.get("Location")
    if r.status_code != 200 or not url:
        fail(1, f"сеанс загрузки не открыт: HTTP {r.status_code} {r.text[:200]}")
    sdvig, popytok = 0, 0

    def prinyato():
        # Что сеанс уже принял: PUT пустым телом с «bytes */размер».
        try:
            q = pod_budilnikom("запрос состояния сеанса", requests.put, url,
                               headers={"Content-Length": "0", "Content-Range": f"bytes */{razmer}"}, timeout=60)
        except Zavislo:
            fail(1, f"сеанс не ответил на запрос состояния за {predel_kuska} с (принято до {sdvig} из {razmer} Б)")
        if q.status_code in (200, 201):
            return None, q
        if q.status_code == 308:
            rng = q.headers.get("Range")
            return (int(rng.split("-")[1]) + 1 if rng else 0), None
        fail(1, f"сеанс загрузки не отвечает на запрос состояния: HTTP {q.status_code} {q.text[:200]}")

    with open(arh, "rb") as f:
        while sdvig < razmer:
            f.seek(sdvig)
            dannye = f.read(min(KUSOK, razmer - sdvig))
            dlina = len(dannye)
            konec = sdvig + dlina - 1
            nomer = sdvig // KUSOK + 1
            t_kuska = time.monotonic()
            try:
                r = pod_budilnikom(f"кусок {nomer} из {kuskov}", requests.put, url,
                                   headers={"Content-Length": str(len(dannye)),
                                            "Content-Range": f"bytes {sdvig}-{konec}/{razmer}"},
                                   data=dannye, timeout=600)
            except Zavislo:
                r = None
                oshibka = f"кусок не прошёл за {predel_kuska} с — нет ответа или приём по капле"
            except requests.RequestException as e:
                r = None
                oshibka = f"{type(e).__name__}"
            del dannye
            dt = time.monotonic() - t_kuska
            if r is not None and r.status_code in (200, 201):
                log(f"кусок {nomer} из {kuskov}: {dlina} Б за {dt:.1f} с — выгрузка завершена, {razmer} Б")
                return r.json()
            if r is not None and r.status_code == 308:
                rng = r.headers.get("Range")
                sdvig = int(rng.split("-")[1]) + 1 if rng else 0
                popytok = 0
                log(f"кусок {nomer} из {kuskov}: {dlina} Б за {dt:.1f} с ({dlina / max(dt, 0.001) / 1e6:.1f} МБ/с); принято {sdvig} из {razmer} Б")
                continue
            # Ограничение скорости — не отказ, а повод подождать (условие Вениамина 24.09): 429 и 403 с rateLimitExceeded /
            # userRateLimitExceeded в теле (так Drive отвечает на превышение частоты). Прочие 4xx — отказ с номером куска.
            skorost = r is not None and (r.status_code == 429 or (r.status_code == 403 and ("rateLimitExceeded" in r.text or "userRateLimitExceeded" in r.text)))
            if r is not None and r.status_code < 500 and not skorost:
                fail(1, f"кусок {sdvig}-{konec} отклонён: HTTP {r.status_code} {r.text[:200]}")
            popytok += 1
            log(f"кусок {nomer} из {kuskov}: попытка {popytok} не прошла ({oshibka if r is None else 'HTTP ' + str(r.status_code)}) за {dt:.1f} с")
            if popytok > 5:
                fail(1, f"кусок {sdvig}-{konec}: 5 попыток не прошли ({oshibka if r is None else 'HTTP ' + str(r.status_code)})")
            time.sleep(min(60, 2 ** popytok))
            novyj, gotovo = prinyato()
            if gotovo is not None:
                return gotovo.json()
            sdvig = novyj
    fail(1, f"загрузка дошла до конца файла ({razmer} байт), а сеанс не ответил 200/201")



# ── СКАЧИВАНИЕ: транспорт для ПРИЁМКИ, а не часть сборки ────────────────────
# 🔴 ЗАЧЕМ ЭТО ЗДЕСЬ, А НЕ ОТДЕЛЬНЫМ СКРИПТОМ (правка Искры 25.08).
# Приёмке нужен тот же токен и то же обновление по refresh, что и отправке. Второй
# экземпляр этого кода разошёлся бы с первым молча — мы это уже проходили на двух
# копиях модуля связи и на двух формах одной функции.
# 🔴 ГРАНИЦА, ЧТОБЫ НЕ ПРОЧЛОСЬ ШИРЕ: это НЕ приёмка. Приёмка — proverka-kopii.sh,
# отдельный инструмент, ничего не знающий о том, как архив собирался. Здесь только
# перевозка байтов обратно. Правило автора приёмки («тот, кто делает копию, не может
# её принимать») не нарушено: судит по-прежнему не этот файл.
def skachat(file_id: str, tok: str, dest: Path) -> int:
    import requests
    r = requests.get(
        f"https://www.googleapis.com/drive/v3/files/{file_id}"
        "?alt=media&supportsAllDrives=true",
        headers={"Authorization": f"Bearer {tok}"}, stream=True, timeout=1800)
    if r.status_code != 200:
        # Заголовки не печатаем — там токен.
        fail(1, f"скачивание отклонено: HTTP {r.status_code} {r.text[:200]}")
    # Внутри архива лежит закрытый БЕСПАРОЛЬНЫЙ ключ от всего хранилища — файл
    # закрываем ДО первого байта, а не после записи.
    fd = os.open(dest, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    n = 0
    with os.fdopen(fd, "wb") as f:
        for chunk in r.iter_content(chunk_size=1024 * 1024):
            n += len(chunk)
            f.write(chunk)
    # Канарейка пустоты: HTTP 200 с нулём байт — это успех транспорта и пустой предмет.
    # Пустой файл и дальше пройдёт как «скачано», а tar на нём скажет своё, не наше.
    if n == 0:
        fail(1, f"скачано 0 байт (HTTP 200) — предмет пуст, id {file_id}")
    rezhim = dest.stat().st_mode & 0o777
    if rezhim & 0o077:
        fail(4, f"скачанный архив остался с правами {rezhim:04o} — в нём закрытый ключ")
    return n


def skachat_cli(args: list) -> int:
    # Молчим в телеграм: см. TREVOZHIT выше. Отказ виден в журнале службы и в коде
    # возврата, а тревожить владельца — дело того, кто позвал скачивание.
    global TREVOZHIT
    TREVOZHIT = False
    if len(args) != 2:
        fail(2, "использование: sadik-backup.py --skachat <drive_id> <куда>")
    file_id, dest = args[0], Path(args[1])
    if not dest.parent.is_dir():
        fail(2, f"каталог назначения не существует: {dest.parent}")
    n = skachat(file_id, token(), dest)
    log(f"скачано {n} Б -> {dest}")
    return 0


def rotirovat(papka_id: str, tok: str) -> None:
    """Убрать свои старые копии, оставив RETAIN штук. ОТБОР ПО КОНТЕЙНЕРУ.

    🔴 ПЕРЕДЕЛАНО 25.08 13:4x: было «отбор по маске имени», стало «отбор по `parents`
    своей подпапки». Решение главной по доводу Искры, и довод сильнее прежнего:
    СОГЛАШЕНИЕ ОБ ИМЕНАХ ПРОВЕРЯЕМО ТОЛЬКО С ОДНОЙ СТОРОНЫ. Её замер по данным общей
    папки: маска `aclaude-*` ловит 4 из 5, `*sadik*` — 4 из 5, `*.tar.gz` — 4 из 5;
    три РАЗНЫЕ маски по этим данным НЕОТЛИЧИМЫ, а имя `sadik-*` попадает под две из трёх.
    Односторонне проверяемое соглашение — не разведение, а надежда.
    Контейнер убирает пересечение масок как КЛАСС, а не прикрывает его предохранителем.

    Порядок рубежей: (1) `parents` своей подпапки — сюда чужая цепь не пишет;
    (2) приставка имени — на случай, если в подпапку что-то попадёт извне;
    (3) остановка при неожиданном имени вместо удаления.
    """
    import requests
    # A-N-1948 №4 (№5): листаем до исчерпания nextPageToken. Прежде бралась одна страница (pageSize=100): при >100
    # объектах старшие за первой страницей в fajly[RETAIN:] не попадали и не удалялись никогда. Предел — 50 страниц
    # (5000 объектов): больше — ротация остановлена без удаления, а не цикл без конца.
    vse, stranica = [], None
    for _ in range(50):
        params = {"q": f"'{papka_id}' in parents and trashed=false",
                  "orderBy": "createdTime desc",
                  "fields": "nextPageToken,files(id,name,createdTime)",
                  "supportsAllDrives": "true",
                  "includeItemsFromAllDrives": "true", "pageSize": "100"}
        if stranica:
            params["pageToken"] = stranica
        r = requests.get("https://www.googleapis.com/drive/v3/files", timeout=120,
                         headers={"Authorization": f"Bearer {tok}"},
                         # 🔴 `name contains` УБРАН НАМЕРЕННО: отбор идёт по контейнеру.
                         # Вхождение несимметрично (`sadik-` сидит в `aclaude-sadik-`), и
                         # проверить его можно только со своей стороны. `parents` симметричен.
                         params=params)
        if r.status_code != 200:
            log(f"⚠️ ротация не состоялась: HTTP {r.status_code} — старое НЕ удалено. "
                f"Это не отказ копии, но место будет расти.")
            return
        j = r.json()
        vse += j.get("files", [])
        stranica = j.get("nextPageToken")
        if not stranica:
            break
    else:
        log("⚠️ ротация ОСТАНОВЛЕНА: в подпапке больше 50 страниц объектов — старое НЕ удалено, проверить руками.")
        return
    # История прежнего рубежа сохранена, потому что объясняет, ПОЧЕМУ его мало:
    # зеркальная проба 25.08 показала, что `name contains 'sadik-'` утягивает файлы
    # соседней цепи (`aclaude-sadik-*` содержат `sadik-` подстрокой). Вхождение —
    # родственник grep без якоря: находит там, где не просили, и молчит об этом.
    # Отбор Drive умеет только `contains`, отсюда и была ручная отсечка по началу имени.
    # Теперь это ВТОРОЙ рубеж: первый — контейнер, он несимметричности лишён.
    # Подпапок в своей папке не ждём, но если появятся — не считаем их своими копиями.
    fajly = [f for f in vse if f["name"].startswith(PRISTAVKA)]
    otseyano = len(vse) - len(fajly)
    if otseyano:
        # 🔴 Это НЕ рядовая новость: в своей подпапке чужому имени взяться неоткуда.
        # Либо кто-то пишет к нам, либо приставку сменили и старые копии осиротели —
        # осиротевшие лежат вечно, занимают место и ИЗОБРАЖАЮТ актуальные копии.
        log(f"⚠️ в своей подпапке {otseyano} объект(ов) с чужой приставкой — "
            f"проверить руками: либо чужая запись, либо приставку сменили и старое осиротело")
    if not fajly and vse:
        log("⚠️ ротация ОСТАНОВЛЕНА: в подпапке есть объекты, но НИ ОДИН не наш по "
            "приставке. Похоже на смену приставки или чужую папку — чинить, не удалять.")
        return
    # 🔴 ПРАВИЛО ОБЩЕГО ХРАНИЛИЩА, куплено случаем 25.08: соседняя цепь удалила
    # ЧУЖОЙ пробный файл, отобрав его запросом `name contains 'PROBA'`.
    # (1) Удалять только по идентификатору, полученному от СВОЕЙ операции —
    #     создания или листинга своего контейнера. Отбор по имени для удаления
    #     не применять никогда, даже «чтобы подчистить за собой».
    # (2) Остаток в списке — НЕ доказательство, что твоё удаление не прошло.
    #     Там удаление прошло, а остатком был чужой файл; объяснение достроили
    #     вместо сверки. Сверяй идентификаторы, а не счётчик.
    lishnie = fajly[RETAIN:]
    for f in lishnie:
        d = requests.delete(f"https://www.googleapis.com/drive/v3/files/{f['id']}",
                            timeout=60, headers={"Authorization": f"Bearer {tok}"},
                            params={"supportsAllDrives": "true"})
        if d.status_code in (200, 204):
            log(f"убрана старая копия: {f['name']}")
        else:
            log(f"⚠️ не удалось убрать {f['name']}: HTTP {d.status_code}")


def rotirovat_lokalno(tekushchij: Path) -> None:
    """Оставить на локальной полке RETAIN_LOCAL своих архивов (B-N-740). Зовётся после удачной выгрузки и после отказа выгрузки (B-N-762).
    Трогает только обычные файлы «PRISTAVKA*.tar.gz» в LOCAL_DIR; порядок — по имени (в имени штамп ГГГГ-ММ-ДД-ЧЧММ);
    текущий архив не удаляется НИКОГДА, даже если по имени он не в числе новых. Чужие имена не трогает и не считает.
    ГРАНИЦА: полка — не копия (тот же диск); это место, а не сохранность. Сохранность — Drive (RETAIN)."""
    if RETAIN_LOCAL < 1:
        log(f"⚠️ локальная ротация ОСТАНОВЛЕНА: BACKUP_RETAIN_LOCAL={RETAIN_LOCAL} — меньше одного не держим, ничего не удалено")
        return
    svoi = sorted((f for f in LOCAL_DIR.iterdir()
                   if f.name.startswith(PRISTAVKA) and f.name.endswith(".tar.gz") and f.is_file() and not f.is_symlink()),
                  key=lambda f: f.name, reverse=True)
    for f in svoi[RETAIN_LOCAL:]:
        if f.resolve() == tekushchij.resolve():
            log(f"⚠️ текущий архив {f.name} по имени вне {RETAIN_LOCAL} новых — НЕ удаляю (проверь часы/имена)")
            continue
        razmer = f.stat().st_size
        f.unlink()
        log(f"убран локальный архив: {f.name} ({razmer / 1048576:.1f} МБ)")


def sostav_cli() -> int:
    """Read-only source roots and declared exclusions, not a tar member list."""
    global TREVOZHIT
    TREVOZHIT = False
    d = sostav()
    puti = sobrat_puti(d)
    est, net, zapret = raskryt_puti(puti)
    for source in net:
        propusk(source, "в реестре есть, на диске нет")
    for source in zapret:
        propusk(source, "нет доступа к источнику")
    print("СОСТАВ ИСТОЧНИКОВ: без архива, чтения содержимого и выгрузки")
    for source in est:
        print("ИСТОЧНИК " + json.dumps(source, ensure_ascii=False))
    for agent, home in d["doma"].items():
        for pattern, reason in (d["komnaty"][agent].get("ne_klast") or {}).items():
            print("ИСКЛЮЧЕНИЕ " + json.dumps({"шаблон": str(Path(home) / pattern),
                                                  "причина": reason}, ensure_ascii=False))
    for home in NEPOKRYTYE_DOMA:
        print("ИСКЛЮЧЁН ДОМ " + json.dumps(home, ensure_ascii=False))
    print(f"ИТОГ: объявлений {len(puti)}, выбранных источников {len(est)}, "
          f"пропусков {len(PROPUSHCHENO)}, непокрытых агентов {len(NEPOKRYTYE)}")
    print("ГРАНИЦА: корни источников, не рекурсивный перечень архива; "
          "ne_klast и восстановимые pycache применяются при сборке; "
          "читаемость содержимого и свободное место здесь не проверяются")
    return 4 if PROPUSHCHENO or NEPOKRYTYE or not est else 0


def main() -> int:
    stamp = datetime.now(timezone.utc).strftime("%Y-%m-%d-%H%M")
    d = sostav()
    puti = sobrat_puti(d)
    log(f"состав из реестра: {len(puti)} путей")

    # 🔴 ПРАВКА ИСКРЫ 25.08, ДО ПЕРВОГО ПРОГОНА ПО РАСПИСАНИЮ. Замер на живом:
    # каталог создавался 0755, архив 0644 — и `nobody`, и посторонний пользователь
    # машины ЧИТАЛИ его. А внутри лежит `opt/iskra/.gnupg` целиком, включая закрытый
    # БЕСПАРОЛЬНЫЙ ключ, которым открываются все 263 записи хранилища.
    # На диске тот же ключ защищён 0700/0600. То есть копия СНИМАЛА защиту с того,
    # что копирует, — механизм защиты производил ровно тот вред, от которого бережёт.
    # umask мало: он не трогает уже существующий каталог. Поэтому chmod явно и каждый раз.
    LOCAL_DIR.mkdir(parents=True, exist_ok=True)
    os.chmod(LOCAL_DIR, 0o700)
    os.umask(0o077)
    arh = LOCAL_DIR / f"{PRISTAVKA}{stamp}.tar.gz"
    sobrat(puti, arh, d)
    os.chmod(arh, 0o600)
    # Проверяем ФАКТ, а не намерение: chmod мог не отработать (чужой владелец, ФС
    # без прав). Копия, доступная посторонним, хуже отсутствия копии — она молча
    # раздаёт ключ от всего хранилища.
    rezhim = arh.stat().st_mode & 0o777
    if rezhim & 0o077:
        fail(4, f"архив {arh} остался с правами {rezhim:04o} — в нём закрытый ключ, "
                f"а читать его может посторонний. Собран, но НЕ отправлен.")
    proverit_arhiv(arh, puti)
    # Снимок состава архива: последующая ротация не меняет уже упакованные байты.
    pokrytie = polnota_kopii()

    if DRY:
        log("DRY=1 — не отправляю, архив оставлен на месте")
        svodka_polnoty(pokrytie)
        return 0

    papka = papka_na_diske()
    tok = token()
    # B-N-762 (24.09): полку чистим и при ОТКАЗЕ выгрузки. Прежде ротация шла только после удачи, и при медленном
    # выходе (awg3 ~1 МБ/с) каждая неудача клала на полку +13–22 ГиБ без предела — диск кончился бы раньше Drive.
    # Архив каждой ночи ПОЛНЫЙ: новые 3 на полке заменяют старые; удаляемое старшее либо уже на Drive, либо перекрыто
    # более новым полным. ⚠️ Граница: ночь, не доехавшая до Drive и вытесненная тремя более новыми, теряет единственный
    # экземпляр своего среза. Текущий архив не удаляется никогда (rotirovat_lokalno). Отметку и тревогу не трогаем.
    try:
        info = otpravit(arh, papka, tok)
    except SystemExit:
        try:
            rotirovat_lokalno(arh)
        except OSError as e:
            log(f"⚠️ локальная ротация после отказа выгрузки сорвалась: {e} — полка НЕ почищена")
        raise
    log(f"уехало: {info.get('id')}")

    # ── РОТАЦИЯ: ТОЛЬКО СВОЙ КОНТЕЙНЕР ──────────────────────────────────────
    # 🔴 Повод (не про аккуратность): пока жива временная цепь с aclaude, рядом работают
    # ДВЕ ротации. Если каждая чистит по своему счётчику одно и то же место, они молча
    # удаляют данные друг у друга — и видит это только тот, кто сверит сами файлы.
    # 🔴 ПЕРЕДЕЛАНО 25.08 13:4x: разведение по КОНТЕЙНЕРУ, а не по имени. Эта цепь пишет
    # в свою подпапку и ротирует по её `parents`. Прежняя строка «отбор строго по своей
    # маске sadik-» была ВЕРНА по замыслу и слаба по устройству, и слабость доказана
    # замером, а не рассуждением: имя `sadik-*` попадает под две чужие маски из трёх.
    # ⚠️ `papka` обязана быть подпапкой ЭТОЙ цепи, а не общей папкой машины. Дашь общую —
    # ротация начнёт видеть чужие архивы как содержимое своего контейнера.
    tok_r = token_dlya_rotacii()
    if tok_r:
        # A-N-1948 №4 (находка вне №1, слово Забавы 09:30Z): копия уже на Drive — сбой ротации (сеть, ответ не JSON) не
        # роняет main() до отметки. Прежде исключение requests здесь давало failed и тревогу «копия не сделана».
        try:
            rotirovat(papka, tok_r)
        except Exception as e:
            log(f"⚠️ ротация не состоялась: {type(e).__name__}: {str(e)[:120]} — старое НЕ удалено (убранное до сбоя — "
                f"строки «убрана старая копия» выше). Это не отказ копии, но место будет расти.")

    # A-N-1948 №4 (№4): каталог отметки создаём 0755 явно — umask 077 (выше) сделал бы его 0700, и отметку 0644
    # (наблюдаемость не-root, см. ниже) никто, кроме root, не прочёл бы. Промежуточные каталоги, созданные здесь же,
    # тоже 0755 (LOW Вениамина: mkdir(parents=True) делает их 0700). Существующие каталоги не трогаем.
    novye = [k for k in (STATE.parent, *STATE.parent.parents) if not k.exists()]
    STATE.parent.mkdir(parents=True, exist_ok=True)
    for k in novye:
        os.chmod(k, 0o755)
    STATE.write_text(json.dumps({
        "stamp": stamp, "name": arh.name, "size_bytes": arh.stat().st_size,
        "drive_id": info.get("id"),
        "completed_at": datetime.now(timezone.utc).isoformat(),
        # 🔴 ПОЛНОТА ЖИВЁТ В ОТМЕТКЕ, А НЕ В КОДЕ ВОЗВРАТА. Код 3 сделал бы службу
        # «упавшей» (SuccessExitStatus в юните не задан), и человек получил бы тревогу
        # «копия не сделана» при собранной копии — ровно та ложная тревога, которую я
        # уже устраивала владельцу 25.08. Состояние живёт в предмете: отметку читает
        # сторож свежести, и поле остаётся, когда код возврата давно съеден.
        # 🔴 ТОЛЬКО ЧИСЛО, БЕЗ СПИСКА. Отметку разбирают ДВА потребителя, и один из них —
        # healthcheck реестра — читает её `sed`-выражением по ключу ("name", "completed_at").
        # Список сообщений мог бы содержать текст, похожий на ключ, и sed напечатал бы два
        # совпадения вместо одного — разбор у соседа сломался бы молча. Мой же класс:
        # «правка формата у одного ломает разбор у другого». Сам список идёт в журнал и в
        # тревогу, где его читает человек, а не выражение.
        "propushcheno": len(pokrytie["propushcheno"]),
        # Скалярные поля сохраняют совместимость прежних читателей отметки.
        # Имена/причины — в журнале и backup-coverage.json ВНУТРИ архива.
        "polnaya": pokrytie["polnaya"],
        "nepokryto_agentov": len(NEPOKRYTYE),
    }, ensure_ascii=False, indent=2))
    # 🔴 ПОПРАВКА ИСКРЫ К СВОЕЙ ЖЕ ПРАВКЕ, 25.08, через 10 минут после неё.
    # Сперва поставила 0600 «на всякий случай» — и первая же проверка живости ответила
    # СЛЕПОТОЙ: отметку не читает никто, кроме root, а живость гоняют и владелец, и стенды.
    # Довод «отметка говорит, где лежит архив» оказался пустым: путь виден в юните, а сам
    # каталог закрыт 0700. Секретов в отметке нет — время, имя, размер, id на Drive.
    # Осторожность, которая ничего не бережёт, но гасит наблюдаемость, — не осторожность.
    # 🔴 ВТОРАЯ ПОПРАВКА, И ОНА ТОЖЕ ПО ЗАМЕРУ. Пробовала 0640 с группой agent-secrets —
    # проверка живости всё равно ответила слепотой. Причина не в правах файла: группа
    # заведена 24.08, а живые процессы агента подняты раньше, и НАБОР ГРУПП ФИКСИРУЕТСЯ
    # ПРИ ЗАПУСКЕ. `sg agent-secrets` читает (новый процесс), живой процесс — нет.
    # Значит группой наблюдаемость не вернуть, пока службы не перезапущены.
    # Ставим 0644 осознанно: в отметке нет ни ключа, ни значения — время, имя, размер
    # и id файла на Drive, бесполезный без токена. Сам архив закрыт 0600 в каталоге 0700.
    # Дважды закрывала лишнее и дважды гасила проверку: осторожность, которая ничего
    # не бережёт, но делает механизм ненаблюдаемым, — не осторожность.
    os.chmod(STATE, 0o644)

    # B-N-740: локальная полка чистится ПОСЛЕ отметки. Сорвись она раньше — отметки нет, и сторож
    # свежести поднял бы «копия не сделана» при копии, которая уже на Drive. Срыв — предупреждение, не отказ.
    try:
        rotirovat_lokalno(arh)
    except OSError as e:
        log(f"⚠️ локальная ротация сорвалась: {e} — копия на Drive цела, полка НЕ почищена")

    # 🔴 СВОДКА ПРОПУЩЕННОГО — ПОСЛЕ УСПЕШНОЙ СБОРКИ, И ЭТО НЕ ПРОТИВОРЕЧИЕ.
    # Копия собрана и уехала: ронять нечего и незачем. Но «собрана» и «полна» — разные
    # утверждения, и до сих пор второе никто не произносил вслух. Молчание здесь читалось
    # как полнота.
    # Тревога отдельная от «копия не сделана»: у неё другое лечение — не пересобрать, а
    # разобраться, почему источник пропал. Слить их значило бы учить не читать тревоги.
    svodka_polnoty(pokrytie)
    return 0


if __name__ == "__main__":
    # B-N-1240: dispatch before backup diagnostics, credentials or archive creation.
    if sys.argv[1:2] == ["--sostav"]:
        TREVOZHIT = False
        if len(sys.argv) != 2:
            fail(2, "использование: sadik-backup.py --sostav (без других доводов)")
        sys.exit(sostav_cli())
    _check_alert_contract()  # Diagnostic only: drift must not disable backup or alerts.
    # Разбор нарочно беден: у этого инструмента ровно два дела — собрать копию
    # и привезти её обратно. Неизвестный ключ — отказ, а не молчаливая сборка:
    # опечатка в имени режима не должна оборачиваться боевым прогоном.
    if len(sys.argv) > 1:
        if sys.argv[1] == "--skachat":
            sys.exit(skachat_cli(sys.argv[2:]))
        TREVOZHIT = False   # опечатка в ключе — не повод будить человека
        fail(2, f"неизвестный ключ: {sys.argv[1]}. Есть --sostav или --skachat <id> <куда>")
    sys.exit(main())
