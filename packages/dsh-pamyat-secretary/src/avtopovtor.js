// RU: При старте повторяет прерванную дистилляцию собственного каталога только при известном zapisano=0 через тот же zapustitZahod, что /distill-srez. avtopovtor {popytka,nachat,pid} сохраняется при запуске, не планировании: перезапуск в ожидании не расходует попытку. Одна попытка на срез; сохранённая попытка при следующем старте означает второй обрыв, вызывает тревогу и vtoroj_obryv для сторожа. zapisano>0 или неизвестное число не повторяется из-за риска дублей. Занятость допускает не более OTSROCHEK_MAKS отсрочек; затем задание остаётся с причиной пропуска. ok закрывает задание.
// EN: At startup, retry interrupted distillation in this instance directory only for known zapisano=0, through the same zapustitZahod used by /distill-srez. Save avtopovtor {popytka,nachat,pid} when starting, not scheduling: restarting while waiting spends no attempt. Allow one attempt per slice; a saved attempt at the next startup means a second interruption, raising an alert and vtoroj_obryv for the watcher. Do not retry zapisano>0 or an unknown count because of duplicate risk. Busy agents allow at most OTSROCHEK_MAKS deferrals, then retain the task with a skip reason. ok closes the task.
import { readdirSync, readFileSync, writeFileSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { zatenennye, kluchSreza } from './distill-shov.js';

export const ZADERZHKA_MS = 120000;
export const OTSROCHEK_MAKS = 3;

/**
 * RU: Прочитать zadanie-prervan-* как [{imya,m}]. Негодный JSON пропускается; его отдельно называет najtiPrervannye.
 * EN: Read zadanie-prervan-* as [{imya,m}]. Skip invalid JSON; najtiPrervannye reports it separately.
 */
export function zadaniyaKataloga(kat) {
  let imena; try { imena = readdirSync(kat); } catch { return []; }
  const out = [];
  for (const f of imena.filter((x) => x.startsWith('zadanie-prervan-') && x.endsWith('.txt')).sort()) {
    try { out.push({ imya: join(kat, f), m: JSON.parse(readFileSync(join(kat, f), 'utf8')) }); } catch { /**
     * RU: Неразобранное задание не считается пригодным для автоматического повтора.
     * EN: An unparsed task is not eligible for automatic retry.
     */ }
  }
  return out;
}

/**
 * RU: Дополнить JSON задания через временный файл и rename. Ошибка возвращает false, не бросает и не доказывает сохранение поля.
 * EN: Update task JSON through a temporary file and rename. An error returns false without throwing and does not prove the field was saved.
 */
export function dopisatZadanie(imya, pole, znachenie) {
  try {
    const m = JSON.parse(readFileSync(imya, 'utf8'));
    m[pole] = znachenie;
    writeFileSync(imya + '.novyj', JSON.stringify(m, null, 1), { mode: 0o600 });
    renameSync(imya + '.novyj', imya);
    return true;
  } catch { return false; }
}

/**
 * RU: Достать событие compaction/summary нужного среза из журнала: {sob} или {otkaz}.
 * EN: Extract the slice compaction/summary event from the journal: {sob} or {otkaz}.
 */
export function sobytieSreza(chitat, seansId, srez) {
  const zh = chitat(seansId);
  if (zh?.otkaz) return { otkaz: zh.otkaz };
  const sob = (zh?.sobytiya ?? []).find((e) => e?.type === 'compaction/summary' && kluchSreza(seansId, zatenennye(e.data).seqs) === srez);
  return sob ? { sob, sobytiya: zh.sobytiya } : { otkaz: `в журнале сессии ${seansId} нет compaction/summary среза ${srez}` };
}

export function zaplanirovatAvtopovtor({ kat, krik, zapisano, zapustit, chitat, zakryt, metkaZhiva = () => false,
                                        vyklyuchena = () => null, trevoga = () => {}, pid = process.pid,
                                        zaderzhkaMs = ZADERZHKA_MS, tajmer = setTimeout }) {
  if (!kat) { krik('автоповтор: каталог заданий (putOtklonennyh) не задан — прерванные разборы повторяться НЕ будут'); return []; }
  const vse = zadaniyaKataloga(kat);
  const zaplanirovano = [];
  const sreziSPovtorom = new Set(vse.filter((z) => z.m?.avtopovtor).map((z) => z.m.srez));
  for (const { imya, m } of vse) {
    const srez = m?.srez;
    if (!srez || !m?.seansId) { krik(`автоповтор: задание ${imya} без среза/сессии — ПРОПУЩЕН`); continue; }
    if (m.avtopovtor) continue;                                   // RU: Судьба уже начатого повтора определяется вторым заданием; этот объект не заводит ещё одну попытку.
    // EN: The second task records the fate of an already started retry; this object does not create another attempt.
    if (sreziSPovtorom.has(srez)) {
      krik(`🔴 ПОВТОР среза ${srez}: ПРЕРВАН ВТОРОЙ РАЗ (задание ${imya}) — автоповтора больше нет, задание остаётся сторожу (а)`);
      dopisatZadanie(imya, 'avtopovtor', { vtoroj_obryv: true, zamecheno: new Date().toISOString(), pid });
      trevoga(`автоповтор среза ${srez} оборван второй раз — повтор только рукой: ${imya}`);
      continue;
    }
    let n = null; try { n = zapisano(srez); } catch { n = null; }
    if (n !== 0) {
      krik(`автоповтор среза ${srez}: ПРОПУЩЕН — ${n === null ? 'записано ли — НЕ ИЗВЕСТНО' : `записано ${n}`}; повтор целиком дал бы `
         + `дубли (окно одно, темы выбираются заново) — задание остаётся сторожу (а): ${imya}`);
      continue;
    }
    krik(`автоповтор среза ${srez}: запланирован через ${Math.round(zaderzhkaMs / 1000)} с (задание ${imya})`);
    zaplanirovano.push(srez);
    const zapusk = (otsrochek) => tajmer(() => { povtorit({ imya, m, otsrochek }).catch((e) => krik(`ПОВТОР среза ${srez}: упал — ${e?.message ?? e} (задание НЕ закрыто)`)); }, zaderzhkaMs);
    const povtorit = async ({ imya, m, otsrochek }) => {
      const vykl = vyklyuchena();
      if (vykl) { krik(`автоповтор среза ${srez}: ПРОПУЩЕН — дистилляция ${vykl}`); return; }
      if (metkaZhiva()) {
        if (otsrochek + 1 >= OTSROCHEK_MAKS) { krik(`автоповтор среза ${srez}: ПРОПУЩЕН — агент занят другим разбором ${OTSROCHEK_MAKS} раз подряд; задание остаётся сторожу (а)`); return; }
        krik(`автоповтор среза ${srez}: отложен — идёт другой разбор (живая метка), отсрочка ${otsrochek + 1} из ${OTSROCHEK_MAKS}`);
        zapusk(otsrochek + 1); return;
      }
      let n2 = null; try { n2 = zapisano(srez); } catch { n2 = null; }
      if (n2 !== 0) { krik(`автоповтор среза ${srez}: ПРОПУЩЕН — к запуску записано ${n2 ?? 'НЕ ИЗВЕСТНО'} (срез разобран иначе)`); return; }
      const s = sobytieSreza(chitat, m.seansId, srez);
      if (s.otkaz) { krik(`автоповтор среза ${srez}: ОТКАЗ — ${s.otkaz}; задание остаётся`); return; }
      if (!dopisatZadanie(imya, 'avtopovtor', { popytka: 1, nachat: new Date().toISOString(), pid })) {
        krik(`автоповтор среза ${srez}: ОТКАЗ — счётчик попытки в задание НЕ записан (${imya}); без него второй обрыв не узнать — не запускаю`);
        return;
      }
      krik(`ПОВТОР среза ${srez}: ПОЗВАНА — заход по заданию ${imya}`);
      const sessiya = Object.freeze({ id: m.seansId, snapshotEvents: () => s.sobytiya });
      const itog = await zapustit(sessiya, s.sob.data);
      if (itog?.ishod === 'ok' && typeof itog?.zapisano === 'number') {
        zakryt(srez, `автоповтор выполнен: исход ok, записано ${itog.zapisano}`);
        krik(`ПОВТОР среза ${srez}: ЗАКОНЧЕНА — исход ok, записано ${itog.zapisano}; задание закрыто`);
      } else {
        krik(`ПОВТОР среза ${srez}: ЗАКОНЧЕНА — исход ${itog?.ishod ?? '?'}; задание НЕ закрыто, попытка израсходована — дальше сторож (а)`);
      }
    };
    zapusk(0);
  }
  return zaplanirovano;
}
