// RU: Ledger является границей учёта receive/prepare/dispatch/flush/claim/finish и независимых исходящих. ID и SHA различают повтор и конфликт. Ключи личности и metadata сохраняются дольше тела; secure_delete, порции50 и VACUUM стирают подходящие дубли текста. SQLite не делает внешнее I/O атомарным.
// EN: The ledger tracks receive/prepare/dispatch/flush/claim/finish and independent outgoing delivery. IDs and hashes distinguish retries from conflicts. Identity metadata outlives bodies; secure deletion,50-item batches,and VACUUM erase eligible duplicate text. SQLite does not make external I/O atomic.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import {cancellationReturn} from './cancellation-return.js';
import {isCoordinatorEnvelope,unwrapCoordinator,verifyCoordinator,loadCoordinatorTrust} from './coordinator-signature.js';


export const RETRY_SECONDS = [0, 5, 30, 120, 600];

export const BODY_RETENTION_MS = 30 * 24 * 3600 * 1000;

export const BODY_EXPIRE_BATCH = 50;

export const HOLD_ALERT_MS = [0, 3600000, 86400000];
const PROCESS_OWNER = 'pid:'+process.pid+':'+crypto.randomUUID();
const hash = b => crypto.createHash('sha256').update(b).digest('hex');
export // RU: stableJson: Сериализует идентичность детерминированно для сравнения повторов.
// EN: stableJson: Serializes identities deterministically for repeat comparisons.
function stableJson(value) {
  if (Array.isArray(value)) return '[' + value.map(stableJson).join(',') + ']';
  if (value && typeof value === 'object') return '{' + Object.keys(value).sort().map(k => JSON.stringify(k) + ':' + stableJson(value[k])).join(',') + '}';
  return JSON.stringify(value);
}

export const ENVELOPE_HOLD_MS = 24 * 3600 * 1000;
// RU: B-N-1619 (1): машинный статус отправителю, если ход закрыт interrupted_unknown, а ответа отправитель не ждал
//     (expects_reply=0) — раньше о прерывании знала только копия владельцу. Повтора письма НЕТ (at-most-once не тронут).
//     Ограждения: (а) не на машинные письма (ответы по receipt, сами статусы, протокольные task-control/mail-stop) — без пинг-понга;
//     (б) свёртка: один статус на (маршрут, отправитель, класс причины), пока он не ушёл — следующие прерывания дописываются
//     перечнем квитанций; отправка отложена на PRERYV_SVERTKA_MS, чтобы пачка (лимит бьёт подряд) легла в один;
//     (в) класс причины и для лимитов — время сброса из текста ошибки. Маршрут: a2a — туда же, куда ушёл бы ответ (A2A_OUT);
//     tg — туда же, где копия (copy-tg); site и прочие — статуса нет (audit).
// EN: B-N-1619 (1): machine status to the sender when a turn ends interrupted_unknown and no reply was expected; no replay.
export const PRERYV_METKA = '[статус прерывания v1]';
export const PRERYV_SVERTKA_MS = 120000;
// RU: B-N-1619 остаток (слово владельца 05.10.2026 09:26 МСК: «красная пометка в ленте владельцу при оборванном ходе — да; больше
//     красного, зато понятно, что был оборванный ход»): на тот же interrupted_unknown — красная строка в копию владельцу (copy-tg;
//     уходит только в режимах с копией владельцу — owner-all/broadcast, иначе доставка снимает её с записью). Любой маршрут (a2a, tg,
//     site) и любой expects_reply: обрыв — событие хода, не письма. Ограждения как у статуса: не на машинные письма; свёртка по классу
//     причины, пока строка не ушла (PRERYV_SVERTKA_MS); для «прочее» — без сырого текста ошибки, только вид. Повтора письма нет.
// EN: B-N-1619 remainder: a red owner-copy line on interrupted_unknown, folded per cause class; machine letters excluded; no raw error text.
export const OBORVAN_METKA = '🔴 ход оборван';
// RU: потолок id в свёрнутой строке владельцу (r2, замечание Вениамина): дальше — «… и ещё N»; полный список — audit interrupt_owner_*.
// EN: cap of ids in the folded owner line; the rest is counted as «… и ещё N», full list stays in audit.
export const OBORVAN_POTOLOK = 20;
// RU: B-N-1619 (2.5.97, слово владельца через Забаву 05.10 13:57Z): в строке — имя агента, ЧИСЛО неисполненных писем (перечень id
//     остаётся), «переподать, если поручение в силе». Число пересчитывается при свёртке; в старой строке (до 2.5.97) числа нет — не трогаем.
// EN: owner line carries agent name, count of unexecuted letters (recounted on fold) and a re-send hint.
const OBORVAN_CHISLO = /\nНе исполнено писем: (\d+) —/;
function tekstPisma(r) {
  try { const m = JSON.parse(r.message_json ?? 'null'); const t = (m?.content ?? []).filter(b => b?.type === 'text').map(b => b.text).join('\n'); if (t) return t; } catch {}
  return r.raw ? Buffer.from(r.raw).toString('utf8') : '';
}
export function mashinnoePismo(r) {
  const t = tekstPisma(r);
  return /^\s*(\[delivery-v1[^\]]*\]\s*)?(\[агент [^\]]*\]\s*)?\[ответ по receipt /.test(t) || t.includes(PRERYV_METKA)
    || /"kind"\s*:\s*"(task-control|mail-stop)/.test(t) || /(?:^|\n)письмо [a-f0-9-]{36} НЕ исполнено: удержано replace-STOP /u.test(t);
}
// RU: B-N-1619 (2.5.97): «сброс» — время и пояс в скобках, без приписок за ними. Живьём 05.10 шлюз дописывал к ошибке
//     «(лимит ходов исключён: записи max_turns_reached…», и захват до 60 знаков тащил её в строку владельцу.
// EN: reset time keeps one timezone parenthesis and drops any trailing note.
export function chistyjSbros(s) {
  if (typeof s !== 'string') return null;
  const m = /^([^()]*?)(\s*\([A-Za-z0-9_\/+:-]{1,40}\))?(?:\s*\(.*)?$/s.exec(s);
  return ((m ? m[1] + (m[2] ?? '') : s).trim()) || null;
}
export function klassPreryvaniya(end) {
  const reason = end?.reason ?? {}, kind = reason.kind ?? 'неизвестно';
  const msg = typeof reason.error?.message === 'string' ? reason.error.message : '';
  const sbros = chistyjSbros((msg.match(/resets?\s+([^·\n]{1,60})/i) ?? msg.match(/try again (?:at|in)\s+([^.\n]{1,40})/i))?.[1]);
  const t = [[/session limit/i,'limit-sessii','лимит сессии подписки'],[/weekly/i,'limit-nedeli','недельный лимит подписки'],
    [/usage limit/i,'limit-codex','лимит Codex'],[/unauthorized|401|refresh/i,'avtorizaciya','авторизация/токен поставщика'],
    [/safeguards/i,'zashchita-api','отказ защиты API'],[/at capacity/i,'model-zanyata','модель занята'],[/fetch failed|ECONN/i,'set','сеть'],
    [/лимит ходов|max_turns/i,'limit-hodov','лимит ходов']];
  for (const [re, kod, imya] of t) if (re.test(msg)) return { kod, imya, sbros };
  if (kind === 'aborted') return { kod: 'prervano-' + (reason.reason?.kind ?? 'x'), imya: 'прервано (' + (reason.reason?.kind ?? '?') + ')', sbros: null };
  if (kind === 'interrupted') return { kod: 'ostanovka', imya: 'остановка хода платформой', sbros: null };
  return { kod: 'prochee', imya: kind + (msg ? ': ' + msg.slice(0, 80) : ''), sbros };
}
const validId = x => typeof x === 'string' && /^[a-zA-Z0-9:_-]{1,128}$/.test(x);

const NEGODNYE_PRI_PRIEME = ['invalid_metadata','recipient_mismatch','recipient_or_decision_invalid','target_missing','target_scope_mismatch','decision_identity_conflict'];
export // RU: migrateReceiptProtocol: Мигрирует поддерживаемую схему протокола, неизвестную версию не обнуляет.
// EN: migrateReceiptProtocol: Migrates supported protocol schema without resetting unknown versions.
function migrateReceiptProtocol(db) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const version=db.prepare('PRAGMA user_version').get().user_version;
    if (![0,1,2].includes(version)) throw Error('Неизвестная версия ledger');
    db.exec(`CREATE TABLE IF NOT EXISTS protocol_envelopes(
      receipt_id TEXT PRIMARY KEY, version TEXT NOT NULL, kind TEXT, metadata_json TEXT,
      body_text TEXT NOT NULL, decision_id TEXT, recipient TEXT, recipient_ledger TEXT,
      target_decision TEXT, target_recipient TEXT, target_ledger TEXT,
      state TEXT NOT NULL, reason TEXT NOT NULL, held_at INTEGER NOT NULL,
      deadline_at INTEGER NOT NULL, released_at INTEGER, hold_duration_ms INTEGER, exit_reason TEXT,
      target_receipt TEXT, target_dsh_id TEXT, target_session_id TEXT, target_session_created INTEGER,
      cancel_phase TEXT, cancel_requested_at INTEGER, cancel_flushed_at INTEGER);
      CREATE TABLE IF NOT EXISTS decision_index(
        recipient TEXT NOT NULL, decision_id TEXT NOT NULL, receipt_id TEXT UNIQUE NOT NULL,
        PRIMARY KEY(recipient,decision_id));`);
    db.prepare("INSERT OR IGNORE INTO meta(key,value) VALUES('ledger_uuid',?)").run(crypto.randomUUID());
    db.exec('PRAGMA user_version=2; COMMIT');
  } catch(e) { try { db.exec('ROLLBACK'); } catch {} throw e; }
}


export // RU: migrateClaimedAt: Добавляет отметку claim совместимо с существующими данными.
// EN: migrateClaimedAt: Adds claim timing compatibly with existing data.
function migrateClaimedAt(db) {
  if (db.prepare("SELECT 1 FROM pragma_table_info('receipts') WHERE name='claimed_at'").get()) return false;
  db.exec('ALTER TABLE receipts ADD COLUMN claimed_at INTEGER');
  return true;
}


export // RU: celyjUtf8: Проверяет целый UTF-8 до принятия содержимого как текста.
// EN: celyjUtf8: Validates complete UTF-8 before treating bytes as text.
function celyjUtf8(raw) {
  const text = Buffer.from(raw).toString('utf8');
  return Buffer.from(text).equals(Buffer.from(raw));
}

mailEnvelope.celyj = celyjUtf8;
mailEnvelope.payloadBytes = raw => isCoordinatorEnvelope(raw) ? unwrapCoordinator(raw).length : Buffer.byteLength(raw);
export // RU: mailEnvelope: Разбирает конверт и отделяет идентичность/инструкции от тела.
// EN: mailEnvelope: Parses envelope identity/control separately from its body.
function mailEnvelope(raw) {
  if(isCoordinatorEnvelope(raw)) {

    const payload=unwrapCoordinator(raw);
    if(isCoordinatorEnvelope(payload))throw Error('Nested coordinator envelope');
    return mailEnvelope(payload);
  }
  const text = Buffer.from(raw).toString('utf8');
  if (!celyjUtf8(raw)) throw Error('Письмо не является целым UTF-8 текстом');

  const control = /^\[a2a-envelope version=(\d+)\](?:\r?\n|$)/.exec(text);
  if (control) {
    const rest=text.slice(control[0].length); const end=rest.indexOf('\n');
    const line=end<0?rest:rest.slice(0,end).replace(/\r$/,'');
    let metadata=null; let reason=null;
    if(control[1]!=='2') reason='unsupported_version';
    else {
      try { metadata=JSON.parse(line); if(!metadata || typeof metadata!=='object' || Array.isArray(metadata)) throw Error(); }
      catch { reason='invalid_metadata'; }
    }
    return {logicalKey:metadata && validId(metadata.delivery_id)?'v2:'+metadata.delivery_id:null,
      text: end<0?'':rest.slice(end+1), expectsReply:true,
      protocol:{version:control[1],metadata,body:end<0?'':rest.slice(end+1),reason}};
  }
  const m = /^\[delivery-v1 id=([a-zA-Z0-9:_-]{1,128})(?: reply=(yes|no))?\]\r?\n/.exec(text);
  const body=m?text.slice(m[0].length):text;
  const address=m?/^\[spool-conversation-v1 ([^\]\r\n]*)\]\r?\n/.exec(body):null;
  return {logicalKey:m?'mail:'+m[1]:null,text:address?body.slice(address[0].length):body,expectsReply:m?.[2]!=='no',
    ...(address?{spoolConversation:/^[A-Za-z0-9_-]{1,2048}$/.test(address[1])?address[1]:''}:{})};
}


let dajPomoshchnik = () => null, skazatNetPomoshchnika = () => {}, netPomoshchnikaSkazano = false;
export // RU: ustanovitIstochnikPomoshchnika: Устанавливает ленивый источник событий ядра для совместимости DSH.
// EN: ustanovitIstochnikPomoshchnika: Installs a lazy core-event source for DSH compatibility.
function ustanovitIstochnikPomoshchnika(daj, skazat = () => {}) {
  dajPomoshchnik = typeof daj === 'function' ? daj : () => null; skazatNetPomoshchnika = skazat; netPomoshchnikaSkazano = false;
}
// RU: pomoshchnik: Получает доступный помощник событий или явную недоступность.
// EN: pomoshchnik: Resolves the event helper or explicit unavailability.
function pomoshchnik() {
  let pm; try { pm = dajPomoshchnik(); } catch { pm = null; }
  if (typeof pm?.sobytiyaSessii === 'function' && typeof pm?.nasledovano === 'function') return pm;
  if (!netPomoshchnikaSkazano) { netPomoshchnikaSkazano = true; skazatNetPomoshchnika('помощник событий ядра не найден (ctx.pamyat без sobytiyaSessii: нужный интерфейс ядра отсутствует или не поднят) — журнал читаю через session.events или snapshotEvents()'); }
  return null;
}
export // RU: sobytiyaSessii: Получает реальные события сессии через совместимый интерфейс.
// EN: sobytiyaSessii: Reads actual session events through a compatible interface.
function sobytiyaSessii(session) {
  const pm = pomoshchnik();
  const ev = pm ? pm.sobytiyaSessii(session) : Array.isArray(session?.events) ? session.events
    : typeof session?.snapshotEvents === 'function' ? session.snapshotEvents() : undefined;
  if (!Array.isArray(ev)) throw Error('журнал сессии недоступен (ни events, ни snapshotEvents) — квитанции не сверить');
  return ev;
}
export // RU: nasledovanoSessii: Определяет границу унаследованных событий, чтобы не считать их новой работой.
// EN: nasledovanoSessii: Finds inherited-event boundaries so they are not counted as new execution.
function nasledovanoSessii(session) {
  const pm = pomoshchnik(); return pm ? pm.nasledovano(session?.header) : (session?.header?.inheritedEventCount ?? session?.header?.seedLength ?? 0);
}
export // RU: receiptFacts: Связывает message IDs с claim/cancel/end, а не по совпавшему тексту.
// EN: receiptFacts: Matches message IDs to claim/cancel/end rather than similar text.
function receiptFacts(session, ids) {
  const wanted = new Set(ids), facts = new Map(ids.map(id => [id, { claims: [], outputs: [], end: null, canceled: false }]));
  const q = { 'next-turn': [], 'next-step': [] }; let turn = null;
  const seed = nasledovanoSessii(session), events = sobytiyaSessii(session);
  for (let i = 0; i < events.length; i++) {
    const e = events[i], d = e.data ?? {};
    if (e.type === 'turn/start') turn = d.turn;
    if (i >= seed && e.type === 'agent/inbox/spliced') {
      if (!q[d.target] || !Array.isArray(d.inserted)) throw Error('Неизвестный формат inbox splice');
      const removed = q[d.target].splice(d.start, d.removedCount ?? 0, ...d.inserted);
      for (const msg of removed) if (wanted.has(msg.id)) {
        if (d.outcome === 'canceled') facts.get(msg.id).canceled = true;
        else facts.get(msg.id).claims.push({ turn, seq: e.seq, time: e.time });
      }
    }
    if (e.type === 'assistant/message') for (const f of facts.values()) {
      if (f.claims.some(c => c.turn === d.turn)) f.outputs.push({ seq: e.seq, message: d.message });
    }
    if (e.type === 'turn/end') {
      for (const f of facts.values()) if (f.claims.some(c => c.turn === d.turn)) f.end = { seq: e.seq, turn: d.turn, reason: d.reason };
      turn = null;
    }
  }
  return facts;
}
// RU: Статус читает сохранённый audit: удаление backlog не стирает причину уже классифицированного удержания.
// EN: Status reads persisted audit so a later backlog loss cannot erase an already classified hold.
export function receiptHoldStatus(db, rows) {
  const query=db.prepare("SELECT detail FROM audit WHERE receipt_id=? AND kind='held_by_replace' ORDER BY seq LIMIT 1");
  return rows.map(r=>r.blocked==='held_by_replace'
    ? {...r,replace_hold:JSON.parse(query.get(r.id)?.detail??'null')} : r);
}
export class MessageReceipts {
  // RU: constructor: Инициализирует состояние и схему этого компонента; не выполняет завершённую доставку автоматически.
// EN: constructor: Initializes component state/schema without claiming completed delivery.
constructor(root, { now = Date.now, owner = PROCESS_OWNER, migrate = true, coordinatorTrustFile = '', reviewer, ownerCopyMode = null, agentName = '' } = {}) {
    this.root = path.resolve(root); this.now = now; this.owner=owner;this.agentName=String(agentName ?? '').slice(0, 40);this.coordinatorTrustFile=coordinatorTrustFile;this.reviewer=reviewer;
    this.ownerCopyMode=ownerCopyMode;
    fs.mkdirSync(this.root, { recursive: true, mode: 0o700 });
    const st = fs.lstatSync(this.root);
    if (st.isSymbolicLink() || !st.isDirectory() || (st.mode & 0o077)) throw Error('Ledger требует отдельного каталога 0700');
    const file = path.join(this.root, 'receipts.sqlite');
    if (fs.existsSync(file) && fs.lstatSync(file).isSymbolicLink()) throw Error('Ledger не должен быть ссылкой');
    this.db = new DatabaseSync(file); fs.chmodSync(file, 0o600);
    this.db.exec('PRAGMA busy_timeout=5000; PRAGMA synchronous=FULL;');
    const version = this.db.prepare('PRAGMA user_version').get().user_version;
    if (!migrate && version !== 2) { this.db.close(); throw Error('Admin требует ledger v2; миграцию выполняет только служба'); }
    if (version !== 0 && version !== 1 && version !== 2) throw Error('Неизвестная версия ledger');
    if (version === 0 && this.db.prepare("SELECT name FROM sqlite_master WHERE name='receipts'").get()) throw Error('Черновой ledger несовместим; не подменяю его пустым');
    this.db.exec(`CREATE TABLE IF NOT EXISTS meta(key TEXT PRIMARY KEY,value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS receipts(id TEXT PRIMARY KEY,logical_key TEXT UNIQUE,payload_sha TEXT NOT NULL,raw BLOB,
        received_at INTEGER NOT NULL,body_at INTEGER NOT NULL,sender TEXT NOT NULL,route TEXT NOT NULL,route_key TEXT,
        message_json TEXT,dsh_id TEXT UNIQUE,session_id TEXT,session_created INTEGER,dispatch_started INTEGER NOT NULL DEFAULT 0,
        channel_started INTEGER NOT NULL DEFAULT 0,flushed_at INTEGER,claimed_turn INTEGER,finished_at INTEGER,outcome TEXT,result_json TEXT,
        blocked TEXT,duplicate_of TEXT,expects_reply INTEGER NOT NULL DEFAULT 1,execution_owner TEXT,channel_owner TEXT,hold_notices INTEGER NOT NULL DEFAULT 0);
      CREATE TABLE IF NOT EXISTS sources(source_key TEXT PRIMARY KEY,receipt_id TEXT NOT NULL,path TEXT,raw_sha TEXT NOT NULL,
        source_released INTEGER NOT NULL DEFAULT 0,released_at INTEGER,archive_path TEXT);
      CREATE TABLE IF NOT EXISTS audit(seq INTEGER PRIMARY KEY,receipt_id TEXT,at INTEGER NOT NULL,kind TEXT NOT NULL,detail TEXT);
      CREATE TABLE IF NOT EXISTS outbox(id TEXT PRIMARY KEY,receipt_id TEXT,route TEXT NOT NULL,body TEXT NOT NULL,
        created_at INTEGER NOT NULL,attempts INTEGER NOT NULL DEFAULT 0,next_at INTEGER NOT NULL,sent_at INTEGER,error TEXT);
      `);
    if(migrate)this.db.exec('CREATE TABLE IF NOT EXISTS spool_telegram_replies(receipt_id TEXT PRIMARY KEY,chat_id TEXT NOT NULL)');
    this.hasSpoolTelegramReplies=!!this.db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='spool_telegram_replies'").get();
    this.hasOwnerCopyMode=!!this.db.prepare("SELECT 1 FROM pragma_table_info('outbox') WHERE name='owner_copy_mode'").get();
    if(migrate&&!this.hasOwnerCopyMode){this.db.exec('ALTER TABLE outbox ADD COLUMN owner_copy_mode TEXT');this.hasOwnerCopyMode=true;}
    const storedRoot = this.db.prepare("SELECT value FROM meta WHERE key='root'").get();
    if (storedRoot && storedRoot.value !== this.root) throw Error('Ledger скопирован из другого дома: требуется отдельная миграция');
    this.db.prepare("INSERT OR IGNORE INTO meta VALUES('root',?)").run(this.root);
    if (migrate) { migrateReceiptProtocol(this.db); migrateClaimedAt(this.db); }
    this.reviewer=reviewer??this.db.prepare("SELECT value FROM meta WHERE key='receipt_reviewer'").get()?.value??'координатор';
    this.db.prepare("INSERT INTO meta VALUES('receipt_reviewer',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(this.reviewer);

    this.hasClaimedAt = !!this.db.prepare("SELECT 1 FROM pragma_table_info('receipts') WHERE name='claimed_at'").get();
  }
  // B-N-2009: keep mail-source semantics independent of its authenticated Telegram reply destination.
  spoolTelegramReply(id) {return this.hasSpoolTelegramReplies?this.db.prepare('SELECT chat_id FROM spool_telegram_replies WHERE receipt_id=?').get(id)?.chat_id:undefined;}
  setSpoolTelegramReply(id,chat,originalReply=false) {
    if(!this.hasSpoolTelegramReplies||(chat!==undefined&&(!/^-?[1-9][0-9]*$/.test(chat)||!Number.isSafeInteger(Number(chat))))||typeof originalReply!=='boolean')throw Error('Telegram reply destination unavailable');
    return this.tx(()=>{
      const r=this.get(id),old=this.spoolTelegramReply(id);
      if(!r||r.blocked||r.finished_at!==null||(chat!==undefined&&old!==undefined&&old!==chat))throw Error('Telegram reply identity conflict');
      if(r.message_json!==null||r.dispatch_started){if(old!==chat||r.expects_reply!==(chat===undefined?Number(originalReply):1))throw Error('Prepared receipt has another reply policy');return r;}
      if(chat===undefined)this.db.prepare('DELETE FROM spool_telegram_replies WHERE receipt_id=?').run(id);
      else this.db.prepare('INSERT OR IGNORE INTO spool_telegram_replies VALUES(?,?)').run(id,chat);
      this.db.prepare('UPDATE receipts SET expects_reply=? WHERE id=?').run(chat===undefined?Number(originalReply):1,id);
      return this.get(id);
    });
  }
  // RU: tx: Оборачивает синхронную операцию в SQLite-транзакцию; ошибка откатывает все изменения.
// EN: tx: Wraps synchronous work in a SQLite transaction with rollback on failure.
tx(fn) { this.db.exec('BEGIN IMMEDIATE'); try { const v = fn(); this.db.exec('COMMIT'); return v; } catch (e) { try { this.db.exec('ROLLBACK'); } catch {} throw e; } }
  // RU: audit: Сохраняет именованный факт состояния для последующей независимой сверки.
// EN: audit: Persists a named state fact for subsequent independent reconciliation.
audit(id, kind, detail = '') { this.db.prepare('INSERT INTO audit(receipt_id,at,kind,detail) VALUES(?,?,?,?)').run(id, this.now(), kind, detail); }
  // RU: get: Читает сущность по точному ID без изменения её состояния.
// EN: get: Reads an entity by exact identity without altering its state.
get(id) { return this.db.prepare('SELECT * FROM receipts WHERE id=?').get(id); }
  // RU: source: Находит сохранённый source key и связь с receipt для повторного admission.
// EN: source: Resolves a stored source key and receipt binding for repeated admission.
source(key) { return this.db.prepare('SELECT * FROM sources WHERE source_key=?').get(key); }
  // RU: receive: Принимает источник в устойчивый учёт; совпавший ID с другими байтами является конфликтом, а не новым входом.
// EN: receive: Admits a source into durable accounting; identical IDs with different bytes conflict instead of creating fresh input.
receive(sourceKey, raw, { sourcePath = null, sender = '', logicalKey = null, route = 'a2a', routeKey = null, hold = true, expectsReply = true } = {}) {
    raw = Buffer.from(raw); const sha = hash(raw);
    return this.tx(() => {
      const old = this.source(sourceKey);
      if (old) {
        if (old.raw_sha !== sha) throw Error('identity conflict: источник с тем же ID изменил тело');
        const r = this.get(old.receipt_id);
        if (!r.raw) this.db.prepare('UPDATE receipts SET raw=?,body_at=? WHERE id=?').run(raw, this.now(), r.id);
        return { ...this.get(r.id), received: true, fresh: false };
      }
      let r = logicalKey ? this.db.prepare('SELECT * FROM receipts WHERE logical_key=?').get(logicalKey) : null;
      if (r && r.payload_sha !== sha) throw Error('logical identity conflict: одинаковый ID, разные байты');
      if (!r) {

        const same = hold && !logicalKey ? this.db.prepare('SELECT id FROM receipts WHERE payload_sha=? LIMIT 1').get(sha) : null;
        const id = crypto.randomUUID();
        this.db.prepare('INSERT INTO receipts(id,logical_key,payload_sha,raw,received_at,body_at,sender,route,route_key,blocked,duplicate_of,expects_reply) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)')
          .run(id, logicalKey, sha, raw, this.now(), this.now(), sender, route, routeKey === null ? null : String(routeKey), same ? 'legacy_ambiguous' : null, same?.id ?? null, expectsReply?1:0);
        r = this.get(id); this.audit(id, 'received', same ? 'УДЕРЖАНО: неоднозначный legacy-повтор' : '');
      } else if (!r.raw) this.db.prepare('UPDATE receipts SET raw=?,body_at=? WHERE id=?').run(raw, this.now(), r.id);
      this.db.prepare('INSERT INTO sources(source_key,receipt_id,path,raw_sha) VALUES(?,?,?,?)').run(sourceKey, r.id, sourcePath === null ? null : path.resolve(sourcePath), sha);
      return { ...this.get(r.id), received: true, fresh: true };
    });
  }
  // RU: protocolIdentity: Извлекает устойчивую protocol identity конкретного конверта.
// EN: protocolIdentity: Extracts a specific envelope's durable protocol identity.
protocolIdentity() { return this.db.prepare("SELECT value FROM meta WHERE key='ledger_uuid'").get().value; }
  // RU: coordinator: Проверяет допустимую координаторскую подпись и сохраняет replay-факт.
// EN: coordinator: Validates coordinator signatures and records replay evidence.
coordinator(raw,receiver,channel='a2a') {
    if(isCoordinatorEnvelope(raw)&&channel!=='a2a')return {signed:true,trusted:false,reason:'wrong_channel'};
    let trust=null;
    if(isCoordinatorEnvelope(raw)) {try {trust=loadCoordinatorTrust(this.coordinatorTrustFile);}catch{                           }}
    return verifyCoordinator(raw,{db:this.db,trust,recipient:receiver,ledger:this.protocolIdentity(),now:this.now()});
  }
  // RU: protocolExit: Сохраняет конечное решение протокола и его причину.
// EN: protocolExit: Persists protocol exit decisions and their reasons.
protocolExit(r, state, reason) {
    this.db.prepare(`UPDATE protocol_envelopes SET state=?,exit_reason=?,released_at=?,hold_duration_ms=?-held_at WHERE receipt_id=?`)
      .run(state,reason,this.now(),this.now(),r.id);
    this.db.prepare('UPDATE receipts SET blocked=NULL WHERE id=?').run(r.id);
    this.audit(r.id,'envelope_exit',reason);
  }
  // RU: acceptEnvelope: Проверяет адресный v2 конверт, unknown удерживается вместо действия.
// EN: acceptEnvelope: Validates targeted v2 envelopes and holds unknown input instead of acting.
acceptEnvelope(id, envelope, receiver) {
    return this.tx(() => {
      const r=this.get(id); if(!r) throw Error('Receipt отсутствует');
      const old=this.db.prepare('SELECT * FROM protocol_envelopes WHERE receipt_id=?').get(id);
      if(old) return old.state==='released_text' && r.finished_at===null
        ? {action:'text',text:old.body_text} : {action:r.finished_at!==null?'terminal':'held',reason:old.reason};

      if(r.dispatch_started || r.finished_at!==null) throw Error('Конверт уже имеет исход/передачу; автоматическая переоценка запрещена');
      const m=envelope.metadata, identity=this.protocolIdentity();
      let reason=envelope.reason;


      const bezCeli=m?.kind==='decision' && (m.supersedes===undefined || m.supersedes===null);
      if(!reason && (!validId(m?.delivery_id) || !['decision','capability_probe'].includes(m?.kind))) reason='invalid_metadata';
      if(!reason && (!validId(receiver) || m.recipient?.id!==receiver)) reason='recipient_mismatch';
      if(!reason && m.kind==='decision' && (!validId(m.decision_id) || m.recipient?.ledger_uuid!==identity)) reason='recipient_or_decision_invalid';
      if(!reason && m.kind==='capability_probe' && m.recipient?.ledger_uuid && m.recipient.ledger_uuid!==identity) reason='ledger_mismatch';
      if(!reason && !bezCeli && !validId(m.supersedes?.decision_id)) reason='target_missing';
      if(!reason && !bezCeli && m.kind==='decision' && (m.supersedes.recipient!==receiver || m.supersedes.ledger_uuid!==identity)) reason='target_scope_mismatch';
      if(!reason && m.kind==='capability_probe' && ((m.supersedes.recipient && m.supersedes.recipient!==receiver) || (m.supersedes.ledger_uuid && m.supersedes.ledger_uuid!==identity))) reason='target_scope_mismatch';
      if(!reason && m.kind==='decision' && this.db.prepare('SELECT receipt_id FROM decision_index WHERE recipient=? AND decision_id=?').get(receiver,m.decision_id)) reason='decision_identity_conflict';


      if(!reason && m.kind==='decision' && this.db.prepare(`SELECT receipt_id FROM protocol_envelopes WHERE kind='decision' AND target_recipient=? AND target_decision=? AND target_ledger=? AND state<>'rejected' AND receipt_id<>? AND reason NOT IN (${NEGODNYE_PRI_PRIEME.map(()=>'?').join(',')})`).get(receiver,m.decision_id,identity,id,...NEGODNYE_PRI_PRIEME)) reason='superseded_before_arrival';
      const probe=!reason && m.kind==='capability_probe';
      reason=reason || (probe?'capability_probe':'awaiting_cancellation');
      this.db.prepare(`INSERT INTO protocol_envelopes(receipt_id,version,kind,metadata_json,body_text,decision_id,recipient,recipient_ledger,
        target_decision,target_recipient,target_ledger,state,reason,held_at,deadline_at)
        VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(id,envelope.version,typeof m?.kind==='string'?m.kind:null,
        m?JSON.stringify(m):null,envelope.body,validId(m?.decision_id)?m.decision_id:null,receiver,identity,
        validId(m?.supersedes?.decision_id)?m.supersedes.decision_id:null,
        typeof m?.supersedes?.recipient==='string'?m.supersedes.recipient:null,
        typeof m?.supersedes?.ledger_uuid==='string'?m.supersedes.ledger_uuid:null,
        'held',reason,this.now(),this.now()+ENVELOPE_HOLD_MS);
      this.db.prepare("UPDATE receipts SET blocked='envelope_held',expects_reply=1 WHERE id=?").run(id);
      if(probe) {
        const found=this.db.prepare('SELECT receipt_id FROM decision_index WHERE recipient=? AND decision_id=?').get(receiver,m.supersedes.decision_id);
        const response={protocol:'a2a-envelope',version:2,kind:'capability_response',delivery_id:m.delivery_id,
          recipient:receiver,ledger_uuid:identity,target_decision_id:m.supersedes.decision_id,
          status:found?'decision_found':'decision_not_found',capabilities:['receive','hold','capability_probe','cancel_pending'],cancellation:true,
          coordinator_signature_required:true};
        if(m.reply_channel==='ledger') response.reply_channel='ledger';
        this.protocolExit(r,'probe_replied','capability_probe');
        this.completeRow({...r,expects_reply:1},'capability_response',{kind:'receiver-code'},JSON.stringify(response),m.reply_channel==='ledger');
        return {action:'terminal'};
      }
      if(reason==='awaiting_cancellation') this.db.prepare('INSERT INTO decision_index VALUES(?,?,?)').run(receiver,m.decision_id,id);
      this.audit(id,'envelope_held',reason);


      if(reason!=='awaiting_cancellation') this.addOutbox(id+':envelope-held',id,'a2a',`УДЕРЖАНО ${id}: ${reason}. Получатель ${receiver}, ledger ${identity}. Предел 24 ч назначен координатором, не замерен. Решение: receipt-admin release-text (отмена НЕ выполняется) или reject-envelope с оператором и основанием. Автоисполнения нет.`);
      return {action:'held',reason};
    });
  }
  // RU: prepare: Закрепляет подготовленное состояние перед внешним действием; повтор использует сохранённую идентичность.
// EN: prepare: Pins prepared state before external action; retries reuse the stored identity.
prepare(id, makeMessage, session, routeKey) {
    return this.tx(() => {
      const r = this.get(id); if (!r || r.blocked || r.finished_at !== null) throw Error('Receipt не готов к исполнению');
      if (r.message_json) {
        if (r.session_id !== session.id || r.session_created !== session.header.createdAt) throw Error('История сессии сменилась: повтор не разрешён');
        return JSON.parse(r.message_json);
      }
      const message = typeof makeMessage === 'function' ? makeMessage() : makeMessage;
      if (!message?.id) throw Error('Требуется ID сообщения DSH');
      this.db.prepare('UPDATE receipts SET message_json=?,dsh_id=?,session_id=?,session_created=?,route_key=? WHERE id=?')
        .run(JSON.stringify(message), message.id, session.id, session.header.createdAt, String(routeKey), id);
      this.audit(id, 'prepared', message.id); return message;
    });
  }
  // RU: queue: Создаёт устойчивую очередь по идентичности; внешнее исполнение отдельно от записи intent.
// EN: queue: Creates a stable identity-based queue; external execution remains separate from intent persistence.
async queue(id, { contains, send, flush }) {
    const r = this.get(id); if (!r?.message_json || r.blocked || r.finished_at !== null) throw Error('Receipt не готов к постановке');
    const first = this.tx(() => {
      const won = this.db.prepare('UPDATE receipts SET dispatch_started=1 WHERE id=? AND dispatch_started=0').run(id).changes === 1;
      if (won) this.audit(id, 'dispatch_started'); return won;
    });
    if (first) await send(JSON.parse(r.message_json));
    else if (!contains(r.dsh_id)) { this.db.prepare("UPDATE receipts SET blocked='dispatch_unknown' WHERE id=?").run(id); this.audit(id, 'outcome_unknown', 'Нет DSH ID после начатой передачи'); throw Error('Исход передачи неизвестен; автоматический повтор запрещён'); }
    if (await flush() !== true) throw Error('Нет подтверждённого участника persistence');
    if (!contains(r.dsh_id)) throw Error('Flush не подтверждает это сообщение');
    this.tx(() => { this.db.prepare('UPDATE receipts SET flushed_at=? WHERE id=?').run(this.now(), id); this.audit(id, 'queued_flushed'); });
  }
  // RU: release: Освобождает источник после доказанной постановки, сохраняя архив/след для восстановления.
// EN: release: Releases a source after evidenced dispatch while retaining recovery trace/archive.
release(id, sourceKey) {
    const r = this.get(id), src = this.source(sourceKey);
    if (!r || !src || src.receipt_id !== id || !src.path) throw Error('Источник не связан с receipt');
    if (r.flushed_at === null && (r.finished_at === null || r.message_json!==null)) throw Error('not flushed: source retained');
    if (!r.raw || hash(Buffer.from(r.raw)) !== src.raw_sha) throw Error('Приёмные байты не подтверждены');
    const dir = path.join(this.root, 'released'); fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    if (fs.lstatSync(dir).isSymbolicLink()) throw Error('Архив является ссылкой');
    const target = path.join(dir, hash(Buffer.from(sourceKey)) + '.source');
    if (src.source_released) {
      if (!fs.existsSync(src.path)) return;
      throw Error('Освобождённый путь появился снова: требуется новая проверка, не удаляю');
    }
    if (!fs.existsSync(src.path)) {
      if (!fs.existsSync(target) || hash(fs.readFileSync(target)) !== src.raw_sha) throw Error('Источник исчез без подтверждённого архива');
    } else {
      if (fs.lstatSync(src.path).isSymbolicLink() || hash(fs.readFileSync(src.path)) !== src.raw_sha) throw Error('Источник изменён: оставлен');
      if (fs.existsSync(target)) throw Error('Архив уже существует; источник сохранён для разбора');

      fs.renameSync(src.path, target);
      if (hash(fs.readFileSync(target)) !== src.raw_sha) throw Error('Перемещённые байты изменены: сохранены для разбора');
    }
    this.tx(() => { this.db.prepare('UPDATE sources SET source_released=1,released_at=?,archive_path=? WHERE source_key=?').run(this.now(), target, sourceKey); this.audit(id, 'source_released', target); });
  }
  // RU: managed: Выбирает receipts точной session identity для сверки хода.
// EN: managed: Selects receipts for an exact session identity during turn reconciliation.
managed(sessionId) { return this.db.prepare('SELECT * FROM receipts WHERE session_id=? AND dsh_id IS NOT NULL').all(String(sessionId)); }
  // RU: reconcile: Сопоставляет состояния ledger с событиями и устанавливает доказанный исход.
// EN: reconcile: Reconciles ledger state against session events to establish evidenced outcomes.
reconcile(session, gateTurn = null, recovering = false, returnPaths) {
    const rows = this.managed(session.id); if (!rows.length) return [];
    const claimed = [];
    const facts = receiptFacts(session, rows.map(r => r.dsh_id)); let replay = false;
    let events;
    const hasBacklog=this.db.prepare("SELECT count(*) AS n FROM sqlite_master WHERE type='table' AND name IN ('mail_stop_backlog','mail_stop_controls')").get().n===2;
    const replaceHold=hasBacklog?this.db.prepare(`SELECT c.control_id,c.started_at FROM mail_stop_backlog b
      JOIN mail_stop_controls c ON c.control_id=b.control_id AND c.session_id=b.session_id AND c.session_created=b.session_created
      WHERE b.session_id=? AND b.session_created=? AND b.message_id=? AND c.mode='replace' AND c.state='complete'
        AND c.native_terminal=1 AND c.sdk_terminal=1 AND c.resume_proven=1 AND c.replacement_message<>b.message_id`):null;
    this.tx(() => {
      for (const r of rows) {
        const f = facts.get(r.dsh_id);
        if (r.blocked==='cancel_pending') continue;
        const hasSdk=this.db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='sdk_inputs'").get();
        const sdk=hasSdk?this.db.prepare('SELECT * FROM sdk_inputs WHERE receipt_id=?').get(r.id):null;
        if(sdk&&sdk.state!=='not_offered'){
          const admission=sdk.admission_json?JSON.parse(sdk.admission_json):null;
          const inputEvent=admission&&sobytiyaSessii(session).find(e=>e.seq===admission.user_seq&&e.type==='user/message'&&e.data.id===r.dsh_id);
          if(sdk.state!=='admitted')continue;
          if(!inputEvent||admission.message_id!==r.dsh_id||admission.body_sha!==sdk.body_sha||crypto.createHash('sha256').update(stableJson(inputEvent.data)).digest('hex')!==sdk.body_sha||admission.turn!==sdk.turn||f.claims.length!==1||f.claims[0].turn!==sdk.turn||f.claims[0].seq!==admission.removed_seq||admission.user_seq<=admission.removed_seq){
            this.db.prepare("UPDATE sdk_inputs SET state='unknown',reason='invalid_admission_fact' WHERE receipt_id=?").run(r.id);
            this.db.prepare("UPDATE receipts SET blocked='sdk_input_unknown' WHERE id=? AND finished_at IS NULL").run(r.id);continue;
          }
        }

        if (r.session_created !== session.header.createdAt) throw Error('Ledger связан с другой историей той же сессии');
        if (f.claims.length > 1 || f.claims.some(c => c.turn === null)) {
          this.db.prepare("UPDATE receipts SET blocked='duplicate_claim' WHERE id=?").run(r.id);
          if (gateTurn !== null && f.claims.some(c => c.turn === gateTurn)) replay = true;
          continue;
        }
        if (f.claims.length) {
          const turn = f.claims[0].turn;
          if (!f.end && (r.execution_owner ? r.execution_owner !== this.owner : recovering)) {


            this.db.prepare("UPDATE receipts SET blocked='interrupted_unknown' WHERE id=?").run(r.id);
            if (gateTurn !== null && turn === gateTurn) replay = true;
            continue;
          }
          if (r.claimed_turn !== null && r.claimed_turn !== turn) { replay = true; continue; }

          const taken = Number.isSafeInteger(f.claims[0].time) ? f.claims[0].time : null;
          const changed = this.db.prepare('UPDATE receipts SET claimed_turn=?,claimed_at=?,execution_owner=COALESCE(execution_owner,?) WHERE id=? AND claimed_turn IS NULL').run(turn, taken, this.owner, r.id).changes;
          if (changed === 1) {
            this.audit(r.id, 'claimed', JSON.stringify({ turn, taken_at: taken, recovered: recovering }));
            const released = this.db.prepare('SELECT MIN(released_at) AS at FROM sources WHERE receipt_id=? AND source_released=1').get(r.id).at;
            claimed.push({ receipt: r.id, dsh_id: r.dsh_id, session: session.id, turn,
              received_at: r.received_at, flushed_at: r.flushed_at, released_at: released,
              taken_at: taken, lag_ms: taken !== null && released !== null ? taken - released : null,
              recovered: recovering });
          }
        }
        if (r.finished_at !== null) continue;
        // BETA-RCPT: classify only an unclaimed ordinary letter in the exact completed replace generation.
        if(r.route==='a2a' && r.dispatch_started && !r.channel_started && r.claimed_turn===null && !r.blocked
          && !f.claims.length && !f.canceled) {
          const hold=replaceHold?.get(r.session_id,r.session_created,r.dsh_id);
          if(hold && !(events??=sobytiyaSessii(session).slice(nasledovanoSessii(session))).some(e=>e.type==='user/message'&&e.data?.id===r.dsh_id)) {
            const changed=this.db.prepare(`UPDATE receipts SET blocked='held_by_replace'
              WHERE id=? AND session_id=? AND session_created=? AND dsh_id=? AND dispatch_started=1 AND channel_started=0
                AND claimed_turn IS NULL AND finished_at IS NULL AND blocked IS NULL`).run(r.id,r.session_id,r.session_created,r.dsh_id).changes;
            if(changed!==1)continue;
            if(!this.db.prepare("SELECT 1 FROM audit WHERE receipt_id=? AND kind='held_by_replace'").get(r.id)) {
              const detail={control_id:hold.control_id,dsh_id:r.dsh_id,held_since:hold.started_at,classified_at:this.now()};
              const destination=cancellationReturn(r,this,returnPaths);
              if(destination && destination.kind!=='none') {
                const key=r.id+':held-by-replace';
                const text=`письмо ${r.dsh_id} НЕ исполнено: удержано replace-STOP ${hold.control_id} в ${new Date(hold.started_at).toISOString()}; решение — за вами`;
                this.addOutbox(key,r.id,'new-return',JSON.stringify({kind:'held_by_replace',command:hold.control_id,destination,text}));
                if(destination.kind==='unknown')this.db.prepare('UPDATE outbox SET error=? WHERE id=?').run('HOLD: '+destination.reason,key);
              }
              this.audit(r.id,'held_by_replace',JSON.stringify(detail));
            }
            continue;
          }
        }
        if (f.canceled && !f.claims.length) this.completeRow(r, 'canceled_before_run', [], 'Сообщение отменено в очереди до исполнения.');
        else if (f.end) {
          const text = f.outputs.map(x => (x.message?.content ?? []).filter(b => b.type === 'text').map(b => b.text).join('\n')).filter(Boolean).join('\n\n');
          const kind = f.end.reason?.kind;


          const outcome = kind === 'completed' && text ? (sdk?.state==='admitted'?'sdk_input_response':'turn_completed') : kind === 'completed' ? 'no_result' : 'interrupted_unknown';
          this.completeRow(r, outcome, { end: f.end, outputs: f.outputs }, text || `Ход завершён без подтверждённого ответа: ${kind ?? 'неизвестно'}. Автоповтор работы отключён.`);
        }
      }
    });
    if (replay) throw Error('Повторное исполнение сообщения заблокировано');
    return claimed;
  }
  // RU: completeRow: Фиксирует исход и создаёт ответ отдельно; delivery успех не подменяет исполнение.
// EN: completeRow: Persists the outcome and independently queues its response; delivery does not substitute for execution.
completeRow(r, outcome, evidence, body, machineOnly = false) {
    const response = `[ответ по receipt ${r.id}; ${outcome}]\n\n${body}`;
    this.db.prepare('UPDATE receipts SET finished_at=?,outcome=?,result_json=? WHERE id=?').run(this.now(), outcome, JSON.stringify({ ...evidence, [machineOnly ? 'machineReplyBody' : 'ownerReplyBody']: response }), r.id);
    this.audit(r.id, 'turn_finished', outcome);
    if(r.expects_reply && !machineOnly){
      const chat=this.spoolTelegramReply(r.id);
      if(chat===undefined)this.addOutbox(r.id + ':result',r.id,r.route,response);
      else if(['turn_completed','sdk_input_response'].includes(outcome)&&typeof body==='string'&&body.trim())
        this.addOutbox(r.id + ':result',r.id,'spool-tg',body);
    }
    else if(outcome === 'interrupted_unknown' && !machineOnly)this.statusPreryvaniya(r, evidence?.end);
    if(outcome === 'interrupted_unknown' && !machineOnly)this.pometkaVladelcu(r, evidence?.end);
  }
  // RU: pometkaVladelcu: B-N-1619 остаток — красная строка владельцу об оборванном ходе, свёрнутая по классу причины.
// EN: pometkaVladelcu: B-N-1619 remainder — red owner line about an interrupted turn, folded per cause class.
pometkaVladelcu(r, end) {
    if (mashinnoePismo(r)) { this.audit(r.id, 'interrupt_owner_skipped', 'machine'); return; }
    const k = klassPreryvaniya(end);
    const imya = k.kod === 'prochee' ? `прочее (${String(end?.reason?.kind ?? 'неизвестно').slice(0, 40)})` : k.imya;
    const copyMode=this.outboxCopyMode();
    const kluch = `interrupt-owner:${k.kod}${copyMode===null?'':':'+copyMode}`;
    const stroka = `\n- ${r.id} (${r.route}${r.route === 'a2a' && r.sender ? ', от ' + String(r.sender).slice(0, 40) : ''})`;
    const open = this.db.prepare('SELECT id,body FROM outbox WHERE id>=? AND id<? AND sent_at IS NULL AND attempts=0 ORDER BY created_at LIMIT 1').get(kluch + ':', kluch + ';');
    if (open) {
      const m = /\n… и ещё (\d+) \(все id — в журнале квитанций\)$/.exec(open.body);
      const idov = open.body.split('\n').filter(s => s.startsWith('- ')).length;
      const body = (idov < OBORVAN_POTOLOK ? open.body + stroka
        : (m ? open.body.slice(0, m.index) : open.body) + `\n… и ещё ${m ? Number(m[1]) + 1 : 1} (все id — в журнале квитанций)`)
        .replace(OBORVAN_CHISLO, (_, n) => `\nНе исполнено писем: ${Number(n) + 1} —`);
      this.db.prepare('UPDATE outbox SET body=? WHERE id=?').run(body, open.id); this.audit(r.id, 'interrupt_owner_folded', open.id); return;
    }
    const id = `${kluch}:${this.now()}`;
    const body = `${OBORVAN_METKA}: ${imya}${k.sbros ? `; сброс: ${k.sbros}` : ''}${this.agentName ? `; агент: ${this.agentName}` : ''}`
      + `\nНе исполнено писем: 1 — повтора нет; переподать, если поручение в силе:${stroka}`;
    if(this.addOutbox(id,r.id,'copy-tg',body).changes)this.db.prepare('UPDATE outbox SET next_at=? WHERE id=?').run(this.now()+PRERYV_SVERTKA_MS,id);
    this.audit(r.id, 'interrupt_owner_queued', id);
  }
  // RU: statusPreryvaniya: B-N-1619 (1) — статус прерывания отправителю со свёрткой; письмо не повторяется.
// EN: statusPreryvaniya: B-N-1619 (1) — folded interruption status to the sender; the letter is not replayed.
statusPreryvaniya(r, end) {
    const marshrut = r.route === 'a2a' ? 'a2a' : r.route === 'tg' ? 'copy-tg' : null;
    if (!marshrut) { this.audit(r.id, 'interrupt_status_skipped', 'route ' + r.route); return; }
    if (mashinnoePismo(r)) { this.audit(r.id, 'interrupt_status_skipped', 'machine'); return; }
    const k = klassPreryvaniya(end), copyMode=this.outboxCopyMode(), kluch = `interrupt-status:${marshrut}:${r.sender ?? ''}:${k.kod}${copyMode===null?'':':'+copyMode}`;
    const open = this.db.prepare('SELECT id,body FROM outbox WHERE id>=? AND id<? AND sent_at IS NULL AND attempts=0 ORDER BY created_at LIMIT 1').get(kluch + ':', kluch + ';');
    if (open) { this.db.prepare('UPDATE outbox SET body=? WHERE id=?').run(open.body + `\n- ${r.id}`, open.id); this.audit(r.id, 'interrupt_status_folded', open.id); return; }
    const id = `${kluch}:${this.now()}`;
    const body = `${PRERYV_METKA}\nПисьмо не исполнено до конца: ход прерван — ${k.imya}${k.sbros ? `; сброс: ${k.sbros}` : ''}. Отправитель: ${r.sender || 'координатор'}.\nПовтора нет (at-most-once): переподай, если поручение в силе.\nКвитанции:\n- ${r.id}`;
    if(this.addOutbox(id,r.id,marshrut,body).changes)this.db.prepare('UPDATE outbox SET next_at=? WHERE id=?').run(this.now()+PRERYV_SVERTKA_MS,id);
    this.audit(r.id, 'interrupt_status_queued', id);
  }
  // RU: completeLocal: Завершает ещё открытый receipt результатом локального handler один раз.
// EN: completeLocal: Completes an open receipt once with a local-handler result.
completeLocal(id, outcome, body) { return this.tx(() => { const r = this.get(id); if (!r || r.finished_at !== null) return; this.completeRow(r, outcome, { kind: 'channel-handler' }, body); }); }
  // RU: beginChannel: Ставит право обработки handler транзакционно, только для незаблокированного открытого receipt.
// EN: beginChannel: Claims channel-handler processing transactionally only for an unblocked open receipt.
beginChannel(id) { return this.tx(() => this.db.prepare('UPDATE receipts SET channel_started=1,channel_owner=? WHERE id=? AND channel_started=0 AND blocked IS NULL AND finished_at IS NULL').run(this.owner,id).changes === 1); }
  // RU: addOutbox: INSERT OR IGNORE по устойчивому ключу предотвращает вторую логическую запись исходящего.
// EN: addOutbox: INSERT OR IGNORE on a durable key prevents duplicate logical outgoing entries.
outboxCopyMode() {
    const mode=this.ownerCopyMode?.()??null;
    if(mode!==null&&!['personal','broadcast','owner-all'].includes(mode))throw Error('Unknown outgoing copy mode');
    if(mode!==null&&!this.hasOwnerCopyMode)throw Error('Outgoing copy mode requires ledger migration');
    return mode;
  }
addOutbox(key, id, route, body) {
    const mode=this.outboxCopyMode();
    if(this.hasOwnerCopyMode)return this.db.prepare('INSERT OR IGNORE INTO outbox(id,receipt_id,route,body,created_at,next_at,owner_copy_mode) VALUES(?,?,?,?,?,?,?)').run(key,id,route,body,this.now(),this.now(),mode);
    return this.db.prepare('INSERT OR IGNORE INTO outbox(id,receipt_id,route,body,created_at,next_at) VALUES(?,?,?,?,?,?)').run(key,id,route,body,this.now(),this.now());
  }
  // RU: notice: Ставит устойчивую служебную квитанцию, не повторяет основной ход.
// EN: notice: Queues a durable service notice without replaying the primary turn.
notice(id, suffix, body) { return this.tx(() => this.addOutbox(id + ':' + suffix, id, 'a2a', body)); }
  // RU: holdTick: Публикует ограниченные уведомления и deadline-исходы удержанных записей, не исполняет их автоматически.
// EN: holdTick: Publishes bounded hold notices/deadline outcomes without automatically executing held work.
holdTick() {
    return this.tx(() => {
      for(const e of this.db.prepare("SELECT receipt_id FROM protocol_envelopes WHERE state='held' AND deadline_at<=?").all(this.now())) {
        const r=this.get(e.receipt_id); if(!r || r.finished_at!==null) continue;
        this.protocolExit(r,'rejected','hold_deadline');
        this.completeRow({...r,expects_reply:1},'envelope_rejected',{kind:'hold_deadline'},'ОТКАЗ: истекли назначенные 24 часа удержания; распоряжение не исполнялось.');
      }
      for (const r of this.db.prepare("SELECT * FROM receipts WHERE blocked IS NOT NULL AND blocked<>'held_by_replace' AND finished_at IS NULL").all()) {
        if (r.hold_notices < HOLD_ALERT_MS.length && this.now() - r.received_at >= HOLD_ALERT_MS[r.hold_notices]) {
          const stage = r.hold_notices;
          this.addOutbox(r.id + ':held:' + stage, r.id, 'a2a', `УДЕРЖАНО ${r.id}: ${r.blocked}. Возраст ${Math.floor((this.now()-r.received_at)/1000)} сек. ${stage===2?'СРОК РАЗБОРА 24 ЧАСА ИСТЁК. ':''}Разбирает ${this.reviewer}. ${r.blocked==='legacy_ambiguous'?'Решение: approve-new или discard через receipt-admin.':r.blocked==='invalid_utf8'?'Нужна ручная сверка исхода; после неё — discard через receipt-admin (оператор и ссылка обязательны), исполнения не будет.':r.blocked==='channel_interrupted'&&!r.dispatch_started?'Приём оборван перезапуском до выдачи агенту; после сверки — discard через receipt-admin (оператор и ссылка обязательны), исполнения не будет.':['channel_unknown','dispatch_unknown'].includes(r.blocked)&&!r.dispatch_started&&r.session_id===null&&r.claimed_turn===null?'Обработчик отказал до выдачи агенту; после сверки — discard через receipt-admin (оператор и ссылка обязательны), исполнения не будет.':'Нужна ручная сверка исхода; автоматическое разрешение этой причины запрещено.'} Исходник и запись сохранены; автоматического исполнения нет.`);
          this.db.prepare('UPDATE receipts SET hold_notices=hold_notices+1 WHERE id=?').run(r.id);
        }
      }
      const day = String(Math.floor(this.now()/86400000));
      const last = this.db.prepare("SELECT value FROM meta WHERE key='held_day'").get()?.value;
      if (last !== day) {
        const rows = this.db.prepare(`SELECT id,blocked,received_at FROM receipts WHERE blocked IS NOT NULL AND finished_at IS NULL
          AND (blocked<>'held_by_replace' OR EXISTS(SELECT 1 FROM outbox o WHERE o.id=receipts.id||':held-by-replace'
            AND o.route='new-return' AND json_extract(o.body,'$.destination.kind')='unknown'))`).all();
        if (rows.length) this.addOutbox('held-summary:'+day, null, 'a2a', 'УДЕРЖАНО: '+rows.length+'. Читатель и рука разбора — '+this.reviewer+'.\n'+rows.map(r=>`${r.id}: ${r.blocked}, возраст ${Math.floor((this.now()-r.received_at)/3600000)} ч`).join('\n'));
        this.db.prepare("INSERT INTO meta VALUES('held_day',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(day);
      }
    });
  }
  // RU: resolve: Применяет явное операторское решение к удержанному receipt.
// EN: resolve: Applies an explicit operator decision to a held receipt.
resolve(id, action, operator, reference) {
    if (!operator || !reference || !['approve-new','discard','release-text','reject-envelope'].includes(action)) throw Error('Требуются действие, оператор и ссылка на решение');
    return this.tx(() => {
      const r = this.get(id);
      if(['release-text','reject-envelope'].includes(action)) {
        const e=this.db.prepare('SELECT * FROM protocol_envelopes WHERE receipt_id=?').get(id);
        if(!r || !e || e.state!=='held' || r.blocked!=='envelope_held' || r.dispatch_started || r.finished_at!==null || this.now()>=e.deadline_at) throw Error('Конверт не допускает это решение');
        if(action==='release-text' && e.cancel_phase!==null) throw Error('Исход отмены неизвестен: сначала сверка, выпуск текста запрещён');
        if(action==='release-text' && !e.body_text.trim()) throw Error('Текст для выпуска пуст');
        this.protocolExit(r,action==='release-text'?'released_text':'rejected',action);
        if(action==='reject-envelope') this.completeRow({...r,expects_reply:1},'envelope_rejected',{operator,reference},'Отказ оператора; распоряжение не исполнялось.');
        else this.addOutbox(id+':released-text',id,'a2a',`ВЫПУЩЕНО КАК ТЕКСТ ${id}; связь отмены не выполняется. Оператор ${operator}.`);
        this.audit(id,'operator_'+action,JSON.stringify({operator,reference,uid:process.getuid?.()})); return;
      }


      const bityj = r && r.blocked === 'invalid_utf8' && action === 'discard' && r.finished_at === null;
      const signatureDiscard = r && r.blocked === 'signature_reauthorization_required' && action === 'discard' && r.finished_at === null && r.session_id === null && r.claimed_turn === null;
      // B-N-1814: приём оборван перезапуском службы (channel_interrupted) до выдачи агенту — закрыть без исполнения.
      const prervanDoVydachi = r && r.blocked === 'channel_interrupted' && action === 'discard' && r.finished_at === null && !r.dispatch_started && r.session_id === null && r.claimed_turn === null;
      // A-N-1948 №2 (№1): обработчик отказал (channel_unknown) или передача не подтверждена (dispatch_unknown) ДО выдачи агенту —
      //   закрыть без исполнения. Прежде такой записи не было выхода: удержание навсегда, «УДЕРЖАНО» каждые сутки.
      const otkazDoVydachi = r && ['channel_unknown', 'dispatch_unknown'].includes(r.blocked) && action === 'discard' && r.finished_at === null && !r.dispatch_started && r.session_id === null && r.claimed_turn === null;
      if (!r || (r.blocked !== 'legacy_ambiguous' && !bityj && !signatureDiscard && !prervanDoVydachi && !otkazDoVydachi) || r.dispatch_started) throw Error('Эта запись не допускает такого разрешения');
      if (action === 'approve-new') this.db.prepare('UPDATE receipts SET blocked=NULL WHERE id=?').run(id);
      else { this.db.prepare('UPDATE receipts SET blocked=NULL WHERE id=?').run(id); this.completeRow(r,'operator_discarded',{},prervanDoVydachi?'Сообщение не было принято из-за перезапуска агента — пришлите, пожалуйста, ещё раз':'Отменено оператором, не исполнялось.'); }
      this.audit(id, 'operator_'+action, JSON.stringify({ operator, reference, uid: process.getuid?.() }));
    });
  }
  // RU: status: Возвращает измеренный snapshot состояния; не обещает внешнего получения сообщения.
// EN: status: Returns an observed state snapshot rather than promising external receipt.
status() { return receiptHoldStatus(this.db,this.db.prepare('SELECT receipts.id,source_key,received_at,hold_notices,blocked,claimed_turn,'+(this.hasClaimedAt?'claimed_at':'NULL AS claimed_at')+',finished_at,outcome,protocol_envelopes.state AS envelope_state,protocol_envelopes.reason AS envelope_reason,deadline_at,hold_duration_ms,exit_reason FROM receipts LEFT JOIN protocol_envelopes ON receipts.id=protocol_envelopes.receipt_id LEFT JOIN sources ON receipts.id=sources.receipt_id ORDER BY received_at').all()); }
  // RU: pending: Отбирает незавершённые записи для восстановления без повторного исполнения завершённых.
// EN: pending: Selects unfinished records for recovery without rerunning completed work.
pending() { return this.db.prepare('SELECT * FROM receipts WHERE finished_at IS NULL AND session_id IS NOT NULL').all(); }
  // RU: deliverResults: Резервирует попытку outbox до отправки и сохраняет sent/error; ограниченные повторы не повторяют работу модели.
// EN: deliverResults: Reserves an outbox attempt before dispatch and records sent/error; bounded delivery retries do not rerun model work.
async deliverResults(deliver, { copyOnly = false } = {}) {
    for (const r of this.db.prepare("SELECT * FROM outbox WHERE sent_at IS NULL AND attempts<? AND next_at<=? AND (route='copy-tg')=? AND NOT(route='new-return' AND coalesce(error,'') LIKE 'HOLD:%') ORDER BY created_at LIMIT 20").all(RETRY_SECONDS.length,this.now(),copyOnly?1:0)) {
      const reserved = this.tx(() => this.db.prepare('UPDATE outbox SET attempts=attempts+1,next_at=? WHERE id=? AND attempts=? AND sent_at IS NULL')
        .run(r.created_at + (RETRY_SECONDS[r.attempts+1] ?? 600)*1000,r.id,r.attempts).changes===1);
      if (!reserved) continue;
      try { await deliver(r); this.db.prepare("UPDATE outbox SET sent_at=?,error=CASE WHEN route='new-return' THEN NULL ELSE error END WHERE id=?").run(this.now(),r.id); this.audit(r.receipt_id,'response_delivered',r.route); }
      catch(e) { this.db.prepare('UPDATE outbox SET error=? WHERE id=?').run(String(e?.message??e),r.id); this.audit(r.receipt_id,'response_delivery_failed',String(r.attempts+1)); }
    }
  }
  // RU: heartbeat: Обновляет отметку живого читателя, PID и владельца; это не подтверждение доставки каждого письма.
// EN: heartbeat: Updates reader liveness,PID,and owner metadata; not proof of delivery for every message.
heartbeat() { this.db.prepare("INSERT INTO meta VALUES('heartbeat',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(JSON.stringify({at:this.now(),owner:this.owner,pid:process.pid})); }
  // RU: expireBodies: Затирает подходящие30-суточные тела и дубли порциями50, сохраняя учёт и недоставленные данные.
// EN: expireBodies: Erases eligible30-day bodies and duplicates in50-item batches while preserving metadata and undelivered data.
expireBodies() {


    const cutoff=this.now()-BODY_RETENTION_MS;
    const rows=this.db.prepare(`SELECT * FROM receipts WHERE raw IS NOT NULL AND finished_at<? AND body_at<?
      AND NOT EXISTS(SELECT 1 FROM sources WHERE receipt_id=receipts.id AND source_released=0 AND path IS NOT NULL)
      AND NOT EXISTS(SELECT 1 FROM outbox WHERE receipt_id=receipts.id AND (sent_at IS NULL OR sent_at>=?)) LIMIT ?`).all(cutoff,cutoff,cutoff,BODY_EXPIRE_BATCH);
    const est=t=>!!this.db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(t);
    if(rows.length){
      this.db.exec('PRAGMA secure_delete=ON');
      try{
        for(const r of rows) {
          for(const src of this.db.prepare('SELECT * FROM sources WHERE receipt_id=? AND archive_path IS NOT NULL').all(r.id)) {
            if(fs.existsSync(src.archive_path)) {
              const st=fs.lstatSync(src.archive_path);
              if(st.isSymbolicLink()||hash(fs.readFileSync(src.archive_path))!==src.raw_sha)throw Error('Архив изменился: уборка отказана');
              fs.unlinkSync(src.archive_path);
            }
          }
        }


        const G=est('guest_conversations'),P=est('protocol_envelopes'),K=est('task_controls');
        const qGost=G?this.db.prepare('SELECT 1 FROM guest_conversations WHERE receipt_id=? AND (question_queued=0 OR answer_queued=0)'):null;
        const qRec=this.db.prepare(`UPDATE receipts SET raw=NULL,
              message_json=CASE WHEN message_json IS NULL THEN NULL ELSE json_object('id',dsh_id,'istekla',1) END,
              result_json=CASE WHEN ?=0 AND json_valid(result_json) THEN json_remove(result_json,'$.ownerReplyBody','$.machineReplyBody') ELSE result_json END
              WHERE id=?`);
        const qOut=this.db.prepare("UPDATE outbox SET body='' WHERE receipt_id=? AND sent_at IS NOT NULL");
        const qGq=G?this.db.prepare("UPDATE guest_conversations SET question='' WHERE receipt_id=?"):null;
        const qEnv=P?this.db.prepare("UPDATE protocol_envelopes SET body_text='' WHERE receipt_id=?"):null;
        const qTask=K?this.db.prepare("UPDATE task_controls SET body_text='' WHERE receipt_id=?"):null;
        this.tx(()=>{ for(const r of rows) {

            const gostZhdyot=!!qGost?.get(r.id);
            qRec.run(gostZhdyot?1:0,r.id);
            qOut.run(r.id);
            if(qGq&&!gostZhdyot)qGq.run(r.id);
            qEnv?.run(r.id); qTask?.run(r.id);
            this.audit(r.id,'body_retention_elapsed','identity tombstone retained; text duplicates cleared'+(gostZhdyot?'; guest copy pending: reply body kept':''));
        } });
      }finally{this.db.exec('PRAGMA secure_delete=OFF');}
      this.vacuumNeeded=true;
    }

    if(this.vacuumNeeded&&rows.length<BODY_EXPIRE_BATCH&&this.now()-(this.vacuumAt??-Infinity)>=3600e3){
      this.db.exec('VACUUM');this.vacuumAt=this.now();this.vacuumNeeded=false;
      if(String(this.db.prepare('PRAGMA journal_mode').get().journal_mode).toLowerCase()==='wal')this.db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
    }
    return rows.length;
  }
  // RU: close: Освобождает принадлежащие компоненту дескрипторы/состояние без повторного исполнения работы.
// EN: close: Releases component-owned resources without replaying work.
close() { this.db.close(); }
}
