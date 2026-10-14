"""RU: Чистка локальной памяти агента по хвосту — заглушка текста (вариант, принятый владельцем).
EN: Tail cleanup of an agent's local memory — text stubbing (the variant accepted by the owner).

RU: Цель — объём рабочей базы (текст), не число строк: у старой записи, уже лежащей в OMEGA, стирается текст
(soderzhim = '') и ставится zapisi.vychishcheno = время (мс). Строка, id, класс, оценки, отношения и связь svyaz_omega
остаются — оценка старого знания и выдача по смыслу его не теряют. Поле заводит ЯДРО (dsh-pamyat-core ≥ alpha.98):
нет поля — отказ по агенту, ступень схему не трогает.
EN: The goal is working-database size (text), not row count: an old record already present in OMEGA gets its text
erased (soderzhim = '') and zapisi.vychishcheno = time (ms). The row, id, class, scores, relations and the svyaz_omega
link stay — scoring of old knowledge and semantic retrieval do not lose it. The column is created by the CORE
(dsh-pamyat-core >= alpha.98): no column — per-agent refusal; this stage does not touch the schema.

RU: Кто зовёт: runner.py (ночная служба, учётная запись omega) — run_stage после ступени уроков и до судьи;
человек вручную — `python3 chistka.py vernut <база> <страховка>` для отката. Читает: локальные базы агентов
<дом>/pamyat/pamyat.db, профиль агента (срок брифинга), базу OMEGA (только чтение), <state_dir>/lessons.json и
<state_dir>/chistka.json. Пишет: в боевом режиме — локальные базы агентов и страховки <state_dir>/chistka/<агент>-<мс>.db.
EN: Callers: runner.py (nightly service, omega account) — run_stage after the lessons stage and before the judge;
a human, manually — `python3 chistka.py vernut <db> <backup>` for rollback. Reads: agents' local databases
<home>/pamyat/pamyat.db, the agent profile (briefing window), the OMEGA database (read-only), <state_dir>/lessons.json
and <state_dir>/chistka.json. Writes: in live mode — agents' local databases and backups
<state_dir>/chistka/<agent>-<ms>.db.

RU: ХРАНИТСЯ (не трогается): последние POROG записей с текстом И всё моложе срока брифинга (restore.ignoreAfterMs из
профиля агента — формулой, числа здесь нет); сводки компакта (в OMEGA их нет); держатели и цели отношений; записи в
очереди в OMEGA; уроки из файлов (квитанции lessons.json — их текст сверяют integrity и local_lessons.mjs); записи,
которых нет в OMEGA. «Лежит в OMEGA» = A (svyaz_omega → узел active) ИЛИ B (двойник по sha1 NFC текста среди
active того же корня). superseded НЕ считается — число называется отдельно.
EN: KEPT (untouched): the latest POROG records with text AND everything younger than the briefing window
(restore.ignoreAfterMs from the agent profile — by formula, no number here); compaction summaries (they are not in
OMEGA); holders and targets of relations; records queued for OMEGA; file lessons (lessons.json receipts — their text
is checked by integrity and local_lessons.mjs); records absent from OMEGA. "Present in OMEGA" = A (svyaz_omega →
an active node) OR B (a twin by sha1 of NFC text among active records of the same root). superseded does NOT count —
its number is reported separately.

RU: РЕЖИМ: по умолчанию СУХОЙ — перечень «снял бы» с причинами удержания; боевой — только если в каталоге состояния
лежит chistka.json {"primenyat": true}. Боевой: страховка sqlite backup → проверка воспроизведением (integrity_check,
счёт строк = до, у каждого кандидата в копии есть текст) → одна транзакция BEGIN IMMEDIATE (тот же замок записи, что
у ядра и секретаря) → внутри неё по КАЖДОЙ записи заново: запись с текстом, не держатель/цель, не в очереди, лежит
в OMEGA по снимку, снятому ПОСЛЕ взятия замка → UPDATE. Предел за проход PREDEL. База занята — пропуск агента.
Живая запись OMEGA — active без ttl_seconds и без valid_until, узел A — только своего корня.
EN: MODE: DRY by default — a "would remove" list with retention reasons; live only if the state directory holds
chistka.json {"primenyat": true}. Live: sqlite backup → verification by reproduction (integrity_check, row count equal
to before, every candidate has its text in the copy) → a single BEGIN IMMEDIATE transaction (the same write lock as
the core and the secretary use) → inside it, EVERY record re-checked: has text, not a holder/target, not queued,
present in OMEGA by a snapshot taken AFTER acquiring the lock → UPDATE. Per-pass limit PREDEL. Database busy — the
agent is skipped. A live OMEGA record is active with no ttl_seconds and no valid_until; node A only of its own root.

RU: ЧЕГО НЕ ЛОВИТ: удаление/вытеснение записи в самой OMEGA ПОСЛЕ стирания (тогда текст остаётся только в страховке,
пока она живёт — KEEP последних на агента); запись, изменённую в OMEGA по смыслу при том же узле (A не сверяет текст).
Откат: vernut(база, страховка) — текст из страховки у вычищенных после неё; python3 chistka.py vernut <база> <страховка>.
EN: DOES NOT CATCH: deletion/eviction of the record in OMEGA itself AFTER erasure (then the text survives only in the
backup while it lives — the latest KEEP per agent); a record changed in meaning in OMEGA under the same node (A does
not compare text).
Rollback: vernut(db, backup) — text from the backup for records cleaned after it; python3 chistka.py vernut <db> <backup>.
"""
import collections, hashlib, json, os, sqlite3, sys, time, unicodedata
from pathlib import Path

# RU: POROG — сколько последних записей с текстом не трогается никогда; PREDEL — предел стираний за проход на агента;
# RU: KEEP — сколько последних страховок хранится на агента; RESTORE_PAKET — подстрока имени плагина восстановления
# RU: в профиле, из чьей настройки берётся срок брифинга.
# EN: POROG — how many latest records with text are never touched; PREDEL — erasure limit per pass per agent;
# EN: KEEP — how many latest backups are kept per agent; RESTORE_PAKET — substring of the restore plugin name in the
# EN: profile whose config provides the briefing window.
POROG = 1000
PREDEL = 500
KEEP = 3
RESTORE_PAKET = 'dsh-pamyat-restore'


class Refused(Exception):
    """RU: Именованный отказ по агенту: в отчёте статус slepota с причиной (это слепота, а не «нечего чистить»).
    EN: Named per-agent refusal: reported as status slepota with the reason (blindness, not "nothing to clean")."""
    pass


def ro(path):
    """RU: Соединение SQLite только на чтение (mode=ro) по разрешённому пути. EN: Read-only (mode=ro) SQLite connection by resolved path."""
    return sqlite3.connect(Path(path).resolve().as_uri() + '?mode=ro', uri=True)


def otp(t):
    """RU: Отпечаток текста для носителя B: sha1 текста в NFC (None → пустая строка).
    НЕ ловит: двойники, различающиеся пробелами или регистром — сравнение точное.
    EN: Text fingerprint for carrier B: sha1 of NFC text (None → empty string).
    Does NOT catch: twins differing in whitespace or case — the comparison is exact."""
    return hashlib.sha1(unicodedata.normalize('NFC', t or '').encode()).hexdigest()


def srok_brifinga(home):
    """RU: Срок брифинга агента — ignoreAfterMs плагина восстановления из профиля агента
    (<дом>/.dsh/profiles/web/cordis.patch.yml). Выход: целое > 0 (мс).
    Отказы: profil_ne_prochitan:<тип> — профиль не прочитан; srok_brifinga_ne_odin:[...] — значения нет, их несколько
    разных или оно не целое > 0. Отказ — это слепота, а не число по умолчанию.
    EN: The agent's briefing window — ignoreAfterMs of the restore plugin from the agent profile
    (<home>/.dsh/profiles/web/cordis.patch.yml). Output: integer > 0 (ms).
    Refusals: profil_ne_prochitan:<type> — profile unreadable; srok_brifinga_ne_odin:[...] — no value, several
    different values, or not an integer > 0. A refusal is blindness, not a default number."""
    import yaml

    class Zagruzchik(yaml.SafeLoader):
        pass
    # RU: В профиле есть теги платформы (!!js — код в настройке): незнакомый тег → None; блок restore — обычные числа.
    # EN: The profile carries platform tags (!!js — code inside config): an unknown tag → None; the restore block is plain numbers.
    Zagruzchik.add_multi_constructor('', lambda loader, suffix, node: None)
    put = Path(home) / '.dsh/profiles/web/cordis.patch.yml'
    try:
        doc = yaml.load(put.read_text(), Loader=Zagruzchik)
    except Exception as e:
        raise Refused('profil_ne_prochitan:' + type(e).__name__) from None
    naideno = set()

    # RU: Обход всего документа: любой словарь с name, содержащим RESTORE_PAKET, и config.ignoreAfterMs.
    # EN: Walk the whole document: any mapping whose name contains RESTORE_PAKET and has config.ignoreAfterMs.
    def obhod(x):
        if isinstance(x, dict):
            if RESTORE_PAKET in str(x.get('name', '')) and isinstance(x.get('config'), dict) and 'ignoreAfterMs' in x['config']:
                naideno.add(x['config']['ignoreAfterMs'])
            for v in x.values():
                obhod(v)
        elif isinstance(x, list):
            for v in x:
                obhod(v)
    obhod(doc)
    if len(naideno) != 1 or not all(isinstance(v, int) and v > 0 for v in naideno):
        raise Refused('srok_brifinga_ne_odin:' + str(sorted(map(str, naideno))))
    return naideno.pop()


def snimok_omega(omega_db, agent):
    """RU: Снимок OMEGA по корню агента (только чтение). Выход: (живые node_id ЭТОГО корня, отпечатки живых этого
    корня, отпечатки НЕживых этого корня).
    ЖИВАЯ (условие приёмки, для носителей A и B): status active И ttl_seconds IS NULL И valid_until IS NULL — запись
    со сроком OMEGA может убрать сама, и текст пропал бы дважды. Носитель A — только узлы корня агента.
    Граница: status NULL считается active (coalesce); metadata.superseded здесь не читается.
    EN: OMEGA snapshot for the agent's root (read-only). Output: (live node_ids of THIS root, fingerprints of live
    records of this root, fingerprints of NON-live records of this root).
    LIVE (acceptance condition, for carriers A and B): status active AND ttl_seconds IS NULL AND valid_until IS NULL —
    OMEGA may remove a record with an expiry by itself, and the text would then be lost twice. Carrier A — only nodes
    of the agent's root.
    Boundary: NULL status counts as active (coalesce); metadata.superseded is not read here."""
    om = ro(omega_db)
    try:
        zhivye, akt, nezhiv = set(), set(), set()
        for n, c, s, ttl, vu in om.execute("SELECT node_id, content, coalesce(status,'active'), ttl_seconds, valid_until "
                                           "FROM memories WHERE entity_id = ?", (agent,)):
            if s == 'active' and ttl is None and vu is None:
                zhivye.add(n)
                akt.add(otp(c))
            else:
                nezhiv.add(otp(c))
        return zhivye, akt, nezhiv
    finally:
        om.close()


def kvitancii_urokov(state_dir, agent):
    """RU: id локальных записей агента, на которые есть квитанции ступени уроков (lessons.json). Эти записи
    не чистятся: integrity сверяет их текст по content_sha. Нет файла — пустое множество.
    EN: Local record ids of the agent covered by lessons stage receipts (lessons.json). These records are never
    cleaned: integrity checks their text against content_sha. No file — empty set."""
    p = Path(state_dir) / 'lessons.json'
    if not p.exists():
        return set()
    return {v['local_id'] for v in json.loads(p.read_text()).get('records', {}).values()
            if v.get('agent') == agent and v.get('local_id')}


def otbor(conn, agent, srok_ms, zhivye, akt, sup, kvit, sejchas):
    """RU: Отбор кандидатов на стирание (только чтение).
    Вход: conn, agent, srok_ms (срок брифинга), снимок OMEGA (zhivye, akt, sup — отпечатки неживых), kvit (id квитанций
    уроков), sejchas (мс).
    Выход: (кандидаты [(id, sha256 текста)], удержано Counter по причинам, сколько не лежащих в OMEGA имеют лишь
    неживого двойника, число записей с текстом). Порядок кандидатов — от старых к новым.
    Отказ: yadro_bez_metki_vychishcheno — в схеме нет поля vychishcheno.
    EN: Select erasure candidates (read-only).
    Input: conn, agent, srok_ms (briefing window), OMEGA snapshot (zhivye, akt, sup — non-live fingerprints), kvit
    (lesson receipt ids), sejchas (ms).
    Output: (candidates [(id, sha256 of text)], retained Counter by reason, how many records absent from OMEGA have
    only a non-live twin, number of records with text). Candidate order — oldest to newest.
    Refusal: yadro_bez_metki_vychishcheno — no vychishcheno column in the schema."""
    cols = {r[1] for r in conn.execute('PRAGMA table_info(zapisi)')}
    if 'vychishcheno' not in cols:
        raise Refused('yadro_bez_metki_vychishcheno')
    # RU: От новых к старым: первые POROG строк пропускаются как «последние с текстом».
    # EN: Newest to oldest: the first POROG rows are skipped as "latest with text".
    rows = conn.execute('SELECT id, klass, soderzhim, sozdano, otnoshenie FROM zapisi WHERE agent = ? AND vychishcheno IS NULL '
                        'ORDER BY sozdano DESC, id DESC', (agent,)).fetchall()
    celi = {r[0] for r in conn.execute('SELECT DISTINCT otnositsya_k FROM zapisi WHERE otnoshenie IS NOT NULL AND otnositsya_k IS NOT NULL')}
    svyaz = dict(conn.execute('SELECT zapis_id, mem_id FROM svyaz_omega'))
    ochered = {r[0] for r in conn.execute('SELECT zapis_id FROM ochered_dolgovremennogo')}
    kand, uderzh, sup_tolko = [], collections.Counter(), 0
    for n, (i, kl, txt, soz, otn) in enumerate(rows):
        if n < POROG:
            continue
        # RU: Причины удержания проверяются по порядку; первая сработавшая и считается.
        # EN: Retention reasons are checked in order; the first that applies is counted.
        if sejchas - soz < srok_ms: uderzh['molozhe_sroka_brifinga'] += 1; continue
        if kl.startswith('svodka-kompakcii'): uderzh['svodka_kompakta'] += 1; continue
        if otn is not None: uderzh['derzhit_otnoshenie'] += 1; continue
        if i in celi: uderzh['cel_otnosheniya'] += 1; continue
        if i in ochered: uderzh['v_ocheredi_v_omega'] += 1; continue
        if i in kvit: uderzh['kvitanciya_urokov'] += 1; continue
        # RU: Носитель A (связь на живой узел своего корня) ИЛИ носитель B (живой двойник по отпечатку текста).
        # EN: Carrier A (link to a live node of its own root) OR carrier B (a live twin by text fingerprint).
        if not ((i in svyaz and svyaz[i] in zhivye) or otp(txt) in akt):
            uderzh['net_v_omega'] += 1
            sup_tolko += otp(txt) in sup
            continue
        # RU: sha256 текста закрепляется: при стирании запись пропускается, если текст успел измениться.
        # EN: The sha256 of the text is pinned: at erasure the record is skipped if its text has changed.
        kand.append((i, hashlib.sha256(txt.encode()).hexdigest()))
    kand.reverse()
    return kand, uderzh, sup_tolko, len(rows)


def strahovka(conn, db_path, kuda, kand):
    """RU: Страховка перед стиранием: sqlite backup базы в файл kuda и проверка воспроизведением — копия проходит
    integrity_check, число строк zapisi равно исходному, у каждого кандидата в копии есть текст с той же sha256.
    Не сошлось → Refused (strahovka_integrity / strahovka_schet_strok / strahovka_net_teksta_kandidata), база не
    тронута. Выход: sha256 файла страховки. Побочный эффект: файл kuda (каталог создаётся с правами 0700).
    Граница: при отказе проверки файл страховки остаётся на диске. db_path в теле не используется.
    EN: Backup before erasure: sqlite backup of the database into file kuda and verification by reproduction — the
    copy passes integrity_check, the zapisi row count equals the source, every candidate has its text with the same
    sha256 in the copy. Mismatch → Refused (strahovka_integrity / strahovka_schet_strok /
    strahovka_net_teksta_kandidata), the database is untouched. Output: sha256 of the backup file. Side effect: file
    kuda (its directory is created with mode 0700).
    Boundary: on a failed check the backup file stays on disk. db_path is not used in the body."""
    kuda.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    dst = sqlite3.connect(kuda)
    try:
        conn.backup(dst)
    finally:
        dst.close()
    do = conn.execute('SELECT count(*) FROM zapisi').fetchone()[0]
    k = ro(kuda)
    try:
        if k.execute('PRAGMA integrity_check').fetchone()[0] != 'ok':
            raise Refused('strahovka_integrity')
        if k.execute('SELECT count(*) FROM zapisi').fetchone()[0] != do:
            raise Refused('strahovka_schet_strok')
        for i, h in kand:
            r = k.execute('SELECT soderzhim FROM zapisi WHERE id = ?', (i,)).fetchone()
            if r is None or hashlib.sha256(r[0].encode()).hexdigest() != h:
                raise Refused('strahovka_net_teksta_kandidata')
    finally:
        k.close()
    return hashlib.sha256(kuda.read_bytes()).hexdigest()


def primenit(db_path, agent, kand, omega_db, sejchas, zamok_s=30):
    """RU: Стирание текста в одной транзакции BEGIN IMMEDIATE. Снимок OMEGA снимается ПОСЛЕ взятия замка; каждая
    запись перепроверяется внутри транзакции (есть, не вычищена, текст тот же по sha256, не держатель/цель
    отношения, не в очереди в OMEGA, лежит в OMEGA). Не прошедшие — пропуск с причиной, не отказ.
    Вход: путь базы, agent, kand (из otbor), omega_db, sejchas (мс — пишется в vychishcheno), zamok_s (ожидание
    замка, с). Выход: (стёрто строк, Counter пропусков). Стирается не больше PREDEL первых кандидатов (старейших).
    Отказ: baza_zanyata — замок записи не взят за zamok_s. Любая иная ошибка — ROLLBACK и проброс.
    EN: Text erasure in a single BEGIN IMMEDIATE transaction. The OMEGA snapshot is taken AFTER acquiring the lock;
    every record is re-checked inside the transaction (exists, not cleaned, same text by sha256, not a relation
    holder/target, not queued for OMEGA, present in OMEGA). Failing records are skipped with a reason, not refused.
    Input: database path, agent, kand (from otbor), omega_db, sejchas (ms — written to vychishcheno), zamok_s (lock
    wait, s). Output: (rows erased, Counter of skips). At most the first PREDEL candidates (oldest) are erased.
    Refusal: baza_zanyata — write lock not acquired within zamok_s. Any other error — ROLLBACK and re-raise."""
    conn = sqlite3.connect(db_path, timeout=zamok_s, isolation_level=None)
    try:
        try:
            conn.execute('BEGIN IMMEDIATE')
        except sqlite3.OperationalError:
            raise Refused('baza_zanyata') from None
        try:
            zhivye, akt, _ = snimok_omega(omega_db, agent)
            svyaz = dict(conn.execute('SELECT zapis_id, mem_id FROM svyaz_omega'))
            sterto, propusk = 0, collections.Counter()
            for i, h in kand[:PREDEL]:
                r = conn.execute('SELECT soderzhim, otnoshenie, vychishcheno FROM zapisi WHERE id = ? AND agent = ?', (i, agent)).fetchone()
                if r is None or r[2] is not None: propusk['uzhe_net_ili_vychishchena'] += 1; continue
                if hashlib.sha256(r[0].encode()).hexdigest() != h: propusk['tekst_izmenilsya'] += 1; continue
                if r[1] is not None or conn.execute('SELECT 1 FROM zapisi WHERE otnositsya_k = ? AND otnoshenie IS NOT NULL LIMIT 1', (i,)).fetchone():
                    propusk['stala_otnosheniem'] += 1; continue
                if conn.execute('SELECT 1 FROM ochered_dolgovremennogo WHERE zapis_id = ?', (i,)).fetchone():
                    propusk['v_ocheredi_v_omega'] += 1; continue
                if not ((i in svyaz and svyaz[i] in zhivye) or otp(r[0]) in akt):
                    propusk['v_moment_stiraniya_net_v_omega'] += 1; continue
                # RU: Условие vychishcheno IS NULL повторено в UPDATE: rowcount считает только реально стёртые.
                # EN: vychishcheno IS NULL is repeated in the UPDATE: rowcount counts only rows actually erased.
                sterto += conn.execute("UPDATE zapisi SET soderzhim = '', vychishcheno = ? WHERE id = ? AND vychishcheno IS NULL",
                                       (sejchas, i)).rowcount
            conn.execute('COMMIT')
            return sterto, propusk
        except BaseException:
            conn.execute('ROLLBACK')
            raise
    finally:
        conn.close()


def run_stage(state_dir, agents, omega_db, sejchas=None):
    """RU: Проход по агентам реестра. agents — [{'agent','home'}] (lessons.load_agents).
    По каждому агенту: нет базы → net_bazy; записей с текстом не больше POROG → nechego; иначе срок брифинга,
    снимок OMEGA, отбор. В боевом режиме и при наличии кандидатов — страховка, стирание, затем уборка страховок
    сверх KEEP последних.
    Выход: отчёт {'rezhim' boevoj|suhoj, 'porog', 'predel', 'agents', 'status' ok|finding}. Refused по агенту →
    status slepota с причиной и общий finding; проход продолжается. Иные исключения прерывают весь проход.
    EN: Pass over registry agents. agents — [{'agent','home'}] (lessons.load_agents).
    Per agent: no database → net_bazy; no more than POROG records with text → nechego; otherwise briefing window,
    OMEGA snapshot, selection. In live mode with candidates — backup, erasure, then pruning of backups beyond the
    latest KEEP.
    Output: report {'rezhim' boevoj|suhoj, 'porog', 'predel', 'agents', 'status' ok|finding}. A per-agent Refused →
    status slepota with the reason and an overall finding; the pass continues. Other exceptions abort the whole pass."""
    state_dir = Path(state_dir)
    sejchas = sejchas or int(time.time() * 1000)
    # RU: Боевой режим включается только явным {"primenyat": true}; любое другое содержимое — сухой.
    # RU: Нечитаемый JSON — исключение и обрыв всего прохода, а не сухой режим.
    # EN: Live mode is enabled only by an explicit {"primenyat": true}; any other content means dry.
    # EN: Unparsable JSON raises and aborts the whole pass rather than falling back to dry.
    nastr = state_dir / 'chistka.json'
    boevoj = nastr.exists() and json.loads(nastr.read_text()).get('primenyat') is True
    report = {'rezhim': 'boevoj' if boevoj else 'suhoj', 'porog': POROG, 'predel': PREDEL, 'agents': [], 'status': 'ok'}
    for a in agents:
        name, home = a['agent'], Path(a['home'])
        item = {'agent': name}
        report['agents'].append(item)
        db = home / 'pamyat/pamyat.db'
        try:
            if not db.exists():
                item['status'] = 'net_bazy'; continue
            conn = ro(db)
            try:
                # RU: Счёт записей с текстом; на схеме без vychishcheno — все записи агента (отказ ниже, если их больше POROG).
                # EN: Count of records with text; on a schema without vychishcheno — all agent records (refusal below if above POROG).
                s_tekstom = conn.execute('SELECT count(*) FROM zapisi WHERE agent = ?' + (' AND vychishcheno IS NULL' if 'vychishcheno' in
                                         {r[1] for r in conn.execute('PRAGMA table_info(zapisi)')} else ''), (name,)).fetchone()[0]
                item['s_tekstom'] = s_tekstom
                if s_tekstom <= POROG:
                    item['status'] = 'nechego'; continue
                if 'vychishcheno' not in {r[1] for r in conn.execute('PRAGMA table_info(zapisi)')}:
                    raise Refused('yadro_bez_metki_vychishcheno')
                srok = srok_brifinga(home)
                zhivye, akt, sup = snimok_omega(omega_db, name)
                kand, uderzh, sup_tolko, _ = otbor(conn, name, srok, zhivye, akt, sup, kvitancii_urokov(state_dir, name), sejchas)
            finally:
                conn.close()
            item.update(srok_brifinga_ms=srok, snyal_by=len(kand), uderzhano=dict(uderzh), tolko_nezhivye_v_omega=sup_tolko,
                        perechen=[i for i, _ in kand], status='ok')
            if not boevoj or not kand:
                continue
            # RU: Страховка — до любого стирания; в неё проверяются только те кандидаты, что пойдут в этот проход (PREDEL).
            # EN: Backup comes before any erasure; only the candidates of this pass (PREDEL) are checked in it.
            put = state_dir / 'chistka' / f'{name}-{sejchas}.db'
            w = sqlite3.connect(db, timeout=30)
            try:
                item['strahovka'] = str(put); item['strahovka_sha256'] = strahovka(w, db, put, kand[:PREDEL])
            finally:
                w.close()
            item['sterto'], propusk = primenit(db, name, kand, omega_db, sejchas)
            item['propushcheno'] = dict(propusk)
            # RU: Уборка: оставить KEEP последних страховок агента (по имени файла, <агент>-<мс>.db).
            # RU: Граница: маска <агент>-*.db захватывает и файлы агента, чьё имя начинается с «<агент>-».
            # EN: Pruning: keep the latest KEEP backups of the agent (by file name, <agent>-<ms>.db).
            # EN: Boundary: the glob <agent>-*.db also matches files of an agent whose name starts with "<agent>-".
            for star in sorted((state_dir / 'chistka').glob(f'{name}-*.db'))[:-KEEP]:
                star.unlink()
        except Refused as e:
            item['status'] = 'slepota'; item['reason'] = str(e); report['status'] = 'finding'
    return report


def vernut(db_path, strahovka_path):
    """RU: Откат: текст из страховки — у записей, вычищенных после неё (в страховке текст есть, в базе — заглушка).
    Вход: путь базы, путь файла страховки. Выход: число возвращённых записей. Одна транзакция BEGIN IMMEDIATE;
    у возвращённых vychishcheno снова NULL. Записи, вычищенные уже до снятия страховки, не возвращаются (их текста
    в ней нет).
    EN: Rollback: text from the backup for records cleaned after it (the backup has the text, the database has
    the stub). Input: database path, backup file path. Output: number of restored records. One BEGIN IMMEDIATE
    transaction; restored records get vychishcheno back to NULL. Records already cleaned before the backup was taken
    are not restored (the backup has no text for them)."""
    k = ro(strahovka_path)
    try:
        teksty = dict(k.execute("SELECT id, soderzhim FROM zapisi WHERE soderzhim != '' AND "
                                + ('vychishcheno IS NULL' if 'vychishcheno' in {r[1] for r in k.execute('PRAGMA table_info(zapisi)')} else '1')))
    finally:
        k.close()
    conn = sqlite3.connect(db_path, timeout=30, isolation_level=None)
    try:
        conn.execute('BEGIN IMMEDIATE')
        n = 0
        for i, in conn.execute('SELECT id FROM zapisi WHERE vychishcheno IS NOT NULL').fetchall():
            if i in teksty:
                n += conn.execute('UPDATE zapisi SET soderzhim = ?, vychishcheno = NULL WHERE id = ? AND vychishcheno IS NOT NULL',
                                  (teksty[i], i)).rowcount
        conn.execute('COMMIT')
        return n
    finally:
        conn.close()


# RU: Ручной вызов — только откат; ночной проход идёт из runner.py. Иной вызов — отказ с кодом 2.
# EN: Manual invocation is rollback only; the nightly pass runs from runner.py. Any other call — refusal, exit code 2.
if __name__ == '__main__':
    if len(sys.argv) == 4 and sys.argv[1] == 'vernut':
        print(json.dumps({'vozvrashcheno': vernut(sys.argv[2], sys.argv[3])}))
    else:
        print('ОТКАЗ: chistka.py vernut <pamyat.db> <strahovka.db> — иных вызовов нет; проход — из runner.py', file=sys.stderr)
        sys.exit(2)
