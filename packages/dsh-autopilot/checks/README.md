# Registry/key checks for Autopilot

Public layout-check runs as any reader, validates a pinned root-owned manifest, never reads /etc/dsh-autopilot. Its consolidated payload uses CORE snapshot 8dede2c2 (installer anchor LOW; healthy a12-b4-c2/pilot bc285e23 unchanged) and the separately accepted checks/service/counter sources; metadata/current/bytes of immutable public files and directory ownership are checked. Master engine-home link is private to Master and checked by the operator plus agents coverage, not this nonroot reader.

Root key-check service/timer reads 0700 root:root key directory and 0600 single-link regular64lowerhex key. Every60s, service deadline10s. Nonroot key-health reads only systemd status; missing/older180s status is2, failed/inactive1. It never grants sudo, sends mail, prints key/hash, writes key or modifies VOW. On failure the dedicated unit is failed and named by registered health; VOW remains running. Start the accepted key-check service through systemd, then enable its timer; never execute the ExecStart file directly for a probe.

Read-only checks exclude model execution, mail pilot, private ledger/panels and nginx. Registry checks cover immutable bytes, not all secrets/lifecycle. No accepted A10 physical release is modified by these separate files.


The installer LOW refuses unless the literal master-role anchor occurs exactly once in the mail prefix. This protects anchor drift (zero/multiple matches), not arbitrary prefix semantics or malicious root changes. With one approved anchor, all runtime layout bytes remain unchanged.

---

# Сводный предмет: применение к плану v4

Этот документ — адресная дельта способа чтения архива, не команда монтажа сейчас. Монтаж выполняет Забава после ворот. Вместо прежних раздельных архивов А10 и checks используется один **полный source archive** сводной головы. Это 57 исходников: 42 точных файла CORE 8dede2c2 и 15 вспомогательных checks/razdacha/tools. Обычный npm pack из CORE содержит только CORE и не заменяет этот общий архив.

`AP_TGZ`/`AP_TGZ_SHA` — сводный архив/сумма из П7, `AP_ARCHIVE_STRIP=0`. `AP_PACKAGE_HEAD=8dede2c2219e63a4652f4d3bdce7a044a37e2013` означает точный CORE, лежащий на постоянной полке; HEAD всего сводного предмета указан отдельно в П7. Это не два источника установки: все 57 байтовых предметов читаются из одного проверенного архива; равенство его CORE зафиксированному CORE-снимку проверено. Runtime local_revision остаётся a12-b4-c2: его байты не переписаны ради сведения.

В шаге 2 v4 после проверки tar, `tar -xzf ... -C "$AP_PACKAGE_NEW"` и до chown/mv постоянной полки выполняется **один** блок ниже. `AP_SAVE` — уже созданная root:root0700 страховка окна. Во вновь распакованном package-new три указанных физических каталога обязательны; иной состав означает STOP. П7 текущих 133 payload-целей и manifest136rows из этой сдачи заменяют прежние списки А10/121/124; generated ключ/lock/NSS/enable-links по-прежнему имеют отдельные страховки. Не копировать все 57 файлов на управляемую полку42: публичный reader обязан отказать на лишние aux.

```bash
# BEGIN-CONSOLIDATED-SPLIT
: "${AP_PACKAGE_NEW:?проверенный новый source staging}" "${AP_SAVE:?root-private страховка окна}"
AP_AUX_STAGE="$AP_SAVE/consolidated-aux"
test ! -e "$AP_AUX_STAGE" && test ! -L "$AP_AUX_STAGE"
install -d -m 0700 -o root -g root "$AP_AUX_STAGE"
for AP_AUX_DIR in checks razdacha tools; do
  test -d "$AP_PACKAGE_NEW/$AP_AUX_DIR" && ! test -L "$AP_PACKAGE_NEW/$AP_AUX_DIR"
  mv -- "$AP_PACKAGE_NEW/$AP_AUX_DIR" "$AP_AUX_STAGE/$AP_AUX_DIR"
done
AP_CHECKS_STAGE="$AP_AUX_STAGE/checks"
AP_D_STAGE="$AP_AUX_STAGE/razdacha"
AP_COUNTER_SOURCE="$AP_AUX_STAGE/tools/measure-run-codex.py"
AP_COUNTER_README_SOURCE="$AP_AUX_STAGE/tools/README-measure-run-codex.md"
AP_LAYOUT_MANIFEST_SHA=87f1b65f73eb7c4fb143882ce19b9244bc51fd30e785f3382da196f9671e6937
# END-CONSOLIDATED-SPLIT
```

Затем независимая сверка полки42 по `CONSOLIDATED-MAP.json` (имена/байты/режимы; dirs0755, root:root) и прежняя публикация `.package-new→mv`/offline installer из v4. `AP_CHECKS_STAGE` содержит10 исходников checks, но монтируются только шесть явных целей4а; README/три теста не устанавливаются. Никакого запуска AP от root или общего Master-guard на чужой транспорт.

В шаге4 прежние три адреса `AP_D_STAGE/libexec-root/...`, `/bin/...`, `/systemd/...` заменить следующими **однократными** вызовами (это те же принятые файлы Д из общего source):

```bash
ap_new_file "$AP_D_STAGE/razdacha.py" /usr/local/libexec/dsh-autopilot/razdacha.py 0755
ap_new_file "$AP_D_STAGE/razdacha-zdorova" /usr/local/bin/razdacha-zdorova 0755
ap_new_file "$AP_D_STAGE/dsh-autopilot-razdacha.service" /etc/systemd/system/dsh-autopilot-razdacha.service 0644
```

Счётчик/README — из указанных выше двух путей того же auxiliary; их отдельный gateway3.1.5-предусловие сохраняется. Шесть вызовов checks и systemd service→timer в4а сохраняются. Публичный installed_check читает новый SHA87f1b65f… из дельты записи; прежний SHA05633… и полка de822 не обозначают этот CORE-снимок. Файлы runtime a12 при исправном входе сохранены побайтно. Живой rebase/установку записей делает Забава; `ENTRY-old-new.diff` — **дополнительная** дельта к принятым записям3f, не утверждение байтового равенства прежнему709e→5df.

Archive/candidate stages — root-private временные/страховые носители; registry reader после окна читает только постоянную полку42, source/release и отдельные11files. Удаление stage не должно ломать reader. При откате убрать только своё staging/aux по точным путям и индивидуальному плану, сохранить страховку вне прежде отсутствовавших боевых целей. Остановку/mask/очистку enable-links выполнять как в v4. Другие службы, ключ и реестры этим документом не изменяются.
