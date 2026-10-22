#!/usr/bin/env bash
# Offline root installer. DESTDIR confines all installation writes to a fixture.
# Only lays out reviewed bytes; never runs upstream ap.py/tests or operator events.
# The assembled runtime refuses root; its operator account is master.
# Before service activation: autopilot-view, Master membership and private public tree.
# This script never enables/restarts services; DESTDIR uses its own account database.
# Service D credential is generated privately only if missing/empty; never printed/rotated.
set -euo pipefail
task_package_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)
exec /usr/bin/python3 -B "$task_package_dir/lib/install.py" "$@"
