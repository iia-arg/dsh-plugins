# Операции ostrov_api

Модель задаёт только operation/params. Context, route, идентификаторы текущего хода, ключ и requestKey назначает код. Доступность новых CRM-вызовов проверяется по реальному каталогу и ответам API; текст скилла не включает их сам. Гостевой Site/TG не превращается в staff-private. На сайте разрешены только catalog/objects/quote; остальные строки таблицы относятся к Telegram.

| operation | params | результат / доступ |
|---|---|---|
| catalog | {} | Живые тарифы, правила, resources, version |
| objects | {id?} | Объекты |
| quote | {kind,plan} | total/lines/warnings; ничего не сохраняет |
| identity | {} | guest либо подтверждённые role/name/staffId |
| staff.list | {direction?,offset?} | employees/hasMore/defaultResponsible, рабочие контакты |
| staff.read | {id} | Рабочая карточка; служебные поля только сотруднику |
| client.read | {id?} | Своя карточка/null; id только сотруднику |
| client.save | {id?,profile,version} | Своя карточка; id только сотруднику для гостя |
| client.list | {query?,offset?} | Только сотрудник; поиск гостей |
| client.create | {profile} | Только сотрудник; новая карточка гостя |
| plan.list | {clientId?,offset?} | Свои расчёты; clientId только сотруднику |
| plan.create | {kind,plan,catalogVersion,clientId? или clientProfile?} | D; режимы в crm.md |
| plan.read | {kind,id} | D по секретной ссылке; прежний gate также требует planWritesEnabled |
| plan.edit | {kind,id,documentVersion,plan,catalogVersion} | Новый D с прежней url |
| plan.connections | {kind,id} | Только сотрудник; client/responsible |
| plan.link | {kind,id,documentVersion,clientId,clientVersion} | Только сотрудник; {linked:true}, затем отдельное чтение |
| client.assign | {id,version,staffId} | Только сотрудник; новый ответственный у клиента и всех документов |

kind=group/biggroup/resident. D содержит id/kind/url/documentVersion/catalogVersion/state/editable/plan/quote/updatedAt. documentVersion — непрозрачная строка из read, catalogVersion — число свежего catalog/quote. Поля profile и права — [crm.md](crm.md); поля планов — [plans.md](plans.md).

Ответ SDK: `{ok,operation,route,role,result}`. Для сохранённого PDF telegram_make_pdf принимает `{result:D,guestName,letterhead?}` с полным D из поля result. Для несохранённого quote — `{kind,quote:Q,guestName,letterhead?}`, где Q — поле result. Ровно одно result/quote. D.url печатается постоянной ссылкой, после edit нужен новый PDF. Бланки не меняй. Генерация и отправка PDF зависят от отдельного реального каталога текущего канала: Telegram-инструмент не доказывает возможность отправки на сайт.

400 с понятной ошибкой валидации — исправить ввод; не считать один код доказательством отсутствия записи или исхода прежнего оборвавшегося запроса;403 — не повышать права;404 — неизвестно/архив;409 — перечитать;413 — размер;5xx/обрыв — исход не установлен, без автоматического повтора. Повтор одного входа и данных управляется прежним ключом кода, не создаёт копию. application.*, CONFIRM, удаление, редактирование учёток и создание брони не разрешены.
