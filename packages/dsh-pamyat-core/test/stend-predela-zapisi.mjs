// RU: Возвращённый фильтр длины должен уронить чтение длинной записи; прочие отказы сохраняются.
// EN: Restored length filtering must fail long-record reading; other rejections remain.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { otkrytHranilishche } from '../src/hranilishche.js';
const h=otkrytHranilishche(':memory:');
try {
 const good={agent:'stend',klass:'fakt',soderzhim:'исправное'};
 const read=id=>h.baza.prepare('SELECT soderzhim FROM zapisi WHERE id=?').get(id).soderzhim;
 assert.equal(read(h.zapisat(good)),good.soderzhim);
 const bad={...good,klass:''};
 const sha=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
 console.log('ПОРЧА: klass fakt → пусто; SHA256',sha(good),'→',sha(bad));
 assert.notEqual(sha(good),sha(bad));assert.equal(bad.klass,'');
 assert.throws(()=>h.zapisat(bad),e=>e.code==='PAMYAT_NEPOLNAYA_ZAPIS' && /klass/.test(e.message));
 assert.equal(read(h.zapisat(good)),good.soderzhim);
 for(const s of ['x'.repeat(3000),'x'.repeat(3001),'😀'.repeat(2500),'😀'.repeat(500000)]) {
  assert.equal(read(h.zapisat({...good,soderzhim:s})),s);console.log('целиком JS.length',s.length);
 }
 assert.throws(()=>h.zapisat({...good,soderzhim:''}),{code:'PAMYAT_NEPOLNAYA_ZAPIS'});
 assert.throws(()=>h.zapisat({...good,vera:2}),{code:'PAMYAT_VERA_NEGODNA'});
 const id=h.zapisat({...good,vera:.5,ochistka:{a:1},podozrenie:{b:2}});
 const row=h.baza.prepare('SELECT vera,ochistka,podozrenie FROM zapisi WHERE id=?').get(id);
 assert.equal(row.vera,.5);assert.deepEqual(JSON.parse(row.ochistka),{a:1});assert.deepEqual(JSON.parse(row.podozrenie),{b:2});
 console.log('PASS: длина не ограничена; обязательные поля, вера, JSON и SQL сохранены; исправное → отказ → исправное');
} finally {h.baza.close();}
