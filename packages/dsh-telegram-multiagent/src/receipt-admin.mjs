#!/usr/bin/env node
// RU: Операторский CLI просмотра и адресных решений удержания; status read-only, изменения требуют явных аргументов. Проверка открытых writer через /proc применяется только к rollback-v1 и не является замком.
// EN: Operator CLI for inspection and targeted hold decisions; status is read-only and mutations require explicit arguments. The /proc writer check applies only to rollback-v1 and is not an exclusion lock.
import path from 'node:path';import fs from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {MessageReceipts} from './message-receipts.js';


// RU: assertLedgerClosed: Операторский CLI для просмотра/разрешения удержанных квитанций. Проверяет, что живой читатель не владеет ledger, и требует явное действие; ошибку доступа/схемы не превращает в разрешение.
// EN: assertLedgerClosed: Operator CLI for inspecting/resolving held receipts. Verifies the live reader does not own the ledger and requires an explicit action; permission/schema errors never grant authorization.
function assertLedgerClosed(file) {
  const targets = new Set();
  for (const name of [file, file+'-wal']) {
    try { const st=fs.statSync(name); targets.add(`${st.dev}:${st.ino}`); }
    catch(e) { if(e.code!=='ENOENT') throw Error(`rollback REFUSED: cannot stat ${name}: ${e.code}`); }
  }
  const holders=new Set(), unreadable=new Set();
  let processes;
  try { processes=fs.readdirSync('/proc'); }
  catch(e) { throw Error(`rollback REFUSED: /proc unavailable: ${e.code}`); }
  for(const pid of processes) {
    if(!/^\d+$/.test(pid) || Number(pid)===process.pid) continue;
    const dir=`/proc/${pid}/fd`;let descriptors;
    try { descriptors=fs.readdirSync(dir); }
    catch(e) { if(e.code==='ENOENT'||e.code==='ESRCH') continue; unreadable.add(pid); continue; }
    for(const fd of descriptors) {
      try {
        const link=fs.readlinkSync(`${dir}/${fd}`);
        const st=fs.statSync(`${dir}/${fd}`);
        if(targets.has(`${st.dev}:${st.ino}`) || [file,file+'-wal',file+' (deleted)',file+'-wal (deleted)'].includes(link)) holders.add(pid);
      } catch(e) { if(e.code!=='ENOENT' && e.code!=='ESRCH') unreadable.add(pid); }
    }
  }
  if(holders.size) throw Error(`rollback REFUSED: ledger открыт pid ${[...holders].join(',')}${unreadable.size?'; /proc incomplete pid '+[...unreadable].join(','):''}`);
  if(unreadable.size) throw Error(`rollback REFUSED: /proc fd scan incomplete; no access/error pid ${[...unreadable].join(',')}`);
}
const [command,root,...args]=process.argv.slice(2);
const mutations=['approve-new','discard','release-text','reject-envelope'];
if(!root||!path.isAbsolute(root)||!(command==='status'?args.length===0:
  command==='rollback-v1'?args.length===2&&args.every(Boolean):mutations.includes(command)&&args.length===3&&args.every(Boolean))) {
  console.error('usage: status ROOT | rollback-v1 ROOT OPERATOR REFERENCE | approve-new|discard|release-text|reject-envelope ROOT ID OPERATOR REFERENCE');process.exit(2);
}
const file=path.join(root,'receipts.sqlite');
let db;
try {
  if(!fs.existsSync(file)||fs.lstatSync(file).isSymbolicLink()||fs.lstatSync(root).isSymbolicLink())throw Error('Ledger отсутствует либо является ссылкой');

  db=new DatabaseSync(file,{readOnly:true});db.exec('PRAGMA query_only=ON; BEGIN');
  const version=db.prepare('PRAGMA user_version').get().user_version;
  if(![1,2].includes(version))throw Error('Неизвестная версия ledger');
  if(command==='status') {
    const records=version===1
      ? db.prepare('SELECT id,source_key,received_at,hold_notices,blocked,claimed_turn,finished_at,outcome FROM receipts LEFT JOIN sources ON receipts.id=sources.receipt_id ORDER BY received_at').all()
      : db.prepare('SELECT receipts.id,source_key,received_at,hold_notices,blocked,claimed_turn,finished_at,outcome,protocol_envelopes.state AS envelope_state,protocol_envelopes.reason AS envelope_reason,deadline_at,hold_duration_ms,exit_reason FROM receipts LEFT JOIN protocol_envelopes ON receipts.id=protocol_envelopes.receipt_id LEFT JOIN sources ON receipts.id=sources.receipt_id ORDER BY received_at').all();
    const outbox=db.prepare('SELECT id,attempts,sent_at,error FROM outbox WHERE sent_at IS NULL').all();
    console.log(JSON.stringify({reader:db.prepare("SELECT value FROM meta WHERE key='receipt_reviewer'").get()?.value??'координатор',version,records,outbox},null,2));
    db.close();db=null;
  } else {
    if(db.prepare("SELECT value FROM meta WHERE key='root'").get()?.value!==path.resolve(root))throw Error('Ledger другого дома; отказ');
    db.close();db=null;
    if(command==='rollback-v1') {
      assertLedgerClosed(file);
      db=new DatabaseSync(file);db.exec('PRAGMA busy_timeout=5000; BEGIN IMMEDIATE');
      try {
        const current=db.prepare('PRAGMA user_version').get().user_version;
        if(![1,2].includes(current))throw Error('Неизвестная версия ledger');
        const exists=db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='protocol_envelopes'").get();
        if(current===2&&!exists)throw Error('Ledger v2 без таблицы конвертов');


        const unresolved=exists?db.prepare(`SELECT e.receipt_id FROM protocol_envelopes e LEFT JOIN receipts r ON r.id=e.receipt_id
          WHERE e.state NOT IN ('rejected','probe_replied','released_text') OR r.id IS NULL
          OR r.finished_at IS NULL OR r.outcome IS NULL
          OR e.cancel_phase IS NOT NULL`).all():[];
        if(unresolved.length)throw Error(`rollback REFUSED unresolved=${unresolved.length}; receipts=${unresolved.map(x=>x.receipt_id).join(',')}`);
        assertLedgerClosed(file);
        db.exec('PRAGMA user_version=1; COMMIT');
        console.log(JSON.stringify({action:'rollback-v1',from:current,to:1,unresolved:0,operator:args[0],reference:args[1],tables:'retained'}));
      } catch(e) { try{db.exec('ROLLBACK');}catch{} throw e; }
      db.close();db=null;
    } else {
      if(version!==2)throw Error('Admin не мигрирует ledger: нужна v2 от службы');
      const ledger=new MessageReceipts(root,{migrate:false});
      try {ledger.resolve(args[0],command,args[1],args[2]);console.log(JSON.stringify({records:ledger.status()},null,2));}
      finally {ledger.close();}
    }
  }
} catch(e) {
  console.error(String(e?.message??e));process.exitCode=2;
} finally {if(db)db.close();}
