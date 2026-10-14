// RU: Формирует явный отказ /new по доступности/занятости, не производя ротацию или отмену. Текст описывает уже проверенное состояние, не обещает будущий успех.
// EN: Produces an explicit /new refusal from capability/busy state without rotating or cancelling. Reports observed state rather than promising future success.


export // RU: newSessionRefusal: Описывает отказ смены поколения по capability/busy без побочных эффектов.
// EN: newSessionRefusal: Describes capability/busy rotation refusal without side effects.
function newSessionRefusal({agent}) {
  if(!agent||!['idle','running'].includes(agent.status))return 'Отказ /new: не удалось проверить состояние агента. Сессия не изменена.';
  if(agent.status==='running')return 'Отказ /new: идёт ход — сначала /stop, потом /new. Сессия не изменена.';
  return null;
}
