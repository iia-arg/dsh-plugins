// RU: Копии исходящих писем агента владельцу. Источник — зеркало исходящих <a2aDir>/polnye, которое пишет инструмент
//     отправки писем (dlya-<адресат>-…-<UTCвремя>Z-<pid>.txt|md): письмо агент кладёт сам посреди хода, и без копии владелец
//     видит в чате агента только письма агенту. Копируется лишь УЛОЖЕННОЕ письмо: зеркало пишется ДО укладки, строка
//     «положено в щель» дописывается ПОСЛЕ. ЧЕГО НЕ ВИДИТ: письма мимо этого инструмента (в т.ч. файловая почта соседям,
//     у неё своя видимость) и письма, уложенные раньше заведённой отметки — история не рассылается.
// EN: Owner copies of the agent's outgoing letters read from the outgoing mirror <a2aDir>/polnye. Only letters stamped as
//     placed are copied; letters bypassing the sending tool and history before the baseline are not.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';

export const SENT_COPY_MARK = '\n--\nположено в щель: ';
const IMYA = /^dlya-([a-z]+)-.+-(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z-\d+\.(txt|md)$/;

// RU: sentCopyCandidates: Уложенные письма зеркала с временем в имени не раньше sinceMs; файл читается только у прошедших по имени.
// EN: sentCopyCandidates: Placed mirror letters whose name time is not before sinceMs; only name-matched files are read.
export function sentCopyCandidates(dir, sinceMs) {
  let names;
  try { names = fs.readdirSync(dir); } catch (e) { if (e?.code === 'ENOENT') return []; throw e; }
  const out = [];
  for (const name of names.sort()) {
    const own=/^agent-outgoing-([a-f0-9]{64})\.json$/.exec(name);
    if(own){
      let fd;
      try{
        fd=fs.openSync(path.join(dir,name),fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW|fs.constants.O_NONBLOCK);
        const st=fs.fstatSync(fd);if(!st.isFile()||st.uid!==process.getuid()||st.size>8388608)continue;
        const c=JSON.parse(fs.readFileSync(fd,'utf8'));
        const hash=x=>createHash('sha256').update(x).digest('hex');
        if(c.version!==1||c.stage!=='placed'||c.operation_id!==own[1]||typeof c.body!=='string'||
          !/^[a-z][a-z0-9_-]{0,63}$/.test(c.recipient??'')||!Number.isSafeInteger(c.placed_at)||c.placed_at<sinceMs||
          c.body_sha256!==hash(c.body)||c.operation_id!==hash(c.recipient+'\n'+c.body))continue;
        out.push({name,komu:c.recipient,text:c.body});
      }catch{}finally{if(fd!==undefined)fs.closeSync(fd)}
      continue;
    }
    const m = IMYA.exec(name);
    if (!m) continue;
    const t = Date.UTC(+m[2], +m[3] - 1, +m[4], +m[5], +m[6], +m[7]);
    if (t < sinceMs) continue;
    let text;
    try { text = fs.readFileSync(path.join(dir, name), 'utf8'); } catch { continue; }
    if (!text.includes(SENT_COPY_MARK)) continue;
    out.push({ name, komu: m[1], text });
  }
  return out;
}

// RU: sentCopyText: Пометка «письмо → <адресат из имени файла>» и текст как ушёл; длину режет на части tg.send, а не обрезка здесь.
// EN: sentCopyText: Marks the recipient and keeps the sent text intact; tg.send splits long bodies.
export function sentCopyText(c) {
  return `✉️ письмо → ${c.komu} (исходящее агента, копия владельцу)\n${c.name}\n\n${c.text}`;
}
