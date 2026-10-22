#!/usr/bin/python3
"""Healthy -> missing Sova -> byte-exact return, only in a NEW private directory."""
import argparse,hashlib,json,os,stat,subprocess,sys
from pathlib import Path
SCRIPT=Path(__file__).with_name('judge-receipt.py')
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def main():
 a=argparse.ArgumentParser(allow_abbrev=False);a.add_argument('--receipt',required=True);a.add_argument('--prepared-record',required=True);a.add_argument('--out',required=True);a.add_argument('--run',required=True);a.add_argument('--project',required=True);a.add_argument('--codex-slot',required=True,choices=['codex-3','codex-4']);x=a.parse_args()
 try:
  out=Path(x.out)
  allowed=[Path('/root/AP0112-P'),Path('/opt/coders/beta/workspace')]
  if len(out.parts)>2 and out.parts[1]=='tmp' and out.parts[2].startswith('ap0112-p-'):allowed.append(Path('/tmp')/out.parts[2])
  if not out.is_absolute() or out.exists() or out.is_symlink() or out.parent.resolve()!=out.parent or not any(out.is_relative_to(p) for p in allowed):raise ValueError('UNSAFE_COPY_PATH')
  raw=Path(x.receipt).read_bytes()
  if len(raw)>2097152:raise ValueError('RECEIPT_TOO_LARGE')
  out.mkdir(mode=0o700);good=out/'good.json';bad=out/'bad.json';returned=out/'return.json';good.write_bytes(raw)
  def judge(p):
   r=subprocess.run([sys.executable,'-I','-B',str(SCRIPT),'--receipt',str(p),'--run',x.run,'--project',x.project,'--codex-slot',x.codex_slot,'--prepared-record',x.prepared_record],capture_output=True,text=True,timeout=10)
   print(r.stdout,end='')
   if r.returncode:raise ValueError('JUDGE_REFUSED')
   return r.stdout
  first=judge(good)
  if 'неполно у ' in first:print('ПРОБА НЕПРИМЕНИМА: нужен исходный измеренный receipt всех трёх');return 3
  d=json.loads(raw);rows=d['rows'];removed=[r for r in rows if r.get('participant')=='sova']
  if not removed:raise ValueError('FAULT_NOT_INSERTED')
  # A valid schema3 missing row preserves all independently measured neighbours.
  d['rows']=[r for r in rows if r.get('participant')!='sova']+[dict(participant='sova',engine='claude',subscription=None,status='incomplete',reason='SOURCE_UNAVAILABLE',totals=dict.fromkeys(['modelCalls','inputTokens','uncachedInputTokens','outputTokens','cacheReadTokens','cacheWriteTokens']),ofWhichSubagents=None)]
  d['missing']=[r for r in d.get('missing',[]) if r.get('participant')!='sova']+[dict(participant='sova',reason='SOURCE_UNAVAILABLE')];d['status']='incomplete'
  d['coverage']['claude']['measured']=[n for n in d['coverage']['claude']['measured'] if n!='sova'];d['coverage']['claude']['missing']=list(dict.fromkeys(d['coverage']['claude']['missing']+['sova']))
  metrics=list(removed[0]['totals'])
  numeric=[r for r in d['rows'] if all(type(r['totals'].get(k)) is int for k in metrics)]
  def total(items):return {k:sum(r['totals'][k] for r in items) for k in metrics} if items else dict.fromkeys(metrics)
  d['totals']=total(numeric);d['byEngine']={e:total([r for r in numeric if r['engine']==e]) for e in ('codex','claude')}
  d['bySubscription']={slot:total([r for r in numeric if r['subscription']==slot]) for slot in {r['subscription'] for r in numeric}}
  bad.write_text(json.dumps(d,ensure_ascii=False,sort_keys=True,indent=2)+'\n')
  before=sha(good);after=sha(bad)
  if before==after:raise ValueError('FAULT_NOT_INSERTED')
  check=json.loads(bad.read_text())
  if any(r.get('participant')=='sova' and r.get('status')!='incomplete' for r in check['rows']):raise ValueError('FAULT_NOT_INSERTED')
  marker='"reason": "SOURCE_UNAVAILABLE"'
  g=subprocess.run(['grep','-cF',marker,str(bad)],capture_output=True,text=True,check=False)
  if g.returncode!=0 or int(g.stdout)<1:raise ValueError('FAULT_NOT_INSERTED')
  print(f'ПОРЧА ВНЕСЕНА: удалено строк sova={len(removed)}; добавлен missing=1; grep -cF marker={g.stdout.strip()}; SHA до={before} после={after}')
  changed=judge(bad)
  keep=lambda s:[v for v in s.splitlines() if v.startswith(('master:','vintik:'))]
  if 'неполно у sova: SOURCE_UNAVAILABLE' not in changed or keep(first)!=keep(changed):raise ValueError('MISSING_OR_OTHER_TOTALS_CHANGED')
  returned.write_bytes(good.read_bytes());subprocess.run(['cmp',str(good),str(returned)],check=True)
  if sha(returned)!=before:raise ValueError('RETURN_NOT_EXACT')
  last=judge(returned)
  if last!=first:raise ValueError('RETURN_NOT_GREEN')
  print('ВОЗВРАТ: cmp/SHA равны; все три измеренные строки восстановлены');return 0
 except (OSError,ValueError,KeyError,TypeError,subprocess.SubprocessError):print('СТОП ПРОБЫ: исходный предмет/порча/возврат не доказаны');return 2
if __name__=='__main__':sys.exit(main())
