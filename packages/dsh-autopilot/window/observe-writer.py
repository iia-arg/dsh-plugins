#!/usr/bin/python3
"""Root reads proof files; never evaluates actor-owned HTML or launches a model."""
import argparse,datetime,json,os,runpy,sys
from pathlib import Path
HERE=Path(__file__).resolve().parent
C=runpy.run_path(str(HERE/'writer-common.py'))
def main():
 p=argparse.ArgumentParser(allow_abbrev=False,description=__doc__);p.add_argument('--save',type=Path,required=True);p.add_argument('--copy-fixture',action='store_true');a=p.parse_args()
 if os.geteuid()!=0:raise ValueError('root reader required')
 api=runpy.run_path(str(HERE/'registry-inverse-decision.py'));info=json.loads(api['safe_file'](a.save/'PREPARED.json'));address=json.loads(api['safe_file'](a.save/'writer-probe.address.json'));path=Path(address['path'])
 if C['sha'](path)!=address['sha256']:raise ValueError('probe control SHA differs from protected SAVE')
 c=C['control'](path)
 if a.copy_fixture!=(c['scope']=='copy-fixture') or a.copy_fixture!=(info['root']!='/') or c['root']!=info['root']:raise ValueError('copy fixture cannot satisfy production acceptance')
 project=Path(c['project']);receipt=C['json_file'](project/'writer-proof.json',C['MASTER'].pw_uid,65536);private=C['state'](project/'.autopilot/state.js');run=private['_sadik']['run_id']
 if receipt.get('status')!='PASS' or receipt.get('scope')!=c['scope'] or receipt.get('uid')!=C['MASTER'].pw_uid or receipt.get('window')!=c['window'] or receipt.get('runId')!=run or receipt.get('project')!=str(project) or receipt.get('g4_claimed') is not False:raise ValueError('writer receipt identity/scope differs')
 selected=receipt.get('selected',{})
 if selected.get('thread')!=c['thread'] or not all(isinstance(selected.get(k),str) and selected[k] for k in ('turn','start','end')):raise ValueError('writer selected another source')
 if selected!=C['select_turn'](c['home'],c['thread'],selected['turn']):raise ValueError('writer source window differs from gateway/rollout')
 snapshot=project/'codex.snapshot.json';numeric=C['json_file'](snapshot,C['MASTER'].pw_uid,16384)
 bucket=C['numeric'](numeric,run)
 if C['timestamp'](bucket['windowStart'])!=C['timestamp'](selected['start']) or C['timestamp'](bucket['windowEnd'])!=C['timestamp'](selected['end']):raise ValueError('snapshot source window differs')
 if C['sha'](snapshot)!=receipt['snapshot_sha256']:raise ValueError('source snapshot SHA differs')
 public=C['public_check'](c,private,numeric)
 if public!=receipt['public']:raise ValueError('public proof differs')
 log=project/'usage-codex.jsonl'
 event=C['json_file'](log,C['MASTER'].pw_uid,16384)
 if C['sha'](log)!=receipt['journal_sha256']:raise ValueError('writer journal changed')
 rows=C['read_regular'](log,16384).decode().splitlines()
 if len(rows)!=1:raise ValueError('writer journal must have one attempt')
 event=json.loads(rows[0])
 if not C['timestamp'](selected['end'])<=C['timestamp'](bucket['measuredAt'])<=C['timestamp'](event.get('at'))<=datetime.datetime.now(datetime.timezone.utc):raise ValueError('writer journal time differs')
 if event.get('cmd')!='usage codex' or event.get('runId')!=run or type(event.get('rc')) is not int or event['rc']!=0:raise ValueError('writer command/rc missing')
 print(json.dumps({'status':'PASS','scope':c['scope'],'window':c['window'],'runId':run,'public':public,'actual_model_turn':'coordinator must verify genuine Master exec in original mail session; files do not attest it','g4_claimed':False},ensure_ascii=False))
if __name__=='__main__':
 try:main()
 except (OSError,ValueError,KeyError,TypeError) as error:
  print('WRITER_OBSERVE_REFUSED '+type(error).__name__+': '+str(error),file=sys.stderr);raise SystemExit(2)
