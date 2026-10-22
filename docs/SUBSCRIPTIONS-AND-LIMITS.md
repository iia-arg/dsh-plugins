# Subscriptions and limits: two local service packages

> Current package versions as of 2026-10-22: [package catalogue](PACKAGES.md). Dated version numbers and results below refer to the measurements stated in the text.

These services are distributed as source. Their configuration examples describe sadik; deployment on another host requires its own accounts, credentials, registry and service settings.

| Package | Version | Responsibility | Documentation |
|---|---|---|---|
| dsh-podpiski | 3.1.6 | Subscription switching, token ACLs, Codex refresh/watchers and six owner commands | [RU](../packages/dsh-podpiski/README.md) · [EN](../packages/dsh-podpiski/README.en.md) |
| dsh-limity | 3.1.8 | Quota/balance snapshots, database and output, alerts and shared-Claude target selection | [RU](../packages/dsh-limity/README.md) · [EN](../packages/dsh-limity/README.en.md) |

Gateways write usage into the intake directory. The Claude SDK collector runs under a measurement account; a separate DeepSeek service obtains balance. dsh-limity validates ownership and subscription binding, writes SQLite and limity.json. The quota reader in dsh-podpiski applies the /etc/default rule; switchers act after their own checks. Codex quota state comes from codex-limit-watch without a model request.

Unmeasured values are null/unknown, never zero. snyato_unix records measurement time; vydano_unix records output generation. Fresh output does not freshen an older measurement. Quota selection does not reserve capacity against another client.

Installation needs the full library/script manifest, registry data, separate logins, ACLs, SDK, units and callers. The package READMEs list paths, codes and activation gates. Keep svesti-dostup-watch disabled until phase2 of B-N-1621 (“ПЕРЕШЛО”). The configuration test with --zhivaya-mashina changes system accounts; it is not an ordinary documentation check.
