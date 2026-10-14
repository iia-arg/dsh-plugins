#!/usr/bin/env bash
# stend-pustoj-zapisi.sh [copy-compare.sh|source-vypusk-okno-watch.sh] — проба правила «пустая запись CHANGELOG» (A-N-1562, решение Забавы 21:15:40Z).
# После Ш2 блок находится в общем src/copy-compare.sh. Source-watch аргумент разрешается в соседний consumer, без fallback в бой.
# Берёт ИЗ ПРЕДМЕТА python-блок PY_CHANGELOG (код предмета, не копию правила) и гоняет на подставных CHANGELOG.
S=${1:-${VYPUSK_TEST_WATCH:-$(dirname "$0")/../src/copy-compare.sh}}
[ -f "$S" ] && [ -r "$S" ] || { echo "СЛЕПОТА: предмет не читается: $S"; exit 2; }
if ! grep -qF "<<'PY_CHANGELOG'" "$S" && grep -qF 'COPY_PRIBOR=$(dirname -- "$0")/copy-compare.sh' "$S"; then
  S=$(dirname -- "$S")/copy-compare.sh
fi
[ -f "$S" ] && [ -r "$S" ] || { echo "СЛЕПОТА: consumer не читается: $S"; exit 2; }
[ "$(grep -cF "<<'PY_CHANGELOG'" "$S")" = 1 ] && [ "$(grep -cxF 'PY_CHANGELOG' "$S")" = 1 ]   || { echo "СЛЕПОТА: блок PY_CHANGELOG не единственный или отсутствует: $S"; exit 2; }
T=$(mktemp -d); trap 'rm -rf "$T"' EXIT
awk '/<<.PY_CHANGELOG.$/{f=1;next} /^PY_CHANGELOG$/{f=0} f' "$S" > "$T/blok.py"
[ -s "$T/blok.py" ] || { echo "СЛЕПОТА: блок PY_CHANGELOG не вынут из $S"; exit 2; }
echo '{}' > "$T/ex.json"; ok=0; bad=0
proba() { # proba <имя> <ожидание: pusto|est> <версия> <текст CHANGELOG>
  printf '%b' "$4" > "$T/c.md"; out=$(python3 "$T/blok.py" paket "$3" "$T/c.md" "$T/c.md" "$T/ex.json" 2>&1) ; code=$?
  if [ "$code" != 0 ]; then bad=$((bad+1)); echo "❌ $1: Python-блок отказал $code — ${out:0:120}"; return; fi
  fakt=est; grep -qF 'нет или она пуста' <<< "$out" && fakt=pusto
  if [ "$fakt" = "$2" ]; then ok=$((ok+1)); echo "✅ $1: $fakt"; else bad=$((bad+1)); echo "❌ $1: $fakt (ждала $2) — ${out:0:120}"; fi; }
proba "а заголовок с текстом, без тела" est 1.1.38 '# История\n\n## 1.1.38 — перенумерация (A-N-1562): прежний 0.1.0-alpha.38, код не менялся\n\n## 0.1.0-alpha.38 — 2026-10-04\n\nтело\n'
proba "б голый ## 1.2.3 без тела" pusto 1.2.3 '# История\n\n## 1.2.3\n\n## 1.2.2\n\nтело\n'
proba "в обычная запись с телом" est 1.2.3 '# История\n\n## 1.2.3\n\n- исправлено то-то\n\n## 1.2.2\n'
proba "г заголовок с текстом И телом" est 1.2.3 '## 1.2.3 — заголовок\n\nтело\n'
proba "д только дата после номера" pusto 1.2.3 '## 1.2.3 — 2026-10-04\n\n## 1.2.2\n\nтело\n'
proba "е только тире после номера" pusto 1.2.3 '## 1.2.3 —\n\n## 1.2.2\n'
proba "ж дата и текст" est 1.2.3 '## 1.2.3 — 2026-10-04 · Перенумерация\n\n## 1.2.2\n'
proba "з записи нет вовсе" pusto 1.2.3 '## 1.2.2\n\nтело\n'
proba "и приставка 1.2.30 не равна 1.2.3" pusto 1.2.3 '## 1.2.30 — текст\n\n## 1.2.2\n'
echo "ИТОГ: ok $ok · fail $bad"; [ $bad = 0 ]
