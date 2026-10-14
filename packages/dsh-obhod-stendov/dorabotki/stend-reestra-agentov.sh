#!/usr/bin/env bash
# Приёмка реестра агентов. Гоняет УСТАНОВЛЕННЫЙ инструмент, а не копию:
# проверять надо то, что исполняется, а не то, что я написала.
#
# Коды: 0 всё сошлось | 1 есть FAIL | 2 слепота (нечего проверять)
#
# 🔴 ГДЕ НЕ ПРИМЕНЯЕТСЯ: стенд не трогает боевой /etc/agent-registry/agents.yaml
# и не правит сторожа машины. Все порчи — на подставных файлах во временном
# каталоге. Поэтому стенд НЕ доказывает, что боевой реестр верен; он доказывает,
# что инструмент отличает верное от неверного. Верность боевого — отдельная
# строка ниже, она просто прогоняет verify как есть.
set -u
export LC_ALL=C.UTF-8          # порядок сравнения не из окружения (урок 23.08)

INSTR="${INSTR:-/usr/local/bin/agent-registry}"
BOEVOY="${BOEVOY:-/etc/agent-registry/agents.yaml}"
ok=0; fail=0
skip=0   # непроверяемое ЭТОЙ рукой — не успех и не отказ
T="$(mktemp -d)"; trap 'rm -rf "$T"; sudo -n systemctl stop "b1890s$$-varvara.service" >/dev/null 2>&1' EXIT

# 🔴 Ширину считаем в ЗНАКАХ, а не в байтах: printf %-Ns у bash меряет байты,
# и кириллица разъезжает колонку. Тот же класс, что обрезка вывода по байтам.
say() { local t="$1"; local n=$(( 46 - $(printf '%s' "$t" | wc -m) ));
        [ "$n" -lt 1 ] && n=1; printf '%s%*s %s\n' "$t" "$n" "" "$2"; }
proverit() { # имя, ожидаемый_код, команда...
  local imya="$1" ozh="$2"; shift 2
  local out kod
  out="$("$@" 2>&1)"; kod=$?
  if [ "$kod" = "$ozh" ]; then ok=$((ok+1)); say "$imya" "ok (код $kod)"
  else fail=$((fail+1)); say "$imya" "FAIL ждали код $ozh, получили $kod"
       printf '      сырьё: %s\n' "$(printf '%s' "$out" | tail -3 | tr '\n' '|')"
       # B-N-1892: при провале — все строки не-ok целиком (мигание «verify сходится» иначе не поймать по хвосту)
       printf '%s\n' "$out" | grep -E 'расхождение|СЛЕПОТА' | head -12 | sed 's/^/      не-ok: /'; fi
}

[ -x "$INSTR" ] || { echo "СЛЕПОТА: нет инструмента $INSTR"; exit 2; }
[ -r "$BOEVOY" ] || { echo "СЛЕПОТА: нет боевого реестра $BOEVOY"; exit 2; }

# ── боевое состояние, без порчи ────────────────────────────────────────────
proverit "боевой реестр: verify сходится"            0 env AGENTS_REGISTRY="$BOEVOY" "$INSTR" verify
proverit "боевой реестр: list"                       0 env AGENTS_REGISTRY="$BOEVOY" "$INSTR" list
proverit "боевой реестр: fakt"                       0 env AGENTS_REGISTRY="$BOEVOY" "$INSTR" fakt

# службы: печатаются, без дублей, включая зависимости
sl="$(env AGENTS_REGISTRY="$BOEVOY" "$INSTR" sluzhby)"
n_vsego=$(printf '%s\n' $sl | wc -l); n_unik=$(printf '%s\n' $sl | sort -u | wc -l)
if [ "$n_vsego" = "$n_unik" ] && [ "$n_vsego" -ge 2 ] && printf '%s' "$sl" | grep -q 'gateway'; then
  ok=$((ok+1)); say "sluzhby: без дублей и с зависимостями" "ok ($n_vsego: $sl)"
else fail=$((fail+1)); say "sluzhby: без дублей и с зависимостями" "FAIL: $sl"; fi

# ── подставные реестры ─────────────────────────────────────────────────────
mk() { # mk <файл> <python-правка над d>
  python3 - "$BOEVOY" "$1" "$2" <<'EOF'
import sys,yaml
src,dst,patch=sys.argv[1],sys.argv[2],sys.argv[3]
d=yaml.safe_load(open(src,encoding='utf-8'))
exec(patch)
yaml.safe_dump(d,open(dst,'w',encoding='utf-8'),allow_unicode=True)
EOF
}

mk "$T/sluzhba.yaml"  "d['agenty'][0]['namerenie']['sluzhba']='net-takoy.service'"
proverit "порча: чужая служба -> расхождение"        1 env AGENTS_REGISTRY="$T/sluzhba.yaml" "$INSTR" verify
mk "$T/user.yaml"     "d['agenty'][0]['namerenie']['polzovatel']='chuzhoy'"
proverit "порча: чужой пользователь -> расхождение"  1 env AGENTS_REGISTRY="$T/user.yaml" "$INSTR" verify
mk "$T/dom.yaml"      "d['agenty'][0]['namerenie']['dom']='/opt/net-takogo'"
proverit "порча: чужой дом -> расхождение"           1 env AGENTS_REGISTRY="$T/dom.yaml" "$INSTR" verify
mk "$T/port.yaml"     "d['agenty'][0]['namerenie']['kak_proverit_zhiv']='curl -sf --max-time 3 http://127.0.0.1:3099/ >/dev/null'"
proverit "порча: мёртвый порт -> расхождение"        1 env AGENTS_REGISTRY="$T/port.yaml" "$INSTR" verify
mk "$T/model.yaml"    "d['agenty'][0]['namerenie']['model']='vydumannaya-model'"
proverit "порча: чужая модель -> расхождение"        1 env AGENTS_REGISTRY="$T/model.yaml" "$INSTR" verify
mk "$T/zavis.yaml"    "d['agenty'][0]['namerenie']['zavisit_ot']=['net-takoy.service']"
proverit "порча: мёртвая зависимость -> расхождение" 1 env AGENTS_REGISTRY="$T/zavis.yaml" "$INSTR" verify

# ── отказ вместо умолчания ─────────────────────────────────────────────────
mk "$T/bez-sluzhby.yaml" "del d['agenty'][0]['namerenie']['sluzhba']"
proverit "нет поля sluzhba -> отказ, не шаблон"      3 env AGENTS_REGISTRY="$T/bez-sluzhby.yaml" "$INSTR" pole iskra sluzhba
proverit "нет агента в реестре -> отказ"             3 env AGENTS_REGISTRY="$BOEVOY" "$INSTR" pole nikto sluzhba
proverit "есть агент и поле -> отдаёт"               0 env AGENTS_REGISTRY="$BOEVOY" "$INSTR" pole iskra port

# ── общемашинное не зависит от полноты агентов (B-H-186, #227-5) ───────────
# obshchee брал раздел через ramka(), а та отказывала кодом 3 на первом агенте без
# kopiya. Ждём: obshchee отдаёт раздел; строгий pokrytie на том же реестре отказывает
# по-прежнему; пустой раздел — по-прежнему отказ; ответ совпадает с pokrytie.
mk "$T/bez-kopii.yaml" "del d['agenty'][0]['namerenie']['kopiya']"
proverit "obshchee при агенте без kopiya -> отдаёт"  0 env AGENTS_REGISTRY="$T/bez-kopii.yaml" "$INSTR" obshchee --json
proverit "строгий pokrytie там же -> отказ, как был" 3 env AGENTS_REGISTRY="$T/bez-kopii.yaml" "$INSTR" pokrytie --json
mk "$T/bez-obshchego.yaml" "d['obshchee']=[]"
proverit "obshchee при пустом разделе -> отказ"      3 env AGENTS_REGISTRY="$T/bez-obshchego.yaml" "$INSTR" obshchee --json
o1="$(env AGENTS_REGISTRY="$BOEVOY" "$INSTR" obshchee --json 2>/dev/null)"
o2="$(env AGENTS_REGISTRY="$BOEVOY" "$INSTR" pokrytie --json 2>/dev/null | python3 -c 'import sys,json; print(json.dumps(json.load(sys.stdin)["obshchee"],ensure_ascii=False,sort_keys=True))' 2>/dev/null)"
if [ -n "$o1" ] && [ "$o1" = "$o2" ]; then ok=$((ok+1)); say "obshchee = pokrytie.obshchee (одно место)" "ok"
else fail=$((fail+1)); say "obshchee = pokrytie.obshchee (одно место)" "FAIL: разошлись или пусто (${#o1}/${#o2} зн.)"; fi

# ── слепота отделена от расхождения ────────────────────────────────────────
proverit "реестра нет -> слепота"                    2 env AGENTS_REGISTRY="$T/netu.yaml" "$INSTR" verify
printf 'это: [не, реестр\n' > "$T/bityi.yaml"
proverit "реестр не разбирается -> слепота"          2 env AGENTS_REGISTRY="$T/bityi.yaml" "$INSTR" verify
printf 'agenty: []\n' > "$T/pusto.yaml"
proverit "пустой список агентов -> слепота"          2 env AGENTS_REGISTRY="$T/pusto.yaml" "$INSTR" verify

# известная граница (snimaet: root) не поднимает код; НЕизвестная — поднимает
# B-N-1064 (26.09.2026, Аврора): «закрытый дом» — ПО СВОЙСТВУ, а не индексом. Было agenty[1]; там теперь petrovich, и его
# источник iskra ЧИТАЕТ (ACL user:iskra:--x на /opt/dsh и /opt/dsh/.dsh, файл 644) — проба «iskra» краснела, парная «root»
# зеленела ВПУСТУЮ (ветка «граница» не достигалась). Берём первого агента, чей источник НЕ читается этой рукой.
ZAKR=$(python3 - "$BOEVOY" <<'PY'
import os, sys, yaml
d = yaml.safe_load(open(sys.argv[1], encoding='utf-8'))
for i, a in enumerate(d['agenty']):
    p = ((a.get('namerenie') or {}).get('istochnik_modeli') or {}).get('fajl')
    if p and not os.access(p, os.R_OK):
        print(i); break
PY
)
if [ "$(id -un)" != root ] && [ -z "$ZAKR" ]; then
  say "snimaet=root на закрытом доме"  "ПРОПУСК: закрытого источника у этой руки нет"; skip=$((skip+1))
  say "snimaet=iskra на закрытом доме" "ПРОПУСК: закрытого источника у этой руки нет"; skip=$((skip+1))
elif [ "$(id -un)" != root ]; then
  mk "$T/granica.yaml" "d['agenty'][$ZAKR]['namerenie']['istochnik_modeli']['snimaet']='root'"
  mk "$T/slepota.yaml" "d['agenty'][$ZAKR]['namerenie']['istochnik_modeli']['snimaet']='$(id -un)'"
fi
if [ "$(id -un)" = root ]; then
  # Под root эти два случая непроверяемы ПО УСТРОЙСТВУ: у root права есть всегда,
  # значит «закрытый дом» не воспроизвести. Называем каждый пропуск отдельно —
  # один пропуск вместо двух случаев скрыл бы, что не измерено ДВА свойства.
  say "snimaet=root на закрытом доме"  "ПРОПУСК: рукой root источник читается"; skip=$((skip+1))
  say "snimaet=iskra на закрытом доме" "ПРОПУСК: рукой root источник читается"; skip=$((skip+1))
elif [ -n "$ZAKR" ]; then
  proverit "snimaet=root на закрытом доме -> код 0"  0 env AGENTS_REGISTRY="$T/granica.yaml" "$INSTR" verify
  proverit "snimaet=iskra на закрытом доме -> код 2" 2 env AGENTS_REGISTRY="$T/slepota.yaml" "$INSTR" verify
fi

# ── B-N-1890: живое-C у гостя после 95-gost — ПОДСТАВОЙ, не подменой функций ─────────
# Временный юнит systemd-run с настоящим RuntimeDirectory и GATEWAY_TOKEN_FILE в окружении процесса,
# подставной каталог env (AGENT_REGISTRY_KATALOG_C) и шаблон юнита (AGENT_REGISTRY_YUNIT_C). Боевой шлюз не трогается.
# Остановка: юнит гасится сразу после verify, сам умирает через 120 с, trap гасит при выходе.
# НЕ ловит: верен ли номер подписки гостя по реестру — только равенство имени файла env и процесса.
mkdir -p "$T/c"; printf 'GATEWAY_TOKEN_FILE=/etc/claude-oauth/token-podpiska-3\n' > "$T/c/instance-varvara.env"
gost_c() { # имя, ожидаемый вердикт строки varvara живое-C, путь токена в окружении процесса
  local imya="$1" ozh="$2" put="$3" u="b1890s$$-varvara" out str vd
  if ! sudo -n true 2>/dev/null; then say "$imya" "ПРОПУСК: нет sudo -n для systemd-run"; skip=$((skip+1)); return; fi
  sudo -n systemctl stop "$u.service" >/dev/null 2>&1
  if ! sudo -n systemd-run -q --unit="$u" -p RuntimeDirectory="$u" -E GATEWAY_TOKEN_FILE="$put" sleep 120 >/dev/null 2>&1; then
    fail=$((fail+1)); say "$imya" "FAIL: временный юнит $u не поднялся"; return; fi
  out="$(env AGENTS_REGISTRY="$BOEVOY" AGENT_REGISTRY_KATALOG_C="$T/c" AGENT_REGISTRY_YUNIT_C="b1890s$$-{}.service" "$INSTR" verify 2>&1)"
  sudo -n systemctl stop "$u.service" >/dev/null 2>&1
  str="$(printf '%s\n' "$out" | grep -E '^ +varvara +живое-C ')"
  # контроль зрячести: строка обязана быть о ПОДСТАВНОМ юните — иначе инструмент подставу не взял и смотрел бой
  case "$str" in *"процесса $u.service"*) ;; *)
    fail=$((fail+1)); say "$imya" "FAIL: подстава не взята (строки varvara о $u нет)"; return;; esac
  vd="$(printf '%s' "$str" | awk '{print $3}')"
  if [ "$vd" = "$ozh" ]; then ok=$((ok+1)); say "$imya" "ok ($vd)"
  else fail=$((fail+1)); say "$imya" "FAIL ждали $ozh, получили $vd"; printf '      сырьё: %s\n' "$str"; fi
}
gost_c "гость: другой номер -> расхождение"         "расхождение" "/run/b1890s$$-varvara/token-podpiska-2"
gost_c "гость: тот же номер, чужой каталог -> расх." "расхождение" "/run/chuzhoj-katalog-b1890/token-podpiska-3"
gost_c "гость: RuntimeDirectory, тот же номер -> ok" "ok"          "/run/b1890s$$-varvara/token-podpiska-3"

# ── потребитель: сторож машины не должен иметь своего списка ───────────────
printf 'SERVICES="iskra.service"\n' > "$T/wd-nepolnyi.conf"
proverit "служба реестра вне наблюдения -> расхождение" 1 \
  env AGENTS_REGISTRY="$BOEVOY" WATCHDOG_CONF="$T/wd-nepolnyi.conf" "$INSTR" verify
proverit "настройки сторожа нет -> слепота"          2 \
  env AGENTS_REGISTRY="$BOEVOY" WATCHDOG_CONF="$T/netu.conf" "$INSTR" verify

# ── субъект берётся не из окружения ────────────────────────────────────────
ruka="$(env AGENTS_REGISTRY="$BOEVOY" USER=podstavnoy "$INSTR" verify 2>&1 | sed -n '1s/.*рука: //p')"
if [ "$ruka" = "$(id -un)" ]; then ok=$((ok+1)); say "субъект не из \$USER" "ok (рука=$ruka)"
else fail=$((fail+1)); say "субъект не из \$USER" "FAIL: назвалась «$ruka», а я $(id -un)"; fi

echo "-------------------------------------------------------------------"
echo "сошлось: $ok   FAIL: $fail   ПРОПУЩЕНО: $skip"

# Канарейка: ТОЧНОЕ число проверок, не «не меньше». Порог слеп к убыли ровно
# того размера, который умещается в запас, и выглядит строже, чем работает:
# «не меньше» звучит как требование, а действует как разрешение.
# Замерено 25.08.2026 приёмом «сверься с соседом того же вида»: канарейка была
# у 3 стендов из 13. Вырезанный раздел проходил кодом 0 — выпотрошенный стенд
# отчитывался успехом.
ZHDYOM_PROVEROK=28   # 25 + 3 пробы гостя B-N-1890 (Михалыч 09.10)
if [ $((ok+fail+skip)) -ne $ZHDYOM_PROVEROK ]; then
  echo "СЛЕПОТА: проверок $((ok+fail+skip)), а стенд состоит из $ZHDYOM_PROVEROK — часть не состоялась."
  echo "         Меняли стенд намеренно? Поправьте ZHDYOM_PROVEROK и скажите, почему."
  exit 2
fi
[ "$fail" -eq 0 ] || exit 1
# Пропуск — не успех: код 2 означает «часть свойств этой рукой не измерена».
[ "$skip" -eq 0 ] || exit 2
exit 0
