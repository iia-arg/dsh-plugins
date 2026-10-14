#!/usr/bin/env python3
"""Actual OOM watcher, private JSON journal/state and recording channels only."""
from pathlib import Path
import json,os,subprocess,sys,tempfile,unittest
PKG=Path(__file__).resolve().parents[1]
BOOT='a'*32

class Audit(unittest.TestCase):
 def setUp(self):
  self.tmp=tempfile.TemporaryDirectory(prefix='oom-audit-');self.r=Path(self.tmp.name);self.b=self.r/'bin';self.b.mkdir();self.state=self.r/'state';self.state.mkdir();(self.state/'cursor').write_text('old')
  (self.b/'journalctl').write_text('#!'+sys.executable+'''\nimport os,json,sys
from pathlib import Path
r=Path(os.environ['FIXTURE_ROOT']);a=sys.argv[1:];(r/'journal-calls').open('a').write(json.dumps(a)+'\\n')
if '--show-cursor' in a:print('-- cursor: initial');sys.exit(0)
rows=json.loads((r/'records').read_text())
for row in rows:
 if '-k' in a and row.get('_BOOT_ID')=='b'*32:continue
 print(json.dumps(row))
''')
  (self.b/'systemctl').write_text('#!'+sys.executable+'''\nimport os,sys
from pathlib import Path
r=Path(os.environ['FIXTURE_ROOT']);(r/'system-calls').open('a').write(' '.join(sys.argv[1:])+'\\n')
print({'Description':'Fixture','User':'fixture','MemoryMax':'1048576','Restart':'on-failure'}.get(sys.argv[-2],''))
''')
  self.alert=self.b/'alert';self.alert.write_text('#!'+sys.executable+'\nimport os,sys,json\nfrom pathlib import Path\nr=Path(os.environ["FIXTURE_ROOT"]);r.joinpath("alerts").open("a").write(json.dumps(sys.stdin.read())+"\\n")\n')
  for p in self.b.iterdir():p.chmod(0o755)
  self.env={'PATH':str(self.b)+':/usr/bin:/bin','OOM_WATCH_STATE':str(self.state),'OOM_WATCH_ALERT':str(self.alert),'FIXTURE_ROOT':str(self.r),'PYTHONDONTWRITEBYTECODE':'1'}
 def tearDown(self):self.tmp.cleanup()
 def row(self,message,index,boot=BOOT):return {'MESSAGE':message,'__CURSOR':'c'+str(index),'_BOOT_ID':boot,'__REALTIME_TIMESTAMP':str(1760000000000000+index)}
 def event(self,name='Web Content',unit='a.service',pid=123,boot=BOOT,start=1,cgroup=None):
  group=cgroup or '/system.slice/'+unit
  return [self.row('oom-kill:constraint=CONSTRAINT_MEMCG,oom_memcg='+group+',task_memcg='+group+',task='+name+',pid='+str(pid)+',uid=1000',start,boot),
   self.row('Memory cgroup out of memory: Killed process '+str(pid)+' ('+name+') total-vm:1000kB, anon-rss:900kB, file-rss:0kB',start+1,boot)]
 def invoke(self,rows,extra=None):
  (self.r/'records').write_text(json.dumps(rows));return subprocess.run([sys.executable,str(PKG/'bin/oom-watch')],env=self.env|(extra or {}),cwd=self.r,capture_output=True,text=True,timeout=15)
 def alerts(self):return [json.loads(x) for x in (self.r/'alerts').read_text().splitlines()] if (self.r/'alerts').exists() else []
 def test_process_spaces_parentheses_and_single_without_constraint(self):
  for name in ['Web Content','Isolated Web Co','tmux: server','a)b(c']:
   rows=self.event(name);q=self.invoke(rows);self.assertEqual(q.returncode,0,q.stdout+q.stderr);self.assertTrue(any('Убит процесс: '+name in x for x in self.alerts()))
  q=self.invoke(self.event('a)b(c')[1:]);self.assertEqual(q.returncode,0,q.stdout+q.stderr);self.assertIn('Убит процесс: a)b(c',self.alerts()[-1])
 def test_saved_previous_boot_and_pid_collision(self):
  one=self.event('one','a.service',123,BOOT,1);two=self.event('two','b.service',123,'b'*32,3)
  rows=[one[0],two[0],one[1],two[1]]
  q=self.invoke(rows);self.assertEqual(q.returncode,0,q.stdout+q.stderr);texts=self.alerts();self.assertEqual(len(texts),2)
  self.assertIn('Служба: a.service',texts[0]);self.assertIn('Убит процесс: one',texts[0]);self.assertIn('Служба: b.service',texts[1]);self.assertIn('Убит процесс: two',texts[1])
  for call in (self.r/'journal-calls').read_text().splitlines():self.assertIn('_TRANSPORT=kernel',json.loads(call));self.assertNotIn('-k',json.loads(call))
 def test_same_boot_reused_pid_and_lost_constraint_do_not_mispair(self):
  rows=self.event('one','a.service',123,BOOT,1)+self.event('two','b.service',123,BOOT,3)
  rows+=self.event('unknown','ignored.service',123,BOOT,5)[1:]
  q=self.invoke(rows);self.assertEqual(q.returncode,0,q.stdout+q.stderr);texts=self.alerts();self.assertEqual(len(texts),3);self.assertIn('Служба: a.service',texts[0]);self.assertIn('Служба: b.service',texts[1]);self.assertIn('Служба: не определена',texts[2])
 def test_user_manager_identity_never_queries_system_manager(self):
  path='/user.slice/user-1000.slice/user@1000.service/app.slice/foo.service'
  q=self.invoke(self.event(cgroup=path))
  self.assertEqual(q.returncode,0,q.stdout+q.stderr);texts=self.alerts();self.assertEqual(len(texts),1);self.assertIn(path,texts[0]);self.assertIn('пользователь',texts[0].lower())
  self.assertFalse((self.r/'system-calls').exists());self.assertNotIn('от имени root',texts[0]);self.assertNotIn('Restart=no',texts[0])
  (self.r/'alerts').unlink()
  q=self.invoke(self.event(cgroup=path),{'OOM_WATCH_UNITS':'foo.service'});self.assertEqual(q.returncode,0);self.assertEqual(self.alerts(),[])
  q=self.invoke(self.event(cgroup=path),{'OOM_WATCH_UNITS':path});self.assertEqual(q.returncode,0);self.assertEqual(len(self.alerts()),1);self.assertFalse((self.r/'system-calls').exists())
 def test_nonstring_message_is_named_blindness_without_cursor_stall(self):
  rows=[self.row(value,i) for i,value in enumerate([[255,0],None,42,{}],1)]+self.event('valid','a.service',123,BOOT,5)
  q=self.invoke(rows);self.assertEqual(q.returncode,2,q.stdout+q.stderr);self.assertNotIn('Traceback',q.stderr);self.assertIn('MESSAGE',q.stderr);self.assertEqual((self.state/'cursor').read_text(),'c6');self.assertTrue(any('Убит процесс: valid' in x for x in self.alerts()))
 def test_missing_boot_identity_does_not_pair_and_is_not_clean(self):
  rows=self.event('no-boot')
  for e in rows:e.pop('_BOOT_ID')
  q=self.invoke(rows);self.assertEqual(q.returncode,2,q.stdout+q.stderr);texts=self.alerts();self.assertTrue(any('Служба: не определена' in x for x in texts));self.assertFalse((self.r/'system-calls').exists())
 def test_relative_alert_refuses_before_any_pass(self):
  alias=self.r/'my-alert';alias.write_bytes(self.alert.read_bytes());alias.chmod(0o755)
  shadow=self.b/'my-alert';shadow.write_bytes(self.alert.read_bytes());shadow.chmod(0o755)
  q=self.invoke(self.event('probe'),{'OOM_WATCH_ALERT':'my-alert'})
  self.assertEqual(q.returncode,2,q.stdout+q.stderr);self.assertIn('абсолют',q.stderr);self.assertFalse((self.r/'journal-calls').exists());self.assertEqual((self.state/'cursor').read_text(),'old')
 def test_rendered_untrusted_fields_strip_controls_escape_markup(self):
  rows=self.event('<b>\x1bXY','x<&.service');rows[0]['MESSAGE']=rows[0]['MESSAGE'].replace('<b>\x1bXY','<b>\x1bX\u2028Y')
  q=self.invoke(rows)
  self.assertEqual(q.returncode,0,q.stdout+q.stderr);text=self.alerts()[0];self.assertNotIn('\x1b',text);self.assertNotIn('\u2028',text);self.assertNotIn('<b>',text);self.assertIn('&lt;b&gt;',text);self.assertIn('x&lt;&amp;.service',text)

 def test_only_malformed_objects_report_cursor_unchanged(self):
  q=self.invoke([[],None,42]);self.assertEqual(q.returncode,2,q.stdout+q.stderr);self.assertEqual((self.state/'cursor').read_text(),'old');self.assertIn('курсор не сдвинут',q.stderr)
if __name__=='__main__':unittest.main(verbosity=2)
