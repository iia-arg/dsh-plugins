import crypto from 'node:crypto';
import path from 'node:path';
import {verifyControlSignature} from './coordinator-signature.js';

export const STOP_LIFETIME_MS=120000, STOP_TERMINAL_MS=30000;
export const UNSIGNED_WINDOW_MS=600000, UNSIGNED_LIMIT=5;
const ISKRA_NEW_RECIPIENTS=['zarya','avrora','petrovich','alfa','beta','gamma'];
const HEADER='[a2a-envelope version=2]\n';
const STATUS_HEADER='[task-stop-status version=1]\n';
const STATUS_DOMAIN='dsh-mail-stop-status/v1\0';
const identifier=x=>typeof x==='string'&&/^[a-zA-Z0-9:_-]{1,128}$/.test(x);
const exact=(x,keys)=>x&&typeof x==='object'&&!Array.isArray(x)&&Object.keys(x).length===keys.length&&keys.every(k=>Object.hasOwn(x,k));
const canonical=x=>'{'+Object.keys(x).sort().map(k=>JSON.stringify(k)+':'+JSON.stringify(x[k])).join(',')+'}';

export function decodeStopPayload(payload){
 const text=Buffer.from(payload).toString('utf8');
 if(!text.startsWith(HEADER)||Buffer.byteLength(text)>65536)throw Error('invalid_control');
 const end=text.indexOf('\n',HEADER.length);if(end<0)throw Error('invalid_control');
 let control;try{control=JSON.parse(text.slice(HEADER.length,end))}catch{throw Error('invalid_control')}
 const keys=['kind','delivery_id','recipient','ledger_uuid','mode','selector',...(Object.hasOwn(control??{},'expected')?['expected']:[])];
 if(!exact(control,keys)||control.kind!=='task-stop/1'||!['delivery_id','recipient','ledger_uuid'].every(k=>identifier(control[k]))||!['pause','replace','new'].includes(control.mode))throw Error('invalid_control');
 const selector=control.selector;
 if(!(exact(selector,['kind'])&&selector.kind==='primary-a2a')&&!(exact(selector,['kind','session_id','session_created'])&&selector.kind==='conversation'&&identifier(selector.session_id)&&Number.isSafeInteger(selector.session_created)))throw Error('invalid_control');
 if(control.expected!==undefined&&(!exact(control.expected,['session_id','session_created','turn'])||!identifier(control.expected.session_id)||!Number.isSafeInteger(control.expected.session_created)||!Number.isSafeInteger(control.expected.turn)||control.expected.turn<0))throw Error('invalid_control');
 const replacement=text.slice(end+1);
 if(replacement.includes('\0')||(control.mode==='pause'&&replacement!=='')||(control.mode==='replace'&&!replacement.trim()))throw Error('invalid_control');
 return {...control,replacement};
}

// Only receiver-owned trust selects a reply route. Sender fields cannot redirect a refusal.
function returnRoute(trust,key){
 const route=Object.hasOwn(trust?.returnRoutes??{},key)?trust.returnRoutes[key]:null;
 return exact(route,['recipient','ledger_uuid','directory'])&&identifier(route.recipient)&&identifier(route.ledger_uuid)&&typeof route.directory==='string'&&path.isAbsolute(route.directory)?structuredClone(route):null;
}

export function evaluateSignedStop(raw,{trust,recipient,ledger,now=Date.now(),delivery=null}={}){
 const signature=verifyControlSignature(raw,{trust});
 if(!signature.verified)return {...signature,allowed:false};
 const {meta,payload}=signature;
 const result={...signature,allowed:false,returnRoute:returnRoute(trust,meta.key_id),processed_at:now,
  delivered_at:Number.isSafeInteger(delivery?.delivered_at)?delivery.delivered_at:null,
  arrival_event:typeof delivery?.event_id==='string'?delivery.event_id:null};
 result.delay_ms=result.delivered_at===null?null:now-result.delivered_at;
 const deny=reason=>({...result,reason});
 if(meta.action!=='stop')return deny('action_or_id_mismatch');
 if(!Number.isSafeInteger(meta.issued_at)||meta.issued_at<0||!Number.isSafeInteger(meta.expires_at)||meta.expires_at<=meta.issued_at||meta.expires_at-meta.issued_at>STOP_LIFETIME_MS
    ||!Number.isSafeInteger(trust.maxLifetimeMs)||trust.maxLifetimeMs<=0||meta.expires_at-meta.issued_at>trust.maxLifetimeMs||!Number.isSafeInteger(trust.clockSkewMs)||trust.clockSkewMs<0)return deny('invalid_lifetime');
 if(meta.recipient!==recipient||meta.ledger_uuid!==ledger)return deny('recipient_mismatch');
 if(meta.issued_at>now+trust.clockSkewMs)return deny('future');
 if(now>=meta.expires_at)return deny('expired');
 let control;try{control=decodeStopPayload(payload)}catch{return deny('invalid_control')}
 if(control.delivery_id!==meta.delivery_id)return deny('action_or_id_mismatch');
 if(control.recipient!==recipient||control.ledger_uuid!==ledger)return deny('recipient_mismatch');
 const permission=Object.hasOwn(trust.controlPermissions??{},meta.key_id)?trust.controlPermissions[meta.key_id]:null;
 if(!permission||!['zabava','iskra'].includes(permission.principal)||!Array.isArray(permission.recipients)||!permission.recipients.some(x=>x===recipient||x==='*')||!Array.isArray(permission.modes)||!permission.modes.includes(control.mode)||(permission.principal==='iskra'&&control.mode!=='pause'&&!(control.mode==='new'&&ISKRA_NEW_RECIPIENTS.includes(recipient)&&permission.recipients.includes(recipient)&&!permission.recipients.includes('*'))))return deny('no_permission');
 if(!result.returnRoute)return deny('return_route_unavailable');
 if(result.delivered_at===null||!result.arrival_event)return deny('delivery_unobserved');
 // B-N-2017: отметка прибытия «из будущего» в пределах trust.clockSkewMs — шаг часов назад (поправка NTP) между прибытием и проверкой,
 // а не подлог; дальше допуска — по-прежнему отказ (тот же допуск, что у issued_at выше). delay_ms тогда отрицателен, не ниже −clockSkewMs.
 // EN: an arrival stamp «from the future» within trust.clockSkewMs is a clock step back (NTP) between arrival and check, not forgery;
 // beyond the skew it is still refused (same skew as issued_at above). delay_ms may then be negative, not below −clockSkewMs.
 if(result.delivered_at>now+trust.clockSkewMs||result.delivered_at<0)return deny('delivery_observation_invalid');
 return {...result,allowed:true,reason:'authorized',principal:permission.principal,control};
}

export function signStopStatus(status,keyId,privateKey){
 const value={...status,version:1,key_id:keyId};
 if(!identifier(keyId)||Buffer.byteLength(canonical(value))>7500)throw Error('invalid_status');
 const signature=crypto.sign(null,Buffer.from(STATUS_DOMAIN+canonical(value)),privateKey).toString('base64');
 return Buffer.from(STATUS_HEADER+JSON.stringify({...value,signature}));
}

export function verifyStopStatus(raw,{keys,receivers,recipient,ledger,now=Date.now(),expected}={}){
 const reject=reason=>({verified:false,reason});
 try{
  const bytes=Buffer.from(raw),text=bytes.toString('utf8');
  if(bytes.length>8192||!bytes.equals(Buffer.from(text))||!text.startsWith(STATUS_HEADER))return reject('invalid_status');
  const {signature,...value}=JSON.parse(text.slice(STATUS_HEADER.length));
  if(value.version!==1||!identifier(value.key_id)||!Object.hasOwn(keys??{},value.key_id))return reject('key_unknown');
  const key=crypto.createPublicKey(keys[value.key_id]),sig=Buffer.from(signature,'base64');
  if(key.asymmetricKeyType!=='ed25519'||sig.length!==64||sig.toString('base64')!==signature||!crypto.verify(null,Buffer.from(STATUS_DOMAIN+canonical(value)),key,sig))return reject('signature_invalid');
  // B-N-1590: a key proves only the receiver it belongs to — a shared trust store must not let agent X sign a status of agent Y.
  if(typeof receivers?.[value.key_id]!=='string'||receivers[value.key_id]!==value.receiver)return reject('key_receiver_mismatch');
  if(value.recipient!==recipient||value.ledger_uuid!==ledger)return reject('recipient_mismatch');
  if(expected&&(!identifier(expected.control_id)||!/^[a-f0-9]{64}$/.test(expected.wire_sha??'')||value.control_id!==expected.control_id||value.wire_sha!==expected.wire_sha))return reject('control_mismatch');
  if(!Number.isSafeInteger(value.issued_at)||!Number.isSafeInteger(value.expires_at)||value.issued_at>now||value.expires_at<=now||value.expires_at<=value.issued_at)return reject('expired_or_invalid');
  return {verified:true,reason:'verified',status:value};
 }catch{return reject('invalid_status')}
}
