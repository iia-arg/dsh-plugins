#!/usr/bin/python3
"""razdacha.py — раздача панелей Автопилота ТОЛЬКО ЧТЕНИЕМ (dsh-autopilot, часть Д; 14.10.2026).

Отдаёт обычные файлы из корня (/srv/autopilot/public/<агент>/<проект>/<прогон>/dashboard.html, state.js).
Чего НЕ делает никогда: листинга каталогов, выхода за корень (ни «..», ни ссылкой наружу — путь после
realpath обязан остаться внутри корня), записи на диск, методов кроме GET/HEAD.
state.js — Cache-Control: no-store (панель перечитывает его; закэшированный ход хуже пустого).
GET /__zhivoj — признак живости для healthcheck: 200 «zhiv», только если корень — читаемый каталог; иначе 503.
КОМУ: содержимое — только адресам --vpusk (vps-ru); /__zhivoj — им и собственному адресу (healthcheck на этой
машине). Прочим — 403 (линия сервера; вторая линия — IPAddressAllow юнита, третья — стена машины).
Предел файла — 8 МБ (больше → 413); имя с точкой в начале в любом звене пути (.git, .env) → 404.
КЛЮЧ: содержимое отдаётся только с заголовком X-AP-Klyuch, равным секрету учётных данных --klyuch-imya из
$CREDENTIALS_DIRECTORY (его задаёт LoadCredential юнита; файл-источник 600 root); сравнение постоянного времени (hmac.compare_digest); нет/не тот → 403.
Зачем: на vps-ru любой контейнер маскарадится наружу адресом хаба — по одному адресу nginx не отличить.
Секрет в командную строку не попадает (только путь), в журнал — тоже (заголовки не пишутся).

Почему свой обработчик, а не готовое: http.server.SimpleHTTPRequestHandler показывает листинг каталогов и
идёт по ссылкам; busybox httpd идёт по ссылкам и не ставит заголовок одному файлу. Свой — ~80 строк, без
сторонних модулей, только стандартная библиотека Python 3.

Вызов: razdacha.py --koren КАТАЛОГ --adres IP --port N --vpusk IP[,IP…] --klyuch-imya ИМЯ   (адрес — не 0.0.0.0/::)
Коды выхода: 2 — неверный вызов или корень не каталог (ОТКАЗ до привязки порта).
Чего НЕ ловит: подмену файла между проверкой realpath и открытием (атомарную выгрузку делает часть Б);
доступ по правам ФС — служба читает тем, что разрешено её учётке (DynamicUser + SupplementaryGroups=autopilot-view:
корень 2751 root:autopilot-view, каталог оператора 2750, файлы 0640 — o+r не нужен и не даётся).
EN: razdacha.py serves Autopilot dashboards READ-ONLY: regular files under the root only, no directory
listing, no escape by ".." or symlink (realpath must stay inside the root), GET/HEAD only, no-store for
state.js, GET /__zhivoj = 200 only if the root is a readable directory. Own handler because http.server
lists directories and follows links and busybox httpd cannot set a per-file header.
"""
import argparse, hmac, http.server, ipaddress, mimetypes, os, sys, urllib.parse

TIPY = {'.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
        '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml',
        '.png': 'image/png', '.txt': 'text/plain; charset=utf-8'}


class Obrabotchik(http.server.BaseHTTPRequestHandler):
    koren = '/nonexistent'
    vpusk = frozenset()
    svoj = ''
    klyuch = b''
    PREDEL = 8 * 1024 * 1024
    server_version = 'dsh-autopilot-razdacha'
    sys_version = ''

    def log_message(self, fmt, *args):  # в журнал юнита одной строкой, без адресов тела
        sys.stderr.write('%s %s\n' % (self.address_string(), fmt % args))

    def otvet(self, kod, telo=b'', tip='text/plain; charset=utf-8', kesh='no-store'):
        self.send_response(kod)
        self.send_header('Content-Type', tip)
        self.send_header('Content-Length', str(len(telo)))
        self.send_header('Cache-Control', kesh)
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.end_headers()
        if self.command != 'HEAD':
            self.wfile.write(telo)

    def najti(self):
        """Путь запроса → реальный путь обычного файла внутри корня, иначе None."""
        put = urllib.parse.unquote(urllib.parse.urlsplit(self.path).path)
        if '\x00' in put or not put.startswith('/'):
            return None
        polnyj = os.path.realpath(os.path.join(self.koren, put.lstrip('/')))
        if not polnyj.startswith(self.koren + os.sep):
            return None
        if any(zveno.startswith('.') for zveno in os.path.relpath(polnyj, self.koren).split(os.sep)):
            return None
        return polnyj if os.path.isfile(polnyj) else None

    def do_GET(self):
        kto = self.client_address[0]
        if urllib.parse.urlsplit(self.path).path == '/__zhivoj':
            if kto not in self.vpusk and kto != self.svoj:
                return self.otvet(403, b'403\n')
            ok = os.path.isdir(self.koren) and os.access(self.koren, os.R_OK | os.X_OK)
            return self.otvet(200 if ok else 503, b'zhiv\n' if ok else b'koren nedostupen\n')
        if kto not in self.vpusk:
            return self.otvet(403, b'403\n')
        prishlo = (self.headers.get('X-AP-Klyuch') or '').encode('utf-8', 'surrogateescape')
        if not hmac.compare_digest(prishlo, self.klyuch):
            return self.otvet(403, b'403\n')
        f = self.najti()
        if f is None:
            return self.otvet(404, b'404\n')
        try:
            with open(f, 'rb') as h:
                telo = h.read(self.PREDEL + 1)
            if len(telo) > self.PREDEL:
                return self.otvet(413, b'413\n')
        except OSError:
            return self.otvet(404, b'404\n')
        imya = os.path.basename(f)
        tip = TIPY.get(os.path.splitext(imya)[1].lower()) or mimetypes.guess_type(imya)[0] or 'application/octet-stream'
        self.otvet(200, telo, tip, 'no-store' if imya == 'state.js' else 'no-cache')

    do_HEAD = do_GET

    def neprinyato(self):
        self.otvet(405, b'405\n')

    do_POST = do_PUT = do_DELETE = do_PATCH = do_OPTIONS = neprinyato


def main():
    a = argparse.ArgumentParser(allow_abbrev=False)
    a.add_argument('--koren', required=True)
    a.add_argument('--adres', required=True)
    a.add_argument('--port', required=True, type=int)
    a.add_argument('--vpusk', required=True)
    a.add_argument('--klyuch-imya', required=True)
    try:
        d = a.parse_args()
    except SystemExit:
        sys.exit(2)
    try:
        ip = ipaddress.ip_address(d.adres)
    except ValueError:
        print('ОТКАЗ: --adres не IP-адрес', file=sys.stderr); sys.exit(2)
    if ip.is_unspecified:
        print('ОТКАЗ: слушать на всех адресах (0.0.0.0/::) запрещено — назовите адрес mesh', file=sys.stderr); sys.exit(2)
    if not 1 <= d.port <= 65535:
        print('ОТКАЗ: --port вне 1..65535', file=sys.stderr); sys.exit(2)
    koren = os.path.realpath(d.koren)
    if not os.path.isdir(koren):
        print(f'ОТКАЗ: корень {d.koren} — не каталог', file=sys.stderr); sys.exit(2)
    try:
        vpusk = frozenset(str(ipaddress.ip_address(x.strip())) for x in d.vpusk.split(',') if x.strip())
    except ValueError:
        print('ОТКАЗ: --vpusk — не список IP-адресов', file=sys.stderr); sys.exit(2)
    if not vpusk or any(ipaddress.ip_address(x).is_unspecified for x in vpusk):
        print('ОТКАЗ: --vpusk пуст или содержит 0.0.0.0/:: — назовите адреса vps-ru', file=sys.stderr); sys.exit(2)
    kd = os.environ.get('CREDENTIALS_DIRECTORY', '')
    if not kd or '/' in d.klyuch_imya:
        print('ОТКАЗ: ключ: нет CREDENTIALS_DIRECTORY (запуск не из юнита с LoadCredential) или имя с «/»', file=sys.stderr); sys.exit(2)
    try:
        with open(os.path.join(kd, d.klyuch_imya), 'rb') as h:
            klyuch = h.read().strip()
    except OSError as e:
        print(f'ОТКАЗ: ключ «{d.klyuch_imya}» не прочитан: {e.strerror}', file=sys.stderr); sys.exit(2)
    if len(klyuch) < 16:
        print(f'ОТКАЗ: ключ «{d.klyuch_imya}» пуст или короче 16 байт', file=sys.stderr); sys.exit(2)
    Obrabotchik.klyuch = klyuch
    Obrabotchik.koren = koren
    Obrabotchik.vpusk = vpusk
    Obrabotchik.svoj = str(ip)
    srv = http.server.ThreadingHTTPServer((str(ip), d.port), Obrabotchik)
    srv.daemon_threads = True
    print(f'razdacha: слушаю {ip}:{d.port}, корень {koren}, содержимое — {",".join(sorted(vpusk))}', file=sys.stderr, flush=True)
    srv.serve_forever()


if __name__ == '__main__':
    main()
