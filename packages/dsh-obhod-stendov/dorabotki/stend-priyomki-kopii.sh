#!/usr/bin/env bash
# Приёмка инструмента приёмки копии (/usr/local/sbin/proverka-kopii.sh).
#
# Гоняет УСТАНОВЛЕННЫЙ инструмент на СВОЁМ ключе и СВОЁМ хранилище: боевой
# ключ и боевые 263 записи не распаковываются ни разу. Пути подставляются
# через подставной реестр (AGENTS_REGISTRY) — то есть проверяется и то, что
# инструмент действительно берёт их оттуда, а не из своих умолчаний.
#
# Коды: 0 сошлось | 1 расхождение | 2 слепота (проверить не удалось).
#
# 🔴 ГДЕ НЕ ПРИМЕНЯЕТСЯ — границы ОХВАТА, не воздействия:
#   * не проверяет БОЕВУЮ копию: её нет, адресат назван 25.08, скрипт сбора
#     пишет автор. Зелёный здесь означает «инструмент судит верно», а не
#     «копия годна»;
#   * не проверяет ФОРМАТ настоящего архива. Здесь архив собирается от корня
#     (tar -C), как задумано; соберёт сборщик иначе — инструмент скажет
#     «ключа нет», и это надо будет ловить первым настоящим прогоном;
#   * не проверяет ГОДНОСТЬ значений: протухший токен расшифруется как живой.
#     Ни инструмент, ни стенд про это ничего не знают;
#   * не проверяет ПОЛНОТУ состава копии — это сторож покрытия, отдельный
#     предмет и отдельная опора;
#   * ключ стенда — свой, беспарольный и одноразовый. Что боевой ключ
#     поднимается из боевой копии, доказывается не здесь, а прогоном
#     инструмента на настоящем архиве.
set -uo pipefail
export LC_ALL=C.UTF-8

INSTR="${PROVERKA_KOPII_BIN:-/usr/local/sbin/proverka-kopii.sh}"
BOEVOJ_REESTR="${BOEVOJ_REESTR:-/etc/agent-registry/agents.yaml}"
ok=0; bad=0; slep=0
sud(){ case "$1" in
    ok)   ok=$((ok+1));   printf '  ok    %-46s %s\n' "$2" "$3" ;;
    fail) bad=$((bad+1)); printf '  FAIL  %-46s %s\n' "$2" "$3" ;;
    *)    slep=$((slep+1)); printf '  СЛЕПОТА %-44s %s\n' "$2" "$3" ;;
  esac; }

[[ -x "$INSTR" ]] || { echo "СЛЕПОТА: нет исполняемого $INSTR"; exit 2; }
[[ -r "$BOEVOJ_REESTR" ]] || { echo "СЛЕПОТА: боевой реестр не читается — подставной не из чего строить"; exit 2; }
command -v gpg >/dev/null || { echo "СЛЕПОТА: нет gpg"; exit 2; }
command -v python3 >/dev/null || { echo "СЛЕПОТА: нет python3"; exit 2; }

T=$(mktemp -d /tmp/stend-kopii.XXXXXX) || { echo "СЛЕПОТА: нет временного каталога"; exit 2; }
chmod 700 "$T"
ubrat(){ chmod -R u+w "$T" 2>/dev/null || true; rm -rf "$T" 2>/dev/null || true; }
trap ubrat EXIT

echo "== приёмка инструмента: $INSTR =="

# ── свой одноразовый ключ ───────────────────────────────────────────────────
export GNUPGHOME="$T/kl"; mkdir -p "$GNUPGHOME"; chmod 700 "$GNUPGHOME"
gpg --batch --quiet --passphrase '' --quick-gen-key 'Stend Kopii <stend@proba>' default default never >/dev/null 2>&1
POLU="stend@proba"
if [[ $(gpg --batch --list-secret-keys 2>/dev/null | grep -c '^sec') -ne 1 ]]; then
  echo "СЛЕПОТА: свой ключ не завёлся — проверять нечем"; exit 2
fi

# ── подставной реестр: строится ИЗ БОЕВОГО, чтобы структура была настоящая ──
python3 - "$BOEVOJ_REESTR" "$T/reestr.yaml" <<'PY' || { echo "СЛЕПОТА: подставной реестр не собран"; exit 2; }
import sys, yaml
d = yaml.safe_load(open(sys.argv[1]))
m = d.get("mashina")
if not isinstance(m, dict):
    sys.exit("в боевом реестре нет раздела mashina")
for k in ("klyuch_gpg", "hranilishche_sekretov"):
    if not m.get(k):
        sys.exit(f"в боевом реестре нет поля {k}")
m["klyuch_gpg"] = "/probnyj-klyuch"
m["hranilishche_sekretov"] = "/probnoe-hranilishche"
yaml.safe_dump(d, open(sys.argv[2], "w"), allow_unicode=True)
PY

# ── сборщик подставного архива ──────────────────────────────────────────────
# $1 — каталог сборки; кладёт ключ и N секретов по подставным путям
sobrat(){
  local D="$1" n="${2:-5}" i
  mkdir -p "$D/probnyj-klyuch" "$D/probnoe-hranilishche/vetka"
  cp -a "$GNUPGHOME"/. "$D/probnyj-klyuch"/ 2>/dev/null
  for i in $(seq 1 "$n"); do
    printf 'znachenie-sekreta-%s\n' "$i" | gpg --batch --yes --quiet --trust-model always \
      -r "$POLU" -o "$D/probnoe-hranilishche/vetka/sekret-$i.gpg" --encrypt
  done
  printf '%s\n' "$POLU" > "$D/probnoe-hranilishche/.gpg-id"
}
upakovat(){ tar czf "$2" -C "$1" probnyj-klyuch probnoe-hranilishche 2>/dev/null; }
# 🔴 Расшифровочная часть проверяется с --tolko-sekrety. Причина в замере
# 25.08: инструмент научился судить о ПОЛНОТЕ состава по разметке машины,
# а фикстуры стенда — минимальные, полного состава в них нет и быть не
# должно. Без ключа стенд краснел на ИСПРАВНОМ инструменте: лечение одной
# проверки ломало другую. Полнота проверяется отдельными случаями ниже.
progon(){ AGENTS_REGISTRY="$T/reestr.yaml" "$INSTR" "$1" --tolko-sekrety >"$T/vyvod" 2>&1; echo $?; }
progon_polno(){ AGENTS_REGISTRY="$T/reestr.yaml" "$INSTR" "$1" >"$T/vyvod" 2>&1; echo $?; }

# ── 1. Целый архив: ожидается 0 и счёт ВСЕХ записей ─────────────────────────
D1="$T/celyj"; sobrat "$D1" 5; upakovat "$D1" "$T/celyj.tar.gz"
K=$(progon "$T/celyj.tar.gz")
# 🔴 С 20.09 (#231) --tolko-sekrety даёт 8 «пройден только частичный профиль», а не 0:
# полный профиль без проверки состава объявлять нельзя. Стенд ждал 0 и краснел с тех пор.
[[ "$K" == 8 ]] && sud ok "целый архив" "код 8 (частичный профиль)" || sud fail "целый архив" "код $K, ждали 8"
grep -q 'открылось 5 из 5' "$T/vyvod" \
  && sud ok "счёт: открылись ВСЕ записи" "5 из 5" \
  || sud fail "счёт: открылись ВСЕ записи" "нет строки «открылось 5 из 5»"
grep -q 'пути из реестра' "$T/vyvod" \
  && sud ok "пути взяты из реестра, а не свои" "строка есть" \
  || sud fail "пути взяты из реестра, а не свои" "инструмент не сказал, откуда пути"
grep -q '/probnoe-hranilishche' "$T/vyvod" \
  && sud ok "путь ПОДСТАВНОЙ, значит реестр читается" "виден в выводе" \
  || sud fail "путь ПОДСТАВНОЙ, значит реестр читается" "инструмент взял не наш путь"

# ── 2. Значения не печатаются ───────────────────────────────────────────────
if grep -q 'znachenie-sekreta' "$T/vyvod"; then
  sud fail "значение секрета НЕ печатается" "🔴 значение утекло в вывод"
else
  sud ok "значение секрета не печатается" "в выводе нет"
fi

# ── 3. Хранилище пусто, ключ на месте (тот самый случай, ради которого) ─────
D2="$T/bez-hran"; sobrat "$D2" 5; rm -f "$D2/probnoe-hranilishche/vetka"/*.gpg
upakovat "$D2" "$T/bez-hran.tar.gz"; K=$(progon "$T/bez-hran.tar.gz")
[[ "$K" == 1 ]] && sud ok "хранилище пусто, ключ есть" "код 1" || sud fail "хранилище пусто, ключ есть" "код $K, ждали 1"

# ── 4. Ключа нет, секреты на месте ──────────────────────────────────────────
D3="$T/bez-kl"; sobrat "$D3" 5; chmod -R u+w "$D3/probnyj-klyuch"; rm -rf "$D3/probnyj-klyuch"; mkdir -p "$D3/probnyj-klyuch"
upakovat "$D3" "$T/bez-kl.tar.gz"; K=$(progon "$T/bez-kl.tar.gz")
[[ "$K" == 1 ]] && sud ok "ключа в копии нет" "код 1" || sud fail "ключа в копии нет" "код $K, ждали 1"

# ── 5. Ключ ЧУЖОЙ: поднимается, но не открывает ─────────────────────────────
D4="$T/chuzhoj"; sobrat "$D4" 5
CH="$T/chuzhoj-gh"; mkdir -p "$CH"; chmod 700 "$CH"
GNUPGHOME="$CH" gpg --batch --quiet --passphrase '' --quick-gen-key 'Chuzhoj <chuzhoj@proba>' default default never >/dev/null 2>&1
chmod -R u+w "$D4/probnyj-klyuch"; rm -rf "$D4/probnyj-klyuch"; mkdir -p "$D4/probnyj-klyuch"
cp -a "$CH"/. "$D4/probnyj-klyuch"/ 2>/dev/null
upakovat "$D4" "$T/chuzhoj.tar.gz"; K=$(progon "$T/chuzhoj.tar.gz")
[[ "$K" == 1 ]] && sud ok "ключ чужой: поднялся, но не открыл" "код 1" || sud fail "ключ чужой: поднялся, но не открыл" "код $K, ждали 1"

# ── 6. 🔴 ЧАСТИЧНАЯ порча: 4 целых, 1 битый ────────────────────────────────
# Ради этого случая проверка и переведена с одной записи на все: прежняя
# редакция брала find|head -1, и копия с одним уцелевшим секретом проходила.
D5="$T/chastich"; sobrat "$D5" 5
printf 'ne-gpg-musor' > "$D5/probnoe-hranilishche/vetka/sekret-3.gpg"
upakovat "$D5" "$T/chastich.tar.gz"; K=$(progon "$T/chastich.tar.gz")
[[ "$K" == 1 ]] && sud ok "ОДИН битый из пяти ловится" "код 1" || sud fail "ОДИН битый из пяти ловится" "код $K, ждали 1 (проверяется не вся копия?)"
grep -q 'sekret-3.gpg' "$T/vyvod" \
  && sud ok "битая запись названа поимённо" "sekret-3.gpg" \
  || sud fail "битая запись названа поимённо" "имя не напечатано — разбирать будет нечем"

# ── 7. 🔴 Охрана вылеченного ложно-красного ────────────────────────────────
# Секрет, чья ПЕРВАЯ строка пуста, открывается целиком. Прежняя редакция
# мерила `--decrypt | head -1 | wc -c` и говорила «ключ не открывает секрет»
# на исправной копии. Если проверка вернётся к head -1 — этот случай покраснеет.
D6="$T/pustaya-pervaya"; sobrat "$D6" 5
printf '\nvtoraya-stroka\n' | gpg --batch --yes --quiet --trust-model always \
  -r "$POLU" -o "$D6/probnoe-hranilishche/vetka/sekret-1.gpg" --encrypt
upakovat "$D6" "$T/pustaya.tar.gz"; K=$(progon "$T/pustaya.tar.gz")
[[ "$K" == 8 ]] && sud ok "пустая первая строка НЕ ложно-красное" "код 8" || sud fail "пустая первая строка НЕ ложно-красное" "код $K, ждали 8 — вернулся head -1?"

# ── 8. Пустое значение — честный отказ, а не «открылось» ───────────────────
D7="$T/pustoe-znach"; sobrat "$D7" 5
printf '' | gpg --batch --yes --quiet --trust-model always \
  -r "$POLU" -o "$D7/probnoe-hranilishche/vetka/sekret-2.gpg" --encrypt
upakovat "$D7" "$T/pustoe.tar.gz"; K=$(progon "$T/pustoe.tar.gz")
[[ "$K" == 1 ]] && sud ok "пустое значение — отказ" "код 1" || sud fail "пустое значение — отказ" "код $K, ждали 1"

# ── 9. Немой читатель реестра -> СЛЕПОТА (2), а не приговор копии ──────────
K=$(CHITATEL=/net-takogo-chitatelya AGENTS_REGISTRY="$T/reestr.yaml" "$INSTR" "$T/celyj.tar.gz" --tolko-sekrety >"$T/vyvod" 2>&1; echo $?)
[[ "$K" == 2 ]] && sud ok "читателя нет -> код 2 (не состоялась)" "код 2" || sud fail "читателя нет -> код 2" "код $K, ждали 2"

# ── 10. Реестр без обязательного поля -> тоже 2 ────────────────────────────
python3 - "$T/reestr.yaml" "$T/bez-polya.yaml" <<'PY'
import sys, yaml
d = yaml.safe_load(open(sys.argv[1])); d["mashina"].pop("klyuch_gpg", None)
yaml.safe_dump(d, open(sys.argv[2], "w"), allow_unicode=True)
PY
K=$(AGENTS_REGISTRY="$T/bez-polya.yaml" "$INSTR" "$T/celyj.tar.gz" --tolko-sekrety >"$T/vyvod" 2>&1; echo $?)
[[ "$K" == 2 ]] && sud ok "реестр неполон -> код 2, не приговор копии" "код 2" || sud fail "реестр неполон -> код 2" "код $K, ждали 2"

# ── 11. Архива нет -> 2 ────────────────────────────────────────────────────
K=$(progon "$T/net-takogo.tar.gz")
[[ "$K" == 2 ]] && sud ok "архива нет -> код 2" "код 2" || sud fail "архива нет -> код 2" "код $K, ждали 2"

# ── 12. Структурно: своего списка путей в инструменте не осталось ──────────
# Проверка структуры, а не поведения: поведение можно случайно вернуть
# умолчанием ${KLYUCH_PUT:-...}, и стенд выше этого не заметит — подставной
# реестр отдаст те же пути, что умолчание, только если их совпало.
if grep -nE '^[[:space:]]*(KLYUCH_PUT|SEKRETY_PUT)=.*:-' "$INSTR" >/dev/null 2>&1; then
  sud fail "своего списка путей нет" "🔴 вернулось умолчание пути в коде"
else
  sud ok "своего списка путей нет" "умолчаний пути в коде не найдено"
fi

# ── 13. Контроль зрячести на месте ─────────────────────────────────────────
grep -q 'контроль зрячести' "$T/vyvod" 2>/dev/null || AGENTS_REGISTRY="$T/reestr.yaml" "$INSTR" "$T/celyj.tar.gz" --tolko-sekrety >"$T/vyvod" 2>&1
grep -q 'контроль зрячести' "$T/vyvod" \
  && sud ok "контроль зрячести исполняется" "строка есть" \
  || sud fail "контроль зрячести исполняется" "проверка, которая не умеет провалиться"

# ── 14-16. ПОЛНОТА СОСТАВА (заведено 25.08 вместе с проверкой в инструменте) ─
# Предмет здесь другой, чем в 1-13: там «открываются ли секреты», тут «есть ли
# чем восстанавливать». Замер, из-за которого проверка появилась: чужая копия
# sadik от 25.08 открывала все 263 секрета и НЕ содержала шлюза подписки,
# модулей каналов и состояния сторожей — 10 образцов из 54.
#
# 🔴 Разметку берём НАСТОЯЩУЮ (реестр машины), архив — подставной. Иначе стенд
# завёл бы свой список того, что должно быть в копии, а это ровно тот список
# внутри потребителя, против которого реестр и заводился.
POLN_T="$T/polnota"; mkdir -p "$POLN_T/koren"
if PUT_KL=$(/usr/local/bin/agent-registry mashina --json 2>/dev/null | python3 -c "
import sys,json; print(json.load(sys.stdin).get('klyuch_gpg',''))") && [[ -n "$PUT_KL" ]]; then
  # ключ и хранилище берём из ЦЕЛОГО стендового архива — они там уже подставные
  tar xzf "$T/celyj.tar.gz" -C "$POLN_T/koren" 2>/dev/null
  # раскрываем разметку по живой машине и кладём пустышки
  /usr/local/bin/agent-registry pokrytie --json 2>/dev/null | K="$POLN_T/koren" python3 -c "
import sys,json,os,glob
d=json.load(sys.stdin); K=os.environ['K']; celi=set()
# 🔴 Разметка бывает ВЛОЖЕННОЙ (у iskra и workspace, и workspace/dorabotki). Пустышка-ФАЙЛ
# на месте родителя не даёт создать ребёнка: фикстура падала молча (2>/dev/null) и
# «полная» копия выходила без 143 образцов из 173. Поэтому сначала собрать все цели,
# потом класть: у кого есть дети или кто каталог на машине — каталогом, прочие — файлом.
for a,dom in d['doma'].items():
    for o in d['komnaty'].get(a,{}).get('klast',[]):
        put=o if o.startswith('/') else os.path.join(dom,o)
        celi.update(glob.glob(put) or ([put] if '*' not in put else []))
for it in d['obshchee']:
    celi.update(glob.glob(it['put']) or [it['put']])
roditeli={os.path.dirname(c) for c in celi}
for c in sorted(celi):
    t=os.path.join(K,c.lstrip('/'))
    if c in roditeli or os.path.isdir(c):
        os.makedirs(t,exist_ok=True)
    else:
        os.makedirs(os.path.dirname(t),exist_ok=True)
        if not os.path.exists(t): open(t,'w').write('x')
print(len(celi), file=sys.stderr)
" 2>/dev/null
  PR="$POLN_T/koren/opt/iskra/.dsh/profiles/proba/node_modules"
  # 🔴 Фикстура кладёт пустышки-ФАЙЛЫ там, где на машине каталоги (образец
  # засчитан одним предметом). Под такой пустышкой каталога не создать —
  # снимаем её, иначе стенд падает не на предмете, а на своей же фикстуре.
  for pu in "$POLN_T/koren/opt/iskra/plugins" "$POLN_T/koren/opt/iskra/.dsh"; do
    [[ -f "$pu" ]] && rm -f "$pu"
  done
  mkdir -p "$PR" "$POLN_T/koren/opt/iskra/plugins/proba-cel"
  echo x > "$POLN_T/koren/opt/iskra/plugins/proba-cel/index.js"
  ln -sfn /opt/iskra/plugins/proba-cel "$PR/proba-podkl"
  # 🔴 Подключение считается ДЕЙСТВУЮЩИМ, только если боевой патч его монтирует.
  # Без патча приёмка честно отвечает СЛЕПОТА, и порча «цель не поехала» покраснела
  # бы по ЧУЖОЙ причине — красное сразу по двум основаниям не доказывает ни одного.
  # Фикстуры разведены: действующее, выведенное и неопределимое проверяются порознь.
  printf -- '- insert:\n    - id: proba\n      name: proba-podkl\n' \
    > "$POLN_T/koren/opt/iskra/.dsh/profiles/proba/cordis.patch.yml"
  ( cd "$POLN_T/koren" && tar czf "$POLN_T/polnaya.tar.gz" . 2>/dev/null )
  K=$(progon_polno "$POLN_T/polnaya.tar.gz")
  [[ "$K" == "0" ]] \
    && sud ok "полный состав -> код 0" "не кричит безусловно" \
    || sud fail "полный состав -> код 0" "код $K — ЛОЖНО-КРАСНОЕ на полной копии"
  grep -q 'состав: все' "$T/vyvod" \
    && sud ok "вердикт называет состав" "строка есть" \
    || sud fail "вердикт называет состав" "«восстановима» без слова о составе читается шире, чем проверено"
  # ── подключения плагинов ─────────────────────────────────────────────────
  # 🔴 Фикстура «полной копии» строится по образцам разметки и потому НЕ содержит
  # подключений: образец `.dsh` засчитывается одним предметом. Без этой добавки
  # стенд краснел бы на исправной приёмке — ложно-красное от неполной фикстуры,
  # а не от предмета. Кладём одно настоящее подключение: симлинк + его цель.
  K=$(progon_polno "$POLN_T/polnaya.tar.gz")
  [[ "$K" == "0" ]] \
    && sud ok "подключение с целью -> код 0" "не кричит на исправном" \
    || sud fail "подключение с целью -> код 0" "код $K — ложно-красное"

  # порча A: цель не поехала
  rm -rf "$POLN_T/koren/opt/iskra/plugins/proba-cel"
  ( cd "$POLN_T/koren" && tar czf "$POLN_T/podkl-bez-celi.tar.gz" . 2>/dev/null )
  K=$(progon_polno "$POLN_T/podkl-bez-celi.tar.gz")
  if [[ "$K" == "1" ]] && grep -q 'proba-podkl' "$T/vyvod"; then
    sud ok "цель подключения не поехала -> ловится и названа" "proba-podkl"
  else
    sud fail "цель подключения не поехала -> ловится и названа" "код $K, имени в выводе $(grep -c 'proba-podkl' "$T/vyvod")"
  fi

  # порча А2: патча дома в копии нет — судить, действующее оно или выведенное, нечем.
  # Это СЛЕПОТА (2), а не «выведено»: иначе потеря патчей молча погасила бы весь раздел.
  PATCH="$POLN_T/koren/opt/iskra/.dsh/profiles/proba/cordis.patch.yml"
  mv "$PATCH" "$PATCH.otlozhen"
  ( cd "$POLN_T/koren" && tar czf "$POLN_T/podkl-bez-patcha.tar.gz" . 2>/dev/null )
  K=$(progon_polno "$POLN_T/podkl-bez-patcha.tar.gz")
  if [[ "$K" == "2" ]] && grep -q 'СЛЕПОТА' "$T/vyvod"; then
    sud ok "цели нет и патча нет -> слепота, не приговор" "код 2"
  else
    sud fail "цели нет и патча нет -> слепота, не приговор" "код $K"
  fi

  # порча А3: патч есть, но подключение он НЕ монтирует — выведенный остаток.
  # Ожидание код 0: ежедневная тревога о том, что чинить не нужно, за неделю
  # приучает не читать тревоги, и настоящая пропажа в ней утонет.
  printf -- '- insert:\n    - id: proba\n      name: sovsem-drugoe\n' > "$PATCH"
  ( cd "$POLN_T/koren" && tar czf "$POLN_T/podkl-vyveden.tar.gz" . 2>/dev/null )
  K=$(progon_polno "$POLN_T/podkl-vyveden.tar.gz")
  if [[ "$K" == "0" ]] && grep -q 'выведен' "$T/vyvod"; then
    sud ok "выведенное подключение -> код 0 и названо" "не пропажа"
  else
    sud fail "выведенное подключение -> код 0 и названо" "код $K, слова «выведен» в выводе $(grep -c 'выведен' "$T/vyvod")"
  fi
  # возврат фикстуры к действующей — иначе следующая порча красит по чужой причине
  printf -- '- insert:\n    - id: proba\n      name: proba-podkl\n' > "$PATCH"
  rm -f "$PATCH.otlozhen"

  # порча Б: подключений нет вовсе — канарейка «ноль это не чисто»
  rm -rf "$POLN_T/koren/opt/iskra/.dsh/profiles/proba"
  ( cd "$POLN_T/koren" && tar czf "$POLN_T/podkl-net.tar.gz" . 2>/dev/null )
  K=$(progon_polno "$POLN_T/podkl-net.tar.gz")
  if [[ "$K" == "1" ]] && grep -q 'НЕ кэш\|Это не кэш' "$T/vyvod"; then
    sud ok "ноль подключений -> канарейка" "ноль читается как вычеркнули, а не как чисто"
  else
    sud fail "ноль подключений -> канарейка" "код $K"
  fi

  # порча: убрать ОДИН образец
  # 🔴 Возвращаем подключение ПЕРЕД следующей порчей: иначе красное придёт по
  # ДВУМ причинам сразу (нет образца И нет подключений), и случай не докажет
  # ни одной. Проверка, краснеющая по нескольким причинам, не проверяет ничего.
  mkdir -p "$PR" "$POLN_T/koren/opt/iskra/plugins/proba-cel"
  echo x > "$POLN_T/koren/opt/iskra/plugins/proba-cel/index.js"
  ln -sfn /opt/iskra/plugins/proba-cel "$PR/proba-podkl"
  UB=$(/usr/local/bin/agent-registry pokrytie --json 2>/dev/null | python3 -c "
import sys,json; print(json.load(sys.stdin)['obshchee'][0]['put'])")
  rm -rf "$POLN_T/koren/${UB#/}"
  ( cd "$POLN_T/koren" && tar czf "$POLN_T/porcha.tar.gz" . 2>/dev/null )
  K=$(progon_polno "$POLN_T/porcha.tar.gz")
  if [[ "$K" == "1" ]] && grep -q "$UB" "$T/vyvod"; then
    sud ok "пропажа образца ловится и названа" "$UB"
  else
    sud fail "пропажа образца ловится и названа" "код $K, имени в выводе $(grep -c "$UB" "$T/vyvod")"
  fi

  # ── ВОЗРАСТ РЕЕСТРА ПРОТИВ ВОЗРАСТА КОПИИ ────────────────────────────────
  # 🔴 ЗАЧЕМ. Список образцов берётся из ЖИВОГО реестра, а наличие ищется во
  # ВЧЕРАШНЕЙ копии. Образец, внесённый в реестр ПОСЛЕ снятия копии, физически
  # не мог в неё попасть — и до этой правки прибор называл это «КОПИЯ НЕПОЛНА»,
  # то есть выбирал одно из двух чтений и подавал его как факт. Случай не
  # выдуман: 06.09 он дал 7 из 74 на исправной копии.
  # ЖДЁМ ЛОЖНУЮ ТРЕВОГУ, НЕ ПРОПУСК: до правки прибор кричит «пропало» там,
  # где верно «не успело». Проба ловит именно ложный крик.
  # ⚠️ ГДЕ НЕ ПРИМЕНЯЕТСЯ: слепота не оправдывает копию. Код 2 ведёт себя как
  # «нельзя»; отличается только ИМЯ беды, а не право поднимать.
  REESTR_MT=$(date -u -d "@$(stat -c %Y "$T/reestr.yaml")" +%Y-%m-%dT%H:%M:%SZ)
  RANO=$(date -u -d "@$(( $(stat -c %Y "$T/reestr.yaml") - 3600 ))" +%Y-%m-%dT%H:%M:%SZ)
  POZDNO=$(date -u -d "@$(( $(stat -c %Y "$T/reestr.yaml") + 3600 ))" +%Y-%m-%dT%H:%M:%SZ)

  # половина 1: копия СТАРШЕ реестра, а ИСТОРИИ реестра нет (подставной реестр не в git) — отказ с причиной, код 2.
  # До B-N-1957 здесь ждали «РЕЕСТР НОВЕЕ КОПИИ» (код 2); теперь разметку берут из git на момент копии,
  # и без git её взять неоткуда — это и есть причина, она обязана быть названа.
  K=$(AGENTS_REGISTRY="$T/reestr.yaml" "$INSTR" --kopiya-snyata "$RANO" "$POLN_T/porcha.tar.gz" >"$T/vyvod" 2>&1; echo $?)
  if [[ "$K" == "2" ]] && grep -q 'истории реестра нет' "$T/vyvod"; then
    sud ok "копия старше реестра, истории нет -> отказ с причиной" "код 2, причина названа"
  else
    sud fail "копия старше реестра, истории нет -> отказ с причиной" "код $K, строки «истории реестра нет» в выводе $(grep -c 'истории реестра нет' "$T/vyvod")"
  fi

  # половина 2: копия МОЛОЖЕ реестра — пропажа настоящая, отказ остаётся
  K=$(AGENTS_REGISTRY="$T/reestr.yaml" "$INSTR" --kopiya-snyata "$POZDNO" "$POLN_T/porcha.tar.gz" >"$T/vyvod" 2>&1; echo $?)
  if [[ "$K" == "1" ]] && grep -q "$UB" "$T/vyvod"; then
    sud ok "копия моложе реестра -> пропажа остаётся отказом" "код 1, образец назван"
  else
    sud fail "копия моложе реестра -> пропажа остаётся отказом" "код $K — защита ослаблена правкой"
  fi

  # ── B-N-1957 (10.10.2026, Заря): РАЗМЕТКА НА МОМЕНТ КОПИИ ИЗ GIT РЕЕСТРА ───────────────────
  # 09.10 приёмка ослепла: в реестр внесли образец через 2 ч 49 мин после старта сборки, и
  # «внесено после копии» не отличалось от «было и пропало». Реестр стенда кладём в СВОЙ git:
  # коммит c1 (час до копии) — как есть, c2 (через полчаса после копии) — плюс образец, которого в
  # копии нет. Рабочий файл = c2 и новее копии, то есть ровно случай 09.10.
  G="$T/rg"; mkdir -p "$G"; cp "$T/reestr.yaml" "$G/agents.yaml"
  SNY_S=$(( $(date -u +%s) - 7200 )); SNY=$(date -u -d "@$SNY_S" +%Y-%m-%dT%H:%M:%SZ)
  C1=$(date -u -d "@$(( SNY_S - 3600 ))" +%Y-%m-%dT%H:%M:%SZ); C2=$(date -u -d "@$(( SNY_S + 1800 ))" +%Y-%m-%dT%H:%M:%SZ)
  RANEE=$(date -u -d "@$(( SNY_S - 7200 ))" +%Y-%m-%dT%H:%M:%SZ)
  VNES="/opt/b1957-vneseno-posle-kopii"
  gk(){ GIT_AUTHOR_DATE="$1" GIT_COMMITTER_DATE="$1" git -C "$G" -c user.name=stend -c user.email=stend@proba commit -q -m "$2"; }
  if git -C "$G" init -q 2>/dev/null && git -C "$G" add agents.yaml && gk "$C1" c1 \
     && python3 - "$G/agents.yaml" "$VNES" <<'PY' && git -C "$G" add agents.yaml && gk "$C2" c2
import sys, yaml
p, put = sys.argv[1], sys.argv[2]
d = yaml.safe_load(open(p)); d['obshchee'].append({'put': put, 'zachem': 'проба B-N-1957: внесено после копии'})
yaml.safe_dump(d, open(p, 'w'), allow_unicode=True, sort_keys=False)
PY
  then
    # исправное: реестр НЕ новее копии — разметка нынешняя, полная копия молчит (код 0)
    K=$(AGENTS_REGISTRY="$T/reestr.yaml" "$INSTR" --kopiya-snyata "$POZDNO" "$POLN_T/polnaya.tar.gz" >"$T/vyvod" 2>&1; echo $?)
    if [[ "$K" == "0" ]] && grep -q 'не новее копии' "$T/vyvod"; then
      sud ok "B-N-1957 исправное: реестр не новее -> код 0" "разметка нынешняя, названа"
    else
      sud fail "B-N-1957 исправное: реестр не новее -> код 0" "код $K"
    fi
    # реестр новее копии, образец внесён ПОСЛЕ — НЕ слепота: разметка из c1, образец не требуется, код 0
    K=$(AGENTS_REGISTRY="$G/agents.yaml" "$INSTR" --kopiya-snyata "$SNY" "$POLN_T/polnaya.tar.gz" >"$T/vyvod" 2>&1; echo $?)
    if [[ "$K" == "0" ]] && grep -q 'разметка состава: git' "$T/vyvod" && ! grep -q "$VNES" "$T/vyvod"; then
      sud ok "B-N-1957 внесено после копии -> не слепота" "код 0, разметка из git"
    else
      sud fail "B-N-1957 внесено после копии -> не слепота" "код $K, «разметка состава: git» $(grep -c 'разметка состава: git' "$T/vyvod"), имя внесённого $(grep -c "$VNES" "$T/vyvod")"
    fi
    # тот же реестр, а образец, бывший ДО копии, реально пропал — красное с именем, код 1
    K=$(AGENTS_REGISTRY="$G/agents.yaml" "$INSTR" --kopiya-snyata "$SNY" "$POLN_T/porcha.tar.gz" >"$T/vyvod" 2>&1; echo $?)
    if [[ "$K" == "1" ]] && grep -q "$UB" "$T/vyvod"; then
      sud ok "B-N-1957 пропал при реестре новее -> отказ с именем" "код 1, $UB"
    else
      sud fail "B-N-1957 пропал при реестре новее -> отказ с именем" "код $K, имени в выводе $(grep -c "$UB" "$T/vyvod")"
    fi
    # граница: в git нет коммита не новее копии — отказ с причиной, код 2
    K=$(AGENTS_REGISTRY="$G/agents.yaml" "$INSTR" --kopiya-snyata "$RANEE" "$POLN_T/polnaya.tar.gz" >"$T/vyvod" 2>&1; echo $?)
    if [[ "$K" == "2" ]] && grep -q 'нет коммита' "$T/vyvod"; then
      sud ok "B-N-1957 нет коммита старше копии -> отказ" "код 2, причина названа"
    else
      sud fail "B-N-1957 нет коммита старше копии -> отказ" "код $K, «нет коммита» $(grep -c 'нет коммита' "$T/vyvod")"
    fi
  else
    for n in "исправное" "внесено после" "пропал" "нет коммита"; do sud slep "B-N-1957 $n" "git-реестр стенда не собран"; done
  fi

  # ── ВХОД РЕЕСТРА С НЕПОЛНЫМИ (B-H-183, #227-2) ──────────────────────────────
  # Строгий `pokrytie --json` отказывает КОДОМ 3 целиком, если хоть у одного агента
  # нет разметки копии, — и приёмка теряла проверку состава ВСЕХ агентов разом.
  # Новый вход отдаёт карту полных и поимённо неполных (код 4). Ждём: неполный назван,
  # остальные проверены, итог 2 (полного заключения нет), а не 0 и не «не состоялась».
  # Подставной читатель зовёт настоящий; меняет только ответ на новый вход.
  cat > "$T/chitatel" <<'CH'
#!/usr/bin/env bash
real=/usr/local/bin/agent-registry
if [[ "$*" == "pokrytie --json --s-nepolnymi" ]]; then
  case "${FAKE_REZHIM:-}" in
    otkaz3) echo "подставной отказ" >&2; exit 3 ;;
    staryj) exec "$real" pokrytie --json ;;
    nepoln) "$real" pokrytie --json --s-nepolnymi | python3 -c "
import sys,json; d=json.load(sys.stdin); d['polnoe']=False
d['nepolnye']=[{'imya':'prizrak-stenda','prichiny':['нет словаря namerenie.kopiya']}]
print(json.dumps(d,ensure_ascii=False))"; exit 4 ;;
    # B-N-873 (25.09.2026, Заря; ворота Вениамина B-H-183) — два режима для проб 31/32:
    # kod3v1: код 3 при теле ПО ДОГОВОРУ v1 (polnoe=false, nepolnye пуст). Сверка договора такое пропускает:
    #   (kod=='0') ложно и (polnoe и пусто) ложно — равны. Держит ТОЛЬКО проверка кода (kod not in 0,4).
    kod3v1) "$real" pokrytie --json --s-nepolnymi | python3 -c "
import sys,json; d=json.load(sys.stdin); d['polnoe']=False; d['nepolnye']=[]
print(json.dumps(d,ensure_ascii=False))"; exit 3 ;;
    # neraskr: полная рамка (код 0, неполных нет) + одна маска, которой на машине НЕТ ⇒ единственная причина слепоты —
    #   нераскрывшийся образец (ветка NERASKR -> SLEPOTA_POLNOTY=2). Без этого режима порча там была зелёной 30/30.
    neraskr) "$real" pokrytie --json --s-nepolnymi | python3 -c "
import sys,json; d=json.load(sys.stdin); d['polnoe']=True; d['nepolnye']=[]
a=sorted(d['doma'])[0]; d.setdefault('komnaty',{}).setdefault(a,{}).setdefault('klast',[]).append('/net-takogo-stend-kopii-*')
print(json.dumps(d,ensure_ascii=False))"; exit 0 ;;
    # C-H-490 (02.10.2026, Заря): pusto — ответ по договору (код 0, полная рамка, неполных нет), но без единого образца:
    #   «каждый образец есть в копии» на пустом множестве истинно — без защиты приёмка давала ✅ код 0.
    pusto) "$real" pokrytie --json --s-nepolnymi | python3 -c "
import sys,json; d=json.load(sys.stdin); d['polnoe']=True; d['nepolnye']=[]; d['doma']={}; d['komnaty']={}; d['obshchee']=[]
print(json.dumps(d,ensure_ascii=False))"; exit 0 ;;
    # B-N-1435 (3) (02.10.2026, Аврора; случай C9 Зари, B-H-1427 C2): bolshoj — ответ по договору, раздутый выше предела
    #   строки окружения 131 072 Б. Ловит «ответ реестра через окружение» НЕЗАВИСИМО от размера реального реестра
    #   (02.10 07:18Z бой давал 21/33 на ответе 137 340 Б; в 07:24Z ответ ужался до 105 858 Б — дефект заснул).
    bolshoj) "$real" pokrytie --json --s-nepolnymi | python3 -c "
import sys,json; d=json.load(sys.stdin); d['polnoe']=True; d['nepolnye']=[]; d['_dobavka_proby_c9']='x'*140000
print(json.dumps(d,ensure_ascii=False))"; exit 0 ;;
    # B-N-2101 (17.10.2026, Искра): prizrak — полная рамка + общий образец БЕЗ маски, которого нет на машине (16.10: priyomka и
    #   .config пятерых сняты с машины, разметка осталась). Копия взять его не могла — вердикт «неполна по составу», не «не восстановима».
    prizrak) "$real" pokrytie --json --s-nepolnymi | python3 -c "
import sys,json; d=json.load(sys.stdin); d['polnoe']=True; d['nepolnye']=[]
d.setdefault('obshchee',[]).append({'put':'/net-takogo-puti-stend-b2101','zachem':'проба B-N-2101'})
print(json.dumps(d,ensure_ascii=False))"; exit 0 ;;
  esac
fi
exec "$real" "$@"
CH
  chmod +x "$T/chitatel"
  pn(){ FAKE_REZHIM="$1" CHITATEL="$T/chitatel" AGENTS_REGISTRY="$T/reestr.yaml" "$INSTR" "$POLN_T/polnaya.tar.gz" >"$T/vyvod" 2>&1; echo $?; }
  K=$(pn nepoln)
  if [[ "$K" == 2 ]] && grep -q 'prizrak-stenda' "$T/vyvod" && grep -q 'состав: образцов разметки' "$T/vyvod"; then
    sud ok "неполный агент назван, прочие проверены" "код 2"
  else
    sud fail "неполный агент назван, прочие проверены" "код $K, имени $(grep -c prizrak-stenda "$T/vyvod"), строки состава $(grep -c 'состав: образцов' "$T/vyvod")"
  fi
  K=$(pn otkaz3)
  [[ "$K" == 2 ]] && grep -q 'ПРОВЕРКА НЕ СОСТОЯЛАСЬ' "$T/vyvod" \
    && sud ok "отказ нового входа -> не состоялась" "код 2" \
    || sud fail "отказ нового входа -> не состоялась" "код $K"
  K=$(pn staryj)
  [[ "$K" == 2 ]] && grep -q 'ПРОВЕРКА НЕ СОСТОЯЛАСЬ' "$T/vyvod" \
    && sud ok "ответ без договора нового входа -> не состоялась" "код 2" \
    || sud fail "ответ без договора нового входа -> не состоялась" "код $K"
  # 31 (B-N-873): код 3 при теле по договору ⇒ не состоялась. Порча «снята проверка кода» ⇒ код 0 — краснеет.
  K=$(pn kod3v1)
  [[ "$K" == 2 ]] && grep -q 'ПРОВЕРКА НЕ СОСТОЯЛАСЬ' "$T/vyvod" \
    && sud ok "31 код 3 при теле v1 -> не состоялась" "код 2" \
    || sud fail "31 код 3 при теле v1 -> не состоялась" "код $K — проверка кода входа не держит"
  # 32 (B-N-873): нераскрывшийся образец ⇒ слепота полноты, код 2. Порча «:NERASKR без SLEPOTA_POLNOTY» ⇒ код 0.
  K=$(pn neraskr)
  [[ "$K" == 2 ]] && grep -q 'не раскрылись' "$T/vyvod" && grep -q 'net-takogo-stend-kopii' "$T/vyvod" \
    && sud ok "32 нераскрывшийся образец -> слепота полноты" "код 2, образец назван" \
    || sud fail "32 нераскрывшийся образец -> слепота полноты" "код $K, образец назван $(grep -c net-takogo-stend-kopii "$T/vyvod")"
  # 33 (C-H-490): пустая разметка ⇒ заключения нет, код 2. Порча «снята защита P_VSEGO=0» ⇒ «все 0 образцов есть», код 0.
  K=$(pn pusto)
  [[ "$K" == 2 ]] && grep -q 'ЗАКЛЮЧЕНИЯ НЕТ' "$T/vyvod" && grep -q 'образцов разметки 0 ' "$T/vyvod" \
    && sud ok "33 пустая разметка -> заключения нет" "код 2" \
    || sud fail "33 пустая разметка -> заключения нет" "код $K — ноль образцов принят за «все в копии есть»"
  # 34 (B-N-1435 (3), C9 Зари): ответ pokrytie > 128 КиБ ⇒ полнота СОСТОЯЛАСЬ, код 0. Основа приёмки 29245ab4 (ответ через окружение) ⇒ 2.
  K=$(pn bolshoj)
  [[ "$K" == 0 ]] && grep -q 'состав: все' "$T/vyvod" \
    && sud ok "34 ответ реестра > 128 КиБ -> состав проверен" "код 0" \
    || sud fail "34 ответ реестра > 128 КиБ -> состав проверен" "код $K — $(grep -m1 -o 'НЕ СОСТОЯЛАСЬ.*' "$T/vyvod")"
  # 39–44 (B-N-2101 r2, ворота Вениамина 04:58Z): мягкий код 3 — ТОЛЬКО путь, которого нет в копии и на машине И который сборщик
  # ЭТОЙ копии назвал отсутствующим при сборке (backup-coverage.json: «в реестре есть, на диске нет»). Иначе — код 1.
  # 🔴 r1 был зелёным на копии БЕЗ манифеста — лёгкий вход: в настоящей копии манифест есть, и 5в дал бы код 1 (16.10 так и вышло бы).
  s_manif(){ local d; d=$(mktemp -d "$T/manif.XXXXXX"); tar xzf "$1" -C "$d" 2>/dev/null; printf '%s' "$3" > "$d/backup-coverage.json"; ( cd "$d" && tar czf "$2" . 2>/dev/null ); rm -rf "$d"; }
  PZ=/net-takogo-puti-stend-b2101
  s_manif "$POLN_T/polnaya.tar.gz" "$POLN_T/prizrak-nazvan.tar.gz" '{"format":"sadik-backup-coverage-v1","polnaya":false,"nepokrytye":[],"propushcheno":[{"istochnik":"'"$PZ"'","prichina":"в реестре есть, на диске нет"}]}'
  s_manif "$POLN_T/polnaya.tar.gz" "$POLN_T/prizrak-ne-nazvan.tar.gz" '{"format":"sadik-backup-coverage-v1","polnaya":true,"nepokrytye":[],"propushcheno":[]}'
  s_manif "$POLN_T/polnaya.tar.gz" "$POLN_T/prizrak-i-dostup.tar.gz" '{"format":"sadik-backup-coverage-v1","polnaya":false,"nepokrytye":[],"propushcheno":[{"istochnik":"'"$PZ"'","prichina":"в реестре есть, на диске нет"},{"istochnik":"/net-dostupa-stend-b2101","prichina":"нет доступа к источнику"}]}'
  pa(){ FAKE_REZHIM=prizrak CHITATEL="$T/chitatel" AGENTS_REGISTRY="$T/reestr.yaml" "$INSTR" "$1" >"$T/vyvod" 2>&1; echo $?; }
  K=$(pa "$POLN_T/prizrak-nazvan.tar.gz")
  if [[ "$K" == 3 ]] && grep -q 'НЕПОЛНА ПО СОСТАВУ' "$T/vyvod" && grep -q "$PZ" "$T/vyvod" \
     && ! grep -q 'НЕ ВОССТАНОВИМА\|КОПИЯ НЕПОЛНА\|не восстановима' "$T/vyvod"; then
    sud ok "39 не было при сборке (слово сборщика) и нет сейчас -> 3" "путь назван, 5в не повторил отказ"
  else
    sud fail "39 не было при сборке (слово сборщика) и нет сейчас -> 3" "код $K, «НЕПОЛНА ПО СОСТАВУ» $(grep -c 'НЕПОЛНА ПО СОСТАВУ' "$T/vyvod"), «не восстановима/КОПИЯ НЕПОЛНА» $(grep -c 'НЕ ВОССТАНОВИМА\|КОПИЯ НЕПОЛНА\|не восстановима' "$T/vyvod")"
  fi
  # 42: записи сборщика в копии нет — мягкого вердикта нет, код 1.  43: сборщик путь НЕ назвал (был при сборке, не взят, удалён) — код 1.
  K=$(pa "$POLN_T/polnaya.tar.gz")
  [[ "$K" == 1 ]] && grep -q 'отсутствия при сборке не объявил' "$T/vyvod" && grep -q "$PZ" "$T/vyvod" \
    && sud ok "42 записи сборщика нет -> код 1, возможна потеря" "$PZ" \
    || sud fail "42 записи сборщика нет -> код 1, возможна потеря" "код $K"
  K=$(pa "$POLN_T/prizrak-ne-nazvan.tar.gz")
  [[ "$K" == 1 ]] && grep -q 'отсутствия при сборке не объявил' "$T/vyvod" && grep -q "$PZ" "$T/vyvod" \
    && sud ok "43 сборщик путь не назвал (взят не был, потом удалён) -> код 1" "$PZ" \
    || sud fail "43 сборщик путь не назвал (взят не был, потом удалён) -> код 1" "код $K"
  # 44: сверх «нет на диске» сборщик объявил иной пропуск — 5в держит код 1 «ПО СЛОВУ СОБРАВШЕГО».
  K=$(pa "$POLN_T/prizrak-i-dostup.tar.gz")
  [[ "$K" == 1 ]] && grep -q 'ПО СЛОВУ СОБРАВШЕГО' "$T/vyvod" \
    && sud ok "44 призрак + иной пропуск сборщика -> код 1 по слову собравшего" "5в держит" \
    || sud fail "44 призрак + иной пропуск сборщика -> код 1 по слову собравшего" "код $K"
  K=$(pn "")
  [[ "$K" == 0 ]] && grep -q 'состав: все' "$T/vyvod" && ! grep -q 'net-takogo-puti-stend-b2101' "$T/vyvod" \
    && sud ok "40 возврат: призрак снят -> код 0" "состав: все" \
    || sud fail "40 возврат: призрак снят -> код 0" "код $K"
  # 41: призрак + НАСТОЯЩАЯ пропажа (образец на машине есть, в копии нет) ⇒ код 1, оба названы — разделение не смягчает пропажу.
  K=$(FAKE_REZHIM=prizrak CHITATEL="$T/chitatel" AGENTS_REGISTRY="$T/reestr.yaml" "$INSTR" "$POLN_T/porcha.tar.gz" >"$T/vyvod" 2>&1; echo $?)
  [[ "$K" == 1 ]] && grep -q 'данных, которые есть на машине, в копии нет' "$T/vyvod" && grep -q "$UB" "$T/vyvod" && grep -q 'net-takogo-puti-stend-b2101' "$T/vyvod" \
    && sud ok "41 призрак + пропажа -> код 1, оба названы" "$UB" \
    || sud fail "41 призрак + пропажа -> код 1, оба названы" "код $K, пропажа $(grep -c "$UB" "$T/vyvod"), призрак $(grep -c net-takogo-puti-stend-b2101 "$T/vyvod")"
else
  sud slep "полнота состава" "реестр не отдал klyuch_gpg — случаи не состоялись"
  sud slep "вход с неполными (3 пробы)" "то же"
  sud slep "вердикт называет состав" "то же"
  sud slep "пропажа образца ловится" "то же"
  sud slep "подключение с целью" "то же"
  sud slep "цель подключения не поехала" "то же"
  sud slep "ноль подключений" "то же"
  sud slep "31 код 3 при теле v1" "то же"
  sud slep "32 нераскрывшийся образец" "то же"
  sud slep "33 пустая разметка" "то же"
  sud slep "34 ответ реестра > 128 КиБ" "то же"
  sud slep "39 пути нет на машине" "то же"
  sud slep "40 возврат призрака" "то же"
  sud slep "41 призрак + пропажа" "то же"
  sud slep "42 записи сборщика нет" "то же"
  sud slep "43 сборщик путь не назвал" "то же"
  sud slep "44 призрак + иной пропуск" "то же"
fi

# ── Канарейка: точное число, а не «не меньше» ──────────────────────────────
# Порог «не меньше N» слеп к убыли, которая умещается в запас, и при этом
# выглядит строже точного числа. Здесь случаи перечислены поимённо, значит
# и ждать надо ровно столько.
ZHDYOM=44   # 30 + пробы 31/32 (B-N-873) + 33 (C-H-490) + 34 (B-N-1435 (3), C9 Зари) + 35–38 (B-N-1957) + 39–44 (B-N-2101 r2)
VSEGO=$((ok+bad+slep))
echo
echo "  ok=$ok  FAIL=$bad  СЛЕПОТА=$slep   (всего $VSEGO, ждём $ZHDYOM)"
if [[ $VSEGO -ne $ZHDYOM ]]; then
  echo "🔴 СЛЕПОТА: проверок $VSEGO вместо $ZHDYOM — часть стенда не состоялась"
  exit 2
fi
[[ $bad -gt 0 ]] && exit 1
[[ $slep -gt 0 ]] && exit 2
echo "✅ инструмент приёмки копии судит верно"
exit 0
