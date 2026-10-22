#!/bin/bash
# Приёмка копии машины — проверка ДЕЙСТВИЕМ, а не сверкой списков.
#
# Написал Михалыч (server/aclaude) 25.08.2026 после того, как наша копия sadik
# двое суток выглядела полной и НЕ СОДЕРЖАЛА ХРАНИЛИЩА СЕКРЕТОВ ВОВСЕ.
# Ключ в ней лежал, а открывать им было нечего.
#
# 🔴 ПОЧЕМУ ЭТО ОТДЕЛЬНЫЙ ИНСТРУМЕНТ, А НЕ ШАГ ВНУТРИ СКРИПТА КОПИИ
# Тот, кто делает копию, не может её принимать: он проверит ровно то, что сам положил,
# и его слепое пятно перейдёт в проверку целиком. Здесь проверка идёт СНАРУЖИ — от
# скачанного архива, ничего не зная о том, как он собирался.
#
# 🔴 ЧЕМУ ЭТОТ ИНСТРУМЕНТ НЕ ВЕРИТ
# Не «файл на месте» и не «tar не ругнулся». Единственный принимаемый довод — секрет
# ИЗ КОПИИ открылся ключом ИЗ КОПИИ. Всё остальное — подготовка.
# Сверка составов сравнивает ПРЕДСТАВЛЕНИЕ о механизме со списком. Она делалась трижды
# и трижды не увидела пустое хранилище: мерила не тот вопрос.
#
# 🔴 КОНТРОЛЬ ЗРЯЧЕСТИ ОБЯЗАТЕЛЕН
# После успешной расшифровки тот же файл пробуется в ПУСТОМ хранилище ключей. Если и там
# откроется — значит сработал ключ из окружения, и первый успех ничего не доказывает.
# Проверка без контроля зрячести — это проверка, которая не умеет провалиться.
#
# ЗНАЧЕНИЯ СЕКРЕТОВ НЕ ПЕЧАТАЮТСЯ НИКОГДА. Только длина. 24.08 обрезка вывода на глаз
# уже стоила утечки токена: она защищает, только если знать длину секрета заранее.
#
# 🔴 ПРАВКИ ИСКРЫ 25.08.2026 (хозяйка машины), три, каждая по замеру:
#   1. Пути ключа и хранилища берутся ИЗ РЕЕСТРА, а не своими переменными.
#      Автор назвал их своим списком внутри потребителя и не стал чинить в чужом
#      реестре — правильно. Причина оказалась не в нём: в реестре путь ключа
#      существовал только КОММЕНТАРИЕМ, машине он был не виден. Заведено поле
#      mashina.klyuch_gpg и подкоманда `agent-registry mashina`.
#   2. Длина мерилась как `--decrypt | head -1 | wc -c`. ЗАМЕР: секрет, чья первая
#      строка пуста, открывается целиком (2 строки), а инструмент говорит «ключ
#      не открывает секрет» — ЛОЖНО-КРАСНОЕ на исправной копии. Теперь берётся
#      код возврата gpg и длина всего значения; значение живёт в переменной
#      оболочки и на диск не ложится.
#   3. Проверялась ОДНА запись (find | head -1). ЗАМЕР: все 263 расшифровываются
#      за 1954 мс — то есть полная проверка стоит две секунды. Копия, где уцелел
#      один секрет из 263, прежнюю проверку проходила.
#
# ИСПОЛЬЗОВАНИЕ:  proverka-kopii.sh <архив.tar.gz>
#
# КОДЫ: 0 — полный профиль пройден | 1 — выявлена негодность | 2 — заключения нет | 8 — пройден только частичный профиль
#       3 — профиль пройден, но образцов разметки нет ни в копии, ни на машине (неполна по составу, B-N-2101)
set -uo pipefail
DECLARED_CODE=""
RAB=""
ARH="не задан"
zavershit() { DECLARED_CODE="$1"; exit "$1"; }
itog_proverki() {
  local raw=$? code verdict
  trap - EXIT
  code="${DECLARED_CODE:-2}"
  case "$code" in 0) verdict=passed;; 1) verdict=failed;; 3) verdict=incomplete;; 8) verdict=partial;; *) code=2; verdict=unknown;; esac
  [ -n "$RAB" ] && ubrat
  if [ -z "$DECLARED_CODE" ]; then printf 'СЛЕПОТА: неожиданный выход raw_rc=%s, предмет=%q\n' "$raw" "$ARH"; fi
  printf 'VERIFY_RESULT verdict=%s checkpoint=not_applicable notification=not_required code=%s предмет=%q\n' "$verdict" "$code" "$ARH"
  exit "$code"
}
trap itog_proverki EXIT
TOLKO_SEKRETY=0
KOPIYA_SNYATA=""
SNYATA_ZADANA=0
ARGS=()
ZHDU_ZNACHENIE=""
for a in "$@"; do
  if [ -n "$ZHDU_ZNACHENIE" ]; then KOPIYA_SNYATA="$a"; ZHDU_ZNACHENIE=""; continue; fi
  case "$a" in
    --tolko-sekrety) TOLKO_SEKRETY=1 ;;
    # Время снятия копии НЕ УГАДЫВАЕТСЯ по mtime архива: после скачивания с Drive
    # он свежий, и угадывание дало бы уверенное враньё. Кто знает — тот и говорит.
    --kopiya-snyata) SNYATA_ZADANA=1; ZHDU_ZNACHENIE=1 ;;
    -*) echo "неизвестный ключ: $a" >&2; zavershit 2 ;;
    *) ARGS+=("$a") ;;
  esac
done
if [ -n "$ZHDU_ZNACHENIE" ]; then echo "--kopiya-snyata требует значение (ISO8601)" >&2; zavershit 2; fi
set -- "${ARGS[@]}"
if [ "$#" -ne 1 ] || [[ ! "${1-}" =~ [^[:space:]] ]]; then
  echo "СЛЕПОТА: нужен один непустой путь архива" >&2; zavershit 2
fi
ARH="$1"
[ -f "$ARH" ] || { echo "СЛЕПОТА: нет файла архива $ARH" >&2; zavershit 2; }
if [ "$SNYATA_ZADANA" = 1 ]; then
  python3 - "$KOPIYA_SNYATA" <<'PYDATE' || zavershit 2
import datetime,sys
try:
 s=sys.argv[1]; t=datetime.datetime.fromisoformat(s.replace('Z','+00:00'))
 if t.tzinfo is None: raise ValueError('нет часового пояса')
except Exception:
 print('СЛЕПОТА: --kopiya-snyata требует дату ISO8601 с часовым поясом',file=sys.stderr);sys.exit(2)
PYDATE
fi
CHITATEL="${CHITATEL:-/usr/local/bin/agent-registry}"
for tool in python3 gzip tar mktemp find chmod cp gpg grep wc sort date stat awk sed cut du rm; do
  command -v "$tool" >/dev/null 2>&1 || { echo "СЛЕПОТА: недоступен прибор $tool, предмет=$ARH" >&2; zavershit 2; }
done

# ── Пути берутся из реестра машины. Своего списка здесь нет и быть не должно:
# где лежит ключ и где хранилище — свойство МАШИНЫ, а не свойство проверки.
# Реестр молчит или неполон -> ОТКАЗ 2 «проверка не состоялась». Умолчания тут
# опаснее отсутствия: подставив свой путь, инструмент сказал бы «ключа в копии
# нет» — то есть вынес бы приговор КОПИИ по дефекту РЕЕСТРА.
if ! REESTR_JSON=$("$CHITATEL" mashina --json 2>&1); then
  echo "ОТКАЗ: реестр не отдал раздел mashina — проверка не состоялась" >&2
  echo "$REESTR_JSON" | sed 's/^/    /' >&2
  zavershit 2
fi
put_iz_reestra() {  # $1 — имя поля; печатает путь БЕЗ ведущего слэша (как в tar)
  printf '%s' "$REESTR_JSON" | python3 -c "
import json,sys
d=json.load(sys.stdin)
v=d.get('$1') or ''
sys.stdout.write(str(v).lstrip('/'))
" 2>/dev/null
}
KLYUCH_PUT=$(put_iz_reestra klyuch_gpg)
SEKRETY_PUT=$(put_iz_reestra hranilishche_sekretov)
if [ -z "$KLYUCH_PUT" ] || [ -z "$SEKRETY_PUT" ]; then
  echo "ОТКАЗ: реестр не дал путей (ключ='$KLYUCH_PUT' хранилище='$SEKRETY_PUT')" >&2
  zavershit 2
fi
echo "пути из реестра: ключ /$KLYUCH_PUT | хранилище /$SEKRETY_PUT"
# 🔴 ГРАНИЦА: ведущий слэш снят потому, что архив собран ОТ КОРНЯ (tar -C /).
# Соберёт сборщик иначе — пути не найдутся, и инструмент скажет «ключа нет».
# Это отказ про ФОРМАТ архива, а не про его полноту; проверять первым же
# настоящим архивом, а не считать доказанным.

RAB=$(mktemp -d) || { echo "ОТКАЗ: нет места для распаковки" >&2; zavershit 2; }
ubrat() {
  # Ключ ложится с правами только на чтение — обычное удаление его не берёт.
  # 🔴 u+rwX, а не u+w: gpg заводит openpgp-revocs.d режимом drw------- — БЕЗ бита x.
  # В такой каталог нельзя войти, значит нельзя удалить и его содержимое, хотя владелец
  # свой. Заглавная X даёт x только каталогам и уже исполняемым файлам, обычных не портит.
  # Замерено 25.08: без этого приёмка оставляла в /tmp по каталогу за прогон — 11 штук
  # накопилось молча, потому что отказ rm уходил в /dev/null (долг 40).
  chmod -R u+rwX "$RAB" 2>/dev/null || true
  rm -rf "$RAB" 2>/dev/null || true
  # Молчаливая неудача уборки и была причиной накопления: механизм, копящий в общем
  # каталоге, обязан сказать об этом, иначе его не с чего заметить.
  [ -e "$RAB" ] && echo "⚠️ уборка не удалась: $RAB остался" >&2
  return 0
}
# Уборку вызывает общий EXIT trap, не стирая исход проверки.

[ -f "$ARH" ] || { echo "ОТКАЗ: нет архива $ARH" >&2; zavershit 2; }
echo "проверяю: $ARH ($(du -h "$ARH" | cut -f1))"

# ── 1. Читаем ПОТОКОМ, целиком, НЕ разворачивая ──────────────────────────────
# 🔴 B-H-1427 (C2, 02.10.2026, Заря): было `tar xzf` ВСЕГО архива в mktemp на корне. 02.10 архив 27,4 ГБ разворачивался
# в 38,4 ГБ: пик приёмки S + 1,4·S опустил корень до 4–5 %, а предохранитель места (8b1ec110) с тех пор не пускал копии
# больше ~13 ГБ. Теперь архив читается ПОТОКОМ один раз и до конца (gzip -dc сверяет CRC; tar разбирается целиком;
# после метки конца поток дочитывается). На диск ложится только то, что проверяется: каталог ключа, хранилище,
# патчи профилей, манифест — и каждая база на время своей проверки (вместе с -wal/-shm/-journal её каталога).
# Для наличия (состав, подключения) пишется указатель всех членов .indeks.json; ответ его тот же, что os.path.exists
# на распакованном дереве (см. .indeks.py). Пик места: S + самая большая группа баз одного каталога + указатель.
# ⚠️ НЕ ЛОВИТ ИНАЧЕ, ЧЕМ ПРЕЖДЕ: базу, чьи -wal/-shm пришли в потоке ВНЕ её каталога (не обход в глубину) — она
#    проверяется без них; жёсткую ссылку на неизвлечённый член, нужную проверке, — это слепота (2), а не довод.
cat > "$RAB/.potok.py" <<'PYPOTOK'
#!/usr/bin/env python3
# B-H-1427 (C2): поток вместо распаковки. Читает tar со stdin (gzip снимает вызывающий: `gzip -dc | potok.py`), ДО КОНЦА.
# Пишет в RAB только то, что проверяют (ключ, хранилище, патчи профилей, манифест, базы — каждая на время своей проверки),
# и указатель всех членов RAB/.indeks.json. Коды: 0 — поток прочитан; 3 — tar не читается; 4 — вложенный архив не читается;
# 5 — нужен член, которого не достать (жёсткая ссылка на неизвлечённое, путь вне RAB); 6 — в архиве член, ведущий вне
# корня распаковки (абсолютный путь, «..», путь через ссылку архива, ссылка выше корня) — архив негоден.
import collections, gzip, json, os, shutil, sqlite3, sys, tarfile

rab, kl, sek = sys.argv[1], sys.argv[2].strip('/'), sys.argv[3].strip('/')
indeks, bazy, slepye = {}, {}, []
opasnye, ssylki = [], set()  # A-N-1948 №4 (№1): члены, ведущие вне корня; имена членов-ссылок архива
raskryto_db = {}          # каталог -> имена извлечённых баз и соседей (ждут выхода потока из каталога)
SOSEDI = ('-wal', '-shm', '-journal')
NUL_BLOK = bytes(tarfile.BLOCKSIZE)


class Chtec:
    # tarfile в потоке МОЛЧА кончает архив на испорченном или обрезанном заголовке посреди архива (3.12 next():
    # InvalidHeaderError/TruncatedHeaderError при offset≠0 — без исключения), а GNU tar прежде отказывал кодом 2.
    # Обёртка помнит последние куски потока со смещениями: после конца tar смотрим, что лежит по tf.offset.
    OKNO = 3 << 20  # > буфера tarfile (1 МиБ): заголовок по tf.offset всегда внутри окна, как бы ни дробилось чтение

    def __init__(self, f):
        self.f, self.pos, self.kuski, self.v_okne = f, 0, collections.deque(), 0

    def read(self, n=-1):
        b = self.f.read(n)
        self.kuski.append((self.pos, b)); self.pos += len(b); self.v_okne += len(b)
        while self.v_okne - len(self.kuski[0][1]) >= self.OKNO:
            self.v_okne -= len(self.kuski.popleft()[1])
        return b

    def blok(self, off):
        if not self.kuski or off < self.kuski[0][0]:
            return None
        nach = self.kuski[0][0]; vse = b''.join(k for _, k in self.kuski)
        return vse[off - nach:off - nach + tarfile.BLOCKSIZE]


def konec_chestnyj(tf, chtec, gde):  # архив кончился честно, только если по tf.offset лежат 512 нулевых байт
    z = chtec.blok(tf.offset)
    if z != NUL_BLOK:
        print('TAR_KONEC %s: архив кончился не меткой конца (по смещению %d %s)' % (gde, tf.offset,
              'не видно' if z is None else '%d Б, ненулевые' % len(z) if len(z) == tarfile.BLOCKSIZE else '%d Б, обрезано' % len(z)))
        return False
    return True


def norm(n):
    while n.startswith('./'):
        n = n[2:]
    return n.lstrip('/')


def vnutri(n, pref):
    return n == pref or n.startswith(pref + '/')


def patch_li(n):
    c = n.split('/')
    return (len(c) == 4 and c[2] == '.dsh' and c[3] == 'cordis.patch.yml') or \
           (len(c) == 6 and c[2] == '.dsh' and c[3] == 'profiles' and c[5] == 'cordis.patch.yml')


def baza_li(n):
    return n.endswith('.db') or any(n.endswith('.db' + s) for s in SOSEDI)


def proverit_bazu(put):  # тот же прибор, что прежде в разделе 5б (proverka-kopii.sh 29245ab4 :358–366)
    try:
        con = sqlite3.connect('file:%s?mode=ro' % put, uri=True)
        itog = con.execute('pragma integrity_check').fetchone()[0]; con.close()
        return 0, str(itog)
    except sqlite3.OperationalError as e:
        return 2, 'СЛЕПОТА: ' + str(e)[:60]
    except sqlite3.DatabaseError as e:
        return 10, 'DB_CORRUPT: ' + str(e)[:60]
    except Exception as e:
        return 2, 'СЛЕПОТА: ' + str(e)[:60]


def sbrosit(kat):  # поток вышел из каталога: базы его проверены целиком с соседями, затем убраны
    for n in sorted(raskryto_db.pop(kat, ())):
        p = os.path.join(rab, n)
        if n.endswith('.db') and os.path.isfile(p) and not os.path.islink(p):
            bazy[n] = proverit_bazu(p)
    for n in os.listdir(os.path.join(rab, kat)) if os.path.isdir(os.path.join(rab, kat)) else ():
        pn = (kat + '/' + n) if kat else n
        if baza_li(pn) and not (vnutri(pn, kl) or vnutri(pn, sek)):
            try: os.remove(os.path.join(rab, pn))
            except OSError: pass


RAB_R = os.path.realpath(rab)


def v_rab(p):
    r = os.path.realpath(p)
    return r == RAB_R or r.startswith(RAB_R + os.sep)


def vyshe_kornya(n, cel):
    # относительная цель ссылки n уходит выше корня архива (лексически, от каталога n)
    d = len(n.split('/')) - 1
    for c in cel.split('/'):
        if c == '..':
            d -= 1
            if d < 0:
                return True
        elif c not in ('', '.'):
            d += 1
    return False


def opasnyj(m, n):
    # A-N-1948 №4 (№1, признак Вениамина 09:1xZ): член, через который распаковка от root вышла бы из RAB, — ОТКАЗ
    # приёмки с именем члена (код 6 → 1), а не тихий пропуск. Основание — замер 10.10 по 1352 источникам копии:
    # родителей через симлинк 0, источников под источником-ссылкой 0, относительных ссылок выше корня 0 из 15003
    # (абсолютных 14501 — их НЕ браковать: на диск не ложатся, наличие — по указателю).
    if m.name.startswith('/'):
        return 'абсолютный путь'
    c = n.split('/')
    if '..' in c:
        return '«..» в пути'
    for i in range(1, len(c)):
        if '/'.join(c[:i]) in ssylki:
            return 'путь идёт через ссылку ' + '/'.join(c[:i])
    if m.issym():
        ssylki.add(n)
        if not m.linkname.startswith('/') and vyshe_kornya(n, m.linkname):
            return 'ссылка ведёт выше корня: ' + m.linkname
    if m.islnk() and (m.linkname.startswith('/') or '..' in norm(m.linkname).split('/')):
        return 'жёсткая ссылка вне корня: ' + m.linkname
    return None


def izvlech(tf, m, n):
    # A-N-1948 №4 (№1): приёмка идёт от root по архиву с Drive. Симлинк копии на диск НЕ ложится — он есть в указателе
    # (.indeks.json), наличие по нему отвечает est_v; иначе член «симлинк → /etc/cron.d» и следующий «симлинк/файл»
    # писали бы от root вне RAB. Запись — только под RAB (realpath), файл — O_NOFOLLOW; жёсткая ссылка с «..» или вне
    # RAB — слепота (5), а не копия чужого файла. На бою 10.10: в ключе и хранилище симлинков 0 (find -type l).
    dest = os.path.join(rab, n)
    if m.issym():
        return
    rod = os.path.dirname(dest) or rab
    if not v_rab(rod):
        slepye.append(n + ' -> путь ведёт вне рабочего каталога'); return
    os.makedirs(rod, exist_ok=True)
    if os.path.lexists(dest) and (os.path.islink(dest) or not os.path.isdir(dest)):
        os.remove(dest)
    if m.isdir():
        os.makedirs(dest, exist_ok=True)
    elif m.islnk():
        ln = norm(m.linkname)
        cel = os.path.join(rab, ln)
        if '..' in ln.split('/') or not v_rab(cel) or not os.path.isfile(cel):
            slepye.append(n + ' -> ' + ln); return
        shutil.copyfile(cel, dest)
    elif m.isfile():
        fd = os.open(dest, os.O_WRONLY | os.O_CREAT | os.O_TRUNC | os.O_NOFOLLOW, 0o600)
        with tf.extractfile(m) as src, os.fdopen(fd, 'wb') as dst:
            shutil.copyfileobj(src, dst, 1 << 20)
    os.chmod(dest, 0o700 if m.isdir() else 0o600)


def projti(tf, glubina=0):
    for m in tf:
        # B-N-1435: tarfile в потоке копит ВСЕ TarInfo в tf.members — 0,47 КиБ на член, ~0,4 ГБ на копии 02.10 (460 тыс.);
        # потоку они не нужны (каждый член разбирается один раз), а итерация после очистки берёт следующий через next().
        tf.members.clear()
        n = norm(m.name)
        pochemu = opasnyj(m, n)
        if pochemu:
            opasnye.append(m.name + ' — ' + pochemu)
            continue
        if not n:
            continue
        for kat in [k for k in raskryto_db if k and not n.startswith(k + '/') and k != n]:  # корень ('') — в конце
            sbrosit(kat)
        typ = 'd' if m.isdir() else 'l' if m.issym() else 'h' if m.islnk() else 'f' if m.isfile() else 'o'
        indeks[n] = [typ, m.linkname if typ in 'lh' else '']
        nuzhen = vnutri(n, kl) or vnutri(n, sek) or n in ('backup-coverage.json', 'backup-acl.txt') or (typ in 'fh' and patch_li(n))
        if nuzhen:
            izvlech(tf, m, n)
            if typ in 'fh' and baza_li(n):  # база под ключом/хранилищем тоже проверяется (прежде find по всему дереву)
                raskryto_db.setdefault(os.path.dirname(n), set()).add(n)
        elif typ in 'fh' and baza_li(n):
            izvlech(tf, m, n)
            raskryto_db.setdefault(os.path.dirname(n), set()).add(n)
        # У0б: вложенный архив в КОРНЕ читается целиком и его члены входят во все проверки (прежде :152–154,
        # один уровень вложенности). Читается сразу, потоком; конец gzip дочитывается — проверка CRC.
        if glubina == 0 and typ == 'f' and '/' not in n and n.endswith('.tar.gz'):
            try:
                vl = gzip.GzipFile(fileobj=tf.extractfile(m)); vch = Chtec(vl)
                with tarfile.open(fileobj=vch, mode='r|', bufsize=1 << 20) as vtf:
                    projti(vtf, 1)
                    if not konec_chestnyj(vtf, vch, 'вложенный ' + n): sys.exit(4)
                while vl.read(1 << 20): pass
            except (tarfile.TarError, EOFError, OSError, gzip.BadGzipFile) as e:
                print('VLOZH_OSHIBKA ' + n + ' ' + str(e)[:100]); sys.exit(4)


CHTEC = Chtec(sys.stdin.buffer)
try:
    with tarfile.open(fileobj=CHTEC, mode='r|', bufsize=1 << 20) as tf:
        projti(tf)
        if not konec_chestnyj(tf, CHTEC, 'архив'):
            sys.exit(3)
except (tarfile.TarError, EOFError, OSError) as e:
    print('TAR_OSHIBKA ' + str(e)[:120]); sys.exit(3)
for kat in list(raskryto_db):
    sbrosit(kat)
dochitano = 0  # tar кончился раньше потока: дочитываем до конца, иначе gzip не дойдёт до своей проверки CRC
while True:
    b = sys.stdin.buffer.read(1 << 20)
    if not b: break
    dochitano += len(b)
json.dump(indeks, open(os.path.join(rab, '.indeks.json'), 'w'))
with open(os.path.join(rab, '.bazy.tsv'), 'w') as f:
    for n in sorted(bazy):
        f.write('%d\t%s\t%s\n' % (bazy[n][0], bazy[n][1].replace('\t', ' ').replace('\n', ' '), n))
print('POTOK chlenov %d baz %d dochitano_posle_tar %d' % (len(indeks), len(bazy), dochitano))
if opasnye:
    for s in opasnye[:25]: print('OPASNO ' + s)
    sys.exit(6)
if slepye:
    for s in slepye[:25]: print('NEDOSTUPNO ' + s)
    sys.exit(5)
PYPOTOK
cat > "$RAB/.indeks.py" <<'PYINDEKS'
# B-H-1427 (C2): наличие в копии по указателю членов, а не по распакованному дереву. est() отвечает ровно то же,
# что прежде os.path.exists(RAB/путь) на дереве `tar xzf` (proverka-kopii.sh 29245ab4): каталог есть и тогда, когда
# в архиве он только родитель; симлинк из копии разрешается — относительный внутри копии, АБСОЛЮТНЫЙ на ЖИВОЙ
# машине (так делало ядро на распакованном дереве); висячий — «нет».
import json, os


def zagruzit(rab):
    idx = json.load(open(os.path.join(rab, '.indeks.json')))
    kat = set()
    for n in idx:
        c = n.split('/')
        for i in range(1, len(c)):
            kat.add('/'.join(c[:i]))
    return idx, kat


def est_v(p, idx, kat):
    chasti = [x for x in p.split('/') if x not in ('', '.')]
    tek, i, pryzhkov = [], 0, 0
    while i < len(chasti):
        c = chasti[i]
        if c == '..':
            if not tek:
                return False
            tek.pop(); i += 1; continue
        put = '/'.join(tek + [c])
        z = idx.get(put)
        if z is None:
            if put in kat:
                tek.append(c); i += 1; continue
            return False
        typ, cel = z
        if typ == 'l':
            pryzhkov += 1
            if pryzhkov > 40:
                return False
            ost = chasti[i + 1:]
            if cel.startswith('/'):
                return os.path.exists(os.path.join(cel, *ost))
            chasti = tek + cel.split('/') + ost; tek, i = [], 0; continue
        if typ != 'd' and put not in kat and i < len(chasti) - 1:
            return False
        tek.append(c); i += 1
    return True


def glob_v(obrazec, idx):
    # glob.glob(RAB/obrazec) по указателю: «*» в составе не берёт имён с точки, как glob; прочие составы — буквально.
    import fnmatch
    sost = obrazec.split('/')
    for n in idx:
        c = n.split('/')
        if len(c) == len(sost) and all(
                (s == x) if '*' not in s else (fnmatch.fnmatchcase(x, s) and not x.startswith('.'))
                for s, x in zip(sost, c)):
            yield n
PYINDEKS
gzip -dc -- "$ARH" 2>"$RAB/.gzip.err" | python3 -B "$RAB/.potok.py" "$RAB" "$KLYUCH_PUT" "$SEKRETY_PUT" >"$RAB/.potok.out" 2>"$RAB/.potok.err"
RC_P=("${PIPESTATUS[@]}")   # коды ОБОИХ звеньев: без $(…), иначе PIPESTATUS остаётся в подоболочке
POTOK_VYVOD=$(cat "$RAB/.potok.out")
case "${RC_P[1]}" in
  0) ;;
  4) echo "СЛЕПОТА: вложенный архив $(printf '%s' "$POTOK_VYVOD" | awk '/^VLOZH_OSHIBKA/{print $2}') не распакован" >&2; zavershit 2 ;;
  6) echo "🔴 НЕГОДНА: в архиве члены, ведущие вне корня распаковки — распаковка от root записала бы мимо рабочего каталога:" >&2
     printf '%s\n' "$POTOK_VYVOD" | awk '/^OPASNO/{$1=""; print "    " $0}' >&2; zavershit 1 ;;
  5) echo "СЛЕПОТА: проверке нужен член, которого не достать (жёсткая ссылка на неизвлечённое или путь вне рабочего каталога):" >&2
     printf '%s\n' "$POTOK_VYVOD" | awk '/^NEDOSTUPNO/{$1=""; print "    " $0}' >&2; zavershit 2 ;;
  *) echo "ОТКАЗ: архив не распаковывается ($(printf '%s' "$POTOK_VYVOD" | tail -1; head -c 200 "$RAB/.potok.err"))" >&2; zavershit 2 ;;
esac
[ "${RC_P[0]}" -eq 0 ] || { echo "ОТКАЗ: архив не распаковывается (gzip: $(head -c 200 "$RAB/.gzip.err"))" >&2; zavershit 2; }
echo "  прочитан потоком целиком: $(printf '%s' "$POTOK_VYVOD" | awk '/^POTOK/{print "членов " $3 ", баз проверено " $5}'); на диске под проверку $(du -sh "$RAB" | cut -f1)"

KL="$RAB/$KLYUCH_PUT"
SEK="$RAB/$SEKRETY_PUT"
n_sek=$(find "$SEK" -name '*.gpg' 2>/dev/null | wc -l)
n_kl=$(find "$KL" -type f 2>/dev/null | wc -l)
echo "  ключ: файлов $n_kl | хранилище: записей $n_sek"

# 🔴 Обе половины обязательны, и молчать про недостающую нельзя.
# Именно этот случай и был у нас: ключ есть, записей ноль — копия выглядела полной.
[ "$n_kl" -eq 0 ] && { echo "🔴 НЕ ВОССТАНОВИМА: ключа в копии нет — расшифровать нечем" >&2; zavershit 1; }
[ "$n_sek" -eq 0 ] && { echo "🔴 НЕ ВОССТАНОВИМА: хранилища секретов в копии НЕТ, хотя ключ лежит. Копия выглядит полной и не стоит ничего." >&2; zavershit 1; }

# ── 2. Ключ из копии в ЧИСТОЕ хранилище ─────────────────────────────────────
export GNUPGHOME="$RAB/chistoe"
mkdir -p "$GNUPGHOME" && chmod 700 "$GNUPGHOME" || { echo "СЛЕПОТА: не создан каталог проверки ключа" >&2; zavershit 2; }
cp -a "$KL"/* "$GNUPGHOME"/ 2>/dev/null || { echo "СЛЕПОТА: ключ не скопирован в рабочий каталог" >&2; zavershit 2; }
chmod 700 "$GNUPGHOME"; chmod 600 "$GNUPGHOME"/* 2>/dev/null
KEY_LIST=$(gpg --batch --list-secret-keys 2>/dev/null) || { echo "СЛЕПОТА: gpg не смог прочитать рабочее хранилище ключей" >&2; zavershit 2; }
n_sec=$(printf '%s\n' "$KEY_LIST" | grep -c '^sec' || true)
KEY_LIST=""
echo "  секретных ключей поднялось: $n_sec"
[ "$n_sec" -eq 0 ] && { echo "🔴 НЕ ВОССТАНОВИМА: ключ из копии не поднимается — файлы есть, а ключа нет" >&2; zavershit 1; }

# ── 3. Открываем ВСЕ секреты из той же копии ────────────────────────────────
# 🔴 Прежде проверялась одна запись (find | head -1). Копия, где уцелел один
# секрет из 263, такую проверку проходила — а «восстановима» означает, что
# открывается ВСЁ, чем восстанавливают. Замер: 263 записи за 1954 мс.
# 🔴 Длина берётся БЕЗ `head -1`: секрет, чья первая строка пуста, открывался
# целиком, а инструмент говорил «ключ не открывает» — ложно-красное на исправной
# копии. Значение живёт в переменной оболочки: на диск открытый текст не ложится.
otkr=0; otkaz=0; pusto=0; PERVYJ_OTKAZ=""; PROBA=""
while IFS= read -r f; do
  [ -z "$PROBA" ] && PROBA="$f"
  ZNACH=$(gpg --batch --quiet --decrypt "$f" 2>/dev/null); KOD=$?
  if [ "$KOD" -ne 0 ]; then
    otkaz=$((otkaz+1)); [ -z "$PERVYJ_OTKAZ" ] && PERVYJ_OTKAZ="$f"
  elif [ "${#ZNACH}" -eq 0 ]; then
    pusto=$((pusto+1)); [ -z "$PERVYJ_OTKAZ" ] && PERVYJ_OTKAZ="$f"
  else
    otkr=$((otkr+1))
  fi
  ZNACH=""
done < <(find "$SEK" -name '*.gpg' 2>/dev/null | sort)
echo "  открылось $otkr из $n_sek | не открылось $otkaz | пустых $pusto (значения не печатаются)"
if [ "$otkaz" -gt 0 ] || [ "$pusto" -gt 0 ]; then
  echo "🔴 НЕ ВОССТАНОВИМА: ключ из копии открывает не все секреты из той же копии." >&2
  echo "   первый неоткрывшийся: ${PERVYJ_OTKAZ#$SEK/}" >&2
  zavershit 1
fi
[ "$otkr" -eq 0 ] && { echo "🔴 НЕ ВОССТАНОВИМА: не открылось ни одной записи" >&2; zavershit 1; }

# ── 4. Контроль зрячести ────────────────────────────────────────────────────
export GNUPGHOME="$RAB/pustoe"
mkdir -p "$GNUPGHOME" && chmod 700 "$GNUPGHOME" || { echo "СЛЕПОТА: не создан каталог проверки ключа" >&2; zavershit 2; }
ZNACH2=$(gpg --batch --quiet --decrypt "$PROBA" 2>/dev/null); KOD2=$?
echo "  контроль зрячести (пустое хранилище): код gpg $KOD2, длина ${#ZNACH2}"
if [ "$KOD2" -eq 0 ] && [ "${#ZNACH2}" -gt 0 ]; then
  echo "🔴 ПРОВЕРКА НЕ СОСТОЯЛАСЬ: секрет открылся и БЕЗ ключа — сработал ключ из окружения, успех выше ничего не доказывает" >&2
  zavershit 2
fi
ZNACH2=""

# ── 5. ПОЛНОТА СОСТАВА по разметке реестра ─────────────────────────────────
# 🔴 Заведено Искрой 25.08 по ЗАМЕРУ, а не из осторожности. Копия
# aclaude-sadik-2026-08-25-1149 прошла проверку выше («восстановима»), а в ней
# НЕ БЫЛО: /opt/claude-oauth целиком (шлюз подписки, в чьём cgroup живёт агент),
# /opt/agent-plugins (модули каналов обоих агентов), /var/lib/agent-button,
# /var/lib/agent-watchdog, /etc/needrestart/conf.d. 22 образца из 124.
# То есть секреты открывались, а восстановить машину было нечем.
# Граница у автора была НАЗВАНА — в комментарии кода («состав — дело сторожа
# покрытия»). Но: (1) читатель вывода комментария не видит, (2) сторож покрытия
# смотрит ДИСК, а не архив, то есть названный ответственный этого не делает.
# Полноту АРХИВА не проверял никто.
#
# 🔴 ЧЕГО ЭТА ПРОВЕРКА НЕ ДЕЛАЕТ. Она сверяет архив с СЕГОДНЯШНЕЙ разметкой и
# сегодняшним диском. Поэтому считает по ОБРАЗЦАМ, а не по файлам: образец
# засчитан, если найден хоть один его предмет. Файл, заведённый после сборки
# архива, честно отсутствует — и по образцу это не дефект. Пропажа целого
# образца (ни одного предмета) — дефект.
# Своего списка тут нет: что везти, знает реестр.
if [ "$TOLKO_SEKRETY" = "1" ]; then
  # 🔴 Проверка состава пропущена ЯВНО. Это не выключатель «чтобы прошло»:
  # вердикт ниже обязан сказать, что состав не проверялся, иначе ключ
  # превращает инструмент в тот самый ложно-зелёный, ради которого он писан.
  # Заведён для стендов: они проверяют расшифровочную часть на минимальных
  # фикстурах, где полного состава машины нет и быть не должно.
  P_VSEGO="—"; P_NET=0
  echo "  состав: НЕ ПРОВЕРЯЛСЯ (запрошено --tolko-sekrety)"
  # 🔴 А ПОЛНОТА ПРИ ЭТОМ ФЛАГЕ ПРОВЕРЯЕТСЯ, и сказать об этом надо ЗДЕСЬ, где читатель
  # смотрит, чего флаг не делает. Иначе отказ по неполной копии станет неожиданностью,
  # а неожиданный отказ учатся обходить, вместо того чтобы читать. Довод оставить:
  # манифест перечисляет дома и источники, а не «всё кроме секретов», — значит пропуск,
  # объявленный сборщиком, мог задеть и расшифровочную часть.
  echo "  полнота по манифесту: ПРОВЕРЯЕТСЯ И ПРИ ЭТОМ ФЛАГЕ — неполная копия даст отказ"
else
# 🔴 B-H-183 (#227-2): вход с неполными. Строгий `pokrytie --json` отказывал кодом 3 целиком,
# если хоть у одного агента нет разметки копии, — и состав не проверялся НИ У КОГО.
# Новый вход: 0 — рамка полна; 4 — карта полных + nepolnye поимённо. Код 4 НЕ даёт итога 0.
# 🔴 B-H-1427 (02.10.2026, замер 07:2xZ): ответ реестра — В ФАЙЛ, не в переменную окружения. Он вырос до 137 340 Б при
# пределе одной строки окружения 131 072 (MAX_ARG_STRLEN): python3 не стартовал («Argument list too long», 126), ошибка
# глушилась, и пустой вывод читался как «реестр не отдал разметку» — раздел полноты был слеп у ЛЮБОЙ копии.
# 🔴 B-N-1957 (10.10.2026, Заря; нашла Искра): РАЗМЕТКА — НА МОМЕНТ КОПИИ, а не нынешняя.
# 09.10 копию own-chain-2026-10-09-0303 (старт сборки 03:01Z) принимали в 06:16Z, а в 05:50Z реестр
# дополнили образцом /opt/agent-skills-anna (коммит 1ee187e). Образцы брались из НЫНЕШНЕГО реестра:
# «внесено после копии» не отличалось от «было и пропало», и приёмка слепла (код 2) до следующей копии.
# Теперь, если реестр новее копии, разметка берётся из git реестра — последний коммит agents.yaml
# не новее старта сборки. pokrytie читает только agents.yaml (AGENTS_REGISTRY), больше ничего.
# Почему git, а не реестр из самой копии: копия несёт разметку СБОРЩИКА, а приёмка нарочно снаружи.
# Нет git, не репозиторий, нет коммита не новее копии — ОТКАЗ (код 2) с причиной: разметку не угадываем.
# ⚠️ ЧЕГО НЕ ЛОВИТ: (1) правку agents.yaml МИМО git до старта сборки — тогда в git версия старше той,
# по которой собирали (снятый образец даст ложное «КОПИЯ НЕПОЛНА», добавленный — ничего); правки 09.10
# все шли через pravka/smontirovat-fajly с коммитом. (2) Коммит между стартом сборки и её чтением
# реестра (секунды) — сборщик видел новее, чем берём здесь. (3) Время коммита — по часам машины.
REESTR_FAJL="${AGENTS_REGISTRY:-/etc/agent-registry/agents.yaml}"
REESTR_KOPII="$REESTR_FAJL"; REESTR_ISTOCHNIK="нынешний $REESTR_FAJL"
if [ -n "$KOPIYA_SNYATA" ]; then
  SNYATA_S=$(date -u -d "$KOPIYA_SNYATA" +%s 2>/dev/null || echo "")
  REESTR_S=$(stat -c %Y "$REESTR_FAJL" 2>/dev/null || echo "")
  if [ -z "$SNYATA_S" ] || [ -z "$REESTR_S" ]; then
    echo "🔴 ПРОВЕРКА НЕ СОСТОЯЛАСЬ: не снят возраст копии ($KOPIYA_SNYATA) или реестра ($REESTR_FAJL) — разметку на момент копии не выбрать" >&2
    zavershit 2
  fi
  if [ "$REESTR_S" -le "$SNYATA_S" ]; then
    REESTR_ISTOCHNIK="нынешний $REESTR_FAJL (не новее копии)"
  else
    CHASOV=$(( (REESTR_S - SNYATA_S) / 3600 ))
    R_KAT=$(dirname "$REESTR_FAJL"); R_IMYA=$(basename "$REESTR_FAJL")
    if ! command -v git >/dev/null 2>&1 || [ "$(git -C "$R_KAT" rev-parse --is-inside-work-tree 2>/dev/null)" != "true" ]; then
      echo "🔴 ПРОВЕРКА НЕ СОСТОЯЛАСЬ: реестр новее копии на ${CHASOV} ч, а истории реестра нет (git или репозиторий $R_KAT недоступны) —" >&2
      echo "   разметку на момент копии взять неоткуда; по нынешней «внесено после копии» не отличить от «было и пропало»." >&2
      zavershit 2
    fi
    KOMMIT=$(git -C "$R_KAT" rev-list -1 --before="$KOPIYA_SNYATA" HEAD -- "$R_IMYA" 2>/dev/null)
    if [ -z "$KOMMIT" ]; then
      echo "🔴 ПРОВЕРКА НЕ СОСТОЯЛАСЬ: в git $R_KAT нет коммита $R_IMYA не новее копии ($KOPIYA_SNYATA) —" >&2
      echo "   разметку на момент копии взять неоткуда. Это НЕ «состав в порядке»." >&2
      zavershit 2
    fi
    if ! git -C "$R_KAT" show "$KOMMIT:./$R_IMYA" >"$RAB/.reestr-na-moment-kopii.yaml" 2>/dev/null \
       || [ ! -s "$RAB/.reestr-na-moment-kopii.yaml" ]; then
      echo "🔴 ПРОВЕРКА НЕ СОСТОЯЛАСЬ: не прочитан $R_IMYA из коммита ${KOMMIT:0:12} реестра" >&2
      zavershit 2
    fi
    REESTR_KOPII="$RAB/.reestr-na-moment-kopii.yaml"
    REESTR_ISTOCHNIK="git $R_KAT коммит ${KOMMIT:0:12} ($(git -C "$R_KAT" log -1 --format=%cI "$KOMMIT" 2>/dev/null)) — нынешний реестр новее копии на ${CHASOV} ч"
  fi
fi
echo "  разметка состава: $REESTR_ISTOCHNIK"
AGENTS_REGISTRY="$REESTR_KOPII" "$CHITATEL" pokrytie --json --s-nepolnymi >"$RAB/.pokrytie.json" 2>/dev/null; REG_KOD=$?
POLNOTA=$(REG_KOD="$REG_KOD" RAB="$RAB" python3 -c "
import json,os,glob,sys
raw=open(os.path.join(os.environ['RAB'],'.pokrytie.json'),encoding='utf-8').read(); kod=os.environ.get('REG_KOD')
if kod not in ('0','4') or not raw.strip():
    print('SLEPOTA'); sys.exit(0)
d=json.loads(raw); rab=os.environ['RAB']
nep=d.get('nepolnye')
if d.get('format')!='pokrytie-s-nepolnymi-v1' or not isinstance(nep,list) or (kod=='0')!=(d.get('polnoe') is True and not nep):
    print('SLEPOTA'); sys.exit(0)
exec(open(os.path.join(rab, '.indeks.py')).read())  # B-H-1427: наличие по указателю, не по дереву
IDX, KAT = zagruzit(rab)
def est(p):
    return est_v(p.lstrip('/'), IDX, KAT)
# B-N-2101: путь без маски, которого нет и на машине, — не дыра сборщика: взять было нечего.
# Отсутствие доказано, только если ближайший существующий предок открыт на проход; не видно — считаем «есть» (строже).
def net_na_mashine(p):
    if os.path.lexists(p): return False
    d=os.path.dirname(p.rstrip('/')) or '/'
    while not os.path.lexists(d): d=os.path.dirname(d) or '/'
    return os.path.isdir(d) and os.access(d, os.X_OK)
# r2 (ворота Вениамина 04:58Z): «взять не могла» верно, только если пути не было В МОМЕНТ СБОРКИ. Свидетель — запись сборщика ЭТОЙ
# копии (backup-coverage.json в архиве, propushcheno «в реестре есть, на диске нет»). Записи нет или не читается — мягкого вердикта нет.
sbor_net=None
try:
    m_=json.load(open(os.path.join(rab,'backup-coverage.json'),encoding='utf-8'))
    if m_.get('format')=='sadik-backup-coverage-v1' and isinstance(m_.get('propushcheno'),list):
        sbor_net={x.get('istochnik') for x in m_['propushcheno'] if isinstance(x,dict) and x.get('prichina')=='в реестре есть, на диске нет'}
except Exception:
    m_=None
net=[]; netdisk=[]; netpoter=[]; vsego=0; ne_raskr=[]   # п.406: маска, не раскрывшаяся на живой машине, — НЕ «в порядке»
def razobrat(put, raskr):
    if any(est(r) for r in raskr): return
    if not all(net_na_mashine(r) for r in raskr): net.append(put)          # на машине есть, в копии нет
    elif sbor_net is not None and put in sbor_net: netdisk.append(put)     # не было при сборке (слово сборщика) и нет сейчас
    else: netpoter.append(put)                                             # нет сейчас, а при сборке — не объявлено: возможна потеря
for agent, dom in d.get('doma',{}).items():
    for obr in d.get('komnaty',{}).get(agent,{}).get('klast',[]):
        put = obr if obr.startswith('/') else os.path.join(dom,obr)
        raskr = glob.glob(put) or ([put] if '*' not in put else [])
        if not raskr: ne_raskr.append(put); continue
        vsego += 1
        razobrat(put, raskr)
for it in d.get('obshchee',[]):
    put=it['put']; raskr=glob.glob(put) or [put]
    vsego += 1
    razobrat(put, raskr)
# 5в судит пропуски сборщика: если ВСЕ они — «нет на диске» по путям, разобранным здесь как netdisk, и непокрытых нет, 5в не повторяет отказ.
sborvse = sbor_net is not None and not (m_.get('nepokrytye') or []) and len(sbor_net)==len(m_['propushcheno']) and sbor_net<=set(netdisk)
print('ITOG', vsego, len(net), len(netdisk), len(netpoter), 'da' if sbor_net is not None else 'net', 'da' if sborvse else 'net')
for x in ne_raskr[:25]: print('NERASKR', x)
for x in net[:25]: print('NET', x)
for x in netdisk[:25]: print('NETDISK', x)
for x in netpoter[:25]: print('NETPOTER', x)
for x in nep: print('NEPOLN', x.get('imya'), '—', '; '.join(x.get('prichiny') or []))
" 2>"$RAB/.polnota.err")
if [ -z "$POLNOTA" ] || [ "$POLNOTA" = "SLEPOTA" ]; then
  echo "🔴 ПРОВЕРКА НЕ СОСТОЯЛАСЬ: реестр не отдал разметку копии (pokrytie)${POLNOTA:+}$( [ -s "$RAB/.polnota.err" ] && printf ' — разбор упал: %s' "$(tail -1 "$RAB/.polnota.err" | cut -c1-200)")" >&2
  zavershit 2
fi
P_VSEGO=$(printf '%s' "$POLNOTA" | awk '/^ITOG/{print $2}')
P_NET=$(printf '%s' "$POLNOTA" | awk '/^ITOG/{print $3}')
P_NETDISK=$(printf '%s' "$POLNOTA" | awk '/^ITOG/{print $4}')
P_NETPOTER=$(printf '%s' "$POLNOTA" | awk '/^ITOG/{print $5}')
P_SBOR=$(printf '%s' "$POLNOTA" | awk '/^ITOG/{print $6}')
P_SBORVSE=$(printf '%s' "$POLNOTA" | awk '/^ITOG/{print $7}')
# 🔴 п.406, ВТОРАЯ СТОРОНА (07.09.2026): маска, НЕ РАСКРЫВШАЯСЯ на живой машине,
# прежде выпадала из счёта молча (`continue`), и vsego её не считал. Это ложно-ЗЕЛЁНОЕ:
# прибор, заведённый проверять сохранность копии, был слеп ровно к случаю, ради которого
# копия существует — данные БЫЛИ и пропали С МАШИНЫ. Первая сторона (реестр новее копии)
# шумна и потому чинится; эта тиха и не проявится, пока не случится настоящая пропажа.
# ⚠️ «Не различается» ≠ «в порядке»: код 2, а не 0, и причина названа поимённо.
P_NERASKR=$(printf '%s' "$POLNOTA" | grep -c '^NERASKR' || true)
if [ "${P_NERASKR:-0}" -gt 0 ]; then
  echo "⚠️ СЛЕПОТА ПОЛНОТЫ: $P_NERASKR образцов не раскрылись на живой машине — их наличие в копии НЕ ПРОВЕРЕНО." >&2
  echo "   Это НЕ «они в порядке»: маска не нашла файла ЗДЕСЬ, и сравнивать было не с чем." >&2
  printf '%s\n' "$POLNOTA" | awk '/^NERASKR/{$1=""; print "    " $0}' >&2
  SLEPOTA_POLNOTY=2
fi
P_NEPOLN=$(printf '%s' "$POLNOTA" | grep -c '^NEPOLN' || true)
if [ "${P_NEPOLN:-0}" -gt 0 ]; then
  echo "⚠️ НЕПОЛНАЯ РАЗМЕТКА РЕЕСТРА: у $P_NEPOLN агентов нет описания копии — их состав НЕ ПРОВЕРЕН, прочие проверены." >&2
  printf '%s\n' "$POLNOTA" | awk '/^NEPOLN/{$1=""; print "    " $0}' >&2
  SLEPOTA_POLNOTY=2
fi
echo "  состав: образцов разметки $P_VSEGO | нет в копии $P_NET | нет ни в копии, ни на машине: не было при сборке $P_NETDISK, не объявлено сборщиком $P_NETPOTER"
# C-H-490 (02.10.2026, Заря; класс #226-Б, на aclaude закрыт Михалычем 21.09): ноль образцов разметки — не «все в копии есть»,
# а «судить не по чему». «Каждый образец есть в копии» на пустом множестве истинно: годный по форме pokrytie без единого
# дома и общего образца давал «✅ ПРОФИЛЬ ПРИЁМКИ ПРОЙДЕН … все 0 образцов», код 0 (проба 02.10). Код 2 — как у соседних слепот.
if [ "${P_VSEGO:-0}" -eq 0 ]; then
  echo "🔴 ЗАКЛЮЧЕНИЯ НЕТ: разметка копии из реестра пуста — 0 образцов; полноту состава судить не по чему" >&2
  zavershit 2
fi
if [ "${P_NET:-0}" -gt 0 ] || [ "${P_NETPOTER:-0}" -gt 0 ]; then
  # 🔴 ДВА ЧТЕНИЯ ОДНОГО ОТСУТСТВИЯ, И ОНИ НЕ РАЗЛИЧАЮТСЯ БЕЗ ВОЗРАСТА:
  #   «внесено в реестр ПОСЛЕ снятия копии» — физически не могло попасть;
  #   «БЫЛО и пропало» — настоящая беда.
  # Список образцов брался из ЖИВОГО реестра, наличие искалось во ВЧЕРАШНЕЙ копии (до B-N-1957).
  # До 07.09 прибор печатал только второе чтение и выдавал его как факт: 06.09 он
  # дал «7 из 74» на исправной копии — росли не дыры, а реестр.
  # ГДЕ ЭТО НЕ ПРИМЕНЯЕТСЯ: слепота копию НЕ оправдывает. Код 2 ведёт себя как
  # «нельзя»; меняется имя беды, а не право поднимать.
  # B-N-1957: при --kopiya-snyata разметка выше взята НА МОМЕНТ КОПИИ (нынешний файл, если он не новее,
  # иначе git реестра) — отсутствие здесь различимо и есть пропажа. Прежняя ветка «РЕЕСТР НОВЕЕ КОПИИ → код 2»
  # снята: она и была слепотой 09.10. Без --kopiya-snyata возраст не проверялся — предупреждение ниже.
  if [ -z "$KOPIYA_SNYATA" ]; then
    echo "⚠️ ВОЗРАСТ КОПИИ ПРОТИВ РЕЕСТРА НЕ ПРОВЕРЯЛСЯ (нужен ключ --kopiya-snyata <ISO8601>)." >&2
    echo "   Значит «нет в копии» ниже может означать «внесено в реестр после снятия копии»." >&2
  fi
  # B-N-2101 r2 (ворота Вениамина 04:58Z): код 1 называет, ЧЕГО нет, а не «не восстановима» — секреты при этом открылись.
  if [ "${P_NET:-0}" -gt 0 ]; then
    echo "🔴 КОПИЯ НЕПОЛНА: данных, которые есть на машине, в копии нет — $P_NET путей:" >&2
    printf '%s\n' "$POLNOTA" | awk '/^NET /{$1=""; print "    " $0}' >&2
  fi
  if [ "${P_NETPOTER:-0}" -gt 0 ]; then
    echo "🔴 КОПИЯ НЕПОЛНА: в копии нет и на машине уже нет, а сборщик этой копии отсутствия при сборке не объявил (запись сборщика прочитана: $P_SBOR) — возможна потеря, $P_NETPOTER путей:" >&2
    printf '%s\n' "$POLNOTA" | awk '/^NETPOTER /{$1=""; print "    " $0}' >&2
  fi
  if [ "${P_NETDISK:-0}" -gt 0 ]; then
    echo "   Кроме того, нет ни в копии, ни на машине — $P_NETDISK:" >&2
    printf '%s\n' "$POLNOTA" | awk '/^NETDISK /{$1=""; print "    " $0}' >&2
  fi
  zavershit 1
fi
# B-N-2101 (17.10.2026): образец, которого нет НИ в копии, НИ на машине, — не «не восстановима». 16.10 шесть путей,
# снятых с машины (priyomka, .config пятерых команды Мастера), дали «КОПИЯ НЕПОЛНА … не восстановима» при 298/298
# открытых секретах. Два чтения: путь в реестре лишний — или данные пропали с машины ДО копии (копия их не спасёт).
# Код 3 — после ВСЕХ прочих проверок (базы, ACL, подключения): отказ любой из них остаётся кодом 1.
# r2: мягко — ТОЛЬКО путь, которого нет сейчас И который сборщик ЭТОЙ копии назвал отсутствующим при сборке
# (backup-coverage.json: «в реестре есть, на диске нет»). Был при сборке и не взят, а потом удалён — код 1 (NETPOTER).
# ЧЕГО НЕ ЛОВИТ: путь, который есть на машине, но не виден руке приёмки, считается «есть» — остаётся кодом 1;
# слово сборщика о себе не перепроверяется (если он ошибочно не увидел живой путь — это сторож покрытия).
if [ "${P_NETDISK:-0}" -gt 0 ]; then
  echo "🟠 НЕПОЛНА ПО СОСТАВУ: в разметке реестра есть, на машине нет — $P_NETDISK из $P_VSEGO (сборщик этой копии назвал их отсутствующими при сборке):" >&2
  printf '%s\n' "$POLNOTA" | awk '/^NETDISK /{$1=""; print "    " $0}' >&2
  echo "   Либо путь в реестре лишний (чинится реестром), либо данные пропали с машины до копии (искать в прежних копиях)." >&2
  NEPOLNA_SOSTAV=3
fi
fi

# ── 5б. БАЗЫ SQLITE В КОПИИ ОТКРЫВАЮТСЯ, А НЕ ТОЛЬКО ЛЕЖАТ ──────────────────
# 🔴 РАЗНАЯ СИЛА ДОВОДА. Выше состав проверен НАЛИЧИЕМ: файл с таким именем в архиве
# есть. Для базы данных этого мало — побитая база сохраняет и имя, и почти весь
# размер, а восстановить из неё нельзя ничего. Наличие и открытие — доводы разной
# силы, и разница видна только при беде.
# ЧТО ДЕЛАЕТ: открывает каждую .db из копии на ЧТЕНИЕ и прогоняет integrity_check.
# ГДЕ НЕ ПРИМЕНЯЕТСЯ: не судит о СОДЕРЖИМОМ — сколько там записей и те ли они,
# проверка не знает и знать не должна. Она отвечает на один вопрос: это ещё база
# или уже набор байт. Файлы -wal и -shm отдельно не трогаются: их читает сам sqlite.
# B-H-1427: базы открыты тем же прибором ВО ВРЕМЯ ПОТОКА (.potok.py proverit_bazu), каждая со своими -wal/-shm и
# сразу убрана; здесь читаются итоги .bazy.tsv: код прибора, ответ, путь. Итогов нет — проверка не состоялась.
[ -r "$RAB/.bazy.tsv" ] || { echo "СЛЕПОТА: итогов проверки баз нет ($RAB/.bazy.tsv)" >&2; zavershit 2; }
BAZ_VSEGO=0; BAZ_BITYH=0
while IFS=$'\t' read -r B_RC ITOG_B b; do
  BAZ_VSEGO=$((BAZ_VSEGO+1))
  if [ "$B_RC" -ne 0 ]; then
    if [ "$B_RC" -ne 10 ] || [[ "$ITOG_B" != DB_CORRUPT:* ]]; then
      echo "СЛЕПОТА: прибор SQLite не проверил $b (код $B_RC)" >&2; zavershit 2
    fi
  fi
  if [ "$ITOG_B" = ok ]; then
    echo "  |   база открыта: ${b#$RAB/} — integrity ok"
  else
    BAZ_BITYH=$((BAZ_BITYH+1))
    echo "  |   🔴 база НЕ ОТКРЫЛАСЬ: ${b#$RAB/} — ${ITOG_B:-пустой ответ}" >&2
  fi
done < "$RAB/.bazy.tsv"
if [ "$BAZ_VSEGO" -eq 0 ]; then
  echo "  |   ⚠️  баз данных в копии НЕ НАЙДЕНО — проверять нечего (разметка их берёт?)"
else
  echo "  |   базы: открыто $((BAZ_VSEGO-BAZ_BITYH)) из $BAZ_VSEGO (проверено ОТКРЫТИЕМ, не наличием)"
fi
if [ "$BAZ_BITYH" -gt 0 ]; then
  echo "🔴 КОПИЯ НЕГОДНА: $BAZ_BITYH баз(ы) не открываются — файл есть, восстановить нечего" >&2
  zavershit 1
fi

# ── 5в. ПОЛНОТА ПО СЛОВУ СБОРЩИКА: манифест ЛЕЖИТ ВНУТРИ КОПИИ ──────────────
# 🔴 Признак уже приезжал и молчал (20.09.2026). Сборщик кладёт в корень архива
# backup-coverage.json (sadik-backup.py:431, format sadik-backup-coverage-v1) с ПЕРЕЧНЕМ
# непокрытых домов и пропущенных источников. Он распаковывается сюда вместе со всем
# остальным — то есть лежал у приёмки под рукой и не читался ни разу. Заводить нечего:
# надо взять то, что уже приехало. Искали его на диске и в этом файле — там его нет и
# быть не может: он существует только внутри копии.
# 🔴 ЧЕГО ЭТОТ РАЗРЯД НЕ ЗНАЧИТ. Это САМОСВИДЕТЕЛЬСТВО СБОРЩИКА, а не независимая
# проверка: ловит «я знал, что пропустил» и НЕ ловит «я не знал, что надо взять».
# Источник, не объявленный в реестре вовсе, сюда не попадёт ни при каком значении —
# это дело сторожа покрытия (backup-coverage-watch), и он остаётся нужен.
# И полнота считается на момент СБОРКИ: появившееся после в ней не отражено.
# ⚠️ Граница печатается В ВЫВОД, а не только сюда: в этом же файле записано, что
# граница, названная только в комментарии, до читателя вывода не доходит, — и сама
# эта граница до 20.09 жила только в комментарии.
POLN_MANIF="$RAB/backup-coverage.json"
POLN_SOST=net_manifesta; POLN_NEPOKR=0; POLN_PROPUSK=0; POLN_OTVET=""
if [ -f "$POLN_MANIF" ]; then
  POLN_OTVET=$(MANIF="$POLN_MANIF" python3 -c "
import json,os,sys
try:
    d=json.load(open(os.environ['MANIF'],encoding='utf-8'))
except Exception as e:
    print('NECHITAEM ' + str(e)[:60]); sys.exit(2)
f=d.get('format')
if f != 'sadik-backup-coverage-v1':
    print('CHUZHOJ_FORMAT ' + str(f)[:40]); sys.exit(3)
polna=d.get('polnaya')
if polna is None:
    print('NET_POLYA polnaya'); sys.exit(3)
nep=d.get('nepokrytye') or []
pro=d.get('propushcheno') or []
print('ITOG', 'da' if polna else 'net', len(nep), len(pro))
for x in nep[:25]:
    print('NEPOKRYT', (x.get('imya') if isinstance(x,dict) else str(x)))
for x in pro[:25]:
    print('PROPUSK', str(x)[:200])
" 2>/dev/null); POLN_RC=$?
  # 🔴 Манифест ЕСТЬ, а прочитать нельзя — это НЕ «полно». Молчаливое «ну и ладно»
  # здесь ровно тот ложно-зелёный, против которого писан весь файл: неизвестность
  # ведёт в СЛЕПОТУ (код 2), а не в успех.
  if [ "${POLN_RC:-1}" -ne 0 ]; then
    echo "СЛЕПОТА ПОЛНОТЫ: манифест в копии есть, а разобрать его не удалось: ${POLN_OTVET:-пустой ответ}" >&2
    echo "   Это НЕ «копия полна»: прибор не прочитал того, чем полнота объявляется." >&2
    zavershit 2
  fi
  POLN_SOST=$(printf '%s' "$POLN_OTVET" | awk '/^ITOG/{print $2}')
  POLN_NEPOKR=$(printf '%s' "$POLN_OTVET" | awk '/^ITOG/{print $3}')
  POLN_PROPUSK=$(printf '%s' "$POLN_OTVET" | awk '/^ITOG/{print $4}')
  if [ "$POLN_SOST" = da ]; then
    echo "  |   полнота сборки: сборщик объявил копию ПОЛНОЙ (непокрытых домов 0, пропущенных источников 0)"
  else
    echo "  |   🔴 полнота сборки: сборщик объявил копию НЕПОЛНОЙ — непокрытых домов $POLN_NEPOKR, пропущено источников $POLN_PROPUSK" >&2
    printf '%s\n' "$POLN_OTVET" | awk '/^NEPOKRYT/{$1=""; print "  |     непокрыт агент:" $0}' >&2
    printf '%s\n' "$POLN_OTVET" | awk '/^PROPUSK/{$1=""; print "  |     пропущен источник:" $0}' >&2
  fi
else
  # Архивы старше 25.08 манифеста не несут. Отсутствие НЕ читается как полнота:
  # разряд называется НЕ ОБЪЯВЛЕННЫМ, и это видно в выводе.
  echo "  |   ⚠️  полнота сборки НЕ ОБЪЯВЛЕНА: манифеста backup-coverage.json в копии нет"
fi
# B-N-2101 r2: все пропуски сборщика — «в реестре есть, на диске нет» по путям, которые раздел 5 уже назвал 🟠 (нет и сейчас),
# непокрытых домов нет — это тот же вердикт «неполна по составу», а не второй отказ. Любой иной пропуск — код 1, как прежде.
if [ "$POLN_SOST" = net ] && [ "${P_SBORVSE:-net}" = da ] && [ "${NEPOLNA_SOSTAV:-0}" = 3 ]; then
  echo "  |   полнота сборки: пропуски сборщика — только пути, которых не было при сборке и нет сейчас (названы выше, 🟠)"
elif [ "$POLN_SOST" = net ]; then
  echo "🔴 КОПИЯ НЕПОЛНА ПО СЛОВУ СОБРАВШЕГО: перечень выше. Копия годна к восстановлению того, что в ней есть, но взято не всё объявленное." >&2
  zavershit 1
fi

# ── 5г. СНИМОК ACL ЛЕЖИТ В КОПИИ И СХОДИТСЯ СО СЛОВОМ СБОРЩИКА ──────────────
# B-N-1611 (05.10.2026, Аврора): tarfile ACL не хранит — копия теряла их у ВСЕХ путей (замер 05.10: 159 путей копии
# с расширенным ACL). Сборщик кладёт снимок getfacl записью backup-acl.txt и объявляет в манифесте поле acl
# {putej, oshibka}. Здесь: объявлен, а файла нет / сборщик записал ошибку снятия / число «# file: » в файле ≠ putej
# → копия негодна, код 1. Копия до B-N-1611 (поля acl нет) — только ⚠️: ACL в ней нет, и это называется в выводе.
# ⚠️ ЧЕГО НЕ ЛОВИТ: не сверяет снимок с ДИСКОМ (ACL, не попавший в снимок, отсюда не виден) и не применяет его;
# применение — шаг `setfacl --restore` порядка восстановления (VOSSTANOVLENIE-sadik.md).
ACL_ITOG="НЕ ОБЪЯВЛЕН — копия без снимка ACL (до B-N-1611); при восстановлении ACL вернуть нечем"
if [ -f "$POLN_MANIF" ]; then
  ACL_OTVET=$(MANIF="$POLN_MANIF" SNIMOK="$RAB/backup-acl.txt" python3 -c "
import json,os,sys
try:
    a=json.load(open(os.environ['MANIF'],encoding='utf-8')).get('acl')
    assert a is None or isinstance(a, dict), 'поле acl не объект'
except Exception as e:
    print('NECHITAEM ' + str(e)[:80]); sys.exit(2)
if a is None:
    print('NET_POLYA'); sys.exit(0)
if a.get('oshibka'):
    print('OSHIBKA ' + str(a['oshibka'])[:200]); sys.exit(1)
if not os.path.isfile(os.environ['SNIMOK']):
    print('NET_FAJLA объявлено путей ' + str(a.get('putej'))); sys.exit(1)
n=sum(1 for s in open(os.environ['SNIMOK'],'rb') if s.startswith(b'# file: '))
if n != a.get('putej'):
    print('NE_SHODITSYA в файле ' + str(n) + ', в манифесте ' + str(a.get('putej'))); sys.exit(1)
print('OK ' + str(n))
" 2>&1); ACL_RC=$?
  case "$ACL_RC:${ACL_OTVET%% *}" in
    0:NET_POLYA) echo "  |   ⚠️  снимок ACL НЕ ОБЪЯВЛЕН: в манифесте нет поля acl (копия до B-N-1611)" ;;
    0:OK) ACL_ITOG="в копии, путей с расширенным ACL ${ACL_OTVET#OK } (сходится с манифестом; на диск не применялся)"
          echo "  |   снимок ACL: $ACL_ITOG" ;;
    1:*) echo "🔴 СНИМОК ACL НЕГОДЕН: ${ACL_OTVET} — после восстановления ACL вернуть будет нечем" >&2; zavershit 1 ;;
    *) echo "СЛЕПОТА: снимок ACL не проверен: ${ACL_OTVET:-пустой ответ}" >&2; zavershit 2 ;;
  esac
else
  echo "  |   ⚠️  снимок ACL НЕ ОБЪЯВЛЕН: манифеста в копии нет"
fi

# ── 6. Подключения плагинов ─────────────────────────────────────────────────
# Замер 25.08: в профилях 13 подключений плагинов, и 11 из 12 наших НЕ объявлены
# в package.json профиля — существуют ТОЛЬКО как симлинк на диске. Значит
# внешнего источника у них нет: установка зависимостей их не создаст, потому
# что в манифесте их нет. Потеряв их, машина поднимется без моста инструментов,
# без канала связи и без goal-marker — и это будет выглядеть как «агент молчит».
#
# 🔴 ЗАЧЕМ ОТДЕЛЬНО ОТ РАЗДЕЛА 5. Тот сверяет архив с РАЗМЕТКОЙ. Вычеркни кто-то
# node_modules из разметки как «кэш» — раздел 5 промолчит: архив и разметка
# изменились согласованно. Здесь проверяется СВЯЗНОСТЬ САМОГО АРХИВА, и она от
# разметки не зависит.
#
# 🔴 ГДЕ НЕ ПРИМЕНЯЕТСЯ: не проверяет, что подключение РАБОТАЕТ (это делает
# платформа при подъёме) и что цель годна — только что симлинк и его цель едут
# вместе. Симлинки в app/node_modules сюда не входят намеренно: их цели —
# внутри дерева, исключённого из копии осознанно, и они восстановимы установкой.
if [ "$TOLKO_SEKRETY" = "1" ]; then
  echo "  подключения: НЕ ПРОВЕРЯЛИСЬ (запрошено --tolko-sekrety)"
  PODKL_ITOG="—"
else
PODKL=$(RAB="$RAB" python3 -c '
import os,glob,re,sys
rab=os.environ["RAB"]
exec(open(os.path.join(rab, ".indeks.py")).read())  # B-H-1427: симлинки и наличие целей — по указателю
IDX, KAT = zagruzit(rab)
najd=[]
for l in sorted(glob_v("*/*/.dsh/profiles/*/node_modules/*", IDX)) + sorted(glob_v("*/*/.dsh/profiles/node_modules/*", IDX)):
    if IDX[l][0] != "l": continue
    cel=IDX[l][1]
    if not cel.startswith("/"): continue
    # цели внутри app/node_modules исключены из копии осознанно — не наш предмет
    if "/app/node_modules/" in cel: continue
    najd.append(("/" + l, cel))
print("VSEGO", len(najd))

def patchi(otn):
    # дом = первые два сегмента пути: /opt/<агент>/...
    dom = "/".join(otn.strip("/").split("/")[:2])
    b = os.path.join(rab, dom, ".dsh")
    # ТОЛЬКО боевые патчи: .bak-* сюда попасть не должны — в страховочной копии
    # лежит прежняя, ещё смонтированная редакция, и по ней выведенный модуль
    # выглядел бы действующим. Замерено 25.08 на dsh-petrovich-telegram.
    return glob.glob(os.path.join(b,"cordis.patch.yml")) + \
           glob.glob(os.path.join(b,"profiles/*/cordis.patch.yml"))

for l,c in najd:
    if est_v(c.lstrip("/"), IDX, KAT): continue
    imya = os.path.basename(l.rstrip("/"))
    ps = patchi(l)
    if not ps:
        # Патчей дома в архиве нет — судить нечем. Это слепота, а НЕ «выведено»:
        # иначе потеря патчей молча погасила бы все тревоги этого раздела.
        print("SLEPOTA", l, "->", c); continue
    rx = re.compile(r"^[ \t]*-?[ \t]*name:[ \t]*" + re.escape(imya) + r"[ \t]*$", re.M)
    smont = any(rx.search(open(p, encoding="utf-8", errors="replace").read()) for p in ps)
    print("PROPAZHA" if smont else "VYVEDENO", l, "->", c)
' 2>/dev/null)
if [ -z "$PODKL" ]; then
  echo "🔴 СЛЕПОТА: проверка подключений не отработала" >&2
  zavershit 2
fi
PODKL_VSEGO=$(printf '%s' "$PODKL" | awk '/^VSEGO/{print $2}')
PODKL_NET=$(printf '%s' "$PODKL" | grep -c '^PROPAZHA' || true)
PODKL_VYV=$(printf '%s' "$PODKL" | grep -c '^VYVEDENO' || true)
PODKL_SLEP=$(printf '%s' "$PODKL" | grep -c '^SLEPOTA' || true)
echo "  подключения плагинов: $PODKL_VSEGO | цели нет: пропаж $PODKL_NET, выведенных $PODKL_VYV, неопределимых $PODKL_SLEP"
# Канарейка: ноль подключений означает не «чисто», а что их вычеркнули из копии.
if [ "${PODKL_VSEGO:-0}" -eq 0 ]; then
  echo "🔴 КОПИЯ НЕПОЛНА: подключений плагинов в архиве НЕТ НИ ОДНОГО." >&2
  echo "   Скорее всего node_modules профилей вычеркнули как кэш. Это не кэш:" >&2
  echo "   11 из 12 подключений не объявлены в package.json и иначе невосстановимы." >&2
  zavershit 1
fi
# Выведенное из работы подключение — не пропажа. Симлинк на модуль, который
# боевой патч не монтирует, это остаток прежней сборки: платформа его не ищет,
# и отсутствие цели в копии ничего не ломает. Печатаем числом и именем, кода
# НЕ поднимаем: ежедневная тревога о том, что чинить не нужно, за неделю
# приучает не читать тревоги — и настоящая пропажа утонет в ней.
if [ "$PODKL_VYV" -gt 0 ]; then
  echo "   выведенные из работы (цели нет, боевой патч их не монтирует — не пропажа):"
  printf '%s\n' "$PODKL" | awk '/^VYVEDENO/{$1=""; print "    " $0}'
fi
if [ "$PODKL_SLEP" -gt 0 ]; then
  echo "🔴 СЛЕПОТА: у $PODKL_SLEP подключений цели нет, а патчей их дома в архиве нет —" >&2
  echo "   определить, действующие они или выведенные, нечем:" >&2
  printf '%s\n' "$PODKL" | awk '/^SLEPOTA/{$1=""; print "    " $0}' >&2
  zavershit 2
fi
if [ "$PODKL_NET" -gt 0 ]; then
  echo "🔴 КОПИЯ НЕПОЛНА: у $PODKL_NET ДЕЙСТВУЮЩИХ подключений цель не поехала:" >&2
  printf '%s\n' "$PODKL" | awk '/^PROPAZHA/{$1=""; print "    " $0}' >&2
  # 🔴 Чинит ВЛАДЕЛЕЦ ДОМА, в котором лежит подключение: состав дома — его
  # решение, и дописывать за него в чужой реестр нельзя. Красным это остаётся
  # намеренно: подключение без цели — не косметика, а пропажа. Расхождение
  # стерпит и жёлтого, пропажа — нет.
  echo "   Чинится разметкой ТОГО дома, где лежит подключение: цель обязана быть в klast." >&2
  zavershit 1
fi
# Итог называет и выведенные: «цели на месте» при непустом их числе — неправда,
# а вердикт, соврав в мелочи, обесценивает обе свои половины.
if [ "$PODKL_VYV" -gt 0 ]; then
  PODKL_ITOG="$PODKL_VSEGO (из них выведенных из работы: $PODKL_VYV)"
else
  PODKL_ITOG="$PODKL_VSEGO"
fi
fi

# 🔴 ВЕРДИКТ НАЗЫВАЕТ СИЛУ ДОВОДА, А НЕ ТОЛЬКО ИТОГ (03.09.2026). Разряды ниже
# доказывают РАЗНОЕ, а в выводе выглядели одинаково: секреты проверены ДЕЙСТВИЕМ
# (ключ из копии открыл записи из той же копии), состав и подключения — НАЛИЧИЕМ
# (файл в архиве есть, симлинк и цель едут вместе). Наличие не означает, что файл
# откроется: у соседей по ферме прибор с именем «копия восстановима» проверял
# ровно один разряд и на него полагались как на весь.
# Имя, обещающее больше проверенного, опаснее отсутствия проверки — на него
# полагаются. Поэтому итог печатает, ЧЕМ именно доказан.
if [ "${SLEPOTA_POLNOTY:-0}" = 2 ]; then
  echo 'СЛЕПОТА: остались нераскрывшиеся образцы состава или неполная разметка реестра (названы выше); полного заключения нет' >&2
  zavershit 2
fi
if [ "$TOLKO_SEKRETY" = 1 ]; then
  echo "ЧАСТИЧНО: проверены $otkr секретов; полная приёмка не запрашивалась"
elif [ "${NEPOLNA_SOSTAV:-0}" = 3 ]; then
  echo "🟠 КОПИЯ ВОССТАНОВИМА, НО НЕПОЛНА ПО СОСТАВУ: все $otkr записей открыты ключом из копии; без ключа не открывается"
else
  echo "✅ ПРОФИЛЬ ПРИЁМКИ ПРОЙДЕН: все $otkr записей открыты ключом из копии; без ключа не открывается"
fi
echo "   ↑ это ДЕЙСТВИЕ: секрет из копии открыт ключом из копии. Ниже — НАЛИЧИЕ:"
if [ "$TOLKO_SEKRETY" = "1" ]; then
  # 🔴 ДВА СЛОВА «ПОЛНОТА» В ОДНОМ ВЫВОДЕ РАЗВЕДЕНЫ ЯВНО (20.09.2026, требование ворот).
  # Прежде здесь стояло «состав НЕ ПРОВЕРЯЛСЯ — этот ответ не говорит, что копия полна»,
  # а разрядом выше печаталось «сборщик объявил копию ПОЛНОЙ». Обе строки верны порознь
  # и противоречат друг другу в глазах читателя — он поверит той, что ближе к надежде.
  # Разные предметы: пофайловая сверка состава и слово сборщика о своих пропусках.
  echo "   состав: НЕ СВЕРЯЛСЯ пофайлово (запрошено --tolko-sekrety)"
  if [ "$POLN_SOST" = da ]; then
    echo "   полнота сборки: собрано БЕЗ ПРОПУСКОВ — но это СЛОВО СБОРЩИКА О СЕБЕ, а НЕ"
    echo "     пофайловая сверка. Это разные вещи, и ни одна не заменяет другую."
  else
    echo "   полнота сборки: НЕ ОБЪЯВЛЕНА — манифеста в копии нет. Состав не сверялся,"
    echo "     полнота не объявлена: про состав здесь НЕ СКАЗАНО НИЧЕГО."
  fi
else
  if [ "${NEPOLNA_SOSTAV:-0}" = 3 ]; then
    echo "   состав: в копии есть $((P_VSEGO-P_NETDISK)) из $P_VSEGO образцов разметки; $P_NETDISK нет ни в копии, ни на машине (названы выше)"
  else
    echo "   состав: все $P_VSEGO образцов разметки в копии есть (проверено НАЛИЧИЕМ, не открытием)"
  fi
  echo "   подключения плагинов: $PODKL_ITOG, цели действующих на месте"
  # 🔴 БАЗЫ НАЗЫВАЮТСЯ В ВЕРДИКТЕ, А НЕ ТОЛЬКО ПО ХОДУ. Довод (19.09.2026):
  # проверка открывала каждую .db и печатала строку ВЫШЕ вердикта, где та тонула.
  # Прибор проверял БОЛЬШЕ, чем объявлял в приговоре: доказательство снималось
  # и ТЕРЯЛОСЬ ПРИ ПЕРЕДАЧЕ — читающий вердикт не знал, что базы вообще смотрели.
  if [ "${BAZ_VSEGO:-0}" -gt 0 ]; then
    echo "   базы памяти: открыто $((BAZ_VSEGO-BAZ_BITYH)) из $BAZ_VSEGO (проверено ОТКРЫТИЕМ, не наличием)"
  else
    echo "   базы памяти: НЕ ПРОВЕРЕНЫ — ни одной .db в копии не нашлось"
  fi
  # 🔴 ПОЛНОТА НАЗЫВАЕТСЯ В ВЕРДИКТЕ ВМЕСТЕ С ГРАНИЦЕЙ (20.09.2026). Без второй строки
  # «полнота» читается шире проверенного: как будто копия взяла всё, что на машине есть.
  if [ "$POLN_SOST" = da ]; then
    echo "   полнота сборки: собрано БЕЗ ПРОПУСКОВ — по слову самого сборщика (манифест в копии)"
  elif [ "$POLN_SOST" = net ]; then
    echo "   полнота сборки: сборщик объявил пропуски — только пути, которых не было при сборке и нет сейчас (🟠 выше)"
  else
    echo "   полнота сборки: НЕ ОБЪЯВЛЕНА — манифеста в копии нет; это не «полна» и не «неполна»"
  fi
  echo "   ↑ это СЛОВО СБОРЩИКА О СЕБЕ: ловит «знал, что пропустил», НЕ ловит «не знал, что"
  echo "     надо взять». Источник вне реестра сюда не попадёт — это сторож покрытия."
fi
# 🔴 Вердикт печатает ОБЕ половины нарочно: «восстановима» без слова о составе
# читается шире, чем проверено. Граница, названная только в комментарии кода,
# до читателя вывода не доходит.
# 🔴 ЧЕГО ЭТОТ ОТВЕТ НЕ ЗНАЧИТ: что значения ГОДНЫ. Протухший токен расшифруется
# так же, как живой. Проверяется восстановимость, а не работоспособность.
# И не значит, что копия ПОЛНАЯ: состав — дело сторожа покрытия, здесь только
# ключ и хранилище.
echo "   снимок ACL: $ACL_ITOG"
[ "$TOLKO_SEKRETY" = 1 ] && zavershit 8
[ "${NEPOLNA_SOSTAV:-0}" = 3 ] && zavershit 3
zavershit 0
