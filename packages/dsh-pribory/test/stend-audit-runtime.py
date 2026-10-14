#!/usr/bin/env python3
"""Real tool calls on temporary files; systemctl/journal/sudo/signals are substituted.
No live services, profiles, journals, skill shelves, alerts or secret stores.
"""
from pathlib import Path
import hashlib
import json
import os
import shlex
import shutil
import subprocess
import sys
import tempfile
import unittest

ROOT = Path(sys.argv.pop(1)) if len(sys.argv)>1 else Path(__file__).resolve().parents[1]


class Audit(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory(prefix='pribory-audit-')
        self.addCleanup(self.tmp.cleanup)
        self.d=Path(self.tmp.name); self.bin=self.d/'bin'; self.bin.mkdir()
        self.env=os.environ.copy()
        self.env.update(HOME=str(self.d),DSH_PRIBORY_CONF=str(self.d/'missing.conf'),
                        PATH=str(self.bin)+':'+os.environ['PATH'],LC_ALL='C.UTF-8',PROGON_UCHYOT=str(self.d/'usage'))
        for key in ['IDIOMY','OBLAST','ISKL','MANIFEST_FAJL','POLOZHIT_PROGON','POLOZHIT_SUMMA_PRI_SYOME']:
            self.env.pop(key,None)
        self.helper('logger','pass')
        self.helper('agent-alert','raise AssertionError("live alert forbidden")')
        self.helper('systemctl','import sys\na=sys.argv[1:]\nif "LoadState" in a: print("not-found")\nelif "is-active" in a: print("inactive"); sys.exit(3)\nelse: sys.exit(1)')
        self.helper('sudo','import sys; print("sudo: a password is required",file=sys.stderr); sys.exit(1)')
        self.helper('journalctl','import sys; print("No journal files were found",file=sys.stderr)')

    def helper(self,name,body):
        p=self.bin/name; p.write_text('#!/usr/bin/python3\nfrom pathlib import Path\n'+body+'\n');p.chmod(0o755);return p

    def subject(self,name):
        special={'proba-obrezki.sh':'STEND_OBREZKA','pokrytie-ozhidaniem-prob.mjs':'STEND_POKRYTIE',
                 'iskat-miny-oblasti.mjs':'STEND_MINY','priznak-vzyatiya.mjs':'STEND_PRIZNAK'}
        selected=os.environ.get(special.get(name,''))
        return Path(selected) if selected else Path(os.environ.get('STEND_BIN',ROOT/'bin'))/name

    def run_tool(self,name,*args,stdin=None,**env):
        runner='node' if name.endswith('.mjs') else 'bash'
        return subprocess.run([runner,str(self.subject(name)),*map(str,args)],env=self.env|env,
                              input=stdin,capture_output=True,text=True,timeout=15)

    def obrezka(self,text,manifest=True,exclude=True,missing=False):
        area=self.d/'area'; area.mkdir(); target=area/'input.js';target.write_text(text)
        idioms=self.d/'idioms';idioms.write_text('substring\\(0, *[0-9]+\n')
        areas=self.d/'areas';areas.write_text(str(area)+'\n'+(str(self.d/'absent')+'\n' if missing else ''))
        env={'IDIOMY':str(idioms),'OBLAST':str(areas)}
        if manifest:
            f=self.d/'manifest';f.write_text('fixture|'+str(target)+'|\n');env['MANIFEST_FAJL']=str(f)
        if exclude:env['ISKL']=str(self.d/'no-exceptions')
        return self.run_tool('proba-obrezki.sh',**env)

    def test_01_empty_exclusions_do_not_hide_finding(self):
        q=self.obrezka('const t = s.substring(0, 100);\n',exclude=False)
        self.assertEqual(q.returncode,1,q.stdout+q.stderr)
        self.assertIn('input.js:1:',q.stdout)

    def test_02_absent_manifest_counts_finding_as_own(self):
        q=self.obrezka('const t = s.substring(0, 100);\n',manifest=False)
        self.assertEqual(q.returncode,1,q.stdout+q.stderr)
        self.assertIn('найдено 1',q.stdout)

    def test_03_log_word_in_code_is_not_a_log_filename(self):
        q=self.obrezka('console.log(s.substring(0, 50));\n')
        self.assertEqual(q.returncode,1,q.stdout+q.stderr)
        self.assertIn('input.js:1:',q.stdout)

    def test_04_incomplete_sweep_is_blind(self):
        q=self.obrezka('const t = 1;\n',missing=True)
        self.assertEqual(q.returncode,2,q.stdout+q.stderr)

    def skills(self,registry=True):
        shelf=self.d/'shelf';shelf.mkdir();(shelf/'s1').mkdir();(shelf/'s1/SKILL.md').write_text('---\nname: s1\n---\nbody\n')
        target=self.d/'skills';target.mkdir()
        if registry:self.helper('agent-registry','import sys; print("agent-registry-error: field-not-found",file=sys.stderr); sys.exit(3)')
        return shelf,target

    def test_05_missing_registry_has_explicit_blind_reason(self):
        shelf,target=self.skills(registry=False)
        # A-N-1948 №21 (ворота Вениамина, MED): «реестра нет» нельзя изображать отсутствием заглушки — на машине
        # /usr/local/bin/agent-registry есть, и PATH ночного юнита его находит. PATH пробы — заглушки + /usr/bin:/bin;
        # node (зовётся прибором) — ссылкой из отдельного каталога. Что реестра в этом PATH действительно нет — проверяется.
        nodebin=self.d/'nodebin';nodebin.mkdir();(nodebin/'node').symlink_to(shutil.which('node'))
        path=str(self.bin)+':'+str(nodebin)+':/usr/bin:/bin'
        self.assertIsNone(shutil.which('agent-registry',path=path),'agent-registry виден в PATH пробы — проба не про отсутствие: '+path)
        q=self.run_tool('refresh-skill-links',SKILL_LINKS_SOURCES=str(shelf),SKILL_LINKS_TARGET=str(target),PATH=path)
        self.assertEqual(q.returncode,2,q.stdout+q.stderr)
        self.assertIn('agent-registry',q.stdout+q.stderr)
        self.assertNotIn('command not found',q.stdout+q.stderr)
        self.assertFalse(list(target.iterdir()))

    def test_05_registry_marker_means_field_absent(self):
        shelf,target=self.skills()
        q=self.run_tool('refresh-skill-links',SKILL_LINKS_SOURCES=str(shelf),SKILL_LINKS_TARGET=str(target))
        self.assertEqual(q.returncode,0,q.stdout+q.stderr)
        self.assertEqual((target/'s1').resolve(),shelf/'s1')

    def test_37_missing_source_preserves_links(self):
        shelf,target=self.skills()
        self.helper("agent-registry", "import sys; print(\"нет поля 'navyki'\",file=sys.stderr); sys.exit(3)")
        other=self.d/'unavailable';(target/'old').symlink_to(other/'old')
        q=self.run_tool('refresh-skill-links',SKILL_LINKS_SOURCES=str(shelf)+':'+str(other),SKILL_LINKS_TARGET=str(target))
        self.assertEqual(q.returncode,1,q.stdout+q.stderr)
        self.assertTrue((target/'old').is_symlink())

    def test_08_failed_remove_is_not_success(self):
        folder=self.d/'blocked';folder.mkdir();(folder/'file').write_text('keep')
        conf=self.d/'conf';conf.write_text('UBRAT_KORNI='+str(self.d)+'\n')
        self.helper('rm','import sys; print("Permission denied",file=sys.stderr); sys.exit(1)')
        q=self.run_tool('ubrat',folder,DSH_PRIBORY_CONF=str(conf))
        self.assertEqual(q.returncode,2,q.stdout+q.stderr)
        self.assertTrue((folder/'file').exists())

    def test_09_unknown_unit_is_blind(self):
        q=self.run_tool('pogasit','--unit','absent.service')
        self.assertEqual(q.returncode,2,q.stdout+q.stderr)

    def test_09_bad_port_is_refused(self):
        q=self.run_tool('pogasit','--port','abc')
        self.assertEqual(q.returncode,2,q.stdout+q.stderr)

    def test_09_failed_socket_reader_is_blind(self):
        self.helper('ss','import sys; print("unavailable",file=sys.stderr); sys.exit(1)')
        q=self.run_tool('pogasit','--port','12345')
        self.assertEqual(q.returncode,2,q.stdout+q.stderr)

    def test_10_privileged_liveness_check_retains_live_process(self):
        self.helper('sudo','import sys\na=sys.argv[1:]; a=[x for x in a if x!="-n"]\nif a[0]=="ss": print("LISTEN pid=987654321,")\nelif a[0]=="kill": sys.exit(0)\nelse: sys.exit(1)')
        self.helper('sleep','pass')
        q=self.run_tool('pogasit','--port','12345','--sudo')
        self.assertEqual(q.returncode,3,q.stdout+q.stderr)
        self.assertIn('ЖИВ',q.stdout+q.stderr)

    def test_09_failed_poststop_query_is_blind(self):
        counter=self.d/'status-count'
        self.helper('sleep','pass')
        self.helper('systemctl','import sys\na=sys.argv[1:]\np=Path('+repr(str(counter))+')\nif "LoadState" in a: print("loaded")\nelif "stop" in a: pass\nelse:\n n=int(p.read_text()) if p.exists() else 0; p.write_text(str(n+1))\n if n==0: print("active")\n else: print("bus unavailable",file=sys.stderr); sys.exit(1)')
        q=self.run_tool('pogasit','--unit','proba.service')
        self.assertEqual(q.returncode,2,q.stdout+q.stderr)

    def test_09_transitional_units_are_actually_stopped(self):
        for state in ['activating','reloading','deactivating']:
            with self.subTest(state=state):
                stopped=self.d/'stopped';stopped.unlink(missing_ok=True)
                self.helper('sleep','pass')
                self.helper('systemctl','import sys\na=sys.argv[1:];p=Path('+repr(str(stopped))+')\nif "LoadState" in a: print("loaded")\nelif "stop" in a: p.write_text("stopped")\nelif p.exists(): print("inactive"); sys.exit(3)\nelse: print('+repr(state)+'); sys.exit(3)')
                q=self.run_tool('pogasit','--unit','proba.service')
                self.assertEqual(q.returncode,0,q.stdout+q.stderr)
                self.assertTrue(stopped.exists(),'tool reported success without stopping the transitional unit')

    def test_09_transitional_state_after_stop_is_refusal(self):
        # A-N-1948 №21 (ворота Вениамина, LOW-2): stop прошёл, а юнит после него в переходном состоянии — отказ 3, не успех.
        for posle in ['deactivating','activating','active','reloading']:
            with self.subTest(posle=posle):
                stopped=self.d/'stopped';stopped.unlink(missing_ok=True)
                self.helper('sleep','pass')
                self.helper('systemctl','import sys\na=sys.argv[1:];p=Path('+repr(str(stopped))+')\nif "LoadState" in a: print("loaded")\nelif "stop" in a: p.write_text("stopped")\nelif p.exists(): print('+repr(posle)+'); sys.exit(0 if '+repr(posle)+'=="active" else 3)\nelse: print("active")')
                q=self.run_tool('pogasit','--unit','proba.service')
                self.assertEqual(q.returncode,3,q.stdout+q.stderr)
                self.assertTrue(stopped.exists(),'stop не звался — проба не про состояние после stop')
                self.assertIn('не остановился',q.stdout+q.stderr)

    def test_10_unavailable_liveness_reader_is_blind(self):
        self.helper('sleep','pass')
        self.helper('sudo','import sys\na=[x for x in sys.argv[1:] if x!="-n"]\nif a[0]=="ss": print("LISTEN pid=987654321,")\nelif a[0]=="kill" and "-0" in a: print("sudo: permission denied",file=sys.stderr); sys.exit(1)\nelif a[0]=="kill": pass\nelse: sys.exit(1)')
        q=self.run_tool('pogasit','--port','12345','--sudo')
        self.assertEqual(q.returncode,2,q.stdout+q.stderr)

    def test_09_failed_postsignal_socket_reader_is_blind(self):
        self.helper('sleep','pass');counter=self.d/'socket-count'
        self.helper('sudo','import sys\na=[x for x in sys.argv[1:] if x!="-n"];p=Path('+repr(str(counter))+')\nif a[0]=="ss":\n if p.exists(): print("socket reader unavailable",file=sys.stderr); sys.exit(1)\n p.write_text("1"); print("LISTEN pid=987654321,")\nelif a[0]=="kill" and "-0" in a: print("No such process",file=sys.stderr); sys.exit(1)\nelif a[0]=="kill": pass\nelse: sys.exit(1)')
        q=self.run_tool('pogasit','--port','12345','--sudo')
        self.assertEqual(q.returncode,2,q.stdout+q.stderr)

    def place(self,name,text,**env):
        p=self.d/name;p.parent.mkdir(parents=True,exist_ok=True);p.write_text('ORIGINAL\n')
        q=self.run_tool('polozhit',p,stdin=text,**env)
        return q,p

    def test_12_invalid_grammar_without_shebang_never_replaces(self):
        for name,text in [('bad.mjs','let x = ;\n'),('bad.sh','if then\n')]:
            with self.subTest(name=name):
                q,p=self.place(name,text);self.assertEqual(q.returncode,3,q.stdout+q.stderr);self.assertEqual(p.read_text(),'ORIGINAL\n')

    def test_13_python_path_name_does_not_select_node(self):
        q,p=self.place('node-tools/good.py','x = 1\n');self.assertEqual(q.returncode,0,q.stdout+q.stderr);self.assertEqual(p.read_text(),'x = 1\n')

    def test_14_stale_env_checksum_has_preplacement_code(self):
        q,p=self.place('hash.txt','NEW\n',POLOZHIT_SUMMA_PRI_SYOME='0'*32)
        self.assertEqual(q.returncode,5,q.stdout+q.stderr);self.assertEqual(p.read_text(),'ORIGINAL\n')

    def test_14_foreign_edit_between_take_and_place_refuses(self):
        # A-N-1948 №21 (ворота Вениамина, LOW-1): --esli-summa — сумма снята при съёме, между съёмом и укладкой цель
        # правит чужая рука → код 5, цель не тронута (остаётся чужая правка). Контроль: верная сумма → 0, положено.
        p=self.d/'shared.sh';p.write_text('#!/bin/bash\necho original\n')
        snyato=hashlib.sha256(p.read_bytes()).hexdigest()[:16]
        p.write_text('#!/bin/bash\necho foreign\n')
        q=self.run_tool('polozhit',p,'--esli-summa',snyato,stdin='#!/bin/bash\necho mine\n')
        self.assertEqual(q.returncode,5,q.stdout+q.stderr);self.assertEqual(p.read_text(),'#!/bin/bash\necho foreign\n')
        tek=hashlib.sha256(p.read_bytes()).hexdigest()[:16]
        q=self.run_tool('polozhit',p,'--esli-summa',tek,stdin='#!/bin/bash\necho mine\n')
        self.assertEqual(q.returncode,0,q.stdout+q.stderr);self.assertEqual(p.read_text(),'#!/bin/bash\necho mine\n')

    def test_15_python_compile_leaves_no_cache(self):
        q,p=self.place('good.py','#!/usr/bin/python3\nx=1\n');self.assertEqual(q.returncode,0,q.stdout+q.stderr);self.assertFalse((self.d/'__pycache__').exists())

    def test_15_python_encoding_cookie_is_respected(self):
        p=self.d/'latin.py';p.write_bytes(b'ORIGINAL\n')
        body=b"# coding: latin-1\nvalue = 'caf\xe9'\n"
        q=subprocess.run(['bash',str(self.subject('polozhit')),str(p)],env=self.env,input=body,capture_output=True,timeout=10)
        self.assertEqual(q.returncode,0,q.stdout+q.stderr);self.assertEqual(p.read_bytes(),body)

    def test_14_unknown_atomicity_has_its_own_placed_code(self):
        self.helper('stat','import os,sys\nif sys.argv[1:3]==["-c","%i"]: sys.exit(1)\nos.execv("/usr/bin/stat",["stat",*sys.argv[1:]])')
        q,p=self.place('placed.txt','NEW\n')
        self.assertEqual(q.returncode,7,q.stdout+q.stderr);self.assertEqual(p.read_text(),'NEW\n')

    def test_unknown_option_never_places(self):
        p=self.d/'untouched.txt';p.write_text('ORIGINAL\n')
        q=self.run_tool('polozhit',p,'--dry-run',stdin='NEW\n')
        self.assertEqual(q.returncode,3,q.stdout+q.stderr);self.assertEqual(p.read_text(),'ORIGINAL\n')

    def test_16_absent_tree_is_blind(self):
        q=self.run_tool('dvojniki',DVOJNIKI_DEREVYA=str(self.d/'absent'),DVOJNIKI_PATH_KAT=str(self.bin))
        self.assertEqual(q.returncode,2,q.stdout+q.stderr)

    def test_20_empty_journal_is_blind(self):
        self.helper('sudo','import os,sys\na=sys.argv[1:]; a=a[1:] if a[:1]==["-n"] else a; os.execvpe(a[0],a,os.environ)')
        q=self.run_tool('kto-pravil-fajl',self.d/'config.yml')
        self.assertEqual(q.returncode,2,q.stdout+q.stderr)

    def test_20_no_entries_marker_is_not_a_record(self):
        self.helper('sudo','import os,sys\na=sys.argv[1:]; a=a[1:] if a[:1]==["-n"] else a; os.execvpe(a[0],a,os.environ)')
        self.helper('journalctl','print("-- No entries --")')
        q=self.run_tool('kto-pravil-fajl',self.d/'config.yml')
        self.assertEqual(q.returncode,2,q.stdout+q.stderr)

    def test_21_same_basename_in_other_directory_is_not_my_file(self):
        self.helper('sudo','import os,sys\na=sys.argv[1:]; a=a[1:] if a[:1]==["-n"] else a; os.execvpe(a[0],a,os.environ)')
        self.helper('journalctl','import sys,json\nif "-n" in sys.argv: print(json.dumps({"__REALTIME_TIMESTAMP":"1790416800000000","MESSAGE":"window record"}))\nelse: print("Sep 26 host sudo[1]: bob : PWD=/tmp ; USER=root ; COMMAND=/usr/bin/touch /other/config.yml")')
        q=self.run_tool('kto-pravil-fajl',self.d/'config.yml')
        self.assertEqual(q.returncode,0,q.stdout+q.stderr)
        self.assertNotIn('ПРАВИЛИ:',q.stdout)

    def test_21_dd_output_operand_matches_the_full_path(self):
        self.helper('sudo','import os,sys\na=sys.argv[1:];a=a[1:] if a[:1]==["-n"] else a;os.execvpe(a[0],a,os.environ)')
        target=self.d/'output.cfg'
        self.helper('journalctl','import sys,json\nif "-n" in sys.argv: print(json.dumps({"__REALTIME_TIMESTAMP":"1790416800000000","MESSAGE":"window"}))\nelse: print('+repr('Sep 26 host sudo[1]: bob : PWD=/tmp ; USER=root ; COMMAND=/usr/bin/dd if=/input of='+str(target))+')')
        q=self.run_tool('kto-pravil-fajl',target)
        self.assertEqual(q.returncode,1,q.stdout+q.stderr)
        self.assertIn('ПРАВИЛИ:',q.stdout)

    def test_existing_healthy_actions_remain_green(self):
        q=self.obrezka('const t=1;\n');self.assertEqual(q.returncode,0,q.stdout+q.stderr)
        self.helper('systemctl','import sys\na=sys.argv[1:]\nif "LoadState" in a: print("loaded")\nelse: print("inactive"); sys.exit(3)')
        q=self.run_tool('pogasit','--unit','loaded.service');self.assertEqual(q.returncode,0,q.stdout+q.stderr)
        self.helper('ss','pass')
        q=self.run_tool('pogasit','--port','12345');self.assertEqual(q.returncode,0,q.stdout+q.stderr)
        q,p=self.place('valid.mjs','export const value=1;\n');self.assertEqual(q.returncode,0,q.stdout+q.stderr)
        q=self.run_tool('pokrytie-ozhidaniem-prob.mjs',self.d);self.assertEqual(q.returncode,0,q.stdout+q.stderr)
        good=self.d/'good.js';good.write_text('const value=1;\n')
        q=self.run_tool('iskat-miny-oblasti.mjs',good);self.assertEqual(q.returncode,0,q.stdout+q.stderr)
        package=self.d/'node_modules/fixture';package.mkdir(parents=True)
        (package/'package.json').write_text('{"version":"1.2.3","main":"index.js"}')
        (package/'index.js').write_text('module.exports={};\n')
        q=self.run_tool('priznak-vzyatiya.mjs',self.d,'fixture');self.assertEqual(q.returncode,0,q.stdout+q.stderr);self.assertIn('1.2.3',q.stdout)

    def journal_fixture(self):
        self.helper('journalctl', '''import sys,json,os,datetime
a=sys.argv[1:]
base=int(datetime.datetime(2026,9,26,10,5,tzinfo=datetime.timezone.utc).timestamp())
def iso(t):
    off=3 if os.environ.get('TZ')=='Europe/Moscow' and '--utc' not in a else 0
    return datetime.datetime.fromtimestamp(t,datetime.timezone(datetime.timedelta(hours=off))).strftime('%Y-%m-%dT%H:%M:%S%z')
rows=[]
for user,second,service,session in [('alice',5,'proba.service','111'),('bob',45,'proba.service','111'),('other',49,'claude-oauth-gateway@proba.service','222')]:
    rows.append({'MESSAGE':user+' : PWD=/tmp ; USER=root ; COMMAND=/usr/bin/systemctl restart '+service,
      '__REALTIME_TIMESTAMP':str((base+second)*1000000),'_AUDIT_SESSION':session,'_SYSTEMD_UNIT':user+'.service'})
if '-n' in a: print('readable journal record')
elif '-u' in a:
    for second in [10,50]: print(iso(base+second)+' host systemd[1]: Started proba.service - Proba.')
elif 'json' in a:
    for row in rows: print(json.dumps(row))
else:
    for row in rows: print(iso(int(row['__REALTIME_TIMESTAMP'])/1000000)+' host sudo[123]: '+row['MESSAGE'])
''')
        gate=self.d/'gate';gate.write_text('2026-09-26 10:05:00 UTC | ДО | proba.service |\n')
        return gate

    def test_17_two_starts_same_minute_have_distinct_hands(self):
        gate=self.journal_fixture()
        q=self.run_tool('kto-podnimal','proba.service','2026-09-26',ZHURNAL_VOROT=str(gate),TZ='UTC')
        self.assertEqual(q.returncode,0,q.stdout+q.stderr)
        self.assertIn('рука: alice',q.stdout);self.assertIn('рука: bob',q.stdout)

    def test_18_nonUTC_caller_uses_UTC_for_gate_and_sessions(self):
        gate=self.journal_fixture()
        q=self.run_tool('kto-podnimal','proba.service','2026-09-26',ZHURNAL_VOROT=str(gate),TZ='Europe/Moscow')
        self.assertEqual(q.returncode,0,q.stdout+q.stderr)
        self.assertIn('заход 111',q.stdout)

    def test_19_gateway_namesake_is_not_the_agent_session(self):
        gate=self.journal_fixture()
        q=self.run_tool('kto-podnimal','proba.service','2026-09-26',ZHURNAL_VOROT=str(gate),TZ='UTC')
        self.assertEqual(q.returncode,0,q.stdout+q.stderr)
        self.assertNotIn('заход 222',q.stdout)

    def test_19_start_action_has_session_as_well_as_restart(self):
        gate=self.journal_fixture()
        helper=self.bin/'journalctl';helper.write_text(helper.read_text().replace('COMMAND=/usr/bin/systemctl restart ','COMMAND=/usr/bin/systemctl start '))
        q=self.run_tool('kto-podnimal','proba.service','2026-09-26',ZHURNAL_VOROT=str(gate),TZ='UTC')
        self.assertEqual(q.returncode,0,q.stdout+q.stderr)
        self.assertIn('заход 111',q.stdout)

    def test_19_escaped_unit_name_is_data_in_session_matching(self):
        gate=self.journal_fixture();service=r'proba\x2dname.service'
        helper=self.bin/'journalctl';text=helper.read_text().replace("'proba.service'",repr(service))
        text=text.replace("+service,", "+__import__('shlex').quote(service),")
        compile(text,"journal-fixture","exec")
        helper.write_text(text)
        gate.write_text('2026-09-26 10:05:00 UTC | ДО | '+service+' |\n')
        q=self.run_tool('kto-podnimal',service,'2026-09-26',ZHURNAL_VOROT=str(gate),TZ='UTC')
        self.assertEqual(q.returncode,0,q.stdout+q.stderr)
        self.assertIn('заход 111',q.stdout)

    def test_22_unavailable_second_hand_is_blind(self):
        q=self.run_tool('obeimi-rukami','true',OBEIMI_KTO='nobody')
        self.assertEqual(q.returncode,2,q.stdout+q.stderr)
        self.assertNotIn('РАЗОШЛИСЬ КОДЫ',q.stdout)

    def test_23_missing_walk_root_is_blind(self):
        q=self.run_tool('pokrytie-ozhidaniem-prob.mjs',self.d/'absent');self.assertEqual(q.returncode,2,q.stdout+q.stderr);self.assertNotIn('Error:',q.stderr)

    def test_24_missing_input_is_blind(self):
        for args in [[],[self.d/'missing.js']]:
            with self.subTest(args=args):
                q=self.run_tool('iskat-miny-oblasti.mjs',*args);self.assertEqual(q.returncode,2,q.stdout+q.stderr);self.assertNotIn('Error:',q.stderr)

    def test_25_nonexistent_root_and_unresolved_name_differ(self):
        q=self.run_tool('priznak-vzyatiya.mjs',self.d/'absent','missing-package');self.assertEqual(q.returncode,2,q.stdout+q.stderr)
        q=self.run_tool('priznak-vzyatiya.mjs',self.d,'missing-package');self.assertEqual(q.returncode,1,q.stdout+q.stderr)

    def test_25_unreadable_resolution_root_is_blind(self):
        root=self.d/'closed';root.mkdir();root.chmod(0)
        try:
            if os.access(root,os.R_OK|os.X_OK): self.skipTest("СЛЕПОТА: полномочия обходят chmod000 — непрочитываемая подстава не состоялась")
            q=self.run_tool('priznak-vzyatiya.mjs',root,'fixture')
            self.assertEqual(q.returncode,2,q.stdout+q.stderr)
        finally: root.chmod(0o700)

    def test_25_relative_readable_root_resolves_normally(self):
        package=self.d/'root/node_modules/fixture';package.mkdir(parents=True)
        (package/'package.json').write_text('{"version":"1.2.3","main":"index.js"}')
        (package/'index.js').write_text('module.exports={};\n')
        q=self.run_tool('priznak-vzyatiya.mjs',os.path.relpath(self.d/'root'),'fixture')
        self.assertEqual(q.returncode,0,q.stdout+q.stderr);self.assertIn('1.2.3',q.stdout)

    def test_27_dump_uses_selected_node_path(self):
        home=self.d/'home';(home/'profiles/web').mkdir(parents=True);(home/'profiles/web/cordis.yml').write_text('ORIGINAL')
        app=self.d/'app';file=app/'node_modules/@deepseek-ai/dsh/lib/bin.js';file.parent.mkdir(parents=True);file.write_text('')
        node=self.helper('node','import sys; print("synthetic platform"); sys.exit(5)')
        q=self.run_tool('dsh-dump-kopiya',home,app,NODE=str(node))
        self.assertEqual(q.returncode,5,q.stdout+q.stderr);self.assertIn('synthetic platform',q.stdout);self.assertEqual((home/'profiles/web/cordis.yml').read_text(),'ORIGINAL')

    def test_32_invalid_line_count_is_refused(self):
        for key in ['-k','-g']:
            with self.subTest(key=key):
                q=self.run_tool('progon',key,'abc','true');self.assertEqual(q.returncode,2,q.stdout+q.stderr);self.assertNotIn('integer expression expected',q.stderr)


if __name__=='__main__':
    special={'proba-obrezki.sh':'STEND_OBREZKA','pokrytie-ozhidaniem-prob.mjs':'STEND_POKRYTIE',
             'iskat-miny-oblasti.mjs':'STEND_MINY','priznak-vzyatiya.mjs':'STEND_PRIZNAK'}
    for name in ['proba-obrezki.sh','refresh-skill-links','ubrat','pogasit','polozhit','dvojniki',
                 'kto-podnimal','kto-pravil-fajl','obeimi-rukami','pokrytie-ozhidaniem-prob.mjs',
                 'iskat-miny-oblasti.mjs','priznak-vzyatiya.mjs','dsh-dump-kopiya','progon']:
        selected=os.environ.get(special.get(name,''))
        path=Path(selected) if selected else Path(os.environ.get('STEND_BIN',ROOT/'bin'))/name
        if not path.is_file() or not os.access(path,os.R_OK):
            print('СЛЕПОТА: исходник прибора отсутствует/не читается: '+str(path));sys.exit(2)
    if not shutil.which('node'):
        print('СЛЕПОТА: Node не найден в PATH');sys.exit(2)
    run=unittest.main(verbosity=2,exit=False)
    sys.exit(1 if not run.result.wasSuccessful() else 2 if run.result.skipped else 0)
