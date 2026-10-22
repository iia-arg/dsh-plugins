#!/bin/bash
# Source keeper only; no live mounts, services, queue or private /root state.
set -euo pipefail
[[ $# = 3 && "$1" = merge ]] || { echo 'usage: source-iskra.sh merge REPO KIT' >&2; exit 2; }
repo=$2
kit=$3
[[ $(git -C "$repo" symbolic-ref --short HEAD) = master ]]
[[ -z $(git -C "$repo" status --porcelain) ]]
python3 -I -B - "$repo" "$kit" <<'PY'
import hashlib,json,subprocess,sys
from pathlib import Path
repo,kit=map(Path,sys.argv[1:]);r=json.loads((kit/'RELEASE.json').read_text());base=r['base_commit']
remote=subprocess.check_output(['git','ls-remote','https://github.com/nick-vels/skills.git','refs/heads/main'],text=True,timeout=20).split()
if remote!=[r['upstream_sha'],'refs/heads/main']:raise SystemExit('upstream main moved or unreadable: new candidate required')
actual=subprocess.check_output(['git','-C',str(repo),'rev-parse','HEAD:packages/dsh-autopilot'],text=True).strip()
expected=subprocess.check_output(['git','-C',str(repo),'rev-parse',base+':packages/dsh-autopilot'],text=True).strip()
if actual!=expected:raise SystemExit('AP source moved: new candidate required')
if hashlib.sha256((kit/'source.bundle').read_bytes()).hexdigest()!=r['bundle_sha256']:raise SystemExit('bundle differs')
PY
git -C "$repo" fetch --no-tags "$kit/source.bundle" alfa/root-claude
git -C "$repo" merge --no-edit FETCH_HEAD
python3 -I -B - "$repo" "$kit" <<'PY'
import json,subprocess,sys
from pathlib import Path
repo,kit=map(Path,sys.argv[1:]);r=json.loads((kit/'RELEASE.json').read_text())
assert subprocess.check_output(['git','-C',str(repo),'rev-parse','HEAD:packages/dsh-autopilot'],text=True).strip()==r['trees']['dsh-autopilot']
assert not subprocess.check_output(['git','-C',str(repo),'status','--porcelain'],text=True)
print('SOURCE_MERGE_PASS '+subprocess.check_output(['git','-C',str(repo),'rev-parse','HEAD'],text=True).strip())
PY
