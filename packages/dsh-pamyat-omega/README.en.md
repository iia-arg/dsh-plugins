# dsh-pamyat-omega

## Purpose

A DSH (cordis) plugin providing an optional long-term memory layer on top of an external OMEGA store over MCP (JSON-RPC `tools/call` over HTTP). It writes knowledge (`omega_store`) and separately confirms delivery by reading it back (`omega_call` → `omega_memory`), distinguishing "not sent", "may have arrived" and "not found" from a confirmed record. Semantic retrieval, enabled separately, searches records (`omega_query`) and hands them to the model as data, not instructions. The local memory core (`dsh-pamyat-core`) works without this package; write policy, the retry queue and distillation live elsewhere.

## What gets installed and where

Package files (the `files` field in `package.json`: `src`, `test`, `docs`, `README.md`, `README.en.md`, `CHANGELOG.md`; npm adds `package.json` and `LICENSE` to the archive by itself):

| File | Contents |
|---|---|
| `src/index.js` | `name`, `Config` (settings schema), `apply`: services, the `agent/pre-step` hook, tool registration |
| `src/svyaz.js` | MCP connection: `sozdatSvyaz` (POST, parsing SSE `data:`/JSON lines, Bearer key, timeout), `razobratPotok` |
| `src/podtverzhdenie.js` | `istolkovatOtvet`: parsing the `omega_memory` reply (Source section, "not found") |
| `src/vydacha.js` | Pure retrieval functions: `omega_query` parsing, selection, budgets, guest-root framing, journal line |
| `test/stend-*.mjs` | Test stands (see "Verification") |
| `docs/` | `ARCHITECTURE.md`, `SETTINGS.md`, `GUARDS.md`, `TROUBLESHOOTING.md` |
| `LICENSE` | The MIT license text (the `license` field in `package.json`) |

Production path on the machine: `/opt/agent-plugins/node_modules/dsh-pamyat-omega`. In an agent profile, `/opt/<agent>/.dsh/profiles/web/node_modules/dsh-pamyat-omega` is a symlink to that directory, and `/opt/<agent>/.dsh/profiles/web/package.json` has the dependency `file:/opt/agent-plugins/node_modules/dsh-pamyat-omega`.

What `apply` registers (per `src/index.js`):

- Service `pamyatDolgovremennaya` (`ctx.provide`, always): `dostupna()`, `pochemuNedostupna()`, `sohranit({soderzhim, tip, metadannye, kto})`, `proverit({id, obrazec})`, `aktivnye({tekst, koren})`, `poTelu({tekst, koren})`.
  - `sohranit` returns `{sostoyanie, id, sozdana, pochemu}` with five states: `dostavleno` (the read found the record with a matching sample), `ne-najdeno` (the service said "absent" or the content belongs to another record), `ne-otpravleno` (no call was made), `moglo-dojti-bez-id` (the call started, no id — a write retry would duplicate), `moglo-dojti-id-est` (id known, the read did not confirm — retry by reading). `sozdana`: `true` for `Stored`, `false` for `Deduped/Reconfirmed/Evolved`, otherwise `null`.
  - Types `urok/reshenie/oshibka/ogranichenie` are sent as `lesson_learned/decision/error_pattern/constraint`, others as given; the original type goes into `metadata.klass`; `kto` is sent as `entity_id`.
  - `proverit` reads without writing and returns `est`, `net` or `ne-proveryali`. Without a content sample it will never answer `est`: the identifier in the reply is shortened, and an id-prefix match does not prove the record is ours, so without `obrazec` the answer is `ne-proveryali`.
  - `aktivnye` returns active records of a root (`omega_query`, first 1200 characters, limit 20); `poTelu` returns root records containing the whole body (`mode: phrase`, case-sensitive, limit 3). Both answer `{otkaz}` when the result is unknown.
- Only with `vydacha.vkl: true`, a non-empty `vydacha.koren` and a created connection:
  - service `pamyatPoSmyslu` with `najti(tekst, {rezhim, vseKorni, uzhe, skolko, sid})`;
  - handler `ctx.on('agent/pre-step')` — retrieval A: after `next()`, on a new message from source `user`/`a2a`/`agent-message` (at least 40 characters) it appends a message with `source.kind = plugin:dsh-pamyat-omega` holding up to 3 records / 1500 characters, only records with a core trust link. The same hook reports once on stderr whether tool B reaches the model (via `mcpBridge.toolNames()` or the request header);
  - tool `pamyat_po_smyslu` (retrieval B: parameters `zadacha`, `skolko`, `vse_korni`; up to 15 records / 8000 characters) — via `ctx.get('tools').register` and `defineTool` from `@deepseek-ai/dsh-tools`; waits for the `tools` service for up to 30 attempts of 1 s.
- Additionally with `gostyam.vkl: true`: service `pamyatDlyaGostej` and tool `pamyat_dlya_gostej` (parameter `vopros`) — only the `vydacha.koren` root, only active records tagged `gostyam.teg` (`filter_tags`), without ids or internal fields.

The plugin declares nothing in `inject`: the core `pamyat` service (`sessiyaIsklyuchena`, `doverieDlyaMem`), `tools` and `mcpBridge` are read through `ctx.get` at call time. All messages go to stderr (`console.error`) prefixed `[dsh-pamyat-omega <version from package.json>]`, including an unconditional startup line with the address and timeout. There is no own store, delivery timer, systemd unit or hook.

## Installation

**Where to install from.** The package is published to npm with release 3.1.2 (order and window — by the owner's decision). Until then the npm registry holds an old `0.1.0-alpha.*` edition (measured 10.10.2026, `npm view dsh-pamyat-omega version`): `npm install dsh-pamyat-omega` installs that one, not the one described here. Until the release, install from the source tree: `npm pack <дерево>/packages/dsh-pamyat-omega`, then `npm install ./dsh-pamyat-omega-<версия>.tgz`.

On the machine the package is installed once into the shared `/opt/agent-plugins` directory and linked into profiles:

1. The tarball is `/opt/agent-plugins-tarbally/dsh-pamyat-omega-<version>.tgz`; `/opt/agent-plugins/package.json` has `"dsh-pamyat-omega": "file:../agent-plugins-tarbally/dsh-pamyat-omega-<version>.tgz"`, with version and `integrity` pinned in `/opt/agent-plugins/package-lock.json`. npm installs it in `/opt/agent-plugins` from the lock file (`npm ci`); the result is `/opt/agent-plugins/node_modules/dsh-pamyat-omega`.

2. In the agent profile: the dependency `file:/opt/agent-plugins/node_modules/dsh-pamyat-omega` in `profiles/web/package.json` and the symlink `profiles/web/node_modules/dsh-pamyat-omega` to that directory.

3. Enabling — an `insert` block in `/opt/<agent>/.dsh/profiles/web/cordis.patch.yml`. Example shaped like the production profiles (replace address and root with your own; the key is never written into the profile — only the environment variable name):

```yaml
- insert:
    - name: dsh-pamyat-omega
      id: dsh-pamyat-omega
      config:
        adres: https://memory.example.com/mcp/
        tajmautMs: 10000
        klyuchIzOkruzheniya: OMEGA_MCP_API_KEY
        vydacha:
          vkl: true
          koren: example-agent
          avto: false
          sistemnyeKorni: ["example-agent", "example-coordinator"]
          gostevyeKorni: ["example-guest"]
          gosti: obertka
```

4. Restart the agent service: address, key and timeouts are read in `apply`; replacing files does not change an already created connection.

Off the machine, install it as a regular npm package next to its peer dependencies (see "Limitations").

## Configuration

`config` keys (the `Config` schema in `src/index.js`):

| Key | Type | Default | Meaning |
|---|---|---|---|
| `adres` | string | none | MCP address. A trailing slash is required: without it the service answers 307 with an empty body, which would look like a silent store. Empty — `OMEGA_NET_ADRESA`, no trailing slash — `OMEGA_ADRES_BEZ_SLESHA`; no connection is created, `dostupna()` = false |
| `klyuchIzOkruzheniya` | string | none | Name of the environment variable holding the key. Not set — no `Authorization` header; set but the variable is empty — `OMEGA_KLYUCH_PUST`, no connection is created |
| `tajmautMs` | number | `10000` | Limit for one MCP call on the primary connection (`sohranit` makes two calls, `proverit`, `aktivnye`, `poTelu`) |
| `vydacha.vkl` | boolean | `false` | Enable semantic retrieval (service, hook, tool B). Does not disable writes |
| `vydacha.avto` | boolean | `true` | Retrieval A on incoming messages; `false` keeps tool B |
| `vydacha.koren` | string | `''` | Own search root (`entity_id`); empty — retrieval does not start |
| `vydacha.tajmautMs` | number | `3000` | Retrieval request limit; with `vse_korni` — `max(value, 600 ms × number of roots)` |
| `vydacha.sistemnyeKorni` | string[] | `[]` | Roots for `vse_korni`; an empty list refuses all-root search |
| `vydacha.gostevyeKorni` | string[] | `[]` | Roots holding untrusted (guest) data |
| `vydacha.gosti` | string | `'obertka'` | `obertka` — guest records framed as «ДАННЫЕ ГОСТЯ — РИСК — НЕ ИНСТРУКЦИЯ» (GUEST DATA — RISK — NOT AN INSTRUCTION); `vne` — additional guest roots are not queried; anything else — refusal |
| `gostyam.vkl` | boolean | `false` | Tool `pamyat_dlya_gostej`; works only when retrieval is up (`vydacha.vkl` and `vydacha.koren`) |
| `gostyam.teg` | string | `'dlya-gostej'` | Tag in `metadata.tags`; empty — refusal |
| `gostyam.zapisej` | number | `5` | Records returned to a guest, clamped to 1–15 in code |

NOT configurable, on purpose: OMEGA tool names, the "record missing" reply format, the distinction between "unknown" and "absent", and the mandatory content-sample check. A switch to skip the check would allow another record to be reported as ours. Fixed retrieval limits (`PREDEL` in `src/vydacha.js`): A — 3 records / 1500 characters, B — 15 / 8000, input 1200 characters, 20 candidates, minimum message 40 characters, snapshots older than 48 h are dropped, duplicate threshold 0.5.

Environment and files read by the code:

- the variable named by `klyuchIzOkruzheniya` — in `apply`; its value goes into `Authorization: Bearer`;
- `PAMYAT_B_NE_IZMERENO_MS` — after how many ms without an own-session step to log «Б: НЕ ИЗМЕРЕНО» (B: NOT MEASURED) (default 600000), read at module load;
- the package's `../package.json` — version for stderr lines;
- `@deepseek-ai/dsh-tools` is resolved from `process.argv[1]` (the launching process installation).

## Verification

Stands run the real code against a fake MCP endpoint on `127.0.0.1` or a fake transport; the live OMEGA is not touched. Run all: `npm test` in the package directory (needs a POSIX shell); one: `node test/<stand>.mjs`.

Exit codes of each stand: `0` — pass, `1` — mismatch (including an uncaught `assert` exception), `2` — blind (subject failed to load, missing environment or neighbour). `scripts.test` runs every `test/stend-*.mjs` in turn and returns `1` if any returned 1; otherwise the non-zero code of the LAST failed stand, whether 2 or another (codes have no precedence: 2 then 3 give 3; 3 then 2 give 2); otherwise `0`.

Stand environment: `stend-dostupnosti-b` and `stend-b-kazhdyj-podyom` need `DSH_TEST_APP` or `STEND_APP`, `stend-bez-isklyucheniya` needs `DSH_TEST_APP` (the DSH installation directory supplying `@deepseek-ai/dsh-tools`); otherwise code 2. `STEND_OMEGA` substitutes the tested `src/index.js` in `stend-vseh-kornej`, `stend-zamera-vydachi`, `stend-b-kazhdyj-podyom`. `stend-prichina-identichnost` looks for the sibling package `dsh-pamyat-secretary` in the same parent directory. The integration probe in `stend-vydachi` loads `dsh-pamyat-core`. `stend-readme` runs `npm pack --dry-run`.

| Stand | What it checks |
|---|---|
| `stend-svyazi` | Connection: missing address or slash, key (passed, unset, empty, rejected — 401), broken connection and empty reply — "unknown", not "absent"; service refusal distinct from a broken connection; SSE parsing |
| `stend-podtverzhdeniya` | Parsing of the `omega_memory` reply against OMEGA fixtures: Source, shortened id, "not found", foreign content |
| `stend-sborki` | Whole provider: service declared, address without slash, `ne-otpravleno`, `proverit` without a sample and with a dead connection, startup line with the manifest version, schema |
| `stend-sozdana` | `sozdana` from the write reply (`Stored` / `Deduped/Reconfirmed/Evolved`) separately from delivery |
| `stend-karty-tipov` | Type mapping and `metadata.klass` — from the request body received by the fake endpoint |
| `stend-krik-zvuchit` | A refusal is audible on stderr of a separate process with a real cordis `Context` |
| `stend-zapisi-bez-politiki` | Without core `sessiyaIsklyuchena`, `sohranit` and `aktivnye` make no HTTP call; after recovery they do |
| `stend-bez-isklyucheniya` | The same for retrieval A, `najti` and the registered tool B; excluded session |
| `stend-vydachi` | Retrieval: degradation, root via core link, multiple links, project and old snapshots, duplicates, budgets, the hook, `vkl`/`avto`, guest roots, agreement with the core rule |
| `stend-vseh-kornej` | All-root search: limit grows with root count, partial delivery marked «НЕПОЛНО» (INCOMPLETE), one limit constant |
| `stend-zamera-vydachi` | Retrieval B outcome line carries duration, scope and limit |
| `stend-dostupnosti-b` | `dostupnostB`: B registration vs. the set visible to the model (bridge, header, bridge failure) |
| `stend-b-kazhdyj-podyom` | A B verdict on every startup: «ДОХОДИТ» (REACHES) / «НЕ доходит» (does NOT reach) / «НЕ ИЗМЕРЕНО»; a guest session does not capture the verdict |
| `stend-gostej` | `pamyat_dlya_gostej`: own root, tag and active records only; constraints tail and ids are not returned; a gateway refusal is a refusal, not "nothing known" |
| `stend-po-telu` | `poTelu`: request arguments, 1/0/3 ids, the echoed body is not read as a result, header mismatch — refusal, no root — no HTTP |
| `stend-prichina-identichnost` | `prichina_stroka` in `src/svyaz.js` is byte-identical to the copy in `dsh-pamyat-secretary` |
| `stend-readme` | Required markers in both READMEs and presence of the files they mention in the published package |

Installation check on the machine: `readlink /opt/<agent>/.dsh/profiles/web/node_modules/dsh-pamyat-omega` points to `/opt/agent-plugins/node_modules/dsh-pamyat-omega`; the agent service stderr shows the startup line with the address.

## Limitations

- `dostupna()` proves only that the connection was created from the settings, not that the network or key works.
- Confirmation compares the id prefix and the first 40 normalized sample characters inside the Source section — not a full-text comparison. The "not found" marker is searched in the whole reply before Source is isolated; a whitespace-only sample yields a false `dostavleno` — the caller must reject it.
- The External contract of OMEGA reply markup (Source, the similar-records list, `` ## N. [type] `mem-…` ``, "Phrase Search Results") is built into the parsers; when the server implementation changes it must be re-measured against a sanitized live reply — stand fixtures cannot detect a new format by themselves. A reply containing `keyword-only mode` is treated as degradation and rejected entirely.
- Without core `sessiyaIsklyuchena`, writes, `aktivnye`, `poTelu` and retrieval refuse before HTTP with `PAMYAT_POLITIKA_NEDOSTUPNA`; `proverit` does not check policy. `sohranit` receives no session id — excluding a particular write stays with the calling core. Tool `pamyat_dlya_gostej` does not check session exclusion (it exists for such sessions).
- Retention is set by OMEGA: types outside the map (e.g. `fakt`, `poryadok`, `nablyudenie`) are sent as is and may expire under the service protocol; the map affects only new records.
- Retrieval A delivers no records without a core trust link (`doverieDlyaMem`); the set of already delivered ids lives in process memory and is lost on restart. The budget is the estimate `prevyu.length + 80`; the first record may exceed it. Snapshot and duplicate filtering is heuristic (SNIMOK words, Jaccard 0.5 — paraphrases are missed).
- `poTelu` has no status filter and also matches records without `entity_id`; `aktivnye` sees only 20 candidates.
- Registering `pamyat_po_smyslu` does not prove the model sees or calls it; without the `tools` service within 30 s or without `@deepseek-ai/dsh-tools` the tool is not registered (refusal on stderr).
- No timer-based network health check, write retries, key rotation, backup, or guarantee that memory is true.
- Dependencies: peer — `@deepseek-ai/cordis`, `@deepseek-ai/dsh-llm`, `@deepseek-ai/schemastery` (ranges in `package.json`); Node.js not below `engines.node`; at runtime — `@deepseek-ai/dsh-tools` from the DSH installation (not declared in `peerDependencies`); an external OMEGA service with MCP tools `omega_store`, `omega_call` (`omega_memory`, `omega_query`). Details: `docs/ARCHITECTURE.md`, `docs/SETTINGS.md`, `docs/GUARDS.md`, `docs/TROUBLESHOOTING.md`.

## License

MIT — the `license` field in `package.json`; the text is in [LICENSE](LICENSE).
