"""RU: Клиентский путь agent-alert (способ 2, B-N-2055): учётка без доступа к токену сдаёт тревогу в спул,
root-отправитель (agent-alert-otpravitel) шлёт её и кладёт итог. Файл пишется в tmp/ (O_EXCL), готовым переносится
rename в vhod/ — во vhod/ не бывает недописанного. Код выхода = итог отправителя; итога нет за AGENT_ALERT_ITOG_ZHDAT —
75 и строка 🔴 «исход=нет-итога»; спул не пишется — 1 и 🔴 «исход=нет-пути». Обе строки — в журнал с тегом agent-alert.
Режим proverit: настоящая запись (O_EXCL + unlink в tmp/, rename пробы *.chk в vhod/ и сразу unlink её самим клиентом;
не убралась — отправитель удаляет её молча)
и path-юнит отправителя active. access(W_OK) не годится: песочницу (ProtectSystem/ReadWritePaths) он не видит.
EN: Client path of agent-alert (method 2): an account without token access drops the alert into the spool; the root
sender delivers it and writes a result. Exit = sender's result; 75 without a result in time; 1 if the spool is not
writable. Both failures are logged loudly. proverit mode does a real write, not access(W_OK).
"""
import errno
import os
import re
import secrets
import subprocess
import sys
import time

PREDEL_BAJT = 60 * 1024          # текст в спул — не больше; отправитель режет до 4096 UTF-16 как прямой путь
PATH_YUNIT = 'agent-alert-otpravitel.path'
# ответы systemctl is-active, которые НАЗЫВАЮТ состояние (иное, в т.ч. пусто, — состояние не видно)
SOSTOYANIYA_YUNITA = {'active', 'inactive', 'failed', 'activating', 'deactivating', 'reloading', 'maintenance', 'refreshing'}


def logger(stroka):
    try:
        subprocess.run(['logger', '-t', 'agent-alert', '--', stroka], timeout=10,
                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    except (OSError, subprocess.SubprocessError):
        pass


def kto():
    try:
        import pwd
        return pwd.getpwuid(os.geteuid()).pw_name
    except (ImportError, KeyError):
        return f'uid-{os.geteuid()}'


def yunit():
    try:
        with open('/proc/self/cgroup', encoding='utf-8') as f:
            najdeno = re.findall(r'[A-Za-z0-9@._-]+\.(?:service|scope)', f.read())
    except OSError:
        najdeno = []
    return najdeno[-1] if najdeno else 'вне-юнита'


# RU: 3.1.6 (info Вениамина 15.10 05:05Z, как otkaz в bin/agent-alert 3.1.5): выход с отказом — строка журнала agent-alert
#     «исход=<…> учётка=… ЮНИТ=… путь=спул файл=… <причина>», прежнее сообщение в stdout, прежний код. Без 🔴: сторож
#     очереди берёт только «🔴 исход=нет-(пути|итога) учётка=» — эти строки не его. Отказ отправителя (65/66/69) прежде
#     был виден лишь под тегом agent-alert-otpravitel, итог «не читается» — нигде.
# EN: Refusal exits leave an agent-alert journal line (reason, account, unit, spool file); message and code unchanged.
def otkaz(kod, ishod, prichina, imya):
    logger(f'исход={ishod} учётка={kto()} ЮНИТ={yunit()} путь=спул файл={imya}.msg {prichina[:200]}')
    print(f'agent-alert: {prichina}')
    return kod


def puti():
    spul = os.environ['AGENT_ALERT_SPUL']
    return spul, os.path.join(spul, 'tmp'), os.path.join(spul, 'vhod'), os.path.join(spul, 'itog')


def polozhit(tmp, vhod, imya, soderzhimoe, rasshirenie):
    """tmp/<imya>.tmp (O_EXCL, 0600) → rename vhod/<imya><rasshirenie>. Исключение — пути нет."""
    vremennyj = os.path.join(tmp, f'.{imya}.tmp')
    fd = os.open(vremennyj, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    try:
        with os.fdopen(fd, 'wb') as f:
            f.write(soderzhimoe)
    except BaseException:
        try:
            os.unlink(vremennyj)
        except OSError:
            pass
        raise
    try:
        os.rename(vremennyj, os.path.join(vhod, imya + rasshirenie))
    except OSError:
        try:
            os.unlink(vremennyj)
        except OSError:
            pass
        raise


def otpravit():
    spul, tmp, vhod, itog = puti()
    fmt = os.environ.get('FORMAT', 'html')
    fmt = 'plain' if fmt.startswith('plain') else 'html'
    istochnik = ' '.join(os.environ.get('ISTOCHNIK', '').split())[:200]
    tekst = os.environ.get('MSG', '').encode('utf-8')
    if len(tekst) > PREDEL_BAJT:
        tekst = tekst[:PREDEL_BAJT].decode('utf-8', 'ignore').encode('utf-8') + '\n⚠️ обрезано клиентом спула'.encode('utf-8')
    soderzhimoe = f'format={fmt}\nistochnik={istochnik}\n\n'.encode('utf-8') + tekst
    imya = f'{time.time_ns()}-{os.getpid()}-{secrets.token_hex(4)}'
    try:
        polozhit(tmp, vhod, imya, soderzhimoe, '.msg')
    except OSError as e:
        prichina = f'{spul}: {errno.errorcode.get(e.errno, e.errno)} {e.strerror}'
        logger(f'🔴 исход=нет-пути учётка={kto()} токен не читается, спул не пишется ({prichina}) — тревога НЕ отправлена')
        print(f'agent-alert: нет пути — токен не читается, спул не пишется ({prichina}); тревога НЕ отправлена')
        return 1
    zhdat = int(os.environ.get('AGENT_ALERT_ITOG_ZHDAT', '120'))
    put_itoga = os.path.join(itog, imya)
    srok = time.monotonic() + zhdat
    while time.monotonic() < srok:
        try:
            with open(put_itoga, encoding='utf-8') as f:
                kod_s, _, prichina = f.read().partition('\n')
        except FileNotFoundError:
            time.sleep(0.2)
            continue
        except OSError as e:
            return otkaz(1, 'итог-не-читается', f'итог {put_itoga} не читается ({e.strerror})', imya)
        try:
            os.unlink(put_itoga)
        except OSError:
            pass
        kod = int(kod_s) if kod_s.strip().isdecimal() else 1
        if kod != 0:
            return otkaz(kod, 'отказ-отправителя', f'отправитель спула — код {kod}: {prichina.strip()[:300]}', imya)
        return kod
    logger(f'🔴 исход=нет-итога учётка={kto()} файл={imya}.msg — отправитель спула не ответил за {zhdat} с')
    print(f'agent-alert: тревога положена в спул ({imya}.msg), но итога нет за {zhdat} с — отправитель спула стоит?')
    return 75


def proverit():
    spul, tmp, vhod, _ = puti()
    prichin = 0
    imya = f'proverka-{time.time_ns()}-{os.getpid()}'
    try:
        fd = os.open(os.path.join(tmp, f'.{imya}.zapis'), os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
        os.close(fd)
        os.unlink(os.path.join(tmp, f'.{imya}.zapis'))
    except OSError as e:
        print(f'ОТКАЗ НАСТРОЙКИ: спул — запись в {tmp} не прошла: {e.strerror}'); prichin += 1
    if not prichin:
        try:
            polozhit(tmp, vhod, imya, b'proverka\n', '.chk')
        except OSError as e:
            print(f'ОТКАЗ НАСТРОЙКИ: спул — перенос пробы в {vhod} не прошёл: {e.strerror}'); prichin += 1
        else:
            # своя проба — убрать сразу (липкий каталог: владелец удаляет своё); иначе при погашенном отправителе
            # .chk лежат вечно, а при живом каждая проба — лишний запуск службы (окно 15.10 00:36Z)
            try:
                os.unlink(os.path.join(vhod, imya + '.chk'))
            except FileNotFoundError:
                pass
            except OSError as e:
                print(f'⚠️ проба {imya}.chk не убрана из {vhod}: {e.strerror} — уберёт отправитель')
    # «не взведён» — только когда systemctl НАЗВАЛ состояние и оно не active. Пустой ответ — «отсюда не видно»: из песочницы
    # DynamicUser (apt-updates-notify) systemctl is-active даёт «Transport endpoint is not connected», код 1, stdout пуст
    # (замер 15.10 systemd-run: та же команда от nobody без DynamicUser видит active) — это про связь с systemd, не про path.
    try:
        r = subprocess.run(['systemctl', 'is-active', PATH_YUNIT], capture_output=True, text=True, timeout=10)
        aktiven, ne_vizhu = r.stdout.strip(), ' '.join(r.stderr.split())[:160]
    except (OSError, subprocess.SubprocessError) as e:
        aktiven, ne_vizhu = '', f'systemctl не вызван ({type(e).__name__})'
    vizhu = aktiven in SOSTOYANIYA_YUNITA
    if vizhu and aktiven != 'active':
        print(f'ОТКАЗ НАСТРОЙКИ: отправитель спула не взведён — {PATH_YUNIT}: {aktiven}'); prichin += 1
    if prichin:
        return 2
    if not vizhu:
        print(f'КЛИЕНТСКИЙ ПУТЬ ГОДЕН: учётка {kto()} пишет в {tmp} и переносит в {vhod}; состояние {PATH_YUNIT} ОТСЮДА НЕ '
              f'ВИДНО ({ne_vizhu or aktiven or "пустой ответ"}) — не проверено, проверьте от root: systemctl is-active '
              f'{PATH_YUNIT}; Telegram не спрашивался')
        return 0
    print(f'КЛИЕНТСКИЙ ПУТЬ ГОДЕН: учётка {kto()} пишет в {tmp} и переносит в {vhod}, {PATH_YUNIT} active; '
          'Telegram не спрашивался')
    return 0


if __name__ == '__main__':
    rezhim = sys.argv[1:]
    if rezhim == ['otpravit']:
        sys.exit(otpravit())
    if rezhim == ['proverit']:
        sys.exit(proverit())
    print('klient.py: otpravit | proverit', file=sys.stderr)
    sys.exit(2)
