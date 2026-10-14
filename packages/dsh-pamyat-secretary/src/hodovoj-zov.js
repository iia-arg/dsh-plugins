// RU: Ходовой вход вызывает общее тело дистилляции по новым turn/end, когда платформа не компактизирует внутренний контекст движка. Считает речь после сохранённой воды и берёт одно окно до первого turn/end после porogZnakov; вода меняется только после успеха. Живая метка любого пути/экземпляра исключает параллельный заход. Вода хранится в DSH_HOME/pamyat-secretary; без DSH_HOME явный отказ, без fallback к дому учётки. Не более одного окна на событие; после neudachPodryad неудач — pauzaMinut и однократная тревога. Внутренние rollout-инструменты движка не попадают в этот журнал; восстановленные события образуют долг, но запускает только новый turn/end.
// EN: The turn-based entry invokes shared distillation on new turn/end events when the platform does not compact the internal engine context. Count speech after the saved high-water mark and take one window through the first turn/end after porogZnakov; advance the mark only on success. A live marker from any path/instance prevents parallel runs. Store the mark in DSH_HOME/pamyat-secretary; missing DSH_HOME explicitly fails without falling back to the account home. At most one window per event; neudachPodryad failures trigger pauzaMinut and one alert. Internal engine rollout tools do not enter this journal; restored events create a backlog, but only a new turn/end triggers processing.

import { mkdirSync, readFileSync, writeFileSync, renameSync, readdirSync } from 'node:fs';
import { sobrat_transkript } from './chtenie-zhurnala.js';
import { eSvodkaSzhatiya, chitatSobytiya } from './distill-shov.js';

export const PREFIKS_METKI_RAZBORA = 'razbor-idet';

/**
 * RU: Вода сдвигается после полного успеха либо штатного отсутствия материала для разбора.
 * EN: Advance the mark after complete success or a valid absence of material to process.
 */
export function uspeh(itog) {
  if (!itog) return false;
  if (itog.ishod === 'ok') return itog.okon === undefined || itog.okonOk === itog.okon;
  return itog.ishod === 'net-rechi' || itog.ishod === 'propushchen-svodki';
}
/**
 * RU: Другой экземпляр уже обрабатывает срез: нейтральный исход, не успех и не неудача.
 * EN: Another instance is processing the slice: a neutral outcome, neither success nor failure.
 */
export const nejtralno = (itog) => itog?.ishod === 'zahod-uzhe-byl';

/**
 * RU: Окно содержит seq в (voda,doSeq], речь считает общий sobrat_transkript. Оно заканчивается на первом turn/end после достижения порога; до порога окно не создаётся.
 * EN: The window contains seq in (voda,doSeq], with speech counted by the shared sobrat_transkript. End it at the first turn/end after reaching the threshold; create no window before the threshold.
 */
export function vybratOkno(sobytiya, voda, doSeq, porog, opcii = {}) {
  const zapisi = sobytiya.filter((e) => Number.isInteger(e?.seq) && e.seq > voda && e.seq <= doSeq)
    .sort((a, b) => a.seq - b.seq);
  let znakov = 0, konec = null;
  for (const e of zapisi) {
    if (!eSvodkaSzhatiya(e)) {
      const t = sobrat_transkript([e], opcii);
      if (t) znakov += t.length + 2;   // RU: Два дополнительных знака учитывают разделитель частей sobrat_transkript.
      // EN: Two extra characters account for the sobrat_transkript segment separator.
    }
    if (znakov >= porog && e.type === 'turn/end') { konec = e.seq; break; }
  }
  if (konec === null) return { znakov, okno: null };
  const seqs = zapisi.filter((e) => e.seq <= konec).map((e) => e.seq);
  return { znakov, okno: { seqs, ot: seqs[0], do: konec } };
}

export function pidZhiv(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try { process.kill(pid, 0); return true; } catch (e) { return e?.code === 'EPERM'; }
}

/**
 * RU: Проверить живую метку любого захода в каталоге агента, не только этого пути.
 * EN: Check for a live marker of any run in the agent directory, not just this path.
 */
export function zhivayaMetka(kat, zhiv = pidZhiv) {
  if (!kat) return false;
  let imena;
  try { imena = readdirSync(kat); } catch { return false; }
  for (const f of imena) {
    if (!f.startsWith(PREFIKS_METKI_RAZBORA + '-') || !f.endsWith('.txt')) continue;
    try { if (zhiv(JSON.parse(readFileSync(kat + '/' + f, 'utf8')).pid)) return true; }
    catch { /**
     * RU: Неразобранная метка не удерживает блокировку как доказательство живого захода.
     * EN: An unparsed marker does not retain a lock as proof of a live run.
     */ }
  }
  return false;
}

/**
 * RU: zapustit(session,dannye) возвращает Promise<itog> общего тела compaction/summary; vyklyuchena() отдаёт причину или null из того же выключателя.
 * EN: zapustit(session,dannye) returns Promise<itog> from the shared compaction/summary body; vyklyuchena() returns a reason or null from the same disable switch.
 */
export function sozdatHodovojZov({ nastrojka = {}, dshHome, putOtklonennyh, krik, trevoga = () => {},
  zapustit, vyklyuchena = () => null, sejchas = () => Date.now(), zhiv = pidZhiv, opcii = {} }) {
  const vkl = nastrojka.vkl === true;
  if (!vkl) return { vkl: false, naSobytie: () => null };
  if (!dshHome) {
    krik('ходовой зов: ОТКАЗ — DSH_HOME не задан; вода держится по дому агента, а не по учётке '
       + '(несколько агентов могут иметь общую учётку) — зов НЕ заведён');
    return { vkl: false, naSobytie: () => null };
  }
  const porog = Number(nastrojka.porogZnakov) > 0 ? Number(nastrojka.porogZnakov) : 160000;
  const K = Number(nastrojka.neudachPodryad) > 0 ? Number(nastrojka.neudachPodryad) : 3;
  const pauzaMs = (Number(nastrojka.pauzaMinut) > 0 ? Number(nastrojka.pauzaMinut) : 360) * 60000;
  const kat = dshHome + '/pamyat-secretary';
  const putVody = kat + '/vysokaya-voda.json';
  let idet = false;

  // RU: Только отсутствие файла допускает начальную воду -1. Ошибка чтения/JSON/формы запрещает вызов, не обнуляя сохранённую историю; следующий вызов заново читает состояние после снятия порчи.
  // EN: Only a missing file permits the initial watermark -1. Read/JSON/shape errors refuse the call without resetting stored history; the next call rereads state after repair.
  const prochest = () => {
    let tekst;
    try { tekst = readFileSync(putVody, 'utf8'); } catch (e) { if (e?.code === 'ENOENT') return {}; throw e; }
    const vse = JSON.parse(tekst);
    if (!vse || typeof vse !== 'object' || Array.isArray(vse)) throw new Error('вода: ожидается объект состояний');
    return vse;
  };
  const zapisat = (vse) => {
    mkdirSync(kat, { recursive: true, mode: 0o700 });
    const vr = putVody + '.' + process.pid + '.tmp';
    writeFileSync(vr, JSON.stringify(vse, null, 1), { mode: 0o600 });
    renameSync(vr, putVody);
  };
  const sostoyanie = (sid) => {
    const vse = prochest();
    if (!Object.hasOwn(vse, sid)) return { voda: -1, neudach: 0, pauzaDo: 0 };
    const zapis = vse[sid];
    if (!zapis || typeof zapis !== 'object' || Array.isArray(zapis) || !Object.hasOwn(zapis, 'voda')) throw new Error('вода: негодная запись сессии');
    const s = { neudach: 0, pauzaDo: 0, ...zapis };
    if (!Number.isInteger(s.voda) || s.voda < -1 || !Number.isInteger(s.neudach) || s.neudach < 0 || !Number.isFinite(s.pauzaDo) || s.pauzaDo < 0) throw new Error('вода: негодное состояние сессии');
    return s;
  };
  const otkazVody = (e) => {
    const pochemu = putVody + ': ' + String(e?.message ?? e);
    krik('ходовой зов: ОТКАЗ чтения воды — ' + pochemu + '; окно не разбирается');
    return { ishod: 'otkaz-vody', pochemu };
  };
  const obnovit = (sid, s) => {
    try { const vse = prochest(); vse[sid] = s; zapisat(vse); return true; }
    catch (e) { krik('🔴 ходовой зов: вода НЕ ЗАПИСАНА (' + putVody + ': ' + (e?.message ?? e) + ') — следующий ход возьмёт то же окно'); return false; }
  };

  krik(`ходовой зов: ЗАВЕДЁН — порог ${porog} знаков речи, неудач подряд до паузы ${K}, пауза ${pauzaMs / 60000} мин, вода ${putVody}`);

  function naSobytie(session, event) {
    if (event?.type !== 'turn/end') return null;
    const sid = session?.id ?? 'session';
    let s; try { s = sostoyanie(sid); } catch (e) { return Promise.resolve(otkazVody(e)); }
    if (sejchas() < s.pauzaDo) return null;   // RU: Во время паузы после K неудач повтор и новая тревога не запускаются.
    // EN: During the pause after K failures, run neither another retry nor a new alert.
    const sobytiya = chitatSobytiya(session);
    if (!Array.isArray(sobytiya)) { krik('ходовой зов: история сессии недоступна (ни session.events, ни snapshotEvents) — окно не выбрать'); return null; }
    const { znakov, okno } = vybratOkno(sobytiya, s.voda, event.seq, porog, opcii);
    if (!okno) return null;
    if (idet || zhivayaMetka(putOtklonennyh, zhiv)) {
      krik(`ходовой зов: окно готово (seq ${okno.ot}–${okno.do}, ${znakov} знаков), но дистилляция уже идёт — жду её конца`);
      return null;
    }
    const vykl = vyklyuchena();
    if (vykl) { krik('ходовой зов: окно готово, дистилляция ПРОПУЩЕНА — ' + vykl); return null; }
    idet = true;
    krik(`ходовой зов: передаю окно дистилляции — сессия ${sid}, окно seq ${okno.ot}–${okno.do} (${okno.seqs.length} событий, `
       + `${znakov} знаков речи, порог ${porog}); вода ${s.voda}`);
    let p;
    try { p = Promise.resolve(zapustit(session, { shadowedSeqs: okno.seqs, shadowedTokenCount: null })); }
    catch (e) { p = Promise.resolve({ ishod: 'ne-sobralas', pochemu: String(e?.message ?? e) }); }
    return p.catch((e) => ({ ishod: 'otkaz-zahoda', pochemu: String(e?.message ?? e) })).then((itog) => {
      let t; try { t = sostoyanie(sid); } catch (e) { return otkazVody(e); }
      if (uspeh(itog)) {
        t.voda = Math.max(t.voda, okno.do); t.neudach = 0; t.pauzaDo = 0;
        if (!obnovit(sid, t)) return { ...itog, ishod: 'voda-ne-sohranena', pochemu: 'сохранение воды отказало; сдвиг не подтверждён' };
        krik(`ходовой зов: вода сдвинута ${s.voda} → ${t.voda} (исход ${itog.ishod})`);
      } else if (nejtralno(itog)) {
        krik(`ходовой зов: срез уже разбирает другой экземпляр (исход ${itog.ishod}) — вода не тронута`);
      } else {
        t.neudach += 1;
        if (t.neudach >= K) {
          // RU: После K подряд следующих попыток не больше одной за паузу. Тревога единственная при первом K; до успеха далее только журнал, чтобы постоянный отказ не создавал поток тревог.
          // EN: After K consecutive failures, allow at most one further attempt per pause. Alert once on the first K; until success, only journal subsequent failures so a persistent outage does not flood alerts.
          t.pauzaDo = sejchas() + pauzaMs;
          const tekst = `секретарь ${dshHome}: ходовая дистилляция отказала ${t.neudach} раз подряд (последний исход `
            + `${itog?.ishod ?? '?'}${itog?.pochemu ? ' — ' + itog.pochemu : ''}; окно seq ${okno.ot}–${okno.do}). `
            + `Пауза до ${new Date(t.pauzaDo).toISOString()}, вода стоит на ${t.voda}.`;
          if (t.neudach === K) {
            krik('🔴 ходовой зов: ТРЕВОГА — ' + tekst);
            try { trevoga(tekst); } catch (e) { krik('ходовой зов: тревога не отправлена — ' + (e?.message ?? e)); }
          } else {
            krik('🔴 ходовой зов: снова отказ после паузы (тревога уже ушла на ' + K + '-м) — ' + tekst);
          }
        } else {
          krik(`ходовой зов: неудача ${t.neudach} из ${K} (исход ${itog?.ishod ?? '?'}) — вода стоит на ${t.voda}, повтор на следующем ходе`);
        }
        obnovit(sid, t);
      }
      return itog;
    }).finally(() => { idet = false; });
  }
  return { vkl: true, putVody, naSobytie };
}
