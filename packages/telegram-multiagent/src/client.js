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

  async call(method, payload, timeoutMs = 15000) {
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
      if (!data.ok) throw new Error(`${method}: ${data.description ?? 'неизвестная ошибка'}`);
      return data.result;
    } finally {
      clearTimeout(t);
    }
  }

  /** Длинный опрос. Возвращает пришедшие обновления и двигает смещение. */
  async poll(timeoutSec = 25) {
    // timeout запроса больше, чем у сервера, иначе рвём его же длинный опрос
    const updates = await this.call('getUpdates',
      { offset: this.offset, timeout: timeoutSec, allowed_updates: ['message'] },
      (timeoutSec + 10) * 1000);
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
