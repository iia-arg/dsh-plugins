# Проверки части Б на назначенном MAIN

Машина sadik, рука Гамма/coders. Source pin46060c3efc19a3e5cb740415cdfb601d126c29fd назначен прямым письмом Забавы19:55:55Z; ожидание source-lock Альфы снято. Все результаты относятся к собственным fixture, не установленной машине. Runtime выполняется Unix master с пустым HOME, root только для владельцев собственных каталогов и reader-child; живой агент Мастер не привлекался.

| Набор | Результат | Лог в каталоге evidence работы |
|---|---|---|
| Штатный MAIN |33/33,rc0|MAIN-FINAL-UPSTREAM.log|
| CLI/runtime Б |30/30,rc0|MAIN-FINAL-SADIK.log|
| UID/права |2/2,rc0|MAIN-FINAL-UID.log|
| Full-map callback |2/2,rc0|MAIN-FINAL-FULLMAP.log|

Полный каталог работы: /opt/coders/gamma/workspace/DSH-AUTOPILOT-B-20261014. Момент/исполняемыйstage/AP/helper/manifest/guard SHA, test/log SHA и exitcodes — evidence/MAIN-FINAL-SUITES.json. Команды исполнены автором, не выданы за формальные ворота Вениамина.

## Команды и адаптация фикстуры

Фактический runner штатного33 и Б30: sudo -u master env HOME=<свойstage>/home AUTOPILOT_TEST_SKILL=<свойstage>/release/skill PYTHONDONTWRITEBYTECODE=1 python3 -B <свойstage>/test_ap.py либо test_sadik.py. В исходном test_ap.py изменена только фикстура: physicalSKILL из env, копирование ap_sadik рядом с AP, privateA0700/publicagentSGID2750, устойчивый operatorPID, отдельный publicRoot, захватstderr. Assertions и тестовые тела33 сохранены.

UID: sudo env AUTOPILOT_TEST_SKILL=<stage>/release/skill python3 -B <package>/test/test_privileged.py. Здесь root создаёт только свои temporary ownership и reader-child, AP выполняется как master. Pure callback: AUTOPILOT_TEST_UPSTREAM=<точныйGitcheckout460> python3 -B <package>/test/test_part_b_layout.py отcoders.

Структурная сверка AP: все функции MAIN сохранены; cmd_commits AST совпадает с upstream, top-level statefreshkeys не потеряны. Guard А добавлен послеoverlay; испытанный AP побайтно равен guard+newline+overlay. Сырой источник не исполнялся установщиком; собственная сборка через настоящий overlay возвращает полный map, изменяет только8skillpaths, raw/lock не трогает. Заявленные исключения исторического bytecode принадлежат А; код Б не подменяет проверку всего архива.

## Различающие пробы

- commits: на прежнем Б вызов отвергался (MAIN-COMMITS-RED.log). На MAIN healthy donecommit — без замечаний; новый orphanHEAD собственного gitfixture убирает его из ancestry (разныеSHA, branchmarker и merge-base1) — появляется «! таск01 ... нет в истории»; возврат истории — снова зелёный. Upstreamrc0 диагностики не выдан за отсутствие проблемы, ticket/history не сбрасываются автоматически.
- Operator: повреждение/null/удаление owner при ledger — отказ без новых данных; исходные байты возвращены — событие0. Старыйmtime не освобождает liveowner. Отдельный настоящий worker убит; новый забирает проект только после доказанного окончания.
- Pin: SKILL.md получает маркер (count/SHA) — resume2, ledger прежний; возврат байтов — resume0. Смена current на иной AP оставляет старый физический release.
- Экспорт: symlink/FIFO — предупреждение с сохранённым учётом, publicpair прежняя; возврат — новаяpublicrev. ПотеряSGID имеет mode0750 как факт, warning с2750 и сохранением privatewaiting; возврат2750 — публикация. Временный файл наблюдается до настоящего rename:0640 даже при callerumask077. Реальный зависший worker отменяется до5секунд, следующий обычный event снова публикует.
- NonmemberUID: publicroot2751root:reader/operator2750master:reader, GID65534 отсутствует в группах master, readerUID65534/GID65534 действительно читает984байта, codersUID1003 PermissionError. Иная проба начинает с чужого owner и после его возврата снова публикует. Реальных групп/ACL/NSS не меняли.
- MED-1: семь отдельных ответов-приманок остаются в privateledger, но заменяются целиком вpublicstate иHTML; секретоподобныйtitle скрыт и вindex. Одна доказанная вставка раннегоreturn в настоящем filter новогоизолированногоrelease раскрывает каждыйответ; возвратSHA исходногоhelper снова скрывает. Неизвестные поля/типы не публикуются, произвольное дополнение privateHTML не копируется.
- Callback: здоровыйfullmap сохраняетвнешнийREADME/raw/lock; неправильныебайтыбазовогоAP(маркер/count/SHA) отвергаются поexpectedSHA; возврат исходногоmap вновь даёт тотже результат. Ранее skill-relativecallback проваливал контрактfullmap, этотRED не выдан за проверку installercaller.

## Именованная область

| Набор | Имя теста |
|---|---|
| CLI/runtime | `test_events_wait_answer_finish_and_pair` |
| CLI/runtime | `test_unknown_and_traversal_refuse_before_state_write` |
| CLI/runtime | `test_export_failure_does_not_drop_event_and_recovers` |
| CLI/runtime | `test_two_projects_same_slug_have_different_urls` |
| CLI/runtime | `test_second_operator_refuses_without_touching_files` |
| CLI/runtime | `test_direct_global_entry_creates_project_only_after_validation` |
| CLI/runtime | `test_empty_or_invalid_owner_record_refuses_and_recovers` |
| CLI/runtime | `test_age_does_not_release_live_operator` |
| CLI/runtime | `test_pinned_release_corruption_refuses_then_recovers` |
| CLI/runtime | `test_fifo_in_export_is_refused_without_hanging_and_recovers` |
| CLI/runtime | `test_export_child_timeout_is_bounded_and_accounting_survives` |
| CLI/runtime | `test_public_root_symlink_cannot_escape` |
| CLI/runtime | `test_parallel_projects_keep_both_agent_index_entries` |
| CLI/runtime | `test_dead_operator_can_resume_but_live_operator_cannot_be_stolen` |
| CLI/runtime | `test_device_is_refused_before_read` |
| CLI/runtime | `test_init_run_directory_symlink_is_refused` |
| CLI/runtime | `test_null_owner_is_not_missing_owner` |
| CLI/runtime | `test_slug_boundary_is_resumable_and_overflow_refused` |
| CLI/runtime | `test_failed_init_does_not_switch_pin` |
| CLI/runtime | `test_bad_snapshot_keeps_accounting_and_old_export` |
| CLI/runtime | `test_http_view_wait_answer_finish_and_server_restart` |
| CLI/runtime | `test_public_whitelist_blocks_unknown_fields_at_every_level` |
| CLI/runtime | `test_secret_filter_executor_answer_damage_and_return` |
| CLI/runtime | `test_force_init_failure_preserves_previous_live_ledger` |
| CLI/runtime | `test_missing_owner_refuses_second_operator_and_restores` |
| CLI/runtime | `test_export_reader_permissions_survive_restrictive_umask` |
| CLI/runtime | `test_temp_file_has_reader_mode_before_atomic_rename` |
| CLI/runtime | `test_lost_sgid_refuses_export_and_recovers` |
| CLI/runtime | `test_resume_uses_pinned_release_after_current_switch` |
| CLI/runtime | `test_commits_history_damage_and_return` |
| штатный MAIN | `test_init_creates_run` |
| штатный MAIN | `test_init_refuses_on_live_run` |
| штатный MAIN | `test_init_archives_finished_run` |
| штатный MAIN | `test_opening_a_stage_closes_the_previous` |
| штатный MAIN | `test_review_closes_build` |
| штатный MAIN | `test_passed_stage_with_artifact_is_marked_done` |
| штатный MAIN | `test_skip_needs_a_reason` |
| штатный MAIN | `test_tickets_publish_and_move_rows_in_ticket` |
| штатный MAIN | `test_check_plan_passes_a_sound_plan` |
| штатный MAIN | `test_check_plan_catches_defects` |
| штатный MAIN | `test_check_plan_catches_a_requirement_in_no_ticket` |
| штатный MAIN | `test_done_closes_rows_only_when_all_their_tickets_are_done` |
| штатный MAIN | `test_ticket_lifecycle_counters` |
| штатный MAIN | `test_unknown_ticket_is_an_error` |
| штатный MAIN | `test_escaped_pipe_in_a_quote` |
| штатный MAIN | `test_d_rows_are_constraints_not_requirements` |
| штатный MAIN | `test_dependencies_accept_a_t_prefix` |
| штатный MAIN | `test_empty_tickets_dir_does_not_pass_the_plan` |
| штатный MAIN | `test_add_set_and_numbers` |
| штатный MAIN | `test_every_event_leaves_a_beat` |
| штатный MAIN | `test_waiting_for_the_user_is_kept_apart_from_work` |
| штатный MAIN | `test_moving_on_closes_a_forgotten_wait` |
| штатный MAIN | `test_ask_needs_a_known_kind` |
| штатный MAIN | `test_log_records_events_not_syncs` |
| штатный MAIN | `test_gates_follow_the_events_that_decide_them` |
| штатный MAIN | `test_requirements_carry_the_users_words` |
| штатный MAIN | `test_every_write_bumps_rev` |
| штатный MAIN | `test_finish_lands_the_run` |
| штатный MAIN | `test_reopen_puts_wip_back` |
| штатный MAIN | `test_commits_flags_a_done_ticket_whose_commit_left_history` |
| штатный MAIN | `test_is_ours` |
| штатный MAIN | `test_version` |
| штатный MAIN | `test_skill_declares_a_version` |
| UID/права | `test_nonmember_operator_exports_reader_group_under_umask_077` |
| UID/права | `test_foreign_uid_directory_refuses_and_permission_recovery` |
| чистый callback | `test_complete_map_and_raw_preservation` |
| чистый callback | `test_corrupt_base_rejected_and_original_returns` |

## Не проверено и не обещано

DOM — **непроверено, рука — Забава/общая приёмка**. Optional browser_probe исполняет Python/AP, не толькоDOM; без отдельного обзора/назначения не запускать, Мастеру и его private runtime/cache не обращаться. HTTP-переходы/перезапуск локальной fixture не выданы за браузерный или внешнийTLS/auth результат.

Новый installer/caller/credential/NSS/liveпочта не приняты этими тестами. Альфа названа владельцем caller; старые19installer относятся к иной композиции и не переносятся на эту. Сборка/монтаж/метки/реестр не выполнялись. Retention30суток только предложение, удаления нет.

Условие G4 от20:39:21Z реализовано в ap_sadik: проверка счётчиков до записи, согласование сохранённого состояния и проекции. `test_g4.py` отдельно проверяет CLI и настоящую fallback-строку закреплённого шаблона через Node; это не браузерная DOM-проба. JSON Беты не содержит APblind/gates и не подключён к renderer. Строгая слепота/свежесть модели из accepted/commit или равенства счётчиков не выводится. G3 читается как state.gates, не rc0.

Граница sameUID/root остаётся: это не sandbox для враждебного кода того жеUID. Нет гарантии общей power-loss-транзакции ledger/index/pair, однойревизиидвухHTTPзапросов или hardrealtime на произвольномkernelI/O. Схема/JSONподсчёт не доказывает семантическую правду исполнителя.

## Дельта G4 (20:39:21Z)

Отдельные пять проб `test_g4.py`: неравные счётчики без mismatch; 11 отказов позиционного ввода с неизменностью ledger/public; reopen после положительной приёмки; шесть unknown/негодных состояний перед проекцией и sync; равные счётчики без/с mismatch/возврат. Полные имена собираются `load_tests` без повторения 30 базовых проб. Снятие правки — настоящий helper из af8a41c4 только в физической временной копии, grep -cF и SHA до/после; возврат точных байтов исправления.
