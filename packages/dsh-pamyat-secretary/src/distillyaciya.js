/**
 * RU: Отдельная короткоживущая модель дистиллирует затенённый текст без контекста агента: сначала темы, затем статья на каждую. Блок text выбирается по типу, не позиции рядом с thinking/reasoning. stop_reason=max_tokens означает недочитанный ответ, а не отсутствие знаний; причины отказа сохраняются отдельно от пустоты.
 * EN: A separate short-lived model distills shadowed text without the agent context: select topics, then write an article for each. Select text blocks by type, not their position next to thinking/reasoning. stop_reason=max_tokens means a truncated answer, not an absence of knowledge; failure reasons stay distinct from emptiness.
 */
import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { homedir } from 'node:os';
import { join } from 'node:path';

/**
 * RU: Причина отказа не должна терять непустой message из-за пустого code/message и ??, который не подменяет пустую строку. Для сетевого AggregateError называются вложенные причины. Функция локальная, а согласованность копий проверяет стенд.
 * EN: A failure reason must not lose a nonempty message because code/message is empty and ?? does not replace an empty string. Include nested causes for network AggregateError. Keep the function local; tests check agreement between copies.
 */
function prichina_stroka(e) {
  const tekst = String(e?.message ?? '').trim();
  const kod   = e?.code ? String(e.code) : '';
  const imya  = e?.name ?? e?.constructor?.name ?? typeof e;
  const hvost = [tekst, kod && '[' + kod + ']'].filter(Boolean).join(' ');
  const vnutri = Array.isArray(e?.errors) && e.errors.length
    ? ' ← ' + e.errors.slice(0, 3).map((v) => String(v?.message ?? v).trim()).filter(Boolean).join('; ')
    : '';
  return (imya + ': ' + (hvost || '(без пояснения)') + vnutri).slice(0, 200);
}

export const ADRES = 'https://api.deepseek.com/anthropic/v1/messages';

/**
 * RU: Ключ читается при вызове, без значения в argv. Файл или pass передают секрет через чтение/stdout; аргумент pass содержит только имя записи.
 * EN: Read the key at call time without putting its value in argv. A file or pass supplies the secret through reading/stdout; the pass argument contains only the entry name.
 */
export function vzyat_klyuch({ fajlKlyucha = null, zapisPass = null,
                               peremennayaOkruzheniya = null } = {}) {
  // RU: Приоритет источников: файл → pass → окружение. Последнее могло достаться по наследству и быть чужим; при нескольких источниках загрузка объявляет выбранный.
  // EN: Source priority is file → pass → environment. The last may be inherited and unintended; loading announces the selection when several sources are configured.
  if (fajlKlyucha) {
    try {
      const k = readFileSync(fajlKlyucha, 'utf-8').trim();
      if (k) return { klyuch: k, otkuda: 'файл ' + fajlKlyucha };
      return { klyuch: null, pochemu: 'файл ключа пуст: ' + fajlKlyucha };
    } catch (e) {
      return { klyuch: null, pochemu: 'файл ключа не прочитан (' + prichina_stroka(e) + '): ' + fajlKlyucha };
    }
  }
  if (zapisPass) {
    try {
      const out = execFileSync('pass', ['show', zapisPass], { encoding: 'utf-8', timeout: 10000 });
      const k = out.split('\n')[0].trim();
      if (k) return { klyuch: k, otkuda: 'pass ' + zapisPass };
      return { klyuch: null, pochemu: 'запись pass пуста: ' + zapisPass };
    } catch (e) {
      return { klyuch: null, pochemu: 'pass не отдал ключ (' + prichina_stroka(e).slice(0, 80) + '): ' + zapisPass };
    }
  }
  // RU: Окружение позволяет использовать уже предоставленный ключ без секретной копии и разбора чужого settings.yaml. Переменная доступна процессу и потомкам; это иной канал, не усиление прав файла 0600, и значение не идёт в argv.
  // EN: The environment reuses an existing key without a secret copy or parsing another package settings.yaml. The variable is available to the process and children; this is a different channel, not stronger than file mode 0600, and its value never enters argv.
  if (peremennayaOkruzheniya) {
    const k = (process.env[peremennayaOkruzheniya] ?? '').trim();
    if (k) return { klyuch: k, otkuda: 'окружение ' + peremennayaOkruzheniya };
    return { klyuch: null,
             pochemu: 'переменная окружения пуста или не задана: ' + peremennayaOkruzheniya };
  }
  return { klyuch: null, pochemu: 'источник ключа не задан: нужен fajlKlyucha, zapisPass или peremennayaOkruzheniya' };
}

/**
 * RU: При загрузке готовность проверяет тот же vzyat_klyuch, что и рабочий вызов; наружу только {gotov,otkuda|pochemu}, без значения. До pass проверяются хранилище, запись и gpg-каталог, чтобы pass show не создал ~/.gnupg побочным действием. Пути берутся из PASSWORD_STORE_DIR/GNUPGHOME или HOME/.password-store и HOME/.gnupg. Обёртки и нестандартный --homedir не распознаются: отказ называет проверенный путь.
 * EN: At load time, test readiness with the same vzyat_klyuch used by real calls; expose only {gotov,otkuda|pochemu}, never the value. Before pass, check the store, entry, and gpg directory so pass show cannot create ~/.gnupg as a side effect. Paths use PASSWORD_STORE_DIR/GNUPGHOME or HOME/.password-store and HOME/.gnupg. Wrappers and nonstandard --homedir are not recognized; failure identifies the checked path.
 */
export function proverit_klyuch(klyuch = {}, okr = process.env) {
  if (klyuch.zapisPass && !klyuch.fajlKlyucha) {
    const dom = okr.HOME || homedir();
    const hranilishche = okr.PASSWORD_STORE_DIR || join(dom, '.password-store');
    const zapis = join(hranilishche, klyuch.zapisPass + '.gpg');
    const gnupg = okr.GNUPGHOME || join(dom, '.gnupg');
    if (!existsSync(hranilishche)) return { gotov: false, pochemu: 'хранилища pass нет: ' + hranilishche };
    if (!existsSync(zapis)) return { gotov: false, pochemu: 'записи нет в хранилище: ' + zapis };
    if (!existsSync(gnupg)) return { gotov: false, pochemu: 'нет каталога ключей gpg: ' + gnupg
                                                    + ' (pass не зову — он создал бы его)' };
  }
  const k = vzyat_klyuch(klyuch);
  return k.klyuch ? { gotov: true, otkuda: k.otkuda } : { gotov: false, pochemu: k.pochemu };
}

/**
 * RU: Один вызов возвращает разобранный исход с причиной: отсутствие темы, отсутствие ответа и обрыв бюджета не сливаются в пустую строку.
 * EN: One call returns a parsed outcome with a cause: no topic, no response, and budget truncation must not collapse into an empty string.
 */
// RU: Объём задаётся промптом, а max_tokens использует потолок провайдера 393216, измеренный для этой конфигурации. Это предел обрыва, не оплаченный расход: учитывается фактический usage. После смены модели или условий потолок требует повторной проверки, не наследования числа.
// EN: Request size through the prompt; max_tokens uses the provider ceiling of 393216 measured for this configuration. This is a truncation ceiling, not billed usage: account for actual usage. A model or terms change requires rechecking the ceiling rather than inheriting the number.
// 🔴 ПОЧЕМУ НЕЛЬЗЯ «ПОСТАВИТЬ ПОБОЛЬШЕ С ЗАПАСОМ», А НАДО В ПОТОЛОК. max_tokens — это
// ПРЕДЕЛ-ОБРЕЗКА, а не просьба: достигнув его, модель обрывает ответ НА ПОЛУСЛОВЕ, и обрубок
// приходит как готовая сводка. Разница с просьбой не косметическая: превышение просьбы
// законно и видно, а срабатывание предела теряет молча. Моя же прежняя правка (4000 → 32768)
// была неверна по замыслу — она меняла ЧИСЛО, оставляя механизм обрезки.
// EN: Why a generous arbitrary max_tokens value is unsafe: it is a truncation boundary, not a request.
// At the boundary the model cuts the answer mid-word; the fragment arrives as a finished summary.
// Exceeding a requested length is visible and allowed; truncation silently loses content. The earlier
// 4000 → 32768 change was conceptually wrong: it changed the number while retaining truncation.
// ⚠️ ГДЕ НЕ ПРИМЕНЯЕТСЯ: это потолок ОДНОЙ модели, снятый в один день. Сменится модель или
// тариф — число надо переснять живым запросом, а не унаследовать.
// EN: This ceiling was measured for one model under specific conditions; after a model or pricing
// change, measure it again with a live request instead of inheriting the number.
/**
 * RU: Обёртка повторяет только vremenno, по умолчанию до 3 попыток с паузами 2000 и 6000 мс, отделяя политику повторов от одного sprosit. Ключ и деньги дают okonchatelno, не повтор на каждой теме.
 * EN: The wrapper retries only vremenno, by default up to 3 attempts with 2000 and 6000 ms delays, separating retry policy from one sprosit call. Key and balance failures yield okonchatelno rather than retries for every topic.
 */
export async function sprositUporno(argumenty, { popytok = 3, pauzy = [2000, 6000], krik = null } = {}) {
  let poslednij = null;
  for (let i = 0; i < popytok; i++) {
    const r = await sprosit(argumenty);
    if (r.ishod === 'ok' || !r.vremenno) return i ? { ...r, popytok: i + 1 } : r;
    poslednij = r;
    if (i < popytok - 1) {
      const pauza = pauzy[Math.min(i, pauzy.length - 1)];
      if (krik) krik('временный отказ (' + String(r.pochemu).slice(0, 120) + '), попытка ' +
                     (i + 1) + ' из ' + popytok + ', жду ' + pauza + ' мс');
      await new Promise((g) => setTimeout(g, pauza));
    }
  }
  return { ...poslednij, popytok,
           pochemu: String(poslednij && poslednij.pochemu) +
                    ' — ПОВТОРЫ ИСЧЕРПАНЫ (' + popytok + '), знание по этому вызову ПОТЕРЯНО' };
}

export async function sprosit({ klyuch, model = 'deepseek-flash', maxTokens = 393216,
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
      // RU: Сеть, неверный ключ и недостаток денег имеют разные причины и лечение. Денежный отказ помечается okonchatelno, чтобы шов завершил весь заход вместо одинакового отказа на каждой статье.
      // EN: Network, invalid-key, and insufficient-balance failures have different causes and remedies. Mark a balance failure okonchatelno so the hook ends the entire run rather than repeating the same failure for every article.
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
      // RU: Временный HTTP-отказ, включая 529 перегрузки, допускает повтор с ожиданием; постоянный не лечится повтором.
      // EN: A transient HTTP failure, including overload 529, permits a delayed retry; permanent failures are not fixed by retries.
      const vremenno = r.status === 408 || r.status === 425 || r.status === 429 || r.status >= 500;
      return { ishod: 'ne-sprosili', vremenno,
               pochemu: 'HTTP ' + r.status + ': ' + t.slice(0, 200) +
                        (vremenno ? ' - отказ ВРЕМЕННЫЙ, повтор осмыслен' : ' - не опознан как временный, повтора не будет') };
    }
    otvet = await r.json();
  } catch (e) {
    // RU: catch охватывает сеть, таймаут и r.json(): негодное/оборванное тело даже при 200 также временный отказ. Отсутствие ответа не означает отсутствие извлекаемого знания.
    // EN: catch covers network failures, timeouts, and r.json(): an invalid/truncated body even with 200 is also a transient failure. No response does not mean no knowledge can be extracted.
    return { ishod: 'ne-sprosili', vremenno: true,
             pochemu: 'вызов не состоялся: ' + String(e?.message ?? e).slice(0, 200) +
                      ' - канал, а не предмет; повтор осмыслен' };
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
 * RU: Разобрать JSON-массив с допустимыми пояснениями и code fence вокруг него, чтобы одна лишняя строка не теряла весь раунд. Негодный массив всё равно не принимается как знание.
 * EN: Parse a JSON array with surrounding explanations or a code fence so one extra line does not discard the entire round. An invalid array still cannot become knowledge.
 */
export function razobrat_massiv(tekst) {
  const bez = String(tekst ?? '').replace(/^\s*```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '');
  try { const d = JSON.parse(bez); if (Array.isArray(d)) return { godno: true, spisok: d }; } catch { /**
   * RU: Если целое тело не JSON, перейти к следующему способу выделения массива.
   * EN: If the whole body is not JSON, try the next array-extraction method.
   */ }
  const n = bez.indexOf('['); const k = bez.lastIndexOf(']');
  if (n !== -1 && k > n) {
    try { const d = JSON.parse(bez.slice(n, k + 1)); if (Array.isArray(d)) return { godno: true, spisok: d }; } catch { /**
     * RU: Если этот кандидат не JSON, продолжить поиск допустимого массива.
     * EN: If this candidate is not JSON, keep looking for a valid array.
     */ }
  }
  return { godno: false, pochemu: 'массив тем не разобран; начало ответа: ' + bez.slice(0, 120) };
}
