// RU: РЕЖИМ ОТМЕТКИ ПРОДОЛЖЕНИЯ ДЛЯ CODEX. Для маршрута Claude отметка работает всегда; для агентов на Codex
//     (модель gpt-*) — только если агент перечислен в общем файле режима. Тот же файл читает шлюз подписки
//     (своим читателем): включённому агенту он перестаёт класть прежнее письмо-продолжение, чтобы агента не
//     будили дважды. Поэтому список меняется только в паузе (новые ходы остановлены, старые письма-продолжения
//     разобраны) и для обоих читателей сразу.
// EN: CONTINUATION MARKER MODE FOR CODEX. On the Claude route the marker always works; for Codex agents (model
//     gpt-*) only if the agent is listed in the shared mode file. The subscription gateway reads the same file
//     (with its own reader): for an enabled agent it stops putting the legacy continuation letter, so the agent
//     is not woken twice. Therefore the list is changed only during a pause (new turns stopped, old
//     continuation letters drained) and for both readers at once.
import fs from 'node:fs';
// RU: Файл настройки пакета: строки «КЛЮЧ=значение», комментарий — только строка с «#» в начале, берётся последнее
//     вхождение. Путь меняет DSH_PAMYAT_KOMPAKT_DSH_CONF. Порядок: переменная окружения с именем ключа → файл →
//     умолчание; умолчания — прежние пути, поэтому без файла поведение прежнее; файл есть, но не читается — отказ. Значение с « #» (пробел или таб
//     перед «#») — громкий отказ с ключом: исключение при загрузке плагина (выход процесса здесь убил бы агента),
//     а не пояснение, склеенное с путём.
// EN: Package settings file: "KEY=value" lines, a comment is only a line starting with "#", the last occurrence
//     wins. DSH_PAMYAT_KOMPAKT_DSH_CONF changes the path. Order: environment variable named as the key → file →
//     default; the defaults are the former paths, so without a file the behaviour is unchanged; a file that exists
//     but cannot be read is a refusal. A value with " #"
//     (a space or tab before "#") is a loud refusal naming the key: an exception at plugin load (exiting the
//     process here would kill the agent), not a note glued to the path.
export const KONF = process.env.DSH_PAMYAT_KOMPAKT_DSH_CONF || '/etc/dsh-pamyat-kompakt-dsh/dsh-pamyat-kompakt-dsh.conf';
const konf = (k, umolch) => {
  if (process.env[k]) return process.env[k];
  let z = null;
  try { for (const s of fs.readFileSync(KONF, 'utf8').split('\n')) { const t = s.trim(), i = t.indexOf('='); if (t && !t.startsWith('#') && i > 0 && t.slice(0, i).trim() === k) z = t.slice(i + 1); } }
  catch (e) { if (e.code !== 'ENOENT') throw new Error('dsh-pamyat-kompakt-dsh: файл настройки ' + KONF + ' есть, но не читается: ' + e.message); }
  if (z !== null && /\s#/.test(z)) throw new Error('dsh-pamyat-kompakt-dsh: значение ключа ' + k + ' в ' + KONF + ' содержит « #» — комментарий допускается только с начала строки');
  return (z ?? '').trim() || umolch;
};
// RU: Пути внешних команд и файла режима. Формат файла режима: {"version":1,"codex_marker":[<агенты>]}, не больше
//     4096 байт.
// EN: Paths of external commands and of the mode file. Mode file format: {"version":1,"codex_marker":[<agents>]},
//     at most 4096 bytes.
export const AGENT_ALERT = konf('KOMPAKT_AGENT_ALERT', '/usr/local/bin/agent-alert');
export const AGENT_REGISTRY = konf('KOMPAKT_AGENT_REGISTRY', '/usr/local/bin/agent-registry');
export const JOURNALCTL = konf('KOMPAKT_JOURNALCTL', '/usr/bin/journalctl');
export const MODE_FILE = konf('KOMPAKT_REZHIM_FAJL', '/etc/dsh-pamyat/continuation-mode.json');
// RU: Включён ли Codex-маркер для агента. Нет файла — выключен (false). Файл есть, но негоден — исключение:
//     отметка запрещается, а не включается молча.
// EN: Is the Codex marker enabled for the agent. No file — disabled (false). A file that exists but is invalid
//     — an exception: the marker is refused rather than silently enabled.
export function codexMarkerEnabled(agent, file = MODE_FILE) {
  let bytes;
  try { bytes=fs.readFileSync(file); } catch(e) { if(e.code==='ENOENT')return false;throw e; }
  if(bytes.length>4096)throw Error('continuation mode exceeds 4096 bytes');
  const d=JSON.parse(bytes);
  // RU: Строгая проверка: version ровно 1, codex_marker — массив имён агентов вида [a-z][a-z0-9_-]{0,31},
  //     никаких лишних ключей. Перечня имён в коде нет: прежний зашитый список кодеров — частное значение фермы.
  //     Граница: правильное по форме, но чужое имя отметку никому не запрещает — оно просто ни с кем не совпадёт.
  // EN: Strict validation: version exactly 1, codex_marker is an array of agent names of the form
  //     [a-z][a-z0-9_-]{0,31}, no extra keys. There is no name list in code: the former hard-coded coder list was
  //     a farm-specific value. Boundary: a well-formed but foreign name forbids the marker to nobody — it simply
  //     matches no agent.
  if(d.version!==1||!Array.isArray(d.codex_marker)||d.codex_marker.some(x=>typeof x!=='string'||!/^[a-z][a-z0-9_-]{0,31}$/.test(x))||Object.keys(d).some(k=>!['version','codex_marker'].includes(k)))throw Error('invalid continuation mode');
  return d.codex_marker.includes(agent);
}
