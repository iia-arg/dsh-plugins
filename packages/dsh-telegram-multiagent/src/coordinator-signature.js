// RU: Подписывает и проверяет конверты с привязкой к получателю, ledger, ключу и сроку. Trust-store не выбирается текстом отправителя; replay и иной wire SHA отвергаются.
// EN: Signs/verifies envelopes bound to recipient, ledger, key, and expiry. Sender text cannot select the trust store; replays and mismatched wire hashes are rejected.


import crypto from 'node:crypto';
import fs from 'node:fs';

export const TRUST_FILE='';
const HEADER='[coordinator-signature version=1]\n';
const DOMAIN='dsh-coordinator-mail/v1\0';
const FIELDS=['action','delivery_id','expires_at','issued_at','key_id','ledger_uuid','payload','recipient'];
const id=x=>typeof x==='string'&&/^[a-zA-Z0-9:_-]{1,128}$/.test(x);
const canonical=o=>'{'+Object.keys(o).sort().map(k=>JSON.stringify(k)+':'+JSON.stringify(o[k])).join(',')+'}';
const bytes=o=>Buffer.from(DOMAIN+canonical(o));
export const isCoordinatorEnvelope=raw=>Buffer.from(raw).subarray(0,23).toString().startsWith('[coordinator-signature');
// RU: decode: Декодирует структуру подписи с валидацией формата.
// EN: decode: Decodes and validates signature structure.
function decode(raw,{allowStop=false}={}){
  const b=Buffer.from(raw),text=b.toString('utf8');
  if(b.length>98304||!b.equals(Buffer.from(text))||!text.startsWith(HEADER))throw Error('invalid_wrapper');
  const o=JSON.parse(text.slice(HEADER.length));
  if(!o||typeof o!=='object'||Array.isArray(o)||Object.keys(o).sort().join(',')!==[...FIELDS,'signature'].sort().join(','))throw Error('invalid_wrapper');
  const {signature,...meta}=o;
  if(!['message','goal','decision','supersede','cancel','probe',...(allowStop?['stop']:[])].includes(meta.action)
      ||!['delivery_id','key_id','ledger_uuid','recipient'].every(k=>id(meta[k])))throw Error('invalid_wrapper');
  const payload=Buffer.from(meta.payload??'','base64'),sig=Buffer.from(signature??'','base64');
  if(typeof meta.payload!=='string'||payload.toString('base64')!==meta.payload||payload.length>65536
      ||!payload.equals(Buffer.from(payload.toString('utf8')))||sig.length!==64||sig.toString('base64')!==signature)throw Error('invalid_wrapper');
  return {meta,payload,sig};
}
export // RU: unwrapCoordinator: Выделяет payload подписанного конверта, не приравнивает извлечение к доверию.
// EN: unwrapCoordinator: Extracts signed-envelope payload without equating decoding with trust.
function unwrapCoordinator(raw){return decode(raw,{allowStop:true}).payload;}
export // RU: signCoordinator: Создаёт подпись над контрактом получателя/ledger/срока.
// EN: signCoordinator: Signs the recipient/ledger/expiry contract.
function signCoordinator(payload,metadata,privateKey){
  const meta={...metadata,payload:Buffer.from(payload).toString('base64')};
  const raw=Buffer.from(HEADER+JSON.stringify({...meta,signature:crypto.sign(null,bytes(meta),privateKey).toString('base64')}));
  decode(raw,{allowStop:metadata.action==='stop'});return raw;
}
// Pure authentication precedes control lifetime/ACL checks and has no replay-table side effect.
// A known expired signer can receive a signed refusal through its fixed trusted return route.
export function verifyControlSignature(raw,{trust}={}){
  if(!isCoordinatorEnvelope(raw))return {signed:false,verified:false,reason:'unsigned'};
  const reject=reason=>({signed:true,verified:false,reason});
  let decoded;try{decoded=decode(raw,{allowStop:true})}catch{return reject('invalid_wrapper')}
  const {meta,payload,sig}=decoded;
  const keys=Object.hasOwn(trust?.controlKeys??{},meta.key_id)?trust.controlKeys:trust?.keys;
  if(!trust||trust.version!==1||trust.status!=='approved'||!Object.hasOwn(keys??{},meta.key_id))return reject(trust?.status==='approved'?'key_unknown':'trust_unavailable');
  try{
    const key=crypto.createPublicKey(keys[meta.key_id]);
    if(key.asymmetricKeyType!=='ed25519'||!crypto.verify(null,bytes(meta),key,sig))return reject('signature_invalid');
  }catch{return reject('signature_invalid')}
  return {signed:true,verified:true,reason:'crypto_verified',meta,payload,wire_sha:crypto.createHash('sha256').update(raw).digest('hex')};
}
export // RU: loadCoordinatorTrust: Читает фиксированный trust-store; ввод отправителя не выбирает ключевой путь.
// EN: loadCoordinatorTrust: Loads the fixed trust store; sender input cannot select key paths.
function loadCoordinatorTrust(file=TRUST_FILE){

  const st=fs.lstatSync(file);
  if(!st.isFile()||st.isSymbolicLink()||st.uid!==0||(st.mode&0o022))throw Error('trust_unavailable');
  return JSON.parse(fs.readFileSync(file,'utf8'));
}
export // RU: verifyCoordinator: Подписывает и проверяет конверты с привязкой к получателю, ledger, ключу и сроку. Trust-store не выбирается текстом отправителя; replay и иной wire SHA отвергаются.
// EN: verifyCoordinator: Signs/verifies envelopes bound to recipient, ledger, key, and expiry. Sender text cannot select the trust store; replays and mismatched wire hashes are rejected.
function verifyCoordinator(raw,{db,trust,recipient,ledger,now=Date.now()}){
  if(!isCoordinatorEnvelope(raw))return {signed:false,trusted:false,reason:'unsigned'};
  const reject=reason=>({signed:true,trusted:false,reason});
  let decoded;
  try{decoded=decode(raw);}catch{return reject('invalid_wrapper');}
  const {meta,payload,sig}=decoded;
  if(!trust||trust.version!==1||trust.status!=='approved'||!Number.isSafeInteger(trust.maxLifetimeMs)||trust.maxLifetimeMs<=0
      ||!Number.isSafeInteger(trust.clockSkewMs)||trust.clockSkewMs<0)return reject('trust_unavailable');
  if(!Number.isSafeInteger(meta.issued_at)||meta.issued_at<0||!Number.isSafeInteger(meta.expires_at)
      ||meta.expires_at<=meta.issued_at||meta.expires_at-meta.issued_at>trust.maxLifetimeMs)return reject('invalid_lifetime');
  if(meta.recipient!==recipient||meta.ledger_uuid!==ledger)return reject('recipient_mismatch');
  if(meta.issued_at>now+trust.clockSkewMs)return reject('future');
  if(now>=meta.expires_at)return reject('expired');
  if(!Object.hasOwn(trust.keys??{},meta.key_id))return reject('key_unknown');
  try{
    const key=crypto.createPublicKey(trust.keys[meta.key_id]);
    if(key.asymmetricKeyType!=='ed25519'||!crypto.verify(null,bytes(meta),key,sig))return reject('signature_invalid');
  }catch{return reject('signature_invalid');}


  db.exec(`CREATE TABLE IF NOT EXISTS coordinator_seen(
    delivery_id TEXT PRIMARY KEY, key_id TEXT NOT NULL, issued_at INTEGER NOT NULL, expires_at INTEGER NOT NULL,
    received_at INTEGER NOT NULL, wire_sha TEXT NOT NULL)`);
  const hash=crypto.createHash('sha256').update(raw).digest('hex');
  const saved=db.prepare('INSERT OR IGNORE INTO coordinator_seen VALUES(?,?,?,?,?,?)')
    .run(meta.delivery_id,meta.key_id,meta.issued_at,meta.expires_at,now,hash);
  if(Number(saved.changes)!==1)return reject('replay');
  return {signed:true,trusted:true,reason:'verified',meta,payload};
}
