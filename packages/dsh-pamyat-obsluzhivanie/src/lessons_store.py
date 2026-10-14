"""RU: Точный писатель уроков в OMEGA и независимая проверка целостности. Никогда не зовёт bridge.store/auto_capture.
EN: Exact-only lesson writer into OMEGA and an independent integrity check. Never calls bridge.store/auto_capture.

RU: Кто зовёт: lessons.py (ступень уроков: класс Writer, assert_omega, Refused) и runner.py (integrity после
    ступеней). Работает под учётной записью omega — иначе отказ (assert_omega). Пишет только в базу OMEGA через
    SQLiteStore поставки с заранее посчитанным вектором (skip_inference=True); всё остальное — чтение (mode=ro).
    Чего НЕ делает: не схлопывает дубли, не правит metadata прежних записей, не удаляет записи.
    Чего НЕ ловит: дубль, созданный писателем вне замка писателя уроков между поиском (lookup) и записью (put);
    integrity находит позже только дубли с одинаковым source_key — как находку, без схлопывания.
EN: Callers: lessons.py (lessons stage: Writer class, assert_omega, Refused) and runner.py (integrity after the
    stages). Runs under the omega account — otherwise refusal (assert_omega). Writes only into the OMEGA database
    through the shipped SQLiteStore with a precomputed vector (skip_inference=True); everything else is read-only
    (mode=ro).
    Does NOT: merge duplicates, edit metadata of earlier records, delete records.
    Does NOT catch: a duplicate created by a writer outside the lessons writer lock between lookup and put;
    integrity later finds only duplicates sharing a source_key — as a finding, without merging.
"""
import hashlib
import inspect
import json
import math
import os
from pathlib import Path
import pwd
import sqlite3
from contextlib import closing

# RU: Закреплённая sha256 файла _store.py поставки OMEGA (модуль класса StoreMixin), на котором проверена логика
# RU: записи этой ступени. Другая сумма — отказ Writer (omega_store_hash_mismatch): поведение Store могло измениться
# RU: (дедуп, склейка по хешу), а проверено оно только на этой редакции. Сумма сдвигалась при выпусках поставки:
# RU: прежние редакции — с префиксами 4ba0a9ae и 9f22f2d1; последняя смена добавила замок записи и метки,
# RU: логика записи та же.
# EN: Pinned sha256 of the shipped OMEGA _store.py (the module of class StoreMixin) on which this stage's write logic
# EN: was verified. A different sum makes Writer refuse (omega_store_hash_mismatch): Store behaviour (dedup, hash
# EN: merging) may have changed, and it was verified only on this revision. The sum moved with upstream releases:
# EN: earlier revisions had prefixes 4ba0a9ae and 9f22f2d1; the latest change added a write lock and markers,
# EN: write logic unchanged.
REVIEW_STORE_SHA = 'c587490ff263c86a961334bab14a543af381d1f342af2f1e2a2f4a765207b03c'

class Refused(Exception):
    """RU: Именованный отказ: str(e) — код причины, он попадает в отчёт прогона (без текста памяти).
    EN: Named refusal: str(e) is the reason code that goes into the run report (no memory text)."""
    pass


def assert_omega():
    """RU: Отказ, если эффективный uid процесса — не учётная запись omega. Писать в OMEGA может только она.
    EN: Refuse unless the process effective uid is the omega account. Only it may write into OMEGA."""
    if os.geteuid() != pwd.getpwnam('omega').pw_uid:
        raise Refused('writer_uid_not_omega')


def checked_embedding(api, text):
    """RU: Вектор текста через модуль embedding поставки, с проверкой здоровья.
    Вход: api (модуль omega.embedding), text. Выход: вектор длиной 1024.
    Отказы: embedding_degraded — бэкенд в деградации или не выбран (проверяется ПОСЛЕ генерации: признак мог
    выставиться при ней); embedding_invalid — нет вектора, длина не 1024, нечисловые/бесконечные значения или
    вектор из одних нулей.
    НЕ ловит: «правдоподобный», но смыслово неверный вектор другой модели той же размерности.
    EN: Text vector via the shipped embedding module, with a health check.
    Input: api (the omega.embedding module), text. Output: a vector of length 1024.
    Refusals: embedding_degraded — backend degraded or not selected (checked AFTER generation: the flag may be set
    by it); embedding_invalid — no vector, length not 1024, non-finite values, or an all-zero vector.
    Does NOT catch: a plausible but semantically wrong vector from another model of the same dimension."""
    vector = api.generate_embedding(text)
    if api.is_embedding_degraded() or api.get_active_backend() is None:
        raise Refused('embedding_degraded')
    if vector is None or len(vector) != 1024 or not all(math.isfinite(float(v)) for v in vector) or not any(vector):
        raise Refused('embedding_invalid')
    return vector


def verify(rows, text, agent, source, key, legacy=False):
    """RU: Сверка найденных строк memories с ожидаемым уроком. Чистая функция, без записи.
    Вход: rows (0 или 1 строка-словарь), ожидаемые text, agent (корень), source (source_uri), key (source_key);
    legacy=True — прежняя запись без source_key в metadata.
    Выход: None — строк нет; {'id': node_id, 'legacy': legacy} — запись совпала точно.
    Отказы: omega_duplicate_source_key (больше одной строки), foreign_root (чужой entity_id),
    canonical_collision_not_exact (другой текст), omega_state_conflict (не active, не lesson_learned, superseded,
    есть ttl_seconds или valid_until), provenance_mismatch (другой source_uri или source_key).
    EN: Match the found memories rows against the expected lesson. Pure function, no writes.
    Input: rows (0 or 1 dict row), expected text, agent (root), source (source_uri), key (source_key);
    legacy=True — an earlier record without source_key in metadata.
    Output: None — no rows; {'id': node_id, 'legacy': legacy} — exact match.
    Refusals: omega_duplicate_source_key (more than one row), foreign_root (another entity_id),
    canonical_collision_not_exact (different text), omega_state_conflict (not active, not lesson_learned,
    superseded, has ttl_seconds or valid_until), provenance_mismatch (different source_uri or source_key)."""
    if len(rows) > 1:
        raise Refused('omega_duplicate_source_key')
    if not rows:
        return None
    row = rows[0]
    meta = json.loads(row['metadata'] or '{}')
    # RU: Store мог вернуть узел ЧУЖОГО корня (канонический дедуп): ID сам по себе не успех.
    # EN: Store may have returned a node of ANOTHER root (canonical dedup): an ID alone is not success.
    if row['entity_id'] != agent:
        raise Refused('foreign_root')
    if row['content'] != text:
        raise Refused('canonical_collision_not_exact')
    # RU: Урок должен быть живым и бессрочным: active, тип lesson_learned, не superseded, без TTL и valid_until.
    # EN: The lesson must be live and permanent: active, type lesson_learned, not superseded, no TTL or valid_until.
    if (row['status'] != 'active' or row['event_type'] != 'lesson_learned'
            or meta.get('superseded') or row.get('ttl_seconds') is not None or row.get('valid_until') is not None):
        raise Refused('omega_state_conflict')
    # RU: Происхождение: тот же source_uri; source_key сверяется только у новых записей (у legacy его нет).
    # EN: Provenance: same source_uri; source_key is checked only for new records (legacy ones have none).
    if row['source_uri'] != source or (not legacy and meta.get('source_key') != key):
        raise Refused('provenance_mismatch')
    return {'id': row['node_id'], 'legacy': legacy}


class Writer:
    """RU: Единственный путь записи урока в OMEGA: прямой SQLiteStore поставки, вектор посчитан заранее.
    Создаётся в lessons.run_stage под замком писателя; закрывается close().
    EN: The only path for writing a lesson into OMEGA: the shipped SQLiteStore directly, vector precomputed.
    Created in lessons.run_stage under the writer lock; closed by close()."""

    def __init__(self, db, expected_sha=REVIEW_STORE_SHA):
        """RU: Проверки до любой записи: uid omega; sha256 файла _store.py = закреплённой; файл базы существует;
        у Store доступно векторное расширение. Отказы: writer_uid_not_omega, omega_store_hash_mismatch,
        omega_db_absent, embedding_store_unavailable (Store при этом закрывается).
        EN: Checks before any write: omega uid; sha256 of _store.py equals the pinned one; the database file exists;
        the Store has the vector extension available. Refusals: writer_uid_not_omega, omega_store_hash_mismatch,
        omega_db_absent, embedding_store_unavailable (the Store is closed in that case)."""
        assert_omega()
        from omega.sqlite_store import SQLiteStore
        from omega.sqlite_store._store import StoreMixin
        from omega import embedding
        # RU: Сумма берётся с файла модуля, который реально импортирован, а не с пути из настройки.
        # EN: The sum is taken from the file of the module actually imported, not from a configured path.
        module = Path(inspect.getfile(StoreMixin))
        if hashlib.sha256(module.read_bytes()).hexdigest() != expected_sha:
            raise Refused('omega_store_hash_mismatch')
        self.db = Path(db).resolve()
        if not self.db.is_file():
            raise Refused('omega_db_absent')
        self.api = embedding
        self.store = SQLiteStore(db_path=self.db)
        if not self.store._vec_available:
            self.store.close()
            raise Refused('embedding_store_unavailable')

    def query(self, sql, args):
        """RU: Чтение отдельным соединением только на чтение (mode=ro); строки — словари.
        EN: Read through a separate read-only connection (mode=ro); rows as dicts."""
        with closing(sqlite3.connect(self.db.as_uri()+'?mode=ro', uri=True)) as conn:
            conn.row_factory = sqlite3.Row
            return [dict(r) for r in conn.execute(sql, args)]

    def lookup(self, agent, source, key, text):
        """RU: Есть ли урок уже в OMEGA. Сначала по корню и source_key; затем — прежняя (legacy) запись по корню и
        source_uri с точным текстом. Найденная запись обязана иметь строку в memories_vec.
        Выход: None или {'id', 'legacy'}. Отказы — из verify и require_vector. Без записи.
        EN: Is the lesson already in OMEGA. First by root and source_key; then an earlier (legacy) record by root and
        source_uri with the exact text. A found record must have a row in memories_vec.
        Output: None or {'id', 'legacy'}. Refusals — from verify and require_vector. No writes."""
        rows = self.query("SELECT * FROM memories WHERE entity_id=? AND json_valid(metadata) AND json_extract(metadata,'$.source_key')=?", (agent,key))
        if rows:
            result=verify(rows,text,agent,source,key)
            self.require_vector(result['id'])
            return result
        # RU: Прежние переносы уроков: тот же корень, source_uri и точный текст принимаются как есть — без нового
        # RU: POST и без правки metadata (притворное происхождение не добавляется).
        # EN: Earlier lesson migrations: same root, source_uri and exact text are accepted as is — no new POST and no
        # EN: metadata edit (no fake provenance is added).
        rows = self.query('SELECT * FROM memories WHERE entity_id=? AND source_uri=?', (agent,source))
        result=verify(rows,text,agent,source,key,legacy=True)
        if result:self.require_vector(result['id'])
        return result

    def require_vector(self, node_id):
        """RU: Отказ embedding_vector_missing, если у узла нет строки в memories_vec (запись без вектора не
        находится поиском по смыслу). Только чтение, с загрузкой расширения sqlite_vec.
        EN: Refuse with embedding_vector_missing if the node has no row in memories_vec (a record without a vector is
        not found by semantic search). Read-only, loads the sqlite_vec extension."""
        import sqlite_vec
        with closing(sqlite3.connect(self.db.as_uri()+'?mode=ro',uri=True)) as conn:
            conn.enable_load_extension(True);sqlite_vec.load(conn);conn.enable_load_extension(False)
            row=conn.execute('SELECT rowid FROM memories_vec WHERE rowid=(SELECT id FROM memories WHERE node_id=?)',(node_id,)).fetchone()
        if not row:raise Refused('embedding_vector_missing')

    def embedding(self, text):
        """RU: Проверенный вектор текста (checked_embedding) и сведения о модели (имя и версия обязательны —
        они пишутся в metadata записи). Побочный эффект: self.model_info, его читает put().
        Отказы: embedding_store_unavailable, embedding_degraded, embedding_invalid, embedding_model_unknown.
        EN: A checked text vector (checked_embedding) and model info (name and version are required — they go into
        the record metadata). Side effect: self.model_info, read by put().
        Refusals: embedding_store_unavailable, embedding_degraded, embedding_invalid, embedding_model_unknown."""
        if not self.store._vec_available:raise Refused('embedding_store_unavailable')
        vector=checked_embedding(self.api, text)
        self.model_info=self.api.get_embedding_model_info()
        if not self.model_info.get('model_name') or not self.model_info.get('model_version'):
            raise Refused('embedding_model_unknown')
        return vector

    def put(self, agent, source, key, text, vector, raw_sha, source_path):
        """RU: Запись урока в OMEGA и проверка её двумя чтениями. Требует предшествующего embedding() (model_info).
        Вход: корень agent, source (source_uri), key (source_key), канонический text, vector, raw_sha (sha исходного
        блока), source_path (файл уроков). Выход: {'id', 'legacy': False}.
        Побочный эффект: новая строка в memories (и memories_vec) базы OMEGA.
        Отказы: embedding_store_unavailable/embedding_degraded (до записи); после записи — всё из verify,
        omega_returned_id_absent, omega_postread_mismatch (поиск по ключу нашёл не тот узел).
        Граница: отказ ПОСЛЕ store() не откатывает запись — она остаётся в OMEGA, её видит integrity.
        EN: Write the lesson into OMEGA and verify it with two reads. Requires a preceding embedding() (model_info).
        Input: root agent, source (source_uri), key (source_key), canonical text, vector, raw_sha (sha of the raw
        block), source_path (the lesson file). Output: {'id', 'legacy': False}.
        Side effect: a new row in memories (and memories_vec) of the OMEGA database.
        Refusals: embedding_store_unavailable/embedding_degraded (before the write); after the write — everything from
        verify, omega_returned_id_absent, omega_postread_mismatch (lookup by key found a different node).
        Boundary: a refusal AFTER store() does not roll the write back — the row stays in OMEGA and integrity sees it."""
        # RU: Деградация перепроверяется прямо перед записью; переданный вектор избавляет от второго вывода модели.
        # EN: Recheck degradation immediately before write; supplied vector prevents a second inference.
        if not self.store._vec_available:raise Refused('embedding_store_unavailable')
        if self.api.is_embedding_degraded() or self.api.get_active_backend() is None:
            raise Refused('embedding_degraded')
        # RU: Бессрочная активная запись; source_key в metadata — ключ идентичности урока (см. lessons.parse_blocks),
        # RU: content_sha — sha256 канонического текста, по нему integrity ловит изменение.
        # EN: Permanent active record; source_key in metadata is the lesson identity key (see lessons.parse_blocks),
        # EN: content_sha is the sha256 of the canonical text, used by integrity to detect changes.
        node_id = self.store.store(content=text, entity_id=agent, source_uri=source,
            status='active', ttl_seconds=None, skip_inference=True, embedding=vector,
            metadata={'event_type':'lesson_learned','klass':'urok','entity_id':agent,
                      'source_key':key,'source_kind':'agent_lesson_file','writer_agent':agent,
                      'source_path':str(source_path),'project':str(Path(source_path).parent),
                      'raw_sha':raw_sha,'content_sha':hashlib.sha256(text.encode()).hexdigest(),
                      '_embedding_model':self.model_info['model_name'],
                      '_embedding_model_version':self.model_info['model_version']})
        # RU: Store может вернуть чужое каноническое/точное совпадение. Один ID — не успех.
        # EN: Store may return somebody else's canonical/exact match. ID alone is not success.
        rows = self.query('SELECT * FROM memories WHERE node_id=?', (node_id,))
        result = verify(rows,text,agent,source,key)
        if result is None:
            raise Refused('omega_returned_id_absent')
        # RU: Второе, независимое чтение — тем же путём, каким ищет следующий прогон (по ключу, с проверкой вектора).
        # EN: A second, independent read — the same path the next run uses to look up (by key, with a vector check).
        actual = self.lookup(agent,source,key,text)
        if actual is None or actual['id'] != node_id:
            raise Refused('omega_postread_mismatch')
        return result

    def close(self):
        """RU: Закрыть Store. EN: Close the Store."""
        self.store.close()


def integrity(db, state_dir=None):
    """RU: Независимый читатель после ступеней: не верит возврату писателя, перечитывает OMEGA и локальные базы.
    Вход: db — база OMEGA; state_dir — каталог состояния с lessons.json (квитанции ступени уроков).
    Проверяет: (1) группы entity_id+source_key среди уроков из файлов с числом строк > 1 — дубли;
    (2) каждую квитанцию omega_verified: узел OMEGA есть, sha256 текста = content_sha, verify (корень, источник,
    ключ, живость), строка вектора есть; в локальной базе агента (<каталог файла уроков>/pamyat/pamyat.db) ровно
    одна запись agent+istochnik с тем же id, классом urok и sha256 текста = content_sha.
    Выход: {'status': 'ok'|'finding'|'error', 'duplicate_source_keys', 'duplicates', 'receipts_checked',
    'receipt_issues'}; ошибка всей проверки — 'error' с именем типа исключения. Только чтение (mode=ro).
    НЕ ловит: уроки без квитанции omega_verified (их не перечитывает); дубли по одному source_uri без source_key;
    ничего о записях, не являющихся уроками из файлов.
    EN: Independent reader after the stages: does not trust the writer's return value, re-reads OMEGA and local
    databases.
    Input: db — the OMEGA database; state_dir — state directory with lessons.json (lessons stage receipts).
    Checks: (1) entity_id+source_key groups among file lessons with more than one row — duplicates;
    (2) every omega_verified receipt: the OMEGA node exists, sha256 of text equals content_sha, verify (root,
    source, key, liveness), the vector row exists; in the agent's local database (<lesson file dir>/pamyat/
    pamyat.db) exactly one agent+istochnik record with the same id, class urok and sha256 of text = content_sha.
    Output: {'status': 'ok'|'finding'|'error', 'duplicate_source_keys', 'duplicates', 'receipts_checked',
    'receipt_issues'}; failure of the whole check — 'error' with the exception type name. Read-only (mode=ro).
    Does NOT catch: lessons without an omega_verified receipt (not re-read); duplicates by the same source_uri
    without source_key; anything about records that are not file lessons."""
    local_connections={}
    try:
        import sqlite_vec
        with closing(sqlite3.connect(Path(db).resolve().as_uri()+'?mode=ro',uri=True)) as conn:
            conn.row_factory=sqlite3.Row
            conn.enable_load_extension(True);sqlite_vec.load(conn);conn.enable_load_extension(False)
            # RU: Дубли уроков из файлов по ключу идентичности внутри корня (могут дать посторонние писатели).
            # EN: File-lesson duplicates by identity key within a root (foreign writers may create them).
            duplicates = conn.execute("SELECT entity_id,json_extract(metadata,'$.source_key'),count(*),group_concat(node_id) FROM memories WHERE json_valid(metadata) AND json_extract(metadata,'$.source_kind')='agent_lesson_file' AND json_extract(metadata,'$.source_key') IS NOT NULL GROUP BY entity_id,json_extract(metadata,'$.source_key') HAVING count(*)>1").fetchall()
            issues=[];checked=0
            state_path=Path(state_dir)/'lessons.json' if state_dir else None
            state=json.loads(state_path.read_text()) if state_path and state_path.exists() else {'records':{}}
            for key,record in state['records'].items():
                if record.get('status')!='omega_verified':continue
                checked+=1
                try:
                    row=conn.execute('SELECT * FROM memories WHERE node_id=?',(record['omega_id'],)).fetchone()
                    if row is None:raise Refused('omega_record_missing')
                    row=dict(row)
                    if hashlib.sha256(row['content'].encode()).hexdigest()!=record['content_sha']:raise Refused('omega_content_changed')
                    # RU: Текст уже сверен по sha выше, поэтому в verify передаётся сам row['content'].
                    # EN: The text is already checked by sha above, so row['content'] itself is passed to verify.
                    verify([row],row['content'],record['agent'],record['source'],key,legacy=record.get('legacy',False))
                    if not conn.execute('SELECT rowid FROM memories_vec WHERE rowid=?',(row['id'],)).fetchone():raise Refused('embedding_vector_missing')
                    # RU: Локальная база берётся рядом с файлом уроков из квитанции; соединения кэшируются на прогон.
                    # EN: The local database is taken next to the lesson file from the receipt; connections are cached per run.
                    local_db=Path(record['file']).parent/'pamyat/pamyat.db'
                    if local_db not in local_connections:local_connections[local_db]=sqlite3.connect(local_db.resolve().as_uri()+'?mode=ro',uri=True)
                    local_rows=local_connections[local_db].execute('SELECT id,agent,klass,istochnik,soderzhim FROM zapisi WHERE agent=? AND istochnik=?',(record['agent'],record['source'])).fetchall()
                    if len(local_rows)>1:raise Refused('local_duplicate_source')
                    local=local_rows[0] if local_rows else None
                    # RU: Локальная запись урока не должна терять текст: поэтому chistka.py не трогает записи из квитанций.
                    # EN: A local lesson record must keep its text: that is why chistka.py skips receipt records.
                    if not local or local[:4]!=(record['local_id'],record['agent'],'urok',record['source']) or hashlib.sha256(local[4].encode()).hexdigest()!=record['content_sha']:raise Refused('local_receipt_changed')
                except Exception as e:issues.append({'agent':record.get('agent'),'key':key,'reason':str(e) if isinstance(e,Refused) else type(e).__name__})
        return {'status':'finding' if duplicates or issues else 'ok','duplicate_source_keys':len(duplicates),
                'duplicates':[{'agent':a,'key':k,'count':n,'ids':ids.split(',')} for a,k,n,ids in duplicates],
                'receipts_checked':checked,'receipt_issues':issues}
    except Exception as e:
        return {'status':'error','reason':type(e).__name__,'duplicate_source_keys':None}
    finally:
        for conn in local_connections.values():conn.close()
