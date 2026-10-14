#!/usr/bin/env python3
"""B-N-2032: loaded ExecStart keeps the deployment-window flag.
B-N-2037 (Аврора, 14.10.2026; находка Альфы в №16, Вениамин 01:2xZ): и ДЕЙСТВУЮЩИЕ значения, которые настройка переписывает после
умолчаний. ExecStart с ключом ещё не значит «отсрочка работает»: registry-watchdog.sh читает /etc/registry-watchdog/registry-watchdog.conf
ПОСЛЕ своих умолчаний (строка `[ -r "$CONF" ] && . "$CONF"`), и conf с VERIFY_CMD/DORABOTKI_CMD/HEALTH_CMD без $MONTAZH_KEY молча снимал
ключ в бою. Поэтому: (1) registry-watchdog — три команды строятся как у сторожа (окружение юнита → его же строки умолчаний, вынутые из
читателя → conf) в двух режимах: в авто ключ есть во ВСЕХ трёх, в ручном — ни в одной; (2) у всех четырёх — действующий помощник окна
MONTAZH_OKNO_BIN (Environment и EnvironmentFile юнита; файл главнее строки) пуст или /usr/local/sbin/montazh-okno. Прочие три сторожа
ключ берут только из argv, их настройки — окружение; переписать сам ключ у них нечем (vypusk-okno-watch.sh :147–148, dve-kopii-watch
argparse :161, zhivaya-versiya-watch argparse :155).
ЧЕГО НЕ ЛОВИТ: conf, исполняющий команды с побочным действием (он исполняется стендом своей учёткой, как и сторожем); сторожей вне
перечня; помощник по другому пути, ведущий в настоящий montazh-okno; правку conf после прогона стенда.

Read-only: four named loaded units, four calls bounded by5s each.
Healthy exit0 is silent except «НЕ СУДИТСЯ» lines for an empty command the reader itself skips; red1 names the unit, blindness2 names its cause.
Does not inspect a running process's old argv or the reader's flag parser.
--proba JSON is an explicit copied systemctl-response fixture, not a live check.
"""
import argparse,json,re,shlex,subprocess,sys,tempfile
from pathlib import Path

UNITS={'vypusk-okno-watch':'bash','registry-watchdog':'bash','dve-kopii-watch':'python','zhivaya-versiya-watch':'python'}
HELPER='/usr/local/sbin/montazh-okno'
KOMANDY=('VERIFY_CMD','DORABOTKI_CMD','HEALTH_CMD')
KEY='--avto-montazh'

def sreda(values,read_file):
    """Окружение юнита: Environment=, затем EnvironmentFile= (их значения главнее, как у systemd)."""
    env={}
    for el in shlex.split(values.get('Environment','')):
        if '=' not in el:raise ValueError('Environment element without =')
        k,v=el.split('=',1);env[k]=v
    for put,ign in re.findall(r'(\S+) \(ignore_errors=(yes|no)\)',values.get('EnvironmentFiles','')):
        text=read_file(put)
        if text is None:
            if ign=='yes':continue
            raise ValueError('EnvironmentFile missing: '+put)
        for line in text.splitlines():
            line=line.strip()
            if not line or line.startswith('#'):continue
            if '=' not in line:raise ValueError('EnvironmentFile line without =')
            k,v=line.split('=',1);w=shlex.split(v);env[k.strip()]=w[0] if len(w)==1 else ' '.join(w)
    return env

def komandy_rw(env,read_file,rezhim):
    """Действующие VERIFY/DORABOTKI/HEALTH_CMD registry-watchdog: окружение → строки умолчаний самого читателя → conf."""
    reader=read_file('/usr/local/sbin/registry-watchdog.sh')
    if reader is None:raise ValueError('registry-watchdog.sh not readable')
    # B-N-2037 r2 (№16, dsh-reestr: живой читатель 05:01Z): у строки умолчания бывает хвостовой комментарий; conf читается то строкой
    #   `[ -r "$CONF" ] && . "$CONF"`, то `. "$CONF"` внутри проверки владельца (№31) — принимается любая форма, но ровно одна строка.
    umolch=[l for l in reader.splitlines() if re.fullmatch(r'(VERIFY_CMD|DORABOTKI_CMD|HEALTH_CMD)="\$\{\1:-[^"]*\}"(\s+#.*)?',l)]
    conf_l=[l for l in reader.splitlines() if re.fullmatch(r'CONF="\$\{REGWD_CONF:-/[^"$`]*\}"',l)]
    chtenie=[l for l in reader.splitlines() if re.fullmatch(r'\s*(\[ -r "\$CONF" \] && )?\. "\$CONF"',l)]
    if len(umolch)!=3:raise ValueError('reader defaults of '+'/'.join(KOMANDY)+' found '+str(len(umolch))+' times, need 3')
    if len(conf_l)!=1:raise ValueError('reader CONF= line found '+str(len(conf_l))+' times, need 1')
    if len(chtenie)!=1:raise ValueError('reader conf sourcing line found '+str(len(chtenie))+' times, need 1')
    conf=env.get('REGWD_CONF') or conf_l[0].split(':-',1)[1][:-2]
    text=read_file(conf)
    with tempfile.TemporaryDirectory(prefix='flagi-okna-') as td:
        cf=Path(td)/'conf'
        if text is not None:cf.write_text(text)
        skript='MONTAZH_KEY='+shlex.quote(KEY if rezhim=='avto' else '')+'\n'+'\n'.join(umolch)+'\n[ -r "$1" ] && . "$1"\nprintf "%s\\0" "$VERIFY_CMD" "$DORABOTKI_CMD" "$HEALTH_CMD"\n'
        okr={'PATH':'/usr/bin:/bin',**{k:v for k,v in env.items() if k in KOMANDY}}
        p=subprocess.run(['bash','--norc','--noprofile','-c',skript,'_',str(cf)],env=okr,capture_output=True,text=True,timeout=5)
    vals=p.stdout.split('\0')
    if p.returncode!=0 or len(vals)!=4:raise ValueError('effective commands not computed')
    # Пустую команду сторож сам пропускает только там, где в нём есть `if [ -z "$ИМЯ" ]` (№3 аудита 16: DORABOTKI_CMD) — её не судим.
    #   r3 (LOW Вениамина): признак — СТРОКА КОДА `if [ -z "$ИМЯ" ]; then`, не текст в комментарии.
    propusk=lambda k:re.search(r'^[ \t]*if \[ -z "\$'+k+r'" \]; then',reader,re.M) is not None
    return {k:(None if not v.strip() and propusk(k) else v) for k,v in zip(KOMANDY,vals[:3])}

def chitatel(fixture_files):
    def read_file(put):
        if fixture_files is not None:return fixture_files.get(put)
        try:return Path(put).read_text()
        except FileNotFoundError:return None
    return read_file

def main():
    parser=argparse.ArgumentParser(allow_abbrev=False)
    parser.add_argument('--proba',type=Path)
    args=parser.parse_args()
    fixture=None
    if args.proba:
        if args.proba.stat().st_size>1048576:raise ValueError('fixture exceeds 1 MiB')   # B-N-2037: в подставе — текст читателя registry-watchdog (≈62 КБ)
        document=json.loads(args.proba.read_text())
        if not isinstance(document,dict):raise ValueError('fixture must be an object')
        fixture=document['commands']
        if not isinstance(fixture,dict):raise ValueError('fixture commands must be a map')
        files=document.get('files',{})
        if not isinstance(files,dict) or not all(isinstance(k,str) and isinstance(v,str) for k,v in files.items()):raise ValueError('fixture files must be a text map')
        print('ПРОБА: подставные ответы systemctl, не живая команда')
    red=blind=0
    read_file=chitatel(files if fixture is not None else None)
    for name,language in UNITS.items():
        unit=name+'.service'
        try:
            if fixture is None:
                raw=subprocess.run(['systemctl','show','--property=Id,LoadState,ExecStart,Environment,EnvironmentFiles',unit],capture_output=True,text=True,timeout=5,check=True).stdout
            else:raw=fixture[unit]
            if not isinstance(raw,str):raise ValueError('show response is not text')
            values=dict(line.split('=',1) for line in raw.splitlines() if '=' in line)
            if values.get('Id')!=unit or values.get('LoadState')!='loaded':raise ValueError('Id/LoadState do not identify a loaded unit')
            command=values.get('ExecStart','')
            rows=re.findall(r'\{([^{}]*)\}',command)
            if len(rows)!=1:raise ValueError('one effective ExecStart required')
            argv=re.search(r'(?:^|;\s*)argv\[\]=(.*?)(?:\s+;|$)',rows[0])
            if not argv or not argv[1].strip():raise ValueError('effective argv missing')
            path=re.search(r'(?:^\s*|;\s*)path=([^;]+)',rows[0])
            if not path:raise ValueError('effective executable missing')
            actual=argv[1].split()
            reader='/usr/local/sbin/'+name+('.sh' if language=='bash' else '')
            expected=[reader,'--avto-montazh']
            wrapped=['/usr/local/bin/'+language+'-padenie-70',*expected]
            if actual not in [expected,wrapped] or path[1].strip()!=actual[0]:
                print('КРАСНОЕ '+unit+': действующая команда не содержит точный executable/reader и --avto-montazh')
                red+=1
            env=sreda(values,read_file)
            if env.get('MONTAZH_OKNO_BIN','') not in ('',HELPER):
                print('КРАСНОЕ '+unit+': действующий помощник окна MONTAZH_OKNO_BIN='+env['MONTAZH_OKNO_BIN']+' — не '+HELPER);red+=1
            if name=='registry-watchdog':
                for rezhim in ('avto','ruchnoj'):
                    for k,v in komandy_rw(env,read_file,rezhim).items():
                        if v is None:
                            print('НЕ СУДИТСЯ '+unit+': действующая '+k+' ('+rezhim+' режим) пуста — сторож этот блок пропускает');continue
                        est=shlex.split(v).count(KEY)
                        if (rezhim=='avto' and est!=1) or (rezhim=='ruchnoj' and est!=0):
                            print('КРАСНОЕ '+unit+': действующая '+k+' ('+rezhim+' режим, после настройки) — ключ '+KEY+' '+str(est)+' раз: '+v[:160]);red+=1
        except (OSError,ValueError,KeyError,subprocess.SubprocessError) as e:
            print('СЛЕПОТА '+unit+': не получена однозначная действующая команда ('+type(e).__name__+': '+str(e)[:200]+')')
            blind+=1
    return 2 if blind else 1 if red else 0

if __name__=='__main__':
    try:sys.exit(main())
    except (OSError,ValueError,KeyError):
        print('СЛЕПОТА: fixture не прочитана или её форма неверна');sys.exit(2)
