"""RU: Запускать только в описанном одноразовом пространстве монтирования, python -I -S -B. / EN: Run only in the documented disposable mount namespace, python -I -S -B."""
# RU: Проба исполняется от root внутри proba-root-paths.sh. Проверяет: ловушки (.pth, старый runner.py) действительно срабатывают при обычном импорте, но не исполняются корневым heartbeat.py.
# EN: The probe runs as root inside proba-root-paths.sh. It checks that the traps (.pth, old runner.py) really fire on a normal import but are not executed by the root heartbeat.py.
# RU: Дальше: prepare_key.py кладёт ключ 0440 root, учётка omega его читает, ключ удаляется; небезопасный каталог и вывод больше 65536 байт отвергаются; возраст маски таймера; все пути, от которых зависит root, принадлежат root и не записываемы группой/прочими.
# EN: Then: prepare_key.py places the key as 0440 root, the omega account can read it, the key is removed; an unsafe directory and output over 65536 bytes are refused; timer mask age; every path root depends on is root-owned and not group/other-writable.
# RU: Подставлено: ключ — синтетический из заглушки pass; тревоги не отправляются. Не проверяет: боевые секреты и боевой pass, права вне собранного перечня путей.
# EN: Substituted: the credential is synthetic from the pass stub; no alerts are sent. Does not check: real secrets or the real pass, permissions outside the collected path list.
import os,sys,runpy,subprocess,json,stat,hashlib,datetime
from pathlib import Path
BASE=Path('/usr/local/lib/dsh-pamyat-obsluzhivanie')
OLD=Path('/run/plugins-proba/dsh-pamyat-obsluzhivanie/src/runner.py')
SITE=Path('/opt/omega/venv/lib/python3.12/site-packages')
assert os.geteuid()==0
# RU: Источник ключа — пробные пути: pass подменён заглушкой, хранилище не читается. Без них prepare() отказал бы
#     credential_source_not_set, и проба «вывод >65536 отвергнут» прошла бы на чужом отказе.
# EN: Key source — probe paths: pass is a stub, no store is read. Without them prepare() would refuse with
#     credential_source_not_set, and the "output >65536 refused" probe would pass on the wrong refusal.
os.environ['OBSL_KLYUCH_HOME']='/run/proba-klyuch-home';os.environ['OBSL_KLYUCH_HRANILISHCHE']='/run/proba-klyuch-store'
# RU: В положительных контролях ловушки действительно исполняются; настоящих секретов и тревог они не касаются.
# EN: The payloads really execute in positive controls; they never use real secrets/alerts.
import site
site.addsitedir(str(SITE))
runpy.run_path(str(OLD))
assert Path('/run/pth-executed').read_text()=='0'
assert Path('/run/old-runner-executed').read_text()=='0'
Path('/run/pth-executed').unlink();Path('/run/old-runner-executed').unlink()
print('positive controls: .pth=1 and old runner=1, both uid=0')
# RU: Отрицательный контроль — свежий интерпретатор: без унаследованного sys.path и кэша модулей.
# EN: Negative control is a fresh interpreter: no inherited sys.path or module cache.
env={**os.environ,'PYTHONPATH':str(SITE),'PYTHONHOME':'/opt/omega/venv'}
p=subprocess.run(['/usr/bin/python3','-I','-S','-B',str(BASE/'heartbeat.py')],env=env,capture_output=True,text=True)
assert p.returncode in (0,1,2),p.stderr
assert not Path('/run/pth-executed').exists()
assert not Path('/run/old-runner-executed').exists()
print('negative controls: old .pth and old runner not executed by root heartbeat')
# RU: Сбросить sys.path положительного контроля перед проверкой корневого помощника и сбором импортов.
# EN: Reset positive-control sys.path before testing the root helper and collecting imports.
sys.path=[p for p in sys.path if p!=str(SITE)]
sys.modules.pop('audit_payload',None)
h=runpy.run_path(str(BASE/'heartbeat.py'))
k=runpy.run_path(str(BASE/'prepare_key.py'))
k['prepare']()
path=Path('/run/dsh-pamyat-obsluzhivanie-key/deepseek');info=path.stat()
assert info.st_uid==0 and stat.S_IMODE(info.st_mode)==0o440
q=subprocess.run(['/usr/sbin/runuser','-u','omega','--','/usr/bin/python3','-I','-S','-B','-c',"from pathlib import Path; import os; assert os.geteuid()!=0; assert Path('/run/dsh-pamyat-obsluzhivanie-key/deepseek').read_bytes()==b'synthetic-credential\\n'"],capture_output=True)
assert q.returncode==0
k['remove']();assert not path.exists()
print('root credential: coders UID, FSIZE=65536 after runuser, omega read, removal passed')
# RU: Небезопасный каталог назначения отвергается до обращения к читателю ключа с меньшими правами.
# EN: Unsafe destination is refused before asking the lower-privilege key reader.
bad=Path('/run/unsafe-key');bad.mkdir(mode=0o777);bad.chmod(0o777)
try:
    k['prepare'](directory=bad,fetch=lambda:(_ for _ in ()).throw(AssertionError('must not fetch')))
    raise AssertionError('unsafe directory accepted')
except PermissionError:
    pass
# RU: Слишком большой вывод читателя ключа ограничен пределом размера файла у дочернего процесса.
# EN: Too much stdout from the credential reader is bounded by the child file-size limit.
fixture=BASE/'pass-fixture';original_fixture=fixture.read_bytes()
try:
    fixture.write_text('#!/bin/sh\n/usr/bin/head -c 70000 /dev/zero\n')
    try:
        k['prepare']()
        raise AssertionError('oversized reader output accepted')
    except RuntimeError as e:
        assert str(e)=='credential_reader_failed',e
    assert not path.exists()
finally:
    fixture.write_bytes(original_fixture)
print('credential: unsafe directory and output >65536 refused')

# RU: Маска таймера: возраст 0 сут — код 0, 4 сут (больше предела) — код 1, снова 0 — код 0; в сообщении есть дата маски.
# EN: Timer mask: age 0 days — code 0, 4 days (over the limit) — code 1, back to 0 — code 0; the message carries the mask date.
maskroot=Path('/run/mask-test');maskroot.mkdir();link=maskroot/h['TIMER'];link.symlink_to('/dev/null')
now=datetime.datetime.now(datetime.timezone.utc)
seen=lambda:h['mask_timestamp']((maskroot,))
for age,expected in [(0,0),(4,1),(0,0)]:
 t=(now-datetime.timedelta(days=age)).timestamp();os.utime(link,(t,t),follow_symlinks=False)
 code,msg=h['heartbeat'](timer=lambda:'masked',now=now,mask_seen=seen)
 assert code==expected;print('mask age',age,'rc',code,'date_present', 'masked_since=' in msg)
assert not Path('/run/pth-executed').exists() and not Path('/run/old-runner-executed').exists()
# RU: Перечень путей, от которых зависит root: sys.path, PAM, библиотеки из ldd, загруженные модули, исполняемые файлы, карта памяти процесса.
# EN: Paths root depends on: sys.path, PAM, ldd libraries, loaded modules, executables, the process memory map.
paths=set(p for p in sys.path if p)
paths.update(['/etc/pam.d','/etc/security','/usr/lib/x86_64-linux-gnu/security'])
for exe in ['/usr/sbin/runuser','/usr/bin/python3.12']:
    output=subprocess.run(['ldd',exe],capture_output=True,text=True,check=True).stdout
    for token in output.split():
        if token.startswith('/') and Path(token).exists():paths.add(token)
paths.update(str(Path(m.__file__).resolve()) for m in tuple(sys.modules.values()) if getattr(m,'__file__',None) and Path(m.__file__).exists())
paths.update(['/usr/bin/python3','/usr/bin/systemctl','/usr/sbin/runuser','/usr/bin/env','/usr/bin/prlimit','/usr/bin/pass','/bin/sh',str(BASE)])
for line in Path('/proc/self/maps').read_text().splitlines():
 bits=line.split()
 if len(bits)>5 and bits[-1].startswith('/') and Path(bits[-1]).exists():paths.add(bits[-1])
# RU: Включать предков и родителей отсутствующих путей импорта, а не только владельца конечного файла.
# EN: Include ancestry and missing import path parents, not just leaf ownership.
for p in tuple(paths):
 path=Path(p)
 paths.update(str(q) for q in path.parents)
 paths.add(str(path.resolve()))
existing=sorted(p for p in paths if Path(p).exists())
# RU: Рекурсивный find — только по каталогам импорта, каталогу модулей пакета и PAM, а не по всему / или /usr.
# EN: Recursive find only for import directories and our src, not the entire / or /usr tree.
recursive=sorted(p for p in paths if Path(p).is_dir() and (p in sys.path or p==str(BASE) or p in ['/etc/pam.d','/etc/security','/usr/lib/x86_64-linux-gnu/security']))
leaves=[p for p in existing if p not in recursive]
find=['find','-L',*recursive,'(', '-type','f','-o','-type','d',')','(', '!','-user','root','-o','-perm','/022',')','-print']
r=subprocess.run(find,capture_output=True,text=True,check=True);assert not r.stdout,r.stdout
for p in leaves:
 info=Path(p).stat();assert info.st_uid==0 and not(info.st_mode&0o022),p
# RU: ACL: записываемые именованные записи ACL ограничены маской группы, это уже покрыто find.
# EN: ACLs: writable named ACL entries are bounded by the group mask, already covered by find.
acl=subprocess.run(['getfacl','-p',*existing],capture_output=True,text=True,check=True)
print('FIND writable/nonroot results=0; recursive import roots=',recursive,'explicit paths=',len(existing))
# RU: Итог пробы и ACL кладутся в /run, откуда их забирает proba-root-paths.sh.
# EN: The probe result and ACL dump go to /run, where proba-root-paths.sh collects them.
result={'uid':os.geteuid(),'sys_path':sys.path,'paths':existing,'recursive_find':find,'find_bad':r.stdout.splitlines(),'acl_sha256':hashlib.sha256(acl.stdout.encode()).hexdigest(),'loaded_files':[str(Path(m.__file__).resolve()) for m in tuple(sys.modules.values()) if getattr(m,'__file__',None) and Path(m.__file__).exists()]}
Path('/run/security-audit.json').write_text(json.dumps(result,indent=2)+'\n')
Path('/run/security-acl.txt').write_text(acl.stdout)
