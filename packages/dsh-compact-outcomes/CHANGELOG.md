# История изменений dsh-compact-outcomes

## 3.1.3 — 14.10.2026 · подготовка к публикации: оформление

- номер версии в README приведён к выпуску.
- Код пакета не менялся.

## 3.1.2 — Мастер: новый Codex-агент в списках кодеров (13.10.2026, наряд Забавы; Искра)

plugin/agents.json — master в shlyuzy_bez_datchika; codex-compaction-vyborka.conf — ExecStartPre для coder-gateway-master. Рецепт — правки Анны B-N-1837. Только список имён, логика не менялась.

## 3.1.1 — выпуск по облачному аудиту №10 (A-N-1948, Д2): №23 (Заря)

- №23 LOW `systemd/dsh-compact-outcomes.service.d/agent-alert.conf` dddc6ef1 → fbc68af8 (+3/−1): `ReadWritePaths=-/var/log/agent-alert/poslednie.log` —
  нет файла на старте (свежая машина, ротация) — служба всё равно поднимается.

## 1.2.2 — выборка сжатий Codex для шлюза Анны (B-N-1837, кандидаты Авроры)

- `systemd/dsh-compact-outcomes.service.d/codex-compaction-vyborka.conf` d64bd5d4 → 6289fed4 (+2/−0): ExecStartPre выборки для `anna coder-gateway-anna.service`.
- `plugin/agents.json` 97ece1ab → 136da4d8 (+5/−0): запись `anna` (юнит coder-gateway-anna.service, файл /var/lib/codex-compaction-sobytiya/anna.jsonl).

## 1.2.1 — пачка README 07.10.2026: пометка «не к публикации» (agents.json); код не менялся

## 1.2.0 — первый выпуск в дереве: перенос с боя sadik, код не менялся; прежний номер 0.2.0 (README плагина) → 1.2.0 по схеме 04.10 (первая цифра +1)

Основа — каталог `/opt/coders/alfa/plugins/dsh-compact-outcomes/` (11 файлов, автор — Альфа; сам плагин называет себя
0.2.0, кандидат A-N-675) и юниты /etc/systemd/system `6740db2` (07.10.2026; план Зари «служебный софт в дерево» b9822ac4,
r2 §9; решение координатора о разрезе: служба, таймер и оба drop-in — здесь). Одним окном с dsh-podpiski 1.0.1.
