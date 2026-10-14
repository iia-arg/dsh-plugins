#!/bin/bash
# RU: Проба прав для корневых частей пакета: в одноразовом пространстве монтирования подменяет системные каталоги пустыми tmpfs, раскладывает ловушки и запускает security-root.py от root.
# EN: Privilege probe for the root-run parts of the package: inside a disposable mount namespace it overlays system directories with empty tmpfs, plants traps and runs security-root.py as root.
# RU: Аргументы: $1 — каталог пакета, $2 — существующий каталог улик (security.log, security-audit.json, security-acl.txt).
# EN: Arguments: $1 — package directory, $2 — existing evidence directory (security.log, security-audit.json, security-acl.txt).
# RU: Подставлено: каталоги установки, venv OMEGA и /run — tmpfs; старый runner.py — в /run/plugins-proba (каталог, куда пишет не root); /usr/bin/pass — заглушка с синтетическим ключом.
# EN: Substituted: install directories, the OMEGA venv and /run are tmpfs; the old runner.py lives in /run/plugins-proba (a directory writable by non-root); /usr/bin/pass is a stub returning a synthetic credential.
# RU: Не проверяет: боевую раскладку машины и боевой pass; сетевую изоляцию (сверяется только пространство монтирования).
# EN: Does not check: the real host layout or the real pass; network isolation (only the mount namespace is verified).
set -euo pipefail
# RU: Вызывающий обязан запускать скрипт через unshare --mount --net; напрямую не запускать никогда.
# EN: Parent caller must start this script with unshare --mount --net; never run directly.
# RU: Отказ с кодом 2, если пространство монтирования общее с PID 1 или запуск не от root.
# EN: Refuse with exit 2 if the mount namespace is shared with PID 1 or the caller is not root.
[ "$(readlink /proc/self/ns/mnt)" != "$(readlink /proc/1/ns/mnt)" ] || { echo 'REFUSED: mount namespace required'; exit 2; }
[ "$(id -u)" = 0 ] || { echo 'REFUSED: root required inside isolated namespace'; exit 2; }
package=$(realpath -- "${1:?package directory}")
output=$(realpath -- "${2:?existing evidence directory}")
# RU: Монтирования не уходят наружу; каталоги установки и /run подменяются пустыми tmpfs.
# EN: Mounts do not propagate outward; install directories and /run are replaced with empty tmpfs.
mount --make-rprivate /
mount -t tmpfs -o mode=755 tmpfs /usr/local/lib
mount -t tmpfs -o mode=755 tmpfs /opt/omega
mount -t tmpfs -o mode=755 tmpfs /run
install -d -m 755 /usr/local/lib/dsh-pamyat-obsluzhivanie /opt/omega/venv/lib/python3.12/site-packages /run/plugins-proba/dsh-pamyat-obsluzhivanie/src
# RU: Корневые модули ставятся из пакета с владельцем root; проба ставится под именем security-probe.py.
# EN: Root modules are installed from the package owned by root; the probe is installed as security-probe.py.
install -o root -g root -m 644 "$package/src/heartbeat.py" "$package/src/prepare_key.py" /usr/local/lib/dsh-pamyat-obsluzhivanie/
install -o root -g root -m 644 "$package/test/security-root.py" /usr/local/lib/dsh-pamyat-obsluzhivanie/security-probe.py
# RU: Ловушка 1: .pth в site-packages venv OMEGA; если его исполнят, появится /run/pth-executed.
# EN: Trap 1: a .pth file in the OMEGA venv site-packages; if executed, it creates /run/pth-executed.
cat > /opt/omega/venv/lib/python3.12/site-packages/audit_payload.py <<'PY'
import os
from pathlib import Path
Path('/run/pth-executed').write_text(str(os.geteuid()))
PY
printf 'import audit_payload\n' > /opt/omega/venv/lib/python3.12/site-packages/evil.pth
# RU: Ловушка 2: старый runner.py в каталоге, куда пишет не root; если его исполнят, появится /run/old-runner-executed.
# EN: Trap 2: an old runner.py in a directory writable by non-root; if executed, it creates /run/old-runner-executed.
cat > /run/plugins-proba/dsh-pamyat-obsluzhivanie/src/runner.py <<'PY'
import os
from pathlib import Path
Path('/run/old-runner-executed').write_text(str(os.geteuid()))
PY
# RU: Каталоги с ловушками отдаются непривилегированным учёткам: root не должен исполнять код, который может писать не root.
# EN: Trap directories are handed to unprivileged accounts: root must not execute code writable by non-root users.
chown -R nobody:nogroup /opt/omega /run/plugins-proba
# RU: Заглушка pass: выдаёт синтетический ключ только под учёткой coders, без PYTHONPATH и с пределом размера файла 65536; иначе выход 61/62/63.
# EN: pass stub: prints a synthetic credential only as user coders, without PYTHONPATH and with a 65536 file-size limit; otherwise exits 61/62/63.
cat > /usr/local/lib/dsh-pamyat-obsluzhivanie/pass-fixture <<'SH_PASS'
#!/bin/sh
[ "$(/usr/bin/id -un)" = coders ] || exit 61
[ "${PYTHONPATH+x}" != x ] || exit 62
[ "$(/usr/bin/prlimit --pid=$$ --fsize --noheadings --output SOFT)" = 65536 ] || exit 63
printf '%s\n' synthetic-credential
SH_PASS
chmod 755 /usr/local/lib/dsh-pamyat-obsluzhivanie/pass-fixture
# RU: Заглушка подменяет /usr/bin/pass привязкой, видимой только внутри пространства монтирования.
# EN: The stub replaces /usr/bin/pass via a bind mount visible only inside the namespace.
mount --bind /usr/local/lib/dsh-pamyat-obsluzhivanie/pass-fixture /usr/bin/pass
# RU: Проба идёт изолированным интерпретатором (-I -S -B); её улики копируются в каталог $2.
# EN: The probe runs in an isolated interpreter (-I -S -B); its evidence is copied into $2.
/usr/bin/python3 -I -S -B /usr/local/lib/dsh-pamyat-obsluzhivanie/security-probe.py > "$output/security.log" 2>&1
cp /run/security-audit.json /run/security-acl.txt "$output/"
