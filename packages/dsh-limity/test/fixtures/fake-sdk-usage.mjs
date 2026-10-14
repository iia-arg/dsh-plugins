// Заглушка SDK для стенда dsh-limity-zamer (1.0.4): сети нет. Сценарий — по содержимому .credentials.json каталога входа:
//   …FAKE-OK…   → usage как у живой r5 p1 07.10 19:05Z (5ч 0 %, неделя 100 % до 09.10 02:00Z, кредиты 1417 из 2000 USD);
//   …FAKE-NULL… → rate_limits null (как r1–r4); …FAKE-TS… → accountInfo с tokenSource (токен не из входа каталога).
// И ПРОВЕРЯЕТ опции запуска: нарушение → исключение (замер «не измерено»), запись — в zapis.log рядом с заглушкой.
import { appendFileSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const ZAPIS = join(dirname(fileURLToPath(import.meta.url)), 'zapis.log');

export function query({ prompt, options = {} }) {
  const env = options.env || {};
  let vhod = '';
  try { vhod = readFileSync(join(env.CLAUDE_CONFIG_DIR || '/nonexistent', '.credentials.json'), 'utf8'); } catch {}
  const nado = {
    tools: JSON.stringify(options.tools) === '[]', mcpServers: JSON.stringify(options.mcpServers) === '{}',
    settingSources: JSON.stringify(options.settingSources) === '[]', persistSession: options.persistSession === false,
    ENABLE_CLAUDEAI_MCP_SERVERS: env.ENABLE_CLAUDEAI_MCP_SERVERS === 'false',
    bez_NONESSENTIAL: !('CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC' in env),
    bez_tokena_v_env: !env.CLAUDE_CODE_OAUTH_TOKEN && !env.ANTHROPIC_API_KEY,
    dom_vhoda: !!env.HOME && env.HOME === env.CLAUDE_CONFIG_DIR, bez_soobshcheniya: typeof prompt !== 'string',
  };
  const plohie = Object.keys(nado).filter((k) => !nado[k]);
  const vid = vhod.includes('FAKE-OK') ? 'ok' : vhod.includes('FAKE-NULL') ? 'null' : vhod.includes('FAKE-TS') ? 'ts' : '?';
  appendFileSync(ZAPIS, JSON.stringify({ vid, plohie, uid: process.getuid(), dom: env.HOME }) + '\n');
  const stop = new Promise((r) => options.abortController?.signal.addEventListener('abort', r));
  const it = (async function* () { await stop; })();
  it.accountInfo = async () => {
    if (plohie.length) throw new Error('опции запуска нарушены: ' + plohie.join(','));
    return vid === 'ts' ? { email: 'x@y', tokenSource: 'CLAUDE_CODE_OAUTH_TOKEN' } : { email: 'ii…@ostrov.center', subscriptionType: 'Claude Max' };
  };
  it.usage_EXPERIMENTAL_MAY_CHANGE_DO_NOT_RELY_ON_THIS_API_YET = async () => {
    if (vid === 'null') return { subscription_type: 'max', rate_limits_available: true, rate_limits: null };
    // r3: настоящий ответ usage r5 (p1, 07.10 19:05Z) — фикстура рядом; сбросы — в будущее (стенд не протухает после 09.10);
    // доля кредитов — меткой KR=, severity weekly_all — меткой WA=; плюс неизвестное окно и неизвестное поле (их нельзя терять)
    const u = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'usage-r5-p1.json'), 'utf8'));
    const rl = u.rate_limits, T = Date.now(), iso = (d) => new Date(T + d * 86400e3).toISOString();
    const kr = Number((vhod.match(/KR=(\d+(?:\.\d+)?)/) || [0, 70.85])[1]), wa = (vhod.match(/WA=(\w+)/) || [0, 'critical'])[1];
    rl.seven_day.resets_at = iso(2); rl.iguana_necktie.resets_at = iso(29);
    for (const l of rl.limits) { if (l.resets_at) l.resets_at = iso(2); if (l.kind === 'weekly_all') l.severity = wa; }
    for (const m of rl.model_scoped) m.resets_at = iso(2);
    Object.assign(rl.extra_usage, { used_credits: Math.round(20 * kr), utilization: kr, spend_limit_reached: kr >= 100 });
    if (vhod.includes('BEZVAL')) delete rl.extra_usage.currency;
    if (vhod.includes('BEZDP')) { delete rl.extra_usage.decimal_places; if (rl.spend && rl.spend.used) delete rl.spend.used.exponent; }   // r9   // r8: ответ без валюты кредитов (как у p5 вживую)
    rl.novoe_okno = { utilization: 12, resets_at: iso(3), limit_dollars: null, novoe_pole: 1 };
    rl.neizvestnoe_pole = { a: 1 };
    return u;
  };
  return it;
}
