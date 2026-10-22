# obshchee.sh — общее для скриптов окна dsh-autopilot; подключается через «.», сам не исполняется.
# Параметры окна — файл AP_PARAMS (образец — PARAMS.obrazec.env рядом): строки ИМЯ=значение, имена только AP_*.
# Значение берётся БУКВАЛЬНО — кавычки станут его частью. Пустые строки и строки с # в начале пропускаются.
# Всё иное — отказ кодом 2: неизвестный ввод не превращается в действие.
set -euo pipefail

ap_stop() { printf 'STOP: %s\n' "$*" >&2; exit 2; }

ap_zagruzit_params() {
  : "${AP_PARAMS:?путь файла параметров окна (образец — PARAMS.obrazec.env рядом со скриптами)}"
  local line key value
  while IFS= read -r line || [[ -n "$line" ]]; do
    [[ -z "$line" || "$line" == \#* ]] && continue
    [[ "$line" == *=* ]] || ap_stop "строка параметров без «=»: ${line:0:40}"
    key=${line%%=*}; value=${line#*=}
    [[ "$key" =~ ^AP_[A-Z0-9_]+$ ]] || ap_stop "имя параметра не AP_*: ${key:0:40}"
    printf -v "$key" '%s' "$value"; export "$key"
  done < "$AP_PARAMS"
  [[ -z "${AP_OBRAZEC:-}" ]] || ap_stop "$AP_PARAMS — образец со значениями окна 15.10: скопируй, заполни своим окном, строку AP_OBRAZEC убери"
  # Поправка 1 (r6): smontirovat-fajly (B-N-1551) отвергает --ruka не этой формы — и только на первом же файле блока 4.
  local re_ruka='^[^<>]+ <[^<> ]+@[^<> ]+>$'
  [[ "${AP_RUKA:-}" =~ $re_ruka ]] || ap_stop "AP_RUKA «${AP_RUKA:-}» — нужна форма «Имя <имя@машина>», без кавычек"
  # Постоянная машины: корень панелей. Одна на все скрипты (01 под root и 03 оператора); задаётся ПОСЛЕ файла параметров —
  # параметр с тем же именем её не перебивает. До 15.10 стояла только в 01, и 03 падал «AP_PUBLIC_ROOT: unbound variable».
  AP_PUBLIC_ROOT=/srv/autopilot/public
}

# Скрипты 02, 04, 06 и otkat.sh читают состояние окна из <SAVE>/env.sh, который пишет 01. Это source под root:
# каталог и файл обязаны быть root и закрыты на запись группе и прочим. Сам source — у вызывающего на верхнем
# уровне: env.sh состоит из «declare -x», а declare внутри функции делает переменные локальными.
ap_proverit_sostoyanie() {
  local save=$1 f
  [[ "$save" == /* ]] || ap_stop "нужен абсолютный путь каталога окна — строка SAVE= из 01-predpolyot.sh"
  for f in "$save" "$save/env.sh"; do
    [[ -e "$f" ]] || ap_stop "нет $f"
    [[ "$(stat -c '%u' -- "$f")" == 0 ]] || ap_stop "$f не root — source из него нельзя"
    (( (8#$(stat -c '%a' -- "$f") & 8#022) == 0 )) || ap_stop "$f открыт на запись группе или прочим — source из него нельзя"
  done
}

# План v6 §4: новый файл — дочерним окном smontirovat-fajly (прогон → бой → cmp → закрытие), ID сохраняется.
ap_new_file() {
  local AP_SRC="$1" AP_DST="$2" AP_FILE_MODE="$3"
  local AP_DIR AP_RESULT AP_ID AP_RC
  test "$(basename "$AP_SRC")" = "$(basename "$AP_DST")"
  # Охрана под set -e — только «{ A && B; } || stop»: голый «A && B» при ложном A проходит молча.
  { test -f "$AP_SRC" && ! test -L "$AP_SRC"; } || { printf 'STOP: источник %s — не обычный файл\n' "$AP_SRC" >&2; return 2; }
  AP_DIR=$(dirname "$AP_DST")
  test ! -e "$AP_DST" && test ! -L "$AP_DST" || {
    printf '%s\n' 'STOP: это новый файл; existing требует отдельного accepted update/join' >&2; return 2;
  }
  if test -d "$AP_DIR" && ! test -L "$AP_DIR"; then
    test "$(stat -c '%a:%u:%g' "$AP_DIR")" = '755:0:0'
  elif test ! -e "$AP_DIR" && test ! -L "$AP_DIR"; then
    install -d -m 0755 -o root -g root "$AP_DIR"
  else
    return 2
  fi
  /usr/local/sbin/smontirovat-fajly --punkt "$AP_TASK" --ruka "$AP_RUKA" \
    --progon --osnova "$(basename "$AP_SRC")=net" --novyj --mode="$AP_FILE_MODE" --owner=0:0 \
    "$(dirname "$AP_SRC")" "$AP_DIR" "$(basename "$AP_SRC")"
  AP_RC=0
  if AP_RESULT=$(/usr/local/sbin/smontirovat-fajly --punkt "$AP_TASK" --ruka "$AP_RUKA" \
    --v-boj --osnova "$(basename "$AP_SRC")=net" --novyj --mode="$AP_FILE_MODE" --owner=0:0 \
    "$(dirname "$AP_SRC")" "$AP_DIR" "$(basename "$AP_SRC")"); then
    printf '%s\n' "$AP_RESULT" >> "$AP_SAVE/smf-result.txt"
  else
    AP_RC=$?; printf '%s\n' "$AP_RESULT" >> "$AP_SAVE/smf-result.txt"
  fi
  AP_ID=$(printf '%s\n' "$AP_RESULT" | sed -nE 's/^ОКНО МОНТАЖА: ([0-9a-f]{32});.*/\1/p')
  { test "$(printf '%s\n' "$AP_ID" | wc -l)" -eq 1 && [[ "$AP_ID" =~ ^[0-9a-f]{32}$ ]]; } || {
    printf 'STOP: ID окна монтажа не разобран; монтаж мог состояться — разбор %s\n' "$AP_SAVE/smf-result.txt" >&2; return 2; }
  printf '%s\n' "$AP_ID" >> "$AP_CHILD_IDS"
  python3 -B - "$AP_ID" "$AP_SAVE" "$AP_DST" <<'PYCHILD'
import sys,json
ident,save,target=sys.argv[1:]
p='/var/lib/montazh-okna/'+ident+'.json'
r=json.load(open(p));assert r['subjects']==['file:'+target], 'STOP: нужен принятый entry join-plan'
# Baseline заранее доказан: конкретного regular target не было; нет других subjects.
plan={'subjects':r['subjects'],'checks':[{'kind':'absent','path':target}]}
with open(save+'/rollback-'+ident+'.json','x') as h:json.dump(plan,h)

PYCHILD
  test "$AP_RC" -eq 0 || { printf '%s\n' 'STOP: montage может быть в силе; ID сохранён, код требует разбора' >&2; return "$AP_RC"; }
  cmp -- "$AP_SRC" "$AP_DST"
  /usr/local/sbin/montazh-okno zakryt "$AP_ID"
}

# План v6 §3: ключ раздачи — обычный файл root 0600; печатается только sha256[:16], значение — нигде.
ap_klyuch_proverit() {
python3 -B - "$1" <<'PY'
import os,stat,re,sys,hashlib
p=sys.argv[1];st=os.lstat(p)
assert stat.S_ISREG(st.st_mode) and st.st_nlink==1
assert (st.st_uid,st.st_gid,stat.S_IMODE(st.st_mode))==(0,0,0o600)
with open(p,'rb') as h: data=h.read(66)
assert re.fullmatch(rb'[0-9a-f]{64}\n?',data)
print('key SHA256[:16]',hashlib.sha256(data).hexdigest()[:16])
PY
}

# Поправка 2 (r6): после enable --now / restart служба слушает порт не сразу — голый вызов давал 000.
# Повтор раз в 1 с, предел 15 с — назначено (Забава 15.10), не замер. Печатает ФАКТИЧЕСКОЕ время, чтобы следующее
# окно дало замер. Решает последний вызов: не 0 — функция возвращает его код, под set -e это STOP.
ap_zhdat_razdachu() {
  local zdorova=$1 t0 i ok=0
  t0=$(date +%s)
  for i in $(seq 15); do "$zdorova" >/dev/null 2>&1 && { ok=1; break; }; sleep 1; done
  if [[ "$ok" == 1 ]]; then echo "раздача поднялась за $(( $(date +%s) - t0 )) с"; else echo "раздача не поднялась за 15 с"; fi
  "$zdorova"
}

# Поправка 3 (r6): «$AP_DORABOTKI --check» на новых файлах окна законно отвечает 1 — под set -e это обрывало закрытие.
# Годно, только если КАЖДОЕ расхождение — путь из П7 окна (AP_P7_PATHS). Код 1 без строк расхождений (пары, хозяин,
# файлы вне учёта) и любой иной код — STOP. Формат строки расхождения: «±<класс>|<путь>|<сумма>».
ap_dorabotki_svoi() {
  local out rc=0 puti chuzhie
  out=$("$AP_DORABOTKI" --check) || rc=$?
  case "$rc" in
    0) echo "учёт: сходится"; return 0 ;;
    1) ;;
    *) printf '%s\n' "$out"; ap_stop "учёт --check: код $rc — отказ прибора, а не расхождение" ;;
  esac
  puti=$(printf '%s\n' "$out" | sed -n '/^РАСХОЖДЕНИЙ НАЙДЕНО/,$p' | sed -nE 's/^[-+][A-Z]\|([^|]+)\|.*/\1/p' | sort -u)
  [[ -n "$puti" ]] || { printf '%s\n' "$out"; ap_stop "учёт --check: код 1 без строк расхождений — причина не в файлах окна"; }
  chuzhie=$(printf '%s\n' "$puti" | grep -vxF -f "$AP_P7_PATHS" || true)
  [[ -z "$chuzhie" ]] || { printf '%s\n' "$chuzhie"; ap_stop "учёт: расхождения НЕ из П7 окна — чужое, разбор до закрытия"; }
  echo "учёт: расхождений $(printf '%s\n' "$puti" | wc -l), все из П7 окна"
}

# Поправка 4 (r6): у root нет личности git — коммит учёта падал. Личность — из AP_RUKA «Имя <имя@машина>».
ap_git_lichnost() {
  AP_GIT_NAME=${AP_RUKA% <*}
  AP_GIT_EMAIL=${AP_RUKA##*<}; AP_GIT_EMAIL=${AP_GIT_EMAIL%>}
}

# Поправка 5 (r6): запись реестра ссылается на метку пакета; правка раньше метки — тревога metki-mimo-vorot-watch.
ap_metka_est() {
  : "${AP_TREE_REPO:?дерево, где стоит метка пакета}" "${AP_TAG:?метка пакета dsh-autopilot-v<номер>}"
  git -c safe.directory="$AP_TREE_REPO" -C "$AP_TREE_REPO" rev-parse -q --verify "refs/tags/$AP_TAG^{commit}" >/dev/null \
    || ap_stop "метки $AP_TAG нет в $AP_TREE_REPO — сперва метка (ведущая дерева, TAG-ORDER), потом 06"
  echo "метка $AP_TAG стоит"
}
