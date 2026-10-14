# Источник socseti для social-стенда

`stend-social-dispatch.mjs` использует настоящий Store и test/approval-fixture.mjs из пакета socseti. Источник задаётся явно `SOCSETI_TEST_ROOT=/absolute/dsh-socseti`; отсутствие переменной, относительный путь или недоступный источник дают СЛЕПОТА с кодом2, а не зелёный результат. Ошибки поведения и синтаксиса сохраняют отказ.

Для установленной раскладки строка SREDA_STENDOV в обходчике:

```text
/opt/agent-plugins/dsh-telegram-multiagent/test/stend-social-dispatch.mjs SOCSETI_TEST_ROOT=/opt/iskra/workspace/dsh-plugins/packages/dsh-socseti
```

Сам канал уже находится в области автоматического обнаружения стендов; добавляется среда именно для установленного пути. Дерево socseti должно содержать принятый парный пакет; пример локального прогона:

```sh
SOCSETI_TEST_ROOT=/absolute/dsh-socseti DSH_TEST_APP=/absolute/fixture-app node /absolute/dsh-telegram-multiagent/test/stend-social-dispatch.mjs
```

Стенд проверяет local Store → fake private HTTP → actual native session/receipt → ACK. Живые Telegram/ВК/модель не вызывает. Ключи/owner-reader задаёт изолированная fixture, право root требуется только для настройки её прав. Монтаж строки обхода выполняет назначенная рука вместе с парой пакетов. Без этой строки установленный standalone стенд честно слеп, его нельзя выдавать за выполненную интеграционную проверку.
