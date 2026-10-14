#!/usr/bin/env python3
# -*- coding: utf-8 -*-
#
# 🔴 ГРАНИЦА СЛОВА «ДОСТАВЛЕНО» (вписано 06.09.2026 узлом машины с санкции координатора).
# Отправителю «доставлено: <путь>» означает «ПОЛОЖЕНО В ОЧЕРЕДЬ», а НЕ «принято читателем».
# Разрыв до 5 секунд штатный (такт почтальона); при сбое смены владельца — больше.
# Замер аудитора 04.09: положено 08:54:44Z -> читатель EACCES 08:54:48 -> перенос 08:54:49
# -> принято 08:55:19. Задержка 35 секунд, потери не было, а отправителю всё это время
# печаталось «доставлено».
# ⚠️ Поэтому: увидев «доставлено» и молчание получателя, НЕ ищите дефект в получателе.
# Сначала посмотрите, дошло ли письмо до его ящика и сменился ли владелец.
"""
ПОЧТАЛЬОН ШИНЫ A2A — переносит письма в собственность получателя.

ЗАЧЕМ ОН ЕСТЬ (замерено 29.08.2026, отчёт 97):
Отправитель может ПОЛОЖИТЬ письмо в чужой ящик (право w на каталоге), но не может
дать получателю право ЧИТАТЬ его: права на файл раздаёт владелец файла, то есть сам
отправитель, а получатель ему никто. Перебраны все четыре формы прав письма — ни одна
не даёт «читает только получатель». Это ограничение модели Unix, а не наша настройка.
Значит нужен третий, у кого есть право сменить владельца, — root. Это и есть почтальон.

ЧТО ОН ДЕЛАЕТ
Обходит ящики /var/spool/a2a/<агент>/ и для каждого письма, чей владелец не совпадает
с владельцем ящика, ПЕРЕПИСЫВАЕТ содержимое в новый файл, принадлежащий получателю,
режим 0600, и заменяет им исходник одной атомарной операцией.
После успешного переноса он говорит ПОЛУЧАТЕЛЮ в его личный чат с владельцем:
«← от такого-то: …». Так владелец видит переписку агентов, даже если сам агент
спит или сломан — видимость не зависит от исправности того, кого она касается.

🔴 ПОЧЕМУ ПЕРЕПИСЫВАЕТ, А НЕ МЕНЯЕТ ВЛАДЕЛЬЦА ИСХОДНИКА
Смена владельца оставила бы отправителю открытый дескриптор на тот же inode: он мог бы
переписать содержимое ПОСЛЕ проверки, и получатель прочёл бы не то, что проверялось.
Копия рвёт эту связь — у нового файла другой inode, и отправитель к нему не причастен.

🔴 ЧЕГО ПОЧТАЛЬОН НЕ ДЕЛАЕТ И НЕ ГАРАНТИРУЕТ
— не доставляет письмо В ХОД агента: это дело модуля связи, почтальон только меняет
  владельца. Письмо, лежащее в ящике непрочитанным, для него доставлено;
— не проверяет содержимое: что внутри письма — забота получателя. Он не фильтр и не
  цензор, он не читает смысл;
— не защищает от отправителя, состоящего в группе: право положить письмо есть у всех
  членов a2a-pochta, и это замысел, а не дыра. Ограничение — только на чтение;
— не закрывает окно ДО переноса: пока письмо принадлежит отправителю, его прочтёт любой
  член группы, знающий имя. Окно закрывается на стороне ОТПРАВИТЕЛЯ маской umask 077,
  здесь этого не сделать;
— не работает с чем-либо кроме обычных файлов: каталоги, ссылки, устройства и очереди
  пропускаются с записью в журнал;
— не ходит за пределы /var/spool/a2a и не следует симлинкам;
— не удаляет старые письма и не ротирует ящики: разбирает почту получатель;
— НЕ отменяет доставку письма из-за неисправного чата: письмо к мигу уведомления
  уже у получателя, и отказ уведомления его не отзовёт;
— не гасит видимость по просьбе отправителя: метки «тихо» у письма нет намеренно.
  Отправитель волен не дублировать строку СЕБЕ (ключ --bez-kopii у a2a-send),
  но скрыть переписку от владельца он не может — уведомление получателю уходит
  всегда. Иначе требование «владелец видит переписку» держалось бы на
  добросовестности того, кого оно и проверяет;
— не сообщает о СЕБЕ: свои итоги («перенесено 3, отказов 0») он пишет в журнал,
  а не в чат. О его смерти узнаёт сторож машины, куда он внесён.
"""

import grp
import hashlib
import os
import subprocess
import pwd
import re
import stat
import sys
import time

KOREN = os.environ.get("A2A_KOREN", "/var/spool/a2a")
# Инструменты видимости. Вынесены переменными, чтобы стенд мог подставить свои
# и проверить механизм, НЕ ТРЕВОЖА человека ни разу.
TELL = os.environ.get("A2A_TELL_BIN", "/usr/local/bin/tell-owner")
REESTR = os.environ.get("A2A_REESTR_BIN", "/usr/local/bin/agent-registry")
# В чат идёт видимость переписки, а не её хранилище: письмо целиком уже у
# получателя. 🔴 B-N-1665 (05.10.2026): счёт и обрезка — в ЕДИНИЦАХ UTF-16, не в знаках python:
# Telegram меряет текст в UTF-16, знак вне BMP (эмодзи) — две единицы. Прежде 3800 знаков с
# эмодзи давали >4096 единиц (замер B-N-1663: 3904 знака = 4127), и сообщение отвергалось целиком.
# Число в «показано N из M знаков» — по-прежнему знаки: его читает человек.
PREDEL_V_CHAT = int(os.environ.get("A2A_PREDEL_V_CHAT", "900"))
# Предел одного sendMessage у Telegram (tell-owner шлёт ОДНО сообщение): шапка + тело + хвост не больше него.
PREDEL_TELEGRAM = 4096
# Уведомление не должно затягивать разноску: телеграм может молчать, а почта
# ждёт. 15 с — меньше, чем предел curl внутри tell-owner (25 с).
PREDEL_UVEDOMLENIYA_S = int(os.environ.get("A2A_PREDEL_UVEDOMLENIYA_S", "15"))
# Предел на письмо. Переписка агентов текстовая; всё, что крупнее, скорее ошибка
# отправителя, чем письмо. Не переносим, но и НЕ УДАЛЯЕМ — кричим в журнал.
PREDEL_BAJT = int(os.environ.get("A2A_PREDEL_BAJT", str(1024 * 1024)))
# Предел писем за один прогон: прогон раз в 5 с, длинная очередь разберётся за
# несколько заходов. Граница нужна, чтобы один заваленный ящик не занимал прогон целиком.
PREDEL_PISEM = int(os.environ.get("A2A_PREDEL_PISEM", "100"))
# B-N-915 (26.09.2026): конверт учёта первой строкой — его ставит a2a-send (с 19.09). Он СЛУЖЕБНЫЙ: в видимый
# предел и в «показано N из M» не входит, в чат не идёт (как и у отправителя в «→ кому»). Файл письма не трогаем —
# id остаётся в ящике для квитанций. Первая строка иного вида — тело, показывается как есть (не знаю ≠ убрать).
KONVERT = re.compile(r"\[delivery-v1 id=[0-9a-f]{64} reply=[a-z]+\]\n")
# 🔴 B-N-1502 (03.10.2026, Аврора; находка Искры 18:58Z): владельцу показываем ТОЛЬКО письма курьеров. Прежде в чат
# уходил ЛЮБОЙ файл ящика: 18:16:27Z файл учётных данных (iskra/marc-chatwoot-bot-…credentials.json) показан владельцу
# целиком. Признак письма — по коду ТРЁХ курьеров (все пишут временным «.имя» и переименовывают):
#   a2a-send v1 (/usr/local/bin/a2a-send :349–357) и письмо-продолжение шлюза (gateway.mjs, тот же формат):
#     имя <ГГГГММДДTччммссZ>-<учётка>-[ownerall-]<8 hex | pid>.txt, первая строка [delivery-v1 id=<64 hex> reply=…];
#   a2a-send --v2 (/usr/local/libexec/a2a-v2.py put): имя <метка>-<учётка>-v2-<64 hex>.txt, первая строка [a2a-envelope version=2];
#   и УЧЁТКА В ИМЕНИ = владелец файла (его ставит ядро; курьер пишет своё id -un) — подписью служит это совпадение.
# Не письмо — содержимое НЕ читается в чат и НЕ переносится получателю: файл переименовывается в «.ne-pismo-…»
# (скрытое почтальон и читатели ящика не берут), владельцу — одна строка без содержимого, плюс тревога машины.
# ЧЕГО НЕ ЛОВИТ: секрет ВНУТРИ настоящего письма курьера (это переписка — её показ и есть замысел).
PISMO_HVOST = r"(?:(?:ownerall-)?(?:[0-9a-f]{8}|[0-9]+)|v2-[0-9a-f]{64})\.txt"
PISMO_IMYA = re.compile(r"(?P<metka>\d{8}T\d{6}Z)-(?P<kto>[a-z_][a-z0-9_-]*)-" + PISMO_HVOST)
KONVERT_V2 = "[a2a-envelope version=2]\n"
TREVOGA = os.environ.get("A2A_ALERT_BIN", "/usr/local/bin/agent-alert")


def skazat(*chasti):
    print(*chasti, flush=True)


def imya_agenta(polzovatel):
    """Имя агента по системному пользователю — СПРОСИТЬ У РЕЕСТРА, не помнить.

    Своего перечня «пользователь → имя» здесь нет намеренно: он разошёлся бы
    с реестром молча в тот день, когда заведут одиннадцатого агента.
    Не нашли — возвращаем самого пользователя: «от <пользователь>» хуже, чем «от
    <роль>», но честнее выдуманного имени и заметно глазом.
    """
    try:
        got = subprocess.run(
            [REESTR, "kto", polzovatel],
            capture_output=True, text=True, timeout=10,
        )
    except (OSError, subprocess.SubprocessError):
        return polzovatel
    if got.returncode == 0 and got.stdout.strip():
        return got.stdout.strip()
    return polzovatel


def dlina16(s):
    """Длина в единицах UTF-16 — так меряет Telegram."""
    return len(s.encode("utf-16-le")) // 2


def nachalo16(s, predel):
    """Самое длинное начало s не длиннее predel единиц UTF-16. Режем по знакам python
    (кодовым точкам): знак вне BMP входит целиком или не входит — суррогатная пара не рвётся."""
    n = 0
    for i, ch in enumerate(s):
        n += 2 if ord(ch) > 0xFFFF else 1
        if n > predel:
            return s[:i]
    return s


def uvedomit(polzovatel_poluchatelya, polzovatel_otpravitelya, tekst, imya_pisma):
    """Сказать ПОЛУЧАТЕЛЮ в его личный чат с владельцем: пришло письмо.

    🔴 ПОЧЕМУ ЭТО ДЕЛАЕТ ПОЧТАЛЬОН, А НЕ САМ ПОЛУЧАТЕЛЬ
    Видимость не должна зависеть от исправности того, кого она касается.
    Агент может спать, быть занят ходом или сломан — владелец всё равно обязан
    увидеть, что письмо пришло. Модуль связи скажет об этом позже и о другом:
    «письмо прочитано и попало в ход».

    🔴 ПОЧЕМУ ОТПРАВИТЕЛЬ БЕРЁТСЯ ПО ВЛАДЕЛЬЦУ ФАЙЛА, А НЕ ИЗ ТЕКСТА
    Шапка внутри письма — утверждение отправителя о себе, и подделать её может
    кто угодно из группы. Владелец файла — факт, проставленный ядром.

    Пишем ОТ ИМЕНИ ПОЛУЧАТЕЛЯ (sudo -u): бот определяется вызвавшим
    пользователем, значит строка попадёт в его личный чат с владельцем, а не
    в чужой. Почтальон своего бота не имеет и иметь не должен.

    Возвращает (ushlo: bool, prichina: str, obrezka: str — пусто, если показано целиком).
    Отказ НЕ отменяет доставку письма: письмо к этому мигу уже у получателя.
    """
    ot = imya_agenta(polzovatel_otpravitelya)
    konvert = KONVERT.match(tekst)
    if konvert:
        tekst = tekst[konvert.end():]
    znakov = len(tekst)
    shapka = f"← от {ot}: "
    hvost_po = lambda n: f"\n\n… показано {n} из {znakov} знаков, письмо целиком в ящике: {imya_pisma}"
    if dlina16(tekst) <= min(PREDEL_V_CHAT, PREDEL_TELEGRAM - dlina16(shapka)):
        vidno, hvost, obrezka = tekst, "", ""
    else:
        # Обрезка называется вслух: молча обрезанное владелец прочтёт как
        # письмо целиком и решит, что видел всё. Запас на хвост — с N=znakov: цифр не меньше настоящих.
        vidno = nachalo16(tekst, min(PREDEL_V_CHAT, PREDEL_TELEGRAM - dlina16(shapka) - dlina16(hvost_po(znakov))))
        hvost = hvost_po(len(vidno))
        obrezka = f"показано {len(vidno)} из {znakov} знаков, UTF-16 {dlina16(shapka + vidno + hvost)}"
    soobshchenie = f"{shapka}{vidno}{hvost}"
    try:
        # 🔴 ТЕКСТ ПИСЬМА ПОДАЁТСЯ ЧЕРЕЗ СТАНДАРТНЫЙ ВВОД, А НЕ АРГУМЕНТОМ.
        # Аргумент видно дважды: в /proc/<pid>/cmdline его читает ЛЮБОЙ
        # пользователь машины, и в журнале sudo он остаётся навсегда для всех,
        # кто состоит в systemd-journal. Переписка двух агентов — не их дело.
        # tell-owner читает stdin, если аргументов нет: свойство его, не наше.
        got = subprocess.run(
            ["sudo", "-n", "-u", polzovatel_poluchatelya, TELL],
            input=soobshchenie,
            capture_output=True, text=True, timeout=PREDEL_UVEDOMLENIYA_S,
        )
    except subprocess.TimeoutExpired:
        return False, f"молчит дольше {PREDEL_UVEDOMLENIYA_S} с", obrezka
    except (OSError, subprocess.SubprocessError) as oshibka:
        return False, f"позвать не удалось: {oshibka}", obrezka
    if got.returncode == 0:
        return True, "", obrezka
    prichina = (got.stdout + got.stderr).strip().replace("\n", " ")
    return False, prichina or f"код {got.returncode}, причина не названа", obrezka


def eto_pismo(imya, otpravitel, soderzhimoe):
    """Письмо ли это курьера: (да/нет, почему нет). Содержимое не печатается нигде."""
    m = PISMO_IMYA.fullmatch(imya)
    if not m:
        return False, "имя не по образцу курьера"
    # Hyphens and reserved suffixes are ambiguous; the kernel owner fixes the split.
    nachalo = m.group("metka") + "-" + otpravitel + "-"
    if not imya.startswith(nachalo) or not re.fullmatch(PISMO_HVOST, imya[len(nachalo):]):
        return False, f"учётка в имени «{m.group('kto')}» ≠ владелец файла «{otpravitel}»"
    try:
        tekst = soderzhimoe.decode("utf-8")
    except UnicodeDecodeError:
        return False, "не текст UTF-8"
    if not (KONVERT.match(tekst) or tekst.startswith(KONVERT_V2)):
        return False, "первая строка — не конверт курьера"
    return True, ""


def otlozhit_ne_pismo(kat_fd, imya, st, uid_hozyaina, put_dlya_zhurnala, pochemu):
    """Не письмо: убрать с дороги (скрытым именем, владелец прежний), сказать владельцу строку БЕЗ содержимого, тревога."""
    vidimoe = re.sub(r"[^\w.\-]", "?", imya)[:80]
    otpechatok_imeni = hashlib.sha256(os.fsencode(imya)).hexdigest()
    novoe = f".ne-pismo-{int(time.time())}-{os.getpid()}-{otpechatok_imeni}"
    try:
        os.rename(imya, novoe, src_dir_fd=kat_fd, dst_dir_fd=kat_fd)
        kuda = f"отложено как {novoe[:120]}"
    except OSError as oshibka:
        kuda = f"переименовать не удалось ({oshibka}) — лежит как есть"
    stroka = (f"в ящике {put_dlya_zhurnala.split('/')[0]} лёг не-письмо {vidimoe}, {st.st_size} Б — "
              f"не показано и не передано ({pochemu}); {kuda}")
    skazat(f"[почтальон] 🔴 {put_dlya_zhurnala}: НЕ ПИСЬМО — {pochemu}; содержимое не показано; {kuda}")
    try:
        poluchatel = pwd.getpwuid(uid_hozyaina).pw_name
        got = subprocess.run(["sudo", "-n", "-u", poluchatel, TELL], input=f"⚠️ {stroka}",
                             capture_output=True, text=True, timeout=PREDEL_UVEDOMLENIYA_S)
        if got.returncode != 0:
            skazat(f"[почтальон] ⚠️ {put_dlya_zhurnala}: строка владельцу НЕ ушла: код {got.returncode}")
    except (KeyError, OSError, subprocess.SubprocessError) as oshibka:
        skazat(f"[почтальон] ⚠️ {put_dlya_zhurnala}: строка владельцу НЕ ушла: {oshibka}")
    try:
        subprocess.run([TREVOGA, "--plain"], input=f"a2a-pochtalon: {stroka}",
                       capture_output=True, text=True, timeout=30)
    except (OSError, subprocess.SubprocessError) as oshibka:
        skazat(f"[почтальон] ⚠️ {put_dlya_zhurnala}: тревога НЕ ушла: {oshibka}")
    return False, f"не письмо ({pochemu}) — не перенесено, содержимое не показано"


def perenesti(kat_fd, imya, uid_hozyaina, gid_hozyaina, put_dlya_zhurnala):
    """Переписать письмо в собственность хозяина ящика.

    Возвращает (pereneseno: bool, prichina: str). Исходник уничтожается ТОЛЬКО
    успешной заменой; на любом отказе он остаётся на месте нетронутым.
    """
    vremennoe = None
    try:
        # O_NOFOLLOW — иначе симлинк, положенный отправителем, увёл бы нас читать
        # чужой файл правами root.
        fd_ishod = os.open(imya, os.O_RDONLY | os.O_NOFOLLOW, dir_fd=kat_fd)
    except OSError as oshibka:
        return False, f"открыть не удалось: {oshibka}"

    try:
        st = os.fstat(fd_ishod)
        if not stat.S_ISREG(st.st_mode):
            return False, "не обычный файл"
        if st.st_size > PREDEL_BAJT:
            return False, f"крупнее предела {PREDEL_BAJT} Б (размер {st.st_size})"
        soderzhimoe = b""
        while True:
            kusok = os.read(fd_ishod, 65536)
            if not kusok:
                break
            soderzhimoe += kusok
    except OSError as oshibka:
        return False, f"прочитать не удалось: {oshibka}"
    finally:
        os.close(fd_ishod)

    # B-N-1502: до переноса и до показа — письмо ли это курьера.
    try:
        otpr_ = pwd.getpwuid(st.st_uid).pw_name
    except KeyError:
        otpr_ = str(st.st_uid)
    da_, pochemu_ = eto_pismo(imya, otpr_, soderzhimoe)
    if not da_:
        return otlozhit_ne_pismo(kat_fd, imya, st, uid_hozyaina, put_dlya_zhurnala, pochemu_)

    vremennoe = f".{imya}.perenos-{os.getpid()}"
    try:
        fd_novoe = os.open(
            vremennoe,
            os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW,
            0o600,
            dir_fd=kat_fd,
        )
    except OSError as oshibka:
        return False, f"создать временное не удалось: {oshibka}"

    try:
        os.write(fd_novoe, soderzhimoe)
        # Владелец и режим ставятся ПО ДЕСКРИПТОРУ, а не по имени: имя между
        # проверкой и правкой могло бы указать на другой файл.
        os.fchown(fd_novoe, uid_hozyaina, gid_hozyaina)
        os.fchmod(fd_novoe, 0o600)
        os.fsync(fd_novoe)
    except OSError as oshibka:
        os.close(fd_novoe)
        try:
            os.unlink(vremennoe, dir_fd=kat_fd)
        except OSError:
            pass
        return False, f"записать не удалось: {oshibka}"
    os.close(fd_novoe)

    try:
        # Одна атомарная операция: письмо у получателя появляется целиком либо не
        # появляется вовсе. Ею же исчезает исходник — отдельного удаления нет,
        # и потому нет состояния «исходник стёрт, а нового нет».
        os.replace(vremennoe, imya, src_dir_fd=kat_fd, dst_dir_fd=kat_fd)
    except OSError as oshibka:
        try:
            os.unlink(vremennoe, dir_fd=kat_fd)
        except OSError:
            pass
        return False, f"заменить не удалось: {oshibka}"

    # Проверка отдельным действием: замена прошла — но стало ли то, что задумано.
    try:
        st_posle = os.stat(imya, dir_fd=kat_fd, follow_symlinks=False)
    except OSError as oshibka:
        return False, f"после замены не читается: {oshibka}"
    if st_posle.st_uid != uid_hozyaina:
        return False, f"после замены владелец {st_posle.st_uid}, а нужен {uid_hozyaina}"
    if st_posle.st_size != len(soderzhimoe):
        return False, f"после замены размер {st_posle.st_size}, а было {len(soderzhimoe)}"

    skazat(
        f"[почтальон] {put_dlya_zhurnala}: перенесено получателю uid={uid_hozyaina}, "
        f"{len(soderzhimoe)} Б"
    )

    # ── ВИДИМОСТЬ ВЛАДЕЛЬЦУ. Зовётся ЗДЕСЬ, а не выше по коду: письмо к этому
    # мигу уже у получателя, и что бы дальше ни случилось с уведомлением,
    # доставку это не отменит. Однократность — свойство места: сюда попадают
    # только успешно перенесённые письма, а перенесённое второй раз не
    # переносится (владелец уже совпадает).
    try:
        poluchatel = pwd.getpwuid(uid_hozyaina).pw_name
    except KeyError:
        poluchatel = None
    try:
        otpravitel = pwd.getpwuid(st.st_uid).pw_name
    except KeyError:
        otpravitel = str(st.st_uid)
    if poluchatel is None:
        skazat(
            f"[почтальон] ⚠️ {put_dlya_zhurnala}: письмо доставлено, но кому "
            f"писать в чат — неизвестно (uid={uid_hozyaina} нет в системе)"
        )
        return True, ""
    try:
        tekst = soderzhimoe.decode("utf-8")
    except UnicodeDecodeError:
        # Не текст — в чат такое не показываем, но о самом письме говорим.
        tekst = f"(двоичное вложение, {len(soderzhimoe)} Б)"
    ushlo, prichina, obrezka = uvedomit(poluchatel, otpravitel, tekst, imya)
    if obrezka:
        # B-N-1665: длина обрезанного — ОТДЕЛЬНОЙ строкой. Строку «владельцу показано (чат X)» не трогать:
        # её якорным выражением читает a2a-owner-copy-watch (POKAZANO, …\)$) — дописка в неё ослепила бы сторожа.
        skazat(f"[почтальон] {put_dlya_zhurnala}: в чат обрезано — {obrezka}")
    if ushlo:
        skazat(f"[почтальон] {put_dlya_zhurnala}: владельцу показано (чат {poluchatel})")
    else:
        # Громко: неотправленная копия делает переписку невидимой владельцу,
        # а молчание тут неотличимо от «копия ушла».
        skazat(
            f"[почтальон] ⚠️ {put_dlya_zhurnala}: письмо ДОСТАВЛЕНО, но копия "
            f"владельцу НЕ ушла: {prichina}"
        )
    return True, ""


def razobrat_yashchik(imya_yashchika):
    put = os.path.join(KOREN, imya_yashchika)
    try:
        kat_fd = os.open(put, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    except OSError as oshibka:
        skazat(f"[почтальон] 🔴 ящик {imya_yashchika} не открыт: {oshibka}")
        return 0, 1

    perenes = 0
    otkazov = 0
    try:
        st_kat = os.fstat(kat_fd)
        uid_hozyaina = st_kat.st_uid
        gid_hozyaina = st_kat.st_gid
        # Группа письма — личная группа получателя, а не a2a-pochta: иначе письмо
        # осталось бы читаемым всем членам группы, то есть перенос был бы напрасен.
        try:
            gid_hozyaina = pwd.getpwuid(uid_hozyaina).pw_gid
        except KeyError:
            pass

        for imya in sorted(os.listdir(kat_fd)):
            if imya.startswith("."):
                continue  # временные самого почтальона и скрытое не трогаем
            if perenes + otkazov >= PREDEL_PISEM:
                skazat(
                    f"[почтальон] предел {PREDEL_PISEM} писем за прогон, "
                    f"остаток ящика {imya_yashchika} — следующим заходом"
                )
                break
            try:
                st = os.stat(imya, dir_fd=kat_fd, follow_symlinks=False)
            except OSError as oshibka:
                skazat(f"[почтальон] 🔴 {imya_yashchika}/{imya}: {oshibka}")
                otkazov += 1
                continue
            if st.st_uid == uid_hozyaina:
                continue  # уже собственность получателя — работа сделана раньше
            if not stat.S_ISREG(st.st_mode):
                skazat(
                    f"[почтальон] 🔴 {imya_yashchika}/{imya}: не обычный файл "
                    f"(режим {stat.filemode(st.st_mode)}) — оставлен как есть"
                )
                otkazov += 1
                continue
            ok, prichina = perenesti(
                kat_fd, imya, uid_hozyaina, gid_hozyaina, f"{imya_yashchika}/{imya}"
            )
            if ok:
                perenes += 1
                # 🔴 СЛЕД У УСПЕХА, А НЕ ТОЛЬКО У БЕДЫ (05.09.2026). Прежде почтальон
                # кричал лишь при отказе, а успешный перенос не оставлял ничего — и
                # вместе с письмом исчезало ЕГО ИМЯ. А в имени стоит метка укладки в
                # наносекундах (курьер отправителя присваивает её в момент cp на этой машине).
                # Без этой строки нельзя разделить две задержки: «от написания до
                # укладки» (чужая сторона) и «от укладки до прочтения» (моя очередь) —
                # мы вчетвером сутки спорили о них, не имея числа ни для одной.
                # ЦЕНА: одна строка на письмо, порядка тридцати в час. Пустые проходы
                # (а их 3697 за шесть часов) по-прежнему молчат.
                skazat(f"[почтальон] перенесено {imya_yashchika}/{imya}")
            else:
                otkazov += 1
                skazat(
                    f"[почтальон] 🔴 {imya_yashchika}/{imya}: {prichina} "
                    f"— письмо ОСТАВЛЕНО, не потеряно"
                )
    finally:
        os.close(kat_fd)
    return perenes, otkazov


def main():
    nachalo = time.time()
    if os.geteuid() != 0:
        skazat(
            "[почтальон] 🔴 СЛЕПОТА: сменить владельца письма может только root. "
            f"Запущено от uid={os.geteuid()} — перенос невозможен, ничего не сделано."
        )
        return 2
    try:
        yashchiki = sorted(
            i for i in os.listdir(KOREN)
            if os.path.isdir(os.path.join(KOREN, i))
            and not os.path.islink(os.path.join(KOREN, i))
        )
    except OSError as oshibka:
        skazat(f"[почтальон] 🔴 СЛЕПОТА: корень {KOREN} не читается: {oshibka}")
        return 2
    if not yashchiki:
        skazat(f"[почтальон] 🔴 СЛЕПОТА: в {KOREN} нет ни одного ящика")
        return 2

    vsego_perenes = 0
    vsego_otkazov = 0
    for imya in yashchiki:
        p, o = razobrat_yashchik(imya)
        vsego_perenes += p
        vsego_otkazov += o

    proshlo = int((time.time() - nachalo) * 1000)
    if vsego_perenes or vsego_otkazov:
        skazat(
            f"[почтальон] итог: перенесено {vsego_perenes}, отказов {vsego_otkazov}, "
            f"ящиков {len(yashchiki)}, {proshlo} мс"
        )
    # Отказ переноса — не отказ прогона: остальные письма разнесены. Но и не успех:
    # молчание сделало бы потерянное письмо неотличимым от пустой почты.
    return 1 if vsego_otkazov else 0


if __name__ == "__main__":
    sys.exit(main())
