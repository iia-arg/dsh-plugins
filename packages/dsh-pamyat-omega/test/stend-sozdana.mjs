/**
 * RU: Стенд различает доставку и создание: существующая запись после Deduped/Reconfirmed/Evolved может содержать наш текст, но не получает sozdana=true. Ядро связывает собственный экземпляр только при true. Подставная MCP-точка получает настоящий HTTP, отвечает заданным исходом записи и Source с нашим текстом; проверяется ответ sohranit. Область склейки принадлежит версии OMEGA, не этому стенду.
 * EN: Distinguish delivery from creation: an existing record after Deduped/Reconfirmed/Evolved may contain our text but does not receive sozdana=true. The core links its own instance only for true. A fake MCP endpoint receives real HTTP and replies with the supplied store outcome and Source containing our text; assert the sohranit result. The deduplication scope belongs to the OMEGA version, not this test.
 */
import http from 'node:http';

let apply;
try { ({ apply } = await import('../src/index.js')) }
catch (e) {
  const net = e?.code === 'ERR_MODULE_NOT_FOUND';
  console.log(`СЛЕПОТА: предмет не загрузился — ${net ? 'не установлены зависимости пакета' : String(e?.message ?? e).slice(0,160)}`);
  process.exit(2);
}

let vsego = 0, proshlo = 0;
const proba = (imya, uslovie, pochemu) => {
  vsego++;
  if (uslovie) { proshlo++; console.log('  ✅ ' + imya); }
  else console.log('  ❌ ' + imya + (pochemu ? ' — ' + pochemu : ''));
};

const SODERZHIM = 'проверять факт на той стороне, а не код возврата инструмента';
let otvetZapisi = '';
const sse = (tekst) => 'event: message\ndata: ' + JSON.stringify({ jsonrpc: '2.0', id: 1, result: { content: [{ type: 'text', text: tekst }] } }) + '\n\n';
const server = http.createServer((req, res) => {
  let telo = '';
  req.on('data', (d) => telo += d);
  req.on('end', () => {
    let imya = '';
    try { imya = JSON.parse(telo)?.params?.name ?? '' } catch { /**
     * RU: Для неизвестного запроса подставная точка возвращает пустой результат.
     * EN: The fake endpoint returns an empty result for an unknown request.
     */ }
    res.writeHead(200, { 'content-type': 'text/event-stream' });
    const id = (otvetZapisi.match(/mem-[0-9a-f]+/) ?? ['mem-00000000'])[0];
    res.end(sse(imya === 'omega_store' ? otvetZapisi
      : '# Similar Memories (1)\n\n**Source:** `' + id.slice(0, 12) + '` — ' + SODERZHIM + '\n'));
  });
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const adres = `http://127.0.0.1:${server.address().port}/`;

let sloj = null;
const ctx = { get: n => n === 'pamyat' ? { sessiyaIsklyuchena: () => false } : undefined, provide: (imya, o) => { if (imya === 'pamyatDolgovremennaya') sloj = o }, logger: null };
apply(ctx, { adres, vklyuchen: true, tajmautMs: 3000 });
if (!sloj) { console.log('СЛЕПОТА: пакет не отдал слой наружу — проверять нечего'); server.close(); process.exit(2); }

const poslat = async (otvet) => { otvetZapisi = otvet; return sloj.sohranit({ soderzhim: SODERZHIM, tip: 'urok' }); };

// RU: Исправный Stored должен подтвердить доставку до проверки остальных исходов: иначе пробы мерили бы пустой ответ.
// EN: A valid Stored response must confirm delivery before other outcomes are checked; otherwise tests would measure an empty response.
const kontrol = await poslat('Stored mem-abc123def456 (lesson_learned, permanent)');
if (kontrol?.sostoyanie !== 'dostavleno') {
  console.log('СЛЕПОТА: исправная запись не дошла до «доставлено» (' + JSON.stringify(kontrol) + ') — стенд не видит предмет');
  server.close(); process.exit(2);
}

proba('Stored → sozdana true', kontrol.sozdana === true, JSON.stringify(kontrol));
for (const [imya, otvet] of [
  ['Deduped →', 'Deduped → mem-cafe0000beef'],
  ['Reconfirmed', 'Reconfirmed mem-cafe0000beef'],
  ['Evolved', 'Evolved mem-cafe0000beef (#2)'],
  ['Deduped с хвостом противоречий', 'Deduped → mem-cafe0000beef\n\n[CONTRADICTION] New memory may contradict:\n  - `mem-1111222233334444` (80%): x'],
]) {
  const r = await poslat(otvet);
  proba(imya + ' → sozdana false (доставка при этом ' + r.sostoyanie + ')', r.sozdana === false, JSON.stringify(r));
}
const neyasno = await poslat('Memory mem-cafe0000beef ok');
proba('незнакомый ответ с id → sozdana null («не знаем», не «да»)', neyasno.sozdana === null, JSON.stringify(neyasno));
const vnutri = await poslat('Note: Stored mem-cafe0000beef earlier');
proba('«Stored» НЕ в начале ответа → не true', vnutri.sozdana !== true, JSON.stringify(vnutri));

server.close();
console.log(`\nИТОГ: ${proshlo} из ${vsego}`);
process.exit(proshlo === vsego ? 0 : 1);
