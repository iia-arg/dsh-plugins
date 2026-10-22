# Общая документация RU+EN · Shared RU+EN documentation

Полный README теперь содержит русский абзац и сразу его английский эквивалент. Этот файл оставлен как совместимая ссылка; две расходящиеся версии не поддерживаются.
The full README now pairs every Russian paragraph with its English equivalent immediately after it. This file remains as a compatibility link; two diverging language versions are not maintained.

[README RU+EN](README.md) · [Настройки · Settings](docs/SETTINGS.md) · [Устройство · Architecture](docs/ARCHITECTURE.md).


Обычный A2A-вход посреди SDK-хода, состояния и пределы: [LIVE-INPUT.md](LIVE-INPUT.md).

Ordinary mid-turn A2A input, delivery stages, and bounds: [LIVE-INPUT.md](LIVE-INPUT.md).


## Child capture · кандидат 3.1.9

субагенты глубже первого уровня и завершившиеся после закрытия наблюдения — не считаются: строка участника помечается неполной

Loaded version witness: Codex — initialize.userAgent запущенного app-server; Claude — system/init CLI и кэш первой загрузки SDK. Общий source_version/sv1; ID-only lifecycle, без текстов/paths/SDK total_tokens. Поддержанные пары закреплены child-source-versions.json; неизвестные дают CHILD_INCOMPLETE.

Свидетель SDK фиксирует версию из package.json при первой загрузке и SHA256 входного файла SDK, сверенный до и после import. Он не аттестует всё дерево модулей и транзитивных зависимостей.

Кандидат вводит новые G kinds. Порядок окна: сначала AP-читатель с поддержкой общего wire ab58161a и manifest, затем этот шлюз. Выпуск шлюза не раньше AP. Живые подписочные канарейки остаются условием окна выпуска; здесь только копийные пробы.
