#!/usr/bin/env bash
# Копия базы долговременной памяти (omega). Штатная автокопия omega этого НЕ заменяет:
# она делается только при запуске службы и только если прошло 24 часа
# (omega/sqlite_store/_base.py::_auto_backup_if_stale), поэтому при недельном
# аптайме за неделю не появится ни одной. Её отказ к тому же пишется на уровне
# debug — то есть в обычном журнале не виден вовсе.
#
# КАК КОПИРУЕТ. Через sqlite3 backup API, а не cp: у базы включён WAL, и простое
# копирование файла даёт обрывок без незакрытых страниц. Служба при этом работает.
#
# ГРАНИЦЫ (без них защита производит тот вред, от которого защищает):
#   • копия проверяется PRAGMA integrity_check и сверкой числа записей ДО сжатия;
#     не прошла — файл удаляется, старые НЕ трогаются, код возврата ненулевой;
#   • ротация никогда не удаляет последнюю успешную копию, сколько бы ни было дней;
#   • при нехватке места копия не начинается — иначе заполним диск и уроним всё;
#   • 🔴 копия лежит на ТОМ ЖЕ ТОМЕ, что и база. Это спасает от порчи базы и
#     ошибочного удаления, но НЕ от смерти диска. Вынос на другую машину — решение
#     человека, здесь его нет намеренно.
set -uo pipefail

DB="${OMEGA_DB:-/var/lib/omega/.omega/omega.db}"
DEST="${OMEGA_BACKUP_DIR:-/var/backups/omega}"
KEEP="${OMEGA_BACKUP_KEEP:-28}"        # сколько копий хранить
MIN_FREE_PCT="${OMEGA_BACKUP_MIN_FREE:-15}"

[ -r "$DB" ] || { echo "🔴 базы нет или не читается: $DB"; exit 1; }
mkdir -p "$DEST"; chmod 700 "$DEST"

free_pct="$(df --output=avail,size "$DEST" | awk 'NR==2 {printf "%d", $1*100/$2}')"
if [ "${free_pct:-0}" -lt "$MIN_FREE_PCT" ]; then
  echo "🔴 свободно ${free_pct}% (порог ${MIN_FREE_PCT}%) — копию НЕ делаю, чтобы не добить диск"; exit 1
fi

ts="$(date -u +%Y%m%dT%H%M%SZ)"; tmp="$DEST/omega-$ts.db"
python3 - "$DB" "$tmp" <<'PY' || { rm -f "$tmp"; echo "🔴 копирование не удалось — старые копии не тронуты"; exit 1; }
import sqlite3, sys
src_p, dst_p = sys.argv[1], sys.argv[2]
src = sqlite3.connect(f"file:{src_p}?mode=ro", uri=True, isolation_level=None)
dst = sqlite3.connect(dst_p)
# A-N-1948 №4 (№2): счёт и снимок — из ОДНОЙ читающей транзакции, то есть одного среза базы. Прежде счёт читался
# ПОСЛЕ снимка: запись в omega.db между ними давала «в копии меньше, чем в базе» — копия удалялась, юнит failed.
src.execute("BEGIN")
src_n = src.execute("select count(*) from memories").fetchone()[0]
src.backup(dst)                      # корректно на живой базе с WAL; срез — тот же, что у счёта
src.execute("COMMIT"); dst.close(); src.close()
chk = sqlite3.connect(dst_p)
ok = chk.execute("PRAGMA integrity_check").fetchone()[0]
dst_n = chk.execute("select count(*) from memories").fetchone()[0]
chk.close()
if ok != "ok":  print(f"integrity_check: {ok}", file=sys.stderr); sys.exit(1)
# счёт и копия — один срез: записей в копии ровно столько же; меньше — копия неполна
if dst_n < src_n: print(f"записей в копии {dst_n} < {src_n} в базе", file=sys.stderr); sys.exit(1)
print(f"проверено: integrity_check=ok, записей {dst_n}")
PY

gzip -f "$tmp" || { rm -f "$tmp" "$tmp.gz"; echo "🔴 сжатие не удалось"; exit 1; }
chmod 600 "$tmp.gz"
echo "копия: $tmp.gz ($(du -h "$tmp.gz" | cut -f1))"

# Ротация. Считаем только успешные копии; последнюю не удаляем никогда.
mapfile -t all < <(ls -1t "$DEST"/omega-*.db.gz 2>/dev/null)
if [ "${#all[@]}" -gt "$KEEP" ] && [ "$KEEP" -ge 1 ]; then
  for f in "${all[@]:$KEEP}"; do rm -f "$f" && echo "  ротация: удалена $(basename "$f")"; done
fi
echo "всего копий: $(ls -1 "$DEST"/omega-*.db.gz 2>/dev/null | wc -l)"
