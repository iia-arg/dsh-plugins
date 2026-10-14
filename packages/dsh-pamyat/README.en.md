# dsh-pamyat · agent memory set (English page)

**Version:** 3.1.4

The main documentation of this package is **bilingual** and lives in [README.md](README.md): every paragraph there is given in Russian and then in English. This page exists because the package's stand checks that *both* `README.md` and `README.en.md` name exactly the members and versions declared in `sostav.json` — a lone English page used to fall seven versions behind unnoticed.

**One name for nine agent-memory packages that were built and verified together — at exact versions, with a checksum for each.**

    dsh-pamyat-core        3.1.2             store, decision journal, write policy
    dsh-pamyat-omega       3.1.2             long-term memory over MCP with delivery confirmation
    dsh-pamyat-secretary   3.1.2             compaction summaries → memory records
    dsh-pamyat-byudzhet    3.1.2             incoming budget: what to lift into context
    dsh-pamyat-nudzh       3.1.2             spend accounting: is it time to compact
    dsh-pamyat-restore     3.1.2             knowledge restore after compaction and briefing
    dsh-pamyat-storozha    3.1.3             memory watchdog: fill stages, compaction notice
    dsh-pamyat-kompakt-dsh 3.1.2             own summary inside the platform compaction
    dsh-pamyat-kompakt     3.1.2             window count and summary by own model (installed as a directory)

```bash
STEND_POLKA=<archive-shelf> STEND_PLAGINY=<plugins-dir> npm test   # expected: "итог: 11 из 11" (total: 11 of 11), exit code 0; unset variables — exit 2
```

Further reading: [README.md](README.md) · [Architecture](docs/ARCHITECTURE.md) · [Settings](docs/SETTINGS.md) · [Guards](docs/GUARDS.md) · [Troubleshooting](docs/TROUBLESHOOTING.md) · [Changelog](CHANGELOG.md)

Authors: the Iia-arg team. License: MIT ([LICENSE](LICENSE)).
