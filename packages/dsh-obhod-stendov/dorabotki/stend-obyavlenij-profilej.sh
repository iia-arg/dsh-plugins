#!/usr/bin/env bash
# Приёмка объявленности подключений в профилях (долг 38).
#
# Предмет: package.json профилей в /opt/iskra/.dsh/profiles/*/.
# Проверяется, что КАЖДОЕ подключение плагина (симлинк в node_modules профиля)
# объявлено в dependencies того же профиля формой, которую понимает доступный
# на машине пакетный менеджер, и указывает ровно туда же, куда симлинк.
#
# Зачем: платформа находит плагин по симлинку и dependencies профиля НЕ читает
# (доказано loadProfile: состав загрузки тождествен до и после объявления).
# Объявление нужно не платформе, а восстановлению: без него установка
# зависимостей плагин не создаст, а лишнее в node_modules может снести.
#
# Коды: 0 сошлось | 1 расхождение | 2 слепота (проверить не удалось).
#
# 🔴 ГДЕ НЕ ПРИМЕНЯЕТСЯ — границы ОХВАТА, не воздействия:
#   * НЕ проверяет, что установка действительно восстановит симлинк: это
#     означало бы запустить установку на боевом профиле. Проверено отдельно
#     и однократно, в пустом каталоге: npm по форме "file:<путь>" создаёт
#     симлинк (код 0), по форме "link:<путь>" отказывает целиком
#     (EUNSUPPORTEDPROTOCOL) — то есть роняет и остальные зависимости;
#   * форма проверена ТОЛЬКО npm. Штатный путь профиля — pnpm (платформа
#     кладёт pnpm-workspace.yaml), но pnpm на машине нет, и как он трактует
#     "file:" для каталога — симлинком или копией — здесь не доказано ничем.
#     Появится pnpm — перепроверить, иначе плагин может стать копией, и
#     правки в исходном каталоге перестанут доезжать;
#   * НЕ проверяет, что подключён нужный плагин: список берётся с диска,
#     а не из замысла. Лишний симлинк тоже будет признан «объявленным»;
#   * НЕ проверяет содержимое цели — только что она существует и читается.
set -uo pipefail
export LC_ALL=C.UTF-8

BASE="${PROFILES_DIR:-/opt/iskra/.dsh/profiles}"
BOOT="${DSH_BOOT_LIB:-/opt/iskra/app/node_modules/@deepseek-ai/dsh-app-boot/lib/index.js}"
ANCHOR="${DSH_APP_ANCHOR:-/opt/iskra/app/package.json}"
ok=0; bad=0; slep=0
sud(){ case "$1" in
    ok)   ok=$((ok+1));   printf '  ok    %-30s %s\n' "$2" "$3" ;;
    fail) bad=$((bad+1)); printf '  FAIL  %-30s %s\n' "$2" "$3" ;;
    slep) slep=$((slep+1)); printf '  СЛЕПОТА %-27s %s\n' "$2" "$3" ;;
  esac; }

[ -d "$BASE" ] || { echo "СЛЕПОТА: нет каталога профилей $BASE"; exit 2; }

profilej=0; podklyuchenij=0; zapisejSostava=0
for prof in "$BASE"/*/; do
  p=${prof%/}; name=$(basename "$p")
  [ -f "$p/package.json" ] || continue
  profilej=$((profilej+1))

  # 1. манифест разбирается и профиль грузится платформенным загрузчиком
  if [ -f "$BOOT" ]; then
    out=$(node -e "
import('$BOOT').then(m=>{
  const pr=m.loadProfile('stend','$name','$ANCHOR','$(dirname "$BASE")');
  console.log('слоёв='+pr.layers.length);
}).catch(e=>{ console.error('ОТКАЗ: '+e.message.slice(0,90)); process.exit(1); })" 2>&1)
    if [ $? -eq 0 ]; then sud ok "$name: загрузка профиля" "$out"
    else sud fail "$name: загрузка профиля" "$out"; fi
  else
    sud slep "$name: загрузка профиля" "нет загрузчика $BOOT"
  fi

  while IFS= read -r l; do
    [ -n "$l" ] || continue
    podklyuchenij=$((podklyuchenij+1))
    mod=$(basename "$l"); cel=$(readlink "$l")
    znach=$(python3 -c "
import json
d=(json.load(open('$p/package.json')).get('dependencies') or {})
print(d.get('$mod',''))" 2>/dev/null) || znach=''

    # 2. объявлено
    if [ -n "$znach" ]; then sud ok "$name/$mod объявлено" "$znach"
    else sud fail "$name/$mod объявлено" "подключено симлинком, в dependencies НЕТ — установка его не создаст"; fi

    # 3. форма понятна доступному пакетному менеджеру
    case "$znach" in
      file:*) sud ok "$name/$mod форма" "file: — npm создаёт симлинк (проверено)" ;;
      link:*) sud fail "$name/$mod форма" "link: НЕ понимается npm (EUNSUPPORTEDPROTOCOL) — установка упадёт целиком" ;;
      '')     sud fail "$name/$mod форма" "нечего проверять: не объявлено" ;;
      *)      sud fail "$name/$mod форма" "форма «$znach» не проверена ничем на этой машине" ;;
    esac

    # 4. объявленный путь ведёт туда же, куда симлинк
    put=${znach#file:}; put=${put#link:}
    if [ -z "$znach" ]; then sud fail "$name/$mod путь" "не объявлено"
    elif [ "$put" = "$cel" ]; then sud ok "$name/$mod путь" "совпал с целью симлинка"
    else sud fail "$name/$mod путь" "объявлено «$put», симлинк ведёт в «$cel» — установка создаст не то"; fi

    # 5. цель существует
    if [ -e "$l" ]; then sud ok "$name/$mod цель" "$cel"
    else sud fail "$name/$mod цель" "симлинк висячий: $cel"; fi
  done < <(find "$p/node_modules" -maxdepth 2 -type l 2>/dev/null | sort)

  # 6. ОБРАТНЫЙ ХОД: каждая запись состава имеет подключение.
  # 🔴 КУПЛЕНО МОНТАЖОМ СЕКРЕТАРЯ 03.09.2026. Разряды выше идут ОТ СИМЛИНКА:
  # нашли подключение — спросили, объявлено ли. Запись в cordis.patch.yml без
  # симлинка не проверялась НИКЕМ: проверять было нечего, и стенд отвечал зелёным.
  # А платформа такой пакет просто не найдёт — молча, без единой ошибки.
  # Разрыв возможен с ОБОИХ концов, значит и обходить надо с обоих.
  # ГДЕ НЕ ПРИМЕНЯЕТСЯ: имена берутся только из записей `insert` НАШЕГО слоя;
  # штатные записи приходят пресетом и симлинка в профиле не требуют.
  if [ -f "$p/cordis.patch.yml" ]; then
    while read -r imya; do
      [ -n "$imya" ] || continue
      zapisejSostava=$((zapisejSostava+1))
      if [ -e "$p/node_modules/$imya" ]; then sud ok "$name/$imya подключение" "симлинк есть"
      else sud fail "$name/$imya подключение" "есть в составе, симлинка в node_modules НЕТ — платформа модуль не найдёт"; fi
    done < <(python3 -c "
import yaml,sys
try: d=yaml.safe_load(open('$p/cordis.patch.yml')) or []
except Exception: sys.exit(0)
for zapis in d:
    for v in (zapis.get('insert') or []):
        n=v.get('name')
        # Наши пакеты подключаются симлинком; штатные (@deepseek-ai/...) приходят пресетом.
        if n and not n.startswith('@'): print(n)
" 2>/dev/null)
  fi
done

# --- РАЗДЕЛ 3: манифест ПАКЕТА моста -----------------------------------------
# Зачем: 28.08 замер показал, что живой манифест пакета моста объявлял 5 ключей
# против 12 у опубликованного 0.1.1 и МОЛЧАЛ о своей внешней зависимости
# (src/index.js:54 импортирует @deepseek-ai/schemastery). Пакет, не объявляющий
# своих зависимостей, у стороннего не смонтируется, а причина не видна ни ему,
# ни нам.
# Число проверок здесь вычисляется ИЗ ПРЕДМЕТА (сколько внешних импортов в коде),
# поэтому новая зависимость не останется непроверенной молча.
MOST_PKG="${MOST_PKG:-/opt/iskra/plugins/dsh-tool-bridge/package.json}"
MOST_KOD="${MOST_KOD:-/opt/iskra/plugins/dsh-tool-bridge/src/index.js}"
vneshnih=0
if [ -f "$MOST_PKG" ] && [ -f "$MOST_KOD" ]; then
  # внешние импорты = всё, кроме встроенных node: — их покрывает engines
  while read -r pkg; do
    [ -n "$pkg" ] || continue
    vneshnih=$((vneshnih+1))
    if python3 -c "
import json,sys
d=json.load(open('$MOST_PKG'))
ob=set(d.get('peerDependencies',{}))|set(d.get('dependencies',{}))
sys.exit(0 if '$pkg' in ob else 1)
" 2>/dev/null; then
      sud ok "манифест пакета: зависимость $pkg объявлена" ""
    else
      sud fail "манифест пакета: $pkg" "код импортирует, а манифест молчит — у стороннего не смонтируется"
    fi
  # B-N-1768 (07.10, Аврора): относительный импорт ('./image-content.js') — файл пакета, не зависимость: его держит files,
  #   а не dependencies; прежде он шёл сюда и давал ложное «манифест молчит».
  done < <(grep -oE "from '[^']+'" "$MOST_KOD" | sed "s/from '//; s/'//" | grep -v '^node:' | grep -vE '^\.\.?/' | sort -u)

  # Охрана решения 28.08: в ЖИВОМ манифесте нет dsh.bundle.patch и files —
  # монтаж у нас идёт слоем профиля, а локально мы не пакуем. Это решение,
  # а не недоделка; проверка держит его, чтобы следующий не «довёл до пакета»
  # и не получил отказ загрузки профиля из-за патча, которого на диске нет.
  patch_deklarirovan=$(python3 -c "
import json
d=json.load(open('$MOST_PKG'))
print(d.get('dsh',{}).get('bundle',{}).get('patch') or '')
" 2>/dev/null)
  if [ -z "$patch_deklarirovan" ]; then
    sud ok "манифест пакета: dsh.bundle.patch не объявлен (решение: монтаж слоем профиля)" ""
  elif [ -f "$(dirname "$MOST_PKG")/$patch_deklarirovan" ]; then
    sud ok "манифест пакета: dsh.bundle.patch объявлен и файл на месте" ""
  else
    sud fail "манифест пакета: dsh.bundle.patch" "объявлен $patch_deklarirovan, а файла нет — loadProfile упадёт целиком"
  fi

  # 🔴 Разряд «собирается при публикации»: файл объявлен в files, но в ЖИВОМ каталоге
  # его нет ПО ПОСТРОЕНИЮ — он пишется для того, кто ставит пакет, и в рабочем каталоге
  # ему места нет. Список держится ДАННЫМИ и печатается поимённо: «нет в живом» и
  # «не проверяли» — разные утверждения, и второе обязано быть видно.
  # Проверять наличие таких файлов надо в СБОРКЕ (там они есть: тарбол 0.3.1 — 16 файлов),
  # а не здесь. Тот же разряд объявлен в карте сверщика публикаций.
  # Список обязан УБЫВАТЬ: файл, появившийся в живом, отсюда убирается.
  # 🔴 СПИСОК БЕРЁТСЯ ИЗ ПРЕДМЕТА, А НЕ ДЕРЖИТСЯ ЗДЕСЬ (03.09.2026). Прежде он был
  # зашит двумя именами, а у моста собираемых стало ТРИ (добавился CHANGELOG.md) —
  # и стенд объявил «files обещает 1 несуществующих» на исправном пакете. Два списка
  # одних и тех же имён расходятся молча: это ровно то, о чём предупреждает
  # комментарий внутри самого моста. Источник правды один — его test/sobiraemye-*.json;
  # нет файла — говорим об этом вслух, а не подставляем догадку.
  SOBIRAEMYE_ISTOCHNIK="$(dirname "$MOST_PKG")/test/sobiraemye-pri-publikacii.json"
  if [ -f "$SOBIRAEMYE_ISTOCHNIK" ]; then
    SOBIRAEMYE_PRI_PUBLIKACII=$(python3 -c "
import json
print(' '.join(x['fajl'] for x in json.load(open('$SOBIRAEMYE_ISTOCHNIK'))))" 2>/dev/null)
  else
    SOBIRAEMYE_PRI_PUBLIKACII=""
    sud slep "манифест пакета: списка собираемых нет ($SOBIRAEMYE_ISTOCHNIK)" \
      "судить, законно ли отсутствие файла из files, нечем"
  fi
  # 🔴 ПУСТОЙ СПИСОК НАЗЫВАЕТСЯ ВСЛУХ (05.09.2026). Список опустел, когда выяснилось, что
  # «собирается при публикации» было обещанием без исполнителя: npm pack молча пропускал
  # отсутствующие файлы из files, и следующий выпуск уехал бы неполным. Файлы вернулись в
  # каталог, список стал пуст — и вместе с ним ТИХО исчезли три проверки. Молчащий пустой
  # список неотличим от «разряд отработал»: тот же зелёный, только проверок меньше.
  if [ -z "$SOBIRAEMYE_PRI_PUBLIKACII" ] && [ -f "$SOBIRAEMYE_ISTOCHNIK" ]; then
    sud ok "манифест пакета: список собираемых при публикации ПУСТ — исключений из files нет" \
      "это не «разряд отработал»: проверять нечего, и число проверок здесь меньше на длину списка"
  fi
  for sf in $SOBIRAEMYE_PRI_PUBLIKACII; do
    if [ -f "$(dirname "$MOST_PKG")/$sf" ]; then
      sud fail "манифест пакета: $sf числится собираемым при публикации, а он ЕСТЬ в живом" \
        "разряд пережил причину — убрать из SOBIRAEMYE_PRI_PUBLIKACII, иначе проверка молчит зря"
    else
      sud ok "манифест пакета: $sf вне проверки — собирается при публикации" ""
    fi
  done

  nedostayushchih=$(SOBIRAEMYE="$SOBIRAEMYE_PRI_PUBLIKACII" python3 -c "
import json,os
sobir=set(os.environ.get('SOBIRAEMYE','').split())
d=json.load(open('$MOST_PKG')); k=os.path.dirname('$MOST_PKG')
print(sum(1 for f in d.get('files',[]) if f not in sobir and not os.path.exists(os.path.join(k,f))))
" 2>/dev/null)
  if [ "${nedostayushchih:-0}" = "0" ]; then
    sud ok "манифест пакета: files обещает только существующее" ""
  else
    sud fail "манифест пакета: files" "обещает $nedostayushchih несуществующих — тарбол выйдет неполным молча"
  fi
else
  sud slep "манифест пакета моста" "нет $MOST_PKG или $MOST_KOD"
  vneshnih=0
fi

# --- РАЗРЯД: НЕПОЛНОТА ЗАПИСЕЙ РЕЕСТРА ВИДНА МАШИНЕ ------------------------
# 🔴 ЗАВЕДЁН 03.09.2026. Пять записей семейства памяти я завела своими руками, и
# часть полей в них — ВЫВОД ИЗ КОДА, а не замер: отключения слоёв на живом узле
# не пробовали, боевого компакта не было ни разу. Пометка об этом стоит в самих
# записях (ключ nepolno), но `agent-plugins verify` её не видит: он сверяет версию
# и отпечаток, а полноту знания — нет. Пометка, которую видит только человек, —
# справка; пометка, которую считает машина, — печать.
# ГДЕ НЕ ПРИМЕНЯЕТСЯ: разряд НЕ судит, верно ли заполнено поле. Он отвечает на
# один вопрос — объявлена ли неполнота там, где она есть, и не пуста ли пометка.
NEPOLNYH=$(python3 - <<'PYEOF'
import yaml, sys
try:
    d = yaml.safe_load(open('/etc/agent-registry/plugins.yaml'))
except Exception:
    print('SLEPOTA'); sys.exit(0)
pl = d[0]['plugins'] if isinstance(d, list) else (d.get('plugins') or [])
pusto = [p.get('id') for p in pl if 'nepolno' in p and not str(p.get('nepolno') or '').strip()]
est = [p.get('id') for p in pl if str(p.get('nepolno') or '').strip()]
print('PUSTO:' + ','.join(x for x in pusto if x))
print('EST:' + ','.join(x for x in est if x))
PYEOF
)
if echo "$NEPOLNYH" | grep -q SLEPOTA; then
  sud slep "неполнота записей реестра" "реестр не разобрался — считать нечего"
else
  pustyh=$(echo "$NEPOLNYH" | grep '^PUSTO:' | cut -d: -f2- | tr -d ' ')
  estnep=$(echo "$NEPOLNYH" | grep '^EST:' | cut -d: -f2- | tr -d ' ')
  n_est=$(echo "$estnep" | awk -F, '{print ($1==""?0:NF)}')
  if [ -n "$pustyh" ]; then
    sud fail "пометка неполноты не пуста" "пустой ключ nepolno у: $pustyh — объявили неполноту и не сказали, в чём"
  else
    sud ok "пометка неполноты не пуста" "записей с объявленной неполнотой: $n_est"
  fi
  # 🔴 Число печатается ВСЕГДА, даже когда ноль: молчание о неполноте неотличимо
  # от её отсутствия, а мы весь день разводили именно такие пары.
  echo "  НЕПОЛНОТА: записей реестра с объявленной неполнотой — $n_est${estnep:+ ($estnep)}"
fi


echo
echo "профилей: $profilej | подключений: $podklyuchenij | записей состава: $zapisejSostava | внешних зависимостей моста: $vneshnih"
echo "ИТОГО: сошлось $ok, расхождений $bad, слепота $slep"

# Канарейка полноты: число проверок вычисляется ИЗ ПРЕДМЕТА (профилей и
# подключений на диске), а не задано числом — иначе новое подключение
# осталось бы непроверенным молча, а вырезанный раздел прошёл бы кодом 0.
# 🔴 Число собираемых при публикации СЧИТАЕТСЯ ИЗ СПИСКА, а не задано литералом:
# добавят файл в разряд — канарейка не сломается на исправном стенде. Литерал здесь
# был бы списком в другой одежде.
sobiraemyh=$(echo $SOBIRAEMYE_PRI_PUBLIKACII | wc -w)
# B-N-1768: при пустом списке проба одна («список ПУСТ» или слепота «списка нет»), а не ноль — канарейка ждала на 1 меньше.
sob_pr=$(( sobiraemyh > 0 ? sobiraemyh : 1 ))
ZHDYOM=$(( profilej + 4 * podklyuchenij + zapisejSostava + vneshnih + 2 + sob_pr + 1 ))
if [ $((ok+bad+slep)) -ne "$ZHDYOM" ]; then
  echo "СЛЕПОТА: проверок $((ok+bad+slep)), а по предмету ждём $ZHDYOM (профилей $profilej + 4 на подключение × $podklyuchenij + 1 на запись состава × $zapisejSostava + $vneshnih зависимостей + 2 охранных + $sob_pr на список собираемых при публикации) — часть не состоялась."
  exit 2
fi
[ "$podklyuchenij" -gt 0 ] || { echo "СЛЕПОТА: подключений не найдено вовсе — стенд смотрит не туда"; exit 2; }
[ "$bad" -eq 0 ] || exit 1
[ "$slep" -eq 0 ] || exit 2
exit 0
