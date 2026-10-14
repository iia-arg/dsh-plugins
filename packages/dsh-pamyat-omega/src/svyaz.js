/**
 * RU: MCP-связь вызывает один инструмент и разбирает ответ, без политики и подтверждения доставки. Адрес требует завершающий слэш: поддерживаемая точка без него отвечает 307 с пустым телом. Ответ допускает SSE data: и строки JSON; разбор всего потока как одного JSON отверг бы исправный SSE.
 * EN: The MCP connection calls one tool and parses its response, without policy or delivery confirmation. The address requires a trailing slash: the supported endpoint returns 307 with an empty body otherwise. Responses may contain SSE data: or JSON lines; parsing the entire stream as one JSON object would reject valid SSE.
 */

/**
 * RU: Найти первую строку потока с JSON-RPC result или error; не считать прочие строки полезным ответом.
 * EN: Find the first stream line containing JSON-RPC result or error; other lines are not a useful response.
 */
/**
 * RU: Короткая причина использует имя, код и до трёх вложенных ошибок, не оставляя пустой AggregateError.message как объяснение. ?? не заменяет пустую строку. Форматирование местное, без зависимости между пакетами; его совпадение с ядром проверяет отдельный стенд.
 * EN: Build a short reason from the name, code, and up to three nested errors rather than treating an empty AggregateError.message as an explanation. ?? does not replace an empty string. Formatting stays local without an inter-package dependency; a separate test checks agreement with the core.
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

export function razobratPotok(tekst) {
  if (typeof tekst !== 'string' || tekst.trim() === '') return null;
  for (const stroka of tekst.split('\n')) {
    const chistaya = stroka.startsWith('data:') ? stroka.slice(5).trim() : stroka.trim();
    if (!chistaya) continue;
    try {
      const d = JSON.parse(chistaya);
      if (d && (d.result !== undefined || d.error !== undefined)) return d;
    } catch { /**
     * RU: Невалидная строка JSON может быть служебной строкой SSE; пропустить её и искать полезный ответ дальше.
     * EN: An invalid JSON line may be an SSE protocol line; skip it and continue looking for a useful response.
     */ }
  }
  return null;
}

/**
 * RU: Создать связь: adres со слэшем, tajmautMs — предел ожидания; otpravka подменяет транспорт для безопасных стендов. Необязательный klyuch добавляет Authorization: Bearer для OMEGA >= 1.5.19; undefined не добавляет заголовок, пустое заданное значение отвергается до запроса. Проверка наличия ключа не подтверждает, что служба его примет.
 * EN: Create a connection: adres includes a slash and tajmautMs bounds waiting; otpravka replaces transport for safe tests. Optional klyuch adds Authorization: Bearer for OMEGA >= 1.5.19; undefined omits the header, while an explicitly empty value is rejected before requesting. Key presence does not prove service acceptance.
 */
export function sozdatSvyaz({ adres, tajmautMs = 10000, otpravka, klyuch } = {}) {
  if (!adres || typeof adres !== 'string') {
    const e = new Error('dsh-pamyat-omega: не задан адрес хранилища');
    e.code = 'OMEGA_NET_ADRESA';
    throw e;
  }
  if (!adres.endsWith('/')) {
    const e = new Error(
      'dsh-pamyat-omega: адрес «' + adres + '» без завершающего слэша. ' +
      'Служба ответит перенаправлением с пустым телом, и это будет выглядеть как молчание хранилища. ' +
      'Добавьте слэш в конце.'
    );
    e.code = 'OMEGA_ADRES_BEZ_SLESHA';
    throw e;
  }

  if (klyuch !== undefined && (typeof klyuch !== 'string' || !klyuch.trim())) {
    const e = new Error('dsh-pamyat-omega: ключ службы задан, но пуст — переменная окружения не дошла до процесса. ' +
      'Служба ответит 401 на каждый вызов.');
    e.code = 'OMEGA_KLYUCH_PUST';
    throw e;
  }
  const zagolovki = { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' };
  if (klyuch !== undefined) zagolovki.Authorization = 'Bearer ' + klyuch.trim();

  const poslat = otpravka ?? (async (telo, tajmaut = tajmautMs) => {
    const otvet = await fetch(adres, {
      method: 'POST',
      headers: zagolovki,
      body: JSON.stringify(telo),
      signal: AbortSignal.timeout(tajmaut),
    });
    // RU: 401/403 — отказ доступа, не полезный ответ MCP. Отделить его до SSE-разбора, чтобы не сообщить ложную ошибку формата.
    // EN: 401/403 means access refusal, not a useful MCP response. Separate it before SSE parsing to avoid reporting a false format error.
    if (otvet.status === 401 || otvet.status === 403) {
      throw new Error('служба отказала в доступе (' + otvet.status + '): ключ ' +
        (klyuch === undefined ? 'не передан' : 'не принят'));
    }
    return otvet.text();
  });

  return {
    /**
     * RU: pozvat возвращает {udalos, tekst, pochemu}, различая состоявшийся разговор и неизвестный результат при обрыве. Успех транспорта ещё не подтверждает сохранение знания.
     * EN: pozvat returns {udalos, tekst, pochemu}, distinguishing a completed exchange from an unknown result after interruption. Transport success does not yet confirm knowledge persistence.
     */
    async pozvat(imya, argumenty, { tajmautMs: tajmautVyzova } = {}) {   // RU: A-N-1727: предел одного вызова (поиск по всем корням) · EN: per-call limit
      let syroj;
      try {
        syroj = await poslat({
          jsonrpc: '2.0', id: Date.now(), method: 'tools/call',
          params: { name: imya, arguments: argumenty },
        }, tajmautVyzova ?? tajmautMs);
      } catch (prichina) {
        return {
          udalos: false, tekst: null,
          pochemu: 'связь с хранилищем не состоялась: ' + prichina_stroka(prichina) +
                   '. Результат НЕИЗВЕСТЕН — это не отрицательный ответ.',
        };
      }
      const razobrano = razobratPotok(syroj);
      if (!razobrano) {
        return {
          udalos: false, tekst: null,
          pochemu: 'ответ хранилища не разобран (пустой или не поток событий). Результат НЕИЗВЕСТЕН.',
        };
      }
      if (razobrano.error) {
        return {
          udalos: false, tekst: null,
          pochemu: 'хранилище отказало: ' + JSON.stringify(razobrano.error).slice(0, 200),
        };
      }
      const bloki = razobrano.result?.content ?? [];
      const tekst = bloki.map((b) => b?.text ?? '').join('\n');
      return { udalos: true, tekst, pochemu: 'ответ получен' };
    },
  };
}
