// RU: B-N-1642: имена решений о беседе (marshrutChata, presetDlya, …) для функций, вырезанных из src/index.js в контекст подставы.
//     Берутся из настоящей marshrutyGostya по настройке, белому списку и группам самой подставы; уже заданные имена не трогаются.
// EN: B-N-1642: conversation-decision names for functions cut from src/index.js, built from the real marshrutyGostya using the harness config.
import { marshrutyGostya } from '../src/guest-channel.js';
export function sGostem(c) {
  if (!c || typeof c !== 'object') return c;
  if (!Object.hasOwn(c, 'autopilot')) c.autopilot = null;
  const allowed = c.allowed instanceof Set ? c.allowed : new Set(Array.isArray(c.allowed) ? c.allowed.map(Number) : []);
  const imena = marshrutyGostya(c.config ?? {}, { allowed, groups: () => (typeof c.settings === 'function' ? c.settings()?.groups : undefined),
    mergeChat: () => c.MERGE_CHAT ?? null, a2aChat: () => c.A2A_CHAT ?? 'a2a' });
  for (const [k, v] of Object.entries(imena)) if (!Object.hasOwn(c, k)) c[k] = v;
  return c;
}
