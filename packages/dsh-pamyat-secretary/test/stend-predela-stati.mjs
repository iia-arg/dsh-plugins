// RU: Проверяем настоящую дистилляцию с подставным HTTP-провайдером: длинная статья не отвергается строгим пределом, счётчик видит превышение, тело сохраняется при записи.
// EN: Test real distillation with a fake HTTP provider: a long article is not rejected by a strict limit, the counter sees the excess, and writing preserves its body.
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createServer} from 'node:http';
import {zstdCompressSync} from 'node:zlib';
import {DatabaseSync} from 'node:sqlite';
// RU: Каждый mkdtemp создаём через vremennyj(): уборка выполняется при обычном выходе, исключении, process.exit и SIGTERM/SIGINT, включая timeout 120. SIGKILL не перехватывается; временное дочернего процесса убирает сам процесс.
// EN: Create every mkdtemp through vremennyj(): cleanup runs on normal exit, exceptions, process.exit, and SIGTERM/SIGINT, including timeout 120. SIGKILL cannot be intercepted; a child process cleans its own temporary files.
import { mkdtempSync as mkdtempSync_, rmSync as rmSync_ } from 'node:fs'
// RU: Без метода маски входа тело дистилляции отказывает. Здесь маска-пустышка намеренно пропускает текст, чтобы изолировать другой предмет; маску проверяет stend-maski-vhoda-sekretarya.
// EN: The distillation body rejects without the input-mask method. Here an identity fake deliberately passes text through to isolate another subject; stend-maski-vhoda-sekretarya tests masking.
const MASKA_PUSTYSHKA_STENDA = (t) => ({ tekst: t, zameneno: 0, klassy: [], predelDostignut: false });
const VREMENNYE = []
const vremennyj = (...a) => { const k = mkdtempSync_(...a); VREMENNYE.push(k); return k }
process.on('exit', () => { for (const k of VREMENNYE) rmSync_(k, { recursive: true, force: true }) })
process.on('SIGTERM', () => process.exit(143)); process.on('SIGINT', () => process.exit(130))
const source=process.env.SECRETARY_SOURCE;
const {distillirovat}=await import(source?pathToFileURL(join(source,'distill-shov.js')):new URL('../src/distill-shov.js',import.meta.url));
const kat=vremennyj(join(tmpdir(),'orientir-'));
const db=new DatabaseSync(join(kat,'probe.db'));db.exec('CREATE TABLE zapisi (telo TEXT)');
const bodies=['к'.repeat(100),'р'.repeat(3000),'😀'.repeat(2500),'д'.repeat(3001)];
const logs=[];let calls=0;
const server=createServer((req,res)=>{
 req.resume();
 const text=calls++===0?JSON.stringify(bodies.map((_,i)=>({theme:'тема'+i,kind:'urok'}))):bodies[calls-2];
 res.writeHead(200,{'content-type':'application/json'});
 res.end(JSON.stringify({content:[{type:'text',text}],stop_reason:'end_turn',usage:{input_tokens:10,output_tokens:5}}));
});
try {
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const journal=join(kat,'s.jsonl.zstd');
 writeFileSync(journal,zstdCompressSync(Buffer.from(JSON.stringify({seq:10,type:'user/message',data:{content:'Проверяем знание о предмете.'}})+'\n')));
 const key=join(kat,'test-key');writeFileSync(key,'test-only',{mode:0o600});
 const itog=await distillirovat({ maska: MASKA_PUSTYSHKA_STENDA,putZhurnala:journal,dannye:{shadowedSeqs:[10],shadowedTokenCount:5000},seansId:'orientir-test',
  nastrojka:{klyuch:{fajlKlyucha:key},model:'fixture',adres:`http://127.0.0.1:${server.address().port}/v1/messages`,maxTokenovTem:100,maxTokenovStati:100,predelTem:9,minTokenovSreza:1},
  krik:s=>logs.push(s),zapisat:z=>({id:Number(db.prepare('INSERT INTO zapisi VALUES (?)').run(z.soderzhim).lastInsertRowid),ishod:'zapisano',priroda:'znanie'})});
 assert.deepEqual(db.prepare('SELECT telo FROM zapisi ORDER BY rowid').all().map(r=>r.telo),bodies);
 assert.equal(itog.zapisano,4);
 if(process.env.BROKEN_PHRASE==='1') {
  assert.ok(logs.some(s=>/ориентир.*НЕ ВЫНУТ/.test(s)),logs.join('\n'));
  assert.equal(itog.orientirStati,null);
  console.log('PASS: смена фразы → явная диагностика слепоты, запись сохранена');
 } else {
  assert.equal(itog.orientirStati,3000);assert.equal(itog.dlinnyh,2);
  assert.ok(logs.some(s=>/длиннее ориентира 2 из 4/.test(s)&&/5000/.test(s)),logs.join('\n'));
  assert.equal(itog.otkazov,0);
  assert.ok(logs.every(s=>!/превыс|предел статьи|НЕ ВЫНУТ|статья.*НЕ записана/i.test(s)),logs.join('\n'));
  assert.ok(logs.filter(s=>/ориентир/.test(s)).every(s=>!/⚠️|🔴|ошибк|отказ/i.test(s)));
  console.log('PASS: 5000 JS.length с эмодзи сохранены целиком; длиннее ориентира 2 из 4; ошибок длины нет');
 }
} finally {server.closeAllConnections();await new Promise(r=>server.close(r));db.close();rmSync(kat,{recursive:true,force:true});}
