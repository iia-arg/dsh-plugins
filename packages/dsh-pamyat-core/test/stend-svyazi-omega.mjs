// RU: Проверяем связь записи ядра с экземпляром OMEGA, чтобы выдача учитывала доверие из pamyat.db. Связь возникает только при подтверждённой доставке и sozdana=true; неопределённая доставка, чтение очереди, склейка Deduped и sozdana=null её не создают. Повтор той же пары даёт uzhe, другой mem не перезаписывает связь и оставляет журнал. doverieDlyaMem возвращает otmenena/utochnena, null без связи или для чужого агента. При двух связях частичная отмена даёт mnogosvyaz k/N, полная — otmenena. Следы читаем прямо из базы.
// EN: Test links between core records and OMEGA instances so retrieval respects trust from pamyat.db. A link requires confirmed delivery and sozdana=true; uncertain delivery, queue reads, Deduped merges, and sozdana=null do not create one. Repeating the same pair returns uzhe; another mem cannot overwrite the link and leaves a journal entry. doverieDlyaMem returns otmenena/utochnena, or null without a link or for another agent. With two links, partial revocation gives mnogosvyaz k/N and complete revocation gives otmenena. Read traces directly from the database.
let Context, apply, name, Config, otkrytHranilishche;
try {
  ;({ Context } = await import('@deepseek-ai/cordis'));
  ;({ apply, name, Config } = await import('../src/index.js'));
  ;({ otkrytHranilishche } = await import('../src/hranilishche.js'));
} catch (e) {
  const net = e?.code === 'ERR_MODULE_NOT_FOUND';
  console.log(`СЛЕПОТА: предмет не загрузился — ${net ? 'платформа (@deepseek-ai/cordis) не установлена' : String(e?.message ?? e).slice(0, 160)}`);
  if (net) console.log('  Выполните `npm install` в каталоге пакета и повторите.');
  process.exit(2);
}
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
// RU: Временные файлы убираем на всех перехватываемых путях выхода; SIGKILL выполнить уборку не позволяет.
// EN: Clean temporary files on every interceptable exit path; SIGKILL cannot run cleanup.
import { mkdtempSync as mkdtempSync_, rmSync as rmSync_ } from 'node:fs'
const VREMENNYE = []
const vremennyj = (...a) => { const k = mkdtempSync_(...a); VREMENNYE.push(k); return k }
process.on('exit', () => { for (const k of VREMENNYE) rmSync_(k, { recursive: true, force: true }) })
process.on('SIGTERM', () => process.exit(143)); process.on('SIGINT', () => process.exit(130))

let ok = 0, bed = 0;
// RU: Синхронное тело пробы должно вернуть undefined; промис и любое иное значение означают отказ.
// EN: A synchronous probe body must return undefined; a promise or any other value means failure.
const proba = (imya, f) => { try {
    const v = f();
    if (v && typeof v.then === 'function') throw new Error('тело пробы ОЖИДАЮЩЕЕ, а прогонщик синхронный');
    if (v !== undefined && v !== true) throw new Error('тело пробы ВЕРНУЛО «' + String(v).slice(0, 60) + '» — бросай ошибку');
    ok++; console.log('  ok   ' + imya) }
  catch (e) { bed++; console.log('  FAIL ' + imya + ' — ' + e.message) } };

const kat = vremennyj(join(tmpdir(), 'stend-svyazi-omega-'));
const pauza = () => new Promise((r) => setTimeout(r, 40));

async function podnyat(dolgo, agent = 'proba-uzel', putBazy = join(kat, 'p-' + Math.random().toString(36).slice(2) + '.db')) {
  const koren = new Context();
  koren.provide('logger'); koren.logger = { error: () => {} };
  koren.provide('pamyatDolgovremennaya'); koren.pamyatDolgovremennaya = dolgo;
  koren.plugin({ name, apply }, new Config({ putBazy, otvechayushchegoNet: true, agent }));
  await pauza();
  return { k: koren, putBazy };
}
const svyaziIzBazy = (put) => {
  const db = new DatabaseSync(put, { readOnly: true });
  const r = db.prepare('SELECT * FROM svyaz_omega ORDER BY zapis_id').all();
  db.close();
  return r;
};
const zhurnalIzBazy = (put, priroda) => {
  const db = new DatabaseSync(put, { readOnly: true });
  const r = db.prepare('SELECT * FROM zhurnal WHERE priroda = ?').all(priroda);
  db.close();
  return r;
};
// RU: Подставной слой отдаёт ответы очередью, один на вызов.
// EN: The fake layer returns queued responses, one per call.
function sloj(otvetySohranit, otvetyProverit = []) {
  return {
    dostupna: () => true, pochemuNedostupna: () => null,
    async sohranit() { return otvetySohranit.shift(); },
    async proverit() { return otvetyProverit.shift(); },
  };
}

const NOV = (id) => ({ sostoyanie: 'dostavleno', id, sozdana: true });   /* RU: Ответ Stored mem-… с подтверждением создания связывает запись; неопределённая доставка не связывает.
 * EN: A Stored mem-… response confirming creation links the record; uncertain delivery does not.
 */
{
  const { k, putBazy } = await podnyat(sloj([
    NOV('mem-aaaa00000001'),
    { sostoyanie: 'moglo-dojti-id-est', id: 'mem-aaaa00000002', sozdana: true, pochemu: 'обрыв после отправки' },
    { sostoyanie: 'ne-otpravleno', id: null, pochemu: 'связи нет' },
  ]));
  const id1 = k.pamyat.zapisat({ klass: 'urok', soderzhim: 'знание один', istochnik: 's#1' });
  await pauza();
  const id2 = k.pamyat.zapisat({ klass: 'urok', soderzhim: 'знание два', istochnik: 's#2' });
  await pauza();
  const id3 = k.pamyat.zapisat({ klass: 'urok', soderzhim: 'знание три', istochnik: 's#3' });
  await pauza();
  const sv = svyaziIzBazy(putBazy);
  proba('[1] доставлено + создана → связь записи с mem_id, kak=dostavka', () => {
    const s = sv.find((x) => Number(x.zapis_id) === Number(id1));
    if (!s) throw new Error('связи записи ' + id1 + ' нет; в таблице ' + JSON.stringify(sv));
    if (s.mem_id !== 'mem-aaaa00000001' || s.kak !== 'dostavka') throw new Error('связь не та: ' + JSON.stringify(s));
  });
  proba('[1] «могло дойти» и «не отправлено» НЕ связывают', () => {
    const lishnie = sv.filter((x) => [Number(id2), Number(id3)].includes(Number(x.zapis_id)));
    if (lishnie.length) throw new Error('связаны недоказанные: ' + JSON.stringify(lishnie));
    if (sv.length !== 1) throw new Error('связей ' + sv.length + ', ждали 1');
  });

  // RU: Повтор записью создаёт связь, перечитывание очереди — нет.
  // EN: A write retry creates a link; rereading the queue does not.
  k.pamyatDolgovremennaya.proverit = async () => ({ sostoyanie: 'est', pochemu: 'нашлась' });
  k.pamyatDolgovremennaya.sohranit = async () => NOV('mem-aaaa00000003');
  const otchet = await k.pamyat.dostavitOtlozhennoe();
  const sv2 = svyaziIzBazy(putBazy);
  proba('[2] перечитывание «есть» НЕ связывает (ответа о создании нет) — строка журнала «не доказана»', () => {
    if (sv2.some((x) => Number(x.zapis_id) === Number(id2))) throw new Error('связана без доказанного создания: ' + JSON.stringify(sv2));
    const zh = zhurnalIzBazy(putBazy, 'svyaz-omega-ne-dokazana');
    if (zh.length !== 1 || !zh[0].pochemu.includes('mem-aaaa00000002')) throw new Error('журнал: ' + JSON.stringify(zh) + ' отчёт ' + JSON.stringify(otchet));
  });
  proba('[2] повтор доставки записью (создана) связывает по новому mem_id', () => {
    const s = sv2.find((x) => Number(x.zapis_id) === Number(id3));
    if (!s || s.mem_id !== 'mem-aaaa00000003') throw new Error('нет связи ' + id3 + ': ' + JSON.stringify(sv2));
  });

  // RU: Одна запись ядра имеет один экземпляр OMEGA.
  // EN: One core record has one OMEGA instance.
  const h = otkrytHranilishche(putBazy);
  proba('[3] та же пара повторно — «uzhe», строк не прибавилось', () => {
    const r = h.svyazat({ zapis_id: id1, mem_id: 'mem-aaaa00000001', kak: 'dostavka' });
    if (r.ishod !== 'uzhe') throw new Error('исход ' + r.ishod);
    if (svyaziIzBazy(putBazy).length !== 2) throw new Error('строк ' + svyaziIzBazy(putBazy).length);
  });
  proba('[3] чужой mem_id к связанной записи — «konflikt», прежняя связь цела', () => {
    const r = h.svyazat({ zapis_id: id1, mem_id: 'mem-bbbb00000009', kak: 'dostavka' });
    if (r.ishod !== 'konflikt') throw new Error('исход ' + r.ishod);
    const s = svyaziIzBazy(putBazy).find((x) => Number(x.zapis_id) === Number(id1));
    if (s.mem_id !== 'mem-aaaa00000001') throw new Error('связь перезаписана: ' + s.mem_id);
  });
  // RU: Создаём конфликт между синхронной записью и подтверждением доставки: к этому моменту запись уже связана с другим экземпляром.
  // EN: Create a conflict between synchronous writing and delivery confirmation: by confirmation time, the record is already linked to another instance.
  k.pamyatDolgovremennaya.sohranit = async () => NOV('mem-aaaa00000004');
  const id4 = k.pamyat.zapisat({ klass: 'urok', soderzhim: 'знание четыре', istochnik: 's#4' });
  h.svyazat({ zapis_id: id4, mem_id: 'mem-cccc00000004', kak: 'vosstanovleno-tekstom' });
  await pauza();
  proba('[3] конфликт на пути доставки — строка журнала, связь не перезаписана', () => {
    const zh = zhurnalIzBazy(putBazy, 'svyaz-omega-ne-zapisana');
    if (zh.length !== 1) throw new Error('строк журнала ' + zh.length + ', ждали 1');
    if (!zh[0].pochemu.includes(String(id4))) throw new Error('в строке не названа запись: ' + zh[0].pochemu);
    const s4 = svyaziIzBazy(putBazy).filter((x) => Number(x.zapis_id) === Number(id4));
    if (s4.length !== 1 || s4[0].mem_id !== 'mem-cccc00000004') throw new Error('прежняя связь не цела: ' + JSON.stringify(s4));
  });

  // RU: Проверяем доверие ядра по mem_id.
  // EN: Test core trust by mem_id.
  let nomer = 0;
  k.pamyatDolgovremennaya.sohranit = async () => NOV('mem-ffff0000000' + (++nomer));
  const id5 = k.pamyat.zapisat({ klass: 'urok', soderzhim: 'знание пять, обычное', istochnik: 's#5' });
  await pauza();
  const otm = k.pamyat.zapisat({ klass: 'urok', soderzhim: 'отменяющее', istochnik: 's#6' });
  await pauza();
  k.pamyat.ustanovitOtnoshenie({ id: otm, vid: 'otmenyaet', k: id1, kto: 'стенд' });
  const utch = k.pamyat.zapisat({ klass: 'urok', soderzhim: 'уточняющее', istochnik: 's#7' });
  await pauza();
  k.pamyat.ustanovitOtnoshenie({ id: utch, vid: 'utochnyaet', k: id3, kto: 'стенд' });
  const d = k.pamyat.doverieDlyaMem(['mem-aaaa00000001', 'mem-aaaa00000003', 'mem-ffff00000001', 'mem-net-takoj']);
  proba('[4] отменённая в ядре → otmenena, со ссылкой на отменяющую', () => {
    const x = d['mem-aaaa00000001'];
    if (!x || x.itog.sostoyanie !== 'otmenena' || x.zapisi.length !== 1) throw new Error(JSON.stringify(x));
    const z = x.zapisi[0];
    if (!z.doverie.ssylki.includes(Number(otm)) || Number(z.zapis_id) !== Number(id1)) throw new Error(JSON.stringify(x));
  });
  proba('[4] уточнённая → utochnena, обычная → не отменена', () => {
    if (d['mem-aaaa00000003']?.itog.sostoyanie !== 'utochnena') throw new Error(JSON.stringify(d['mem-aaaa00000003']));
    const s5 = d['mem-ffff00000001']?.itog.sostoyanie;
    if (!s5 || s5 === 'otmenena' || s5 === 'utochnena') throw new Error('обычная: ' + JSON.stringify(d['mem-ffff00000001']) + ' id5=' + id5);
  });
  proba('[4] без связи → null, а не «можно доверять»', () => {
    if (!('mem-net-takoj' in d) || d['mem-net-takoj'] !== null) throw new Error(JSON.stringify(d['mem-net-takoj']));
  });
  // RU: Связь в общей базе не разрешает чужому агенту читать доверие записи.
  // EN: A link in a shared database does not let another agent read the record’s trust.
  const { k: k2 } = await podnyat(sloj([]), 'drugoj-uzel', putBazy);
  proba('[4] чужой агент по тому же mem_id получает null', () => {
    const x = k2.pamyat.doverieDlyaMem(['mem-aaaa00000001']);
    if (x['mem-aaaa00000001'] !== null) throw new Error(JSON.stringify(x));
  });
}

// RU: Проверяем две записи ядра у одного экземпляра; перенос по тексту допускает такую многосвязь.
// EN: Test two core records linked to one instance; text-based transfer permits this multi-link state.
{
  let nomer = 0;
  const { k, putBazy } = await podnyat({ dostupna: () => true, pochemuNedostupna: () => null,
    async sohranit() { return NOV('mem-eeee0000000' + (++nomer)); }, async proverit() { return null; } });
  const a = k.pamyat.zapisat({ klass: 'urok', soderzhim: 'проверять факт, а не намерение', istochnik: 'm#1' });
  await pauza();
  const b = k.pamyat.zapisat({ klass: 'urok', soderzhim: 'проверять факт, а не намерение — всегда', istochnik: 'm#2' });
  await pauza();
  // RU: Снимаем исходные связи a/b и связываем обе записи с одним экземпляром.
  // EN: Remove the original a/b links and link both records to one instance.
  const db = new DatabaseSync(putBazy); db.prepare('DELETE FROM svyaz_omega WHERE zapis_id IN (?, ?)').run(a, b); db.close();
  const h = otkrytHranilishche(putBazy);
  // RU: Исключение UNIQUE по mem_id должно стать именованным отказом пробы, а не падением всего стенда.
  // EN: A UNIQUE exception on mem_id must become a named probe failure rather than crash the whole suite.
  const svz = (zapis_id) => { try { return h.svyazat({ zapis_id, mem_id: 'mem-dddd00000001', kak: 'vosstanovleno-tekstom' }); }
    catch (e) { return { ishod: 'isklyuchenie: ' + e.message }; } };
  const ra = svz(a), rb = svz(b);
  proba('[5] две записи к одному экземпляру — обе связаны (не конфликт)', () => {
    if (ra.ishod !== 'svyazano' || rb.ishod !== 'svyazano') throw new Error(JSON.stringify([ra, rb]));
    const sv = svyaziIzBazy(putBazy).filter((x) => x.mem_id === 'mem-dddd00000001');
    if (sv.length !== 2) throw new Error(JSON.stringify(svyaziIzBazy(putBazy)));
  });
  const o1 = k.pamyat.zapisat({ klass: 'urok', soderzhim: 'отмена первой', istochnik: 'm#3' });
  await pauza();
  k.pamyat.ustanovitOtnoshenie({ id: o1, vid: 'otmenyaet', k: a, kto: 'стенд' });
  const d1 = k.pamyat.doverieDlyaMem(['mem-dddd00000001'])['mem-dddd00000001'];
  proba('[5] отменена одна из двух → mnogosvyaz 1/2 с пометкой verify, не выброс', () => {
    if (d1?.itog.sostoyanie !== 'mnogosvyaz' || d1.itog.n !== 2 || d1.itog.k !== 1) throw new Error(JSON.stringify(d1?.itog));
    if (!d1.itog.stroka.startsWith('verify:') || !d1.itog.stroka.includes('#' + a)) throw new Error(d1.itog.stroka);
  });
  const o2 = k.pamyat.zapisat({ klass: 'urok', soderzhim: 'отмена второй', istochnik: 'm#4' });
  await pauza();
  k.pamyat.ustanovitOtnoshenie({ id: o2, vid: 'otmenyaet', k: b, kto: 'стенд' });
  const d2 = k.pamyat.doverieDlyaMem(['mem-dddd00000001'])['mem-dddd00000001'];
  proba('[5] отменены обе → otmenena', () => {
    if (d2?.itog.sostoyanie !== 'otmenena' || d2.itog.n !== 2 || d2.itog.k !== 2) throw new Error(JSON.stringify(d2?.itog));
  });
}

// RU: Deduped с чужим mem не создаёт связь и не участвует в выдаче доверия.
// EN: Deduped with another mem does not create a link or enter trust retrieval.
{
  const { k, putBazy } = await podnyat(sloj([
    { sostoyanie: 'dostavleno', id: 'mem-c0ffee00beef', sozdana: false, pochemu: 'запись найдена по опознавателю' },
    { sostoyanie: 'dostavleno', id: 'mem-0dd000000001', sozdana: null, pochemu: 'запись найдена по опознавателю' },
  ]));
  const s1 = k.pamyat.zapisat({ klass: 'urok', soderzhim: 'урок, похожий на урок соседа', istochnik: 'u#1' });
  await pauza();
  const s2 = k.pamyat.zapisat({ klass: 'urok', soderzhim: 'урок с незнакомым ответом хранилища', istochnik: 'u#2' });
  await pauza();
  const sv = svyaziIzBazy(putBazy);
  proba('[6] «Deduped → mem-чужой» (sozdana false) — связь НЕ записана', () => {
    if (sv.some((x) => x.mem_id === 'mem-c0ffee00beef' || Number(x.zapis_id) === Number(s1))) throw new Error(JSON.stringify(sv));
  });
  proba('[6] склеенная не выдаётся: doverieDlyaMem(mem-чужой) → null', () => {
    const x = k.pamyat.doverieDlyaMem(['mem-c0ffee00beef'])['mem-c0ffee00beef'];
    if (x !== null) throw new Error(JSON.stringify(x));
  });
  proba('[6] строка журнала «склеена, корень не проверен» (исход obrabotano)', () => {
    const zh = zhurnalIzBazy(putBazy, 'svyaz-omega-skleena');
    if (zh.length !== 1 || zh[0].ishod !== 'obrabotano' || !zh[0].pochemu.includes('mem-c0ffee00beef') || !zh[0].pochemu.includes(String(s1)))
      throw new Error(JSON.stringify(zh));
  });
  proba('[6] незнакомый ответ (sozdana null) — не связывает, строка «не доказана»', () => {
    if (sv.some((x) => Number(x.zapis_id) === Number(s2))) throw new Error(JSON.stringify(sv));
    if (zhurnalIzBazy(putBazy, 'svyaz-omega-ne-dokazana').length !== 1) throw new Error('строки нет');
  });
}

// RU: Проверяем стык настоящего dsh-pamyat-omega с подставной точкой хранилища: слой отдаёт r.sozdana, ядро читает его. Раздельные стенды не поймают несогласованное имя поля.
// EN: Test the real dsh-pamyat-omega boundary with a fake storage endpoint: the layer returns r.sozdana and the core reads it. Separate suites cannot catch a mismatched field name.
let sloyOmega = null;
try { ({ apply: sloyOmega } = await import(new URL('../../dsh-pamyat-omega/src/index.js', import.meta.url).href)); }
catch { sloyOmega = null; }
let slepota = 0;
if (!sloyOmega) { slepota++; console.log('  СЛЕП [7] стык: слой dsh-pamyat-omega рядом не найден — стык не проверен'); }
else {
  const http = await import('node:http');
  let otvetZapisi = '';
  const SOD = 'урок про стык ядра и слоя: признак создания доезжает';
  const sse = (t) => 'event: message\ndata: ' + JSON.stringify({ jsonrpc: '2.0', id: 1, result: { content: [{ type: 'text', text: t }] } }) + '\n\n';
  const srv = http.createServer((req, res) => { let t = ''; req.on('data', (d) => t += d); req.on('end', () => {
    let imya = ''; try { imya = JSON.parse(t)?.params?.name ?? ''; } catch { /* RU: Пустой ответ.
 * EN: Empty response.
 */ }
    const id = (otvetZapisi.match(/mem-[0-9a-f]+/) ?? ['mem-00000000'])[0];
    res.writeHead(200, { 'content-type': 'text/event-stream' });
    res.end(sse(imya === 'omega_store' ? otvetZapisi : '# Similar Memories (1)\n\n**Source:** `' + id.slice(0, 12) + '` — ' + SOD + '\n'));
  }); });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  let sloyObj = null, politikaYadra = null;
  // RU: Настоящий слой требует политику настоящего ядра при отправке; связываем её после подъёма ядра, а не обходим защиту заглушкой.
  // EN: The real layer requires actual core policy when sending; bind it after core startup instead of bypassing protection with a stub.
  sloyOmega({ get: (imya) => imya === 'pamyat' ? politikaYadra : undefined, provide: (imya, o) => { if (imya === 'pamyatDolgovremennaya') sloyObj = o; }, logger: null },
    { adres: `http://127.0.0.1:${srv.address().port}/`, vklyuchen: true, tajmautMs: 3000 });
  const { k, putBazy } = await podnyat(sloyObj);
  politikaYadra = k.pamyat;
  const zhdat = async () => { for (let i = 0; i < 50; i++) { await pauza(); if (zhurnalIzBazy(putBazy, 'dolgovremennyj-sloj').length >= nZap) return; } };
  let nZap = 0;
  otvetZapisi = 'Stored mem-5707ed000001 (lesson_learned, permanent)';
  const z1 = k.pamyat.zapisat({ klass: 'urok', soderzhim: SOD, istochnik: 'st#1' }); nZap = 1; await zhdat();
  otvetZapisi = 'Deduped → mem-c0ffee00beef';
  const z2 = k.pamyat.zapisat({ klass: 'urok', soderzhim: SOD + ' (повтор)', istochnik: 'st#2' }); nZap = 2; await zhdat();
  srv.close();
  const sv = svyaziIzBazy(putBazy);
  proba('[7] стык: «Stored» через настоящий слой → связь записана (контроль зрячести стыка)', () => {
    if (!sv.some((x) => Number(x.zapis_id) === Number(z1) && x.mem_id === 'mem-5707ed000001')) throw new Error(JSON.stringify(sv) + ' журнал ' + JSON.stringify(zhurnalIzBazy(putBazy, 'dolgovremennyj-sloj')));
  });
  proba('[7] стык: «Deduped → mem-чужой» через настоящий слой → связи нет, в выдачу не идёт', () => {
    if (sv.some((x) => Number(x.zapis_id) === Number(z2) || x.mem_id === 'mem-c0ffee00beef')) throw new Error(JSON.stringify(sv));
    if (k.pamyat.doverieDlyaMem(['mem-c0ffee00beef'])['mem-c0ffee00beef'] !== null) throw new Error('выдаётся');
  });
}

console.log(`\nstend-svyazi-omega: ok=${ok} FAIL=${bed}` + (slepota ? ` СЛЕПОТА=${slepota}` : ''));
process.exit(bed ? 1 : slepota ? 2 : 0);
