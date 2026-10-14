// RU: Для telegram-site-* фильтрует ToolRuntime.view до pismo_rukovoditelyu, включая поздние локальные регистрации. Schemas/get/execute используют один view, внешний descriptor проверяется отдельно; exact check остаётся fail-closed. Wrapper живёт с tools service, смена политики требует restart.
// EN: Filters ToolRuntime.view for telegram-site-* to pismo_rukovoditelyu, including late local registrations. Schemas/get/execute share the view; external descriptors are verified independently and the exact check stays fail-closed. The wrapper follows service lifetime; policy changes require restart.

const POLICY=Symbol.for('dsh-telegram-multiagent.site-policy');
export const SITE_TOOLS=Object.freeze(['pismo_rukovoditelyu']);
// B-N-1644: чтение СВОЕЙ памяти гостем (только помеченное «для гостей», dsh-pamyat-omega gostyam) — допустимо, но не обязательно:
// B-N-1825: ostrov_api также опционален; caller ограничивает Site операциями catalog/objects/quote.
// Отсутствие опционального API не скрывает доступную память. Лишнее имя — по-прежнему отказ.
export const SITE_TOOLS_DOPUSTIMYE=Object.freeze(['pamyat_dlya_gostej','ostrov_api']);
const RAZRESHENO=new Set([...SITE_TOOLS,...SITE_TOOLS_DOPUSTIMYE]);
export const TG_GUEST_TOOLS=Object.freeze(['telegram_send_file','telegram_make_pdf','ostrov_api']);
const namesFor=session=>String(session?.id??'').startsWith('telegram-gost-')
  ?new Set([...RAZRESHENO,...TG_GUEST_TOOLS]):RAZRESHENO;
export function naborGostyaGoden(names,session){const allowed=namesFor(session);return SITE_TOOLS.every(n=>names.includes(n))&&names.every(n=>allowed.has(n));}
// B-N-1642: гость открытого Telegram-бота ограничен так же, как посетитель сайта.
export const OGRANICHENNYE_SESSII=Object.freeze(['telegram-site-','telegram-gost-']);
export // RU: checkSiteBridge: Сравнивает внешний descriptor с точным разрешённым списком до модели; не заменяет execution guard моста.
// EN: checkSiteBridge: Checks the external descriptor against the exact approved list before model execution; does not replace bridge execution guards.
function checkSiteBridge(ctx,agent){
  const descriptor=ctx.get('mcpBridge')?.descriptor?.(agent.id);
  const names=descriptor?.tools?.map(x=>x.name).sort();
  if(!Array.isArray(names)||!naborGostyaGoden(names,agent.session))throw Error('Site bridge capability list differs or bridge unavailable');
}


const VIEW_FILTER=Symbol.for('dsh-telegram-multiagent.site-tool-view');
export // RU: filterSiteToolView: Для telegram-site-* фильтрует ToolRuntime.view до pismo_rukovoditelyu, включая поздние локальные регистрации. Schemas/get/execute используют один view, внешний descriptor проверяется отдельно; exact check остаётся fail-closed. Wrapper живёт с tools service, смена политики требует restart.
// EN: filterSiteToolView: Filters ToolRuntime.view for telegram-site-* to pismo_rukovoditelyu, including late local registrations. Schemas/get/execute share the view; external descriptors are verified independently and the exact check stays fail-closed. The wrapper follows service lifetime; policy changes require restart.
function filterSiteToolView(tools){
  if(tools[VIEW_FILTER])return;
  if(typeof tools.view!=='function')throw Error('Site tool view filtering unavailable');
  const original=tools.view;
  tools.view=function(scope){
    const view=original.call(this,scope);
    if(!OGRANICHENNYE_SESSII.some(p=>String(scope?.session?.id??'').startsWith(p)))return view;
    return {...view,visible:new Map([...view.visible].filter(([name])=>namesFor(scope.session).has(name)))};
  };
  Object.defineProperty(tools,VIEW_FILTER,{value:true});
}
export // RU: installSitePolicy: Ставит native view/guard/check в scope агента; при remount обновляет callback, не дублирует регистрации.
// EN: installSitePolicy: Installs agent-scoped native view/guard/check; remount replaces callbacks instead of duplicating registrations.
function installSitePolicy(ctx,agent,{closed}){
  if(agent[POLICY]){agent[POLICY].closed=closed;agent[POLICY].check();return;}
  const state={closed};
  const isClosed=()=>state.closed();
  const tools=ctx.get('tools');
  if(!tools?.restrict||!tools?.guard)throw Error('Site tool isolation unavailable');
  filterSiteToolView(tools);
  tools.presentAs('native');
  // B-N-1644: restrict отказывает на ещё не зарегистрированном имени. Нет pamyat_dlya_gostej (агент без настройки памяти гостю,
  // или инструмент поднимется позже) — ограничение прежнее, ровно SITE_TOOLS; поздний инструмент этой беседе не виден (в закрытую).
  const permitted=namesFor(agent.session);
  // restrict masks global tools; TG file/PDF are scope-local registrations.
  const globals=[...permitted].filter(name=>tools.view(agent).restrictableNames.has(name));
  try{tools.restrict({allow:globals});}catch{tools.restrict({allow:SITE_TOOLS});}
  tools.guard(exec=>!permitted.has(exec.name)?'Инструмент недоступен гостю (сайт или открытый Telegram-бот)':isClosed()?'Приём сайта закрыт':undefined);
  const check=()=>{
    const names=tools.wireSchemas(agent).schemas.map(x=>x.name).sort();
    if(!naborGostyaGoden(names,agent.session))throw Error('Site tool set differs from approved list: '+names.join(','));
  };
  check();
  state.check=check;Object.defineProperty(agent,POLICY,{value:state});
  ctx.on('agent/pre-step',async(_,next)=>{if(isClosed())throw Error('Site closed');check();checkSiteBridge(ctx,agent);return next();});
}
