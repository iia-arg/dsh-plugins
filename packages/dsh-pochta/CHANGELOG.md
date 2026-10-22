# История изменений dsh-pochta

## 3.1.6 — 14.10.2026 · команда Мастера: +5 ledger в охвате receipt-watch (наряд Забавы 14.10 20:35:04Z; Искра)

- `systemd/receipt-watch.service.d/ohvat.conf`: RECEIPT_LEDGER_PATHS + `/opt/{vintik,shpuntik,gayka,shurup,sova,tumbler}/workspace/.message-receipts/receipts.sqlite` — 18 путей. README: число путей. `mail-stop-hold` не тронут (почтового стопа у команды нет). · Master team: five ledger paths added (17 total); README counts; mail-stop-hold untouched.
- ⚠️ Ставить ПОСЛЕ появления всех пяти ledger: отсутствующий — СЛЕПОТА, код 2, `receipt-watch-failed` тревожит каждый час. · Install only after all five ledgers exist: a missing one is blindness (exit 2) and an hourly alarm.

## 3.1.5 — 14.10.2026 · документация: актуальные номера

- README/доки: номера приведены к выпуску (Аврора, ветка nomera-v-dokah, fd070a17); номер пакета +1.
- Код пакета не менялся.

## 3.1.4 — 14.10.2026 · receipt-watch: Documentation → README пакета (источник в общем дереве)

- `receipt-watch.service`: `Documentation` переведён с рабочего каталога Беты на README `dsh-pochta` в общем дереве. Код, таймер и три drop-in уже есть в пакете и не менялись.
- README называет действующий охват 12 ledger и внешний источник `receipt-watch-failed.service` в `dsh-kopiya-mashiny`; нового пакета и второго владельца боевых файлов не создаётся.

## 3.1.3 — 14.10.2026 · B-N-2021: v2 принимает дефис в учётке отправителя; подготовка к публикации · release prep

- `libexec/a2a-v2.py put`: вместо запрета дефиса проверяется полная грамматика учётки почтальона `[a-z_][a-z0-9_-]*`. Недопустимый символ даёт отказ до `mkstemp`; допустимое имя целиком входит в имя v2-файла. Схема v2 и проверка recipient/ledger не менялись.
- `test/stend-v2-agent-name.py` проверяет реальный put на частном spool; `test/stend-chain-agent-name.py` — put → реальный перенос UID/inode почтальоном → sender/конверт в receipt. Последний требует root только для прав временных файлов, account lookup и канал уведомления подставные.
- Монтаж — совместно с dsh-telegram-multiagent 3.1.7 и новой S6/S7 пробой имени v2 в обходе. `test/` не монтировать как боевой код; добавить `test/` в `derevo.not_installed` записи пакета при учёте выпуска. Номер при сведении — рука координатора.
- v2 accepts complete hyphenated account names under the postman's grammar; malformed names fail before any temporary write. The protocol and ledger checks stay strict.
- README: строка «Версия · Version: 3.1.3» под заголовком. · README: version line under the heading.

## 3.1.2 — Мастер: новый Codex-агент в списках кодеров (13.10.2026, наряд Забавы; Искра)

mail-stop-hold — GW master → coder-gateway-master; receipt-watch ohvat.conf — ledger /opt/master/workspace/.message-receipts/receipts.sqlite. Рецепт — правки Анны B-N-1837. Только список имён, логика не менялась.

## 3.1.1 — выпуск по облачному аудиту №4 (A-N-1948, Д3): код Искры — №14, 15, 17 и находка Авроры; доки — Аврора

- №14 LOW `bin/tell-komu` 480944b4 → 680bc9ca (+11/−9): `--help`/`-h` и пустой вызов разбираются до выбора щели и чтения перечня —
  справка (код 3) печатается и без годного /etc/a2a/tell-shcheli.list; письмо при негодном перечне — по-прежнему отказ.
- №15 LOW `sbin/zastryalo-v-shcheli` 0295da31 → eadfa92d (+3/−1): строка «за сутки» — «положено через tell-komu N · в щели сейчас M»
  без разности «забрано»: в щель кладут и мимо зеркала (zabava-tell), разность выходила отрицательной.
- №17 LOW `bin/zabava-v2-pismo` 1bcb2d0b → eeedf1c8 (+3/−1): IndexError/AttributeError в перечне run(), как в main() a2a-v2.py —
  битый ответ приёмника даёт «ОТКАЗ zabava-v2-pismo», код 3, а не трассировку с кодом 1.
- Находка Авроры (слово Забавы) `sbin/mail-stop-hold` 3f9cdaa6 → 17e6724a (+9/−4): нет исполняемого (hod-sluzhby, systemctl, ps) —
  «ОТКАЗ: <исполняемое> не исполнился» и код 2 до записи, а не трассировка с кодом 1; помощник vyzov() на все четыре вызова.
- Доки (Аврора): README по коду — зависимости с пакетами-источниками, коды и настройки; новый README.en.md.

## 1.0.5 — пределы памяти и времени root-сторожам, читающим дома агентов (A-N-1963 №11, Заря) · memory/time limits for root watchers reading agent homes

- Новые drop-in `systemd/<юнит>.service.d/70-predely.conf` (2):
  `a2a-owner-copy-watch`: пик 37.6 МБ → MemoryMax=160M, MemorySwapMax=0
  `receipt-watch`: пик 22 МБ → MemoryMax=128M, MemorySwapMax=0, TimeoutStartSec=60s
- Зачем: сторож от root читает файлы из домов агентов целиком; подменённый файл без пределов съедал память машины
  (MemoryMax=infinity) или вешал такт (нет таймаута). Предел памяти = max(128M, суточный пик×4); `MemorySwapMax=0` — без него
  сверх предела процесс уходит в своп и доживает (проба: 320M без MemorySwapMax — успех за 3,7 с вместо убийства).
  Время у Type=oneshot держит `TimeoutStartSec` (RuntimeMaxSec на oneshot не действует); добавлен только там, где его не было.
- Убит пределом → юнит failed (oom-kill / timeout); читатель — sadik-watch (is-failed по перечню storozha-sutochnye.txt).
- Монтаж: положить файлы, `systemctl daemon-reload`; перезапуск не нужен (oneshot по таймеру, следующий такт возьмёт пределы).
- New drop-ins cap memory (`MemoryMax`, `MemorySwapMax=0`) and, where missing, start time (`TimeoutStartSec`) of root watchers that read files from agent homes.

## 1.0.4 — zastryalo-v-shcheli: тревога слепоты уходит (B-N-1872б, Аврора)

- `sbin/zastryalo-v-shcheli` a0543e77 → 0295da31 (+21/−10): `ALERT` задаётся в начале (раньше — на :102, ниже всех вызовов `ne_dobyto`,
  и в слепоте шёл `${ALERT:-/nonexistent}`; на sadik `/nonexistent` существует — каталог); общая `slepota()`: строка, тревога (или прямо
  «тревога слепоты НЕ ушла / НЕ отправлена»), `exit 2` — через неё «щели нет / не читается» (:35–42, прежде тревоги не было вовсе) и `ne_dobyto`.
  Счёт по зеркалу — только внутри `if [ -d "$ZERKALO" ]` (прежде без зеркала `find` под pipefail давал код 1 и выход ДО проверки щели);
  считаются `*.md` и `*.txt` (`tell-komu` кладёт без расширения → `.txt`). Тревога «ЗАСТРЯЛО» и её текст не менялись.
- Пробы Авроры (стенд pochta/stend.sh a921a4c3, тревога — заглушка): щели нет / 0333 / зеркало 000 — основа 2 или 1 без тревоги, кандидат 2
  с тревогой; зеркала нет + письмо старше 5 мин — основа «ЗАСТРЯЛО» не видно, кандидат видно; .md+.txt — «положено 5» вместо 2; возврат 0.
- Чего не ловит: смерть таймера; слепоту, при которой упал сам `agent-alert` (строка «НЕ ушла» — только в журнал юнита, читателя нет);
  `zastryalo-v-shcheli@varvara` — другой код (`zastryalo-varvara`), правкой не задет. У юнитов `OnFailure` пуст.

## 1.0.3 — Анна в карте шлюзов mail-stop-hold (B-N-1837, кандидат Авроры; ворота Вениамина)

- `sbin/mail-stop-hold` a08342e1 → 3f9cdaa6 (+1/−1): `'anna': 'coder-gateway-anna'` в GW (проверка «шлюз сменился» для снятия HOLD).
- `systemd/receipt-watch.service.d/ohvat.conf` 05381abd → 155382c2 (+1/−1): ledger Анны `/opt/anna/workspace/.message-receipts/receipts.sqlite`
  в RECEIPT_LEDGER_PATHS (кандидат Авроры «следом»).

## 1.0.2 — пачка README 07.10.2026: строка временного правила; пометка строчной формулой; код не менялся

## 1.0.1 — добавлены drop-in receipt-watch.service.d/ohvat.conf и onfailure.conf (в 1.0.0 пропущены: план отбирал drop-in по ссылке на /usr/local); код не менялся

## 1.0.0 — первый выпуск: перенос с боя sadik, код не менялся

Основа — учёт /usr/local `418b194` (файлы пакета те же в `9131236`) и юниты /etc/systemd/system `6740db2` (07.10.2026;
план Зари «служебный софт в дерево» b9822ac4, r2 §2.6; слово владельца 07.10 15:32 МСК). 11 файлов, 10 файлов юнитов и drop-in.
