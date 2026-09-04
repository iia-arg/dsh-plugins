/**
 * Дистилляция знаний из затенённого диапазона отдельной дешёвой моделью.
 *
 * ЗАЧЕМ ОТДЕЛЬНАЯ МОДЕЛЬ, А НЕ МОДЕЛЬ ХОЗЯИНА (решение владельца 03.09.2026):
 * короткоживущий вызов с нулевым контекстом и своим промптом. Он не зависит от
 * того, чем работает агент, одинаков на всех узлах и стоит дёшево. Замер, который
 * этот довод усиливает: штатная компакция идёт по ставке opus — в последнем
 * компакте cacheRead 19 622, cacheWrite 81 680 токенов.
 *
 * 🔴 ДВЕ СТУПЕНИ, А НЕ ОДНА. Сперва выбор тем, потом статья НА КАЖДУЮ. Слитая
 * выдача даёт «дайджест дня» вместо знаний: одна мысль — одна тема, решение,
 * урок и порядок действий по одному предмету это ТРИ темы.
 *
 * 🔴 МОДЕЛЬ ДУМАЮЩАЯ. Ответ приходит ДВУМЯ блоками: первым `thinking`, вторым
 * `text`. Взять content[0].text — получить undefined, и снаружи это выглядит как
 * «модель молчит». Берём блок по ТИПУ. И бюджет нужен с запасом: при max_tokens=100
 * рассуждение съело всё, блока text не было вовсе (замер 03.09).
 *
 * 🔴 ОТКАЗ НАЗЫВАЕТ ПРИЧИНУ. «Нечего извлекать» и «не смогла дочитать» — разные
 * новости. Признак второй лежит в самом ответе: stop_reason === 'max_tokens'.
 * Пока его не искали, отказ считался молчаливым; он не молчаливый, он неспрошенный.
 */
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

export const ADRES = 'https://api.deepseek.com/anthropic/v1/messages';

/**
 * Ключ читается В МОМЕНТ ВЫЗОВА и НИКОГДА не идёт аргументом команды: argv виден
 * в /proc любому на машине. Два источника, оба без argv: файл 0600 либо `pass`
 * (значение приходит в stdout дочернего процесса, а имя записи — не секрет).
 */
export function vzyat_klyuch({ fajlKlyucha = null, zapisPass = null,
                               peremennayaOkruzheniya = null } = {}) {
  // ПОРЯДОК ИСТОЧНИКОВ: файл → pass → окружение. Окружение ПОСЛЕДНЕЕ намеренно:
  // файл и запись pass заводят под эту задачу, а переменная может достаться
  // процессу по наследству и оказаться чужой. Выбор молча не делается — при
  // нескольких заданных источниках подъём говорит, какой взят (index.js).
  if (fajlKlyucha) {
    try {
      const k = readFileSync(fajlKlyucha, 'utf-8').trim();
      if (k) return { klyuch: k, otkuda: 'файл ' + fajlKlyucha };
      return { klyuch: null, pochemu: 'файл ключа пуст: ' + fajlKlyucha };
    } catch (e) {
      return { klyuch: null, pochemu: 'файл ключа не прочитан (' + (e?.code ?? e?.message) + '): ' + fajlKlyucha };
    }
  }
  if (zapisPass) {
    try {
      const out = execFileSync('pass', ['show', zapisPass], { encoding: 'utf-8', timeout: 10000 });
      const k = out.split('\n')[0].trim();
      if (k) return { klyuch: k, otkuda: 'pass ' + zapisPass };
      return { klyuch: null, pochemu: 'запись pass пуста: ' + zapisPass };
    } catch (e) {
      return { klyuch: null, pochemu: 'pass не отдал ключ (' + (e?.message ?? e).toString().slice(0, 80) + '): ' + zapisPass };
    }
  }
  // 🔴 ТРЕТИЙ ИСТОЧНИК — ОКРУЖЕНИЕ ПРОЦЕССА (04.09.2026). Заведён потому, что у узла
  // может не быть ни `pass`, ни файла-ключа, а ключ провайдера у него УЖЕ ЕСТЬ: замер
  // на соседнем узле показал `pass` не заведённым вовсе, а ключ — в настройках его
  // платформы. Заводить файл-копию значило бы создать второе место, где секрет живёт
  // и о котором надо помнить при отзыве.
  // ПОЧЕМУ ИМЕННО ОКРУЖЕНИЕ, А НЕ РАЗБОР НАСТРОЕК ПЛАТФОРМЫ: платформа сама умеет брать
  // ключ провайдера так же — поле `apiKeyEnv` у pi-ai. Мы следуем её соглашению, а не
  // изобретаем своё; разбор её `settings.yaml` привязал бы нас к ЧУЖОМУ формату, и смена
  // структуры сломала бы чтение молча.
  // ГДЕ НЕ ПРИМЕНЯЕТСЯ: переменная видна всему процессу и его потомкам — это не строже
  // файла 0600, а иначе. И в argv она по-прежнему не попадает.
  if (peremennayaOkruzheniya) {
    const k = (process.env[peremennayaOkruzheniya] ?? '').trim();
    if (k) return { klyuch: k, otkuda: 'окружение ' + peremennayaOkruzheniya };
    return { klyuch: null,
             pochemu: 'переменная окружения пуста или не задана: ' + peremennayaOkruzheniya };
  }
  return { klyuch: null, pochemu: 'источник ключа не задан: нужен fajlKlyucha, zapisPass или peremennayaOkruzheniya' };
}

/**
 * Один вызов модели. Возвращает разобранный исход С НАЗВАННОЙ ПРИЧИНОЙ, а не
 * пустую строку: пустая строка от «не ответила», «нечего сказать» и «не дочитала»
 * выглядит одинаково, а лечится по-разному.
 */
export async function sprosit({ klyuch, model = 'deepseek-v4-flash', maxTokens = 4000,
                                system = null, tekst, adres = ADRES, tajmautMs = 180000 }) {
  const telo = { model, max_tokens: maxTokens, messages: [{ role: 'user', content: tekst }] };
  if (system) telo.system = system;
  let otvet;
  try {
    const upravlenie = AbortSignal.timeout(tajmautMs);
    const r = await fetch(adres, {
      method: 'POST',
      headers: { 'x-api-key': klyuch, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify(telo),
      signal: upravlenie,
    });
    if (!r.ok) {
      const t = await r.text().catch(() => '');
      // 🔴 «НЕ СМОГЛА СПРОСИТЬ» СМЕШИВАЛО ТРИ РАЗНЫЕ БЕДЫ. Сеть упала, ключ не принят и
      // денег нет — лечатся по-разному: первая ждёт сама, вторая требует нового ключа,
      // третья — пополнения счёта. Одна природа на три беды посылает разбирающего не туда.
      //
      // 🔴 И ОТКАЗ ПО ДЕНЬГАМ НЕ ЛЕЧИТСЯ ПОВТОРОМ: он повторится на каждой из двенадцати
      // тем подряд. Поэтому у него свой признак `okonchatelno` — шов обязан оборвать заход
      // целиком, а не перебирать темы, получая одинаковый отказ двенадцать раз.
      if (r.status === 402) {
        return { ishod: 'net-deneg', okonchatelno: true,
                 pochemu: 'у провайдера отрицательный баланс (HTTP 402): ' + t.slice(0, 160) +
                          '. Это не сбой механизма — пополните счёт' };
      }
      if (r.status === 401 || r.status === 403) {
        return { ishod: 'klyuch-ne-prinyat', okonchatelno: true,
                 pochemu: 'провайдер не принял ключ (HTTP ' + r.status + '): ' + t.slice(0, 160) +
                          '. Повтор не поможет — нужен другой ключ' };
      }
      return { ishod: 'ne-sprosili', pochemu: 'HTTP ' + r.status + ': ' + t.slice(0, 200) };
    }
    otvet = await r.json();
  } catch (e) {
    // Сеть, таймаут, недоступный хост — «не смогла спросить», а не «нечего извлекать».
    return { ishod: 'ne-sprosili', pochemu: 'вызов не состоялся: ' + String(e?.message ?? e).slice(0, 200) };
  }

  const bloki = Array.isArray(otvet?.content) ? otvet.content : [];
  const tekstOtveta = bloki.filter((b) => b?.type === 'text').map((b) => b.text ?? '').join('').trim();
  const stop = otvet?.stop_reason ?? null;

  if (!tekstOtveta) {
    if (stop === 'max_tokens') {
      return {
        ishod: 'ne-dochitala',
        pochemu: 'бюджет max_tokens=' + maxTokens + ' кончился на рассуждении: stop_reason=max_tokens, ' +
                 'блока text в ответе НЕТ. Модель думающая — поднимите бюджет, это не «нечего извлекать»',
        usage: otvet?.usage ?? null,
      };
    }
    return {
      ishod: 'pusto',
      pochemu: 'блока text нет, stop_reason=' + String(stop) + ' — причину назвать нечем, ' +
               'кроме самого stop_reason; не выдаём это за «нечего извлекать»',
      usage: otvet?.usage ?? null,
    };
  }
  return { ishod: 'ok', tekst: tekstOtveta, stop_reason: stop, usage: otvet?.usage ?? null };
}

/**
 * Толерантный разбор JSON-массива из ответа модели.
 * Заведён потому, что модель иногда обрамляет выдачу пояснениями или code-fence,
 * а строгий разбор терял ВЕСЬ раунд из-за одной лишней строки.
 */
export function razobrat_massiv(tekst) {
  const bez = String(tekst ?? '').replace(/^\s*```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '');
  try { const d = JSON.parse(bez); if (Array.isArray(d)) return { godno: true, spisok: d }; } catch { /* ниже */ }
  const n = bez.indexOf('['); const k = bez.lastIndexOf(']');
  if (n !== -1 && k > n) {
    try { const d = JSON.parse(bez.slice(n, k + 1)); if (Array.isArray(d)) return { godno: true, spisok: d }; } catch { /* ниже */ }
  }
  return { godno: false, pochemu: 'массив тем не разобран; начало ответа: ' + bez.slice(0, 120) };
}
