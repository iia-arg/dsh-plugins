/**
 * RU: Карта проверяется по телу запроса, полученного локальной подставной точкой, не чтением KARTA_TIPOV. Неиспользованная верная константа иначе дала бы зелёный стенд, хотя неизвестный тип ушёл бы со сроком 90 дней. Стенд не проверяет фактическое истечение срока во внешнем хранилище.
 * EN: Check the map through the request body received by a local fake endpoint, not by reading KARTA_TIPOV. An unused correct constant would otherwise pass while an unknown type was sent with a 90-day expiry. This test does not verify actual expiration in the external store.
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

// RU: Локальная точка сохраняет тело запроса и отвечает в поддерживаемом формате хранилища.
// EN: The local endpoint saves the request body and replies in the supported storage format.
const prishlo = [];
const server = http.createServer((req, res) => {
  let telo = '';
  req.on('data', (d) => telo += d);
  req.on('end', () => {
    try { prishlo.push(JSON.parse(telo)) } catch { prishlo.push({ razbor: 'НЕ РАЗОБРАЛОСЬ', telo }) }
    res.writeHead(200, { 'content-type': 'text/event-stream' });
    res.end('event: message\ndata: {"jsonrpc":"2.0","id":1,"result":{"content":[{"type":"text","text":"Stored mem-abc123def456"}]}}\n\n');
  });
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const adres = `http://127.0.0.1:${server.address().port}/`;

// RU: Подставной Context перехватывает службу, которую пакет объявляет наружу.
// EN: The fake Context captures the service exposed by the package.
let sloj = null;
const ctx = { get: n => n === 'pamyat' ? { sessiyaIsklyuchena: () => false } : undefined, provide: (imya, o) => { if (imya === 'pamyatDolgovremennaya') sloj = o }, logger: null };
apply(ctx, { adres, vklyuchen: true, tajmautMs: 3000 });

if (!sloj) { console.log('СЛЕПОТА: пакет не отдал слой наружу — проверять нечего'); server.close(); process.exit(2); }

// RU: До смысловых проб проверить, что запрос достиг точки: отсутствие запросов не должно выглядеть правильной картой.
// EN: Before semantic checks, verify that the request reached the endpoint: no requests must not appear to prove a correct map.
await sloj.sohranit({ soderzhim: 'проба зрячести', tip: 'urok' });
if (prishlo.length === 0) {
  console.log('СЛЕПОТА: до подставной точки не дошло НИ ОДНОГО запроса — стенд не видит предмет');
  server.close(); process.exit(2);
}
console.log(`контроль зрячести: запросов дошло ${prishlo.length}, разбор тела удался ${prishlo.filter(p=>!p.razbor).length}`);

const poslatt = async (tip, metadannye) => {
  prishlo.length = 0;
  await sloj.sohranit({ soderzhim: 'содержимое пробы', tip, metadannye });
  return prishlo[0]?.params?.arguments ?? prishlo[0]?.params ?? {};
};

console.log('\nКАРТА — четвёрка, у которой тождественный постоянный тип ЕСТЬ:');
for (const [nash, chuzhoj] of [['urok','lesson_learned'],['reshenie','decision'],['oshibka','error_pattern'],['ogranichenie','constraint']]) {
  const a = await poslatt(nash);
  proba(`${nash} -> ${chuzhoj}`, a.event_type === chuzhoj, `ушло «${a.event_type}» — хранилищу это имя неизвестно, знание получит 90 дней`);
}

console.log('\nГРАНИЦА карты — то, чего в ней НЕТ, обязано уходить КАК ЕСТЬ:');
for (const nash of ['fakt', 'poryadok', 'nablyudenie']) {
  const a = await poslatt(nash);
  proba(`${nash} уходит без подмены`, a.event_type === nash,
    `ушло «${a.event_type}»: кто-то добавил класс в карту — это решение о том, что достойно быть вечным, а не починка`);
}

console.log('\nИСХОДНЫЙ КЛАСС не теряется при подмене имени:');
{
  const a = await poslatt('urok');
  proba('свой klass лёг в метаданные', a.metadata?.klass === 'urok',
    `в метаданных «${a.metadata?.klass}» — после подмены имени исходный класс невосстановим`);
}
{
  const a = await poslatt('urok', { klass: 'НАЗВАННЫЙ-ЗОВУЩИМ', source_uri: 'x' });
  proba('klass зовущего НЕ затирается', a.metadata?.klass === 'НАЗВАННЫЙ-ЗОВУЩИМ',
    `стало «${a.metadata?.klass}» — зовущий назвал класс осознанно, затирать его нельзя`);
  proba('прочие метаданные целы', a.metadata?.source_uri === 'x', 'метаданные зовущего потерялись');
}
{
  const a = await poslatt('вовсе-незнакомый-класс');
  proba('незнакомое имя проходит насквозь', a.event_type === 'вовсе-незнакомый-класс',
    `ушло «${a.event_type}» — карта проглотила то, чего не знает`);
}

server.close();
console.log(`\nИТОГ: ${proshlo} из ${vsego}`);
process.exit(proshlo === vsego ? 0 : 1);
