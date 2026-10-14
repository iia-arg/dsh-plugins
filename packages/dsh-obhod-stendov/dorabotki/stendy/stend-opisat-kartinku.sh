#!/usr/bin/env bash
# Стенд КОМАНДЫ-ОПИСАТЕЛЯ opisat-kartinku (C-N-1138, 28.09.2026, Искра).
# Гоняет команду (OPISATEL_KOMANDA, умолчание /usr/local/bin/opisat-kartinku) против ПОДСТАВНЫХ
# серверов ollama и OpenAI на 127.0.0.1:<случайный порт> — боевые адреса, настоящие модели и
# ключи не зовутся. Проверяет: пути и подпись первой строки; ключ только заголовком и нигде в
# выводе; отказ ни одним путём = код 2; режим pervyj не зовёт OpenAI после удачи qwen; таймаут
# пути; неизвестный ключ и не-картинка — отказ без сети; картинка доходит байт в байт.
# ГРАНИЦА: качество описаний НЕ проверяется (подстава отвечает заготовкой); настоящая qwen2.5vl и
# настоящий OpenAI — отдельная живая проба, её этот стенд не заменяет.
set -u
K="${OPISATEL_KOMANDA:-/usr/local/bin/opisat-kartinku}"
[ -x "$K" ] || { echo "СЛЕПОТА: нет команды $K"; exit 2; }
RAB=$(mktemp -d "${TMPDIR:-/tmp}/stend-opisat.XXXXXX") || exit 2
SRV=
trap '[ -n "$SRV" ] && kill "$SRV" 2>/dev/null; rm -rf -- "${RAB:?}"' EXIT
trap 'exit 143' TERM; trap 'exit 130' INT
export PYTHONDONTWRITEBYTECODE=1

# подставной сервер: режимы из файлов $RAB/rezhim-{qwen,openai} (ok|pusto|sleep|401), счёт вызовов — $RAB/zovy-*
cat > "$RAB/srv.py" <<'PY'
import base64, http.server, json, os, sys, time
RAB = sys.argv[1]; KLYUCH = open(os.path.join(RAB, 'klyuch-obrazec')).read().strip()
KART = open(os.path.join(RAB, 'kartinka.png'), 'rb').read()
def rezhim(p):
    try: return open(os.path.join(RAB, 'rezhim-' + p)).read().strip()
    except OSError: return 'ok'
def zov(p, zapis):
    with open(os.path.join(RAB, 'zovy-' + p), 'a') as f: f.write(zapis + '\n')
class H(http.server.BaseHTTPRequestHandler):
    def log_message(self, *a): pass
    def otvet(self, kod, d):
        b = json.dumps(d).encode(); self.send_response(kod); self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(b))); self.end_headers(); self.wfile.write(b)
    def do_POST(self):
        d = json.loads(self.rfile.read(int(self.headers.get('Content-Length', 0))))
        if self.path == '/api/chat':
            img = base64.b64decode(d['messages'][0]['images'][0]); zov('qwen', 'bajty-sovpali' if img == KART else 'bajty-RAZNYE')
            r = rezhim('qwen')
            if r == 'sleep': time.sleep(3)
            return self.otvet(200, {'message': {'content': '' if r == 'pusto' else 'ПОДСТАВА-QWEN: красный квадрат'}})
        if self.path == '/v1/chat/completions':
            avt = self.headers.get('Authorization', ''); zov('openai', 'klyuch-v-zagolovke' if avt == 'Bearer ' + KLYUCH else 'klyuch-NE-TOT')
            if rezhim('openai') == '401':
                return self.otvet(401, {'error': {'message': 'Incorrect API key provided: ' + KLYUCH}})
            return self.otvet(200, {'choices': [{'message': {'content': 'ПОДСТАВА-OPENAI: красный квадрат'}}]})
        self.otvet(404, {})
s = http.server.ThreadingHTTPServer(('127.0.0.1', 0), H)
open(os.path.join(RAB, 'port'), 'w').write(str(s.server_address[1])); s.serve_forever()
PY
python3 -B -c "import base64;open('$RAB/kartinka.png','wb').write(base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC'))"
printf 'sk-stend%s\n' "$(head -c 12 /dev/urandom | od -An -tx1 | tr -d ' \n')" > "$RAB/klyuch-obrazec"
python3 -B "$RAB/srv.py" "$RAB" & SRV=$!
for _ in $(seq 50); do [ -s "$RAB/port" ] && break; sleep 0.1; done
[ -s "$RAB/port" ] || { echo "СЛЕПОТА: подставной сервер не встал"; exit 2; }
PORT=$(cat "$RAB/port"); KL=$(cat "$RAB/klyuch-obrazec")
echo "== команда $K sha256[:16] $(sha256sum "$K" | cut -c1-16) · подстава 127.0.0.1:$PORT · $(date -u +%H:%M:%SZ)"

ok=0; bed=0; vsego=0
sud() { vsego=$((vsego+1)); if [ "$2" = 1 ]; then ok=$((ok+1)); echo "  ✅ $1"; else bed=$((bed+1)); echo "  🔴 $1 — $3"; fi; }
zovi() {  # $1 — есть ли ключ (da|net); остальное — env; вывод в $RAB/out, $RAB/err, код в KOD
  local k="$RAB/net-klyucha"; [ "$1" = da ] && k="$RAB/klyuch-obrazec"; shift
  env -i PATH=/usr/bin:/bin OPISATEL_OLLAMA_URL="http://127.0.0.1:$PORT" OPISATEL_OPENAI_URL="http://127.0.0.1:$PORT/v1/chat/completions" \
    OPISATEL_OPENAI_KLYUCH="$k" OPISATEL_TAJMAUT_S=1 "$@" "$K" "$RAB/kartinka.png" >"$RAB/out" 2>"$RAB/err"; KOD=$?
}
sbros() { rm -f "$RAB"/zovy-* "$RAB"/rezhim-*; }
zovov() { [ -f "$RAB/zovy-$1" ] && grep -c . "$RAB/zovy-$1" || echo 0; }
klyuch_utyok() { grep -qF "$KL" "$RAB/out" "$RAB/err"; }

sbros; zovi net
sud "qwen есть, ключа нет: код 0, первая строка «qwen — да; openai — нет: ключа нет»" \
  "$([ $KOD = 0 ] && head -1 "$RAB/out" | grep -qE 'qwen — да .*; openai — нет: ключа нет' && grep -qF 'ПОДСТАВА-QWEN' "$RAB/out" && echo 1)" "код $KOD: $(head -c 200 "$RAB/out" "$RAB/err" | tr '\n' ' ')"
sud "картинка дошла до qwen байт в байт" "$(grep -qx 'bajty-sovpali' "$RAB/zovy-qwen" 2>/dev/null && echo 1)" "$(cat "$RAB/zovy-qwen" 2>/dev/null)"
sud "без ключа OpenAI не зван ни разу" "$([ "$(zovov openai)" = 0 ] && echo 1)" "зовов $(zovov openai)"

sbros; zovi da
sud "оба пути (режим oba): код 0, оба описания под подписью пути" \
  "$([ $KOD = 0 ] && grep -qF '── qwen2.5vl:7b (локально, ollama):' "$RAB/out" && grep -qF '── OpenAI gpt-4o-mini:' "$RAB/out" && grep -qF 'ПОДСТАВА-OPENAI' "$RAB/out" && echo 1)" "код $KOD: $(tr '\n' ' ' < "$RAB/out" | head -c 200)"
sud "ключ ушёл ТОЛЬКО заголовком Authorization, в выводе его нет" "$(grep -qx 'klyuch-v-zagolovke' "$RAB/zovy-openai" 2>/dev/null && ! klyuch_utyok && echo 1)" "$(cat "$RAB/zovy-openai" 2>/dev/null)"

sbros; echo 401 > "$RAB/rezhim-openai"; zovi da
sud "OpenAI 401 с ключом в теле ответа: причина «HTTP 401», ключа в выводе нет" "$(head -1 "$RAB/out" | grep -qF 'openai — нет: HTTP 401' && ! klyuch_utyok && echo 1)" "$(head -1 "$RAB/out")"

sbros; zovi da OPISATEL_REZHIM=pervyj
sud "режим pervyj: qwen удался → OpenAI НЕ зван, строка «openai — нет: не звали»" "$([ $KOD = 0 ] && [ "$(zovov openai)" = 0 ] && head -1 "$RAB/out" | grep -qF 'openai — нет: не звали' && echo 1)" "код $KOD, openai зовов $(zovov openai)"

sbros; echo sleep > "$RAB/rezhim-qwen"; zovi net
sud "таймаут qwen (сервер спит 3 с, предел 1 с) и ключа нет: код 2, причина в stderr" "$([ $KOD = 2 ] && grep -qF 'не описано ни одним путём' "$RAB/err" && grep -qiE 'qwen — нет: .*(timed out|время)' "$RAB/err" && echo 1)" "код $KOD: $(head -c 200 "$RAB/err")"

sbros; echo pusto > "$RAB/rezhim-qwen"; zovi da OPISATEL_REZHIM=pervyj
sud "qwen пустой ответ → pervyj идёт к OpenAI: код 0, описание OpenAI" "$([ $KOD = 0 ] && head -1 "$RAB/out" | grep -qF 'qwen — нет: пустой ответ модели' && grep -qF 'ПОДСТАВА-OPENAI' "$RAB/out" && echo 1)" "код $KOD: $(head -1 "$RAB/out")"

sbros; env -i PATH=/usr/bin:/bin "$K" --dry-run "$RAB/kartinka.png" >"$RAB/out" 2>"$RAB/err"; KOD=$?
sud "ключ --dry-run → ОТКАЗ код 2, серверы не званы" "$([ $KOD = 2 ] && grep -qF 'ОТКАЗ' "$RAB/err" && [ "$(zovov qwen)$(zovov openai)" = 00 ] && echo 1)" "код $KOD"

sbros; printf 'не картинка' > "$RAB/tekst.png"; env -i PATH=/usr/bin:/bin OPISATEL_OLLAMA_URL="http://127.0.0.1:$PORT" "$K" "$RAB/tekst.png" >"$RAB/out" 2>"$RAB/err"; KOD=$?
sud "не картинка по сигнатуре → ОТКАЗ код 2, серверы не званы" "$([ $KOD = 2 ] && grep -qF 'не картинка' "$RAB/err" && [ "$(zovov qwen)" = 0 ] && echo 1)" "код $KOD"

sud "__pycache__ рядом с командой не появился" "$([ ! -e "$(dirname "$K")/__pycache__/opisat-kartinkucpython-312.pyc" ] && echo 1)" "есть кэш у $K"

ZHDYOM=12
echo; echo "итог: $ok из $vsego"
[ "$vsego" = "$ZHDYOM" ] || { echo "🔴 КАНАРЕЙКА: проб $vsego, ЖДЁМ $ZHDYOM"; exit 2; }
[ "$bed" = 0 ]
