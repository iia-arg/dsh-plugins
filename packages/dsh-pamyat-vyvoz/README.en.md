# dsh-pamyat-vyvoz — agent memory export and import: moving meaning between databases, not copying a file

Версия · Version: 3.1.4

## Purpose

A memory database backup returns the machine to a previous state. Export answers a different question: how to move knowledge to a place where the schema differs, the record numbers are its own, and none of our trust rules apply. A backup cannot be poured into a live database; an export can. The package reads the `zapisi` table of an SQLite memory database and passes every record through the secret filter of the `dsh-pamyat-core` core. The result is a JSONL file: a header line and one line per record, without local `id`s. Import takes such a file, checks it as a whole and inserts the records into another database in a single transaction.

Export has to filter: the core filter sits at the input, and everything that entered the database before it existed has never been checked. The package holds no rules of its own — the core decides. It answers with one of three modes:
- `zapiraet` — the record is held back;
- `pomechaet` — the record goes out with a `pometka_filtra` mark;
- `neizvesten` — on export the whole export stops (exit 1, no file); on import the record is rejected.

The package is not a plugin and does not run on a schedule. A human calls it by hand: moving memory has consequences on another machine and must not happen while nobody is watching. Export is available as the `vyvoz-pamyati` script and the `vyvezti()` function; import only as the `vvezti()` function. The result is read by whoever imports the file. Besides, every operation leaves a line in the `zhurnal` table of the database it touched. There are no live consumers in production (the `dsh-pamyat-vyvoz` registry record: "CALLED BY HAND, DOES NOT LIVE IN PRODUCTION").

## What gets installed and where

Nothing is installed into production. The `dsh-pamyat-vyvoz` record in `/etc/agent-registry/plugins.yaml` (section `plugins`) points at the release tree: the tool lives there, and it has no live installation by design. The record has no `derevo.files` field.

| file in package | path on the machine | mode, owner | who runs / reads it |
|---|---|---|---|
| `bin/vyvoz-pamyati.mjs` | `/opt/<main agent>/workspace/dsh-plugins/packages/dsh-pamyat-vyvoz/bin/vyvoz-pamyati.mjs` | 0755 `<main agent>:<main agent>` | by hand: `node …/bin/vyvoz-pamyati.mjs …` (declared in `package.json` as `bin` `vyvoz-pamyati`) |
| `src/index.js` | `…/dsh-pamyat-vyvoz/src/index.js` | 0644 `<main agent>:<main agent>` | package entry point (`main`, `exports "."`): `vyvezti`, `otchyot`, `vvezti`, `otchyot_vvoza`, schema and core contract |
| `src/vyvoz.js` | `…/src/vyvoz.js` | 0644 `<main agent>:<main agent>` | export: database read, filter, header, atomic file write |
| `src/vvoz.js` | `…/src/vvoz.js` | 0644 `<main agent>:<main agent>` | import: file check, filter, insertion in one transaction |
| `src/yadro.js` | `…/src/yadro.js` | 0644 `<main agent>:<main agent>` | locating the core filter and checking the contract with it |
| `src/shema.js` | `…/src/shema.js` | 0644 `<main agent>:<main agent>` | file schema version, transferred fields `POLYA`, non-transferred items with reasons `NE_VYVOZITSYA`, content checksum |
| `src/zhurnal.js` | `…/src/zhurnal.js` | 0644 `<main agent>:<main agent>` | trace line into the database's `zhurnal` table |

Not executed: `test/` (stands), `docs/`, `README.md`, `README.en.md`, `CHANGELOG.md`. Internal details are in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md), [docs/SETTINGS.md](docs/SETTINGS.md), [docs/GUARDS.md](docs/GUARDS.md) and [docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md). The current version is in `package.json` and `CHANGELOG.md`.

What the machine needs:
- Node.js **22.13.0+ on the 22.x line**, or **23.4.0+**, with `node:sqlite` and `readOnly`. Node 22 can print an `ExperimentalWarning` to stderr; that alone is not a refusal, so check the exit code. The current run uses Node 24.19.0. The minimum follows the [official SQLite API history](https://nodejs.org/download/release/v24.16.0/docs/api/sqlite.html); early 22.5–22.12 require an experimental flag and are outside this contract.
- the `dsh-pamyat-core` core with its `src/filtr-vhoda.js` file (the minimum version is in `peerDependencies` of `package.json`). In the tree it sits in the sibling directory `../dsh-pamyat-core` and is found automatically.

What the operations write:
- export — the file named by `--fajl` (mode 0600; a temporary `<fajl>.chastichnyj-<pid>` is written first, then renamed), and a line in the source database's `zhurnal`;
- import — records in the target database's `zapisi`, and a line in its `zhurnal`.

## Installation

Use the verified source tree with `dsh-pamyat-vyvoz` beside `dsh-pamyat-core`, or build **local archives** from the selected revision. The checked core snapshot is **3.1.1**. npm provides `3.1.3` (checked on 2026-10-15 with `npm view dsh-pamyat-vyvoz version`). By the owner's decision of 2026-10-14, changes after publication are maintained locally and are not republished to npm. Use archives from the selected revision for the local check described here.

```bash
# CORE_SOURCE / VYVOZ_SOURCE are package source directories; ARTIFACTS already exists.
(cd "$CORE_SOURCE" && npm pack --ignore-scripts --pack-destination "$ARTIFACTS")
(cd "$VYVOZ_SOURCE" && npm pack --ignore-scripts --pack-destination "$ARTIFACTS")
# In a separate standalone CLI directory, without registry access:
npm install --offline --ignore-scripts --legacy-peer-deps \
  /absolute/path/dsh-pamyat-core-3.1.4.tgz \
  /absolute/path/dsh-pamyat-vyvoz-3.1.4.tgz
./node_modules/.bin/vyvoz-pamyati --help
```

Verify archive hashes, both package versions and `bin/vyvoz-pamyati.mjs`/`src/filtr-vhoda.js`. Help exits with **2**; that does not indicate a failed installation. `--legacy-peer-deps` applies to the standalone filter/CLI; mounting the core in DSH requires its platform peers as documented by the core. Export is not mounted in an agent turn. Avoid `npx` when the bin is not already installed: it may fetch a different registry package.

Changes go this way (the registry record's `update` field): edit in the tree working directory → gate → release. The package is not mounted into an agent's turn. There are no units or timers.

Calling export — from an account that can read the database (the journal line also needs write access):

```bash
# dry probe: what would go; no file is created, the journal line is written
node /opt/<main agent>/workspace/dsh-plugins/packages/dsh-pamyat-vyvoz/bin/vyvoz-pamyati.mjs \
     --baza /opt/<agent>/pamyat/pamyat.db --otkuda <source name>

# export to a file
node /opt/<main agent>/workspace/dsh-plugins/packages/dsh-pamyat-vyvoz/bin/vyvoz-pamyati.mjs \
     --baza /opt/<agent>/pamyat/pamyat.db --otkuda <source name> --fajl /path/vyvoz.jsonl
```

Import — from a program only:

```js
import { vvezti, otchyot_vvoza } from '/opt/<main agent>/workspace/dsh-plugins/packages/dsh-pamyat-vyvoz/src/index.js';
const it = await vvezti({ baza: '/path/to/target.db', fajl: '/path/vyvoz.jsonl' });
console.log(otchyot_vvoza(it));
```

## Configuration

The package reads no environment variables. All configuration is script keys and fields of the object passed to the function. An unknown object field is a `VYVOZ_NEIZVESTNYJ_KLYUCH` refusal. An unknown script key is refused with exit 2 before export.

**Export: `vyvoz-pamyati` / `vyvezti({...})`**

| script key | `vyvezti` field | default | meaning |
|---|---|---|---|
| `--baza <path>` | `baza` | — (required) | source database; records are read read-only, the journal line is written over a separate read-write connection |
| `--otkuda <name>` | `otkuda` | — (required, no default) | source name in the file header; empty or whitespace only is a `VYVOZ_NET_OTKUDA` refusal |
| `--fajl <path>` | `fajl` | none | where to write; without it — a dry probe: a report, no file. A file of the same name is replaced without asking |
| `--yadro <path>` | `yadro` | chain: by package name `dsh-pamyat-core/src/filtr-vhoda.js` → sibling directory `../dsh-pamyat-core` → own `node_modules` | path to the core filter; an explicit path cancels the chain |
| `--agent <name>` | `otbor.agent` | all | only this agent's records |
| `--klass <name>` | `otbor.klass` | all | only this class |
| `--s <time>` | `otbor.s` | no lower bound | records not earlier; epoch ms or a date `Date.parse` understands (the API takes ms only) |
| `--po <time>` | `otbor.po` | no upper bound | records not later |
| — | `krik` | `console.error` | where loud messages go (a lost journal trace, etc.) |
| `--help`, `--pomoshch`, no arguments | — | — | help, exit 2 |

A selection by a field the database does not have is a `VYVOZ_OTBOR_NET_POLYA` refusal, not a silent drop of the condition.

**Import: `vvezti({...})`**

| field | default | meaning |
|---|---|---|
| `baza` | — (required) | existing target DB; a missing path refuses with VYVOZ_BAZA_NE_SUSHHESTVUET without creating a file |
| `fajl` | — (required) | export file |
| `yadro` | the same chain | path to the core filter |
| `krik` | `console.error` | where loud messages go |

The file composition is hard-coded in `src/shema.js`:
- the schema version — `VERSIYA_SHEMY`;
- the transferred fields — `POLYA`;
- what is not transferred and why — `NE_VYVOZITSYA`: `id`, the journal, the delivery queue, schema settings, issue counters, the reconciliation mark.

`pometka_filtra` is known JSONL transport metadata, **not persisted in the DB** on import. The receiver filters every POLYA field again with its own core; the annotation cannot override that decision and is not reported as an unknown field. The function does not delete the source JSONL; retain it if the annotation is needed.

## Verification

This release adds `stend-audit-boundaries.mjs` (31 CLI/API probes) and `stend-audit-docs.mjs` (8 documentation probes). The original `stend-vyvoza.mjs` retains 60 probes; `npm test` runs all three entries.

Test stand: in the package directory, `npm test`, i.e. `node test/vse-stendy.mjs`. The walker takes every `test/stend-*.mjs` from disk and names any `.mjs` lying there outside the pattern. The original `stend-vyvoza.mjs` retains 60 probes:
- the core contract and its corruptions;
- locking and unknown classes;
- a report without content;
- foreign `id`s and a foreign schema;
- atomicity and identity;
- constraints;
- the "export → import" round trip with a character-exact comparison.

The core must sit in the sibling directory `../dsh-pamyat-core`. The stand creates databases and files in a temporary directory (`TMPDIR`) and removes them on any exit. Walker exit codes:
- 0 — all stands green;
- 1 — at least one diverged;
- 2 — blindness: a stand exited outside 0/1, was killed by a signal, or there are no stands.

Run on 09.10 on the code of the `dsh-pamyat-vyvoz-v1.1.19` tag (= master): "итог: 60 из 60", exit 0.

From the `dsh-pamyat-vyvoz` registry record:
- `installed_check`: `node -p "require('/opt/<main agent>/workspace/dsh-plugins/packages/dsh-pamyat-vyvoz/package.json').version"`;
- `healthcheck`: `cd /opt/<main agent>/workspace/dsh-plugins/packages/dsh-pamyat-vyvoz && npm test`;
- `fingerprint_check`: the `npm pack --dry-run` file list without `.bak`, sha256 of each file, folded into 16 characters; must match the record's `fingerprint`.

`vyvoz-pamyati` exit codes:
- 0 — export completed (or a dry probe);
- 1 — refusal on the merits: `VYVOZ_NEZNAKOMYJ_KLASS`, `VYVOZ_OTBOR_NET_POLYA`;
- 2 — blindness: everything else. This includes no core or a broken contract (`VYVOZ_DOGOVOR_YADRA`), a database that did not open, arguments not understood, `VYVOZ_NET_OTKUDA`, `VYVOZ_NEIZVESTNYJ_KLYUCH`, a file write error, and help.

Import refusals (an exception with a `code` field) all happen before the first database write, leaving the database untouched:
- `VYVOZ_PUSTOJ_FAJL`, `VYVOZ_NET_ZAGOLOVKA`, `VYVOZ_NE_NASH_FAJL`;
- `VYVOZ_CHUZHAYA_SHEMA`, `VYVOZ_ZAGOLOVOK_BEZ_OTKUDA`;
- `VYVOZ_BITAYA_STROKA`, `VYVOZ_CHUZHIE_ID`, `VYVOZ_SUMMA_NE_SOSHLAS`;
- `VYVOZ_DOGOVOR_YADRA`, `VYVOZ_NEIZVESTNYJ_KLYUCH`.

A database error during insertion rolls back the whole transaction.

## Limitations

- Not verified by a live transfer between two machines (the `nepolno` field of the registry record). The "export → import" round trip was measured on a copy of one node's live database and on the stand.
- "Held back 0" means "the filter found nothing that locks", not "there are no secrets". The core filter knows its own list of forms and will let an unfamiliar one through, including one encoded inside a field. A BLOB field is also checked as UTF-8 text. For a record, the decision rests on one core finding per field.
- The core contract checks the shape of the filter's answers, not their correctness. Whether the core found is the expected revision is not checked: only the chain link it came from is printed. The core's code runs at import, before any check.
- A new class in the core that the export does not know stops the whole export until the package is updated. That is the price of the choice: a leak is irreversible, a stop is not.
- Does not replace the nightly database backup. Does not merge knowledge or resolve contradictions: two records about one subject stay two. Does not judge whether a record is true.
- Does not move the file to another machine or decide where to keep it.
- A dry probe (without `--fajl`) still writes a line with outcome `tolko-otchyot` to the source database's journal. The journal line goes over a separate read-write connection: without write access, or without a `zhurnal` table, the trace will not appear and this will be said, while the operation itself still happens.
- The file write is atomic (a temporary file alongside, then a rename) but without `fsync`: after a power failure the file may be empty or old.
- The content checksum is the first 32 hex characters of sha256 (128 bits), although the `sha256:` prefix suggests the full digest. Import checks the checksum only if the header has one. For an old export file without a checksum, truncation at a line boundary is invisible, and the import summary says so.
- Import assigns its own ids. Record identity is "agent + source + creation time"; without an `agent` field in the database — "source + time". Semantic duplicates with a different identity are not caught.
- On import, fields absent from the target database's schema, and fields outside the `POLYA` contract, are lost. They are named in the summary and in a warning. Their values are not stored in the DB, but can be recovered from a retained source JSONL; the import function does not delete it.
- A record of class `ogranichenie` lands with `bez_podtverzhdeniya=1`. If the database has no such field, constraints are imported without the mark, and the summary says so in a separate line.
- On a database without a `zapisi` table, export fails with an SQL error rather than a separate clear message.
- An unknown CLI name is refused with exit 2 before export; a typo never means "export everything".

## License and authors

MIT license (`package.json`). Authors: the Iia-arg team. Family sources: <https://github.com/iia-arg/dsh-plugins> (directory `packages/dsh-pamyat-vyvoz`).
