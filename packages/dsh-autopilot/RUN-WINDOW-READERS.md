# Читатели конца RUN в 0.1.14

Машина sadik; исходное основание Beta77377a02, код Альфы ab3dd51d плюс данная дельта fullclock. Перечень получен rg по всему packages/dsh-autopilot (runtime, lib, tools, overlay, window, tests); номера строк — навигация, имена функций определяют стык.

| Читатель / место | Источник конца | AP_CANCEL / H,K |
|---|---|---|
| runtime/runtime_receipt_source.py prepare | resolve_run_end с canonical deliveries из общего Postman snapshot, Root registeredAt и verified authenticated_events, explicit now | cancel видит; FULLCLOCK, допускается для live/final |
| runtime/runtime_receipt_source.py root_ownership_runs, OPEN prepass | resolve_run_end с canonical deliveries; пока без полного acceptedEvents | cancel видит; AP-only конец для построения ownership scopes, null НЕ доказательство отсутствия H/K; окончательное решение только prepare fullclock |
| та же root_ownership_runs, исторический CLOSED без sealed final | сначала resolve_run_end(deliveries={},closed=True), затем доступная canonical почта | только сохранённый CLOSED pin; НОВЫЙ cancel не видит по построению. Исторический CLOSED не пересчитывается |
| та же root_ownership_runs, CLOSED со seal | _read_seal, frozen context.end | конец неизменен; новое чтение cancel не нужно |
| runtime/usage_registration.py run_window | legacy string projection, existing Root pin либо resolve_run_end(deliveries={}) | СВЕЖИЙ cancel не видит; H/K не видит. В продуктовой цепочке prepare больше НЕ вызывается. Оставлен совместимый ограниченный API |
| runtime/runtime_receipt_source.py advance_finalizations | существующий prepared master proof.runContext + prepared.resolvedEnds/resolutionCut; при отказе — ранее сохранённые meta.end/binding | нового AP-only вызова НЕТ; без полного/ранее доказанного контекста RUN_OWNERSHIP_CONTEXT_UNAVAILABLE |
| finalize_run / recover_finalizations / closed_publication_debts | frozen private final-context и Root pointer | никакого повторного вычисления CLOSED и второго Postman/G/raw сканирования |
| test/_ownership_root.py | прямые пробы resolve_run_end через штатный owner/root namespace; legacy run_window в новой prepare-пробе принудительно отказывает | canonical cancel до finish, H/K, конфликт и сохранность CLOSED проверены |

Других прямых вызовов run_window в runtime/lib/tools/overlay/window нет. tools/collect-team-usage.py и tools/supply-team-usage-index.py загружают runtime_receipt_source: читателями старой проекции самостоятельно не являются. HTML renderer/public_receipt читают уже вычисленные phase/windowEnd/endReason, resolver не вызывают.

Частный final context/meta данной НЕ монтированной ветки переведён с schema1 на schema2: binding содержит Root REGISTERED (clock и canonical SHA), RUN/projectRef, resolver cut, отпечатки того же Postman/events, rootPhases, минимальные canonical taskProofs (job/recipient/taskSHA/deadline) и typed end. Это не публичная версия и не отдельный outbox. Публичная schema4 сохраняется. Существующие исторические CLOSED schema2/3 без runtimeFinalization не мигрируют и не пересчитываются.

Замок индекса и Root-owned proof обеспечивают происхождение binding. Хеши не являются независимым сертификатом и не принимаются из операторского state: producer — только полный root prepare. Ошибка подготовки не заменяется выдуманным пустым events[].

В drain сохраняются ранее доказанные taskProofs, чтобы временная потеря Postman не делала valid EXPIRED_EXECUTION_ABANDONED непроверяемым навсегда. Поздний marker для задачи вне сохранённого snapshot не принимается. Размер canonical record проверяется до atomic против262144байт с резервом64-символьной finalGeneration; слишком большой контекст даёт FINAL_CONTEXT_TOO_LARGE до перезаписи прежнего record. Это именованный отказ, а не обещание вычислять неограниченные RUN.
