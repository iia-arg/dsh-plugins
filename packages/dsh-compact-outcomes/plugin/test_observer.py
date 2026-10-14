import unittest
from observer import classify

def e(t,seq,time,data,**extra):return dict(type=t,seq=seq,time=time,data=data,**extra)
def usage(time,n):return {'timestamp':time,'type':'event_msg','payload':{'type':'token_count','info':{'last_token_usage':{'input_tokens':n-10,'output_tokens':10,'total_tokens':n}}}}
def codex():return [{'type':'session_meta','payload':{'id':'u'}},usage(110,900),{'timestamp':111,'type':'event_msg','payload':{'type':'task_complete'}},{'timestamp':120,'type':'compacted','payload':{}},usage(130,200),{'timestamp':131,'type':'event_msg','payload':{'type':'task_complete'}}]
def dsh():return [e('turn/start',1,100,{'turn':1}),e('turn/end',9,140,{'turn':1,'reason':{'kind':'completed'}})]
def own():return [e('turn/start',1,100,{'turn':1}),e('compaction/start',2,112,{'turn':1,'compactionId':'c'}),e('compaction/summary',3,113,{'compactionId':'c','provider':'dsh-pamyat-kompakt','summary':[{'type':'text','text':'Сводка 😀'}],'shadowedSeqs':[1]}),e('user/message',4,114,{'content':[{'type':'text','text':'Сводка 😀'}]},sourceEventSeqs=[2,3,1],surfaceOp={'op':'replace','start':1,'end':1}),e('compaction/end',5,115,{'turn':1,'compactionId':'c'}),e('turn/end',9,140,{'turn':1,'reason':{'kind':'completed'}})]
class Classification(unittest.TestCase):
 def run_case(self,ds=None,cs=None,saved=None):return classify('s',ds or dsh(),{'u':cs if cs is not None else codex()},saved or [],0,1000)
 def test_confirmed_codex_drop(self):
  r=self.run_case();self.assertEqual([x['category'] for x in r['events']],['codex']);self.assertEqual(r['drops'],[])
 def test_synthetic_zero_is_not_evidence(self):
  cs=codex();cs[4]['payload']['info']['last_token_usage']['input_tokens']=0
  self.assertEqual([x['category'] for x in self.run_case(cs=cs)['events']],['unknown'])
 def test_drop_without_event_not_counted_as_compact(self):
  cs=codex();del cs[3];r=self.run_case(cs=cs);self.assertEqual(r['events'],[]);self.assertEqual(len(r['drops']),1)
 def test_foreign_uuid_rejected(self):
  cs=codex();cs[0]['payload']['id']='other'
  with self.assertRaises(ValueError):self.run_case(cs=cs)
 def test_our_summary_requires_database_and_replace(self):
  saved=[{'istochnik':'s#1','soderzhim':'Сводка 😀','id':8}]
  self.assertEqual([x['category'] for x in self.run_case(ds=own(),cs=[],saved=saved)['events']],['ours'])
  self.assertEqual([x['category'] for x in self.run_case(ds=own(),cs=[])['events']],['unknown'])
  ds=own();ds[3].pop('surfaceOp')
  self.assertEqual([x['category'] for x in self.run_case(ds=ds,cs=[],saved=saved)['events']],['unknown'])
 def test_dsh_first_not_codex_overtake(self):
  r=self.run_case(ds=own(),saved=[{'istochnik':'s#1','soderzhim':'Сводка 😀','id':8}]);self.assertEqual([x['category'] for x in r['events']],['unknown','unknown'])
 def test_pending_compact_unknown_then_recovered(self):
  self.assertEqual([x['category'] for x in self.run_case(cs=codex()[:4])['events']],['unknown'])
  self.assertEqual(self.run_case()['events'][0]['category'],'codex')
 def test_failure_dsh_not_denominator(self):
  ds=own();ds[4]['data']['error']='failure'
  self.assertEqual(self.run_case(ds=ds,cs=[])['events'],[])
if __name__=='__main__':unittest.main()

class Collection(unittest.TestCase):
 def test_mapping_excludes_trial_and_retains_seen_uuid(self):
  import tempfile,json,sqlite3,subprocess
  from pathlib import Path
  from collector import collect
  with tempfile.TemporaryDirectory() as tmp:
   r=Path(tmp);dsdir=r/'dsh';dsdir.mkdir();cxdir=r/'codex';cxdir.mkdir();session=dsdir/'session.jsonl.zstd'
   u='11111111-1111-4111-8111-111111111111'
   msg={'role':'user','content':[{'type':'text','text':'боевой вход'}]}
   from observer import key
   db=r/'map.db';c=sqlite3.connect(db);c.execute('create table sessions(kluch text,sessionId text)');c.execute('insert into sessions values(?,?)',(key(msg),u));c.commit();c.close()
   mem=r/'memory.db';c=sqlite3.connect(mem);c.execute('create table zapisi(id integer,klass text,istochnik text,soderzhim text)');c.commit();c.close()
   events=[{'type':'session','id':'s','cwd':str(r),'createdAt':0},e('user/message',0,90,msg)]+dsh()
   session.write_bytes(subprocess.check_output(['zstd','-q','-c'],input=('\n'.join(json.dumps(x) for x in events)+'\n').encode()))
   real=codex();real[0]['payload']['id']=u
   (cxdir/f'rollout-{u}.jsonl').write_text('\n'.join(json.dumps(x) for x in real)+'\n')
   trial=codex();trial[0]['payload']['id']='trial';(cxdir/'rollout-trial.jsonl').write_text('\n'.join(json.dumps(x) for x in trial)+'\n')
   cfg={'agents':[{'name':'alfa','cwd':str(r),'dsh_dir':str(dsdir),'codex_dir':str(cxdir),'gateway_db':str(db),'memory_db':str(mem)}]}
   state={'start':0,'deadline':10000,'bindings':{},'agents':{}}
   x=collect(cfg,state,1000);self.assertIn('alfa',x['agents']);self.assertEqual(len(x['agents']['alfa']['events']),1);self.assertEqual(x['agents']['alfa']['events'][0]['category'],'codex')
   c=sqlite3.connect(db);c.execute('delete from sessions');c.commit();c.close()
   x=collect(cfg,x,1001);self.assertEqual(len(x['agents']['alfa']['events']),1)
   self.assertEqual(x['agents']['alfa']['coverage']['rollouts_read'],1)
   c=sqlite3.connect(db);c.execute('insert into sessions values(?,?)',(key(msg),u));c.commit();c.close()
   other=dsdir/'copy';other.mkdir();events[0]['id']='s2'
   (other/'session.jsonl.zstd').write_bytes(subprocess.check_output(['zstd','-q','-c'],input=('\n'.join(json.dumps(v) for v in events)+'\n').encode()))
   x=collect(cfg,x,1002);self.assertEqual([v['category'] for v in x['agents']['alfa']['events']],['unknown'])
   identities=x['bindings']['alfa'][u];original=str(session)+'#0'
   v='22222222-2222-4222-8222-222222222222'
   x['bindings']['alfa']={u:[original],v:identities};x['agents']={}
   c=sqlite3.connect(db);c.execute('delete from sessions');c.commit();c.close()
   ds=[{'type':'session','id':'s','cwd':str(r),'createdAt':0}]+own()
   session.write_bytes(subprocess.check_output(['zstd','-q','-c'],input=('\n'.join(json.dumps(z) for z in ds)+'\n').encode()))
   (cxdir/f'rollout-{u}.jsonl').write_text(json.dumps({'type':'session_meta','payload':{'id':u}})+'\n')
   c=sqlite3.connect(mem);c.execute('insert into zapisi values(?,?,?,?)',(8,'svodka-kompakcii','s#1','Сводка 😀'));c.commit();c.close()
   x=collect(cfg,x,1003);self.assertEqual([z['category'] for z in x['agents']['alfa']['events']],['unknown'])
   del x['bindings']['alfa'][v]
   x=collect(cfg,x,1004);self.assertEqual([z['category'] for z in x['agents']['alfa']['events']],['ours'])
   import time,sys
   cp=r/'config.json';cp.write_text(json.dumps(cfg));sp=r/'state';sp.mkdir();out=r/'out';out.mkdir()
   now=int(time.time()*1000);x.update(start=now-86400000-600000,deadline=now-600000,sent=[])
   (sp/'state.json').write_text(json.dumps(x))
   cmd=[sys.executable,str(Path(__file__).parent/'collector.py'),'--config',str(cp),'--state-dir',str(sp),'--outbox',str(out)]
   run=subprocess.run(cmd,capture_output=True,text=True);self.assertEqual(run.returncode,0,run.stderr)
   files=list(out.glob('*.md'));self.assertEqual(len(files),3);self.assertTrue((sp/'DONE').exists())
   self.assertIn('Главной Забаве',files[0].read_text())
   for f in files:f.unlink()
   again=subprocess.run(cmd,capture_output=True,text=True);self.assertEqual(again.returncode,0,again.stderr);self.assertEqual(list(out.iterdir()),[])
   refused=subprocess.run(cmd+['--dry-run'],capture_output=True,text=True);self.assertEqual(refused.returncode,2)



class AdditionalEvidence(unittest.TestCase):
 def test_next_turn_replacement_does_not_erase_prior_survival(self):
  ds=own()+[e('user/message',10,150,{'content':[]},surfaceOp={'op':'replace','start':1,'end':9})]
  r=classify('s',ds,{},[{'istochnik':'s#1','soderzhim':'Сводка 😀','id':8}],0,1000)
  self.assertEqual([x['category'] for x in r['events']],['ours'])
 def test_interrupted_turn_not_survival(self):
  ds=own();ds[-1]['data']['reason']={'kind':'interrupted'}
  r=classify('s',ds,{},[{'istochnik':'s#1','soderzhim':'Сводка 😀','id':8}],0,1000)
  self.assertEqual([x['category'] for x in r['events']],['unknown'])

class ReviewRegressions(unittest.TestCase):
 def test_unrelated_checkpoint_cannot_be_ours(self):
  ds=own();ds[3]['data']['content']=[{'type':'text','text':'OTHER'}]
  r=classify('s',ds,{},[{'istochnik':'s#1','soderzhim':'Сводка 😀','id':8}],0,1000)
  self.assertEqual([x['category'] for x in r['events']],['unknown'])
 def test_compact_outside_turn_not_ours(self):
  ds=own();ds[0]['time']=200;ds[-1]['time']=240
  r=classify('s',ds,{},[{'istochnik':'s#1','soderzhim':'Сводка 😀','id':8}],0,1000)
  self.assertEqual([x['category'] for x in r['events']],['unknown'])
 def test_summary_before_start_not_ours(self):
  ds=own();ds[1]['seq']=3;ds[2]['seq']=2
  r=classify('s',ds,{},[{'istochnik':'s#1','soderzhim':'Сводка 😀','id':8}],0,1000)
  self.assertEqual([x['category'] for x in r['events']],['unknown'])

class IncompleteChain(unittest.TestCase):
 def test_unclosed_start_is_visible_but_not_confirmed_compact(self):
  r=classify('s',own()[:2],{},[],0,1000)
  self.assertEqual(r['events'],[]);self.assertIn('attempts',r);self.assertEqual(len(r['attempts']),1)
