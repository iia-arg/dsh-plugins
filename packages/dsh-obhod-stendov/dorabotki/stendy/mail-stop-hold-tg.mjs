// mail-stop-hold-tg.mjs — общий загрузчик кода telegram для помощников стенда mail-stop-hold (B-N-1536).
// Путь пакета — MSH_TELEGRAM (умолчание — боевой /opt/agent-plugins/dsh-telegram-multiagent). Нет нужных модулей стопа
// (telegram до 2.5.72) — СЛЕПОТА, код 2: стенд без предмета не имеет права быть зелёным.
import fs from 'node:fs';import path from 'node:path';import {pathToFileURL} from 'node:url';
export const TG=process.env.MSH_TELEGRAM||'/opt/agent-plugins/dsh-telegram-multiagent';
const need=['message-receipts.js','conversation-pause.js','mail-stop-receiver.js','mail-stop-ledger.js'];
const net=need.filter(f=>!fs.existsSync(path.join(TG,'src',f)));
let ver='?';try{ver=JSON.parse(fs.readFileSync(path.join(TG,'package.json'),'utf8')).version}catch{}
if(net.length){console.error(`СЛЕПОТА: в ${TG} (версия ${ver}) нет модулей стопа: ${net.join(', ')} — нужен telegram 2.5.72+`);process.exit(2);}
const im=f=>import(pathToFileURL(path.join(TG,'src',f)).href);
export const {MessageReceipts}=await im('message-receipts.js');
export const {ConversationPause}=await im('conversation-pause.js');
export const {MailStopReceiver}=await im('mail-stop-receiver.js');
export const VERSIYA=ver;
