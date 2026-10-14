// RU: Ручной повтор одного среза: /distill-srez <session> <seq> сначала показывает цену; da запускает только после цены этого среза в текущем процессе. Использует общий zapustitZahod с маской, меткой и сверкой. Уже разобранный источник не повторяется; прерванное задание уточняет полноту по сохранённому числу тем. Без маски запуск запрещён. Читает session.v4.jsonl.zstd из DSH_HOME; неизвестный формат даёт отказ. Цена оценивается по ZNAKOV_NA_TOKEN, не счётом провайдера; масштаб берётся из сохранившихся строк собственного service journal, полные заходы имеют >=POLNYJ_OT_VYZOVOV вызовов. Недоступный журнал масштаба объявляется, но не запрещает запуск. Сам командный вход не обнаруживает задания и не запускается автоматически.
// EN: Manual retry of one slice: /distill-srez <session> <seq> first shows cost; da starts only after that slice cost was shown in this process. Use shared zapustitZahod with masking, markers, and coverage checks. Do not repeat a processed source; an interrupted task refines completeness using its saved topic count. No mask means no start. Read session.v4.jsonl.zstd from DSH_HOME; unknown formats fail. Estimate cost through ZNAKOV_NA_TOKEN, not provider billing; derive scale from retained rows in this service journal, with >=POLNYJ_OT_VYZOVOV calls defining a complete run. Report an unavailable scale journal without prohibiting launch. The command itself neither discovers tasks nor runs automatically.
import { readdirSync, statSync, readFileSync, writeFileSync, renameSync, unlinkSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { join } from 'node:path';
import { zatenennye, hvostSessii } from './distill-shov.js';
import { sobrat_transkript, raspakovat } from './chtenie-zhurnala.js';
import { zhivayaMetka } from './hodovoj-zov.js';

// RU: ZNAKOV_NA_TOKEN переводит объём транскрипта в оценку токенов; это приближение цены, не фактический расход.
// EN: ZNAKOV_NA_TOKEN converts transcript size to estimated tokens; this approximates cost rather than measuring billed usage.
export const ZNAKOV_NA_TOKEN = 3;
export const POLNYJ_OT_VYZOVOV = 2;
const RE_RASHOD = /^\[dsh-pamyat-secretary \S+ (\S+)\] расход захода: вызовов (\d+), вход (\d+), выход (\d+), кеш чтение (\d+),/;

/**
 * RU: Разобрать только строки «расход захода» в {polnye,nepolnye}; прочие строки не считаются дистилляциями.
 * EN: Parse only “расход захода” rows into {polnye,nepolnye}; other rows do not count as distillation runs.
 */
export function svodkaZahodov(stroki) {
  const polnye = [], nepolnye = [];
  for (const s of stroki) {
    const m = RE_RASHOD.exec(s);
    if (!m) continue;
    const z = { kogda: m[1], vyzovov: +m[2], vhod: +m[3], vyhod: +m[4], kesh: +m[5] };
    (z.vyzovov >= POLNYJ_OT_VYZOVOV ? polnye : nepolnye).push(z);
  }
  return { polnye, nepolnye };
}

/**
 * RU: Назвать масштаб прошлых полных заходов либо причину, почему его не удалось прочитать.
 * EN: Report the scale of previous complete runs or why it could not be read.
 */
export function tekstZahodov(r) {
  if (r.otkaz) return `прошлые полные заходы этого агента: НЕ прочитаны — ${r.otkaz}; масштаб по факту не назван`;
  const { polnye, nepolnye } = svodkaZahodov(r.stroki);
  if (!polnye.length) return `прошлые полные заходы этого агента: в ${r.istochnik} их 0 (неполных ${nepolnye.length}) — масштаб по факту не назван`;
  const d = (k) => `${Math.min(...polnye.map((z) => z[k]))}–${Math.max(...polnye.map((z) => z[k]))}`;
  return `прошлые полные заходы этого агента (${r.istochnik}, ${polnye.length} шт., ${polnye[0].kogda.slice(0, 10)}…${polnye.at(-1).kogda.slice(0, 10)}): `
    + `вызовов ${d('vyzovov')}, вход ${d('vhod')}, выход ${d('vyhod')}, кеш чтение ${d('kesh')}; `
    + `неполных (вызовов < ${POLNYJ_OT_VYZOVOV} — сорвавшийся выбор тем) ${nepolnye.length}`;
}

/**
 * RU: Читать расход только собственной службы: {stroki,istochnik} либо {otkaz}, без чужих юнитов.
 * EN: Read usage only from this service: {stroki,istochnik} or {otkaz}, without other units.
 */
export function chitatProshlyeZahody({ cgroup = '/proc/self/cgroup', komanda = 'journalctl' } = {}) {
  let unit;
  try { unit = /\/([^/\n]+\.service)$/m.exec(readFileSync(cgroup, 'utf8'))?.[1]; }
  catch (e) { return Promise.resolve({ otkaz: `${cgroup} не прочитан (${e?.code ?? e?.message})` }); }
  if (!unit) return Promise.resolve({ otkaz: 'процесс не в юните .service — журнал службы не определить' });
  return new Promise((res) => execFile(komanda, ['-u', unit, '-o', 'cat', '--no-pager', '-g', 'расход захода: вызовов'],
    { timeout: 15000, maxBuffer: 16 << 20, encoding: 'utf8' }, (e, out, err) => {
      // RU: Код 1 с пустым stdout означает отсутствие совпадений; любой stderr означает отказ чтения, не нулевой расход.
      // EN: Exit 1 with empty stdout means no matches; any stderr means a read failure, not zero usage.
      if (String(err ?? '').trim()) return res({ otkaz: `${komanda} -u ${unit}: ${String(err).trim().slice(0, 200)}` });
      if (e && !(e.code === 1 && !out)) return res({ otkaz: `${komanda} -u ${unit}: ${e.code ?? ''} ${e.message ?? e}`.slice(0, 240) });
      res({ stroki: String(out ?? '').split('\n'), istochnik: `журнал ${unit}` });
    }));
}

/**
 * RU: Прочитать {sobytiya} либо {otkaz}. Незавершённая последняя строка отбрасывается как текущая запись, не завершённое событие.
 * EN: Read {sobytiya} or {otkaz}. Discard an incomplete final line as an in-progress write rather than a completed event.
 */
export function chitatZhurnalSessii(dshHome, sessiya) {
  if (!dshHome) return { otkaz: 'DSH_HOME не задан — журнал сессии искать негде' };
  const koren = join(dshHome, 'sessions');
  let kat;
  try { kat = readdirSync(koren); } catch (e) { return { otkaz: `каталог сессий ${koren} не прочитан (${e?.code ?? e?.message})` }; }
  const puti = [];
  for (const d of kat) { const p = join(koren, d, sessiya, 'session.v4.jsonl.zstd'); try { if (statSync(p).isFile()) puti.push(p); } catch { /**
   * RU: В этом каталоге сессия не найдена; продолжить поиск допустимого места.
   * EN: The session is absent in this directory; continue searching supported locations.
   */ } }
  if (puti.length !== 1) return { otkaz: `журналов сессии ${sessiya} (формат v4) найдено ${puti.length}, нужен ровно один` };
  // RU: Журнал дописывается кадрами zstd. Использовать распаковщик пакета: чтение всего файла одним zstdDecompressSync могло вернуть один кадр без ошибки.
  // EN: The journal appends zstd frames. Use the package decompressor: one zstdDecompressSync call on the whole file could return one frame without error.
  const r = raspakovat(puti[0]);
  if (r.pochemu) return { otkaz: r.pochemu };
  if (r.ne_raspakovalos) return { otkaz: `журнал ${puti[0]} распакован не целиком: битых кадров ${r.ne_raspakovalos} из ${r.kadrov} — неполный срез не разбираю` };
  const stroki = r.tekst.split('\n').filter(Boolean);
  let shapka;
  try { shapka = JSON.parse(stroki[0]); } catch { return { otkaz: `заголовок журнала ${puti[0]} не разобран` }; }
  if (shapka?.version !== 4) return { otkaz: `журнал ${puti[0]}: формат ${shapka?.version ?? '?'}, ожидался 4` };
  const sobytiya = [];
  for (let i = 1; i < stroki.length; i++) {
    try { sobytiya.push(JSON.parse(stroki[i])); }
    catch { if (i === stroki.length - 1) break; return { otkaz: `журнал ${puti[0]}: строка ${i + 1} не разобрана` }; }
  }
  return { sobytiya, put: puti[0] };
}

// RU: Закрыть только JSON-задания этого srez: сначала zadanie-zakryto-* с zakryto {kogda,prichina} через temporary+rename, затем удалить прежнее. Неразобранные задания не трогать. Отказ или исключение оставляет задание; «уже разобран» допускает закрытие, а запущенный заход требует годного исхода.
// EN: Close only JSON tasks for this srez: first write zadanie-zakryto-* with zakryto {kogda,prichina} through temporary+rename, then remove the original. Leave unparsed tasks untouched. Failures or exceptions retain the task; “already processed” permits closure, while a launched run requires a valid outcome.
export function zakrytZadaniya(kat, srez, prichina, krik = () => {}) {
  if (!kat || !srez) return 0;
  let imena;
  try { imena = readdirSync(kat); } catch (e) { krik(`⚠️ задания среза ${srez} не закрыты: ${kat} не читается (${e?.code ?? e?.message})`); return 0; }
  let zakryto = 0;
  for (const f of imena.filter((x) => x.startsWith('zadanie-prervan-') && x.endsWith('.txt')).sort()) {
    const put = join(kat, f);
    let m;
    try { m = JSON.parse(readFileSync(put, 'utf8')); } catch { continue; }
    if (m?.srez !== srez) continue;
    const novoe = join(kat, f.replace('zadanie-prervan-', 'zadanie-zakryto-'));
    try {
      writeFileSync(novoe + '.novyj', JSON.stringify({ ...m, zakryto: { kogda: new Date().toISOString(), prichina } }, null, 1), { mode: 0o600 });
      renameSync(novoe + '.novyj', novoe);
      unlinkSync(put);
      zakryto++;
      krik(`задание на повтор ЗАКРЫТО: ${novoe} — ${prichina}`);
    } catch (e) { krik(`⚠️ задание ${put} НЕ закрыто (${e?.message ?? e}) — останется висеть`); }
  }
  return zakryto;
}

// RU: Прерванное задание означает незавершённый заход даже при записях okno1. tem — сумма temy_po_oknam либо null, если выбор тем не сохранился. Нет задания — null; среди нескольких взять первое по имени, исключая чужие срезы и битый JSON.
// EN: An interrupted task means an incomplete run even if okno1 records exist. tem is the sum of temy_po_oknam or null if topic selection was not saved. No task yields null; select the first by name among several, excluding other slices and invalid JSON.
export function zadanieSreza(kat, srez) {
  if (!kat || !srez) return null;
  let imena; try { imena = readdirSync(kat); } catch { return null; }
  for (const f of imena.filter((x) => x.startsWith('zadanie-prervan-') && x.endsWith('.txt')).sort()) {
    let m; try { m = JSON.parse(readFileSync(join(kat, f), 'utf8')); } catch { continue; }
    if (m?.srez !== srez) continue;
    const t = m?.temy_po_oknam;
    const tem = t && typeof t === 'object' && Object.values(t).every((v) => Number.isInteger(v) && v >= 0) && Object.keys(t).length
      ? Object.values(t).reduce((a, b) => a + b, 0) : null;
    return { imya: join(kat, f), tem };
  }
  return null;
}

export function sozdatDistillSrez({ config, krik, pm, zapustit, chitat = (s) => chitatZhurnalSessii(process.env.DSH_HOME, s),
                                    vyklyuchena = () => null, metkaZhiva = () => zhivayaMetka(config.putOtklonennyh),
                                    proshlye = () => chitatProshlyeZahody(),
                                    zakryt = (srez, prichina) => zakrytZadaniya(config.putOtklonennyh, srez, prichina, krik),
                                    prervannoe = (srez) => zadanieSreza(config.putOtklonennyh, srez),
                                    zapisanoSreza = null }) {
  const nazvana = new Set();   // RU: Срезы с объявленной ценой хранятся в процессе: только они допускают подтверждённый запуск.
  // EN: Retain slices with a displayed cost in this process; only those permit a confirmed launch.
  return async (invocation) => {
    const otkaz = (text) => { krik('команда /distill-srez: ОТКАЗ — ' + text); return { kind: 'error', text }; };
    const [sessiya, seqS, da, ...lishnee] = String(invocation?.rawInput ?? '').trim().split(/\s+/).filter(Boolean);
    if (!sessiya || !seqS || lishnee.length || (da !== undefined && da !== 'da')) {
      return otkaz('Формат: /distill-srez <сессия> <seq события compaction/summary> [da] — без «da» только цена. Иное слово — отказ, ничего не сделано.');
    }
    if (!/^[A-Za-z0-9._-]+$/.test(sessiya)) return otkaz(`имя сессии негодно: ${sessiya}`);
    const seq = Number(seqS);
    if (!Number.isInteger(seq) || seq < 0) return otkaz(`seq негоден: ${seqS}`);
    const vykl = vyklyuchena();
    if (vykl) return otkaz('дистилляция ' + vykl);
    const yadro = pm();
    if (typeof yadro?.zamaskirovatVhod !== 'function') return otkaz('маски ядра нет (ctx.pamyat.zamaskirovatVhod) — сырой вход модели не подаётся');
    if (typeof yadro?.poIstochniku !== 'function') return otkaz('ядро без poIstochniku — «уже разобран» проверить нечем, второй набор знаний не исключён');
    const zh = chitat(sessiya);
    if (zh.otkaz) return otkaz(zh.otkaz);
    const sob = zh.sobytiya.find((e) => e?.type === 'compaction/summary' && e.seq === seq);
    if (!sob) return otkaz(`в журнале сессии ${sessiya} нет compaction/summary с seq ${seq}`);
    const { seqs } = zatenennye(sob.data);
    if (!seqs.length) return otkaz('у сжатия нет затенённых записей — разбирать нечего');
    const srez = `${sessiya}#${Math.min(...seqs)}-${Math.max(...seqs)}`;
    const istochnik = `${srez}#okno1`;
    const uzhe = (yadro.poIstochniku(istochnik) || []).length;
    if (uzhe) {
      // RU: Прерванный срез считается разобранным только при числе записей не меньше числа тем. Иначе сохранить задание и назвать числа в отказе.
      // EN: Treat an interrupted slice as processed only when record count is at least topic count. Otherwise retain the task and report the counts in the refusal.
      const pr = prervannoe(srez);
      if (pr) {
        let n = null; try { n = typeof zapisanoSreza === 'function' ? zapisanoSreza(srez) : null; } catch { n = null; }
        if (pr.tem === null || n === null || n < pr.tem) {
          const chem = pr.tem === null ? 'число тем захода не сохранено — частично или полностью, НЕ ИЗВЕСТНО'
            : n === null ? `тем ${pr.tem}, записано — НЕ ИЗВЕСТНО (ядро не спрошено)` : `частично: записано ${n} из ${pr.tem} тем`;
          return otkaz(`срез ${srez} разобран НЕ до конца (заход прерван, задание ${pr.imya}): ${chem}. Задание НЕ закрыто; `
            + 'добор остатка этой командой не делается (нет курсора тем) — второй набор знаний не пишу. Разобран полностью — закрыть задание рукой');
        }
      }
      zakryt(srez, `уже разобран: в памяти ${uzhe} записей источника ${istochnik} (отказ /distill-srez; добор остатка не делается)`);
      return otkaz(`срез уже разобран: в памяти ${uzhe} записей источника ${istochnik} — второй набор знаний не пишу`);
    }
    if (metkaZhiva()) return otkaz('идёт другой разбор (живая метка razbor-idet) — один разбор на агента');
    const rass = config.rassuzhdeniya !== false;
    const golova = sobrat_transkript(zh.sobytiya.filter((e) => seqs.includes(e.seq)), { rassuzhdeniya: rass }).length;
    const hv = config.hvost === 'net' ? 0 : (hvostSessii(zh.sobytiya, seqs, sob.data, { rassuzhdeniya: rass }).tekst ?? '').length;
    const tok = Math.ceil((golova + hv) / ZNAKOV_NA_TOKEN);
    const statej = Number(config.predelTem) > 0 ? `до ${config.predelTem} (predelTem)` : 'по одной на каждую найденную тему (предела нет)';
    const cena = `срез ${sessiya} seq ${seq}: затенено ${seqs.length}, голова ${golova} зн. + хвост ${hv} зн. ≈ ${tok} ток. входа НА КАЖДЫЙ вызов; `
      + `вызовов: 1 выбор тем (выход до ${config.maxTokenovTem || 'потолка'}; при «не дочитала» ещё 1 — до ×2) + статьи ${statej}; `
      + `итого вход ≈ ${tok} × (1 + число статей), у статей в основном попадания кэша провайдера (оценка по знакам, не счёт провайдера); `
      + tekstZahodov(await Promise.resolve().then(proshlye).catch((e) => ({ otkaz: String(e?.message ?? e) })));
    const kluch = `${sessiya}#${seq}`;
    if (da !== 'da') {
      nazvana.add(kluch);
      krik('команда /distill-srez: ЦЕНА (без запуска) — ' + cena);
      return { kind: 'success', text: `ЦЕНА до запуска — ${cena}. Запуск: /distill-srez ${sessiya} ${seq} da` };
    }
    if (!nazvana.has(kluch)) return otkaz(`цена не названа: сначала /distill-srez ${sessiya} ${seq} (без «da») — запуск только после неё`);
    nazvana.delete(kluch);
    krik('команда /distill-srez: ЗАПУСК по слову руки — ' + cena);
    const sessiyaObj = Object.freeze({ id: sessiya, snapshotEvents: () => zh.sobytiya });
    Promise.resolve().then(() => zapustit(sessiyaObj, sob.data))
      .then((itog) => {
        // RU: zapustitZahod возвращает отказ значением. Закрытие разрешено только для ishod=ok с числовым zapisano; прочие ответы оставляют задание.
        // EN: zapustitZahod returns failures as values. Permit closure only for ishod=ok with numeric zapisano; other results retain the task.
        if (itog?.ishod === 'ok' && typeof itog?.zapisano === 'number') {
          zakryt(srez, `повтор /distill-srez выполнен: исход ok, записано ${itog.zapisano}`);
        } else {
          krik(`команда /distill-srez: задание на повтор НЕ закрыто: исход ${itog?.ishod ?? '?'}${itog?.pochemu ? ' (' + String(itog.pochemu).slice(0, 120) + ')' : ''}`);
        }
      })
      .catch((e) => krik('команда /distill-srez: заход упал — ' + (e?.message ?? e) + ' (задание на повтор НЕ закрыто)'));
    return { kind: 'success', text: `Разбор среза ${sessiya} seq ${seq} НАЧАТ (${cena}). Итог — строкой секретаря «дистилляция: ЗАКОНЧЕНА» в журнале службы.` };
  };
}
