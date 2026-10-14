// dsh-limity-zamer.mjs — ОДИН замер штатным usage SDK через вход владельца pN, БЕЗ хода к модели (B-N-1776 источник Б,
// решение Забавы 07.10 19:05Z после живой r5: «fetchUtilization: 200», окна и кредиты). Зовёт ТОЛЬКО обёртка dsh-limity-zamer
// (root) от учётки limity-zamer-pN; сама не решает «замерять ли».
// Вход — окружение: DSH_LIMITY_ZAMER_N (номер подписки Claude), DSH_LIMITY_ZAMER_KATALOG (каталог входа = HOME = CLAUDE_CONFIG_DIR),
// DSH_LIMITY_ZAMER_ORG (организация подписки N из podpiski.json), DSH_LIMITY_VHOD (приёмная).
// Сверки на КАЖДОМ прогоне, до usage: вход есть (.credentials.json) · организация сохранённого входа (.claude.json oauthAccount) =
// организации подписки N · accountInfo без tokenSource (токен — из входа каталога, не из окружения/дескриптора/чужого файла).
// Выход: строки в приёмную (five_hour, seven_day — доля 0..1 и сброс в секундах; extra_usage — кредиты: доля, предел и потрачено
// в USD, status allowed|rejected) и ОДНА строка JSON на stdout. Отказ — строки izmereno=0 с причиной по five_hour/seven_day.
// 🔴 CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC НЕ СТАВИТЬ: он режет сам GET /api/oauth/usage до сети (причина r1–r4 такта 5).
// ЧЕГО НЕ ЛОВИТ: прочие кодовые окна ответа (iguana_necktie, limits[].model_scoped …) — в таблицу не идут · подмену входа на
// аккаунт ТОЙ ЖЕ организации · расход вне sadik — только ростом доли.
import { readFileSync, writeFileSync, renameSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const E = process.env;
const N = Number(E.DSH_LIMITY_ZAMER_N);
const KAT = E.DSH_LIMITY_ZAMER_KATALOG || '';
const ORG = E.DSH_LIMITY_ZAMER_ORG || '';
const VHOD = E.DSH_LIMITY_VHOD || '/var/spool/dsh-limity/vhod';
const SDK = E.DSH_LIMITY_ZAMER_SDK || '/opt/subscription-gateway-guest/sdk-runtime/node_modules/@anthropic-ai/claude-agent-sdk/sdk.mjs';
const SROK_MS = Number(E.DSH_LIMITY_ZAMER_SROK_MS || 60000);
const t0 = Date.now();
const maska = (x) => String(x ?? '').replace(/sk-ant-\S+|eyJ\S+|Bearer\s+\S+/gi, '…');

function itog(ishod, prichina, okon, dop = {}) { process.stdout.write(JSON.stringify({ ishod, prichina, okon, ms: Date.now() - t0, ...dop }) + '\n'); }
function polozhit(stroka) {
  const imya = `zamer-${N}-${stroka.okno}-${Date.now()}-${process.pid}`;
  const tmp = join(VHOD, `.${imya}.tmp`);
  writeFileSync(tmp, JSON.stringify(stroka) + '\n', { mode: 0o640, flag: 'wx' });
  renameSync(tmp, join(VHOD, `${imya}.json`));
}
const stroka = (okno, polya) => ({ moment_utc: Date.now() / 1000, provajder: 'claude', podpiska: N, okno, dolya: null, sbros_utc: null,
  status: null, izmereno: 1, prichina: null, istochnik: 'sdk_usage', otkuda: 'zamer', ...polya });
function ne_izmereno(prichina) {   // «не измерено» — строка, а не молчание и не ноль
  const pr = maska(prichina).slice(0, 200);
  for (const okno of ['five_hour', 'seven_day']) polozhit(stroka(okno, { izmereno: 0, prichina: pr }));
  itog('ne_izmereno', pr, 0, { refresh_do });
}
const konec = (kod) => { setTimeout(() => process.exit(kod), 50); };

if (E.ENABLE_CLAUDEAI_MCP_SERVERS !== 'false') {   // r2 (Вениамин 19:06Z): без явного выключения коннекторов claude.ai — отказ, не замер
  itog('slepota', 'ENABLE_CLAUDEAI_MCP_SERVERS не false — коннекторы claude.ai аккаунта подтянулись бы', 0); process.exit(2);
}
if (!Number.isSafeInteger(N) || N < 1 || !KAT || !ORG) { itog('slepota', 'нет DSH_LIMITY_ZAMER_N / _KATALOG / _ORG', 0); process.exit(2); }
if (E.CLAUDE_CODE_OAUTH_TOKEN || E.ANTHROPIC_API_KEY || E.CLAUDE_CODE_OAUTH_TOKEN_FILE_DESCRIPTOR) {
  itog('slepota', 'в окружении токен/ключ — вход каталога был бы перекрыт', 0); process.exit(2);
}
// Сверка 1: вход есть. Сверка 2: организация сохранённого входа = организации подписки N (локальные файлы, без сети).
let refresh_do = null;   // r2: срок refresh-токена входа (сек) — обёртка тревожит за 7 дней
try { const o = JSON.parse(readFileSync(join(KAT, '.credentials.json'), 'utf8')).claudeAiOauth || {};
      if (typeof o.refreshTokenExpiresAt === 'number') refresh_do = o.refreshTokenExpiresAt > 1e11 ? o.refreshTokenExpiresAt / 1000 : o.refreshTokenExpiresAt; }
catch (e) { ne_izmereno(`вход отозван или отсутствует (${e.code || e.name}: .credentials.json)`); konec(0); await new Promise(() => {}); }
let org = null;
try { org = JSON.parse(readFileSync(join(KAT, '.claude.json'), 'utf8')).oauthAccount?.organizationUuid ?? null; } catch { org = null; }
if (org !== ORG) { ne_izmereno(`вход не той организации: ${String(org).slice(0, 8)} ≠ ${ORG.slice(0, 8)} (подписка ${N})`); konec(0); await new Promise(() => {}); }

const pusto = mkdtempSync(join(tmpdir(), 'dsh-limity-zamer-'));
const ac = new AbortController();
const srok = setTimeout(() => ac.abort(), SROK_MS);
const nikogda = async function* () { await new Promise(() => {}); };   // сообщения пользователя нет ⇒ хода к модели нет
let acc, u, oshibka = null, vidy = {};
try {
  const { query } = await import(SDK);
  const q = query({ prompt: nikogda(), options: { tools: [], mcpServers: {}, settingSources: [], persistSession: false, cwd: pusto,
    abortController: ac,
    env: { PATH: '/usr/local/bin:/usr/bin:/bin', HOME: KAT, CLAUDE_CONFIG_DIR: KAT, ENABLE_CLAUDEAI_MCP_SERVERS: 'false',
           DISABLE_TELEMETRY: '1', DISABLE_AUTOUPDATER: '1' } } });
  (async () => { try { for await (const m of q) vidy[m.type] = (vidy[m.type] || 0) + 1; } catch {} })();
  acc = await q.accountInfo();
  if (acc?.tokenSource) throw new Error(`токен не из входа каталога (tokenSource ${acc.tokenSource})`);
  u = await q.usage_EXPERIMENTAL_MAY_CHANGE_DO_NOT_RELY_ON_THIS_API_YET({ skipBehaviors: true });
} catch (e) {
  oshibka = ac.signal.aborted ? `замер не уложился в ${SROK_MS / 1000} с` : `${e?.name || 'ошибка'}: ${maska(e?.message).slice(0, 120)}`;
} finally { clearTimeout(srok); ac.abort(); rmSync(pusto, { recursive: true, force: true }); }

if (oshibka) { ne_izmereno(`usage не получен: ${oshibka}`); konec(0); }
else if ((vidy.assistant || 0) + (vidy.result || 0) + (vidy.rate_limit_event || 0)) { ne_izmereno('был ход к модели — замер отброшен'); konec(0); }
else if (!u?.rate_limits_available) { ne_izmereno('usage: rate_limits_available=false (нет user:profile или не подписка)'); konec(0); }
else {
  const rl = u.rate_limits || {}, gotovo = [];
  const sek = (iso) => { const t = iso ? Date.parse(iso) / 1000 : NaN; return Number.isFinite(t) ? t : null; };
  for (const okno of ['five_hour', 'seven_day']) {   // usage: ПРОЦЕНТЫ 0..100 и ISO ⇒ доля 0..1 и секунды
    const w = rl[okno];
    if (w && typeof w.utilization === 'number') gotovo.push(stroka(okno, { dolya: w.utilization / 100, sbros_utc: sek(w.resets_at) }));
  }
  const x = rl.extra_usage;   // кредиты (перерасход) — только usage их и видит
  let kredity = null;
  if (x && typeof x === 'object') {
    const vkl = x.is_enabled === true, upor = x.spend_limit_reached === true;
    // r3: monthly_limit/used_credits — в МЛАДШИХ единицах (decimal_places; у spend то же — amount_minor/exponent): 1417 ⇒ 14.17 USD
    // r9 (Вениамин, мелочь r3): нет decimal_places — единица НЕИЗВЕСТНА: суммы не выдаём (null), а не делим на 100 по догадке
    const dpOk = Number.isInteger(x.decimal_places), del = dpOk ? 10 ** x.decimal_places : null;
    const pr = dpOk && typeof x.monthly_limit === 'number' ? x.monthly_limit / del : null, pt = dpOk && typeof x.used_credits === 'number' ? x.used_credits / del : null;
    gotovo.push(stroka('extra_usage', { dolya: typeof x.utilization === 'number' ? x.utilization / 100 : (pr && pt != null ? pt / pr : 0),
      status: vkl && !upor ? 'allowed' : 'rejected', predel: pr, potracheno: pt,
      prichina: !vkl ? `кредиты выключены${x.disabled_reason ? ': ' + maska(x.disabled_reason).slice(0, 60) : ''}` : upor ? 'месячный предел кредитов достигнут' : dpOk ? null : 'единица сумм неизвестна (нет decimal_places) — суммы не выданы' }));
    kredity = { vkl, upor, predel: pr, potracheno: pt, dolya: gotovo[gotovo.length - 1].dolya };
  }
  const okon = gotovo.filter((s) => s.okno !== 'extra_usage').length;
  if (!okon) ne_izmereno(`usage без окон (rate_limits ${u.rate_limits === null ? 'null' : 'без five_hour/seven_day'})`);   // квантор по пустому — НЕ ГОДНО
  else {
    for (const s of gotovo) polozhit(s);
    // r3 (слово владельца 07.10 22:07 МСК «все возможные доп параметры, как на странице usage»): ПОЛНЫЙ снимок rate_limits —
    // отдельной записью приёмной; пустые (null) ключи отброшены, остальное — как пришло (служба раскладывает и кладёт «прочее» сырым).
    const snimok = Object.fromEntries(Object.entries(rl).filter(([, v]) => v !== null && v !== undefined));
    polozhit({ vid: 'usage_snimok', moment_utc: Date.now() / 1000, podpiska: N, subscription_type: u.subscription_type ?? null,
               rate_limits: snimok, okno: 'snimok' });
    const wa = Array.isArray(rl.limits) ? rl.limits.find((l) => l && l.kind === 'weekly_all') : null;
    itog('izmereno', null, gotovo.length, { kredity, refresh_do, weekly_all: wa ? { severity: wa.severity ?? null, percent: wa.percent ?? null } : null });
  }
  konec(0);
}
