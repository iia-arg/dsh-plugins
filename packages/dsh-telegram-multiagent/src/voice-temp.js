// RU: Временные голосовые по рабочей области и разговору. Чтение тем же UID ограничивает отдельный sandbox.
// EN: Voice temporary files scoped by workspace and conversation; same-UID access requires the separate sandbox.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const MAX_AGE_MS = 30 * 60 * 1000;
const MAX_ENTRIES = 1000;

export class VoiceTempStore {
  constructor({workspace, baseDirectory = '/var/tmp', log}) {
    this.workspace = workspace;
    this.baseDirectory = baseDirectory;
    this.log = log;
    this.active = new Set();
  }

  directory(directory) {
    try { fs.mkdirSync(directory, {mode: 0o700}); }
    catch (e) { if (e.code !== 'EEXIST') throw e; }
    const st = fs.lstatSync(directory);
    if (!st.isDirectory() || st.uid !== process.getuid() || (st.mode & 0o777) !== 0o700)
      throw Error(`voice-temp: небезопасный каталог ${directory}: нужен свой каталог 0700 без ссылки`);
  }

  initialize() {
    const base = fs.realpathSync(this.baseDirectory), workspace = fs.realpathSync(this.workspace);
    const uidRoot = path.join(base, `dsh-voice-${process.getuid()}`);
    const relative = path.relative(workspace, uidRoot);
    if (!relative || (!relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative)))
      throw Error(`voice-temp: временный каталог внутри workspace: ${uidRoot}`);
    this.directory(uidRoot);
    this.root = path.join(uidRoot, hash(workspace));
    this.directory(this.root);
  }

  prepare(routeKey) {
    if (typeof routeKey !== 'string' || !routeKey.trim()) throw Error('voice-temp: не задан разговор');
    this.initialize();
    const conversationDirectory = path.join(this.root, 'c-' + hash(routeKey));
    this.directory(conversationDirectory);
    const directory = fs.mkdtempSync(path.join(conversationDirectory, 'job-'));
    this.active.add(directory);
    return {directory, conversationDirectory};
  }

  release(lease) {
    try {
      fs.rmSync(lease.directory, {recursive: true, force: true});
      try { fs.rmdirSync(lease.conversationDirectory); }
      catch (e) { if (!['ENOTEMPTY', 'ENOENT'].includes(e.code)) throw e; }
    } catch (e) {
      this.log(`🔴 voice-temp: не удалён ${lease.directory}: ${e.message}`);
    } finally { this.active.delete(lease.directory); }
  }

  // Один ограниченный обход при старте опроса, без таймера и повторов; ссылки не разыменовываются.
  sweep() {
    let visited = 0, removed = 0, limited = false;
    const cutoff = Date.now() - MAX_AGE_MS;
    const walk = (directory, depth) => {
      const entries = fs.opendirSync(directory);
      try {
        while (true) {
          if (visited >= MAX_ENTRIES) { limited = true; break; }
          const entry = entries.readSync();
          if (!entry) break;
          visited++;
          const file = path.join(directory, entry.name);
          try {
            const st = fs.lstatSync(file);
            if (st.uid !== process.getuid() || st.isSymbolicLink()) continue;
            if (depth === 0 && !/^c-[a-f0-9]{64}$/.test(entry.name)) continue;
            if (depth === 1 && !/^job-[a-zA-Z0-9]{6}$/.test(entry.name)) continue;
            if (st.isDirectory()) {
              if ((st.mode & 0o777) !== 0o700 || this.active.has(file)) continue;
              // Не углубляться в нестандартные деревья распознавателя: ограничены и записи, и стек.
              if (depth > 1) { this.log(`🔴 voice-temp: пропущен вложенный каталог ${file}`); continue; }
              if (depth === 1 && st.mtimeMs >= cutoff) continue;
              walk(file, depth + 1);
              if (st.mtimeMs < cutoff && !limited) {
                try { fs.rmdirSync(file); removed++; }
                catch (e) { if (!['ENOTEMPTY', 'ENOENT'].includes(e.code)) throw e; }
              }
            } else if (depth === 2 && st.isFile() && st.mtimeMs < cutoff) {
              fs.unlinkSync(file); removed++;
            }
          } catch (e) { this.log(`🔴 voice-temp: уборка ${file}: ${e.message}`); }
          if (limited) break;
        }
      } finally { entries.closeSync(); }
    };
    try { this.initialize(); walk(this.root, 0); }
    catch (e) { this.log(`🔴 voice-temp: стартовая уборка: ${e.message}`); }
    if (limited) this.log(`🔴 voice-temp: уборка неполная: предел ${MAX_ENTRIES} записей, ${this.root}`);
    this.log(`voice-temp: стартовая уборка ${this.root ?? this.baseDirectory}: просмотрено ${visited}, удалено ${removed}, предел ${MAX_ENTRIES}, срок 30 минут, лимит_достигнут=${limited}`);
    return {visited, removed, limited};
  }
}
