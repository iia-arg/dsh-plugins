#!/bin/bash
# Explicit candidate installer; never called on the host during preparation.
set -euo pipefail
[[ $EUID = 0 && $# = 3 && ( $1 = apply || $1 = rollback ) ]] || { echo 'usage (root): manage.sh apply|rollback rules.nft backup.nft' >&2; exit 2; }
action=$1; rules=$2; backup=$3
exec 9>/run/lock/dsh-gateway-ingress.lock
flock -x 9
work=$(mktemp); trap 'rm -f "$work"' EXIT
exists=0; nft list table inet dsh_gateway_ingress >/dev/null 2>&1 && exists=1
if [[ $action = apply ]]; then
 [[ -f $rules && ! -e $backup ]] || { echo 'missing rules or existing backup' >&2; exit 2; }
 umask 077
 if [[ $exists = 1 ]]; then nft -s list table inet dsh_gateway_ingress > "$backup"; else printf '# absent\n' > "$backup"; fi
 [[ $exists = 0 ]] || printf 'delete table inet dsh_gateway_ingress\n' >> "$work"
 cat "$rules" >> "$work"
else
 [[ -f $backup ]] || { echo 'missing backup' >&2; exit 2; }
 [[ $exists = 0 ]] || printf 'delete table inet dsh_gateway_ingress\n' >> "$work"
 cat "$backup" >> "$work"
fi
nft -c -f "$work"
nft -f "$work"
