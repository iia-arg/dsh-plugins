/**
 * Связь с долговременным хранилищем по его точке MCP.
 *
 * ЧТО ЗДЕСЬ ЕСТЬ: один вызов инструмента и разбор ответа. Ни политики, ни
 * подтверждения доставки — они выше, в своих модулях. Этот слой отвечает на
 * единственный вопрос: «удалось ли поговорить и что нам сказали».
 *
 * 🔴 ЗАВЕРШАЮЩИЙ СЛЭШ В АДРЕСЕ ОБЯЗАТЕЛЕН. Проверено живым запросом 02.09: без
 * него служба отвечает перенаправлением (307) и ПУСТЫМ телом, а POST его не
 * переживает. Пустое тело легко принять за «хранилище молчит» — на деле мы
 * просто постучались не туда. Поэтому адрес без слэша — отказ с объяснением,
 * а не молчаливая попытка.
 *
 * 🔴 ОТВЕТ ИДЁТ ПОТОКОМ СОБЫТИЙ, а не голым JSON: строки вида `data: {…}`.
 * Разбор голым JSON.parse дал бы отказ на исправном ответе.
 */

/** Разобрать поток событий: ищем первую строку с полезной нагрузкой. */
export function razobratPotok(tekst) {
  if (typeof tekst !== 'string' || tekst.trim() === '') return null;
  for (const stroka of tekst.split('\n')) {
    const chistaya = stroka.startsWith('data:') ? stroka.slice(5).trim() : stroka.trim();
    if (!chistaya) continue;
    try {
      const d = JSON.parse(chistaya);
      if (d && (d.result !== undefined || d.error !== undefined)) return d;
    } catch { /* строка не JSON — часть протокола, пропускаем */ }
  }
  return null;
}

/**
 * Создать связь.
 * @param {string} adres     адрес точки; ЗАВЕРШАЮЩИЙ СЛЭШ ОБЯЗАТЕЛЕН
 * @param {number} tajmautMs предел ожидания
 * @param {function} [otpravka] подменяемый транспорт — нужен стендам, чтобы
 *        ветки отказа проверялись порчей, а не отключением живой службы
 */
export function sozdatSvyaz({ adres, tajmautMs = 10000, otpravka } = {}) {
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

  const poslat = otpravka ?? (async (telo) => {
    const otvet = await fetch(adres, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' },
      body: JSON.stringify(telo),
      signal: AbortSignal.timeout(tajmautMs),
    });
    return otvet.text();
  });

  return {
    /**
     * Позвать инструмент хранилища.
     * Возвращает { udalos, tekst, pochemu } — «удалось поговорить» отделено от
     * «что сказали»: связь могла оборваться, и тогда мы НЕ ЗНАЕМ результата,
     * а не «получили отрицательный».
     */
    async pozvat(imya, argumenty) {
      let syroj;
      try {
        syroj = await poslat({
          jsonrpc: '2.0', id: Date.now(), method: 'tools/call',
          params: { name: imya, arguments: argumenty },
        });
      } catch (prichina) {
        return {
          udalos: false, tekst: null,
          pochemu: 'связь с хранилищем не состоялась: ' + (prichina?.message ?? String(prichina)) +
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
