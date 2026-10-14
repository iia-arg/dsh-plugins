/**
 * RU: Политика записи решает по классу знания, нужна ли человеку возможность подтвердить запись. Общие
 *    ограничения и навыки влияют на другие агенты и по умолчанию требуют спроса; рабочие заметки агента
 *    записываются автоматически. Решение по классам позволяет не сводить всё к одному переключателю.
 * EN: The write policy decides by knowledge class whether a human must approve a record. Shared constraints
 *    and skills affect other agents and require approval by default; an agent’s working notes are stored
 *    automatically. Decisions by class avoid a single all-or-nothing switch.
 *
 * RU: Сохраняется различие между человеческим отказом и отсутствием канала подтверждения. Платформенная
 *    serviceAsk различает rejected, cancelled и unavailable; установка без канала не должна выглядеть как
 *    человек, отказавший в записи.
 * EN: The distinction between human rejection and a missing approval channel is preserved. Platform
 *    serviceAsk distinguishes rejected, cancelled and unavailable; an installation without a channel must
 *    not look like a human who rejected the write.
 *
 * RU: Границы: модуль только выбирает и объясняет решение. Он не запрашивает подтверждение, не записывает
 *    знание и не проверяет доступность канала; эти действия выполняет вызывающий. Классы ogranichenie и
 *    navyk требуют подтверждения по умолчанию.
 * EN: Limits: the module only selects and explains a decision. It does not request approval, store knowledge
 *    or check channel availability; the caller performs those actions. The ogranichenie and navyk classes
 *    require approval by default.
 */
export const KLASSY_SPRASHIVAT = Object.freeze(['ogranichenie', 'navyk']);

/**
 * RU: Выбрать auto или ask для класса; пустой или нестроковый klass вызывает PAMYAT_NET_KLASSA. Решение
 *    определяется sprashivat: отдельного использования avtomaticheski в этой функции нет.
 * EN: Choose auto or ask for a class; an empty or non-string klass raises PAMYAT_NET_KLASSA. The decision is
 *    determined by sprashivat; this function does not separately use avtomaticheski.
 *
 * @param {string} klass RU: Класс знания.
 * EN: Knowledge class.
 *
 * @param {object} nastrojka RU: Настройки { sprashivat?: string[], avtomaticheski?: string[] }; читается
 *    sprashivat.
 * EN: Settings { sprashivat?: string[], avtomaticheski?: string[] }; only sprashivat is read.
 *
 * @returns {{reshenie:'auto'|'ask', pochemu:string}} RU: Решение с причиной.
 * EN: Decision and its reason.
 */
export function reshitPoKlassu(klass, nastrojka = {}) {
  if (!klass || typeof klass !== 'string') {
    const e = new Error('dsh-pamyat: класс знания не задан — решать нечего');
    e.code = 'PAMYAT_NET_KLASSA';
    throw e;
  }
  /**
   * RU: Пустой или не-массивный sprashivat означает умолчание, а не отключение спроса. Проверка только через
   *    ?? пропустила бы [] и сделала все классы автоматическими. Изменение списка требует явного непустого
   *    массива; принадлежность классов списку определяется точным includes.
   * EN: An empty or non-array sprashivat selects the defaults rather than disabling approval. Checking only
   *    with ?? would accept [] and make every class automatic. Changing the list requires an explicit nonempty
   *    array; exact includes matching determines which classes require approval.
   */
  const zadano = Array.isArray(nastrojka.sprashivat) ? nastrojka.sprashivat : null;
  const sprashivat = (zadano && zadano.length > 0) ? zadano : KLASSY_SPRASHIVAT;
  if (sprashivat.includes(klass)) {
    return { reshenie: 'ask', pochemu: 'класс «' + klass + '» действует за пределами этого агента' };
  }
  return { reshenie: 'auto', pochemu: 'класс «' + klass + '» — рабочая память самого агента' };
}

/**
 * RU: Исходы платформы: allowed-once — разрешение; rejected — отказ человека; cancelled — прерывание без
 *    решения; unavailable — отсутствующий канал. Литерал denied не входит в этот контракт и не годится как
 *    проба реального отказа.
 * EN: Platform outcomes: allowed-once grants approval; rejected is a human rejection; cancelled is an
 *    interrupted request without a decision; unavailable means no channel. The literal denied is outside
 *    this contract and cannot test a real platform rejection.
 *
 * RU: Имена not-supported, no-agent и ne-predyavleno добавляет вызывающий до обращения к службе:
 *    подтверждение не поддерживается, вызов вне агента или спрос вообще не сделан. Платформа не возвращает
 *    эти три значения как собственные исходы.
 * EN: The caller supplies not-supported, no-agent and ne-predyavleno before reaching the service: approval
 *    is unsupported, the call is outside an agent, or approval was never requested. The platform does not
 *    return these three values as its own outcomes.
 *
 * RU: Классификация отделяет решение человека от поломки канала и ошибки вызывающего. Если kanalEst=false,
 *    результат всегда запрет записи с природой net-kanala. Неизвестный исход вызывает
 *    PAMYAT_NEIZVESTNYJ_ISHOD; его нельзя приписывать человеку или разрешать запись по умолчанию.
 * EN: Classification separates a human decision from a broken channel and a caller error. If kanalEst=false,
 *    writing is always refused with nature net-kanala. An unknown outcome raises PAMYAT_NEIZVESTNYJ_ISHOD;
 *    it must not be attributed to a human or default to granting a write.
 */
const PRIRODY = Object.freeze({
  'rejected':      { priroda: 'otkazano-chelovekom', pochemu: 'человек не разрешил запись. Знание НЕ СОХРАНЕНО.' },
  'cancelled':     { priroda: 'otmeneno',            pochemu: 'подтверждение прервано до ответа. Это НЕ отказ: спросите снова.' },
  'unavailable':   { priroda: 'net-kanala',          pochemu: 'канал подтверждения ОТСУТСТВУЕТ. Это поломка установки, а НЕ чьё-либо решение: подключите службу подтверждения либо переведите класс в автоматические. Знание НЕ СОХРАНЕНО.' },
  'not-supported': { priroda: 'net-sluzhby',         pochemu: 'служба подтверждения в этой сборке НЕ ПОДДЕРЖИВАЕТСЯ. Поломка установки, а не решение. Знание НЕ СОХРАНЕНО.' },
  'no-agent':      { priroda: 'net-agenta',          pochemu: 'вызов идёт вне агента, спросить некого и записать в журнал агента нечего. Поломка установки, а не решение.' },
  /**
   * RU: ne-predyavleno — имя вызывающего для пропущенного спроса, а не unavailable от платформы. Подстановка
   *    unavailable превратила бы ошибку вызова в ложную поломку исправного канала. Вызывающий должен запросить
   *    подтверждение и передать фактический исход.
   * EN: ne-predyavleno is the caller’s label for a skipped approval request, not the platform outcome
   *    unavailable. Substituting unavailable would misreport a caller error as failure of a working channel.
   *    The caller must request approval and pass the actual outcome.
   */
  'ne-predyavleno': { priroda: 'ne-predyavleno',    pochemu: 'подтверждение НЕ ПРЕДЪЯВЛЕНО: класс требует спросить человека, а вызывающий не спрашивал. Это НЕ отказ и НЕ поломка — вызовите подтверждение и передайте его исход.' },
});

export function istolkovatPodtverzhdenie(ishod, kanalEst = true) {
  if (!kanalEst) {
    return { zapisyvat: false, ...PRIRODY['unavailable'] };
  }
  if (ishod === 'allowed-once') {
    return { zapisyvat: true, priroda: 'razresheno', pochemu: 'человек разрешил запись' };
  }
  const znakomyj = PRIRODY[ishod];
  if (znakomyj) return { zapisyvat: false, ...znakomyj };

  const e = new Error(
    'dsh-pamyat: неизвестный исход подтверждения «' + String(ishod) + '». ' +
    'Записывать нельзя, и приписывать его человеку тоже нельзя: природа неизвестна. ' +
    'Вероятно, ядро платформы добавило исход — обновите разбор.'
  );
  e.code = 'PAMYAT_NEIZVESTNYJ_ISHOD';
  throw e;
}
