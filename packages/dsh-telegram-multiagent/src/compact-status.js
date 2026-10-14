// RU: Получает статус давления/компакта удалённого движка и форматирует наблюдение. Ошибка/отсутствие записи не маскируется нулевой занятостью; момент замера отделён от времени старого поля.
// EN: Reads remote engine context/compaction pressure and formats the observation. Errors or missing records are not reported as zero usage; measurement time is distinct from stale field timestamps.


import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
const valid = n => Number.isSafeInteger(n) && n >= 0;
const percent = (n, w) => Number.isFinite(n) && w > 0 ? `${(n / w * 100).toFixed(1)}%` : 'процент неизвестен';
export // RU: readCodexStatus: Получает статус давления/компакта удалённого движка и форматирует наблюдение. Ошибка/отсутствие записи не маскируется нулевой занятостью; момент замера отделён от времени старого поля.
// EN: readCodexStatus: Reads remote engine context/compaction pressure and formats the observation. Errors or missing records are not reported as zero usage; measurement time is distinct from stale field timestamps.
async function readCodexStatus(session, {home, dbPath}) {
  if (!home || !dbPath) throw Error('не заданы дом Codex и база соответствия сессий');
  const {DatabaseSync} = await import('node:sqlite');
  const db = new DatabaseSync(dbPath, {readOnly:true});
  let rows;
  try {
    if (String(session.id??session.header?.id??'').startsWith('telegram-v2-')) {
      const h=session.header;
      if(!h||!Number.isSafeInteger(h.createdAt)||typeof h.cwd!=='string'||!path.isAbsolute(h.cwd))throw Error('Поколение сессии не установлено');
      rows=db.prepare('SELECT sessionId FROM sessions WHERE dshId=? AND dshCreated=? AND dshCwd=? AND provider=? AND routingVersion=2')
        .all(session.id??h.id,h.createdAt,path.resolve(h.cwd),'openai');
    } else {
      const first = session.deriveMessages?.()[0];
      if (!first) throw Error('нет первого сообщения: соответствие сессий не установлено');
      const text = typeof first.content === 'string' ? first.content
        : (first.content ?? []).filter(b => b.type === 'text').map(b => b.text).join('\n');
      const key = createHash('sha256').update((first.role ?? '') + '\0' + text).digest('hex').slice(0,32);
      rows=db.prepare('SELECT sessionId FROM sessions WHERE kluch=?').all(key);
    }
  } finally { db.close(); }
  if (rows.length !== 1 || !/^[a-f0-9-]{36}$/i.test(rows[0].sessionId)) throw Error('однозначное соответствие сессий не найдено');
  const sessionId = rows[0].sessionId;
  const files = [];
  // RU: walk: Обходит структурированные данные статуса и выбирает доступные поля.
// EN: walk: Traverses structured status data to find available fields.
async function walk(dir, depth=0) {
    if(depth > 4) return;
    for(const ent of await fs.readdir(dir,{withFileTypes:true})) {
      const p=path.join(dir,ent.name);
      if(ent.isDirectory()) await walk(p,depth+1);
      else if(ent.isFile() && ent.name.endsWith(`-${sessionId}.jsonl`)) files.push(p);
    }
  }
  await walk(path.join(home,'sessions'));
  if(files.length!==1) throw Error(`журнал сессии ${sessionId}: найдено ${files.length}, нужен один`);
  let latest=null, model=null, changed=false;
  for(const line of (await fs.readFile(files[0],'utf8')).split('\n')) {
    if(!line) continue;
    let e;try{e=JSON.parse(line);}catch{changed=true;continue;}
    const p=e.payload ?? e;
    if(e.type==='turn_context' && p.model) model=p.model;
    if(p.type==='token_count' && p.info) {
      const u=p.info.last_token_usage;
      if(!u || !valid(u.input_tokens) || !valid(u.output_tokens) || !valid(u.cached_input_tokens)
        || u.cached_input_tokens>u.input_tokens || !valid(p.info.model_context_window) || !p.info.model_context_window
        || !Number.isFinite(Date.parse(e.timestamp))) {latest=null;changed=true;continue;}
      latest={input:u.input_tokens,output:u.output_tokens,total:u.input_tokens+u.output_tokens,cache:u.cached_input_tokens,
        window:p.info.model_context_window,timestamp:e.timestamp,model,sessionId,file:path.basename(files[0])};
      changed=false;
    } else if(e.type==='compacted' || e.type==='response_item' || (e.type==='turn_context' && latest)
      || ['task_started','user_message'].includes(p.type)) changed=true;
  }
  if(!latest) throw Error('нет годного token_count последнего вызова');
  return {...latest,changed};
}


// RU: shortReason: Форматирует ограниченное пояснение отказа без подмены отсутствующей причины.
// EN: shortReason: Formats bounded refusal explanations without inventing missing causes.
function shortReason(value) {
  const text = String(value ?? '').replace(/\s+/gu, ' ').trim();
  if (Array.from(text).length <= 120) return text;
  let result = '', length = 0;
  for (const {segment} of new Intl.Segmenter('ru', {granularity:'grapheme'}).segment(text)) {
    const size = Array.from(segment).length;
    if (length + size > 119) break;
    result += segment; length += size;
  }
  return result + '…';
}
export // RU: formatStatus: Связывает измерения и время в пользовательский статус, сохраняя неопределённость.
// EN: formatStatus: Formats measurements and timestamps while retaining uncertainty.
function formatStatus({now=Date.now(),codex,codexError,contextStatus,sessionId,model,window,windowError,measurement:m,freshness,configs=[],configError,running}) {


  const n = v => Number.isFinite(v) ? v.toLocaleString('ru-RU') : '?';
  const pc = (v, base) => Number.isFinite(v) && base > 0 ? (v/base*100).toFixed(1)+'%' : '?';
  const lines = [];


  const sampled=contextStatus?.supported&&contextStatus.state==='measured';
  const idle=running===false&&!(contextStatus?.supported&&contextStatus.active===true);
  const inTurn=!idle&&contextStatus?.supported&&contextStatus.active===true;
  const measuredAt=sampled?Date.parse(contextStatus.timestamp):!contextStatus?.supported&&freshness?.kind==='svezhaya'&&m?.baseline?.kind==='usage'&&Number.isSafeInteger(freshness.usageAt)&&freshness.usageAt>0&&freshness.usageAt<=now+5000?freshness.usageAt:NaN;
  lines.push(Number.isFinite(measuredAt)?`снято ${new Intl.DateTimeFormat('ru-RU',{timeZone:'Europe/Moscow',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).format(new Date(measuredAt))} МСК`:'время замера не установлено (МСК)');
  lines.push((sampled?contextStatus.model??model?.model:idle?model?.model:codex?.model??model?.model)??'модель не установлена');
  if(inTurn)lines[0]+=' (снято внутри хода)';
  else if(idle&&!sampled)lines[1]+=' (хода нет)';
  const unavailable=idle||contextStatus?.state==='measured'?null:codexError||contextStatus?.reason;



  if(sampled&&contextStatus.window>0)window=contextStatus.window;
  let porog = null, dolya = null, prichina = null;
  if (configError) prichina = `ошибка движка (${configError})`;
  else if (configs.length === 0) prichina = 'движок не ответил';
  else if (configs.length > 1) prichina = `неоднозначные ответы движков: ${configs.length}`;
  else {
    const c = configs[0];
    const p = c.modelPolicies?.find(p => p.provider === model?.provider && p.model === model?.model);
    dolya = p?.thresholdRatio ?? c.thresholdRatio;
    if (!(Number.isFinite(dolya) && dolya > 0 && dolya <= 1)) { dolya = null; prichina = 'доля негодна'; }
    else if (!(window > 0)) prichina = windowError ?? 'окно не объявлено';
    else porog = Math.floor(window * dolya);
  }


  if(sampled){
    porog=contextStatus.threshold??porog;
    if(contextStatus.threshold!=null)dolya=window>0?porog/window:null;
  }
  const compactUnknown=contextStatus&&freshness?.kind==='ustarela'&&freshness.kompakt>=0&&!contextStatus.supported;
  const unknown=contextStatus?.supported&&!sampled||compactUnknown;
  const stateReason=unknown?(contextStatus.afterCompact||compactUnknown?'после сжатия, замера ещё нет'
    :contextStatus.state==='unbound'?'замер беседы не установлен'
    :contextStatus.state==='blind'?'свежий замер недоступен':'замера ещё нет'):null;
  const opora = sampled?contextStatus.inputTokens:unknown?undefined:m?.baseline?.tokens;

  if (!Number.isFinite(opora)) {
    lines.push(shortReason((idle?'':'причина недоступности: ')+(stateReason??'опора '+(m?.baseline?.kind??'не объявлена'))+(unavailable?' — '+unavailable:'')));
    return lines.join('\n');
  }

  if (Number.isFinite(opora)) {


    const vozrast = !idle&&!sampled&&codex?.timestamp && Number.isFinite(Date.parse(codex.timestamp))
      ? Math.floor((now - Date.parse(codex.timestamp)) / 60000) : null;
    const svyerka = !idle&&!sampled && codex && Number.isFinite(codex.total) && codex.total !== opora
      ? ` ⚠️ журнал модели ${n(codex.total)}` : '';
    lines.push(`модель ${n(opora)} · ${porog ? pc(opora, porog) : '?'}${svyerka}`
      + (vozrast != null && vozrast > 30 ? ` (замеру ${vozrast} мин)` : '')
      + (!idle&&!sampled&&codex?.changed ? ' ⚠️ после замера контекст менялся' : ''));
  } else lines.push(`модель — нет замера (${stateReason??'опора '+(m?.baseline?.kind??'не объявлена')})`);

  const dsh=unknown||contextStatus?.supported&&freshness?.kind==='ustarela'?undefined:m?.totalTokens;
  lines.push(`DSH    ${n(dsh)} · ${porog ? pc(dsh, porog) : '?'}`
    + (!idle&&freshness?.kind && freshness.kind !== 'svezhaya' ? ` ⚠️ опора ${freshness.kind}` : ''));


  if (porog) {
    const amount=sampled?contextStatus.inputTokens:dsh;
    const ostalos = Number.isFinite(amount) ? porog - amount : null;
    lines.push(`порог ${n(porog)} = ${Number.isFinite(dolya)&&dolya>0?(dolya*100).toFixed(0):'?'}% от ${n(window)}`
      + (ostalos != null ? ` · осталось ${n(ostalos)}` : contextStatus? ' · осталось ?' : '')
      + (configs[0]?.auto === false ? ' · автосжатие ВЫКЛ' : ''));
  } else {
    lines.push(`порог НЕИЗВЕСТЕН (${shortReason(prichina)}) — проценты выше не посчитаны`);
  }
  if(unavailable)lines.push(shortReason('причина недоступности: '+unavailable));
  if(!idle&&contextStatus&&!contextStatus.supported)lines.push('шлюз без поддержки свежего статуса — устарело');
  return lines.join('\n');
}
