// Прогон НАСТОЯЩЕГО скрипта страницы lim.insmat.ru (снимок рядом) на файле выдачи: fetch/document подменены,
// печатается текст карточек по одной в строке. Вызов: node risuj-stranicu.js <страница.html> <limity.json>
const fs = require('fs');
const html = fs.readFileSync(process.argv[2], 'utf8'), data = JSON.parse(fs.readFileSync(process.argv[3], 'utf8'));
const src = html.split('<script>')[1].split('</script>')[0], el = {};
global.document = { getElementById: id => (el[id] = el[id] || {}) }; global.location = { reload() {} }; global.setTimeout = () => {};
global.fetch = () => Promise.resolve({ ok: true, json: () => Promise.resolve(data) });
eval(src);
setImmediate(() => { for (const id of ['snyato', 'telo']) {
  // карточка = одна строка: шаблоны страницы многострочные, поэтому сначала склеиваем пробелы, потом режем по карточкам
  const t = (el[id].innerHTML || el[id].textContent || '').replace(/<div class="kart">/g, '\u0001').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  console.log('[' + id + ']' + t.replace(/\u0001/g, '\n')); } });
