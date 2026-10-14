// RU: Проверка extract: работает с контролируемыми запросами/процессами; реальные SDK нужны только явно интеграционным сценариям. Фикстуры API не доказывают живую подписку или production rollout.
// EN: extract verification uses controlled requests/processes; actual SDKs are required only by explicit integration cases. API fixtures do not prove a live subscription or production rollout.


import fs from 'node:fs';

export function readSource(file) {
  return fs.readFileSync(file, 'utf-8');
}

export function extractFunction(src, name) {
  const re = new RegExp(`(?:^|\\n)\\s*(?:async\\s+)?function\\s+${name}\\s*\\(`);
  const m = re.exec(src);
  if (!m) throw new Error(`функция ${name} не найдена в исходнике`);

  const fnAt = src.indexOf('function', m.index);
  const asyncAt = src.lastIndexOf('async', fnAt);
  const start = (asyncAt !== -1 && /^async\s+function$/.test(src.slice(asyncAt, fnAt + 8).replace(/\s+/g, ' ').trim().replace(/ $/, '')))
    ? asyncAt : fnAt;
  const open = src.indexOf('{', src.indexOf('(', start));
  let depth = 0, i = open, inStr = null, esc = false;
  for (; i < src.length; i++) {
    const c = src[i];
    if (inStr) {
      if (esc) { esc = false; continue; }
      if (c === '\\') { esc = true; continue; }
      if (c === inStr) inStr = null;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') { inStr = c; continue; }
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) break; }
  }
  if (depth !== 0) throw new Error(`не удалось сбалансировать скобки у ${name}`);
  return src.slice(start, i + 1);
}

export function extractConst(src, name) {
  const re = new RegExp(`\\n\\s*const\\s+${name}\\s*=\\s*([^;\\n]+);`);
  const m = re.exec(src);
  if (!m) throw new Error(`константа ${name} не найдена`);
  return m[1].trim();
}
