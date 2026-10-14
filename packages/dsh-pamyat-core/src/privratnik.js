/**
 * RU: Привратник — необязательный отвечающий на approval/request. Он выключен по умолчанию; при включении
 *    разрешает любой дошедший до него запрос один раз через allowed-once. Он не проверяет инструмент и не
 *    имеет веток rejected или cancelled.
 * EN: The gatekeeper is an optional approval/request responder. It is disabled by default; when enabled, it
 *    grants every request that reaches it once through allowed-once. It does not inspect the tool and has no
 *    rejected or cancelled branches.
 *
 * RU: Без отвечающего служба подтверждения возвращает unavailable, и инструмент не выполняется. Привратник
 *    предоставляет ответ для работы без человека рядом; это сознательное разрешение всех запросов, а не
 *    защита от опасных инструментов. Вне дошедших до его обработчика запросов он ничего не решает.
 * EN: Without a responder, the approval service returns unavailable and the tool does not run. The
 *    gatekeeper provides a response for operation without a human present; it deliberately grants all
 *    requests rather than screening dangerous tools. It makes no decisions for requests that do not reach
 *    its handler.
 *
 * RU: Контракт @deepseek-ai/dsh-user-approval: allowed-once | rejected | cancelled | unavailable; разрешает
 *    только allowed-once. Исключение либо неизвестное значение служба нормализует в unavailable.
 *    Единственная константа RAZRESHENO уменьшает риск опечатки; стенд должен сверять её со словарём
 *    платформы.
 * EN: The @deepseek-ai/dsh-user-approval contract is allowed-once | rejected | cancelled | unavailable; only
 *    allowed-once grants approval. The service normalizes exceptions and unknown values to unavailable. A
 *    single RAZRESHENO constant reduces the risk of typos; the test harness must compare it against the
 *    platform vocabulary.
 */
export const RAZRESHENO = 'allowed-once';

/**
 * RU: Итог повторяется каждые 10 запросов и на первом запросе. Именованная частота позволяет сопоставить
 *    число строк журнала с количеством запросов; это частота итогов, а не предел числа разрешений.
 * EN: The summary repeats every 10 requests and on the first request. A named interval lets readers relate
 *    journal lines to request counts; it controls summary frequency, not the number of grants.
 */
const ITOG_KAZHDYE = 10;

/**
 * RU: Нулевой счётчик имеет четыре возможные причины: запросов не было; более ранний отвечающий завершил
 *    цепочку; обработчик зарегистрирован вне scopeTarget агента; политика сессии never возвращает rejected
 *    до approval/request. Счётчик сам не различает эти причины, поэтому ноль не доказывает отсутствие
 *    запросов.
 * EN: A zero counter has four possible causes: no requests occurred; an earlier responder ended the chain;
 *    the handler is registered outside the agent’s scopeTarget; or session policy never returns rejected
 *    before approval/request. The counter cannot distinguish these causes, so zero does not prove there were
 *    no requests.
 */
export const PRICHINY_PUSTOGO_SCHYOTCHIKA = [
  'спросов не было',
  'нас опередили в цепочке',
  'мы не в той области видимости',
  "политика сессии 'never' — водопад не зовётся",
];

/**
 * RU: Зарегистрировать отвечающего только при vklyuchyon===true. Первая строка журнала показывает
 *    прочитанное значение настройки; вторая подтверждает возврат функции снятия регистрации. Отсутствие
 *    исключения само по себе регистрацию не доказывает. Здесь функция снятия используется только как
 *    признак; остановку и итог при выгрузке организует вызывающий.
 * EN: Register a responder only when vklyuchyon===true. The first journal line shows the setting that was
 *    read; the second confirms that an unsubscribe function was returned. Absence of an exception alone does
 *    not prove registration. Here the unsubscribe function is only a registration signal; the caller
 *    coordinates shutdown and the disposal summary.
 *
 * @param ctx RU: Контекст плагина с on для approval/request.
 * EN: Plugin context with on for approval/request.
 *
 * @param vklyuchyon RU: Значение настройки; по умолчанию выключено.
 * EN: Setting value; disabled by default.
 *
 * @param gromko RU: Функция вывода диагностических строк пакета.
 * EN: Function that emits package diagnostics.
 *
 * @returns RU: Учёт { vklyuchyon, vstal, sprosov, razresheno, otkazano, spisok }.
 * EN: Counters and state { vklyuchyon, vstal, sprosov, razresheno, otkazano, spisok }.
 */
export function postavitPrivratnika(ctx, vklyuchyon, gromko) {
  const uchyot = {
    vklyuchyon: vklyuchyon === true,
    vstal: false,
    sprosov: 0,
    razresheno: 0,
    otkazano: 0,
    spisok: [],
  };

  if (!uchyot.vklyuchyon) {
    gromko('привратник: ключ otvechatNaSprosRazresheniya прочитан — ВЫКЛЮЧЕНО, '
      + 'в цепочку не встаём; спрос разрешения будет решён без нас');
    return uchyot;
  }
  gromko('привратник: ключ otvechatNaSprosRazresheniya прочитан — ВКЛЮЧЕНО');

  const obrabotchik = (req, next) => {
    /**
     * RU: Увеличить счётчик и запомнить инструмент до ответа. Если дальнейший вывод или ответ сорвётся, уже
     *    поступивший запрос останется в учёте; иначе отказ ответа выглядел бы как отсутствие запроса.
     * EN: Increment the counter and record the tool before responding. If later logging or response delivery
     *    fails, the received request remains counted; otherwise a response failure would look like no request
     *    occurred.
     */
    uchyot.sprosov += 1;
    const nomer = uchyot.sprosov;
    const imya = req?.toolName ?? '(имя инструмента не названо)';
    uchyot.spisok.push({ nomer, imya });

    /**
     * RU: Единственная ветка разрешает запрос. Счётчик razresheno отражает эту ветку, а не подтверждённое
     *    выполнение инструмента платформой.
     * EN: The only branch grants the request. The razresheno counter records this branch, not confirmed tool
     *    execution by the platform.
     */
    uchyot.razresheno += 1;
    gromko(`привратник: спрос ${nomer} на «${imya}» → ${RAZRESHENO}`);

    /**
     * RU: Печатать итог на первом и каждом 10-м запросе: вывод только при dispose пропал бы при SIGKILL, OOM или
     *    аварии процесса. Периодические строки сохраняют след работы до такого завершения; они не гарантируют
     *    сохранность последних запросов после предыдущего итога.
     * EN: Print a summary on the first and every 10th request: output only during dispose would be lost on
     *    SIGKILL, OOM or a process crash. Periodic lines preserve evidence of operation before such a
     *    termination; they do not guarantee that requests since the previous summary are retained.
     */
    if (nomer === 1 || nomer % ITOG_KAZHDYE === 0) {
      try { gromko(itogPrivratnika(uchyot)); } catch { /**
       * RU: Ошибка вывода периодического итога не должна сорвать разрешающий ответ. Этот catch защищает только
       *    печать итога; остальные вызовы gromko здесь не перехватываются.
       * EN: A periodic summary logging failure must not prevent the grant response. This catch protects summary
       *    logging only; the other gromko calls here are not caught.
       */ }
    }
    return RAZRESHENO;

    /**
     * RU: next сохранён в подписи как контракт цепочки, но недостижим после безусловного разрешения. Если
     *    появится ветка, которая не отвечает, она обязана вызвать next(), чтобы передать запрос следующим
     *    отвечающим.
     * EN: next remains in the signature to document the chain contract, but is unreachable after the
     *    unconditional grant. Any future branch that declines to answer must call next() to pass the request to
     *    later responders.
     */
        // eslint-disable-next-line no-unreachable -- RU: Подпись цепочки сохранена. EN: Preserve the chain signature.
    void next;
  };

  // 🔴 prepend RU: KOD-якорь конца тела обработчика для стенда; сохранять дословно, перевод размещать рядом.
  // EN: The suite uses the preceding source-text anchor as the end of the handler body; preserve it verbatim and keep translations adjacent.
  /**
   * RU: Запросить prepend:true, чтобы более ранний отвечающий не завершил цепочку до этого обработчика. Без
   *    prepend второй обработчик не вызывается, если первый ответил. Опция запрашивает порядок; фактическую
   *    позицию этот модуль не измеряет.
   * EN: Request prepend:true so an earlier responder does not finish the chain before this handler runs.
   *    Without prepend, a second handler is not called if the first answers. The option requests an order;
   *    this module does not measure the actual position.
   */
  let snyat = null;
  try {
    snyat = ctx.on?.('approval/request', obrabotchik, { prepend: true }) ?? null;
  } catch (e) {
    snyat = null;
    uchyot.oshibkaRegistracii = e?.message ?? String(e);
  }

  /**
   * RU: Платформа должна вернуть функцию снятия регистрации; только это считается признаком установки. Нет
   *    функции — vstal=false, даже если on не бросил исключение. Признак не доказывает, что цепочка уже
   *    вызывала обработчик.
   * EN: The platform must return an unsubscribe function; only that counts as a registration signal. Without a
   *    function, vstal=false even if on did not throw. This signal does not prove that the chain has invoked
   *    the handler.
   */
  uchyot.vstal = typeof snyat === 'function';
  if (uchyot.vstal) {
    /**
     * RU: Журнал сообщает о регистрации и запрошенном prepend, а не о доказанной первой позиции. Список
     *    слушателей недоступен плагину; пустой fiber._hooks не позволяет проверить порядок. Заявлять «первый» по
     *    переданной опции нельзя.
     * EN: The journal reports registration and the requested prepend option, not a verified first position. The
     *    plugin cannot access the listener list; an empty fiber._hooks cannot establish order. Passing the
     *    option is insufficient evidence for claiming to be first.
     */
    gromko('привратник: регистрация УДАЛАСЬ (проверено возвратом снималки), событие '
      + '«approval/request», просили prepend: true. ⚠️ ПОЗИЦИЯ В ЦЕПОЧКЕ ИЗНУТРИ НЕ '
      + 'ПРОВЕРЯЕТСЯ: список слушателей плагину недоступен. Если нас поставили не первыми, '
      + 'нас могли опередить — и тогда «спросов 0» будет означать не тишину, а обход.');
  } else {
    gromko('🔴 привратник: ключ ВКЛЮЧЁН, а регистрация НЕ УДАЛАСЬ'
      + (uchyot.oshibkaRegistracii ? `: ${uchyot.oshibkaRegistracii}` : ' (платформа не вернула снималку)')
      + ' — спрос разрешения будет решён без нас, инструменты могут отказывать');
  }

  return uchyot;
}

/**
 * RU: Сформировать итог для периодического вывода и выгрузки. otkazano>0 нарушает инвариант: у обработчика
 *    нет ветки отказа, поэтому строка явно помечает счётчик как неверный. Если sprosov=0, перечислить
 *    возможные причины обхода; итог не определяет конкретную причину.
 * EN: Build a summary for periodic output and disposal. otkazano>0 violates an invariant: the handler has no
 *    refusal branch, so the line explicitly flags the counter as invalid. If sprosov=0, list possible
 *    reasons why the handler was bypassed; the summary does not identify the specific cause.
 */
export function itogPrivratnika(uchyot) {
  if (!uchyot.vklyuchyon) return 'привратник: выключен ключом; спросов не считали';
  if (!uchyot.vstal) return '🔴 привратник: включён, но в цепочку не встал; спросов не считали';

  const hvost = uchyot.otkazano > 0
    ? ` · 🔴 ОТКАЗАНО ${uchyot.otkazano} — ветки отказа в коде НЕТ, значит считаем не то`
    : '';
  if (uchyot.sprosov === 0) {
    return 'привратник: спросов 0 — это НЕ значит «нас не спрашивали»; причины: '
      + PRICHINY_PUSTOGO_SCHYOTCHIKA.join(' · ') + hvost;
  }
  const imena = uchyot.spisok.map((z) => `${z.nomer}:${z.imya}`).join(', ');
  return `привратник: спросов ${uchyot.sprosov} · разрешено ${uchyot.razresheno} · ${imena}${hvost}`;
}
