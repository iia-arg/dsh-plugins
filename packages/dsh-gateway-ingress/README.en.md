Russian version: [README.md](README.md) · English below

# dsh-gateway-ingress — ingress node for the sadik gateways

**Version:** 3.1.2

Service software of sadik: at boot it builds nft rules for "which accounts may call which gateway" from the agent
registry (`/etc/agent-registry/agents.yaml`) and the list of additional callers (`/etc/dsh-gateway/allowed-callers.json`)
and installs them with rollback; plus a one-time installer of ingress keys.

The package is a service package (group D): it is published as source, without npm, after the common secrets gate (`vorota-obezlichivaniya`).
**Temporary rule (Veniamin, 07.10.2026):** until new packages have a "production ↔ tag" reader, any file of the package
is changed only together with a new package version number in the same window.

The package is sources without `package.json`: `libexec/` mirrors the paths under `/usr/local/`, the unit is in `systemd/`
(installed under `/etc/systemd/system/`). The version number is the CHANGELOG heading and the tag
`dsh-gateway-ingress-v<номер>` (`<номер>` = number). Transfer from production: the checksum of every file in the tree
equals the checksum in production.

Denominator taken from disk on 07.10.2026: `/usr/local/libexec/dsh-gateway-ingress/` holds exactly 4 files (no keys and
no generated rules there), the unit has no drop-in, and there are no units outside the package that execute its files.

## Files

git stores only the "executable" bit, so the mode and owner on disk are given in the table (taken by `stat` of production on 07.10.2026).

| file in package | path on disk | called by | mode | owner:group |
|---|---|---|---|---|
| `libexec/dsh-gateway-ingress/boot.sh` | `/usr/local/libexec/dsh-gateway-ingress/boot.sh` | dsh-gateway-ingress.service (oneshot at boot) | 755 | root:root |
| `libexec/dsh-gateway-ingress/create-keys.py` | `/usr/local/libexec/dsh-gateway-ingress/create-keys.py` | root by hand (one-time key installer; does not replace existing keys) | 755 | root:root |
| `libexec/dsh-gateway-ingress/manage.sh` | `/usr/local/libexec/dsh-gateway-ingress/manage.sh` | boot.sh (apply); root by hand (rollback) | 755 | root:root |
| `libexec/dsh-gateway-ingress/render.py` | `/usr/local/libexec/dsh-gateway-ingress/render.py` | boot.sh | 755 | root:root |
| `systemd/dsh-gateway-ingress.service` | `/etc/systemd/system/dsh-gateway-ingress.service` | systemd (WantedBy, at boot) | 644 | root:root |

Purpose of the files (per the code):
- `boot.sh` — build the rules (`render.py`) and install them (`manage.sh apply`). `manage.sh` writes the snapshot of the
  previous rules to the temporary directory `/run/dsh-gateway-ingress/load-…`, and `boot.sh` deletes that directory right
  after applying: after the service starts or after `reload` there is no snapshot on disk (see below for how to roll back).
- `render.py` — nft rules from the agent registry and `allowed-callers.json`. The gate sits on output via `lo` to ANY
  address of this machine (`oifname "lo" fib daddr type local tcp dport @ports`, both address families; since 1.0.4).
  Before that it covered only `127.0.0.0/8` and `::1`, and a gateway listening on `0.0.0.0` was reachable by a local
  caller through the internal or public address, bypassing the account check.
- `manage.sh` — rule installer: `apply` or `rollback` (root only, three arguments).
- `create-keys.py` — one-time key installer; does not print the values and does not replace existing keys.

## Dependencies

- Programs: bash, python3 (module `yaml`), nft, systemctl.
- The agent registry `/etc/agent-registry/agents.yaml`, `/etc/dsh-gateway/allowed-callers.json` and the ingress keys are not part of the package.

## Allow file `/etc/dsh-gateway/allowed-callers.json`

By default an agent's gateway port is open only to root and to the agent's own account (registry field `polzovatel`).
The allow file only ADDS callers; it cannot narrow access. Format (per `render.py`): a JSON object; key — agent name
(`imya` of a registry entry that has `raskladka.port_shlyuza`), value — a list of entries with an account and a reason:

```json
{
  "<агент>": [
    {"user": "<учётка вызывающего>", "reason": "<зачем ей этот шлюз>"}
  ]
}
```

`render.py` fails, and no rules are built, if: the file is not JSON; the JSON is not an object or an agent's value is
not a list of objects (since 1.0.4 — `ValueError` with the file name and the expected shape, before that — an
`AttributeError` traceback); an entry has no `reason` or an empty `reason`; the account `user` does not exist on the
machine; a key is an agent that is not in the registry or has no gateway port. A missing file is not an error: empty
allow list and a `WARNING` line in the log (since 1.0.3).

A change to the file takes effect only via `systemctl reload dsh-gateway-ingress`. An error in the file during `reload`:
`boot.sh` exits before `manage.sh apply`, the rules stay as they were, `reload` returns a non-zero code. The same error,
if unnoticed until the machine reboots, fails the service at boot, and with it all gateways with
`Requires=dsh-gateway-ingress`. Therefore after every change — `reload` and a check of its exit code, not waiting for
a reboot.

## Gateway ingress keys (`create-keys.py`)

A gateway reads its key from the file named in its unit by the variable `GATEWAY_INGRESS_KEY_FILE`; on sadik this is
`/etc/dsh-gateway/ingress/<агент>.key` (`<агент>` = agent). Create the missing keys (root only):

```bash
sudo /usr/local/libexec/dsh-gateway-ingress/create-keys.py --registry /etc/agent-registry/agents.yaml --directory /etc/dsh-gateway/ingress
```

Both arguments are required; the directory must be an absolute path. The directory is created if needed (0755); it must
be owned by root and not writable by group or others, otherwise refusal. For every registry agent with a gateway port,
`<агент>.key` is written: 64 hexadecimal characters, 0600, owner — the agent's account. An existing key is not replaced:
if it is not a regular file, has the wrong owner or a mode other than 0600 — refusal naming the agent. Values are not
printed; the result is lines `<агент>: private ingress key created` or `<агент>: есть, не трогаю` (literal output,
"exists, leaving it alone"). Code 0 — all agents processed; refusal — code 1 and the reason on one line (keys of agents
processed before the refusal have already been created).

## Installation and removal (by hand, as root)

Installing a file: `install -o root -g root -m <режим из таблицы> <файл в пакете> <путь на диске>` (placeholders: mode
from the table, file in package, path on disk); in production — via `smontirovat-fajly` after the gate review. Unit: into
`/etc/systemd/system/`, `systemctl daemon-reload`, `systemctl enable dsh-gateway-ingress`.
During installation create `/etc/dsh-gateway/allowed-callers.json` containing `{}` (root:root 0644) if it does not exist: without the file, before 1.0.3 `render.py` failed and took down all gateways with `Requires=`; since 1.0.3 a missing file means an empty allow list (the gateway port is open only to root and the agent's account) and a `WARNING` line in the ingress log (B-N-1869). A broken file (not JSON, an entry without `reason`, an unknown agent or account) still crashes `render.py`, and with it the service and the gateways with `Requires=`.
To redraw the rules (new agent, port, `allowed-callers.json`, replacement of `render.py` or `boot.sh`) — `systemctl reload dsh-gateway-ingress` (since 1.0.2): the rules are built by `boot.sh` at startup, so a new `render.py` does not take effect without `reload`. 🔴 NOT
`restart`/`stop`: the gateways' `Requires=` propagates them to ALL gateways of the machine (B-N-1850). Check: `reload` exit
code 0, the ports in the set `nft list set inet dsh_gateway_ingress ports` are the previous ones plus the new one, the
gateways' `ActiveEnterTimestamp` values are unchanged.
⚠️ Ingress rules: a wrong change cuts agents off from their gateways. There is no ready snapshot for rollback after
`reload` — take one by hand BEFORE the change and keep it until verification:

```bash
sudo nft -s list table inet dsh_gateway_ingress | sudo tee /root/dsh-gateway-ingress-do-pravki.nft >/dev/null
# правка allowed-callers.json или реестра, затем reload и проверка
sudo /usr/local/libexec/dsh-gateway-ingress/manage.sh rollback /dev/null /root/dsh-gateway-ingress-do-pravki.nft
```

`manage.sh rollback` requires three arguments; the second (the rules file) is not read during rollback, so `/dev/null`
will do. Rollback deletes the current table `dsh_gateway_ingress` and loads the snapshot; the snapshot file must exist,
otherwise refusal, code 2.

Removing the unit — `systemctl mask` (farm rule 9): our unit with a file in `/etc/systemd/system` will not accept mask —
move the file to a backup (`mv`), `daemon-reload`, `mask`; to restore — `unmask` and put the file back.

## Verification

The checksum of every package file = the production checksum (`sha256sum`), permissions = the table (`stat -c '%a %U:%G'`).

In the service log (`journalctl -u dsh-gateway-ingress`), after every start and `reload` there is the line
`dsh-gateway-ingress: registry rules applied; rollback is explicit, service stop retains protection`. The line
`dsh-gateway-ingress: WARNING no extras file /etc/dsh-gateway/allowed-callers.json: extra callers empty (agent owner and root only)`
means that the additional-callers file is missing and the rules were built without it: if callers are needed, restore
the file and run `reload`.
