#!/usr/bin/env node
// RU: Управлять отдельным sdk-runtime, проверять sdkCompat и prerelease bounds. status читает metadata/journal, update меняет только SDK-слой; службы не перезапускает и не переносит авторизацию.
// EN: Manage the separate sdk-runtime layer, enforcing sdkCompat and prerelease bounds. status reads metadata/journal; update changes the SDK layer only, without restarting services or moving credentials.

import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

const ZDES = new URL('./', import.meta.url);
const KOREN_SDK = new URL('./sdk-runtime/', ZDES);
const MODULI = new URL('./node_modules/', KOREN_SDK);
const SOSTOYANIE = new URL('./.sostoyanie.json', KOREN_SDK);

const SDK = {
  anthropic: { paket: '@anthropic-ai/claude-agent-sdk', binar: 'claude' },
  codex: { paket: '@openai/codex-sdk', binar: 'codex' },
};

const skazat = (m) => console.log(m);
const slepota = (m) => { console.error(`⚠️  СЛЕПОТА: ${m}`); process.exit(2); };

// RU: granicy: Управлять отдельным sdk-runtime, проверять sdkCompat и prerelease bounds. status читает metadata/journal, update меняет только SDK-слой; службы не перезапускает и не переносит авторизацию.
// EN: granicy: Manage the separate sdk-runtime layer, enforcing sdkCompat and prerelease bounds. status reads metadata/journal; update changes the SDK layer only, without restarting services or moving credentials.
function granicy() {
  try {
    return JSON.parse(fs.readFileSync(new URL('./package.json', ZDES), 'utf8')).sdkCompat ?? {};
  } catch (e) {
    slepota(`package.json пакета не читается: ${e?.code ?? e?.message}. Границу совместимости взять неоткуда.`);
  }
}

// RU: versiyaNaDiske: Управлять отдельным sdk-runtime, проверять sdkCompat и prerelease bounds. status читает metadata/journal, update меняет только SDK-слой; службы не перезапускает и не переносит авторизацию.
// EN: versiyaNaDiske: Manage the separate sdk-runtime layer, enforcing sdkCompat and prerelease bounds. status reads metadata/journal; update changes the SDK layer only, without restarting services or moving credentials.
function versiyaNaDiske(paket) {
  try {
    return JSON.parse(fs.readFileSync(new URL(`${paket}/package.json`, MODULI), 'utf8')).version ?? null;
  } catch { return null; }
}

// RU: sostoyanie: Управлять отдельным sdk-runtime, проверять sdkCompat и prerelease bounds. status читает metadata/journal, update меняет только SDK-слой; службы не перезапускает и не переносит авторизацию.
// EN: sostoyanie: Manage the separate sdk-runtime layer, enforcing sdkCompat and prerelease bounds. status reads metadata/journal; update changes the SDK layer only, without restarting services or moving credentials.
function sostoyanie() {
  try { return JSON.parse(fs.readFileSync(SOSTOYANIE, 'utf8')); } catch { return {}; }
}

const FORMY_GRANICY = '>=X <Y · >=X <=Y · >=X (открытая сверху) · <Y (открытая снизу)';

// RU: razobratGranicu: Управлять отдельным sdk-runtime, проверять sdkCompat и prerelease bounds. status читает metadata/journal, update меняет только SDK-слой; службы не перезапускает и не переносит авторизацию.
// EN: razobratGranicu: Manage the separate sdk-runtime layer, enforcing sdkCompat and prerelease bounds. status reads metadata/journal; update changes the SDK layer only, without restarting services or moving credentials.
function razobratGranicu(s) {
  const nizh = /(>=)\s*([0-9]+(?:\.[0-9]+)*(?:-[0-9A-Za-z.\-]+)?)/.exec(s);
  const verh = /(<=?)\s*([0-9]+(?:\.[0-9]+)*(?:-[0-9A-Za-z.\-]+)?)/.exec(s);
  return {
    nizh: nizh?.[2] ?? null,
    verh: verh?.[2] ?? null,
    verhVklyuchitelno: verh?.[1] === '<=',
  };
}

// RU: bezPreriliza: Управлять отдельным sdk-runtime, проверять sdkCompat и prerelease bounds. status читает metadata/journal, update меняет только SDK-слой; службы не перезапускает и не переносит авторизацию.
// EN: bezPreriliza: Manage the separate sdk-runtime layer, enforcing sdkCompat and prerelease bounds. status reads metadata/journal; update changes the SDK layer only, without restarting services or moving credentials.
function bezPreriliza(v) { return String(v).split('-')[0]; }
// RU: estPrereliz: Управлять отдельным sdk-runtime, проверять sdkCompat и prerelease bounds. status читает metadata/journal, update меняет только SDK-слой; службы не перезапускает и не переносит авторизацию.
// EN: estPrereliz: Manage the separate sdk-runtime layer, enforcing sdkCompat and prerelease bounds. status reads metadata/journal; update changes the SDK layer only, without restarting services or moving credentials.
function estPrereliz(v) { return String(v).includes('-'); }

// RU: sravnit: Управлять отдельным sdk-runtime, проверять sdkCompat и prerelease bounds. status читает metadata/journal, update меняет только SDK-слой; службы не перезапускает и не переносит авторизацию.
// EN: sravnit: Manage the separate sdk-runtime layer, enforcing sdkCompat and prerelease bounds. status reads metadata/journal; update changes the SDK layer only, without restarting services or moving credentials.
function sravnit(a, b) {
  const A = bezPreriliza(a).split('.').map((x) => Number(x) || 0);
  const B = bezPreriliza(b).split('.').map((x) => Number(x) || 0);
  for (let i = 0; i < Math.max(A.length, B.length); i++) {
    const x = A[i] ?? 0, y = B[i] ?? 0;
    if (x !== y) return x < y ? -1 : 1;
  }

  const pa = estPrereliz(a), pb = estPrereliz(b);
  if (pa === pb) return 0;
  return pa ? -1 : 1;
}

// RU: vGranice: Управлять отдельным sdk-runtime, проверять sdkCompat и prerelease bounds. status читает metadata/journal, update меняет только SDK-слой; службы не перезапускает и не переносит авторизацию.
// EN: vGranice: Manage the separate sdk-runtime layer, enforcing sdkCompat and prerelease bounds. status reads metadata/journal; update changes the SDK layer only, without restarting services or moving credentials.
function vGranice(versiya, granica) {
  const { nizh, verh, verhVklyuchitelno } = razobratGranicu(granica);
  if (!nizh && !verh) return null;
  if (nizh && sravnit(versiya, nizh) < 0) return false;
  if (verh) {
    const c = sravnit(versiya, verh);
    if (verhVklyuchitelno ? c > 0 : c >= 0) return false;
  }
  return true;
}

// RU: poslednyaya: Управлять отдельным sdk-runtime, проверять sdkCompat и prerelease bounds. status читает metadata/journal, update меняет только SDK-слой; службы не перезапускает и не переносит авторизацию.
// EN: poslednyaya: Manage the separate sdk-runtime layer, enforcing sdkCompat and prerelease bounds. status reads metadata/journal; update changes the SDK layer only, without restarting services or moving credentials.
function poslednyaya(paket) {
  try {
    const v = execFileSync('npm', ['view', paket, 'version'], { encoding: 'utf8', timeout: 30000 }).trim();
    if (!/^[0-9]/.test(v)) return null;

    return estPrereliz(v) ? { versiya: v, prereliz: true } : { versiya: v, prereliz: false };
  } catch { return null; }
}

// RU: nachaloZhurnala: Управлять отдельным sdk-runtime, проверять sdkCompat и prerelease bounds. status читает metadata/journal, update меняет только SDK-слой; службы не перезапускает и не переносит авторизацию.
// EN: nachaloZhurnala: Manage the separate sdk-runtime layer, enforcing sdkCompat and prerelease bounds. status reads metadata/journal; update changes the SDK layer only, without restarting services or moving credentials.
function nachaloZhurnala() {
  try {

    const v = execFileSync('bash', ['-c', "journalctl --no-pager -o short-iso 2>/dev/null | head -1"],
      { encoding: 'utf8', timeout: 60000, maxBuffer: 16 * 1024 * 1024 }).trim();
    const m = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})/.exec(v);
    return m ? new Date(m[1] + 'Z') : null;
  } catch { return null; }
}

// RU: versiyaVPamyati: Управлять отдельным sdk-runtime, проверять sdkCompat и prerelease bounds. status читает metadata/journal, update меняет только SDK-слой; службы не перезапускает и не переносит авторизацию.
// EN: versiyaVPamyati: Manage the separate sdk-runtime layer, enforcing sdkCompat and prerelease bounds. status reads metadata/journal; update changes the SDK layer only, without restarting services or moving credentials.
function versiyaVPamyati(yunit, podnyat, nachalo) {
  if (!podnyat) return { isxod: 'ne-prochitano', prichina: 'время подъёма не прочитано' };
  try {

    const vyvod = execFileSync('journalctl', ['-u', yunit, '--since', podnyat, '--no-pager', '-o', 'cat'],
      { encoding: 'utf8', timeout: 60000, maxBuffer: 256 * 1024 * 1024 });
    const najdeno = [];
    for (const stroka of vyvod.split('\n')) {
      const m = /SDK (\S+) (\S+) взят из слоя/.exec(stroka);
      if (m) najdeno.push({ paket: m[1], versiya: m[2] });
    }
    if (!najdeno.length) {

      if (nachalo && new Date(podnyat) < nachalo) {
        return { isxod: 'zhurnal-ne-pomnit', prichina: `процесс поднят ${podnyat}, а журнал помнит с ${nachalo.toISOString()} — строка загрузки стёрта ротацией` };
      }
      return { isxod: 'ne-zagruzhal', prichina: 'строки загрузки нет: импорт ленивый, ход ещё не обслуживался' };
    }
    return { isxod: 'zamereno', najdeno };
  } catch (e) {
    return { isxod: 'slepota', prichina: `журнал не прочитан: ${e?.code ?? e?.message}` };
  }
}

// RU: ekzemplyary: Управлять отдельным sdk-runtime, проверять sdkCompat и prerelease bounds. status читает metadata/journal, update меняет только SDK-слой; службы не перезапускает и не переносит авторизацию.
// EN: ekzemplyary: Manage the separate sdk-runtime layer, enforcing sdkCompat and prerelease bounds. status reads metadata/journal; update changes the SDK layer only, without restarting services or moving credentials.
function ekzemplyary() {
  let syroe;
  try {
    syroe = execFileSync('systemctl', ['list-units', '--all', '--no-legend', '--plain',
      '--type=service', 'claude-oauth-gateway@*', 'coder-gateway*', 'gateway@*.service'], { encoding: 'utf8', timeout: 20000 });
  } catch { return null; }
  const out = [];
  for (const stroka of syroe.split('\n')) {
    const imya = stroka.trim().split(/\s+/)[0];
    if (!imya || !imya.endsWith('.service')) continue;
    let podnyat = null, zhiv = false, katalog = null;
    try {
      const p = execFileSync('systemctl', ['show', imya, '-p', 'ExecMainStartTimestamp', '-p', 'ActiveState',
        '-p', 'ExecStart', '--no-pager'], { encoding: 'utf8', timeout: 20000 });
      podnyat = /ExecMainStartTimestamp=(.*)/.exec(p)?.[1]?.trim() || null;
      zhiv = /ActiveState=active/.test(p);
      katalog = katalogSluzhby(p);
    } catch {                                                     }
    out.push({ imya, zhiv, katalog, podnyat: podnyat && podnyat !== '' ? podnyat : null });
  }
  return out;
}

// RU: katalogSluzhby: Управлять отдельным sdk-runtime, проверять sdkCompat и prerelease bounds. status читает metadata/journal, update меняет только SDK-слой; службы не перезапускает и не переносит авторизацию.
// EN: katalogSluzhby: Manage the separate sdk-runtime layer, enforcing sdkCompat and prerelease bounds. status reads metadata/journal; update changes the SDK layer only, without restarting services or moving credentials.
function katalogSluzhby(show) {
  const argv = /argv\[\]=([^;]*)/.exec(show)?.[1]?.trim().split(/\s+/) ?? [];
  const skript = argv.filter((a) => a.endsWith('.mjs')).pop();
  if (!skript) return null;
  const k = skript.slice(0, skript.lastIndexOf('/') + 1) || null;
  if (!k) return null;
  try { return fs.realpathSync(k); } catch { return k.replace(/\/$/, ''); }
}

// RU: binari: Управлять отдельным sdk-runtime, проверять sdkCompat и prerelease bounds. status читает metadata/journal, update меняет только SDK-слой; службы не перезапускает и не переносит авторизацию.
// EN: binari: Manage the separate sdk-runtime layer, enforcing sdkCompat and prerelease bounds. status reads metadata/journal; update changes the SDK layer only, without restarting services or moving credentials.
function binari(imyaBinarya) {
  const najdeno = [];

  try {
    const vyvod = execFileSync('find', [MODULI.pathname, '-name', imyaBinarya, '-type', 'f'],
      { encoding: 'utf8', timeout: 30000 });
    for (const p of vyvod.split('\n').filter(Boolean)) najdeno.push({ gde: 'sdk-runtime', put: p });
  } catch {                                            }

  try {
    const p = execFileSync('command', ['-v', imyaBinarya], { encoding: 'utf8', timeout: 10000, shell: '/bin/bash' }).trim();
    if (p) najdeno.push({ gde: 'PATH', put: p });
  } catch {                                             }
  for (const b of najdeno) {
    try { b.versiya = execFileSync(b.put, ['--version'], { encoding: 'utf8', timeout: 20000 }).trim().split('\n')[0]; }
    catch (e) { b.versiya = `не спрошена (${e?.code ?? 'отказ'})`; }
  }
  return najdeno;
}

// RU: dubli: Управлять отдельным sdk-runtime, проверять sdkCompat и prerelease bounds. status читает metadata/journal, update меняет только SDK-слой; службы не перезапускает и не переносит авторизацию.
// EN: dubli: Manage the separate sdk-runtime layer, enforcing sdkCompat and prerelease bounds. status reads metadata/journal; update changes the SDK layer only, without restarting services or moving credentials.
function dubli() {
  const chitat = (koren) => {
    const out = {};
    try {
      for (const e of fs.readdirSync(koren)) {
        if (e.startsWith('.')) continue;
        if (e.startsWith('@')) {
          for (const sub of fs.readdirSync(`${koren}/${e}`)) out[`${e}/${sub}`] = `${koren}/${e}/${sub}`;
        } else out[e] = `${koren}/${e}`;
      }
    } catch {                                                           }
    return out;
  };
  const versiya = (p) => { try { return JSON.parse(fs.readFileSync(`${p}/package.json`, 'utf8')).version ?? '?'; } catch { return '?'; } };
  const A = chitat(new URL('./node_modules', ZDES).pathname);
  const B = chitat(MODULI.pathname);
  const obshchie = Object.keys(A).filter((k) => k in B).sort();
  const raznye = obshchie.filter((k) => versiya(A[k]) !== versiya(B[k]))
    .map((k) => ({ imya: k, paket: versiya(A[k]), sloj: versiya(B[k]) }));
  return { vsegoPaket: Object.keys(A).length, vsegoSloj: Object.keys(B).length, obshchie: obshchie.length, raznye };
}

// RU: status: Управлять отдельным sdk-runtime, проверять sdkCompat и prerelease bounds. status читает metadata/journal, update меняет только SDK-слой; службы не перезапускает и не переносит авторизацию.
// EN: status: Manage the separate sdk-runtime layer, enforcing sdkCompat and prerelease bounds. status reads metadata/journal; update changes the SDK layer only, without restarting services or moving credentials.
function status() {
  const gr = granicy();
  const sost = sostoyanie();
  let beda = 0;

  skazat(`слой среды: ${KOREN_SDK.pathname}`);
  skazat(`состояние:  ${fs.existsSync(SOSTOYANIE) ? SOSTOYANIE.pathname : 'НЕТ ФАЙЛА — слой ни разу не ставился этим инструментом'}`);
  skazat('');

  for (const [imya, { paket, binar }] of Object.entries(SDK)) {
    const granica = gr[paket];
    const disk = versiyaNaDiske(paket);
    skazat(`── ${imya} (${paket})`);
    if (!granica) { skazat('   🔴 границы совместимости НЕТ в package.json — update работать не может'); beda = 1; }
    if (!disk) {
      skazat(`   🔴 НЕ УСТАНОВЛЕН в слое. ЛЕЧЕНИЕ: node gateway-sdk.mjs update ${imya}`);
      beda = 1;
    } else {
      const v = granica ? vGranice(disk, granica) : null;
      skazat(`   диск: ${disk} · граница: ${granica ?? '—'} · ${v === null ? 'СВЕРИТЬ НЕЧЕМ' : v ? 'в границе' : '🔴 ВНЕ ГРАНИЦЫ'}`);
      if (v === null) { skazat(`      границу не разобрать · понимаемые формы: ${FORMY_GRANICY}`); beda = 1; }
      if (v === false) beda = 1;
      const z = sost[paket];
      if (z) skazat(`   поставлен: ${z.kogda ?? '?'} рукой ${z.kem ?? '?'}`);
    }

    const posl = granica ? poslednyaya(paket) : null;
    if (!granica) {                        }
    else if (posl === null) {
      skazat(`   последняя в реестре: НЕ СПРОШЕНА (нет сети либо npm отказал) — отставание границы НЕ ПРОВЕРЕНО`);
    } else if (posl.prereliz) {
      skazat(`   последняя в реестре: ${posl.versiya} — ЭТО ПРЕРЕЛИЗ, в выбор НЕ берётся`);
      skazat(`      ⇒ ставить бету молча значит менять поведение семи шлюзов решением прибора, а не руки`);
    } else if (vGranice(posl.versiya, granica) === false) {
      skazat(`   🔴 ГРАНИЦА ОТСТАЛА: граница ${granica} · последняя ${posl.versiya} · вышла за предел`);
      skazat(`      ⇒ это НЕ отказ обновления, это повод ПЕРЕСМОТРЕТЬ границу выпуском пакета`);
      beda = 1;
    } else if (vGranice(posl.versiya, granica) === null) {
      skazat(`   ⚠️ границу «${granica}» РАЗОБРАТЬ НЕ УДАЛОСЬ — сверить нечем (это НЕ «в границе»)`);
      skazat(`      понимаемые формы: ${FORMY_GRANICY}`);
      beda = 1;
    } else {
      skazat(`   последняя в реестре: ${posl.versiya} · в границе`);
    }

    const bb = binari(binar);
    if (!bb.length) skazat(`   бинарь ${binar}: НЕ НАЙДЕН ни в слое, ни в PATH`);
    else {
      for (const b of bb) skazat(`   бинарь ${binar}: ${b.gde} ${b.versiya} · ${b.put}`);
      const raznye = new Set(bb.map((b) => b.versiya)).size > 1;
      if (raznye) { skazat(`   🔴 РАСХОЖДЕНИЕ версий бинаря ${binar} между местами (см. выше)`); beda = 1; }
    }
    skazat('');
  }

  const d = dubli();
  skazat('── дубли модулей (пакет ↔ слой)');
  skazat(`   в пакете ${d.vsegoPaket} · в слое ${d.vsegoSloj} · в обоих ${d.obshchie}`);
  if (!d.raznye.length) skazat('   расхождений версий нет');
  else {
    skazat(`   🔴 версии РАЗОШЛИСЬ у ${d.raznye.length}:`);
    for (const r of d.raznye) skazat(`      ${r.imya}: пакет ${r.paket} · слой ${r.sloj}`);
    skazat('   ⚠️ это НЕ отказ: прямая проба шва (схема пакета → tool() слоя) прошла,');
    skazat('     валидация работает. Печатаем, чтобы следующий не искал причину с нуля.');
  }
  skazat('');

  const ek = ekzemplyary();
  skazat('── экземпляры');
  if (ek === null) skazat('   ⚠️  systemctl не ответил — состояние экземпляров НЕ ПРОВЕРЕНО');
  else if (!ek.length) skazat('   экземпляров не найдено');
  else {
    const nachaloZh = nachaloZhurnala();
    let moj;
    try { moj = fs.realpathSync(ZDES); } catch { moj = ZDES.pathname.replace(/\/$/, ''); }
    const chuzhie = [];
    for (const e of ek) {
      if (!e.zhiv) { skazat(`   ${e.imya}: НЕ ЖИВ`); continue; }
      if (!e.katalog) {
        skazat(`   ${e.imya}: 🔴 каталог службы НЕ ПРОЧИТАН из ExecStart — сверка памяти с диском НЕ ДЕЛАЕТСЯ`);
        beda = 1;
        continue;
      }
      if (e.katalog !== moj) { chuzhie.push(`${e.imya} (${e.katalog})`); continue; }
      const p = versiyaVPamyati(e.imya, e.podnyat, nachaloZh);
      if (p.isxod === 'zamereno') {
        for (const n of p.najdeno) {
          const disk = versiyaNaDiske(n.paket);
          const sovpalo = disk && disk === n.versiya;
          skazat(`   ${e.imya}: поднят ${e.podnyat} · ПАМЯТЬ ${n.paket} ${n.versiya} · диск ${disk ?? '—'} · ` +
            (sovpalo ? 'совпадает' : '🔴 ЖДЁТ ПОДЪЁМА (диск новее памяти)'));
          if (!sovpalo) beda = 1;
        }
      } else if (p.isxod === 'zhurnal-ne-pomnit') {
        skazat(`   ${e.imya}: поднят ${e.podnyat} · ⚠️ ЖУРНАЛ НЕ ПОМНИТ (${p.prichina})`);
        skazat(`      ⇒ версия в памяти НЕИЗВЕСТНА. Это НЕ «не загружал» и НЕ «совпадает»`);
      } else if (p.isxod === 'ne-zagruzhal') {
        skazat(`   ${e.imya}: поднят ${e.podnyat} · ЕЩЁ НЕ ЗАГРУЖАЛ SDK (${p.prichina})`);
        skazat(`      ⇒ это НЕ «версия неизвестна» и НЕ «совпадает»: ход ещё не обслуживался`);
      } else {
        skazat(`   ${e.imya}: поднят ${e.podnyat ?? '?'} · ⚠️ ${p.prichina}`);
      }
    }
    if (chuzhie.length) {
      skazat(`   служб из ДРУГОГО каталога: ${chuzhie.length} — не мой каталог (${moj}), сверка не про них:`);
      for (const c of chuzhie) skazat(`      ${c}`);
    }
    skazat('   ⚠️ версия в ПАМЯТИ — замер из журнала процесса (строка загрузки слоя),');
    skazat('     а не вывод из времён. Нет строки — значит SDK ещё не загружался.');
  }
  return beda;
}

// RU: update: Управлять отдельным sdk-runtime, проверять sdkCompat и prerelease bounds. status читает metadata/journal, update меняет только SDK-слой; службы не перезапускает и не переносит авторизацию.
// EN: update: Manage the separate sdk-runtime layer, enforcing sdkCompat and prerelease bounds. status reads metadata/journal; update changes the SDK layer only, without restarting services or moving credentials.
function update(chto) {
  const gr = granicy();
  const celi = chto === 'all' ? Object.keys(SDK) : [chto];
  for (const c of celi) if (!SDK[c]) { console.error(`неизвестная цель «${c}»; годные: anthropic codex all`); return 1; }
  fs.mkdirSync(KOREN_SDK, { recursive: true });
  const sost = sostoyanie();
  let beda = 0;

  for (const c of celi) {
    const { paket } = SDK[c];
    const granica = gr[paket];
    if (!granica) { console.error(`🔴 ОТКАЗ ${paket}: границы совместимости нет в package.json`); beda = 1; continue; }
    const pv = poslednyaya(paket);
    if (pv === null) { console.error(`🔴 ОТКАЗ ${paket}: реестр не ответил — что ставить, неизвестно. Это НЕ «нечего ставить».`); beda = 1; continue; }
    if (pv.prereliz) { console.error(`🔴 ОТКАЗ ${paket}: последняя ${pv.versiya} — ПРЕРЕЛИЗ. Ставить бету молча нельзя, решение руки.`); beda = 1; continue; }
    const posl = pv.versiya;

    if (vGranice(posl, granica) === false) {
      console.error(`🔴 ОТКАЗ ${paket}: последняя ${posl} ушла ЗА ОБЪЯВЛЕННУЮ СОВМЕСТИМОСТЬ ${granica}.`);
      console.error(`   Нужен ВЫПУСК ПАКЕТА с новой границей, а не тихая установка несовместимого.`);
      beda = 1; continue;
    }
    skazat(`ставлю ${paket}@${posl} в ${KOREN_SDK.pathname}`);
    try {
      execFileSync('npm', ['install', '--prefix', KOREN_SDK.pathname, '--no-audit', '--no-fund', `${paket}@${posl}`],
        { encoding: 'utf8', stdio: 'inherit', timeout: 600000 });
    } catch (e) {
      console.error(`⚠️  npm вернул отказ (${e?.status ?? e?.code}) — состав проверю ниже, коду не верю`);
    }

    const stalo = versiyaNaDiske(paket);
    if (stalo !== posl) {
      console.error(`🔴 ОТКАЗ ${paket}: ждали ${posl}, на диске ${stalo ?? 'НИЧЕГО'} — состав не сошёлся, состояние НЕ пишу`);
      beda = 1; continue;
    }
    sost[paket] = { versiya: stalo, kogda: new Date().toISOString(), kem: process.env.SUDO_USER || process.env.USER || 'неизвестно' };
    skazat(`✅ ${paket} ${stalo} — состав сверен с package.json установленного`);
  }
  const vrem = new URL('./.sostoyanie.json.tmp', KOREN_SDK);
  fs.writeFileSync(vrem, JSON.stringify(sost, null, 2) + '\n');
  fs.renameSync(vrem, SOSTOYANIE);
  skazat('');
  skazat('🔴 СЛУЖБЫ НЕ ПЕРЕЗАПУЩЕНЫ (З3). Новый SDK встанет при следующем подъёме.');
  skazat('   Кому и когда поднимать — решает рука, а не этот инструмент.');
  return beda;
}

const [, , komanda, cel] = process.argv;
if (komanda === 'status') process.exit(status());
else if (komanda === 'update') {
  if (!cel) { console.error('update требует цель: anthropic | codex | all'); process.exit(1); }
  process.exit(update(cel));
} else {
  console.error('gateway-sdk <status | update anthropic|codex|all>');
  process.exit(1);
}
