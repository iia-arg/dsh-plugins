/**
 * dsh-pamyat-byudzhet — ВХОДЯЩИЙ бюджет памяти.
 *
 * Отвечает на один вопрос: сколько знания поднять обратно в разговор, чтобы
 * память не вытеснила сам разговор. Расход контекста — НЕ его дело (это сосед,
 * нудж); задваивать не надо.
 *
 * 🔴 ОТКАЗЫВАЕТ, А НЕ СОВЕТУЕТ. Если поднялось не всё — говорит об этом громко
 * и называет, чего вызывающий лишился. Молчаливое «подняли не всё» снаружи
 * неотличимо от «памяти нет», а это разные беды с разным лечением.
 *
 * 🔴 ЗНАЕМОЕ ПРО ВЫВОД. Кричит ТОЛЬКО через `console.error`, развилки нет.
 * Причина (замер 03.09 на cordis 4.0.1): `ctx.logger` создаётся каждому
 * Context, вызов `.error()` проходит без ошибки, но единственный встроенный
 * приёмник кладёт сообщение в кольцевой буфер на 1000 записей внутри процесса
 * и наружу не отдаёт. Проверка наличия канала тут бесполезна: функция есть,
 * звука нет. Способ перепроверить — стенд `stend-krik-zvuchit`: поднять пакет
 * отдельным процессом под настоящим Context и ждать строку в его `stderr`.
 */
import z from '@deepseek-ai/schemastery';
import { otobrat, PORYADKI } from './otbor.js';
import { ocenit, sverit, SIMVOLOV_NA_EDINICU } from './mera.js';

export const name = 'dsh-pamyat-byudzhet';

// Схема — schemastery, как у соседних пакетов. Не zod: платформа проверяет
// настройку своей схемой, и чужая здесь была бы несовместима молча.
export const Config = z.object({
  /** Предел подъёма в единицах НАШЕЙ меры (см. src/mera.js). */
  predel: z.number().default(2000),
  /** Порядок важности: 'svezhest' (умолчание) или 'vera'. */
  poryadok: z.string().default('svezhest'),
  /** Ниже этого вера считается низкой — только для ОБЪЯСНЕНИЯ отброса. */
  porogVery: z.number().default(0.5),
});

function krik(soobshchenie) {
  console.error('[dsh-pamyat-byudzhet] ' + soobshchenie);
}

export function apply(ctx, config = {}) {
  const predel = config.predel ?? 2000;
  const poryadok = config.poryadok ?? 'svezhest';
  const porogVery = config.porogVery ?? 0.5;

  if (predel === 0) {
    krik('предел равен нулю: знание НЕ БУДЕТ подниматься вообще. ' +
         'Это настройка, а не поломка — но снаружи выглядит как пустая память.');
  }

  ctx.provide('byudzhetPamyati', {
    /** Единицы, в которых считает пакет. Спрашивают — отвечаем честно. */
    edinicy() {
      return {
        imya: 'оценка наша',
        simvolovNaEdinicu: SIMVOLOV_NA_EDINICU,
        pochemuNeTokeny: 'оценщик платформы наружу не отдаётся (проверено 03.09 поиском ' +
                         'по dsh-compaction 0.1.1-rc.2: в lib/ счётчика нет, в exports тоже); ' +
                         'её число приходит готовым только для того, что компактит она сама',
      };
    },

    ocenit,
    sverit,

    /**
     * Отобрать под предел. Возвращает поднятое, отброшенное и сводку.
     * Если отброшено хоть что-то — кричит с НАЗВАННЫМИ причинами.
     */
    otobrat(vopros = {}) {
      const itog = otobrat({
        zapisi: vopros.zapisi ?? [],
        predel: vopros.predel ?? predel,
        poryadok: vopros.poryadok ?? poryadok,
        porogVery: vopros.porogVery ?? porogVery,
      });
      const s = itog.svodka;
      if (s.otbrosheno > 0) {
        krik('поднято НЕ ВСЁ: просили ' + s.prosili + ', подняли ' + s.podnyato +
             ', отброшено ' + s.otbrosheno + ' (' + s.prichiny.join('; ') + '). ' +
             'Цена подъёма ' + s.cena + ' из ' + s.predel + ' — единицы «' + s.edinicy +
             '», НЕ токены платформы.');
      }
      return itog;
    },
  });
}
