/**
 * RU: Стенд правила use для модели подаёт настоящим decide/perevesti оценки в форме ядра: две helped из разных kem/выдач. Веру получает готовым числом и её формулу не пересчитывает. Проверяется только ограничение модельного самоподтверждения. Коды 0 — совпало, 1 — есть отказ, 2 — предмет не загрузился.
 * EN: The model-use rule test supplies actual decide/perevesti with core-shaped ratings: two helped from different kem/deliveries. Receive trust as a score without recalculating its formula. Check only the restriction on model self-confirmation. Exit codes: 0 matches, 1 failure exists, 2 the subject failed to load.
 */
let decide, perevesti, istochnikVery;
try {
  ;({ decide, perevesti, istochnikVery } = await import('../src/index.js'));
  if (typeof istochnikVery !== 'function') throw new Error('istochnikVery не экспортирован');
} catch (e) {
  console.log(`СЛЕПОТА: предмет не загрузился — ${String(e?.message ?? e).slice(0, 160)}`);
  process.exit(2);
}
const C = { ignoreAfterMs: 7 * 86400000, ignoreVeraThreshold: 0.3, useVeraThreshold: 0.7 };
const NOW = Date.UTC(2026, 8, 30, 18, 0, 0);
const oc = (...a) => JSON.stringify(a.map(([ishod, kem]) => ({ ishod, kem, kogda: NOW })));
const rec = (o) => ({ id: 1, kogda: NOW - 3600000, vera: 1, ocenki: null, doverie: null, ...o });
let vsego = 0, proshlo = 0;
const proba = (imya, zhdu, d) => {
  vsego++;
  const ok = d.decision === zhdu[0] && d.prichina === zhdu[1];
  if (ok) proshlo++;
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${imya} → ${d.decision}/${d.prichina}${ok ? '' : ` (ждала ${zhdu.join('/')}) «${d.reason}»`}`);
};

proba('У1 одна «помогло» модели (одна выдача) → verify, не use (П3′)', ['verify', 'vera-model-1-sessiya'],
  decide(rec({ ocenki: oc(['helped', 'model:a/s1#v1']) }), C, NOW));
proba('У2 «помогло» из двух РАЗНЫХ выдач (та же сессия) → use, источник «оценка модели ×2»', ['use', 'vera-model-x2'],
  decide(rec({ ocenki: oc(['helped', 'model:a/s1#v1'], ['helped', 'model:a/s1#v2']) }), C, NOW));
proba('У3 две «помогло» по ОДНОЙ выдаче (мимо ядра) → verify', ['verify', 'vera-model-1-sessiya'],
  decide(rec({ ocenki: oc(['helped', 'model:a/s1#v1'], ['helped', 'model:a/s1#v1']) }), C, NOW));
proba('У4 подтверждена человеком при «подвело» модели → use «chelovek» (П7: человек выше модели)', ['use', 'chelovek'],
  decide(rec({ vera: 0.45, ocenki: oc(['harmful', 'model:a/s1']), doverie: { sostoyanie: 'podtverzhdena', stroka: 'подтверждена человеком' } }), C, NOW));
proba('У5 старше 8 сут при «помогло» ×2 → ignore «старше срока» (П9, порядок возраст/доверие не менялся)', ['ignore', 'starshe-sroka'],
  decide(rec({ kogda: NOW - 8 * 86400000, ocenki: oc(['helped', 'model:a/s1'], ['helped', 'model:a/s2']) }), C, NOW));
proba('У6 отменена при «помогло» ×2 → ignore видимо', ['ignore', 'otmenena'],
  decide(rec({ ocenki: oc(['helped', 'model:a/s1'], ['helped', 'model:a/s2']), doverie: { sostoyanie: 'otmenena', stroka: 'отменена #9' } }), C, NOW));
proba('У7 оценка не модели (kem без «model:») → прежняя ветка use «vera»', ['use', 'vera'],
  decide(rec({ ocenki: oc(['helped', 'skript:proba']) }), C, NOW));
proba('У8 список оценок не разбирается при числовой вере → verify, не use', ['verify', 'ocenki-ne-razbirayutsya'],
  decide(rec({ ocenki: '{негодно' }), C, NOW));
proba('У9 без оценок (ядро старше / не оценивали) → как было: use «vera»', ['use', 'vera'],
  decide(rec({ ocenki: null }), C, NOW));
proba('У10 «подвело» модели ×2 из разных выдач → ignore по вере (0.1 < 0.3)', ['ignore', 'vera-nizhe-ignore'],
  decide(rec({ vera: 0.1, ocenki: oc(['harmful', 'model:a/s1'], ['harmful', 'model:a/s2']) }), C, NOW));
vsego++;
const pv = perevesti({ id: 5, soderzhim: 'x', klass: 'urok', sozdano: NOW, vera: 1, agent: 'a', ocenki: oc(['helped', 'model:a/s1']) });
const okP = typeof pv.ocenki === 'string' && pv.ocenki.includes('model:a/s1');
if (okP) proshlo++;
console.log(`  ${okP ? 'ok  ' : 'FAIL'} У11 perevesti переносит ocenki как есть`);

console.log(`\nстенд use от модели: ${proshlo} из ${vsego}`);
process.exit(proshlo === vsego ? 0 : 1);
