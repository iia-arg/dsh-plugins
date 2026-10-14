// RU: Старые настройки не должны возвращать фильтр длины; диагностика называет действующий предел.
// EN: Old settings must not restore length filtering; diagnostics name the effective limit.
import assert from 'node:assert/strict';
import {otkrytHranilishche} from '../src/hranilishche.js';
for(const map of [{},{fakt:1},{'svodka-kompakcii':15200},{'':1},{fakt:-5},{fakt:3000.5},null,[]]) {
 const logs=[];const old=console.error;console.error=(...x)=>logs.push(x.join(' '));
 let h;
 try {
  h=otkrytHranilishche(':memory:',{predelZnakov:1,predelyZnakovPoKlassam:map});
  for(const klass of ['fakt','svodka-kompakcii','unknown']) {
   const s='😀'.repeat(20000);const id=h.zapisat({agent:'stend',klass,soderzhim:s});
   assert.equal(h.baza.prepare('SELECT soderzhim FROM zapisi WHERE id=?').get(id).soderzhim,s);
  }
  assert.ok(logs.some(s=>/больше не применяются/.test(s)),logs.join('\n'));
  assert.ok(logs.every(s=>!/действует общий предел/.test(s)));
 } finally {console.error=old;h?.baza.close();}
}
console.log('PASS: legacy настройки/негодные карты не режут ни один класс');
