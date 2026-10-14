// Real installer against both archive layouts; no live installation or API.
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,readdirSync,existsSync,rmSync,statSync,readlinkSync,lstatSync} from 'node:fs';
import {tmpdir} from 'node:os';import {join} from 'node:path';import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';import {spawnSync} from 'node:child_process';
const root=mkdtempSync(join(tmpdir(),'stend-kopiya-forms-')),installer=fileURLToPath(new URL('../tools/kopiya-ostrov-api.sh',import.meta.url));
const rel='08853c4a5871',oldRel='cc31c0571fb3',app={'server.py':'# server\n','nested/a b.txt':'data\n'},hash=s=>createHash('sha256').update(s).digest('hex');
let failed=0,total=0;
function check(name,ok,why){total++;if(!ok)failed++;console.log((ok?'GREEN ':'RED ')+name+(ok?'':': '+why))}
function archive(name,layout,mutation=''){
 const dir=join(root,name),prefix=layout==='old'?'candidate/app':'app',man=layout==='old'?'deployment/manifest.json':'manifest.json',release=layout==='old'?oldRel:rel;
 mkdirSync(join(dir,prefix,'nested'),{recursive:true});for(const [f,text]of Object.entries(app))writeFileSync(join(dir,prefix,f),text);
 mkdirSync(join(dir,man,'..'),{recursive:true});writeFileSync(join(dir,man),JSON.stringify({artifact:mutation==='artifact'?'ffffffffffff':release,files:Object.fromEntries(Object.entries(app).map(([f,text])=>[f,hash(text)]))}));
 if(mutation==='extra')writeFileSync(join(dir,prefix,'extra.txt'),'extra');if(mutation==='hash')writeFileSync(join(dir,prefix,'server.py'),'changed');
 const out=join(root,name+(layout==='old'?'.tar.gz':'.tar'));
 const code="import tarfile,sys,os; src,out,app,man=sys.argv[1:]; t=tarfile.open(out,'w:gz' if out.endswith('.gz') else 'w'); t.add(os.path.join(src,app),arcname=app); t.add(os.path.join(src,man),arcname=man); t.close()";
 const r=spawnSync('python3',['-c',code,dir,out,prefix,man],{encoding:'utf8'});if(r.status!==0)throw Error(r.stderr);return [out,release];
}
function install(args,target){return spawnSync('bash',[installer,...args,target],{encoding:'utf8',timeout:30000})}
function securityArchive(source,layout,kind){
 const output=join(root,layout+'-'+kind+'.tar'),prefix=layout==='old'?'candidate/app':'app',manifest=layout==='old'?'deployment/manifest.json':'manifest.json';
 const code="import tarfile,sys,json,io,hashlib\nsrc,out,prefix,manifest,kind=sys.argv[1:]\nwith tarfile.open(src) as a,tarfile.open(out,'w') as b:\n for m in a.getmembers():\n  body=a.extractfile(m) if m.isfile() else None\n  if m.name==manifest:\n   doc=json.load(body); doc['files']['../../../X' if kind=='traversal' else 'link.txt']=hashlib.sha256(b'escaped-marker').hexdigest() if kind=='traversal' else doc['files']['server.py']; data=json.dumps(doc).encode(); m.size=len(data); body=io.BytesIO(data)\n  b.addfile(m,body)\n m=tarfile.TarInfo(prefix+('/../../../X' if kind=='traversal' else '/link.txt'))\n if kind=='traversal':\n  data=b'escaped-marker'; m.size=len(data); b.addfile(m,io.BytesIO(data))\n else:\n  m.type=tarfile.SYMTYPE if kind=='symlink' else tarfile.LNKTYPE; m.linkname='server.py' if kind=='symlink' else prefix+'/server.py'; b.addfile(m)\n";
 const made=spawnSync('python3',['-c',code,source,output,prefix,manifest,kind],{encoding:'utf8'});if(made.status!==0)throw Error(made.stderr);return output;
}
function escapedFiles(dir){return readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.name==='X'?[join(dir,e.name)]:e.isDirectory()?escapedFiles(join(dir,e.name)):[])}
function treeSnapshot(dir){
 const rows=[];const walk=(d,p='')=>{for(const e of readdirSync(d,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name))){const name=p+e.name,file=join(d,e.name),mode=lstatSync(file).mode;rows.push([name,mode,e.isFile()?hash(readFileSync(file)):e.isSymbolicLink()?readlinkSync(file):null]);if(e.isDirectory())walk(file,name+'/')}};walk(dir);return JSON.stringify(rows);
}
try{
 for(const layout of ['old','new']){
  const args=archive(layout,layout),target=join(root,layout+'-copy','ostrov-api');let r=install(args,target);
  check(layout+' layout accepted',r.status===0,r.stderr+r.stdout);
  check(layout+' installed exact named files',existsSync(join(target,'app/server.py'))&&readFileSync(join(target,'app/server.py'),'utf8')===app['server.py']&&readFileSync(join(target,'app/nested/a b.txt'),'utf8')===app['nested/a b.txt'],r.stderr);
  if(r.status!==0)continue;
  const before=readFileSync(join(target,'ISTOCHNIK'));
  for(const [mutation,diagnostic]of [['extra','extra.txt'],['artifact','ffffffffffff'],['hash','server.py']]){
   const bad=archive(layout+'-'+mutation,layout,mutation);r=install(bad,target);
   check(layout+' '+mutation+' refused with object',r.status===2&&r.stderr.includes(diagnostic),r.stderr+r.stdout);
   check(layout+' '+mutation+' preserved copy',before.equals(readFileSync(join(target,'ISTOCHNIK')))&&readFileSync(join(target,'app/server.py'),'utf8')===app['server.py']&&!existsSync(target+'.prezhnyaya'),r.stderr);
  }
  r=install(args,target);check(layout+' restored accepted and insurance preserved',r.status===0&&existsSync(target+'.prezhnyaya/ISTOCHNIK')&&before.equals(readFileSync(target+'.prezhnyaya/ISTOCHNIK')),r.stderr);
  check(layout+' final file modes 0644 and directories 0755',statSync(join(target,'app/server.py')).mode%512===0o644&&statSync(join(target,'app')).mode%512===0o755,'unexpected installed modes');
  for(const kind of ['traversal','symlink','hardlink']){
   const bad=securityArchive(args[0],layout,kind),sandbox=join(root,'guard-'+layout+'-'+kind),temporary=join(sandbox,'temporary');mkdirSync(temporary,{recursive:true});
   // A guard mutation may create TMPDIR/X outside mktemp's W. Contain that
   // effect inside our owned arena, and check the effect separately from rc.
   const boundary=spawnSync('mktemp',['-d'],{env:{...process.env,TMPDIR:temporary},encoding:'utf8'});if(boundary.status!==0||!boundary.stdout.trim().startsWith(temporary+'/'))throw Error('TMPDIR boundary missing');rmSync(boundary.stdout.trim(),{recursive:true,force:true});
   const copyBefore=treeSnapshot(target),insuranceBefore=treeSnapshot(target+'.prezhnyaya');
   r=spawnSync('bash',[installer,bad,args[1],target],{env:{...process.env,TMPDIR:temporary},encoding:'utf8',timeout:30000});
   check(layout+' '+kind+' refused with archive member',r.status===2&&r.stderr.includes(kind==='traversal'?'/../../../X':'/link.txt'),r.stderr+r.stdout);
   const escaped=escapedFiles(root);check(layout+' '+kind+' X absent throughout owned arena',escaped.length===0,'X created at '+escaped.join(', '));
   for(const file of escaped)rmSync(file,{force:true}); // Clean only this test's owned arena after recording the fault.
   check(layout+' '+kind+' copy and insurance unchanged',copyBefore===treeSnapshot(target)&&insuranceBefore===treeSnapshot(target+'.prezhnyaya'),r.stderr);
  }
 }
 const odd=join(root,'foreign.tar');const p=spawnSync('python3',['-c',"import tarfile,io,sys; t=tarfile.open(sys.argv[1],'w'); m=tarfile.TarInfo('foreign.txt'); m.size=1; t.addfile(m,io.BytesIO(b'x')); t.close()",odd],{encoding:'utf8'});if(p.status!==0)throw Error(p.stderr);
 const target=join(root,'foreign-copy','ostrov-api'),r=install([odd,rel],target);check('foreign layout refused with archive name',r.status===2&&r.stderr.includes(odd)&&!existsSync(target),r.stderr);
 console.log('RESULT '+(total-failed)+'/'+total);process.exitCode=failed?1:0;
}finally{rmSync(root,{recursive:true,force:true})}
