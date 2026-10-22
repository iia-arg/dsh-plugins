# dsh-pamyat · agent memory set (English page)

**Version:** 3.1.11

npm provides `3.1.4` (checked on 2026-10-15 with `npm view dsh-pamyat version`). By the owner's decision of 2026-10-14, changes after publication are maintained locally and are not republished to npm. Use the local source tree for the current composition; its pinned member versions are listed below.

The main documentation of this package is **bilingual** and lives in [README.md](README.md): every paragraph there is given in Russian and then in English. This page exists because the package's stand checks that *both* `README.md` and `README.en.md` name exactly the members and versions declared in `sostav.json` — a lone English page used to fall seven versions behind unnoticed.

**One name for nine agent-memory packages that were built and verified together — at exact versions, with a checksum for each.**

    dsh-pamyat-core        3.1.4             store, decision journal, write policy
    dsh-pamyat-omega       3.1.4             long-term memory over MCP with delivery confirmation
    dsh-pamyat-secretary   3.1.4             compaction summaries → memory records
    dsh-pamyat-byudzhet    3.1.4             incoming budget: what to lift into context
    dsh-pamyat-nudzh       3.1.4             spend accounting: is it time to compact
    dsh-pamyat-restore     3.1.4             knowledge restore after compaction and briefing
    dsh-pamyat-storozha    3.1.8             memory watchdog: fill stages, compaction notice
    dsh-pamyat-kompakt-dsh 3.1.4             own summary inside the platform compaction
    dsh-pamyat-kompakt     3.1.2             window count and summary by own model (installed as a directory)

```bash
STEND_POLKA=<archive-shelf> STEND_PLAGINY=<plugins-dir> npm test   # expected: "итог: 11 из 11" (total: 11 of 11), exit code 0; unset variables — exit 2
```

Further reading: [README.md](README.md) · [Architecture](docs/ARCHITECTURE.md) · [Settings](docs/SETTINGS.md) · [Guards](docs/GUARDS.md) · [Troubleshooting](docs/TROUBLESHOOTING.md) · [Changelog](CHANGELOG.md)

Authors: the Iia-arg team. License: MIT ([LICENSE](LICENSE)).
