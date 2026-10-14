// RU: Пределы600000/900000мс наблюдают границу/завершение после steer; expiry не делает interrupt и не закрывает активный ход.
// EN: The600000/900000ms deadlines observe boundary/completion after steering; expiry neither interrupts nor closes the active turn.
// RU: JSON-RPC дочерний Codex app-server позволяет steer и явный stop точного thread/turn. Давление использует steer, Telegram stop — interrupt; подмена модели обнаруживается по уведомлению и не отзывает уже выданный текст.
// EN: A child Codex app-server JSON-RPC connection supports steering and explicit stopping of the exact thread/turn. Pressure uses steering; Telegram stop interrupts. Model rerouting is detected by notification and cannot retract text already emitted.


import {renderInboxFrame,parseInboxPayload,MAX_PENDING_INPUTS} from './inbox-input.mjs';
import { spawn, execFile } from 'node:child_process';
import { poBelomu, vychistit, sekretyProcessa } from './secret-redact.mjs';

export const PREDEL_GRANICY_MS = 10 * 60 * 1000;
export const PREDEL_ZAVERSHENIYA_MS = 15 * 60 * 1000;
export const PREDEL_TREVOGI_STOPA_MS = 5 * 60 * 1000;

// RU: sozdatKlienta: JSON-RPC дочерний Codex app-server позволяет steer и явный stop точного thread/turn. Давление использует steer, Telegram stop — interrupt; подмена модели обнаруживается по уведомлению и не отзывает уже выданный текст.
// EN: sozdatKlienta: A child Codex app-server JSON-RPC connection supports steering and explicit stopping of the exact thread/turn. Pressure uses steering; Telegram stop interrupts. Model rerouting is detected by notification and cannot retract text already emitted.
export function sozdatKlienta({ bin, args = ['app-server', '--listen', 'stdio://'], env, log, spawnImpl = spawn }) {
  const child = spawnImpl(bin, args, { env, stdio: ['pipe', 'pipe', 'pipe'] });
  let n = 0, buf = '', zakryt = false, konec = null;
  const zhdut = new Map(), slushateli = [];
  child.stdout.setEncoding('utf8');
  child.stdout.on('data', (s) => {
    buf += s; let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i); buf = buf.slice(i + 1);
      if (!line.trim()) continue;
      let m; try { m = JSON.parse(line); } catch { log(`[codex-app-server] строка не JSON (${line.length} зн.) — пропущена`); continue; }
      if (m.id !== undefined && (m.result !== undefined || m.error !== undefined) && zhdut.has(m.id)) {
        const { res, rej } = zhdut.get(m.id); zhdut.delete(m.id);
        m.error ? rej(new Error(`app-server ${m.error.code ?? ''}: ${m.error.message ?? JSON.stringify(m.error)}`)) : res(m.result);
      } else if (m.method && m.id !== undefined) {

        child.stdin.write(JSON.stringify({ id: m.id, error: { code: -32601, message: 'шлюз не обслуживает запросы сервера' } }) + '\n');
        log(`[codex-app-server] 🔴 запрос сервера «${poBelomu(m.method, 'metod')}» — отказ (политика одобрений never)`);
      } else if (m.method) for (const f of slushateli) f(m.method, m.params ?? {});
    }
  });
  let stderrHvost = '';
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', (s) => { stderrHvost = (stderrHvost + s).slice(-2000); });
  const umer = new Promise((res) => child.once('exit', (code, sig) => { zakryt = true; konec = { code, sig }; res(konec); }));
  child.once('error', (e) => { zakryt = true; konec = { oshibka: e.message }; for (const { rej } of zhdut.values()) rej(e); zhdut.clear(); });
  umer.then(() => { for (const { rej } of zhdut.values()) rej(new Error(`app-server завершился (${JSON.stringify(konec)}); stderr: ${stderrHvost.slice(-300)}`)); zhdut.clear(); });
  return {
    zapros(method, params) {
      if (zakryt) return Promise.reject(new Error(`app-server уже завершён (${JSON.stringify(konec)})`));
      const id = ++n;
      return new Promise((res, rej) => { zhdut.set(id, { res, rej }); child.stdin.write(JSON.stringify({ id, method, params }) + '\n'); });
    },
    uvedomit(method, params) { if (!zakryt) child.stdin.write(JSON.stringify({ method, ...(params ? { params } : {}) }) + '\n'); },
    slushat(f) { slushateli.push(f); },
    umer,
    // RU: SIGTERM через 5 с, SIGKILL ещё через 5 с: app-server, глухой к SIGTERM, не держит finally и HTTP-ответ бесконечно (аудит №15).
    // EN: SIGTERM after 5 s, SIGKILL 5 s later: an app-server deaf to SIGTERM no longer holds finally and the HTTP response forever (audit #15).
    async zakryt() { if (zakryt) return; try { child.stdin.end(); } catch {} const t = setTimeout(() => { try { child.kill('SIGTERM'); } catch {} }, 5000); const t2 = setTimeout(() => { log(`[codex-app-server] 🔴 app-server не завершился за 10 с после закрытия — SIGKILL`); try { child.kill('SIGKILL'); } catch {} }, 10000); await umer; clearTimeout(t); clearTimeout(t2); },
  };
}

// RU: progonAppServer: JSON-RPC дочерний Codex app-server позволяет steer и явный stop точного thread/turn. Давление использует steer, Telegram stop — interrupt; подмена модели обнаруживается по уведомлению и не отзывает уже выданный текст.
// EN: progonAppServer: A child Codex app-server JSON-RPC connection supports steering and explicit stopping of the exact thread/turn. Pressure uses steering; Telegram stop interrupts. Model rerouting is detected by notification and cannot retract text already emitted.
export async function* progonAppServer({ bin, env, log, zapros, sessiya, cwd, model, sandbox, effort, config, porog, tekstSignala,
                                         predelGranicyMs = PREDEL_GRANICY_MS, predelZaversheniyaMs = PREDEL_ZAVERSHENIYA_MS,
                                         predelTrevogiMs = PREDEL_TREVOGI_STOPA_MS,
                                         klientImpl = sozdatKlienta, clientVersion = '0', registerTaskControl, onPressureAccepted, onThread }) {
  const k = klientImpl({ bin, env, log });
  const ochered = []; let budit = null; const polozhit = (e) => { ochered.push(e); if (budit) { budit(); budit = null; } };
  const P = porog?.porog;
  let turnId = null, threadId = null, zanyato = null, vzveden = false, steerPoslan = false, vzvedenV = null, steerV = null;
  let zaversheno = null, taimer = null, predelIstek = false, samPosleSteer = false, granicaIstekla = false;
  const earlyTerminals=new Map(); let terminalExact=false;
  let unregisterTaskControl = null, controlClosed = false, userStop = false;
  let pressureWatch = null, pressureTimer = null, fullyClosed = false, closeStarted = false;
  let pressureAccepted = false;
  let appCompletionBound = null;
  const safeLog = (text) => log(vychistit(text, sekretyProcessa(env ?? {})));
  // Observe only: warning never interrupts Codex or authorizes restart.
  const warnPressure = () => {
    if (!pressureWatch || pressureWatch.warned || fullyClosed) return;
    pressureWatch.warned = true;
    const phase = closeStarted ? 'closing-app-server' : 'waiting-turn';
    const text = vychistit('[codex-app-server] 🔴 STOP_WAIT_TIMEOUT: soft-stop RPC ответ получен, '
      + 'локальный поток шлюза не закрыт за ' + predelTrevogiMs + ' мс; phase=' + phase
      + '; ack_bound=' + pressureWatch.bound + '; completed_bound=' + appCompletionBound
      + '; thread=' + poBelomu(pressureWatch.thread, 'id') + '; turn=' + poBelomu(pressureWatch.turn, 'id')
      + '; платформенный turn/end здесь не наблюдается; interrupt/restart не выполняются',
      sekretyProcessa(env ?? {}));
    log(text);
    const command = env?.GATEWAY_STOP_WATCH_ALERT;
    if (!command) return;
    try {
      const alertEnv = { PATH: env?.PATH ?? process.env.PATH ?? '', LANG: env?.LANG ?? 'C' };
      const alert = execFile(command, [], { env: alertEnv, timeout: 30000, killSignal: 'SIGKILL', maxBuffer: 8192 }, (error) => {
        const code = error ? (Number.isInteger(error.code) ? error.code : 'exec-failed') : 0;
        safeLog('[codex-app-server] STOP_WAIT_ALERT: код ' + code + '; дальнейшая доставка не измерена');
      });
      alert.stdin?.on('error', () => {});
      alert.stdin?.end(text + '\n');
    } catch {
      safeLog('[codex-app-server] STOP_WAIT_ALERT: канал не запущен; значение ошибки скрыто');
    }
  };
  const armPressureWatch = (thread, turn, reply) => {
    const bound = reply?.turnId === turn;
    safeLog('[codex-app-server] pressure RPC resolved: ack_bound=' + bound
      + '; expected_turn=' + poBelomu(turn, 'id') + '; reply_turn=' + poBelomu(reply?.turnId, 'id')
      + (fullyClosed ? '; late-after-close' : ''));
    if (fullyClosed || closeStarted) return;
    if (bound) {
      pressureAccepted = true;
      const state = onPressureAccepted?.();
      safeLog(`[codex-app-server] steer принят #${state?.stops ?? '?'}; thread=${poBelomu(thread, 'id')}; turn=${poBelomu(turn, 'id')}`);
    } else safeLog('[codex-app-server] steer не подтверждён: turnId не совпал');
    pressureWatch = { thread, turn, bound, warned: false };
    pressureTimer = setTimeout(warnPressure, predelTrevogiMs);
    pressureTimer.unref?.();
  };
  // RU: Один RPC-lane не переносит queued steer на новый expectedTurnId.
  // EN: One RPC lane never moves a queued steer to a new expectedTurnId.
  let messageCount=0;
  let remoteActiveTurn = null, steerQueue = Promise.resolve();
  const serialSteer = (action) => { const result = steerQueue.then(action, action); steerQueue = result.catch(() => {}); return result; };
  const inputEvent = (packet, state, method = 'codex-steer', reason) => polozhit({ type:'input-status', state, binding:packet.binding, method, ...(reason?{reason}:{}), ...(state==='offered'?{packet}:{}),
    codex:{thread_id:threadId,turn_id:turnId} });
  let podmena = null, prervan = false;
  const prervatPodmenu = async () => {
    if (prervan || !turnId) return;
    prervan = true;
    try { await k.zapros('turn/interrupt', { threadId, turnId }); log(`[codex-app-server] turn/interrupt принят (подмена модели)`); }
    catch (e) { log(`[codex-app-server] 🔴 turn/interrupt ОТКАЗАН: ${e.message} — ход закрываю закрытием app-server`); }
    polozhit(null);
  };
  const proverkaPredelov = () => {
    const t = Date.now();
    if (vzveden && !steerPoslan && t - vzvedenV > predelGranicyMs) {
      vzveden = false; granicaIstekla = true;
      log(`[codex-app-server] 🔴 граница не наступила за ${Math.round(predelGranicyMs / 60000)} мин после порога (занято ${zanyato} ≥ ${P}) — стоп НЕ послан; Codex сожмёт сам на своём пороге`);
    }
    if (steerPoslan && !zaversheno && steerV && t - steerV > predelZaversheniyaMs) {
      steerV = null; predelIstek = true;
      log(`[codex-app-server] 🔴 стоп не исполнен моделью за ${Math.round(predelZaversheniyaMs / 60000)} мин — ход НЕ прерываю (interrupt не зовётся); Codex сожмёт сам`);
    }
  };
  k.slushat(async (method, p) => {
    if (threadId && p.threadId && p.threadId !== threadId) return;
    if (podmena && method !== 'turn/completed') return;
    if (method === 'turn/started') { remoteActiveTurn = p.turn?.id ?? p.turnId ?? remoteActiveTurn; return; }
    if (method === 'model/rerouted') {
      const prichina = poBelomu(p.reason ?? null, 'prichina');
      podmena = { from: poBelomu(p.fromModel ?? '?', 'model'), to: poBelomu(p.toModel ?? '?', 'model'), prichina };
      log(`[codex-app-server] 🔴 МОДЕЛЬ ПОДМЕНЕНА СЕРВЕРОМ: model/rerouted ${podmena.from} → ${podmena.to} (${prichina}) — ход обрываю (model-route-mismatch)`);
      await prervatPodmenu();
      return;
    }
    if (method === 'thread/tokenUsage/updated') {
      const z = p.tokenUsage?.last?.inputTokens;
      if (Number.isSafeInteger(z)) {
        zanyato = z;
        if (!vzveden && !steerPoslan && !granicaIstekla && P !== undefined && z >= P) {
          vzveden = true; vzvedenV = Date.now();
          log(`[codex-app-server] порог платформы достигнут: занято ${z} ≥ ${P} — стоп взведён, жду безопасную границу (item/completed)`);
        }
      }
    } else if (method === 'item/completed') {
      const it = p.item ?? {};
      if (it.type === 'agentMessage') polozhit({ type: 'text', text: it.text ?? '' });
      else if (it.type === 'reasoning') polozhit({ type: 'thinking', text: [].concat(it.summary ?? [], it.content ?? []).map((x) => (typeof x === 'string' ? x : x?.text ?? '')).join('\n') });
      else if (it.type === 'commandExecution') polozhit({ type: 'tool', name: 'shell', brief: String(it.command ?? '').slice(0, 120) });
      else if (it.type === 'mcpToolCall') polozhit({ type: 'tool', name: it.tool ?? it.server ?? 'mcp', brief: '' });
      else if (it.type === 'contextCompaction') { if (steerPoslan) samPosleSteer = true; } if (it.type === 'contextCompaction') log(`[codex-app-server] Codex СЖАЛ САМ внутри хода (contextCompaction)${steerPoslan ? ' — ПОСЛЕ нашего стопа' : ''}`);
      if (vzveden && !steerPoslan && turnId && !userStop) {
        steerPoslan = true; vzveden = false; steerV = Date.now();
        try {
          const expectedThread = threadId, expectedTurn = turnId;
          const reply = await serialSteer(() => {
            if(userStop||controlClosed||zaversheno||registerTaskControl?.closed?.()||remoteActiveTurn!==expectedTurn)throw Error('pressure: stopped or changed request');
            safeLog('[codex-app-server] pressure RPC begin: turn/steer; thread='
              + poBelomu(expectedThread, 'id') + '; expected_turn=' + poBelomu(expectedTurn, 'id'));
            const pending=k.zapros('turn/steer', { threadId: expectedThread, expectedTurnId: expectedTurn,
              input: [{ type: 'text', text: typeof tekstSignala === 'function' ? tekstSignala(zanyato) : tekstSignala }] });
            safeLog('[codex-app-server] steer отправлен; занято=' + zanyato + '; порог=' + P);
            return pending;
          });
          armPressureWatch(expectedThread, expectedTurn, reply);
        } catch (e) {
          log(`[codex-app-server] 🔴 turn/steer ОТКАЗАН: ${e.message} — стоп не состоялся и в этом ходе больше не взводится; ход идёт дальше, Codex сожмёт сам`);
          steerPoslan = false; steerV = null; granicaIstekla = true;
        }
      }
    } else if (method === 'turn/completed') {
      const completedTurn = p.turn?.id ?? p.turnId;
      appCompletionBound = completedTurn && turnId ? completedTurn === turnId : null;
      safeLog('[codex-app-server] turn/completed observed: bound=' + appCompletionBound
        + '; turn=' + poBelomu(completedTurn, 'id') + '; status=' + poBelomu(p.turn?.status, 'status'));
      // B-N-1536 r2 (У1 Вениамина): ЗАКРЫТИЕ ХОДА и ДОКАЗАТЕЛЬСТВО для stop/replace разведены.
      // (а) Закрытие — как в 1.4.36: любое turn/completed СВОЕЙ нити закрывает ход (turnId задаёт только ответ turn/start;
      //     событие с иным id в той же нити ход НЕ подвешивает), несовпадение id — в журнал.
      // (б) Доказательство terminal — только точный id: несовпадение или ранний без пары = proof unknown → HOLD у stop/replace.
      if (typeof p.threadId === 'string' && threadId && p.threadId !== threadId) {
        safeLog('[codex-app-server] turn/completed ЧУЖОЙ нити ' + poBelomu(p.threadId, 'id') + ' — ход не закрывает');
        return;
      }
      if (!turnId) { if (typeof completedTurn === 'string' && earlyTerminals.size < 8) earlyTerminals.set(completedTurn, true); }
      else if (completedTurn !== turnId) safeLog('[codex-app-server] turn/completed с id ' + poBelomu(completedTurn, 'id')
        + ' ≠ ход ' + poBelomu(turnId, 'id') + ' — ход ЗАКРЫТ, доказательства terminal для stop/replace НЕТ (unknown → HOLD)');
      terminalExact = Boolean(turnId) && completedTurn === turnId;
      zaversheno = p.turn ?? {}; polozhit(null);
    }
  });
  try {
    await k.zapros('initialize', { clientInfo: { name: 'subscription-gateway', version: clientVersion } });
    k.uvedomit('initialized');
    const nastrojki = { ...(cwd ? { cwd } : {}), ...(model ? { model } : {}), ...(sandbox ? { sandbox } : {}), approvalPolicy: 'never', ...(config ? { config } : {}) };
    const t = sessiya ? await k.zapros('thread/resume', { threadId: sessiya, ...nastrojki }) : await k.zapros('thread/start', nastrojki);
    threadId = t?.thread?.id;
    if (!threadId) throw new Error('app-server не вернул id нити');
    if (poBelomu(threadId, 'id') !== threadId) throw new Error(`app-server вернул id нити не по белому списку формы: ${poBelomu(threadId, 'id')}`);
    onThread?.(threadId);
    const r = await k.zapros('turn/start', { threadId, input: [{ type: 'text', text: zapros }], ...(effort ? { effort } : {}) });
    turnId = r?.turn?.id ?? null; remoteActiveTurn ??= turnId;
    if (turnId && earlyTerminals.has(turnId)) terminalExact = true;   // (б) ранний terminal того же id — доказательство; иной — закрыл ход без доказательства
    earlyTerminals.clear();
    if (turnId && !podmena && registerTaskControl) unregisterTaskControl = registerTaskControl(async (packet) => {

      if (controlClosed || zaversheno || podmena) return {accepted:false};
      const expected = turnId;
      if (['stop','stop-exact'].includes(packet.op)) {
        userStop = true;
        const reply = await k.zapros('turn/interrupt', {threadId,turnId:expected});
        if (!reply || typeof reply !== 'object' || Array.isArray(reply) || turnId !== expected || podmena) throw Error('stop: invalid interrupt ACK');
        log(`[codex-app-server] /stop interrupt принят: control ${packet.binding.control_id}, нить ${threadId}, ход ${expected}; окончание исполнения не утверждается`);
        return {accepted:true,operation:packet.op,codex:{thread_id:threadId,turn_id:expected},model_response:'unknown'};
      }
      if (packet.op === 'message') {
        let provenance;
        try { provenance = parseInboxPayload(packet).provenance; }
        catch {
          safeLog('[codex-app-server] inbox: живой ввод ОТКАЗАН: invalid-user-input');
          inputEvent(packet,'not-offered','codex-steer','invalid-user-input');
          return {accepted:false,input_state:'not-offered'};
        }
        if (provenance.verified !== true) {
          safeLog('[codex-app-server] inbox: живой ввод ОТКАЗАН: signature-unverified');
          inputEvent(packet,'not-offered','codex-steer','signature-unverified');
          return {accepted:false,input_state:'not-offered'};
        }
        let frame; try { frame = renderInboxFrame(packet); } catch { inputEvent(packet,'not-offered'); return {accepted:false,input_state:'not-offered'}; }
        if(messageCount>=MAX_PENDING_INPUTS){inputEvent(packet,'not-offered');return{accepted:false,input_state:'not-offered'};}messageCount++;
        return serialSteer(async () => {
          try{
          if (registerTaskControl?.closed?.() || controlClosed || zaversheno || podmena || userStop || steerPoslan || remoteActiveTurn !== expected) {
            inputEvent(packet,'not-offered'); return {accepted:false,input_state:'not-offered'};
          }
          const reply = await k.zapros('turn/steer', {threadId,expectedTurnId:expected,
            clientUserMessageId:JSON.parse(packet.body).message.id,input:[{type:'text',text:frame}]});
          if (reply?.turnId !== expected) throw Error('inbox: RPC outcome is not bound to the expected turn');
          inputEvent(packet,'offered');
          return {accepted:true,input_state:'offered',codex:{thread_id:threadId,turn_id:expected},model_response:'unknown'};
          }finally{messageCount--;}
        });
      }
      if (packet.op !== 'cancel'||userStop) return {accepted:false};
      const reply = await serialSteer(() => {
        if(userStop||controlClosed||zaversheno||registerTaskControl?.closed?.()||remoteActiveTurn!==expected)return null;
        return k.zapros('turn/steer', {threadId, expectedTurnId:expected, input:[{type:'text',text:
        `[task-control/1 cancel · ${packet.binding.control_id} · target ${packet.binding.target_receipt}]\n${packet.body}\nОтветь по этому ID: принято / поздно, уже сделано / частично; назови остаток. Квитанция транспорта не означает исполнения.`}]});
      });
      if(reply===null)return{accepted:false};
      if (controlClosed || zaversheno || podmena || turnId !== expected || reply?.turnId !== expected) throw Error('task-control: ACK not bound to active turn');
      return {accepted:true, codex:{thread_id:threadId,turn_id:expected}, model_response:'unknown'};
    },{thread_id:threadId,turn_id:turnId});
    if (podmena) await prervatPodmenu();
    log(`[codex-app-server] ход начат: нить ${threadId}${sessiya ? ' (продолжение)' : ' (новая)'}, ход ${turnId} · порог платформы ${P ?? 'НЕ ПРОЧИТАН: ' + (porog?.prichina ?? '?')}`);
    taimer = setInterval(proverkaPredelov, Math.max(100, Math.min(5000, Math.floor(Math.min(predelGranicyMs, predelZaversheniyaMs) / 4)))); taimer.unref?.();
    k.umer.then(() => polozhit(null));
    for (;;) {
      while (ochered.length && !podmena) { const e = ochered.shift(); if (e !== null) yield e; }
      if (podmena) throw new Error(`модель подменена сервером: ${podmena.from} → ${podmena.to} (${podmena.prichina}) — ход оборван шлюзом (model-route-mismatch)`);
      if (zaversheno) break;
      const kon = await Promise.race([new Promise((r2) => { budit = r2; }), k.umer.then((x) => ({ umer: x }))]);
      if (kon?.umer && !zaversheno && !ochered.length) throw new Error(`app-server завершился посреди хода (${JSON.stringify(kon.umer)})`);
    }
    const st = zaversheno.status;
    if(!terminalExact&&registerTaskControl)safeLog('[codex-app-server] ход закрыт без точного terminal — stop/replace получат unknown (HOLD)');
    if(terminalExact&&['completed','interrupted','failed'].includes(st))registerTaskControl?.terminal?.({thread_id:threadId,turn_id:turnId,status:st,proof:'codex-turn/completed'});
    if (st === 'failed') throw new Error(String(zaversheno.error?.message ?? 'ход Codex failed без текста'));
    if (st !== 'completed') log(`[codex-app-server] ⚠️ ход закончен со статусом «${poBelomu(st, 'status')}»`);

    proverkaPredelov();
    const ostanovlenShlyuzom = pressureAccepted && !userStop && st === 'completed' && !predelIstek && !samPosleSteer;
    yield { type: 'usage', syroj: { input_tokens: zanyato ?? 0, output_tokens: 0 }, sessiya: threadId };
    yield { type: 'itog-app-server', ostanovlenShlyuzom, zanyato, porog: P, sessiya: threadId, status: st };
  } finally {
    controlClosed = true;
    unregisterTaskControl?.();
    if (taimer) clearInterval(taimer);
    closeStarted = true;
    if (steerPoslan) safeLog('[codex-app-server] local close begin after soft-stop');
    let closeResolved = false;
    try {
      await k.zakryt();
      closeResolved = true;
      if (steerPoslan) safeLog('[codex-app-server] local close resolved after soft-stop');
    } finally {
      fullyClosed = true;
      if (pressureTimer) clearTimeout(pressureTimer);
      if (pressureWatch?.warned) safeLog(closeResolved
        ? '[codex-app-server] STOP_WAIT_CLOSED: локальное ожидание закончено; platform turn/end не подтверждён'
        : '[codex-app-server] STOP_WAIT_ABORTED: локальное ожидание оборвано ошибкой; закрытие app-server не подтверждено');
    }
  }
}

// RU: tekstProdolzheniya: JSON-RPC дочерний Codex app-server позволяет steer и явный stop точного thread/turn. Давление использует steer, Telegram stop — interrupt; подмена модели обнаруживается по уведомлению и не отзывает уже выданный текст.
// EN: tekstProdolzheniya: A child Codex app-server JSON-RPC connection supports steering and explicit stopping of the exact thread/turn. Pressure uses steering; Telegram stop interrupts. Model rerouting is detected by notification and cannot retract text already emitted.
export function tekstProdolzheniya({ zanyato, porog }) {
  return `[шлюз Codex · продолжение после стопа] Steer принят; прошлый ход завершён `
    + `(занято ${zanyato ?? '?'} ≥ ${porog ?? '?'}); сжатие этим письмом не подтверждено. ПРОДОЛЖАЙ прерванную задачу с того места, где остановился, `
    + `— сперва перечитай файл состояния с диска, путь к нему указан в промежуточном ответе прошлого хода. `
    + `Если до стопа работали помощники (подагенты) — подними их заново по файлу состояния и продолжи их незаконченные задачи. `
    + `Стоп по давлению — не конец задачи. Не начинай заново и не переспрашивай.`;
}
