#!/usr/bin/env bash
# RU-CIDR set builder for RU split-routing (Ф2). Source: RIPE delegated-stats (RU ipv4).
# Builds nft set inet ru_split ru_v4 (interval, auto-merge). Set-only — routing rules live separately (Ф4).
set -euo pipefail
SRC="https://ftp.ripe.net/pub/stats/ripencc/delegated-ripencc-latest"
DIR=/etc/ru-split; TMP=$(mktemp -d); trap 'rm -rf "$TMP"' EXIT
curl -fsSL --max-time 180 "$SRC" -o "$TMP/ripe.txt"
# RU ipv4 allocated/assigned → "start count"
awk -F'|' '$2=="RU" && $3=="ipv4" && ($7=="allocated"||$7=="assigned"){print $4" "$5}' "$TMP/ripe.txt" > "$TMP/ranges.txt"
python3 - "$TMP/ranges.txt" > "$TMP/cidrs.txt" <<'PY'
import sys, ipaddress
for line in open(sys.argv[1]):
    ip, cnt = line.split()
    s = ipaddress.IPv4Address(ip); e = s + int(cnt) - 1
    for n in ipaddress.summarize_address_range(s, e): print(n)
PY
CNT=$(wc -l < "$TMP/cidrs.txt")
[ "$CNT" -lt 500 ] && { echo "SANITY FAIL: только $CNT CIDR (<500) — RIPE-фетч подозрителен, НЕ обновляю"; exit 2; }
# ensure table+set (no-op если есть; сохраняет будущие Ф4-правила)
nft add table inet ru_split 2>/dev/null || true
nft add set inet ru_split ru_v4 '{ type ipv4_addr; flags interval; auto-merge; }' 2>/dev/null || true
# atomic flush+repopulate через -f
{ echo "flush set inet ru_split ru_v4";
  echo "add element inet ru_split ru_v4 { $(paste -sd, "$TMP/cidrs.txt") }"; } > "$TMP/load.nft"
nft -f "$TMP/load.nft"
# A-N-1948 №36: список — ПОСЛЕ успешной загрузки набора. Прежде он писался до nft -f, и отказ загрузки (set -e, выход 1)
# оставлял свежий файл при старом наборе: проверка sadik-watch «список старше 15 сут» проходила, хотя набор не обновлён.
cp "$TMP/cidrs.txt" "$DIR/ru_v4.cidrs"
echo "$(date -Is) ru_v4 loaded: $CNT CIDR from RIPE" >> "$DIR/update.log"
echo "OK: $CNT CIDR loaded into inet ru_split ru_v4"
