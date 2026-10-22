# Оконные читатели квитанции0.1.14

Писатель выпуска выдаёт schema4. Root validator читает строгие исторические schema2/3 и новую4; renderer показывает неизвестную версию отдельной строкой. Window judge требует4. Numeric v4 требует ownershipPolicy=session-interval, ownershipRuleVersion=int3, ownershipNotice; projector переносит только разрешённые поля. Legacy незарегистрированный RUN чисел не даёт.

phase=live означает продолжающийся сбор; windowEnd/endReason равны null. phase=final содержит доказанный конец AP_FINISH/AP_CANCEL/RUN_WINDOW_EXPIRED/RUN_HARD_CEILING, не помечается как устаревший live-снимок. Final/observed требует pending=0 и asOf>=windowEnd. Final/incomplete сохраняет доказанную часть; finite numeric reasons: CHILD_INCOMPLETE, CHILD_VERSION_WITNESS_UNAVAILABLE, FINAL_TURN_INCOMPLETE. Остальные missing rows имеют шесть null.

operatorActions показывает EXPIRED_EXECUTION_ABANDONED с jobId/participant/at/sourceSHA256; explanation остаётся private. MIXED_RUN_TURN может назвать relatedRunId первого RUN; UID/session IDs/whole-turn identity публично не переносятся. Закрытый первый final не меняется.

judge-receipt.py сравнивает с независимым prepared/native reference; арифметика collector сама по себе не oracle. check-format.py проверяет настоящий шаблон. probe-receipt.py меняет копию с доказательством порчи и точным возвратом. Эти читатели не устанавливают выпуск и не открывают окно. Старые листы0.1.12 остаются историческими.
