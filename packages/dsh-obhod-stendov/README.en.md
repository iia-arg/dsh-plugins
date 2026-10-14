Russian version: [README.md](README.md) · English below

# dsh-obhod-stendov — nightly and weekly run of the live test stands on sadik

**Version:** 3.1.51

Service software of sadik: a timer-driven run of test stands (nightly at 03:40 UTC and weekly on Wednesdays at 01:30 UTC), the runner
`vse-stendy-boevye.sh` with the stand lists, the stands themselves and their data. The outcome of the run is read by `chitatel-obhoda`
(package **dsh-storozha-sadik**).

The package is **not for publication without separate gates:** the lists and the runner carry the internal layout of the machine (paths, units, agent
names, stand exceptions, the ways live items are checked).

**Temporary rule (Veniamin, 07.10.2026):** until new packages have a "live ↔ tag" reader, any file of the package
changes only together with a new package number in the same window.

⚠️ The live timer runs code from the agent's working directory (`/opt/iskra/workspace/dorabotki`). Moving it into the tree does not
change that; moving it to `/usr/local` is a separate decision.

The package is sources without `package.json`: `dorabotki/` mirrors the path `/opt/iskra/workspace/dorabotki/` (owner
`iskra:iskra`), units and drop-ins are in `systemd/` (under `/etc/systemd/system/`). The number is the CHANGELOG heading and the tag
`dsh-obhod-stendov-v<номер>`. Moved from live: the checksum of every file in the tree equals the checksum in live.

## Contents — by calls (taken 07.10.2026)

Method: for every file, the lines of the core (run scripts, lists, runner, stands) where the file name appears NOT in a
comment; a stand is in the package only if the run calls it, or a stand called by the run calls it. The runner does not enumerate the
`stendy/` directory — only the lists. Of 54 disputed files in the root of `dorabotki`, 3 are taken — data and a helper read by
`stend-kanarejki-shlyuza.sh`: `edinstvennye-sushchnosti-shlyuza.json`, `zayavlennye-proverki-kanarejki-shlyuza.json`,
`sreda-yunita.py`; the other 51 are not in the package (below).

## Files

git stores only the "executable" bit, so the mode and owner on disk are in the table (taken with `stat` of live, 07.10.2026).

| file in the package | path on disk | called by | mode | owner:group |
|---|---|---|---|---|
| `libexec/stend-varvara-fs-deny.mjs` (since 3.1.15) | `/usr/local/libexec/stend-varvara-fs-deny.mjs` | nightly runner, `@varvara /opt/varvara/app`; 15 s, caller 30 s | 644 | root:root |
| `dorabotki/omega-b-p-060/stend-b-p-060.sh` | `/opt/iskra/workspace/dorabotki/omega-b-p-060/stend-b-p-060.sh` | nightly run (perechen-boevyh-stendov.txt); runner vse-stendy-boevye.sh | 755 | iskra:iskra |
| `dorabotki/omega-b-p-060/stend-b-p-060.py` | `/opt/iskra/workspace/dorabotki/omega-b-p-060/stend-b-p-060.py` | stand stend-b-p-060.sh (run by the OMEGA python `/opt/omega/venv/bin/python3 -B`) | 755 | iskra:iskra |
| `dorabotki/perechen-boevyh-stendov.txt` | `/opt/iskra/workspace/dorabotki/perechen-boevyh-stendov.txt` | runner vse-stendy-boevye.sh | 644 | iskra:iskra |
| `dorabotki/perechen-nedelnyh-stendov.txt` | `/opt/iskra/workspace/dorabotki/perechen-nedelnyh-stendov.txt` | vse-stendy-nedelnye.sh | 644 | iskra:iskra |
| `dorabotki/stend-373-svodki-vne-vydachi.mjs` | `/opt/iskra/workspace/dorabotki/stend-373-svodki-vne-vydachi.mjs` | nightly run (perechen-boevyh-stendov.txt); runner vse-stendy-boevye.sh | 644 | iskra:iskra |
| `dorabotki/stend-agent-limits.sh` | `/opt/iskra/workspace/dorabotki/stend-agent-limits.sh` | nightly run (perechen-boevyh-stendov.txt); runner vse-stendy-boevye.sh | 755 | iskra:iskra |
| `dorabotki/stend-apt-notify.sh` | `/opt/iskra/workspace/dorabotki/stend-apt-notify.sh` | nightly run (perechen-boevyh-stendov.txt); runner vse-stendy-boevye.sh | 755 | iskra:iskra |
| `dorabotki/stend-B14-snimok.sh` | `/opt/iskra/workspace/dorabotki/stend-B14-snimok.sh` | nightly run (perechen-boevyh-stendov.txt); runner vse-stendy-boevye.sh | 755 | iskra:iskra |
| `dorabotki/stend-atsiklichnosti.sh` | `/opt/iskra/workspace/dorabotki/stend-atsiklichnosti.sh` | nightly run (perechen-boevyh-stendov.txt); runner vse-stendy-boevye.sh (@root) | 755 | iskra:iskra |
| `dorabotki/stend-cepi-pamyati.mjs` | `/opt/iskra/workspace/dorabotki/stend-cepi-pamyati.mjs` | nightly run (perechen-boevyh-stendov.txt); runner vse-stendy-boevye.sh | 644 | iskra:iskra |
| `dorabotki/stend-compaction-zaveden.mjs` | `/opt/iskra/workspace/dorabotki/stend-compaction-zaveden.mjs` | nightly run (perechen-boevyh-stendov.txt); runner vse-stendy-boevye.sh | 644 | iskra:iskra |
| `dorabotki/stend-izmeritelya.sh` | `/opt/iskra/workspace/dorabotki/stend-izmeritelya.sh` | nightly run (perechen-boevyh-stendov.txt); runner vse-stendy-boevye.sh | 755 | iskra:iskra |
| `dorabotki/stend-kanarejki-shlyuza.sh` | `/opt/iskra/workspace/dorabotki/stend-kanarejki-shlyuza.sh` | nightly run (perechen-boevyh-stendov.txt); runner vse-stendy-boevye.sh | 755 | iskra:iskra |
| `dorabotki/stend-kurera.sh` | `/opt/iskra/workspace/dorabotki/stend-kurera.sh` | nightly run (perechen-boevyh-stendov.txt); runner vse-stendy-boevye.sh | 755 | iskra:iskra |
| `dorabotki/stend-needrestart.sh` | `/opt/iskra/workspace/dorabotki/stend-needrestart.sh` | weekly run (perechen-nedelnyh-stendov.txt); vse-stendy-nedelnye.sh with the key `--zhivaya-mashina` | 755 | iskra:iskra |
| `dorabotki/stend-obyavlenij-profilej.sh` | `/opt/iskra/workspace/dorabotki/stend-obyavlenij-profilej.sh` | nightly run (perechen-boevyh-stendov.txt); runner vse-stendy-boevye.sh | 755 | iskra:iskra |
| `dorabotki/stend-ohvat-i-sverka.mjs` | `/opt/iskra/workspace/dorabotki/stend-ohvat-i-sverka.mjs` | nightly run (perechen-boevyh-stendov.txt); runner vse-stendy-boevye.sh | 644 | iskra:iskra |
| `dorabotki/stend-otmetki-priyomki.sh` | `/opt/iskra/workspace/dorabotki/stend-otmetki-priyomki.sh` | nightly run (perechen-boevyh-stendov.txt); runner vse-stendy-boevye.sh | 755 | iskra:iskra |
| `dorabotki/stend-pochtalona.sh` | `/opt/iskra/workspace/dorabotki/stend-pochtalona.sh` | nightly run (perechen-boevyh-stendov.txt); runner vse-stendy-boevye.sh | 755 | iskra:iskra |
| `dorabotki/stend-pokrytiya.sh` | `/opt/iskra/workspace/dorabotki/stend-pokrytiya.sh` | nightly run (perechen-boevyh-stendov.txt); runner vse-stendy-boevye.sh | 755 | iskra:iskra |
| `dorabotki/stend-poteri-pisem.mjs` | `/opt/iskra/workspace/dorabotki/stend-poteri-pisem.mjs` | nightly run (perechen-boevyh-stendov.txt); runner vse-stendy-boevye.sh | 644 | iskra:iskra |
| `dorabotki/stend-hranilishcha-sekretov.sh` | `/opt/iskra/workspace/dorabotki/stend-hranilishcha-sekretov.sh` | nightly run (perechen-boevyh-stendov.txt); runner vse-stendy-boevye.sh | 755 | iskra:iskra |
| `dorabotki/stend-vozrast-pisma.mjs` | `/opt/iskra/workspace/dorabotki/stend-vozrast-pisma.mjs` | nightly run (perechen-boevyh-stendov.txt) — exception ОЖИДАЕМО ("expected"); runner vse-stendy-boevye.sh | 644 | iskra:iskra |
| `dorabotki/stend-pravki-reestra.sh` | `/opt/iskra/workspace/dorabotki/stend-pravki-reestra.sh` | nightly run (perechen-boevyh-stendov.txt); runner vse-stendy-boevye.sh | 755 | iskra:iskra |
| `dorabotki/stend-priyomki-kopii.sh` | `/opt/iskra/workspace/dorabotki/stend-priyomki-kopii.sh` | nightly run (perechen-boevyh-stendov.txt); runner vse-stendy-boevye.sh | 755 | iskra:iskra |
| `dorabotki/stend-priyomki-po-raspisaniyu.sh` | `/opt/iskra/workspace/dorabotki/stend-priyomki-po-raspisaniyu.sh` | nightly run (perechen-boevyh-stendov.txt); runner vse-stendy-boevye.sh | 755 | iskra:iskra |
| `dorabotki/stend-priznaka-oblasti.sh` | `/opt/iskra/workspace/dorabotki/stend-priznaka-oblasti.sh` | nightly run (perechen-boevyh-stendov.txt); runner vse-stendy-boevye.sh | 755 | iskra:iskra |
| `dorabotki/stend-proverki-opory.mjs` | `/opt/iskra/workspace/dorabotki/stend-proverki-opory.mjs` | nightly run (perechen-boevyh-stendov.txt); runner vse-stendy-boevye.sh | 755 | iskra:iskra |
| `dorabotki/stend-razmer-kopii-watch.sh` | `/opt/iskra/workspace/dorabotki/stend-razmer-kopii-watch.sh` | nightly run (perechen-boevyh-stendov.txt); runner vse-stendy-boevye.sh | 755 | iskra:iskra |
| `dorabotki/stend-reestra-agentov.sh` | `/opt/iskra/workspace/dorabotki/stend-reestra-agentov.sh` | nightly run (perechen-boevyh-stendov.txt); runner vse-stendy-boevye.sh | 755 | iskra:iskra |
| `dorabotki/stend-registry-json.sh` | `/opt/iskra/workspace/dorabotki/stend-registry-json.sh` | nightly run (perechen-boevyh-stendov.txt); runner vse-stendy-boevye.sh | 755 | iskra:iskra |
| `dorabotki/stend-sekretov-na-mestah.sh` | `/opt/iskra/workspace/dorabotki/stend-sekretov-na-mestah.sh` | nightly run (perechen-boevyh-stendov.txt); runner vse-stendy-boevye.sh | 755 | iskra:iskra |
| `dorabotki/stend-skill-links.sh` | `/opt/iskra/workspace/dorabotki/stend-skill-links.sh` | nightly run (perechen-boevyh-stendov.txt); runner vse-stendy-boevye.sh | 755 | iskra:iskra |
| `dorabotki/stend-snyatie-ogranichitelej.mjs` | `/opt/iskra/workspace/dorabotki/stend-snyatie-ogranichitelej.mjs` | nightly run (perechen-boevyh-stendov.txt); runner vse-stendy-boevye.sh | 644 | iskra:iskra |
| `dorabotki/stend-soglasie-sloev.sh` | `/opt/iskra/workspace/dorabotki/stend-soglasie-sloev.sh` | nightly run (perechen-boevyh-stendov.txt); runner vse-stendy-boevye.sh | 755 | iskra:iskra |
| `dorabotki/stend-stop-pobudok.mjs` | `/opt/iskra/workspace/dorabotki/stend-stop-pobudok.mjs` | nightly run (perechen-boevyh-stendov.txt); runner vse-stendy-boevye.sh | 644 | iskra:iskra |
| `dorabotki/stend-storozha-reestrov.sh` | `/opt/iskra/workspace/dorabotki/stend-storozha-reestrov.sh` | weekly run (perechen-nedelnyh-stendov.txt); vse-stendy-nedelnye.sh | 755 | iskra:iskra |
| `dorabotki/stend-svershchika.sh` | `/opt/iskra/workspace/dorabotki/stend-svershchika.sh` | nightly run (perechen-boevyh-stendov.txt); runner vse-stendy-boevye.sh | 755 | iskra:iskra |
| `dorabotki/stend-svyazok-podpisok.sh` | `/opt/iskra/workspace/dorabotki/stend-svyazok-podpisok.sh` | nightly run (perechen-boevyh-stendov.txt); runner vse-stendy-boevye.sh | 755 | iskra:iskra |
| `dorabotki/stend-U0-istochnik.mjs` | `/opt/iskra/workspace/dorabotki/stend-U0-istochnik.mjs` | nightly run (perechen-boevyh-stendov.txt); runner vse-stendy-boevye.sh | 644 | iskra:iskra |
| `dorabotki/stend-uborki-pisma.mjs` | `/opt/iskra/workspace/dorabotki/stend-uborki-pisma.mjs` | nightly run (perechen-boevyh-stendov.txt); runner vse-stendy-boevye.sh | 644 | iskra:iskra |
| `dorabotki/stend-verdiktov-istochniki.mjs` | `/opt/iskra/workspace/dorabotki/stend-verdiktov-istochniki.mjs` | nightly run (perechen-boevyh-stendov.txt); runner vse-stendy-boevye.sh | 644 | iskra:iskra |
| `dorabotki/stend-vidimosti-a2a.sh` | `/opt/iskra/workspace/dorabotki/stend-vidimosti-a2a.sh` | nightly run (perechen-boevyh-stendov.txt); runner vse-stendy-boevye.sh | 755 | iskra:iskra |
| `dorabotki/stend-vtoroj-vhod-svodki.mjs` | `/opt/iskra/workspace/dorabotki/stend-vtoroj-vhod-svodki.mjs` | nightly run (perechen-boevyh-stendov.txt); runner vse-stendy-boevye.sh | 644 | iskra:iskra |
| `dorabotki/stend-vzaimnogo-nabludeniya.sh` | `/opt/iskra/workspace/dorabotki/stend-vzaimnogo-nabludeniya.sh` | weekly run (perechen-nedelnyh-stendov.txt); vse-stendy-nedelnye.sh with the key `--zhivaya-mashina` | 755 | iskra:iskra |
| `dorabotki/stendy/clw-sluchai.sh` | `/opt/iskra/workspace/dorabotki/stendy/clw-sluchai.sh` | stand stend-codex-limit-watch.sh | 755 | iskra:iskra |
| `dorabotki/stendy/fake-codex.py` | `/opt/iskra/workspace/dorabotki/stendy/fake-codex.py` | stand clw-sluchai.sh | 755 | iskra:iskra |
| `dorabotki/stendy/mail-stop-hold-napominaniya.mjs` | `/opt/iskra/workspace/dorabotki/stendy/mail-stop-hold-napominaniya.mjs` | stand stend-mail-stop-hold.sh | 644 | iskra:iskra |
| `dorabotki/stendy/mail-stop-hold-podgotovit.mjs` | `/opt/iskra/workspace/dorabotki/stendy/mail-stop-hold-podgotovit.mjs` | stand stend-mail-stop-hold.sh | 644 | iskra:iskra |
| `dorabotki/stendy/mail-stop-hold-proverit.mjs` | `/opt/iskra/workspace/dorabotki/stendy/mail-stop-hold-proverit.mjs` | stand stend-mail-stop-hold.sh | 644 | iskra:iskra |
| `dorabotki/stendy/mail-stop-hold-tg.mjs` | `/opt/iskra/workspace/dorabotki/stendy/mail-stop-hold-tg.mjs` | stand mail-stop-hold-napominaniya.mjs | 644 | iskra:iskra |
| `dorabotki/stendy/pk-sluchai.sh` | `/opt/iskra/workspace/dorabotki/stendy/pk-sluchai.sh` | stand stend-pereklyuchatelya-codex.sh | 755 | iskra:iskra |
| `dorabotki/stendy/poll-fixture.mjs` | `/opt/iskra/workspace/dorabotki/stendy/poll-fixture.mjs` | stand stend-a2a-owner-copy-watch.sh | 644 | iskra:iskra |
| `dorabotki/stendy/priyomnik-imeni-v2.mjs` | `/opt/iskra/workspace/dorabotki/stendy/priyomnik-imeni-v2.mjs` | stand stend-imeni-v2.sh | 644 | iskra:iskra |
| `dorabotki/stendy/proba-kopij.sh` | `/opt/iskra/workspace/dorabotki/stendy/proba-kopij.sh` | stand stend-mest-kopij.sh | 755 | iskra:iskra |
| `dorabotki/stendy/proba-prav-domov.sh` | `/opt/iskra/workspace/dorabotki/stendy/proba-prav-domov.sh` | stand stend-prav-domov.sh | 755 | iskra:iskra |
| `dorabotki/stendy/smv-atomic-probe.py` | `/opt/iskra/workspace/dorabotki/stendy/smv-atomic-probe.py` | stand stend-smontirovat-vypusk-rezhimy.sh | 644 | iskra:iskra |
| `dorabotki/stendy/stend-a2a-owner-copy-watch.sh` | `/opt/iskra/workspace/dorabotki/stendy/stend-a2a-owner-copy-watch.sh` | nightly run (perechen-boevyh-stendov.txt); runner vse-stendy-boevye.sh | 755 | iskra:iskra |
| `dorabotki/stendy/stend-aclaude-snaruzhi.sh` | `/opt/iskra/workspace/dorabotki/stendy/stend-aclaude-snaruzhi.sh` | nightly run (perechen-boevyh-stendov.txt); runner vse-stendy-boevye.sh | 644 | iskra:iskra |
| `dorabotki/stendy/stend-chitatelya-obhoda.py` | `/opt/iskra/workspace/dorabotki/stendy/stend-chitatelya-obhoda.py` | nightly run (perechen-boevyh-stendov.txt); runner vse-stendy-boevye.sh | 644 | iskra:iskra |
| `dorabotki/stendy/stend-codex-limit-watch.etalon` | `/opt/iskra/workspace/dorabotki/stendy/stend-codex-limit-watch.etalon` | stand stend-codex-limit-watch.sh | 644 | iskra:iskra |
| `dorabotki/stendy/stend-codex-limit-watch.sh` | `/opt/iskra/workspace/dorabotki/stendy/stend-codex-limit-watch.sh` | nightly run (perechen-boevyh-stendov.txt); runner vse-stendy-boevye.sh | 755 | iskra:iskra |
| `dorabotki/stendy/stend-compact-watch.sh` | `/opt/iskra/workspace/dorabotki/stendy/stend-compact-watch.sh` | nightly run (perechen-boevyh-stendov.txt); runner vse-stendy-boevye.sh | 755 | iskra:iskra |
| `dorabotki/stendy/stend-doli-preseta.sh` | `/opt/iskra/workspace/dorabotki/stendy/stend-doli-preseta.sh` | nightly run (perechen-boevyh-stendov.txt); runner vse-stendy-boevye.sh | 755 | iskra:iskra |
| `dorabotki/stendy/stend-dogovora-trevogi.sh` | `/opt/iskra/workspace/dorabotki/stendy/stend-dogovora-trevogi.sh` | nightly run (perechen-boevyh-stendov.txt); runner vse-stendy-boevye.sh | 755 | iskra:iskra |
| `dorabotki/stendy/stend-hvostov.sh` | `/opt/iskra/workspace/dorabotki/stendy/stend-hvostov.sh` | nightly run (perechen-boevyh-stendov.txt); runner vse-stendy-boevye.sh | 755 | iskra:iskra |
| `dorabotki/stendy/stend-imeni-v2.sh` | `/opt/iskra/workspace/dorabotki/stendy/stend-imeni-v2.sh` | nightly run (perechen-boevyh-stendov.txt); runner vse-stendy-boevye.sh | 755 | iskra:iskra |
| `dorabotki/stendy/stend-isklyuchenij-obhodchika.sh` | `/opt/iskra/workspace/dorabotki/stendy/stend-isklyuchenij-obhodchika.sh` | nightly run (perechen-boevyh-stendov.txt); runner vse-stendy-boevye.sh | 755 | iskra:iskra |
| `dorabotki/stendy/stend-osnovy-versii.py` | `/opt/iskra/workspace/dorabotki/stendy/stend-osnovy-versii.py` | nightly run; po_osnove: its own bare/suffix base passes, a foreign one is refused; without arguments it checks the neighbouring vse-stendy-boevye.sh | 644 | iskra:iskra |
| `dorabotki/stendy/stend-mashinnoj-redakcii.py` | `/opt/iskra/workspace/dorabotki/stendy/stend-mashinnoj-redakcii.py` | nightly run; systemd units of three packages, tree↔live, by working lines minus the data of /etc/agent-registry/ozhidaemye-razlichiya.yaml; does not see live drop-ins outside the tree | 644 | iskra:iskra |
| `dorabotki/stendy/stend-limity-pereklyuchatelya.py` | `/opt/iskra/workspace/dorabotki/stendy/stend-limity-pereklyuchatelya.py` | nightly run (perechen-boevyh-stendov.txt); runner vse-stendy-boevye.sh | 644 | iskra:iskra |
| `dorabotki/stendy/stend-mail-stop-hold.sh` | `/opt/iskra/workspace/dorabotki/stendy/stend-mail-stop-hold.sh` | nightly run (perechen-boevyh-stendov.txt); runner vse-stendy-boevye.sh | 755 | iskra:iskra |
| `dorabotki/stendy/stend-mcp-spiska-dvizhkom.mjs` | `/opt/iskra/workspace/dorabotki/stendy/stend-mcp-spiska-dvizhkom.mjs` | nightly run (perechen-boevyh-stendov.txt); runner vse-stendy-boevye.sh | 644 | iskra:iskra |
| `dorabotki/stendy/stend-mest-kopij.sh` | `/opt/iskra/workspace/dorabotki/stendy/stend-mest-kopij.sh` | nightly run (perechen-boevyh-stendov.txt); runner vse-stendy-boevye.sh | 755 | iskra:iskra |
| `dorabotki/stendy/stend-mihalycha.sh` | `/opt/iskra/workspace/dorabotki/stendy/stend-mihalycha.sh` | nightly run (perechen-boevyh-stendov.txt); runner vse-stendy-boevye.sh | 755 | iskra:iskra |
| `dorabotki/stendy/stend-modeli-omega.sh` | `/opt/iskra/workspace/dorabotki/stendy/stend-modeli-omega.sh` | nightly run (perechen-boevyh-stendov.txt); runner vse-stendy-boevye.sh | 755 | iskra:iskra |
| `dorabotki/stendy/stend-model-podmena.sh` | `/opt/iskra/workspace/dorabotki/stendy/stend-model-podmena.sh` | nightly run (perechen-boevyh-stendov.txt); runner vse-stendy-boevye.sh | 755 | iskra:iskra |
| `dorabotki/stendy/stend-montazha.sh` | `/opt/iskra/workspace/dorabotki/stendy/stend-montazha.sh` | nightly run (perechen-boevyh-stendov.txt); runner vse-stendy-boevye.sh | 755 | iskra:iskra |
| `dorabotki/stendy/stend-nemoty-posle-szhatiya.py` | `/opt/iskra/workspace/dorabotki/stendy/stend-nemoty-posle-szhatiya.py` | nightly run (perechen-boevyh-stendov.txt); runner vse-stendy-boevye.sh | 755 | iskra:iskra |
| `dorabotki/stendy/stend-oblasti-fajlom.sh` | `/opt/iskra/workspace/dorabotki/stendy/stend-oblasti-fajlom.sh` | nightly run (perechen-boevyh-stendov.txt); runner vse-stendy-boevye.sh | 755 | iskra:iskra |
| `dorabotki/stendy/stend-obnovitel-prava.py` | `/opt/iskra/workspace/dorabotki/stendy/stend-obnovitel-prava.py` | stand stend-obnovitel-prava.sh | 644 | iskra:iskra |
| `dorabotki/stendy/stend-obnovitel-prava.sh` | `/opt/iskra/workspace/dorabotki/stendy/stend-obnovitel-prava.sh` | nightly run (perechen-boevyh-stendov.txt); runner vse-stendy-boevye.sh | 755 | iskra:iskra |
| `dorabotki/stendy/stend-obsluzhivaniya-store-pin.sh` | `/opt/iskra/workspace/dorabotki/stendy/stend-obsluzhivaniya-store-pin.sh` | nightly run (perechen-boevyh-stendov.txt); runner vse-stendy-boevye.sh | 755 | iskra:iskra |
| `dorabotki/stendy/stend-opisat-kartinku.sh` | `/opt/iskra/workspace/dorabotki/stendy/stend-opisat-kartinku.sh` | nightly run (perechen-boevyh-stendov.txt); runner vse-stendy-boevye.sh | 755 | iskra:iskra |
| `dorabotki/stendy/stend-osnova.sh` | `/opt/iskra/workspace/dorabotki/stendy/stend-osnova.sh` | nightly run (perechen-boevyh-stendov.txt); runner vse-stendy-boevye.sh (@root) | 755 | iskra:iskra |
| `dorabotki/stendy/stend-otbros-shlyuza.py` | `/opt/iskra/workspace/dorabotki/stendy/stend-otbros-shlyuza.py` | nightly run (perechen-boevyh-stendov.txt) | 644 | iskra:iskra |
| `dorabotki/stendy/stend-pered-podyomom.mjs` | `/opt/iskra/workspace/dorabotki/stendy/stend-pered-podyomom.mjs` | nightly run (perechen-boevyh-stendov.txt); runner vse-stendy-boevye.sh | 644 | iskra:iskra |
| `dorabotki/stendy/stend-pereklyuchatelya-codex.etalon` | `/opt/iskra/workspace/dorabotki/stendy/stend-pereklyuchatelya-codex.etalon` | stand stend-pereklyuchatelya-codex.sh | 644 | iskra:iskra |
| `dorabotki/stendy/stend-pereklyuchatelya-codex.sh` | `/opt/iskra/workspace/dorabotki/stendy/stend-pereklyuchatelya-codex.sh` | nightly run (perechen-boevyh-stendov.txt); runner vse-stendy-boevye.sh | 755 | iskra:iskra |
| `dorabotki/stendy/stend-pereklyuchatelya-podpiski.sh` | `/opt/iskra/workspace/dorabotki/stendy/stend-pereklyuchatelya-podpiski.sh` | nightly run (perechen-boevyh-stendov.txt); runner vse-stendy-boevye.sh | 755 | iskra:iskra |
| `dorabotki/stendy/stend-prav-domov.sh` | `/opt/iskra/workspace/dorabotki/stendy/stend-prav-domov.sh` | nightly run (perechen-boevyh-stendov.txt); runner vse-stendy-boevye.sh | 755 | iskra:iskra |
| `dorabotki/stendy/stend-pravki-mimo.sh` | `/opt/iskra/workspace/dorabotki/stendy/stend-pravki-mimo.sh` | nightly run (perechen-boevyh-stendov.txt); runner vse-stendy-boevye.sh; vse-stendy-po-tajmeru.sh | 755 | iskra:iskra |
| `dorabotki/stendy/stend-pravki-postavki-omega.sh` | `/opt/iskra/workspace/dorabotki/stendy/stend-pravki-postavki-omega.sh` | nightly run (perechen-boevyh-stendov.txt); runner vse-stendy-boevye.sh | 755 | iskra:iskra |
| `dorabotki/stendy/stend-priyomnik-itog.py` | `/opt/iskra/workspace/dorabotki/stendy/stend-priyomnik-itog.py` | stand stend-priyomnik-itog.sh | 755 | iskra:iskra |
| `dorabotki/stendy/stend-priyomnik-itog.sh` | `/opt/iskra/workspace/dorabotki/stendy/stend-priyomnik-itog.sh` | nightly run (perechen-boevyh-stendov.txt); runner vse-stendy-boevye.sh | 755 | iskra:iskra |
| `dorabotki/stendy/stend-profil.sh` | `/opt/iskra/workspace/dorabotki/stendy/stend-profil.sh` | nightly run (perechen-boevyh-stendov.txt); runner vse-stendy-boevye.sh (@root, HODPRIBOR, argument /usr/local/sbin/smontirovat-fajly) | 755 | iskra:iskra |
| `dorabotki/stendy/stend-razbora-env.py` | `/opt/iskra/workspace/dorabotki/stendy/stend-razbora-env.py` | stand stend-razbora-env.sh | 755 | iskra:iskra |
| `dorabotki/stendy/stend-razbora-env.sh` | `/opt/iskra/workspace/dorabotki/stendy/stend-razbora-env.sh` | nightly run (perechen-boevyh-stendov.txt); runner vse-stendy-boevye.sh | 755 | iskra:iskra |
| `dorabotki/stendy/stend-rezhim-novogo.sh` | `/opt/iskra/workspace/dorabotki/stendy/stend-rezhim-novogo.sh` | nightly run (perechen-boevyh-stendov.txt); runner vse-stendy-boevye.sh (@root, argument /usr/local/sbin/smontirovat-fajly) | 755 | iskra:iskra |
| `dorabotki/stendy/stend-rolej-shlyuza.mjs` | `/opt/iskra/workspace/dorabotki/stendy/stend-rolej-shlyuza.mjs` | nightly run (perechen-boevyh-stendov.txt); runner vse-stendy-boevye.sh | 755 | iskra:iskra |
| `dorabotki/stendy/stend-sadik-watch-bez-sredy.sh` | `/opt/iskra/workspace/dorabotki/stendy/stend-sadik-watch-bez-sredy.sh` | weekly run (perechen-nedelnyh-stendov.txt); vse-stendy-nedelnye.sh | 755 | iskra:iskra |
| `dorabotki/stendy/stend-sadik-watch-voice-root.sh` | `/opt/iskra/workspace/dorabotki/stendy/stend-sadik-watch-voice-root.sh` | nightly run (perechen-boevyh-stendov.txt); runner vse-stendy-boevye.sh (@root) | 755 | iskra:iskra |
| `dorabotki/stendy/stend-sadik-watch-zastryal.sh` | `/opt/iskra/workspace/dorabotki/stendy/stend-sadik-watch-zastryal.sh` | nightly run (perechen-boevyh-stendov.txt); runner vse-stendy-boevye.sh (@root) | 755 | iskra:iskra |
| `dorabotki/stendy/stend-sajt-chat.py` | `/opt/iskra/workspace/dorabotki/stendy/stend-sajt-chat.py` | stand stend-sajt-chat.sh | 444 | iskra:iskra |
| `dorabotki/stendy/stend-sajt-chat.sh` | `/opt/iskra/workspace/dorabotki/stendy/stend-sajt-chat.sh` | nightly run (perechen-boevyh-stendov.txt); runner vse-stendy-boevye.sh | 555 | iskra:iskra |
| `dorabotki/stendy/stend-sborshchika-kopii.sh` | `/opt/iskra/workspace/dorabotki/stendy/stend-sborshchika-kopii.sh` | nightly run (perechen-boevyh-stendov.txt); runner vse-stendy-boevye.sh | 755 | iskra:iskra |
| `dorabotki/stendy/stend-smontirovat-vypusk-args.sh` | `/opt/iskra/workspace/dorabotki/stendy/stend-smontirovat-vypusk-args.sh` | nightly run (perechen-boevyh-stendov.txt); runner vse-stendy-boevye.sh | 755 | iskra:iskra |
| `dorabotki/stendy/stend-smontirovat-vypusk-git.sh` | `/opt/iskra/workspace/dorabotki/stendy/stend-smontirovat-vypusk-git.sh` | nightly run (perechen-boevyh-stendov.txt); runner vse-stendy-boevye.sh | 644 | iskra:iskra |
| `dorabotki/stendy/stend-smontirovat-vypusk-rezhimy.sh` | `/opt/iskra/workspace/dorabotki/stendy/stend-smontirovat-vypusk-rezhimy.sh` | nightly run (perechen-boevyh-stendov.txt); runner vse-stendy-boevye.sh | 755 | iskra:iskra |
| `dorabotki/stendy/stend-smontirovat-vypusk-strahovka.sh` | `/opt/iskra/workspace/dorabotki/stendy/stend-smontirovat-vypusk-strahovka.sh` | nightly run (perechen-boevyh-stendov.txt); runner vse-stendy-boevye.sh | 755 | iskra:iskra |
| `dorabotki/stendy/stend-snyatiya-profilya.sh` | `/opt/iskra/workspace/dorabotki/stendy/stend-snyatiya-profilya.sh` | nightly run (perechen-boevyh-stendov.txt); runner vse-stendy-boevye.sh (@root, argument /usr/local/sbin/smontirovat-fajly) | 755 | iskra:iskra |
| `dorabotki/stendy/stend-snyatiya.sh` | `/opt/iskra/workspace/dorabotki/stendy/stend-snyatiya.sh` | nightly run (perechen-boevyh-stendov.txt); runner vse-stendy-boevye.sh (@root, argument /usr/local/sbin/smontirovat-fajly) | 755 | iskra:iskra |
| `dorabotki/stendy/stend-sobrat-kuda.sh` | `/opt/iskra/workspace/dorabotki/stendy/stend-sobrat-kuda.sh` | nightly run (perechen-boevyh-stendov.txt); runner vse-stendy-boevye.sh | 755 | iskra:iskra |
| `dorabotki/stendy/stend-storozha-nad-storozhami.sh` | `/opt/iskra/workspace/dorabotki/stendy/stend-storozha-nad-storozhami.sh` | weekly run (perechen-nedelnyh-stendov.txt); vse-stendy-nedelnye.sh | 755 | iskra:iskra |
| `dorabotki/stendy/stend-svesti-dostup-podpisok.sh` | `/opt/iskra/workspace/dorabotki/stendy/stend-svesti-dostup-podpisok.sh` | nightly run (perechen-boevyh-stendov.txt); runner vse-stendy-boevye.sh | 755 | iskra:iskra |
| `dorabotki/stendy/stend-svesti-dostup-watch.sh` | `/opt/iskra/workspace/dorabotki/stendy/stend-svesti-dostup-watch.sh` | nightly run (perechen-boevyh-stendov.txt); runner vse-stendy-boevye.sh | 755 | iskra:iskra |
| `dorabotki/stendy/stend-svodki-doveriya.sh` | `/opt/iskra/workspace/dorabotki/stendy/stend-svodki-doveriya.sh` | nightly run (perechen-boevyh-stendov.txt); runner vse-stendy-boevye.sh | 755 | iskra:iskra |
| `dorabotki/stendy/stend-switch-1.py` | `/opt/iskra/workspace/dorabotki/stendy/stend-switch-1.py` | stand stend-switch-1.sh | 644 | iskra:iskra |
| `dorabotki/stendy/stend-switch-1.sh` | `/opt/iskra/workspace/dorabotki/stendy/stend-switch-1.sh` | nightly run (perechen-boevyh-stendov.txt); runner vse-stendy-boevye.sh | 755 | iskra:iskra |
| `dorabotki/stendy/stend-trust-sverka.sh` | `/opt/iskra/workspace/dorabotki/stendy/stend-trust-sverka.sh` | nightly run (perechen-boevyh-stendov.txt); runner vse-stendy-boevye.sh (@root, argument /usr/local/sbin/mail-stop-trust-sverka.mjs) | 644 | iskra:iskra |
| `dorabotki/stendy/stend-ucheta-git.sh` | `/opt/iskra/workspace/dorabotki/stendy/stend-ucheta-git.sh` | nightly run (perechen-boevyh-stendov.txt); runner vse-stendy-boevye.sh | 755 | iskra:iskra |
| `dorabotki/stendy/stend-ucheta.sh` | `/opt/iskra/workspace/dorabotki/stendy/stend-ucheta.sh` | nightly run (perechen-boevyh-stendov.txt); runner vse-stendy-boevye.sh | 755 | iskra:iskra |
| `dorabotki/stendy/stend-vorot-perenosa.sh` | `/opt/iskra/workspace/dorabotki/stendy/stend-vorot-perenosa.sh` | nightly run (perechen-boevyh-stendov.txt); runner vse-stendy-boevye.sh | 755 | iskra:iskra |
| `dorabotki/stendy/stend-vorot-vypuska.sh` | `/opt/iskra/workspace/dorabotki/stendy/stend-vorot-vypuska.sh` | nightly run (perechen-boevyh-stendov.txt); runner vse-stendy-boevye.sh | 755 | iskra:iskra |
| `dorabotki/stendy/stend-zhivaya-versiya.py` | `/opt/iskra/workspace/dorabotki/stendy/stend-zhivaya-versiya.py` | nightly run (perechen-boevyh-stendov.txt) | 644 | iskra:iskra |
| `dorabotki/skaner-zhivoj-mashiny.py` | `/opt/iskra/workspace/dorabotki/skaner-zhivoj-mashiny.py` | runner vse-stendy-boevye.sh (С1 before every stand, rules for the С2 judgement); taken from the runner's directory — install next to it | 755 | iskra:iskra |
| `dorabotki/vse-stendy-boevye.sh` | `/opt/iskra/workspace/dorabotki/vse-stendy-boevye.sh` | vse-stendy-po-tajmeru.sh | 755 | iskra:iskra |
| `dorabotki/vse-stendy-nedelnye.sh` | `/opt/iskra/workspace/dorabotki/vse-stendy-nedelnye.sh` | vse-stendy-nedelnye.service (User=iskra) | 755 | iskra:iskra |
| `dorabotki/vse-stendy-po-tajmeru.sh` | `/opt/iskra/workspace/dorabotki/vse-stendy-po-tajmeru.sh` | vse-stendy-boevye.service (User=iskra) | 755 | iskra:iskra |
| `dorabotki/edinstvennye-sushchnosti-shlyuza.json` | `/opt/iskra/workspace/dorabotki/edinstvennye-sushchnosti-shlyuza.json` | stand stend-kanarejki-shlyuza.sh | 644 | iskra:iskra |
| `dorabotki/zayavlennye-proverki-kanarejki-shlyuza.json` | `/opt/iskra/workspace/dorabotki/zayavlennye-proverki-kanarejki-shlyuza.json` | stand stend-kanarejki-shlyuza.sh | 644 | iskra:iskra |
| `dorabotki/sreda-yunita.py` | `/opt/iskra/workspace/dorabotki/sreda-yunita.py` | stand stend-kanarejki-shlyuza.sh | 755 | iskra:iskra |
| `systemd/vse-stendy-boevye.service` | `/etc/systemd/system/vse-stendy-boevye.service` | its own .timer, 03:40 UTC | 644 | root:root |
| `systemd/vse-stendy-boevye.service.d/30-stend-nabora.conf` | `/etc/systemd/system/vse-stendy-boevye.service.d/30-stend-nabora.conf` | drop-in: STEND_POLKA, STEND_PLAGINY for the set stand | 644 | root:root |
| `systemd/vse-stendy-boevye.service.d/60-bash-padenie-70.conf` | `/etc/systemd/system/vse-stendy-boevye.service.d/60-bash-padenie-70.conf` | drop-in: run through bash-padenie-70 | 644 | root:root |
| `systemd/vse-stendy-boevye.timer` | `/etc/systemd/system/vse-stendy-boevye.timer` | systemd (enabled) | 644 | root:root |
| `systemd/vse-stendy-nedelnye.service` | `/etc/systemd/system/vse-stendy-nedelnye.service` | its own .timer, Wed 01:30 UTC | 644 | root:root |
| `systemd/vse-stendy-nedelnye.service.d/60-bash-padenie-70.conf` | `/etc/systemd/system/vse-stendy-nedelnye.service.d/60-bash-padenie-70.conf` | drop-in: run through bash-padenie-70 | 644 | root:root |
| `systemd/vse-stendy-nedelnye.timer` | `/etc/systemd/system/vse-stendy-nedelnye.timer` | systemd (enabled) | 644 | root:root |

## Outside the run — stands in `dorabotki` that the run does not call (not taken into the package)

- root: stend-kanarejki.sh — «РУЧНОЙ НАМЕРЕННО» ("manual on purpose"; so in the list, 1.0.12: the copy inherits the identity of the live agent);
  stend-needrestart.sh is in the package since 3.1.1 (table above), the weekly run calls it;
  stend-hranilishcha-sekretov.sh and stend-vozrast-pisma.mjs — since 1.0.12 in the package and in the nightly run (vozrast-pisma — with the exception ОЖИДАЕМО);
- stendy/CHITAT-PERED-PROGONOM-nabor-vorot.txt, stendy/stend-podyoma.sh — `stendy/stend-podyoma.sh` is «вне обхода намеренно» ("outside the run on purpose"; so in the list); `CHITAT-PERED-PROGONOM-nabor-vorot.txt` is a note for the operator.
- the manual `stend-krug-samoproverki.sh` — «ИСКЛЮЧЁН, ручной» ("excluded, manual"; so in the list); its source is the dsh-reestr tree
  (`/opt/iskra/workspace/dsh-plugins/packages/dsh-reestr/test/stend-krug-samoproverki.sh`), the copy in `dorabotki` was removed in 1.0.50.

## Not in the package — items under check and the rest (the coordinator decides separately)

- Items that the package's stands check (tools of other areas): `montazh-iz-tega`,
  `ozhidaemyj-razmer.py`, `priznak-oblasti-podklyucheniya.sh`, `proverit-publikacii.py` (+ its settings `karta-publikacij.yaml`),
  `proverka-opory.mjs`, `verdikty-priyomki.sh`; sources of live tools that have a pair in `/usr/local` (already in their own packages).
- Other files in the root of `dorabotki` that the core mentions only in comments, files `*.SNYATO*`, backups `*.bak*`, the bookkeeping `nashi-dorabotki.sh`/`manifest.txt`.

## Dependencies

- Programs: bash, python3, node, systemctl, journalctl, sudo, `systemd-run` (a scope for every stand), `setpriv` (the stand's account
  in the scope with the same groups), `setfacl` from the acl package (the guest agent's journal), `timeout` (the stand's time limit); `bash-padenie-70` from the package
  **dsh-storozha-mashiny** (drop-in of both units).
- The weekly `stend-needrestart.sh` checks `/opt/iskra/workspace/dorabotki/proverka-needrestart.pl` and the live
  `/etc/needrestart/conf.d/50-agent-services.conf` — they are not in the packages; either missing — BLINDNESS, code 2. Under the key
  `--zhivaya-mashina` it takes the dpkg/apt locks for the run and writes and removes `99-STEND-*.conf` in the live `/etc/needrestart/conf.d`.
- `stendy/stend-vorot-perenosa.sh` checks the installed gates `/usr/local/bin/perenos-v-derevo` (package dsh-montazh), another path — `PERENOS_BIN`.
- The python module `yaml` (PyYAML; OS package `python3-yaml`): the runner reads `/etc/agent-registry/stend-exceptions.yaml` with it. Without the module
  the exceptions file is «не разобран» ("not parsed"), and the outcome of the run is not below 2. 18 stands of the package import it too.
- The run's account (iskra) needs passwordless `sudo -n`: the scope unit of every stand, the `journalctl` judgement after
  the run and the stands of other accounts go through it. Without it С2 goes blind, and the run ends with code 2 (unless there is a reason for 1).
- The directory `/opt/iskra/workspace/tmp-stendov` (iskra:iskra 0750) is created by the installation, not by the package: it is the `TMPDIR` of the gates stand
  `stend-vorot-vypuska.sh` and of `/usr/local/libexec/stend-metki-vorot.sh` (lines `SREDA_STENDOV` of the runner). In the run's unit
  `/tmp` and `/var/tmp` are private, and both stands call separate `systemd-run` services (gates — the runner, probe 6б — the tag watcher)
  that cannot see a private directory. No directory — both stands go blind.
- `/etc/agent-registry/stend-exceptions.yaml` (stand exceptions), the registry and the live items of the stands are not in the package.

## Installation and removal (by root)

Files of `dorabotki/` go to `/opt/iskra/workspace/dorabotki/` with owner `iskra:iskra` and the mode from the table; units and drop-ins go to
`/etc/systemd/system/`, then `systemctl daemon-reload`, `systemctl enable --now vse-stendy-boevye.timer vse-stendy-nedelnye.timer`.

Removing a unit is `systemctl mask` (farm rule 9): our unit with a file in `/etc/systemd/system` will not accept mask —
move the file into a backup (`mv`), `daemon-reload`, `mask`; to bring it back — `unmask` and the file back.

## How the runner drives the stands

Before the run the runner takes the journal of the guest agent's service (the unit name is hard-coded in the runner) since its start into a file of its run: an `mktemp` directory in
`TMPDIR` with mode 711, the file 600 and an ACL granting read to that agent's account (`setfacl`). The first line is the header `#MOST_ZHURNAL_YUNITA <юнит> <старт>`.
The path is given to that agent's stand `stend-cel-mosta.mjs` in the variable `MOST_ZHURNAL_YUNITA` (line `SREDA_STENDOV`). If it could not be taken,
there is no file, and the stand goes blind instead of turning green.

**С1 — a warning before the start, not red.** Before every stand `skaner-zhivoj-mashiny.py` reads its text and looks for commands
that change the live machine: `systemctl` with a changing verb, `useradd` and its kin, writes into `/etc`, dpkg/apt locks, tools with an action
key. A stand of another account is read by that account and fed to the scanner via stdin. Markers in the stand text: `# ZHIVAYA-MASHINA: <what it
changes>` (a manual stand that changes the live machine) and `# ZHIVAYA-MASHINA-NET: <what replaces it>` (does not touch the live machine). The run summary has the lines
«⚠️ С1: <стенд>» with the first findings, «С1 (предупреждение, не красное): …» ("warning, not red"), «NET без проверки С2 (@root): N» ("NET without a С2 check"; a NET declaration of an
@root stand cannot be checked by С2). С1 does not change the run's exit code.

**С2 — detection afterwards, not protection.** Every stand runs in its own `sudo -n systemd-run --scope --unit=obhod-stend-<pid>-<N>` through
`setpriv` with the same uid, gid, groups and umask; the environment is passed in a 0600 file in the run's working directory (on the command line
everyone would see it). After the run, one `sudo -n journalctl` query over the run window judges the sudo and shadow-utils records of every unit
by the С1 rules. A finding is «🔴 С2: стенд <путь> изменил живую машину» ("stand <path> changed the live machine"). Stopping and resetting its own temporary units (`systemd-run --unit=`
from the same stand) is not a finding. Sight is checked on every run: unit no. 0 calls `sudo -n /usr/bin/true obhod-stend-<pid>-0`; if its record is missing from the journal
or the scope did not come up — «СЛЕПОТА С2» ("С2 blind"). Since 3.1.9 the query also takes records by `SYSLOG_IDENTIFIER`: when journald
receives a record after the process has exited, it stores it without `_COMM` and `_SYSTEMD_UNIT`. The sight probe is recognised by the run tag;
other such records of the own account and of shadow-utils are counted («записей без привязки к юниту N»), a changing one among them is
«⚠️ С2 БЕЗ ПРИВЯЗКИ» ("С2 without binding"), code 2: the source cannot be named —
a stand of the walk or another process of the same account (an agent service, for instance) that ran inside the run window. The own С2 query of a nested walker (exact full form) is not a finding; any other `journalctl` stays under the scanner rules. С2 does not see the actions of @root stands (everything inside runs as root without its own sudo record, except
shadow-utils), commands inside `sudo bash <скрипт>` and actions in separate units that the stand starts itself (`systemd-run` without
`--scope`).

**Live stands — only with a key** (there are two: `stend-vzaimnogo-nabludeniya.sh` and `stend-needrestart.sh`). `stend-vzaimnogo-nabludeniya.sh` without `--zhivaya-mashina` refuses with the line
«ОТКАЗ-ZHIVAYA-MASHINA», code 2, and touches nothing; with the key it stops the live `agent-watchdog.timer` for a few seconds
(turned off with `BEZ_PORCHI_PREDMETA=1`). Only the weekly run gives the key: `vse-stendy-nedelnye.sh` sets its own `OBLAST_STENDOV`,
`PERECHEN_STENDOV`, `PREDEL_STENDOV` and `SREDA_STENDOV`, and `SREDA_STENDOV` fully replaces the runner's default and gives the key
by name (the tail of the line after `--`). The nightly run and the release gates do not give the key. С2 findings of a stand under the key are printed
with the line «ЖИВОЙ ПО КЛЮЧУ: …» ("live by key") and are not counted as red.

Stands that start temporary units themselves: `stend-reestra-agentov.sh` — `sudo -n systemd-run --unit=b1890s<pid>-<агент>
-p RuntimeDirectory=…` for three guest probes (no `sudo -n` — the probes are skipped); `stendy/stend-razbora-env.sh` (@root) — through
`stend-razbora-env.py`, temporary `systemd-run --wait --pipe`. С2 does not see their actions inside these units by stand.

Runner exit codes: 0 — clean; 3 — only the expected (exceptions are in force); 1 — unexpected: a red or blind stand without
an exception, an expired or unconfirmed exception, the coverage diverged from the list, **a С2 finding** (exceptions do not lift it);
2 — completeness cannot be established: no stands, no list, the exceptions file not read, **С2 blind** (unless there is a reason for 1).

## Check

The checksum of every package file = the checksum in live (`sha256sum`), modes = the table (`stat -c '%a %U:%G'`); the outcome of the run — the reader `chitatel-obhoda`.
