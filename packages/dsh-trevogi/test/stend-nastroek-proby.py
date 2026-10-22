#!/usr/bin/env python3
# RU: Запускает настоящий код с подставными сетевым и журнальным выходами. Ловит игнорирование метки,
# конфигурации и утечку токена; не проверяет настоящий канал или права чужой учётной записи.
# EN: Runs real code with network/journal doubles. Detects ignored probe/configuration and token leaks;
# does not test the real channel or another account's permissions.
import grp, json, os, pathlib, subprocess, tempfile, unittest
ROOT = pathlib.Path(os.environ.get('TREVOGI_TEST_ROOT', pathlib.Path(__file__).resolve().parents[1]))

class AlertTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(prefix='trevogi-test-')
        self.d = pathlib.Path(self.tmp.name)
        (self.d/'bin').mkdir()
        self.token = 'TEST_ONLY_TOKEN_123'  # vorota-ob:dopusk=TOKEN
        (self.d/'token').write_text(self.token+'\n'); (self.d/'token').chmod(0o640); (self.d/'chat').write_text('12345\n')
        (self.d/'tail').write_text(''); (self.d/'empty.conf').write_text('# fixture\n')
        self.env = {k:v for k,v in os.environ.items() if not k.startswith(('AGENT_ALERT_', 'OTKAZ_KLYUCH_', 'DSH_TREVOGI_', 'DSH_PROBA'))}
        self.env.update(PATH=str(self.d/'bin')+':'+os.environ['PATH'], FIXTURE=str(self.d),
                        AGENT_ALERT_TOKEN_FILE=str(self.d/'token'), AGENT_ALERT_CHAT_FILE=str(self.d/'chat'),
                        AGENT_ALERT_HVOST=str(self.d/'tail'), AGENT_ALERT_SPUL=str(self.d/'net-spula'), AGENT_ALERT_PAUZY='0 0', AGENT_ALERT_TAJMAUT='1', DSH_TREVOGI_CONFIG=str(self.d/'empty.conf'))
        for name,body in {
            'logger': "import json,os,sys\np=os.environ['FIXTURE']+'/log'\nwith open(p,'a') as f:f.write(json.dumps(sys.argv[1:],ensure_ascii=False)+'\\n')\n",
            'curl': "import json,os,sys\nd=os.environ['FIXTURE']\nwith open(d+'/cmdline','wb') as f:f.write(open('/proc/self/cmdline','rb').read())\nwith open(d+'/argv','a') as f:f.write(json.dumps(sys.argv[1:])+'\\n')\ns=sys.stdin.read()\nwith open(d+'/wire','w') as f:f.write(s)\nif os.environ.get('CURL_ECHO'):\n print(s,file=sys.stderr);sys.exit(6)\nprint('{\"ok\":true}')\n",
            'systemctl': "pass\n",
            'journalctl': "import os,sys\nd=os.environ['FIXTURE']\nif os.environ.get('JOURNAL_FAIL'):sys.exit(1)\nprint(open(d+'/journal').read(),end='')\n"
        }.items():
            p=self.d/'bin'/name; p.write_text('#!/usr/bin/env python3\n'+body);p.chmod(0o755)
    def tearDown(self): self.tmp.cleanup()
    def runmod(self,name='agent-alert',args=('проба',)):
        command=[str(ROOT/'bin'/name),*args]
        if name=='otkaz-klyuch-watch' and os.geteuid()!=0:
            # Process groups only: no account/ACL modification; the journal remains a stand double.
            group=grp.getgrnam('systemd-journal').gr_gid
            command=['sudo','-n','-E','setpriv','--reuid',str(os.getuid()),'--regid',str(os.getgid()),'--groups',str(group),'env','PATH='+self.env['PATH'],*command]
        return subprocess.run(command,env=self.env,input='',text=True,capture_output=True,timeout=10)
    def config(self,text):
        p=self.d/'settings.conf';p.write_text(text);self.env['DSH_TREVOGI_CONFIG']=str(p);return p
    def test_probe_blocks_all_outputs_except_journal(self):
        self.env['DSH_PROBA']='1'
        self.env['AGENT_ALERT_TOKEN_FILE']=str(self.d/'absent-token')
        p=self.runmod();self.assertEqual(p.returncode,0,'probe must succeed without token')
        self.assertIn('проба, не отправлено',p.stdout)
        self.assertIn('проба, не отправлено',(self.d/'log').read_text())
        self.assertFalse((self.d/'argv').exists(),'probe reached network');self.assertEqual((self.d/'tail').read_text(),'')
    def test_probe_journal_names_text(self):
        # RU: подстава несёт то, ради чего проба: многобайтные знаки, эмодзи и перевод строки до 120-го знака.
        # EN: the fixture carries what the probe is for: multibyte letters, emoji and a newline before char 120.
        self.env['DSH_PROBA']='1'
        tekst='Проба🔔\nсторожа '+'ж'*150
        p=self.runmod(args=(tekst,));self.assertEqual(p.returncode,0)
        zhdu='текст[0:120]='+tekst[:120].replace('\n','⏎')
        log=(self.d/'log').read_text()
        self.assertIn(json.dumps(zhdu,ensure_ascii=False)[1:-1],log,'journal must name the first 120 characters')
        self.assertNotIn('ж'*(120-len('Проба🔔\nсторожа '))+'ж',log,'journal must stop at 120 characters')
        self.assertFalse((self.d/'argv').exists(),'probe reached network')
    def test_invalid_probe_refuses(self):
        self.env['DSH_PROBA']='yes';p=self.runmod();self.assertNotEqual(p.returncode,0);self.assertFalse((self.d/'argv').exists())
    def test_unknown_flags_refuse_even_probe(self):
        self.env['DSH_PROBA']='1'
        for key in ('--dry-run','-n','--check'):
            p=self.runmod(args=(key,));self.assertEqual(p.returncode,2)
        self.assertFalse((self.d/'argv').exists())
    def test_unmarked_sends_and_keeps_token_out_of_argv(self):
        p=self.runmod();self.assertEqual(p.returncode,0)
        a=(self.d/'argv').read_text();self.assertNotIn(self.token,a,'token leaked to argv')
        self.assertNotIn(self.token.encode(),(self.d/'cmdline').read_bytes(),'token visible through proc cmdline')
        self.assertIn(self.token,(self.d/'wire').read_text(),'token missing from stdin transport')
        self.assertNotIn(self.token,(self.d/'log').read_text())
    def test_echoed_provider_token_is_redacted(self):
        self.env['CURL_ECHO']='1';p=self.runmod();self.assertEqual(p.returncode,1)
        self.assertFalse(self.token in p.stdout+p.stderr+(self.d/'log').read_text(),'provider echo leaked token')
    def test_config_and_environment_precedence(self):
        self.env.pop('AGENT_ALERT_TOKEN_FILE');self.env.pop('AGENT_ALERT_CHAT_FILE');self.env.pop('AGENT_ALERT_HVOST')
        token=self.d/'token#value';token.write_text(self.token)
        self.config('# comment\nAGENT_ALERT_TOKEN_FILE='+str(token)+'\nAGENT_ALERT_CHAT_FILE='+str(self.d/'chat')+'\nAGENT_ALERT_HVOST='+str(self.d/'tail')+'\n')
        self.assertEqual(self.runmod().returncode,0,'inline hash must be part of path')
        self.env['AGENT_ALERT_TOKEN_FILE']=str(self.d/'absent')
        self.assertEqual(self.runmod().returncode,1,'environment must override config')
        self.env['AGENT_ALERT_TOKEN_FILE']=str(self.d/'token');self.assertEqual(self.runmod().returncode,0)
    def test_bad_config_refuses_and_recovers(self):
        p=self.config('DSH_TREVOGI_UNKNOWN=unused\n')
        self.assertNotEqual(self.runmod().returncode,0);self.assertFalse((self.d/'argv').exists())
        p.write_text('# restored\n');self.assertEqual(self.runmod().returncode,0)
    def test_missing_explicit_config_refuses(self):
        self.env['DSH_TREVOGI_CONFIG']=str(self.d/'absent-conf')
        self.assertNotEqual(self.runmod().returncode,0);self.assertFalse((self.d/'argv').exists())
    def test_only_column_zero_comments_are_comments(self):
        p=self.config('  # indented-comment\n')
        self.assertNotEqual(self.runmod().returncode,0);self.assertFalse((self.d/'argv').exists())
        p.write_text('# valid comment\n');self.assertEqual(self.runmod().returncode,0)
    def test_duplicate_keys_and_shell_text_refuse(self):
        p=self.config('AGENT_ALERT_TAJMAUT=1\nAGENT_ALERT_TAJMAUT=2\n')
        self.assertNotEqual(self.runmod().returncode,0)
        p.write_text('touch '+str(self.d/'executed')+'\n')
        self.assertNotEqual(self.runmod().returncode,0);self.assertFalse((self.d/'executed').exists())
    def test_empty_path_and_invalid_limits_refuse(self):
        for key,val in [('AGENT_ALERT_TOKEN_FILE',''),('AGENT_ALERT_POPYTOK','0'),('AGENT_ALERT_TAJMAUT','x')]:
            old=self.env.get(key);self.env[key]=val
            self.assertNotEqual(self.runmod().returncode,0,key)
            self.assertFalse((self.d/'argv').exists())
            if old is None:self.env.pop(key)
            else:self.env[key]=old
    def test_trimmer_preserves_inode_permissions(self):
        p=self.d/'tail';p.write_text('one\ntwo\nthree\n');p.chmod(0o620);ino=p.stat().st_ino
        self.env['AGENT_ALERT_HVOST_STROK']='2';r=self.runmod('agent-alert-hvost-obrezka',())
        self.assertEqual(r.returncode,0);self.assertEqual(p.read_text(),'two\nthree\n')
        self.assertEqual(p.stat().st_ino,ino);self.assertEqual(p.stat().st_mode&0o777,0o620)
    def test_trimmer_rejects_unknown_flags(self):
        before=(self.d/'tail').read_bytes();r=self.runmod('agent-alert-hvost-obrezka',('--dry-run',))
        self.assertNotEqual(r.returncode,0);self.assertEqual((self.d/'tail').read_bytes(),before)
    def test_watcher_config_uses_selected_cursor_and_channel(self):
        cursor=self.d/'state'/'cursor'; cursor.parent.mkdir();cursor.write_text('old\n')
        (self.d/'journal').write_text(json.dumps(dict(MESSAGE='исход=отказ-ключ аргумент=--check',__CURSOR='new',__REALTIME_TIMESTAMP='1000000',_UID='123',_SYSTEMD_UNIT='worker.service'))+'\n')
        channel=self.d/'bin'/'channel';channel.write_text('#!/bin/sh\nprintf "%s\\n" "$*" > "$FIXTURE/channel-call"\nexit "${CHANNEL_CODE:-0}"\n');channel.chmod(0o755)
        self.config('OTKAZ_KLYUCH_KURSOR='+str(cursor)+'\nOTKAZ_KLYUCH_KANAL='+str(channel)+'\nOTKAZ_KLYUCH_HOST=example-host\n')
        r=self.runmod('otkaz-klyuch-watch',());self.assertEqual(r.returncode,0)
        self.assertEqual(cursor.read_text(),'new\n');self.assertIn('example-host',(self.d/'channel-call').read_text())

if __name__=='__main__': unittest.main(verbosity=2)
