"""Bind a separately accepted owner-census to a fresh complete read-only scan."""
import os,pwd,stat,time
from pathlib import Path
import owner_inventory as O

SCOPE='master-owner-or-release-pin/all-visible-local-mounts'
MAX_SCAN=60

def protected(path):
 raw,s=O.read(path)
 if s.st_uid!=0 or stat.S_IMODE(s.st_mode)!=0o600:raise ValueError('RUN_INVENTORY_UNPROVEN: unsafe fixture scope')
 return raw

def context(root):
 root=Path(root)
 if root==Path('/'):
  raw,table=O.mounts()
  if any(x['classification']=='unproven' for x in table):raise ValueError('RUN_INVENTORY_UNPROVEN: unknown filesystem')
  return dict(root=str(root),roots=sorted(x['target'] for x in table if x['classification']=='local'),publicRoot='/srv/autopilot/public',mounts=table,mountSha256=O.digest(raw),publicRequired=True)
 raw=protected(root/'inventory-scope.json');cfg=O.unjson(raw)
 if (not isinstance(cfg,dict) or set(cfg)!={'schemaVersion','roots','publicRoot'} or cfg['schemaVersion']!=1 or not isinstance(cfg['roots'],list) or not cfg['roots']):raise ValueError('RUN_INVENTORY_UNPROVEN: fixture scope missing')
 for name in cfg['roots']+[cfg['publicRoot']]:
  p=Path(name)
  if not p.is_absolute() or str(p.resolve())!=str(p):raise ValueError('RUN_INVENTORY_UNPROVEN: nonphysical fixture scope')
 return dict(root=str(root),roots=sorted(cfg['roots']),publicRoot=cfg['publicRoot'],fixtureScopeSha256=O.digest(raw),publicRequired=False)

def accepted_scope(report,root):
 if (not isinstance(report,dict) or report.get('schemaVersion')!=2 or report.get('scope')!=SCOPE or report.get('complete') is not True or report.get('errors')!=[] or report.get('operatorUid')!=pwd.getpwnam('master').pw_uid or report.get('operator')!='master'):
  raise ValueError('RUN_INVENTORY_UNPROVEN: full owner census required; inventory incomplete')
 ctx=context(root)
 if root==Path('/'):
  if report.get('fixtureRoot') is not None:raise ValueError('RUN_INVENTORY_UNPROVEN: fixture census in production')
  roots=sorted(x['target'] for x in report.get('mounts',[]) if x['classification']=='local')
 else:
  if report.get('fixtureRoot')!=str(root) or report.get('fixtureScopeSha256')!=ctx['fixtureScopeSha256']:raise ValueError('RUN_INVENTORY_UNPROVEN: fixture census binding differs')
  roots=report.get('scopeRoots')
 if roots!=ctx['roots']:raise ValueError('RUN_INVENTORY_UNPROVEN: accepted roots differ; inventory incomplete')
 return ctx

def attestations(report):
 result={}
 for row in report['records']:
  proof=row.get('attestation')
  if proof is None:
   if row['classification'] not in ('attested_isolated_fixture','attested_non_run_fixture'):continue
   proof=dict(sha256=row['sha256'],classification=row['classification'],evidence=row.get('classificationEvidence'))
  if not isinstance(proof,dict) or proof.get('sha256')!=row['sha256'] or proof.get('classification') not in ('attested_isolated_fixture','attested_non_run_fixture'):raise ValueError('RUN_INVENTORY_UNPROVEN: classification attestation mismatch')
  evidence=proof.get('evidence')
  if not isinstance(evidence,list) or not evidence:raise ValueError('RUN_INVENTORY_UNPROVEN: classification evidence missing')
  for item in evidence:
   p=Path(item['path']);raw,s=O.read(p)
   if str(p.resolve())!=str(p) or (O.digest(raw),s.st_uid,stat.S_IMODE(s.st_mode),s.st_dev,s.st_ino)!=(item['sha256'],item['uid'],item['mode'],item['device'],item['inode']):raise ValueError('RUN_INVENTORY_UNPROVEN: classification evidence changed')
  result[row['path']]=dict(sha256=row['sha256'],classification=proof['classification'],evidence=evidence)
 return result

# Churn. A path that vanished mid-walk, is a known transient class (/tmp|/var/tmp/systemd-private-* of short
# units — notice timers with PrivateTmp make and drop them every 5 s, a pass takes ~28 s; /run/user/<uid>) AND lies
# outside the run area is skipped in the same pass: not an error, recorded in traversal.vanishedPaths
# (transient=true). A vanished record, .autopilot, public or catalogue path, release root or a project known from
# any pass or from the accepted census (with ancestors and descendants) stays an error and is never retried: a
# retry would drop that run silently; a project unseen before it vanished is unknowable, hence the transient
# allow-list instead of "anything else". Only SCOPE_CHANGED_DURING_SCAN (mount table moved during the pass) repeats
# the whole pass, each judged alone, while the total stays within SCOPE_BUDGET (window steps: 90 s).
SCOPE_PASSES=3;SCOPE_BUDGET=75
def _vanished(error):
 if not error.startswith('FileNotFoundError: '):return None
 return Path(error[len('FileNotFoundError: '):].split(': [Errno',1)[0])

def _run_area(path,bases):
 return '.autopilot' in path.parts or path.name in ('state.js','operator.json') or any(path==b or path.is_relative_to(b) or b.is_relative_to(path) for b in bases)

def _transient(path,root):
 if not path.is_relative_to(root):return False
 p=path.relative_to(root).parts
 return (len(p)>1 and p[0]=='tmp' and p[1].startswith('systemd-private-')) or (len(p)>2 and p[:2]==('var','tmp') and p[2].startswith('systemd-private-')) or (len(p)>2 and p[:2]==('run','user') and p[2].isdigit())

def capture(root,*,accepted=None,timeout=MAX_SCAN):
 begin=time.monotonic();root=Path(root);fixed=[Path(context(root)['publicRoot']),root/'var/lib/dsh-autopilot',root/'opt/autopilot'];known=set();vanished=[]
 def learn(report):
  known.update(Path(r['project']) for r in report.get('records',[]) if isinstance(r.get('project'),str));known.update(Path(d).parent for d in report.get('ownerAutopilotDirs',[]))
 if accepted:learn(accepted)
 for attempt in range(1,SCOPE_PASSES+1):
  started=time.monotonic();result=_capture_once(root,accepted=accepted,timeout=timeout);learn(result)
  bases=fixed+sorted(known);skipped=set()
  for e in result['errors']:
   p=_vanished(e)
   if p is None:continue
   row=dict(scanPass=attempt,path=str(p),runArea=_run_area(p,bases),transient=_transient(p,root));vanished.append(row)
   if row['transient'] and not row['runArea']:skipped.add(e)
  result['errors']=[e for e in result['errors'] if e not in skipped];result['complete']=not result['errors']
  result['traversal']['errors']=[e for e in result['traversal']['errors'] if e not in skipped];result['traversal']['complete']=not result['traversal']['errors']
  result['traversal'].update(scopePasses=attempt,vanishedPaths=list(vanished))
  churn=bool(result['errors']) and all(e=='SCOPE_CHANGED_DURING_SCAN' for e in result['errors'])
  if not churn or time.monotonic()+1.5*(time.monotonic()-started)-begin>SCOPE_BUDGET:return result
 return result

def _capture_once(root,*,accepted=None,timeout=MAX_SCAN):
 root=Path(root);ctx=context(root);uid=pwd.getpwnam('master').pw_uid;proof=attestations(accepted) if accepted else {};start=O.now()
 scan=O.scan_roots(ctx['roots'],uid=uid,timeout=min(MAX_SCAN,timeout),mount_points=[x['target'] for x in ctx.get('mounts',[])])
 data=O.analyze(scan['files'],uid=uid,public_root=Path(ctx['publicRoot']),attestations=proof,production_root=root/'opt/autopilot')
 errors=scan['errors']+data['errors']
 if ctx['publicRequired'] and data['public'].get('indexMissing'):errors.append('PUBLIC_INDEX_MISSING')
 if context(root)!=ctx:errors.append('SCOPE_CHANGED_DURING_SCAN')
 if accepted:attestations(accepted)  # evidence must stay unchanged through the scan
 result=dict(schemaVersion=2,scope=SCOPE,operator='master',operatorUid=uid,startedAt=start,endedAt=O.now(),scannedAt=start,scopeRoots=ctx['roots'],mounts=ctx.get('mounts',[]),limits=dict(maxDepth=O.MAX_DEPTH,seconds=MAX_SCAN,fileBytes=O.MAX_FILE),**data)
 if root!=Path('/'):result.update(fixtureRoot=str(root),fixtureScopeSha256=ctx['fixtureScopeSha256'])
 summary={key:value for key,value in scan.items() if key not in ('files','symlinks')}
 summary.update(candidateFiles=len(scan['files']),symlinkCount=len(scan['symlinks']))
 result.update(complete=not errors,errors=errors,allCandidatePaths=scan['files'],traversal=summary,ownerAutopilotDirs=sorted(scan['ownerAutopilotDirs']))
 result['runs']=[dict(runId=row['runId'],project=row['project'],release=row.get('release'),active=(row['status']=='unfinished') if row['status'] in ('finished','unfinished') else None,statePath=row['path'],operatorPath=row.get('operatorPath'),stateSha256=row['sha256'],operatorSha256=row.get('operatorSha256'),operatorUid=row['uid']) for row in data['records'] if row.get('runId') and row.get('project') and row['classification']=='canonical_run']
 result['found']=len(result['runs'])
 return result

def verify_fresh(report,root):
 accepted_scope(report,root)
 fresh=capture(root,accepted=report)
 if not fresh['complete']:raise ValueError('RUN_INVENTORY_UNPROVEN: inventory incomplete; '+str(fresh['errors'][:3]))
 def index(value):
  rows=value['records'];mapping={row['path']:row for row in rows}
  if len(mapping)!=len(rows):raise ValueError('RUN_INVENTORY_UNPROVEN: duplicate inventory path')
  return {path:(row['sha256'],row['uid'],row['classification'],row.get('potentialProductionPin'),row.get('status'),row.get('runId'),row.get('project'),row.get('release'),row.get('operatorSha256')) for path,row in mapping.items()}
 if fresh['ownerAutopilotDirs']!=report.get('ownerAutopilotDirs'):raise ValueError('RUN_INVENTORY_UNPROVEN: inventory incomplete (autopilot directory outside accepted list)')
 if index(fresh)!=index(report) or fresh['public'].get('indexSha256')!=report['public'].get('indexSha256'):
  raise ValueError('RUN_INVENTORY_UNPROVEN: inventory incomplete (new, missing or changed owner/pin record)')
 return fresh

def active_rows(report):
 rows={};projects=set()
 for row in report['records']:
  if not row.get('potentialProductionPin'):continue
  if row['classification']!='canonical_run' or row['status']!='unfinished':raise ValueError('RUN_INVENTORY_UNPROVEN: unresolved production pin')
  key=row['runId']
  if key in rows or row['project'] in projects:raise ValueError('RUN_INVENTORY_UNPROVEN: duplicate run/project binding')
  rows[key]=dict(project=row['project'],release=row['release'],status='active',origin='legacy');projects.add(row['project'])
 return rows
