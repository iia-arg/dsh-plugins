// Стенд второго входа сводки (форма (б), командный вход). Живого подъёма НЕТ — проверяется
// механизм: одна реализация на два входа, форма нагрузки, границы отказов.
// Корень исходника — из STEND_KOREN, как у stend-ohvat-i-sverka: иначе порчу на копии не подать.
const K = process.env.STEND_KOREN || '/opt/iskra/workspace/dsh-plugins/packages/dsh-pamyat-secretary/src';
const { razobratSvodku } = await import(K + '/razbor-sobytiya.js');
import fs from 'fs'; import os from 'os'; import path from 'path';

const IST = K + '/index.js';
const kod = fs.readFileSync(IST, 'utf8');
let bed = 0, vsego = 0;
const sudit = (imya, u, chem) => { vsego++; console.log(`  ${u ? '✅' : '🔴'} ${imya}${chem ? ' — ' + chem : ''}`); if (!u) bed++; };

console.log('── устройство: одна реализация на два входа ──');
sudit('приём вынесен в общую функцию', /function prinyatSvodku\(dannye, seansId, povod, istochnikYavno = null\)/.test(kod));
sudit('событийный вход зовёт её же', /prinyatSvodku\(event\.data, session\?\.id \?\? 'session', 'событие compaction\/summary'\)/.test(kod));
sudit('командный вход зовёт её же', /prinyatSvodku\(\{ summary: \[\{ type: 'text', text: tekst \}\] \}/.test(kod));
sudit('второй копии razobratSvodku нет', (kod.match(/razobratSvodku\(/g) || []).length === 1,
  `вызовов razobratSvodku: ${(kod.match(/razobratSvodku\(/g) || []).length}`);

console.log('── зовущий назван В КОДЕ (условие координатора) ──');
sudit('имя зовущего в коде', /зовущий — человек \(Web или канал\)/.test(kod));
sudit('вход печатается в журнал', /', вход: ' \+ povod/.test(kod));
sudit('названо, чего вход НЕ делает', /Сам не обнаруживает сжатие: до вызова сводка не поступит/.test(kod));

console.log('── форма нагрузки: массив блоков, а не строка ──');
const stroka = razobratSvodku({ summary: 'просто строка' }, { seansId: 'proba' });
sudit('строка отвергается (как было бы при ошибке формы)', stroka.godno === false, stroka.pochemu?.slice(0, 44));
const bloki = razobratSvodku({ summary: [{ type: 'text', text: 'текст' }], shadowedSeqs: [7, 9] }, { seansId: 'proba' });
sudit('событийный путь: массив блоков + seqs принимается', bloki.godno === true && bloki.znanie?.istochnik === 'proba#7-9',
  bloki.godno ? `источник ${bloki.znanie.istochnik}` : bloki.pochemu?.slice(0, 44));

console.log('── явный источник: вход, у которого номеров нет ──');
const bezSeqs = razobratSvodku({ summary: [{ type: 'text', text: 'текст' }] }, { seansId: 'proba' });
sudit('без seqs и без явного источника → отказ (ссылка обязательна)', bezSeqs.godno === false, bezSeqs.pochemu?.slice(0, 40));
const ruka = razobratSvodku({ summary: [{ type: 'text', text: 'сводка из файла' }] },
  { seansId: 'ruka', istochnikYavno: 'ruka:/tmp/svodka.txt' });
sudit('с явным источником → принято, источник НЕ выдуман', ruka.godno === true && ruka.znanie?.istochnik === 'ruka:/tmp/svodka.txt',
  ruka.godno ? `источник ${ruka.znanie.istochnik}, затенённых ${ruka.znanie.zatenennyhZapisej}` : ruka.pochemu?.slice(0, 40));
const pustoj = razobratSvodku({ summary: [{ type: 'text', text: 'текст' }] }, { seansId: 'r', istochnikYavno: '   ' });
sudit('пустой явный источник НЕ подменяется молча', pustoj.godno === false, pustoj.pochemu?.slice(0, 40));

console.log('── границы отказов командного входа ──');
sudit('путь не задан → отказ с именем аргумента', /Путь не задан: \/svodka-prinyat <путь к файлу со сводкой>/.test(kod));
sudit('умолчания пути нет намеренно', /Умолчания нет намеренно/.test(kod));
sudit('пустой файл → ответ про файл, не про сжатие', /Это ответ про файл, а не про сжатие/.test(kod));
sudit('нет службы commands → сказано вслух, событийный вход не задет', /НЕ ЗАРЕГИСТРИРОВАНА/.test(kod) && /Событийный вход не задет/.test(kod));

const kat = fs.mkdtempSync(path.join(os.tmpdir(), 'vhod-'));
fs.writeFileSync(path.join(kat, 'svodka.txt'), 'сводка из файла');
sudit('файл читается как текст', fs.readFileSync(path.join(kat, 'svodka.txt'), 'utf8') === 'сводка из файла');
fs.rmSync(kat, { recursive: true, force: true });

const ZHDYOM = 17;
if (vsego !== ZHDYOM) { console.log(`🔴 КАНАРЕЙКА: проб ${vsego}, ЖДЁМ ${ZHDYOM}`); process.exit(2); }
console.log(`\nитог: ${vsego - bed} из ${vsego}`);
process.exit(bed ? 1 : 0);
