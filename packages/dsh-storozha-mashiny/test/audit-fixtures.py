"""Machine guards on private fixtures and recording alert/repair stubs only."""
from pathlib import Path
import tempfile,subprocess,os,json,hashlib,shutil,sys
pkg=Path(__file__).resolve().parents[1];ok=bad=blind=0
os.umask(0o077)
if os.geteuid()==0:print('СЛЕПОТА: stend-audit требует непривилегированную учётку (пробы прав apt/состояния)');sys.exit(2)
for tool in ['jq','node','bash']:
    if not shutil.which(tool):print('СЛЕПОТА: нет '+tool);sys.exit(2)
try:import yaml
except ImportError:print('СЛЕПОТА: нет python3-yaml');sys.exit(2)
def check(name,fn):
    global ok,bad
    try:fn();ok+=1;print('ok   '+name,flush=True)
    except Exception as e:bad+=1;print('FAIL '+name+': '+str(e),flush=True)
def require(value,text):
    if not value:raise AssertionError(text)
with tempfile.TemporaryDirectory(prefix='mashiny-audit-') as td:
    t=Path(td);stubs=t/'commands';stubs.mkdir();alert=t/'alerts';calls=t/'calls';conf=t/'empty.conf';conf.write_text('')
    env={'PATH':str(stubs)+':/usr/local/bin:/usr/bin:/bin','DSH_STOROZHA_MASHINY_CONF':str(conf),'HOME':str(t),'TEST_ROOT':str(t)}
    def stub(name,text):
        p=stubs/name;p.write_text('#!/bin/sh\n'+text+'\n');p.chmod(0o755);return p
    stub('agent-alert','printf "%s\\n===\\n" "$1" >> "$TEST_ROOT/alerts"; [ ! -e "$TEST_ROOT/alert-failed" ]')
    stub('logger',':')
    def run(name,extra=None,args=()):
        return subprocess.run([str(pkg/'bin'/name),*map(str,args)],env=env|(extra or {}),capture_output=True,text=True,timeout=30)
    def state_fixture():
        stub('ps','case "$*" in "-eo pid=,comm=,args=") echo "500 node /fixture/gateway.mjs";; "-o comm= -p "*) echo claude;; "-o ppid= -p "*) echo 500;; "-o etime= -p "*) echo 00:07;; esac')
        stub('pgrep','echo "701 702"');stub('systemctl',':');stub('date','echo "${TEST_NOW:-1000}"')
    def future_state():
        state_fixture();state=t/'future';state.write_text('10001000');before=hashlib.sha256(state.read_bytes()).hexdigest()
        q=run('storozh-dvizhkov.sh',{'SD_SHLYUZ':'/fixture/gateway.mjs','SD_SOSTOYANIE':str(state)})
        require(q.returncode==0,q.stdout+q.stderr);require(state.read_text()=='1000','future mark not reset: '+q.stdout)
        require('-10000000' not in q.stdout,'negative duration treated as healthy')
        after=hashlib.sha256(state.read_bytes()).hexdigest();require(before!=after,'no state replacement');require(subprocess.run(['grep','-cF','1000',str(state)],capture_output=True,text=True).stdout.strip()=='1','state content control');print('STATE_CONTROL',before,'->',after,flush=True)
    check('01 future epoch resets to now instead of silencing forever',future_state)
    def malformed_state():
        state_fixture()
        for text in ['not-a-timestamp','08','9'*30]:
            state=t/'invalid';state.write_text(text)
            q=run('storozh-dvizhkov.sh',{'SD_SHLYUZ':'/fixture/gateway.mjs','SD_SOSTOYANIE':str(state)})
            require(q.returncode==(1 if text=='08' else 0),q.stdout+q.stderr)
            if text!='08':require(state.read_text()=='1000','invalid mark was retained')
            else:require('value too great for base' not in q.stderr,'decimal mark parsed as octal')
    check('01 malformed/oversize/leading-zero epochs are handled before arithmetic',malformed_state)
    def state_objects():
        state_fixture();state=t/'guard-state';state.write_text('1000')
        e={'SD_SHLYUZ':'/fixture/gateway.mjs','SD_SOSTOYANIE':str(state)}
        for kind in ['symlink','directory','writable-file','writable-parent','stat-failed']:
            state.unlink(missing_ok=True)
            if kind=='symlink':state.symlink_to(t/'outside')
            elif kind=='directory':state.mkdir()
            else:state.write_text('1000')
            if kind=='writable-file':state.chmod(0o666)
            if kind=='writable-parent':t.chmod(0o777)
            if kind=='stat-failed':stub('stat','exit 1')
            q=run('storozh-dvizhkov.sh',e)
            require(q.returncode==2 and 'СЛЕПОТА' in q.stdout+q.stderr,kind+': '+q.stdout+q.stderr)
            if kind=='directory':state.rmdir()
            else:state.unlink()
            t.chmod(0o700)
            if kind=='stat-failed':(stubs/'stat').unlink()
        state.write_text('1000');t.chmod(0o500);stub('pgrep','echo 701')
        try:
            q=run('storozh-dvizhkov.sh',e)
            require(q.returncode==2 and 'СЛЕПОТА' in q.stdout+q.stderr,'readonly state removal: '+q.stdout+q.stderr)
        finally:t.chmod(0o700)
        stub('pgrep','echo "701 702"')
        state.write_text('10001000');alert.unlink(missing_ok=True)
        q=run('storozh-dvizhkov.sh',e);require(q.returncode==0 and not alert.exists(),q.stdout+q.stderr)
        q=run('storozh-dvizhkov.sh',e|{'TEST_NOW':'1400'})
        require(q.returncode==1 and alert.exists() and '400' in alert.read_text(),q.stdout+q.stderr)
        stub('pgrep','echo 701')
        q=run('storozh-dvizhkov.sh',e|{'TEST_NOW':'1400'})
        require(q.returncode==0 and not state.exists(),'healthy state did not clear: '+q.stdout+q.stderr)
    check('01 state object refusals and reset-alert-recovery cycle',state_objects)
    def settings():
        quoted=t/'quoted.conf';quoted.write_text('TASK_VALUE="q" \t\n')
        q=subprocess.run(['timeout','10',str(pkg/'lib/nastrojka'),'TASK_VALUE','DEFAULT'],env=env|{'DSH_STOROZHA_MASHINY_CONF':str(quoted)},capture_output=True,text=True)
        require(q.returncode==0 and q.stdout=='q\n',q.stdout+q.stderr)
        q=subprocess.run(['timeout','10',str(pkg/'lib/nastrojka'),'TASK_VALUE','DEFAULT'],env=env|{'DSH_STOROZHA_MASHINY_CONF':str(t)},capture_output=True,text=True)
        require(q.returncode==2 and 'ОТКАЗ' in q.stderr,'directory silently used default: '+q.stdout+q.stderr)
    check('14 trailing blanks after outer quotes and directory-as-config are explicit',settings)
    def upstream():
        stub('npm','echo \'{"alpha":"1.1.0-alpha.1"}\'')
        releases=[{'tag_name':'v1.1.0-alpha.10','body':'security fix'},{'tag_name':'v1.1.0-alpha.1','body':'ordinary change'}]
        (t/'releases.json').write_text(json.dumps(releases))
        curl=stubs/'curl';curl.write_text(r'''#!/usr/bin/python3
import os,json,sys
from pathlib import Path
t=Path(os.environ['TEST_ROOT']);args=sys.argv[1:];(t/'urls').open('a').write(' '.join(args)+'\n')
rows=json.loads((t/'releases.json').read_text());url=args[-1]
if '/releases/tags/' in url:
 tag=url.rsplit('/',1)[-1];row=rows[0] if (t/'bad-tag').exists() else next((r for r in rows if r['tag_name']==tag),None)
 if row is None:sys.exit(22)
 print(json.dumps(row))
else:print(json.dumps(rows))
''');curl.chmod(0o755)
        state=t/'upstream-state';alert.unlink(missing_ok=True);(t/'pkg.json').write_text('{"dependencies":{"@deepseek-ai/dsh":"1.0.0"}}')
        q=run('dsh-upstream-watch.sh',{'DSH_SOSTOYANIE':str(state),'DSH_PACKAGE_JSON':str(t/'pkg.json'),'DSH_ALERT':str(stubs/'agent-alert')})
        require(q.returncode==1,q.stdout+q.stderr);require(not alert.exists(),'alpha.10 security matched alpha.1')
        require('/releases/tags/v1.1.0-alpha.1' in (t/'urls').read_text(),'only a bounded releases page was queried')
        (t/'bad-tag').touch();state.unlink(missing_ok=True)
        q=run('dsh-upstream-watch.sh',{'DSH_SOSTOYANIE':str(state),'DSH_PACKAGE_JSON':str(t/'pkg.json'),'DSH_ALERT':str(stubs/'agent-alert')})
        require(q.returncode==2 and not alert.exists(),'mismatched response accepted: '+q.stdout+q.stderr)
        require('1.1.0-alpha.1' not in state.read_text(),'invalid reply was recorded')
    check('15 exact release tag supplies its own notes, not a similar version',upstream)
    def dkms_version():
        stub('dpkg-query','echo linux-image-6.8.0-fixture')
        stub('dkms','printf "%s\\n" "$*" >> "$TEST_ROOT/calls"; case "$1" in status) echo "probamod/2.6.1+ds-1, 6.8.0-fixture, x86_64: installed";; install) exit 1;; esac')
        stub('dpkg','echo "ii headers"');stub('apt-get','echo "repair-blocked" >> "$TEST_ROOT/calls"; exit 1')
        q=run('dkms-kernel-coverage-check.sh',{'DKMS_COVERAGE_MODULE':'probamod'})
        require(q.returncode==0,'expected fully covered/no repair; code '+str(q.returncode)+' calls '+calls.read_text());require('install ' not in calls.read_text(),'truncated version caused a needless repair')
    check('17 DKMS suffix version remains whole and avoids false repair',dkms_version)
    def dkms_delivery():
        stub('dpkg-query','echo linux-image-6.8.0-fixture')
        stub('dkms','case "$1" in status) echo "probamod/2.0, 6.7.0-fixture, x86_64: installed";; install) exit 1;; esac')
        (t/'alert-failed').touch();q=run('dkms-kernel-coverage-check.sh',{'DKMS_COVERAGE_MODULE':'probamod'});(t/'alert-failed').unlink()
        require(q.returncode==1,q.stdout+q.stderr);require('НЕ доставлена' in q.stdout+q.stderr,'channel failure was silent')
    check('17 failed alert is named even when module repair already failed',dkms_delivery)
    def apt_suites():
        # Execute the actual existing apt fixture stand, changing only its security suite ordering.
        original=(pkg/'test/stend-apt-notify.sh').read_text();changed=original.replace('zlo/noble-security 9.9','zlo/noble-security,noble-updates 9.9');require(changed!=original,'suite fixture was not changed')
        f=t/'apt-suites.sh';f.write_text(changed)
        q=subprocess.run(['bash',str(f)],env={'PATH':'/usr/local/bin:/usr/bin:/bin','CEL':str(pkg/'bin/apt-updates-notify.sh')},capture_output=True,text=True,timeout=90)
        require(q.returncode==0,q.stdout[-4500:]+q.stderr)
    check('16 security suite before an updates suite is still classified as security',apt_suites)
    def explicit_copy_hint():
        names=['@deepseek-ai/'+n for n in ['cordis','cosmokit','schemastery','dsh-attachment','dsh-brand','dsh-invariants','dsh-llm','dsh-timeout']]+['@standard-schema/spec']
        base=t/'copy-base/node_modules';app=t/'copy-app/node_modules'
        for root in [base,app]:
            for name in names:
                d=root/name;d.mkdir(parents=True);(d/'index.js').write_text('same code');(d/'package.json').write_text('{"version":"1.0.0"}')
        (app/names[0]/'index.js').write_text('changed code')
        alert.unlink(missing_ok=True)
        sink=stub('copy-alert','printf "%s\\n" "$3" >> "$TEST_ROOT/alerts"')
        q=run('dve-kopii-watch',{'DKW_ALERT':str(sink),'DKW_SOSTOYANIE':str(t/'copy-state')},['--osnova',base,'--app','fixture='+str(app)])
        require(q.returncode==1 and ('чинить: выровнять копию в '+str(base.parent)+' с app') in alert.read_text(),q.stdout+q.stderr)
    check('24 hint uses explicit --osnova instead of absent environment value',explicit_copy_hint)
    def interrupted_tasks():
        # The complete registry/profile/letter path is private and the tell sink only copies its input.
        homes={}
        for agent in ['alpha','beta']:
            home=t/agent;(home/'.dsh/profiles/web').mkdir(parents=True);homes[agent]=home
        scalar=t/'scalar-tasks';scalar.mkdir();one=t/'list-one';one.mkdir();two=t/'list-two';two.mkdir()
        (homes['alpha']/'.dsh/profiles/web/cordis.patch.yml').write_text(f'insert:\n - config:\n    putOtklonennyh: {scalar}\n')
        (homes['beta']/'.dsh/profiles/web/cordis.patch.yml').write_text(f'insert:\n - config:\n    putOtklonennyh:\n     - {one}\n     - {two}\n')
        registry=stubs/'registry';registry.write_text('''#!/usr/bin/python3
import os,json,sys
from pathlib import Path
t=Path(os.environ['TEST_ROOT'])
if sys.argv[1]=='list':print('alpha  (fixture)\nbeta  (fixture)')
elif sys.argv[1]=='pole':print(json.dumps(str(t/sys.argv[2]) if sys.argv[3]=='dom' else ''))
'''.replace("(fixture)\nbeta", "(fixture)\\nbeta"));registry.chmod(0o755)
        stub('journalctl',':')
        stub('tell','cp "$1" "$TEST_ROOT/letter.md"; echo "положено: fixture"')
        state=t/'orders-state';e={'ZPW_REESTR_BIN':str(registry),'ZPW_TELL_BIN':str(stubs/'tell'),'ZPW_JOURNALCTL':str(stubs/'journalctl'),'ZPW_SOST':str(state),'ZPW_KOREN':str(t/'sender'),'ZPW_ADRESAT':'fixture'}
        q=run('zadaniya-prervany-watch',e);require(q.returncode==0,q.stdout+q.stderr)
        require('каталогов 3' in q.stdout,'YAML list agent silently omitted: '+q.stdout)
        data={'srez':'safe\n• FORGED-LINE\u0085NEXT\u2028NEXT\u2029NEXT','pozvana':'now\r\n• FORGED-LINE','avtopovtor':{'status':'🧪'*1000}}
        target=one/'zadanie-prervan-1000-42.txt';target.write_text(json.dumps(data))
        q=run('zadaniya-prervany-watch',e|{'ZPW_SEYCHAS':str(int(target.stat().st_ctime)+4000)})
        require(q.returncode==0,q.stdout+q.stderr);letter=(t/'letter.md').read_text()
        require(not any(c in letter for c in ['\u0085','\u2028','\u2029']), 'Unicode separators remained in letter')
        require('\n• FORGED-LINE' not in letter,'agent field became a new order line')
        require(max(map(len,letter.splitlines()))<1000,'unbounded task field copied to coordinator')
    check('20-21 scalar/list profile paths are counted and task fields remain bounded data',interrupted_tasks)
print(f'ИТОГ: ok={ok} FAIL={bad} СЛЕПОТА={blind}')
raise SystemExit(1 if bad else 2 if blind else 0)
