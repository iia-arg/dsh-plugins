#!/usr/bin/python3 -B
"""С1 B-N-1929 — ПРЕДУПРЕЖДЕНИЕ ДО, не защита: сканер ТЕКСТА стенда перед запуском (Заря, условия Вениамина 10:36Z).
Ищет в строках кода (полнострочные комментарии # и // не читаются) команды, меняющие живую машину: systemctl с меняющим глаголом,
useradd-семейство, systemd-sysusers без --root, запись в /etc (tee/cp/install/mv/rm/ln/sed -i), замки dpkg/apt; и инструменты
с ключом действия (класс B-N-1912): klon-agenta --ustanovit, smontirovat-fajly/-vypusk без --suhoj, agent-plugins pravka
--ustanovit, podyom-uzla без PROBA/--suhoj. Подстава на той же строке (${SYSTEMCTL:-, --root=, HOD_SYSTEMCTL) — не находка.
Маркер: строка-комментарий «# ZHIVAYA-MASHINA: <что меняет>» (или «// ZHIVAYA-MASHINA:») в любом месте файла.
НЕ ЛОВИТ (поэтому граница — С2, журнал по юниту ПОСЛЕ факта): вызов через переменную ($SYSTEMCTL, ${SUDO:-sudo}, "${CMD[@]}");
вызов в помощнике из ДРУГОГО файла; python subprocess со списком (['systemctl', 'stop', …] — слова в кавычках по отдельности);
eval/source; нестандартную запись глагола; запись в /etc из кода (open(…,'w'), fs.writeFileSync).
Вывод: «NAHODKA <строка> <текст>» на каждую находку, «MARKER <строка>», «NET <строка>» (объявление ZHIVAYA-MASHINA-NET). Коды: 0 находок нет · 1 находки без маркера ·
3 находки с маркером (ручной) · 2 файл не прочитан. Довод: путь стенда (один) или «-» — текст из stdin (стенд чужой учётки:
обходчик читает его рукой этой учётки и подаёт сюда)."""
import re, sys
SYSTEMCTL = re.compile(r'(?<![\w-])systemctl\b(?![^\n]*--root[= ])[^\n]*?\b(stop|start|restart|reload|try-restart|reload-or-restart|mask|unmask|enable|disable|'
                       r'daemon-reload|daemon-reexec|reset-failed|kill|isolate|set-property|edit|revert|preset|link|reenable)\b')
SHADOW = re.compile(r'(?<![\w-])(useradd|userdel|usermod|groupadd|groupdel|groupmod|gpasswd|chpasswd|visudo)\b')
SYSUSERS = re.compile(r'(?<![\w-])systemd-sysusers\b(?![^\n]*--root)')
ETC_LYUBOJ = re.compile(r'\b(tee|rm|sed\s+-i\S*)\b[^\n;|&]*\s/etc/')           # любой довод в /etc — запись
ETC_CEL = re.compile(r'\b(cp|install|mv|ln)\b[^\n;|&]*\s(/etc/\S*)\s*($|[;|&])')   # цель (последний довод) в /etc; источник из /etc — чтение
ZAMOK = re.compile(r'/var/lib/(dpkg|apt)/[^\s\'"]*lock|/var/cache/apt/archives/lock')
INSTR = [(re.compile(r'(?<![\w-])klon-agenta(\.sh)?\b[^\n]*--ustanovit'), None),
         (re.compile(r'(?<![\w-])smontirovat-(fajly|vypusk)(?![\w-])'), re.compile(r'--suhoj')),
         (re.compile(r'(?<![\w-])agent-plugins\s+pravka\b[^\n]*--ustanovit'), None),
         (re.compile(r'(?<![\w-])podyom-uzla(?![\w-])'), re.compile(r'PROBA|--suhoj'))]
PODSTAVA = re.compile(r'\$\{SYSTEMCTL:-|--root=|HOD_SYSTEMCTL')
MARKER = re.compile(r'^\s*(#|//)\s*ZHIVAYA-MASHINA:')
NET = re.compile(r'^\s*(#|//)\s*ZHIVAYA-MASHINA-NET:')   # объявление «живого не трогаю: <чем подменено>» (D-N-1937); здесь — только печать
KOMMENT = re.compile(r'^\s*(#|//)')
def nahodka(t):
    if PODSTAVA.search(t): return None
    for rx in (SYSTEMCTL, SHADOW, SYSUSERS, ETC_LYUBOJ, ETC_CEL, ZAMOK):
        m = rx.search(t)
        if m: return m.group(0)
    for rx, krome in INSTR:
        m = rx.search(t)
        if m and not (krome and krome.search(t)): return m.group(0)
    return None
def svoi_yunity(komanda):   # С2: имена юнитов, которые эта команда ЗАВОДИТ (systemd-run --unit=…) — их stop/reset-failed не находка
    if not re.search(r'\bsystemd-run\b', komanda): return set()
    return {m.group(2) for m in re.finditer(r'(--unit[= ]|\s-u\s+)([A-Za-z0-9@:._-]+)', komanda)}
def tseli_systemctl(komanda):   # имена юнитов-доводов systemctl (без ключей и глагола)
    m = re.search(r'\bsystemctl\b(.*)', komanda)
    slova = m.group(1).split() if m else []
    return [t for t in slova[1:] if not t.startswith('-')] if slova else []   # первое слово — глагол (ключи до глагола — редкость, тогда цель — сам глагол: находка останется)
def bez_suffiksa(u): return re.sub(r'\.(service|scope|timer)$', '', u)
if __name__ != '__main__': pass
elif len(sys.argv) != 2: print('ОТКАЗ: довод — ровно один путь стенда'); sys.exit(2)
else:
  try: stroki = (sys.stdin.read() if sys.argv[1] == '-' else open(sys.argv[1], encoding='utf-8', errors='replace').read()).splitlines()
  except OSError as e: print(f'СЛЕПОТА: {sys.argv[1]} не прочитан: {e.strerror}'); sys.exit(2)
  est, marker, net = [], None, None
  for n, t in enumerate(stroki, 1):
      if MARKER.match(t): marker = marker or n; continue
      if NET.match(t): net = net or n; continue
      if KOMMENT.match(t): continue
      h = nahodka(t)
      if h: est.append(n); print(f'NAHODKA\t{n}\t{h}\t{t.strip()[:160]}')
  if marker: print(f'MARKER\t{marker}')
  if net: print(f'NET\t{net}')
  sys.exit(0 if not est else 3 if marker else 1)
