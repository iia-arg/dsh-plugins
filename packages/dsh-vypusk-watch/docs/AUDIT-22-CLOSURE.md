# Аудит №22 — поимённое закрытие / audit closure

Исходный A-N-1948: **26 находок = 2 HIGH + 10 MED + 14 LOW**. Они были исправлены в прежнем кандидате Гаммы4caa0b2e и вошли в master31f63afb, пакет3.1.1. Tree пакета этих двух commit отдельно совпал. Версии3.1.2–3.1.6 добавили окна/consumer/стенды; новая3.1.7 сохраняет их и отдельно закрывает ручной вход без VYPUSK_REPO. Это не26новых исправлений, а перепроверка уже внесённых решений на текущей основе.

Original A-N-1948: **26 findings, 2 HIGH +10 MED +14 LOW**. The old candidate4caa0b2e package tree equals integrated31f63afb (3.1.1). Releases3.1.2–3.1.6 added windows/consumer/tests. Release3.1.7 preserves these fixes and separately refuses manual entry without VYPUSK_REPO. The table maps inherited fixes to current readers; it does not claim26new changes.

| № | Severity | Предмет / subject | Текущий читатель / current evidence |
|---|---|---|---|
| 1 | HIGH | Пустой список исключений / packaged exceptions | src/vypusk-okno-watch.exceptions.list; audit-runtime test_01; audit-docs documented env |
| 2 | HIGH | Полный образец env / complete env sample | docs/ARCHITECTURE.md; audit-docs test_documented_env_starts_actual_watcher |
| 3 | MED | INFO_KORNI — политика, не поиск / policy not discovery | README; SETTINGS; stend-neskolko-kopij |
| 4 | MED | PyYAML зависимость и именованный отказ / dependency and refusal | README; audit-runtime test_04; stend-derevo/prezhnih-imen imports |
| 5 | MED | Доверие git владельцу / safe.directory | README; TROUBLESHOOTING; audit-docs test_contracts |
| 6 | MED | Причина ошибок git / git error cause | audit-runtime test_06_git_tag_error_reason_reaches_blindness и test_06_git_archive_error_reason_reaches_blindness |
| 7 | MED | Умолчание stand-pochinki и слепота / stand target preflight | test/stend-pochinki.py; SETTINGS/GUARDS; stend-pochinki.sh |
| 8 | MED | Канонический target ссылки / canonical link target | audit-runtime test_08_expected_link_target_is_canonicalized |
| 9 | MED | Настоящий путь state / actual state default | SETTINGS /var/lib/vypusk-okno-watch/poslednyaya.txt; audit-docs test_contracts |
| 10 | MED | Актуальный перечень стендов / test inventory | ARCHITECTURE/GUARDS; audit-docs test_contracts |
| 11 | MED | Много копий в mapping / multi-copy mapping | SETTINGS ключ=путь1:путь2; stend-sootvetstviya.sh |
| 12 | MED | Договор соседей и alert / neighbor contracts | README dsh-trevogi/dsh-montazh/HTML; audit-docs test_contracts |
| 13 | LOW | Переносимый npm test / portable test reference | README VYPUSK_TEST_REFERENCE; audit-docs test_contracts; stend-kopij-vypuska |
| 14 | LOW | Будущая отметка не глушит / future stamp | audit-runtime test_14_future_timestamp_does_not_suppress_new_alert |
| 15 | LOW | Повреждённое время / malformed stamp | audit-runtime test_15_malformed_timestamp_is_not_shell_arithmetic, test_15_decimal_timestamp_with_leading_zero_is_not_octal, test_15_overflowing_timestamp_does_not_wrap_and_suppress |
| 16 | LOW | Пробелы в имени / spaced file names | audit-runtime test_16_changed_spaced_filename_is_reported_whole |
| 17 | LOW | Нечитаемое — слепота / unreadable file | audit-runtime test_17_unreadable_live_file_is_blind_not_a_checksum_difference, test_17_readable_filename_is_not_a_blindness_marker |
| 18 | LOW | Повтор mapping key / duplicate mapping | audit-runtime test_18_duplicate_mapping_key_is_refused, test_18_duplicate_unmatched_mapping_key_is_early_blindness, test_18_alias_mapping_cannot_hide_first_copy, test_18_empty_mapping_key_is_blindness_without_shell_error |
| 19 | LOW | Любая глубина node_modules / nested dependencies | audit-runtime test_19_nested_node_modules_are_outside_checksum_scope |
| 20 | LOW | plugins должен быть каталогом / directory check | audit-runtime test_20_plugins_regular_file_is_not_an_agent_root |
| 21 | LOW | Lateblindness при mismatch — журнал / mixed outcome boundary | GUARDS/TROUBLESHOOTING только в журнале; audit-docs test_contracts |
| 22 | LOW | Минимальный Python / minimum Python | README Python≥3.9; audit-docs test_contracts; фактические прогоны Python3.12 |
| 23 | LOW | pustoj без позиционного довода / default subject | stend-pustoj-zapisi.sh; source copy-compare block |
| 24 | LOW | Former names, раскладка и sections / docs details | ARCHITECTURE dsh.prezhnie_imena/LICENSE/docs/test/plugins/services; audit-docs; stend-prezhnih-imen/raskladki/derevo |
| 25 | LOW | Многострочный EnvironmentFile / multiline values | ARCHITECTURE env example; audit-docs sample execution; actual systemd255 load_env_file: complete sample and multiline values |
| 26 | LOW | Безопасное имя пакета / safe package name | audit-runtime test_26_package_name_cannot_escape_the_copy_root |

Дополнение27 (не входило в исходные26): отсутствующий/пустой VYPUSK_REPO → отказ3 до окна/канала/state, обычный и --avto-montazh; audit-runtime test_27, четыре подслучая, снятие earlyguard→red→возврат. Указанный, но неверный repo и остальные отсутствующие обязательные настройки остаются слепотой2, а не молчанием.

Additional27 (outside the original26): missing/empty VYPUSK_REPO refuses3 before helper/channel/state in ordinary and --avto-montazh runs. test_27 has four subcases and an early-guard removal/restore cycle. An explicit invalid repo or other missing mandatory settings remain blindness2.

Границы: документационные варианты №3/5/9/11/12/13/21/22/24/25 не расширяют механизм; точность реального значения конфигурации, все возможные имена секретов, живойunit/канал и полнота боевой области этими пробами не доказаны. Минимальная версияPython3.9 заявлена, заново исполнялась3.12. Реальный parser systemd255 load_env_file дополнительно перечитал полный пример и многострочные значения; менеджер служб не запускался.

Boundaries: documentary remedies do not broaden enforcement. These tests do not prove real configuration values, live units/channel or production coverage. Python3.9 is documented; current execution uses3.12. The actual systemd255 load_env_file parser additionally checked the complete sample and multiline values without starting a service manager.
