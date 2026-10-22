#!/usr/bin/python3 -B
"""Read-only secondary guard: читает таблицу dsh-limity на sadik (mode=ro), данных не пишет и ни к кому не ходит.
SQLite-читатель базы в WAL может создать рядом служебные limity.db-wal/-shm (root, пустые) — их убирает следующий проход dsh-limity.

B-N-1776 такт 4 (07.10.2026): источник — /var/lib/dsh-limity/limity.db (единственный писатель — dsh-limity); ssh к aclaude
(limity-read) снят. Правило свежести (Вениамин 07.10 19:24 МСК) — формулами в /etc/default/pereklyuchatel-podpiski-limity,
чисел правила в коде нет. Окна five_hour и seven_day; по каждому — последний ИЗМЕРЕННЫЙ замер (izmereno=1): более новая
строка «не измерено» не прячет отказ, сброс которого ещё не прошёл.
B-N-1806 (16.10.2026, Заря): доля 0 без сброса — окно НЕ НАЧАТО (его никто не тратил; сервер сброса не даёт), а не «сброс
неизвестен»: простаивающая подписка иначе не бывает «свободной» ни при какой частоте замера (база 16.10: все 341 строк five_hour
izmereno=1 с пустым сбросом — с долей 0). Возраст замера судится как прежде.
ЧЕГО НЕ ЛОВИТ: окна seven_day_opus/seven_day_sonnet/overage не судятся · расход между замерами (только следующим замером) ·
простаивающая подписка без замеров — «не измерено» по построению (переход только force).
Выход: «free|blocked|unknown<TAB>причина»; коды 0 / 10 / 20.
"""
import argparse
from datetime import datetime, timezone
import re
import sqlite3
import time

BAZA = '/var/lib/dsh-limity/limity.db'
NASTROJKA = '/etc/default/pereklyuchatel-podpiski-limity'
KLYUCHI = ('ISCHERPANA_DOLYA_OT', 'SVOBODNA_5CH_DOLYA_MENSHE', 'SVOBODNA_5CH_VOZRAST_MIN',
           'SVOBODNA_7D_DOLYA_MENSHE', 'SVOBODNA_7D_VOZRAST_MIN')
FORMULA = re.compile(r'\d+(?:\.\d+)?(?:\*\d+(?:\.\d+)?)*')


def nastrojka(put):
    """Файл KEY=формула → dict; любое отклонение — ValueError (неизвестное ведёт в «не измерено»)."""
    znach = {}
    with open(put, encoding='utf-8') as f:
        for n, stroka in enumerate(f, 1):
            stroka = stroka.strip()
            if not stroka or stroka.startswith('#'):
                continue
            k, _, v = stroka.partition('=')
            k, v = k.strip(), v.strip()
            if k not in KLYUCHI or k in znach:
                raise ValueError(f'настройка: строка {n}: ключ «{k[:40]}» чужой или повтор')
            if not FORMULA.fullmatch(v):
                raise ValueError(f'настройка: {k}: значение не по форме (число или произведение)')
            x = 1.0
            for mn in v.split('*'):
                x *= float(mn)
            znach[k] = x
    net = [k for k in KLYUCHI if k not in znach]
    if net:
        raise ValueError('настройка: нет ключей ' + ' '.join(net))
    if not all(0 < znach[k] <= 1.5 for k in KLYUCHI if 'DOLYA' in k) or not all(znach[k] > 0 for k in KLYUCHI if 'VOZRAST' in k):
        raise ValueError('настройка: доля вне (0, 1.5] или возраст не больше 0')
    return znach


def utc(t):
    return datetime.fromtimestamp(t, timezone.utc).strftime('%Y-%m-%d %H:%M:%S UTC')


def okno(db, podpiska, imya):
    return db.execute('SELECT moment_utc, dolya, sbros_utc, status FROM zamer WHERE provajder=? AND podpiska=? AND okno=?'
                      ' AND izmereno=1 ORDER BY moment_utc DESC LIMIT 1', ('claude', podpiska, imya)).fetchone()


def classify(db, podpiska, p, now):
    blocked, svobodno, detail = [], 0, []
    for imya, metka, porog, vozrast_min in (
            ('five_hour', '5ч', p['SVOBODNA_5CH_DOLYA_MENSHE'], p['SVOBODNA_5CH_VOZRAST_MIN']),
            ('seven_day', 'неделя', p['SVOBODNA_7D_DOLYA_MENSHE'], p['SVOBODNA_7D_VOZRAST_MIN'])):
        r = okno(db, podpiska, imya)
        if r is None:
            detail.append(f'{metka} — замеров нет')
            continue
        moment, dolya, sbros, status = r
        minut = int((now - moment) // 60)
        posl = f'{metka} — последнее {dolya}{" " + status if status else ""} {minut} мин назад'
        if moment > now + 120:
            detail.append(posl + ' (замер в будущем)')
            continue
        ne_nachato = sbros is None and dolya == 0 and status != 'rejected'
        if sbros is None and not ne_nachato:
            detail.append(posl + ' (сброс неизвестен)')
            continue
        if not ne_nachato and sbros <= now:
            detail.append(posl + f' (сброс {utc(sbros)} прошёл — замер о прошлом окне)')
            continue
        if status == 'rejected' or dolya >= p['ISCHERPANA_DOLYA_OT']:
            blocked.append(f'{metka} ({status or "доля"} {dolya}, сброс {utc(sbros)}, замер {minut} мин назад)')
            continue
        if dolya < porog and now - moment <= vozrast_min * 60:
            svobodno += 1
            detail.append(f'{metka} {dolya}{" окно не начато" if ne_nachato else ""} ({minut} мин назад)')
            continue
        detail.append(posl + f' (свободна при доле <{porog:g} и возрасте ≤{vozrast_min:g} мин)')
    if blocked:
        return 'blocked', 'исчерпана: ' + '; '.join(blocked)
    if svobodno == 2:
        return 'free', 'свободна: ' + ', '.join(detail)
    return 'unknown', 'не измерено: ' + '; '.join(detail)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('subscription', choices=['1', '2', '3'])
    parser.add_argument('--baza', default=BAZA, help='таблица dsh-limity (для проб — подставная)')
    parser.add_argument('--nastrojka', default=NASTROJKA, help='правило свежести (для проб — подставное)')
    args = parser.parse_args()
    try:
        p = nastrojka(args.nastrojka)
        db = sqlite3.connect(f'file:{args.baza}?mode=ro', uri=True, timeout=5)
        try:
            status, reason = classify(db, int(args.subscription), p, time.time())
        finally:
            db.close()
    except FileNotFoundError as error:
        status, reason = 'unknown', f'не измерено: нет файла {error.filename}'
    except PermissionError as error:
        status, reason = 'unknown', f'не измерено: нет доступа к {error.filename}'
    except sqlite3.Error as error:
        status, reason = 'unknown', 'не измерено: таблица dsh-limity не прочитана (' + str(error)[:120] + ')'
    except (OSError, ValueError, TypeError) as error:
        status, reason = 'unknown', 'не измерено: ' + str(error).replace('\n', ' ')[:200]
    print(status + '\t' + reason)
    return {'free': 0, 'blocked': 10, 'unknown': 20}[status]


if __name__ == '__main__':
    raise SystemExit(main())
