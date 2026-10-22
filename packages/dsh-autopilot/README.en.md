# dsh-autopilot 0.1.16 — project work for an agent team

[Русский](README.md) · [Server candidate history](HISTORY.en.md)

[E01–E05 configuration templates](config/examples/) · [Manual setup notes (Russian)](config/examples/INSTALL-NOTES.md)

Autopilot takes a project through requirements, a plan, assignments, implementation, independent review and completion. Tasks and results stay with the project; a web dashboard shows the team's progress. An operator sets the goal and makes decisions, while executors receive assignments through dedicated mail.

This is the server adaptation of **Nikita Veles's Autopilot** for DeepSeek Harness (DSH). The original idea and skill come from [nick-vels/skills](https://github.com/nick-vels/skills). Our layer adds pinned run cores, separate Unix accounts, team mail, dashboard publication and approximate turn statistics. MIT licensing and attribution are preserved in [NOTICE](NOTICE) and [LICENSE](LICENSE).

The package targets a Linux server with an administrator and an existing DSH installation. The profile below uses Master through Codex app-server, five Codex executors and Sova through Claude. A different model route needs profile/fence adaptation first; the absence of a gateway import in the Python core does not make the gateway optional for this profile. Version 0.1.16 fixes the server team names to **master, vintik, shpuntik, gayka, shurup, sova, tumbler**. A different team requires code adaptation and verification. The installer lays out the core and its filesystem support; mail, agents, dashboard access and the initial RUN catalogue are separate setup steps below.

## Components

| Part | Purpose |
|---|---|
| Pinned skill and phases | Requirements → specification → plan → execution → review → acceptance. source-lock.json pins upstream; vendor/ includes the archive. |
| Core and RUN catalogue | A physical release directory, operator.lock and the project's core pin. Updating current does not move an existing run to new code. |
| Mail | A dedicated TLS-authenticated Unix socket, SQLite storage, task/result delivery, acknowledgements and time/size limits. |
| TG notices | A short notice wakes the recipient, who fetches the original from the authenticated socket. Telegram text does not establish sender identity. |
| Dashboard | Static dashboard.html/state.js and a separate reading service. Private project state and the public projection are separate. |
| Statistics in 0.1.16 | End-of-turn rows are summed over the RUN's time window, labelled ≈ and stored in a separate accounting state. These are statistics, not a provider invoice. |

## Required packages

The Codex end-row contract first appears in gateway 3.1.5; this guide pins 3.1.10. The Master gateway is also required for the first bootstrap: the standard fence requires master.service and coder-gateway-master.service under Master's UID. Version 3.1.5 marks the end-row ABI introduction, not a tested minimum for the whole installation. TG AP notices appeared in 3.1.11; Claude end rows require 3.1.15. These are code/CHANGELOG lower bounds, not a complete test of historical releases. A universal historical minimum DSH/SDK version for the entire system has not been established; verify the chosen DSH profile separately.

The versions below are **versions in this repository**, not a promise that these numbers are published on npm. See the [41-package catalogue](../../docs/PACKAGES.md). Record the Git SHA of your checkout for a repeatable installation.

| Component | Version in this tree | When it is needed |
|---|---|---|
| [dsh-autopilot](./) | 0.1.16 | Includes the core, postal runtime, accounting and dashboard server. |
| [dsh-telegram-multiagent](../dsh-telegram-multiagent) | 3.1.15 | Telegram channel, AP notices, receipts and the Claude end writer. Required for the team profile described here. |
| [dsh-pamyat-core](../dsh-pamyat-core) | 3.1.3 | An optional DSH event helper, recommended and selected in the example below. Without it, TG reads session.events or snapshotEvents(); without either native API, receipts fail explicitly. It is not a required AP dependency. |
| [dsh-subscription-gateway](../dsh-subscription-gateway) | 3.1.10 | Required by the Master/Codex profile below. End-row ABI first appears in 3.1.5; this guide pins 3.1.10. This is a functional lower bound, not a tested recommendation to downgrade the entire build. |
| [dsh-subscription-adapter](../dsh-subscription-adapter) | 3.1.3 | Connects DSH to the subscription gateway when that route is selected. |
| [dsh-tool-bridge](../dsh-tool-bridge) | 3.1.9 | Exposes DSH tools to an external engine; it belongs with that engine, rather than being an import of the Python core. |
| [dsh-trevogi](../dsh-trevogi) | 3.1.10 | agent-alert and its spool are checked by the supplied postal units before startup. |
| [dsh-montazh](../dsh-montazh) | 3.1.46 | A recorded deployment window and its root receipt, required by the catalogue bootstrap. |
| [dsh-podyom](../dsh-podyom) | 3.1.4 | Additional administrator tools for our service bring-up procedure; the AP tick does not call them. |
| [dsh-reestr](../dsh-reestr) | 3.1.10 | The registry when using our full deployment/bring-up route; standalone ap.py does not import it. |
| [dsh-storozha-sadik](../dsh-storozha-sadik) | 3.1.28 | Optional persistent-notice monitoring when transferring our health checks; the counter itself does not require it. |

For this exact profile, install dsh-autopilot, TG, gateway, adapter, tool-bridge, trevogi and montazh from the table. Adapter and tool-bridge are required by the external engine. The example additionally installs the recommended pamyat-core 3.1.3; a complete TG run without it was not verified here. The full montazh file-accounting route needs dsh-reestr 3.1.10, plus PyYAML to read the registry. The publication/copies branch additionally requires [dsh-pribory 3.1.4](../dsh-pribory) (the function first appeared in 3.1.2; npm-sostav needs jq) and [dsh-vypusk-watch 3.1.8](../dsh-vypusk-watch) (copy-compare.sh). These helpers are not requirements of every arbitrary montazh-okno call or AP tick; the bootstrap shown below does not use publication/copies. A historical dsh-vypusk-watch minimum has not been established. dsh-podyom and dsh-storozha-sadik add operational checks; the commands below use systemctl directly. Do not enable every montazh timer: its extra watchers and stand runner form a separate host-specific subsystem.

The entire dsh-pamyat family, OMEGA, voice stack, social services and every sadik watcher are not imports of the AP core. Install them for the agents or operations that need them. AP mail is included in dsh-autopilot: its task transport is separate from a2a-send in dsh-pochta.

Host prerequisites: Linux with systemd and cgroup v2; **Python 3.10+** with stdlib/SQLite/SSL, Bash, Git, coreutils, util-linux, Unix account tools, ACL utilities and OpenSSL. TG 3.1.15 requires **Node.js 24+**. Install DSH using its own instructions, then configure each agent's model and tools. Subscription credentials, bot tokens and model access are not included in this repository. The montazh-okno window operator also needs PyYAML (python3-yaml).

## Install from this repository

The administrator deploys files and services; the unprivileged master account operates projects. The root commands below describe a new host. An existing AP installation needs its own backup, RUN preservation and coordinated update window.

The new-host procedure is derived from the code and from our running deployment; a from-scratch install on a clean server has not been run.

Fillable E01–E05 templates and manual setup order are in [INSTALL-NOTES.en.md](config/examples/INSTALL-NOTES.en.md); name and shared-layout constraints are in [FIXED-NAMES.en.md](config/examples/FIXED-NAMES.en.md). These supplement the steps below, not a whole-farm installer: fill the placeholders for your host and retain the fixed Unix names.

### 1. Obtain and check the tree

~~~sh
git clone https://github.com/iia-arg/dsh-plugins.git
cd dsh-plugins
REPO="$(pwd -P)"
export REPO
git rev-parse HEAD
python3 -c 'import json; print(json.load(open("packages/dsh-autopilot/package.json"))["version"])'
bash tools/check-readme-count.sh
bash tools/check-readme-index.sh
~~~

This guide describes AP 0.1.16. Take related packages from the same checkout. Installing only the dsh-autopilot npm package does not provision the server.

### 2. Prepare accounts, DSH and supporting packages

First prepare working agent instances using the DSH and gateway instructions: these are prerequisites of AP, not results of its install.sh. This example uses HOME /opt/<name>, workspace /opt/<name>/workspace and DSH app /opt/<name>/app; these paths must match your units and profiles. Create the seven separate unprivileged team accounts, their workspaces and DSH profiles. The operator must be named master. Create distinct autopilot-post and autopilot-copy service accounts and an autopilot-mail group; give the services and team the access required by that group. Executors must not gain access to each other's HOME directories or unrelated ordinary mail.

Each agent must already have a working model and tools. Check master.service and coder-gateway-master.service, actual HOME/workspace/CODEX_HOME paths, bots, owner ID and traffic chat. The administrator supplies these DSH/gateway profiles, initial registry and external TLS/auth using the corresponding package documentation; AP does not ship a universal farm configuration. The complete cold path from a clean OS to a first task has not yet been verified. The examples below cover the AP layer on a prepared farm.

autopilot-mail membership is the seven team accounts, autopilot-post and autopilot-copy, with no outsiders. Every account has a distinct UID and its own primary group. Executors, autopilot-post and autopilot-copy must not belong to a2a-pochta; only master may also use ordinary mail. The postal service checks this through production_accounts().

Build package archives from this checkout and install them into each corresponding DSH profile. This creates local tarballs, not an npm publication. TARS must be readable by the agents and REPO is the saved absolute checkout path. Run installation as the profile owner:

~~~sh
# From the repository, as the administrator who prepares public package archives:
TARS=/var/tmp/dsh-ap-package-tars
install -d -m 0755 "$TARS"
npm pack "$REPO/packages/dsh-pamyat-core" --ignore-scripts --offline --pack-destination "$TARS"
npm pack "$REPO/packages/dsh-telegram-multiagent" --ignore-scripts --offline --pack-destination "$TARS"
~~~

Then, as the owner of the target profile (master shown here; this directory must already exist after DSH setup):

~~~sh
TARS=/var/tmp/dsh-ap-package-tars
PROFILE=/opt/master/.dsh/profiles/web
cd "$PROFILE"
npm install "$TARS/dsh-pamyat-core-3.1.3.tgz" "$TARS/dsh-telegram-multiagent-3.1.15.tgz"
~~~

For the subscription route, follow the gateway, adapter and tool-bridge instructions linked above. The gateway is a service, rather than a DSH plugin row. The root catalogue window uses the unit names master.service and coder-gateway-master.service; arbitrary unit renaming is not supported by the current profile.

The server packages dsh-trevogi, dsh-montazh, dsh-reestr and dsh-podyom supply host tools and templates. Deploy them using their own READMEs and configure the registry, alert route and permissions. Their sources are not universal npm installers for a new OS.

### 3. Lay out the core

The master account must exist and **must not belong to autopilot-view**. The installer creates that dashboard-reader group and the public directories. The following example creates a root-protected package copy; its version directory must be new:

~~~sh
AP_PACKAGE=/opt/autopilot/packages/0.1.16
test ! -e "$AP_PACKAGE"
sudo install -d -m 0755 /opt/autopilot/packages
sudo cp -R "$REPO/packages/dsh-autopilot" "$AP_PACKAGE"
sudo chown -R root:root "$AP_PACKAGE"
sudo chmod -R go-w "$AP_PACKAGE"
sudo bash "$AP_PACKAGE/install.sh" --dry-run
sudo bash "$AP_PACKAGE/install.sh"
sudo bash "$AP_PACKAGE/install.sh" --check
~~~

Use a shell with set -e and pipefail for root blocks and stop on any failure. REPO retains the checkout path from step 1 even if you entered a DSH profile directory. A successful --check returns rc 0. The installer verifies the vendor archive and pinned checksums. It neither downloads upstream nor executes upstream ap.py. It creates sources/, releases/, current, the /opt/agent-skills/autopilot link, the public tree and a private dashboard-serving credential. It **does not enable services or bootstrap the catalogue**.

A copy installation can use DESTDIR: a new root-owned directory without group/other write access and with its own etc/passwd and etc/group. See [test/test_install.py](test/test_install.py). DESTDIR does not turn the entire server profile into a container installer.

### 4. Configure mail and notices

The postal directory is independent of current. [lib/post_layout.py](lib/post_layout.py), function entries(), defines its exact contents; this tree uses RUNTIME /opt/autopilot/post/0.1.10. The administrator deploys these root-owned files with the declared modes and points /usr/local/bin/autopilot-mail to that directory's bin/autopilot-mail.

Postal version 0.1.10 is separate from the AP package version. On a new host, the following block deploys the declared files and refuses an existing postal target/client. Services remain disabled:

~~~sh
WORK=/var/lib/dsh-autopilot-setup
sudo install -d -o root -g root -m 0700 "$WORK"
sudo python3 -B - "$AP_PACKAGE" <<'PY'
from pathlib import Path
import importlib.util, os, sys
package=Path(sys.argv[1])
target=Path('/opt/autopilot/post/0.1.10')
link=Path('/usr/local/bin/autopilot-mail')
assert not target.exists() and not target.is_symlink(), 'postal target already exists'
assert not os.path.lexists(link), 'mail client already installed'
spec=importlib.util.spec_from_file_location('post_layout',package/'lib/post_layout.py')
module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
entries=module.entries()
target.mkdir(parents=True,mode=0o755)
for name,(kind,mode,body) in entries.items():
    assert kind=='file' and not Path(name).is_absolute() and '..' not in Path(name).parts
    file=target/name;file.parent.mkdir(parents=True,exist_ok=True)
    file.write_bytes(body);file.chmod(mode);os.chown(file,0,0)
link.symlink_to(target/'bin/autopilot-mail')
PY
REL="$(realpath /opt/autopilot/current)"
sudo python3 -B "$AP_PACKAGE/lib/post_layout.py" \
  --preflight-ap "$REL" --post-candidate /opt/autopilot/post/0.1.10 \
  --post-target /opt/autopilot/post/0.1.10 | sudo tee "$WORK/post-layout.json" >/dev/null
sudo install -d -m 0700 "$WORK/units"
sudo cp /opt/autopilot/post/0.1.10/units/* "$WORK/units/"
sudo sed -i 's@/opt/autopilot/post/0.1.3/@/opt/autopilot/post/0.1.10/@g' \
  "$WORK/units/autopilot-copy.service" "$WORK/units/autopilot-mail-failed@.service"
~~~

Check **every ExecStart** in the copied units: mail uses post/0.1.10, while copy/failure templates retain post/0.1.3 for the existing sadik installation. On a new host, deploy the chosen compatible postal runtime and set its physical path in local unit copies. Do not create an empty 0.1.3 directory or treat it as installed. The package sources stay intact.

Prepare a TLS pair in a new private directory:

~~~sh
sudo python3 "$AP_PACKAGE/tools/prepare-mail-tls.py" --directory /var/tmp/autopilot-mail-tls-new
sudo install -d -o root -g root -m 0755 /etc/autopilot-mail
sudo install -d -o autopilot-post -g autopilot-post -m 0700 /var/lib/autopilot-mail
sudo install -o root -g root -m 0644 /var/tmp/autopilot-mail-tls-new/server.pem /etc/autopilot-mail/server.pem
sudo install -o autopilot-post -g autopilot-post -m 0600 /var/tmp/autopilot-mail-tls-new/server.key /var/lib/autopilot-mail/server.key
~~~

Install the certificate as /etc/autopilot-mail/server.pem (root:root 0644) and its private key as /var/lib/autopilot-mail/server.key (autopilot-post 0600). The preparation tool does not install them. The service and client must use the same certificate. Do not print private keys or put them in the repository.

Place retention.json and your own copy.json in /etc/autopilot-mail/, following the [retention.json](config/retention.json) and [copy.example.json](config/copy.example.json). Replace **all** sample bot_user_id values, chat_id, recipient lists and token_file paths. Receipt copies need the team's bot keys: root:autopilot-copy 0640 files inside a root:autopilot-copy 0750 directory. Configuration files are root:root 0644. The sample [config/dsh-trevogi-spul-acl.conf](config/dsh-trevogi-spul-acl.conf) lists host-specific paths and ACLs; do not copy unrelated accounts. On the prepared dsh-trevogi spool, grant wx on /var/spool/dsh-trevogi/tmp and /var/spool/dsh-trevogi/vhod to autopilot-post and each of the seven team accounts: setfacl -m u:<name>:wx <directory>. Configure separate access to alert results through dsh-trevogi; the required postal preflight is agent-alert --proverit-nastrojku under the postal service account.

For each participant, configure TG appDir, workspace, tokenFile, the allowed owner and autopilotMail. This is an example **module configuration object**, not a complete DSH profile:

~~~json
{
  "agentName": "master",
  "appDir": "/opt/master/app",
  "workspace": "/opt/master/workspace",
  "tokenFile": "/etc/dsh-telegram/master.token",
  "allowedUsers": [123456789],
  "ownerChatId": 123456789,
  "autopilotMail": {
    "noticeDir": "/opt/master/a2a/zakryto/master",
    "trafficChatId": -1001234567890,
    "publisherBotIds": [100000001,100000002,100000003,100000004,100000005,100000006,100000007],
    "names": ["master"]
  }
}
~~~

All IDs are fictional. Other participants need their own names, paths, bots and allowed recipients. noticeDir must match --directory in their autopilot-mail-notice@.service. The supplied template uses /opt/%i/a2a/zakryto/%i. For profile wiring and module configuration, see the [TG README](../dsh-telegram-multiagent/README.en.md).

Validate configuration before startup: lib/mail_retention.py:load_config and lib/mail_copies.py:load_config validate root-owned retention.json/copy.json without sending messages. Import these libraries from the prepared postal/pilot; do not run mail_service.py directly as a check:

~~~sh
sudo python3 -B - <<'PY'
from pathlib import Path
import sys
sys.path.insert(0,'/opt/autopilot/post/0.1.10/pilot')
from mail_retention import load_config as retention_config
from mail_copies import load_config as copy_config
retention_config(Path('/etc/autopilot-mail/retention.json'))
copy_config(Path('/etc/autopilot-mail/copy.json'))
print('MAIL_CONFIG_OK')
PY
~~~

The mail set is autopilot-mail.service (autopilot-post), autopilot-copy.service (autopilot-copy), autopilot-mail-failed@.service (autopilot-post), and autopilot-mail-notice@.service plus .timer (the seven team accounts). Use the locally adapted copies in $WORK/units/. Before startup, create each participant's noticeDir owned by that account with mode 0700. Install these five templates into /etc/systemd/system/, run systemd-analyze verify and daemon-reload. Then use systemctl enable --now for autopilot-mail.service, autopilot-copy.service and the seven autopilot-mail-notice@<name>.timer instances. Do not enable the failed template or notice service separately. Do not activate every template without a team list and configured bots. Ordinary mail and AP mail are separate channels; an ID-only notice does not itself prove task delivery.

### 5. Bootstrap the RUN catalogue under a fence

The first init needs a verified /var/lib/dsh-autopilot catalogue. An existing directory is not a bootstrap. Prepare and verify the operator services, then open a recorded dsh-montazh window. [window/katalog-okno.py](window/katalog-okno.py) handles a forward deployment: it owns a bounded fence over the two operator services, verifies idle/PID/cgroup evidence, accepts a census by an explicit criterion and calls bootstrap.

~~~sh
WORK=/var/lib/dsh-autopilot-setup
sudo python3 -B - "$AP_PACKAGE" <<'PY' | sudo tee "$WORK/package-rows.tsv" >/dev/null
from pathlib import Path
import hashlib,stat,sys
for file in sorted(Path(sys.argv[1]).rglob('*')):
    assert not file.is_symlink(), str(file)
    if not file.is_file(): continue
    info=file.stat()
    print(str(file),hashlib.sha256(file.read_bytes()).hexdigest(),
          info.st_uid,info.st_gid,format(stat.S_IMODE(info.st_mode),'o'),sep='\t')
PY
WINDOW_ID="$(sudo montazh-okno podgotovit --rows "$WORK/package-rows.tsv" \
  --task ap-first-bootstrap --actor root --ttl 1800)"
printf '%s\n' "$WINDOW_ID" | sudo tee "$WORK/window.id" >/dev/null
HOLDER="ap-bootstrap-$(date +%s).service"
FENCE="$WORK/fence.json"
sudo python3 -B "$AP_PACKAGE/window/katalog-okno.py" hod --kod "$AP_PACKAGE"
sudo python3 -B "$AP_PACKAGE/window/katalog-okno.py" ograda vkl \
  --kod "$AP_PACKAGE" --edinica "$HOLDER" --zapis "$FENCE" --predel 900
sudo python3 -B "$AP_PACKAGE/tools/ap-run-inventory.py" scan \
  | sudo tee "$WORK/census.json" >/dev/null
SHA="$(sudo sha256sum "$WORK/census.json" | awk '{print $1}')"
sudo python3 -B "$AP_PACKAGE/window/katalog-okno.py" bootstrap \
  --kod "$AP_PACKAGE" --edinica "$HOLDER" --zapis "$FENCE" \
  --census "$WORK/census.json" --sha "$SHA" --okno-fajl "$WORK/window.id"
sudo python3 -B "$AP_PACKAGE/window/katalog-okno.py" prava --kod "$AP_PACKAGE"
sudo python3 -B "$AP_PACKAGE/tools/ap-run-inventory.py" scan \
  | sudo tee "$WORK/census-after.json" >/dev/null
sudo python3 -B "$AP_PACKAGE/window/katalog-okno.py" sravnit \
  --kod "$AP_PACKAGE" --edinica "$HOLDER" --zapis "$FENCE" \
  --census "$WORK/census.json" --scan "$WORK/census-after.json"
sudo python3 -B "$AP_PACKAGE/window/katalog-okno.py" ograda vykl \
  --kod "$AP_PACKAGE" --edinica "$HOLDER" --zapis "$FENCE"
sudo montazh-okno zakryt "$WINDOW_ID"
~~~

The full census covers visible local filesystems. Initial deployment requires complete=true, no errors, no active RUN and no potentialProductionPin. The fenced order is: ograda vkl → scan and acceptance of its SHA → bootstrap with --census/--sha/--okno-fajl → prava → another scan and sravnit → release your own fence → close the window. The init probe runs after thawing, in step 7. Bootstrap requires at least 120 seconds remaining; the default holder limit is 900 seconds, configurable from 5 to 1800 seconds.

On any refusal, stop: do not retry bootstrap or edit census/receipts to make them pass. Release only your own fence using ograda vykl with the same HOLDER/FENCE; RuntimeMaxSec also bounds the freeze to 900 seconds. Do not close a failed window as successful. Run the first init probe in the next step after thawing.

--edinica, --zapis and --okno-fajl must refer to the **real** holder unit, fence receipt and deployment-window record on your host. Invented JSON does not replace them. Direct ap-run-inventory.py bootstrap requires the rollback window's fence; use the named helper for an initial forward deployment. The internal [window sheets](window/) contain our host's contracts and probes, not ready-to-use configuration for yours.

### 6. Set up statistics and the dashboard

Before enabling autopilot-usage.timer, create root-owned /var/lib/autopilot-usage/source-profile.json (schemaVersion=1). The base directory and registrations must remain traversable for postal pruning: root 0755, profile/index/time-state root 0600, ACK root 0644. Do not make the whole directory 0700. The profile contains participants, their uid/gid and engine, projectRoots and mailDatabase. For Codex, home points to the gateway's **CODEX_HOME**, which contains dsh-usage-hodov.jsonl. For Claude, runtimeSource.raw points to usage-runtime-v1.jsonl, next to the TG-written ap-usage-hodov-v1.jsonl. The configured UID must match the actual end-file owner.

This example uses **the paths chosen by this guide** and obtains UID/GID from the target host. Before running it, ensure that the six Codex gateways really use those CODEX_HOME paths and Sova uses /opt/sova/workspace. Otherwise change the profile, not the collector. If index.json is absent, the collector creates the canonical empty index and index-origin under its lock; do not supply an arbitrary index without its origin.

~~~sh
sudo install -d -o master -g "$(id -gn master)" -m 0750 /srv/autopilot/projects
sudo install -d -o root -g root -m 0755 /var/lib/autopilot-usage
sudo python3 -B - <<'PY'
from pathlib import Path
import json,os,pwd
base=Path('/var/lib/autopilot-usage')
profile=base/'source-profile.json'
assert not profile.exists(), 'profile already exists: inspect, do not overwrite'
people=[]
for name in ('master','vintik','shpuntik','gayka','shurup','tumbler','sova'):
    account=pwd.getpwnam(name)
    person=dict(name=name,uid=account.pw_uid,gid=account.pw_gid,
                engine='claude' if name=='sova' else 'codex',
                home='/var/lib/coder-gateway-'+name+'/codex-home')
    if name=='sova':
        person['home']=account.pw_dir
        person['runtimeSource']={'raw':'/opt/sova/workspace/.message-receipts/usage-runtime-v1.jsonl'}
    people.append(person)
value=dict(schemaVersion=1,mailDatabase='/var/lib/autopilot-mail/mail.sqlite',
           projectRoots=['/srv/autopilot/projects'],participants=people)
profile.write_text(json.dumps(value,indent=2)+'\n');profile.chmod(0o600);os.chown(profile,0,0)
PY
~~~

The main RUN input is the postal SQLite usage_registrations queue, opened only with mode=ro. The collector is the sole writer of its index and JSON state. Do not enable the old drain/prepare path alongside it. Direct init-state/catalogue discovery is not the collector's input in current 0.1.16. See the opening section of [ONLINE-USAGE.md](ONLINE-USAGE.md) for the current contract. Older schemas remain below that section and must not be mixed with state v3/receipt v5.

Once mail is running and verified, install the collector from the same package. Its caller is autopilot-usage.timer: a root service every 60 seconds with TimeoutStartSec=70. An existing installation first needs a coordinated stop of the old collector.

~~~sh
sudo install -o root -g root -m 0644 "$AP_PACKAGE/systemd/autopilot-usage.service" /etc/systemd/system/
sudo install -o root -g root -m 0644 "$AP_PACKAGE/systemd/autopilot-usage.timer" /etc/systemd/system/
sudo systemd-analyze verify /etc/systemd/system/autopilot-usage.service /etc/systemd/system/autopilot-usage.timer
sudo systemctl daemon-reload
sudo systemctl enable --now autopilot-usage.timer
sudo systemctl list-timers autopilot-usage.timer
~~~

The dashboard server is in [razdacha/](razdacha/). Adapt its listen address, allowed proxy address, port and external TLS/auth to your host; the 192.168.99.* values in the template belong to sadik. The reader uses autopilot-view and obtains its key through LoadCredential. Serve only the public projection, never private .autopilot or key files. Dashboard serving and usage collection are separate services.

The unit template is [razdacha/dsh-autopilot-razdacha.service](razdacha/dsh-autopilot-razdacha.service), with [razdacha/razdacha.py](razdacha/razdacha.py). Install the program root:root 0755 at its ExecStart path (/usr/local/libexec/dsh-autopilot/razdacha.py) and the unit root:root 0644 in /etc/systemd/system/. Adapt ExecStart (--adres, --vpusk, --port) and IPAddressAllow together, keeping LoadCredential and the access restrictions. After systemd-analyze verify and daemon-reload, use enable --now for dsh-autopilot-razdacha.service. On an allowed local address, GET /__zhivoj must return 200 zhiv; this checks the reader service, not the external proxy. The dashboard URL relative to the configured HTTPS proxy is /master/<slug>/<run_id>/dashboard.html; obtain values from /srv/autopilot/public/master/index.json. The proxy must supply X-AP-Klyuch from a private file and enforce its own authentication. The package does not ship a portable nginx/TLS configuration; the external dashboard is not active until that is prepared.

### 7. Verify with a project

As master, from an authorized physical Git project, register the skill in the instruction mechanism of the engine you use. With an external engine, a skill present only in DSH does not establish that the engine can see it.

Before the commands below, the administrator creates a new project directory; this example requires example not to exist yet:

~~~sh
test ! -e /srv/autopilot/projects/example
sudo install -d -o master -g "$(id -gn master)" -m 0750 /srv/autopilot/projects/example
~~~

~~~sh
sudo -iu master
cd /srv/autopilot/projects/example
git init
# Set your Git user.name and user.email before the first working commit.
export AUTOPILOT_OPERATOR_PID=$$
REL="$(realpath /opt/autopilot/current)"
python3 -B "$REL/skill/tools/ap.py" --no-serve init --slug example --skill-dir "$REL/skill"
~~~

Root is not the operator. Subsequent commands use the skill_dir recorded in this RUN's private state; do not replace it with a newer current or remove operator.lock.

First, from the master shell, check the transport independently of domain tasks:

~~~sh
/usr/local/bin/autopilot-mail status
/usr/local/bin/autopilot-mail inbox
printf '%s\n' 'AP transport setup probe; no domain task' \
  | /usr/local/bin/autopilot-mail send vintik --request /opt/master/ap-mail-probe.json --subject AP-setup-probe
~~~

Recipient vintik should receive a notice and fetch the original with its own autopilot-mail inbox/read; sending prints the ID. This is a transport probe, not a model assignment. For a real learning task, Master first records requirement R1 and approved ticket HELLO-1 in the project plan, establishes executor authority and verifies the initial Git HEAD. The owner's request to create docs/hello.md containing Hello is input for preparing the assignment, not a direct CLI command. Then, as master in this project, prepare the form below; its deadline is 900 seconds ahead, so do not send a stale form. These are example values for a new authorized job, not a bypass of skill phases.

Before submit, Master commits the initial Git HEAD and approved plan. For the separate vintik account, the administrator grants the working zone and read access to control objects. Do not grant write access to .git, .autopilot or instructions. This simple project uses AGENTS.md; if the plan added nested instructions or another memory path, grant read access to those too.

~~~sh
# In a separate administrator shell, after Master initialized and prepared the project:
PROJECT=/srv/autopilot/projects/example
sudo install -d -o master -g "$(id -gn master)" -m 0750 "$PROJECT/docs"
sudo install -d -o master -g "$(id -gn master)" -m 0711 "$PROJECT/receiver-state"
sudo install -d -o vintik -g "$(id -gn vintik)" -m 0700 "$PROJECT/receiver-state/vintik"
sudo setfacl -m u:vintik:--x /srv/autopilot/projects "$PROJECT/.autopilot"
sudo setfacl -m u:vintik:r-x "$PROJECT"
sudo setfacl -R -m u:vintik:rX "$PROJECT/.git"
sudo setfacl -m u:vintik:rwx "$PROJECT/docs"
for file in AGENTS.md CLAUDE.md .autopilot/PROGRESS.md; do
  if sudo test -f "$PROJECT/$file"; then
    sudo setfacl -m u:vintik:r-- "$PROJECT/$file"
  fi
done
~~~

As vintik, check git rev-parse using safe.directory for this project (see README-PILOT), control-file reading, and creating/removing a probe file only in docs. Its RECEIVER_STATE is /srv/autopilot/projects/example/receiver-state/vintik/state.json; do not expose Master's private state.js. Return to the master shell at the project root before the next commands. Prepare the reviewer's own authorized zone and state separately in the same way.

~~~sh
umask 077
git rev-parse --verify HEAD
PROJECT=/srv/autopilot/projects/example
export PROJECT
python3 -B - <<'PY'
from pathlib import Path
import json,os,time
project=Path(os.environ['PROJECT'])
raw=(project/'.autopilot/state.js').read_text()
prefix,sep,body=raw.partition('=')
assert sep and prefix.strip()=='window.STATE'
meta=json.loads(body.strip().rstrip(';'))['_sadik']
assert meta['root']==str(project.resolve())
binding=dict(run=meta['run_id'],release=str(Path(meta['release']['skill_dir']).parent))
(project/'first-binding.json').write_text(json.dumps(binding)+'\n')
task=dict(job_id='hello-1',ticket='HELLO-1',recipient='vintik',role='executor',
          cwd=str(project),zone=['docs/hello.md'],requirements=['R1'],
          brief='Create docs/hello.md containing Hello. Stay inside the assigned project and zone.',
          deadline=int(time.time())+900,context_request='fresh',parent_job_id=None,context_ref=None)
(project/'job.json').write_text(json.dumps(task)+'\n')
PY
RUN="$(python3 -c 'import json; print(json.load(open("first-binding.json"))["run"])')"
REL="$(python3 -c 'import json; print(json.load(open("first-binding.json"))["release"])')"
PYTHONPATH=/opt/autopilot/post/0.1.10/pilot PYTHONNOUSERSITE=1 \
  python3 -s -B "$REL/pilot/pilot_mail.py" \
  --state "$PROJECT/.autopilot/pilot/master.json" --project "$PROJECT" \
  --run "$RUN" --memory AGENTS.md submit < "$PROJECT/job.json"
~~~

lib/pilot_mail.py validates this form. README-PILOT.md contains RU and EN sections; its EN section explains the shared shell commands. PLACED records transport submission, not execution. Assign an independent reviewer a separate appropriate job after the result; Master handles acceptance and project events.

Verify one catalogue RUN, private state.js and dashboard.html, the public projection, authenticated task receipt by the recipient, an independent result/review and the first accounting tick. A repeated tick with no new end bytes must not reread them or double the total. Queued, ACKed, received, executed and accepted are distinct stages.

After the first registered RUN, wait for a timer tick and inspect journalctl -u autopilot-usage.service, root-owned /var/lib/autopilot-usage/time-state.json and the ≈ card in public state. The first tick should see all seven source-profile participants; a repeat without new end rows should read 0 new bytes and keep the total. This verifies accounting data, not task execution or acceptance.

## Limits and updates

- Statistics are approximate: RUN time can overlap other work; completion, loss and source rotation limit coverage. Provider pricing, historical subscriptions and complete SDK-child cost are not proven. Unknown is null, not zero.
- In 0.1.16, the completion grace is 600 seconds. Bounded history/cursors are retained before a RUN's result freezes. History capacity is finite. Old closed receipts are not recomputed into the new ≈ totals.
- This is a separate-account profile with a fixed team, not an isolation mechanism for running untrusted code in one shared account. Task text does not expand executor authority.
- Public projection filtering does not replace the administrator's secret/access controls. Publish only the public tree.
- Coordinate AP, mail, TG-writer and active-RUN updates. Switching current neither migrates a RUN nor makes an old reader compatible with new state.
- Dated release descriptions and measurements are in [HISTORY.md](HISTORY.md) / [HISTORY.en.md](HISTORY.en.md). Operational contracts are in [README-CORE.md](README-CORE.md), [README-PILOT.md](README-PILOT.md) and [FORMAT-CONTRACT.md](FORMAT-CONTRACT.md). Their stated dates and measurement scope matter.

Upstream is pinned to 9fc898cbe941d5b8a369f1dd657e9119676eb44f; the local AP version 0.1.16 is separate. Before updating, compare upstream, local patches/overlay, postal compatibility and existing RUN data. The source archive and licences are included in this checkout.
