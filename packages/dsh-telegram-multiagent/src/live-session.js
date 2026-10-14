// RU: Заимствует уже живой агент без открытия второго writer его журнала. Проверяет ожидаемую идентичность/cwd и наблюдает прежние события; заимствование не передаёт владение уничтожением чужого агента.
// EN: Borrows an existing live agent without opening a second log writer. Validates identity/cwd and observes prior events; borrowing does not transfer responsibility for destroying the original agent.
import path from 'node:path';
import {assertReceiptSession} from './receipt-session.js';


export // RU: borrowLiveSession: Заимствует уже живой агент без открытия второго writer его журнала. Проверяет ожидаемую идентичность/cwd и наблюдает прежние события; заимствование не передаёт владение уничтожением чужого агента.
// EN: borrowLiveSession: Borrows an existing live agent without opening a second log writer. Validates identity/cwd and observes prior events; borrowing does not transfer responsibility for destroying the original agent.
function borrowLiveSession(agents, sessionId, cwd, runtime, receipt) {
  const agent = agents?.get?.(sessionId);
  if (!agent) return undefined;
  if (agent.session?.id !== sessionId || agent.session.header?.origin === 'subagent' || !agents.roots?.().includes(agent))
    throw Error(`session ${sessionId}: канал принимает только живого корневого (root) агента`);
  const actual = agent.session.header?.cwd;
  if (typeof cwd !== 'string' || !path.isAbsolute(cwd) || typeof actual !== 'string'
      || !path.isAbsolute(actual) || path.resolve(cwd) !== path.resolve(actual))
    throw Error(`session ${sessionId}: cwd ${actual ?? 'НЕ УСТАНОВЛЕН'} не совпадает с ${cwd}`);
  if (receipt) assertReceiptSession(receipt, agent.session);
  runtime.install(agent.ctx);
  return {agent, borrowed:true};
}
