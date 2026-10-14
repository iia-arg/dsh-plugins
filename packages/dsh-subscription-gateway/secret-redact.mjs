// RU: Одно правило на выходе шлюза: перед записью в NDJSON и stderr вычищать ТОЧНЫЕ значения секретов этого процесса —
//     подписочный токен (GATEWAY_TOKEN_FILE), ingress-ключ (GATEWAY_INGRESS_KEY_FILE), токены Codex access/refresh/id (CODEX_HOME/auth.json) —
//     в буквальной, JSON-экранированной и URI-форме. Сырые поля провайдера без известной формы (модель, причина подмены,
//     статус хода, метод, id нити) пропускаются только по белому списку формы.
//     ЧЕГО НЕ ЛОВИТ: секрет, искажённый иначе (обрезанный, base64, разбитый на части), секреты других процессов и машин,
//     вывод мимо send/log (HTTP-ответы 4xx/5xx JSON, дочерние процессы напрямую в журнал). Значения короче 16 знаков не ищутся.
// EN: Single egress rule: redact exact values of this process's secrets (subscription token, ingress key, Codex access/refresh/id tokens)
//     in literal, JSON-escaped and URI forms before NDJSON/stderr writes; raw provider fields pass only by a shape allowlist.
import fs from 'node:fs';
import path from 'node:path';

const ZAMENA = '[секрет скрыт]';
const MIN_DLINA = 16;
const kesh = new Map();

// RU: prochest: Значение секрета из файла с перечитыванием при смене mtime/размера; отказ чтения — секрета нет, не исключение.
// EN: prochest: Reads a secret file, re-reading on mtime/size change; a read failure yields no secret rather than an exception.
function prochest(file, izvlech) {
  if (!file) return null;
  let st;
  try { st = fs.statSync(file); } catch { kesh.delete(file); return null; }
  const k = kesh.get(file);
  if (k && k.mtimeMs === st.mtimeMs && k.size === st.size) return k.v;
  let v = null;
  try { v = izvlech(fs.readFileSync(file, 'utf8')); } catch { v = null; }
  kesh.set(file, { mtimeMs: st.mtimeMs, size: st.size, v });
  return v;
}

// RU: sekretyProcessa: Текущие значения секретов процесса (токен, ingress, три токена Codex) (без кэша вне файлов: env читается на каждом вызове).
// EN: sekretyProcessa: Current values of the process's three secrets.
export function sekretyProcessa(env = process.env) {
  const tokenFile = env.GATEWAY_TOKEN_FILE || '/etc/subscription-gateway/token';
  const out = [
    prochest(tokenFile, (t) => t.split('\n')[0].trim()),
    prochest(env.GATEWAY_INGRESS_KEY_FILE, (t) => t.trim()),
    prochest(env.CODEX_HOME ? path.join(env.CODEX_HOME, 'auth.json') : null, (t) => { const k = JSON.parse(t)?.tokens ?? {}; return [k.access_token, k.refresh_token, k.id_token]; }),
  ].flat();
  return out.filter((v) => typeof v === 'string' && v.length >= MIN_DLINA);
}

// RU: formy: Буквальная, JSON-экранированная (один и два уровня: текст ошибки, сам собранный из JSON, ещё раз
//     сериализуется в NDJSON) и URI-форма одного значения. Длинные формы — первыми, чтобы короткая не разбила длинную.
// EN: formy: Literal, JSON-escaped (one and two levels) and URI forms of one value, longest first.
function formy(v) {
  const j = (x) => JSON.stringify(x).slice(1, -1);
  return [...new Set([j(j(v)), j(v), encodeURIComponent(v), v])].sort((a, b) => b.length - a.length);
}

// RU: vychistit: Заменяет каждую форму каждого секрета; замена без кавычек и обратных косых — JSON остаётся разбираемым.
// EN: vychistit: Replaces each form of each secret; the replacement keeps JSON parseable.
export function vychistit(s, sekrety = sekretyProcessa()) {
  let t = String(s);
  for (const v of sekrety) for (const f of formy(v)) if (t.includes(f)) t = t.split(f).join(ZAMENA);
  return t;
}

const BELYJ = {
  model: (v) => /^[A-Za-z0-9][A-Za-z0-9._:-]{0,47}$/.test(v),
  prichina: (v) => /^[A-Za-z][A-Za-z0-9_-]{0,47}$/.test(v),
  status: (v) => ['completed', 'interrupted', 'failed', 'inProgress'].includes(v),
  metod: (v) => /^[a-z][A-Za-z0-9]{0,31}(\/[A-Za-z0-9]{1,31}){0,3}$/.test(v),
  id: (v) => /^[A-Za-z0-9_-]{1,48}$/.test(v),
};

// RU: poBelomu: Сырое поле провайдера — как есть, если его форма в белом списке; иначе только вид и длина.
// EN: poBelomu: A raw provider field passes only if its shape is allowlisted; otherwise only its kind and length.
export function poBelomu(v, vid) {
  if (v === null || v === undefined) return String(v);
  const s = typeof v === 'string' ? v : JSON.stringify(v);
  return BELYJ[vid]?.(s) ? s : `«${vid} не по списку, ${s.length} зн.»`;
}
