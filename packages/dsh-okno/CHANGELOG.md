# История изменений dsh-okno

## 3.1.6 — 14.10.2026 · команда Мастера: +4 кодера и sova в перечнях окна SDK (наряд Забавы 14.10 20:35:04Z; Искра)

- `dopusk-sh5.sh`: `coder-gateway-vintik|shpuntik|gayka|shurup|tumbler` в перечне кодеров (порог T2), `sova` — в перечне своих Claude-шлюзов (порог T1, как spartak; решение Искры по образцу). `priznak-zagruzki.sh`: `sova` в `claude-oauth-gateway@{…}`, четверо в `coder-gateway-{…}` — 16 юнитов. README: число юнитов. Логика не менялась. · Master team: four coder gateways in dopusk-sh5; sova and the four in priznak-zagruzki (16 units); README counts; logic unchanged.
- Пока юнитов нет, оба прибора называют их СЛЕПОТОЙ: допуск к Ш5 — НЕТ (код 1), признак загрузки — код 2. · Until the units exist both tools report them as blind: Sh5 admission NO (exit 1), load sign exit 2.

## 3.1.5 — 14.10.2026 · priznak-zagruzki: признак окна SDK по загрузке — в дерево (Заря; ворота Вениамина 16:46Z)

- `libexec/sdk-okno/priznak-zagruzki.sh` b854cbdd — новый файл, перенос из боя в дерево (смонтирован 14.10 17:09Z мимо дерева,
  коммит учёта `/usr/local` 3fc4087): что ТЕКУЩИЙ процесс каждого из 11 шлюзов взял из слоя SDK (строка «SDK … взят из слоя»).
  Коды 0 / 1 (старая) / 2 (слепота: журнал не прочитан или пуст, нет MainPID; не root; неверный вызов). README — строки в обе таблицы.
- `libexec/sdk-okno/priznak-zagruzki.sh` b854cbdd — a new file moved from production into the tree: what the CURRENT process of
  each of the 11 gateways loaded from the SDK layer. Exit 0 / 1 (old) / 2 (blindness, not root, invalid call). Other files unchanged.

## 3.1.4 — 14.10.2026 · dopusk-sh5: граница «НЕ ловит» (Заря; ворота Вениамина 14:32Z)

- `libexec/sdk-okno/dopusk-sh5.sh`: в шапку две строки «НЕ ловит» — процесс, поднятый вовремя, но загрузивший SDK до смены ссылки (живой случай SDK-окна 14.10: master). Код не менялся.
- `dopusk-sh5.sh`: the header now names what it does not catch — a process restarted in time that loaded the SDK before the link swap. No code change.

## 3.1.3 — 14.10.2026 · подготовка к публикации: оформление

- номер версии в README приведён к выпуску.
- Код пакета не менялся.

## 3.1.2 — Мастер: новый Codex-агент в списках кодеров (13.10.2026, наряд Забавы; Искра)

sdk-okno/dopusk-sh5.sh — coder-gateway-master в переборе шлюзов. Рецепт — правки Анны B-N-1837. Только список имён, логика не менялась.

## 3.1.1 — опись слоя без молчаливых пропусков, perepak-okna без трасс (A-N-1948 №5: №28 №29 LOW; Заря) · рабочий номер 1.0.3 сведён в единый номер выпуска 3.1.1 (слово владельца 10.10.2026 01:38 МСК)

- `libexec/sdk-okno/opis-sloya.py` 93c2bf5d → ef627f2d (+7/−1) — №28: FIFO, сокет, устройство — строка третьего вида
  `<путь> o <fifo|sock|chr|blk> <режим>`, входят в опись и её сумму. Слой без таких объектов — опись побайтно прежняя (проба:
  f163d0ec и 1b6f358c у основы и кандидата). Было: пропуск молча, код 0.
- `sbin/perepak-okna` 70717e0b → d69ef7bc (+13/−1) — №29: реестр не прочитан / не разобран / без списка `agenty` / у агента dsh
  нет `namerenie.sluzhba` — отказ вызова, код 2, ДО systemctl. Было: трасса FileNotFoundError / TypeError, код 1.
- Дельта-3 (сверка доков Авроры, ошибка Зари): `sbin/perepak-okna` d69ef7bc → 0e1f8292: реестр проверяется ЦЕЛИКОМ до первого
  `systemctl show` — прежде проверка шла в том же цикле, и при порченом агенте не первым `systemctl` для предыдущих уже звался
  («ДО systemctl» было неверно). Проба (заглушка systemctl, 2 агента, второй без sluzhba): основа d69ef7bc — вызовов 1, код 2;
  кандидат — 0, код 2; исправное — 2 вызова, код 1 у обеих.

## 1.0.2 — Анна в разовом допуске Ш5 (B-N-1837, кандидат Авроры)

- `libexec/sdk-okno/dopusk-sh5.sh` 331cec2c → 918c50a2 (+1/−1): `coder-gateway-anna` в переборе шлюзов кодеров. До подъёма шлюза Анны допуск —
  «НЕТ» (1 из 9); основа — «ДА» 8 из 8.

## 1.0.1 — пачка README 07.10.2026: строка временного правила; пометка строчной формулой; код не менялся

## 1.0.0 — первый выпуск: перенос с боя sadik, код не менялся

Основа — учёт /usr/local `418b194` (файлы пакета те же в `9131236`) (07.10.2026; план Зари «служебный софт в дерево»
b9822ac4, r2 §2.10; слово владельца 07.10 15:32 МСК). 5 файлов, юнитов нет.
