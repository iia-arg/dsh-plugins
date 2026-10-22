// RU: Минимальный Bot API transport через fetch. JSON-вызовы повторяются ограниченно, опрос сохраняет batch до offset; multipart-файл отправляется одной попыткой, поскольку unknown может означать уже доставленный файл. Подтверждение API не доказывает чтение человеком.
// EN: Minimal fetch-based Bot API transport. JSON calls have bounded retries and polling persists the batch before advancing offset; multipart files use one attempt because unknown may mean already delivered. An API acknowledgement does not prove human reading.


import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
const API = 'https://api.telegram.org/bot';

export class TelegramClient {
  // RU: constructor: Инициализирует состояние и схему этого компонента; не выполняет завершённую доставку автоматически.
// EN: constructor: Initializes component state/schema without claiming completed delivery.
constructor(token, log, {allowedUpdates=['message']}={}) {
    if(!Array.isArray(allowedUpdates)||!allowedUpdates.length||allowedUpdates.some(k=>!['message','edited_message','channel_post','edited_channel_post','callback_query'].includes(k)))throw Error('Telegram update types rejected');
    this.allowedUpdates=[...new Set(allowedUpdates)];this.token = token;
    this.log = log ?? (() => {});
    this.offset = 0;
  }


  // RU: call: Выполняет ограниченный JSON HTTP-вызов; логирует попытки и не скрывает окончательный отказ.
// EN: call: Makes a bounded JSON HTTP call, reports attempts, and propagates final failure.
async call(method, payload, timeoutMs = 15000, attempts = 3) {
    let lastErr;
    for (let n = 1; n <= attempts; n++) {
      const ctl = new AbortController();
      const t = setTimeout(() => ctl.abort(), timeoutMs);
      try {
        const res = await fetch(`${API}${this.token}/${method}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload ?? {}),
          signal: ctl.signal,
        });
        const data = await res.json();
        if (!data.ok) {
          const err = new Error(`${method}: ${data.description ?? 'неизвестная ошибка'}`);
          err.fromTelegram = true;
          throw err;
        }
        if (n > 1) this.log(`${method}: удалось с попытки ${n}`);
        return data.result;
      } catch (e) {
        lastErr = e;
        if (e?.fromTelegram || n === attempts) break;
        const wait = 400 * n;
        this.log(`${method}: попытка ${n} не удалась (${e?.message ?? e}), повтор через ${wait} мс`);
        await new Promise((r) => setTimeout(r, wait));
      } finally {
        clearTimeout(t);
      }
    }
    throw lastErr;
  }


  // RU: poll: Получает/читает пачку с обязательной границей сохранения; продвижение источника разрешено только после приёма.
// EN: poll: Reads a bounded input batch with a mandatory persistence boundary; advances sources only after admission.
async poll(timeoutSec = 25, persist) {


    if (typeof persist !== 'function') throw new TypeError('poll: persist must be a function');

    const updates = await this.call('getUpdates',
      { offset: this.offset, timeout: timeoutSec, allowed_updates: this.allowedUpdates },
      (timeoutSec + 10) * 1000, 1);
    await persist(updates);
    for (const u of updates) {
      if (u.update_id >= this.offset) this.offset = u.update_id + 1;
    }
    return updates;
  }


  // RU: send: Нарезает и последовательно отправляет plain-text; пустое тело не отправляет.
// EN: send: Splits and sends plain text sequentially; skips empty bodies.
async send(chatId, text) {
    const LIMIT = 4000;
    const chunks = [];
    let rest = String(text ?? '').trim();
    if (!rest) return;
    while (rest.length > LIMIT) {
      let cut = rest.lastIndexOf('\n\n', LIMIT);
      if (cut < LIMIT * 0.5) cut = rest.lastIndexOf('\n', LIMIT);
      if (cut < LIMIT * 0.5) cut = rest.lastIndexOf(' ', LIMIT);
      if (cut < LIMIT * 0.5) cut = LIMIT;
      if (/[\uD800-\uDBFF]/.test(rest[cut-1]) && /[\uDC00-\uDFFF]/.test(rest[cut])) cut -= 1;
      chunks.push(rest.slice(0, cut));
      rest = rest.slice(cut).trimStart();
    }
    if (rest) chunks.push(rest);
    for (const c of chunks) {
      await this.call('sendMessage', { chat_id: chatId, text: c });
    }
  }


  // RU: sendFile: Отправляет multipart byte snapshot одной попыткой; unknown запрещает автоматический повтор.
// EN: sendFile: Uploads a multipart byte snapshot once; unknown outcomes prohibit automatic replay.
async sendFile(chatId, file, signal) {
    const method = file.mode === 'photo' ? 'sendPhoto' : 'sendDocument';
    const field = file.mode === 'photo' ? 'photo' : 'document';
    const form = new FormData();
    form.set('chat_id', String(chatId));
    form.set('caption', file.caption);
    form.set(field, new Blob([file.data], {type:file.contentType}), file.filename);
    let data;
    try {
      const response = await fetch(`${API}${this.token}/${method}`, {
        method:'POST', body:form, redirect:'error',
        signal:AbortSignal.any([AbortSignal.timeout(60_000), ...(signal ? [signal] : [])]),
      });
      let size=0;const chunks=[];
      for await(const chunk of response.body) {
        size+=chunk.length;if(size>65_536)throw Error('oversized response');chunks.push(chunk);
      }
      data=JSON.parse(Buffer.concat(chunks).toString('utf8'));
    } catch {
      throw Error('ОТКАЗ telegram_send_file: исход отправки неизвестен; не повторять автоматически');
    }
    if(data?.ok===false) {
      const code=Number.isSafeInteger(data.error_code)?data.error_code:'unknown';
      throw Error(`ОТКАЗ telegram_send_file: Telegram code=${code}`);
    }
    const result=data?.result;
    if(data?.ok!==true||!Number.isSafeInteger(result?.message_id)||result.message_id<=0||String(result?.chat?.id)!==String(chatId))
      throw Error('ОТКАЗ telegram_send_file: подтверждение не получено, исход неизвестен; не повторять автоматически');
    return result;
  }

  // RU: typing: Посылает необязательный индикатор, его отказ не останавливает основной ответ.
// EN: typing: Sends an optional typing indicator without failing primary responses.
async typing(chatId) {
    try { await this.call('sendChatAction', { chat_id: chatId, action: 'typing' }, 8000); }
    catch {                                                }
  }

  // RU: whoAmI: Получает идентичность бота из Bot API до обработки update IDs.
// EN: whoAmI: Obtains bot identity from the API before processing update IDs.
async whoAmI() { return this.call('getMe'); }


  // RU: getFilePath: Разрешает Telegram file ID в удалённый download path, не в локальный файл.
// EN: getFilePath: Resolves a Telegram file ID to a remote download path, not a local file.
async getFilePath(fileId) {
    const file = await this.call('getFile', { file_id: fileId });
    return file.file_path;
  }

  // RU: Дедлайн 30 с покрывает getFile, заголовки и поток; предел 20 MiB проверяется по фактическим байтам, не только Content-Length.
  // EN: The 30-second deadline covers getFile, headers, and streaming; the 20 MiB limit checks actual bytes, not just Content-Length.
  // RU: Отказ отменяет запрос и удаляет частичный файл; transcriber и остальные API-вызовы этим методом не ограничиваются.
  // EN: Failure aborts the request and removes the partial file; this method does not limit the transcriber or other API calls.
  async downloadFile(fileId,{timeoutMs=30000,maxBytes=20*1024*1024,directory=os.tmpdir()}={}) {
    if(!Number.isSafeInteger(timeoutMs)||timeoutMs<=0||!Number.isSafeInteger(maxBytes)||maxBytes<=0)throw Error('Telegram file limits must be positive integers');
    const failure=message=>Object.assign(new Error(message),{downloadGuard:true});
    const controller=new AbortController();
    let timer,file,fd,reader;
    const deadline=new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(failure('Telegram file download timeout'));},timeoutMs);});
    const bounded=promise=>Promise.race([promise,deadline]);
    try {
      const metadata=await bounded(this.call('getFile',{file_id:fileId},timeoutMs,1));
      if(typeof metadata?.file_path!=='string'||!metadata.file_path)throw failure('Telegram file path unavailable');
      if(metadata.file_size>maxBytes)throw failure('Telegram file size limit exceeded');
      const response=await bounded(fetch(`https://api.telegram.org/file/bot${this.token}/${metadata.file_path}`,{signal:controller.signal}));
      if(!response.ok)throw failure(`Telegram file download HTTP ${response.status}`);
      if(Number(response.headers.get('content-length'))>maxBytes)throw failure('Telegram file size limit exceeded');
      file=path.join(directory,`dsh-voice-${crypto.randomUUID()}${path.extname(metadata.file_path)||'.oga'}`);
      fd=fs.openSync(file,'wx',0o600);
      if(!response.body)throw failure('Telegram file body unavailable');
      reader=response.body.getReader();let size=0;
      while(true){
        const chunk=await bounded(reader.read());if(chunk.done)break;
        size+=chunk.value.byteLength;if(size>maxBytes)throw failure('Telegram file size limit exceeded');
        fs.writeFileSync(fd,Buffer.from(chunk.value));
      }
      fs.closeSync(fd);fd=undefined;return file;
    } catch(error) {
      if(fd!==undefined){fs.closeSync(fd);fd=undefined;}
      if(file)fs.rmSync(file,{force:true});
      if(controller.signal.aborted)throw failure('Telegram file download timeout');
      if(error.downloadGuard)throw error;
      throw failure('Telegram file download failed');
    } finally {
      clearTimeout(timer);controller.abort();
      if(reader)reader.cancel().catch(()=>{});
    }
  }
}
