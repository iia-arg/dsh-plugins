#!/usr/bin/env bash
# Копия API Острова для стендов моста (stend-ostrov-api, stend-saved-plans): устойчивое место вместо рабочих каталогов Марка.
#   kopiya-ostrov-api.sh <архив Марка .tar или .tar.gz> <релиз с vps-ru> <каталог …/ostrov-api> (обязателен: умолчания-пути машины нет, A-N-1948 №2)
# Формы: candidate/app + deployment/manifest.json (прежняя), app + manifest.json (новая).
# <релиз с vps-ru> — поле release из /_retreat/health боевого API, снятое рукой с доступом к vps-ru (только чтение) при обновлении.
# Порядок при каждом релизе Марка: снять release с vps-ru → запустить это под root → в выводе «копия установлена».
# Отказ (код 2, копия не тронута): последнее звено каталога не ostrov-api; существующий каталог или .prezhnyaya — не
#   прежняя копия; в app ссылка или устройство; архив не читается; нет deployment/manifest.json; manifest.artifact ≠ релизу с vps-ru;
#   состав candidate/app ≠ manifest.files; сумма любого файла ≠ манифесту; неизвестный довод.
# Пишет: <каталог>/app (файлы 0644, каталоги 0755, под root — владелец root), <каталог>/manifest.json,
#   <каталог>/ISTOCHNIK (архив, его sha256, релиз, время UTC). Замена — сборка рядом и mv; прежняя копия → <каталог>.prezhnyaya.
# Читатель копии — стенды через OSTROV_API_MANIFEST=<каталог>/manifest.json (test/ostrov-api-kopiya.mjs).
# Чего НЕ ловит: что архив побайтно тот, что стоит на vps-ru, — связь только через номер релиза в health и манифест;
#   новый релиз Марка без запуска этого установщика (копия устареет молча до следующего обновления).
set -euo pipefail
[ $# -eq 3 ] || { echo "отказ: доводы — <архив.tar или .tar.gz> <релиз с vps-ru> <каталог …/ostrov-api>" >&2; exit 2; }
ARH=$1; REL=$2; KAT=$3
[[ $REL =~ ^[0-9a-f]{12}$ ]] || { echo "отказ: релиз «$REL» — не 12 шестнадцатеричных знаков" >&2; exit 2; }
[[ $KAT = /* ]] || { echo "отказ: каталог не абсолютный" >&2; exit 2; }
# Ворота Вениамина 08:04Z: чужой каталог не трогать. Последнее звено — ostrov-api; существующие $KAT и $KAT.prezhnyaya —
# только прежние копии (ISTOCHNIK, manifest.json, app/, не ссылки). Иначе отказ до любой записи.
[ "$(basename -- "$KAT")" = ostrov-api ] || { echo "отказ: последнее звено каталога не ostrov-api: $KAT" >&2; exit 2; }
kopiya() { [ ! -L "$1" ] && [ -d "$1" ] && [ -f "$1/ISTOCHNIK" ] && [ -f "$1/manifest.json" ] && [ -d "$1/app" ] && [ ! -L "$1/app" ]; }
for d in "$KAT" "$KAT.prezhnyaya"; do
  { [ -e "$d" ] || [ -L "$d" ]; } && ! kopiya "$d" && { echo "отказ: $d существует и это не прежняя копия (нет ISTOCHNIK/manifest.json/app или ссылка) — не трогаю" >&2; exit 2; }
done
W=$(mktemp -d); trap 'rm -rf -- "$W"' EXIT
python3 - "$ARH" "$W" <<'PY' || exit 2
import os, pathlib, shutil, stat, sys, tarfile
archive, w = sys.argv[1:]
try:
    fd = os.open(archive, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    with os.fdopen(fd, 'rb') as f:
        if not stat.S_ISREG(os.fstat(f.fileno()).st_mode): raise ValueError('не обычный архив')
        with tarfile.open(fileobj=f, mode='r:*') as t:
            members = {}
            for m in t.getmembers():
                name = m.name
                while name.startswith('./'): name = name[2:]
                if not name or name == '.':
                    if m.isdir(): continue
                p = pathlib.PurePosixPath(name)
                if p.is_absolute() or '..' in p.parts: raise ValueError(f'опасный путь {m.name}')
                name = str(p)
                if name in members: raise ValueError(f'повтор имени {name}')
                members[name] = m
            layouts = [(app, manifest) for app, manifest in [('candidate/app', 'deployment/manifest.json'), ('app', 'manifest.json')]
                       if manifest in members and any(n == app or n.startswith(app + '/') for n in members)]
            if len(layouts) != 1: raise ValueError('форма архива не определена однозначно: нужны candidate/app + deployment/manifest.json либо app + manifest.json')
            app, manifest = layouts[0]
            wanted = [(name, m) for name, m in members.items() if name == manifest or name == app or name.startswith(app + '/')]
            for name, m in wanted:
                if not (m.isfile() or m.isdir()) or name == manifest and not m.isfile(): raise ValueError(f'нерегулярный предмет {name}')
            for name, m in wanted:
                target = pathlib.Path(w) / ('deployment/manifest.json' if name == manifest else 'candidate/app' + name[len(app):])
                if m.isdir(): target.mkdir(parents=True, exist_ok=True)
                else:
                    target.parent.mkdir(parents=True, exist_ok=True)
                    with target.open('xb') as out: shutil.copyfileobj(t.extractfile(m), out)
except (OSError, ValueError, tarfile.TarError) as e:
    print(f'отказ: архив {archive}: {e}', file=sys.stderr); sys.exit(2)
PY
python3 - "$W" "$REL" <<'PY' || exit 2
import hashlib, json, os, re, sys
w, rel = sys.argv[1], sys.argv[2]
try:
    m = json.load(open(os.path.join(w, 'deployment/manifest.json')))
except (OSError, ValueError) as e:
    sys.exit(print(f"отказ: deployment/manifest.json не прочитан: {e}", file=sys.stderr) or 2)
app = os.path.join(w, 'candidate/app')
if not isinstance(m, dict) or not isinstance(m.get('files'), dict): sys.exit(print('отказ: deployment/manifest.json: нужна форма {artifact, files: {путь: sha256}}', file=sys.stderr) or 2)
if m.get('artifact') != rel: sys.exit(print(f"отказ: манифест релиза {m.get('artifact')} ≠ релизу с vps-ru {rel}", file=sys.stderr) or 2)
for name, digest in m['files'].items():
    if not isinstance(digest, str) or not re.fullmatch('[0-9a-f]{64}', digest): sys.exit(print(f'отказ: манифест {name}: неверная sha256', file=sys.stderr) or 2)
if 'server.py' not in m['files']: sys.exit(print('отказ: манифест без server.py', file=sys.stderr) or 2)
for d, ds, fs in os.walk(app):
    for n in ds + fs:
        q = os.path.join(d, n); st = os.lstat(q)
        import stat as S
        if not (S.S_ISREG(st.st_mode) or S.S_ISDIR(st.st_mode)): sys.exit(print(f"отказ: в app нерегулярный файл (ссылка/устройство): {os.path.relpath(q, app)}", file=sys.stderr) or 2)
est = {os.path.relpath(os.path.join(d, f), app) for d, _, fs in os.walk(app) for f in fs}
if est != set(m['files']): sys.exit(print(f"отказ: состав app ≠ манифесту: лишние {sorted(est - set(m['files']))[:3]}, нет {sorted(set(m['files']) - est)[:3]}", file=sys.stderr) or 2)
for f in sorted(est):
    s = hashlib.sha256(open(os.path.join(app, f), 'rb').read()).hexdigest()
    if s != m['files'][f]: sys.exit(print(f"отказ: {f} сумма {s[:16]} ≠ манифесту {m['files'][f][:16]}", file=sys.stderr) or 2)
print(f"сверено: релиз {rel}, файлов {len(est)}, server.py {m['files']['server.py'][:16]}")
PY
mkdir -p -- "$(dirname "$KAT")"
NOV=$(mktemp -d "$KAT.new.XXXXXX")
cp -r "$W/candidate/app" "$NOV/app"; cp "$W/deployment/manifest.json" "$NOV/manifest.json"
printf 'архив %s\nsha256 %s\nрелиз %s\nустановлено %s\n' "$ARH" "$(sha256sum "$ARH" | cut -d' ' -f1)" "$REL" "$(date -u '+%F %TZ')" > "$NOV/ISTOCHNIK"
find "$NOV" -type d -exec chmod 0755 {} +; find "$NOV" -type f -exec chmod 0644 {} +
[ "$(id -u)" = 0 ] && chown -R root:root "$NOV"
if [ -e "$KAT" ]; then
  for d in "$KAT" "$KAT.prezhnyaya"; do { [ -e "$d" ] || [ -L "$d" ]; } && ! kopiya "$d" && { echo "отказ: $d перестал быть копией во время установки" >&2; rm -rf -- "$NOV"; exit 2; }; done
  [ -e "$KAT.prezhnyaya" ] && rm -rf -- "$KAT.prezhnyaya"
  mv -- "$KAT" "$KAT.prezhnyaya"
fi
mv -- "$NOV" "$KAT"
echo "копия установлена: $KAT (релиз $REL, server.py $(sha256sum "$KAT/app/server.py" | cut -c1-16))"
