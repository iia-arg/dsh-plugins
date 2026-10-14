#!/bin/bash
set -euo pipefail
root=/usr/local/libexec/dsh-gateway-ingress
stage=$(mktemp -d /run/dsh-gateway-ingress/load-XXXXXX)
trap 'rm -rf "$stage"' EXIT
/usr/bin/python3 "$root/render.py" --registry /etc/agent-registry/agents.yaml --extras /etc/dsh-gateway/allowed-callers.json > "$stage/rules.nft"
"$root/manage.sh" apply "$stage/rules.nft" "$stage/before.nft"
echo 'dsh-gateway-ingress: registry rules applied; rollback is explicit, service stop retains protection'
