/**
 * Telegram Bot API — минимальный клиент, БЕЗ зависимостей.
 *
 * 🔴 Почему руками, а не готовой библиотекой: плагин dsh обязан быть
 * самодостаточным бандлом и НЕ ТАЩИТЬ второй экземпляр фреймворка Cordis.
 * Любая крупная библиотека рискует притащить свой. Здесь только fetch.
 */

const API = 'https://api.telegram.org/bot';

export class TelegramClient {
  constructor(token, log) {
    this.token = token;
    this.log = log ?? (() => {});
    this.offset = 0;
  }

  /**
   * 🔴 ПОВТОРЫ ОБЯЗАТЕЛЬНЫ (21.08.2026). Сеть до Telegram бывает дёрганой:
   * у нас `fetch failed` случается 6-10 раз в час. Отправка без повтора теряет
   * сообщение НАВСЕГДА с одной неудачной попытки, и снаружи это выглядит как
   * «агент не ответил» — мы потратили вечер, ища причину в коде и в чужих ботах,
   * а терялись именно отправки. Поймано на копии вопроса, которая не дошла,
   * когда соседняя отправка четырьмя секундами позже прошла.
   *
   * Повторяем только СЕТЕВЫЕ сбои и 5xx. Отказ самого Telegram (ok:false —
   * нет прав, чат не найден, текст пуст) повторять бессмысленно: он воспроизведётся.
   * Длинный опрос НЕ повторяем: он и так вызывается в цикле, повтор лишь
   * задержит следующий заход.
   */
  async call(method, payload, timeoutMs = 15000, attempts = 3) {
    let lastErr;
    for (let n = 1; n <= attempts; n++) {
      const ctl = new AbortController();
      const t = setTimeout(() => ctl.abort(), timeoutMs);
      try {
        const res = await fetch(`${API}${this.token}/${method}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload ?? {}),
          signal: ctl.signal,
        });
        const data = await res.json();
        if (!data.ok) {
          const err = new Error(`${method}: ${data.description ?? 'неизвестная ошибка'}`);
          err.fromTelegram = true;           // отказ по существу — не повторяем
          throw err;
        }
        if (n > 1) this.log(`${method}: удалось с попытки ${n}`);
        return data.result;
      } catch (e) {
        lastErr = e;
        if (e?.fromTelegram || n === attempts) break;
        const wait = 400 * n;                // 0.4с, 0.8с — растущая пауза
        this.log(`${method}: попытка ${n} не удалась (${e?.message ?? e}), повтор через ${wait} мс`);
        await new Promise((r) => setTimeout(r, wait));
      } finally {
        clearTimeout(t);
      }
    }
    throw lastErr;
  }

  /** Длинный опрос. Возвращает пришедшие обновления и двигает смещение. */
  async poll(timeoutSec = 25) {
    // timeout запроса больше, чем у сервера, иначе рвём его же длинный опрос
    const updates = await this.call('getUpdates',
      { offset: this.offset, timeout: timeoutSec, allowed_updates: ['message'] },
      (timeoutSec + 10) * 1000, 1);
    for (const u of updates) {
      if (u.update_id >= this.offset) this.offset = u.update_id + 1;
    }
    return updates;
  }

  /**
   * Отправка с нарезкой: у Telegram предел 4096 знаков на сообщение.
   * Режем по границам абзацев и строк, чтобы не рвать слова и разметку.
   */
  async send(chatId, text) {
    const LIMIT = 4000;
    const chunks = [];
    let rest = String(text ?? '').trim();
    if (!rest) return;
    while (rest.length > LIMIT) {
      let cut = rest.lastIndexOf('\n\n', LIMIT);
      if (cut < LIMIT * 0.5) cut = rest.lastIndexOf('\n', LIMIT);
      if (cut < LIMIT * 0.5) cut = rest.lastIndexOf(' ', LIMIT);
      if (cut < LIMIT * 0.5) cut = LIMIT;
      chunks.push(rest.slice(0, cut));
      rest = rest.slice(cut).trimStart();
    }
    if (rest) chunks.push(rest);
    for (const c of chunks) {
      await this.call('sendMessage', { chat_id: chatId, text: c });
    }
  }

  async typing(chatId) {
    try { await this.call('sendChatAction', { chat_id: chatId, action: 'typing' }, 8000); }
    catch { /* индикатор необязателен, молча пропускаем */ }
  }

  async whoAmI() { return this.call('getMe'); }

  /** Возвращает file_path для скачивания (нужен для голосовых). */
  async getFilePath(fileId) {
    const file = await this.call('getFile', { file_id: fileId });
    return file.file_path;
  }
}
