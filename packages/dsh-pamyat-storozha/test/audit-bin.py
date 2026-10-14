#!/usr/bin/env python3
"""Actual bin CLI on disposable SQLite/zstd/log fixtures; never touches live data or services."""
from pathlib import Path
import json, os, shutil, sqlite3, subprocess, tempfile
pkg = Path(__file__).resolve().parents[1]
node = shutil.which('node')
if not node:
    print('СЛЕПОТА: Node unavailable to CLI fixture runner'); raise SystemExit(2)
fail = 0
blind = 0
count = 0
class Blind(Exception): pass
def probe(name, run):
    global count, fail, blind
    count += 1
    try: run(); print('✅ '+name, flush=True)
    except Blind as e: blind += 1; print('СЛЕПОТА: '+name+': '+str(e), flush=True)
    except Exception as e: fail += 1; print('❌ '+name+': '+str(e), flush=True)
def require(condition, message):
    if not condition: raise AssertionError(message)
with tempfile.TemporaryDirectory(prefix='storozha-bin-audit-') as td:
    d=Path(td); conf=d/'settings.conf';conf.write_text('')
    env={'PATH':'/usr/local/bin:/usr/bin:/bin','HOME':str(d),'DSH_PROBA':'1','DSH_PAMYAT_STOROZHA_CONF':str(conf)}
    def cli(tool, *args, extra=None, cwd=None):
        return subprocess.run([node,str(pkg/'bin'/tool),*map(str,args)],env=env|(extra or {}),cwd=cwd,capture_output=True,text=True,timeout=30)
    def compressed(path, seqs, time=1):
        if not shutil.which('zstd'): raise Blind('zstd not found; no compressed fixture can be produced')
        path.parent.mkdir(parents=True,exist_ok=True)
        raw=''.join(json.dumps({'seq':n,'time':time})+'\n' for n in seqs).encode()
        q=subprocess.run(['zstd','-q','-f','-o',str(path)],input=raw,capture_output=True);
        if q.returncode != 0: raise Blind('zstd fixture compression failed')
    sessions=d/'sessions'; journal=sessions/'telegram-a2a/session.jsonl.zstd'
    conf.write_text('DSH_SESSII='+str(sessions)+'\n')
    def large_control():
        compressed(journal,range(222189))
        q=cli('proverka-opory.mjs','--kontrol');require(q.returncode==0,q.stdout+q.stderr);require('ПРОЙДЕН' in q.stdout,'no control verdict')
    probe('09 actual 222189-event zstd journal passes control without spread overflow',large_control)
    def all_members():
        names=['core','omega','secretary','byudzhet','nudzh','restore','storozha','kompakt','kompakt-dsh']
        clone=d/'clone';(clone/'packages/dsh-pamyat').mkdir(parents=True)
        (clone/'packages/dsh-pamyat/package.json').write_text(json.dumps({'dependencies':{'dsh-pamyat-'+n:'1.1.51' for n in names}}))
        mock=d/'mockbin';mock.mkdir();git=mock/'git'
        git.write_text('#!/bin/sh\ncase "$3" in fetch) exit 1;;show|log) printf "%s\\n" "'+ '" "'.join('accepted '+n+' 1.1.51' for n in names)+'";;esac\n');git.chmod(0o755)
        preload=d/'registry.mjs';preload.write_text("globalThis.fetch=async()=>({ok:true,json:async()=>({versions:{'1.1.51':{}}})});")
        conf.write_text('DSH_PLUGINS_KLON='+str(clone)+'\n')
        q=subprocess.run([node,'--import',str(preload),str(pkg/'bin/sostav-nabora.mjs')],env=env|{'PATH':str(mock)+':'+env['PATH']},capture_output=True,text=True,timeout=30)
        require(q.returncode in (0,2),q.stdout+q.stderr);require('вердикта нет' not in q.stdout,q.stdout)
        require(all(('  '+n) in q.stdout for n in names),'missing named member')
        if q.returncode==2: require('ВЫДЕРЖКА СЕРИИ: СЛЕПОТА' in q.stdout,'unexpected blindness')
    probe('10 all nine manifest members receive their accepted verdict',all_members)
    def chain_safe_paths():
        weird=d/"paths with ' quote ; $(touch SHOULD-NOT-EXIST)";weird.mkdir();copied=weird/'chain.mjs';shutil.copy2(pkg/'bin/proverka-cepi-boem.mjs',copied)
        q=subprocess.run([node,str(copied),'--kontrol'],env=env|{'HOME':str(weird),'TMPDIR':str(weird)},cwd=weird,capture_output=True,text=True,timeout=30)
        require(q.returncode==0,q.stdout+q.stderr);require('ПРОЙДЕН' in q.stdout,'no control verdict');require(not (weird/'SHOULD-NOT-EXIST').exists(),'shell expansion executed')
    probe('14-15 chain control works without workspace and treats quoted paths as data',chain_safe_paths)
    def missing_reader():
        conf.write_text('');missing=d/'missing';healthy=d/'empty';healthy.mkdir()
        for path,code in [(healthy,0),(missing,2),(healthy,0)]:
            q=cli('chitatel-otklonennyh.mjs',path,'--suho');require(q.returncode==code,q.stdout+q.stderr)
            if code==2:require('СЛЕПОТА' in q.stdout+q.stderr and 'Error:' not in q.stderr,q.stdout+q.stderr)
    probe('16 rejected reader healthy/missing/recovered gives named blindness',missing_reader)
    def unknown_reader_flag():
        directory=d/'unknown-reader';directory.mkdir();file=directory/'zadanie-fixture.txt';file.write_text('fixture')
        q=cli('chitatel-otklonennyh.mjs',directory,'--dry-run')
        require(q.returncode==2,q.stdout+q.stderr)
        require(not (directory/'zadanie-fixture.txt.reshenie.txt').exists(),'unknown dry-run flag wrote a decision')
    probe('16 unknown dry-run flag refuses before writing a decision',unknown_reader_flag)

    def repeat_file():
        # The storage seam is isolated: the real command validates paths/header and renames the real file.
        core=d/'core';core.mkdir();(core/'package.json').write_text('{"type":"module"}')
        (core/'hranilishche.js').write_text("import{appendFileSync}from'node:fs';export const otkrytHranilishche=()=>({poId:()=>({agent:'fixture'}),zapisat:()=>{appendFileSync(process.env.ACTIONS,'write\\n');return 7},ustanovitOtnoshenie:()=>({ishod:'fixture'})});")
        (core/'index.js').write_text('export const KLASSY_ZNANIY_UMOLCHANIE=[];')
        base=d/'repeat.db';base.touch();f=d/'povtoryaet-1.txt';f.write_text('# повторяет действующую запись: 1\n# класс: urok\n\nfixture text\n')
        actions=d/'actions';e={'PAMYAT_VERNUT_CORE':str(core)+'/', 'ACTIONS':str(actions)}
        q=cli('pamyat-vernut-povtor',f.name,base,extra=e,cwd=d);require(q.returncode==0,q.stdout+q.stderr)
        returned=d/'povtoryaet-1.vozvrashcheno-7.txt';require(returned.exists(),'no renamed file')
        q=cli('pamyat-vernut-povtor',returned,base,extra=e,cwd=d);require(q.returncode==2,q.stdout+q.stderr)
        require(actions.read_text()=='write\n','second return reached storage')
        marked=d/'folder.vozvrashcheno-2026';marked.mkdir()
        fresh=marked/'povtoryaet-2.txt';fresh.write_text('# повторяет действующую запись: 1\n# класс: urok\n\nfixture text\n')
        q=cli('pamyat-vernut-povtor',fresh,base,extra=e,cwd=d);require(q.returncode==0,q.stdout+q.stderr)
        require(actions.read_text()=='write\nwrite\n','directory marker changed basename validation')
        unsafe=d/'povtoryaet-3.txt';unsafe.write_text('# повторяет действующую запись: 1\n# класс: urok\n\nfixture text\n')
        q=cli('pamyat-vernut-povtor',unsafe,base,'--dry-run',extra=e,cwd=d);require(q.returncode==2,q.stdout+q.stderr)
        require(unsafe.exists() and actions.read_text()=='write\nwrite\n','unknown flag reached storage')

    probe('17 relative repeat file returns once; existing renamed file refuses before storage',repeat_file)
    def reference_formats():
        base=d/'sources.db';db=sqlite3.connect(base);db.execute('create table zapisi(id integer,klass text,istochnik text,soderzhim text,sozdano integer)')
        conf.write_text(f'DSH_SESSII={sessions}\nPAMYAT_BAZA={base}\n')
        cases=[('telegram-a2a#0-1',0),('telegram-a2a#888',1),('telegram-a2a#888-889#okno1',1),('telegram-a2a#1-3',1),('other#1-2',2)]
        compressed(journal,[0,1,3,4]);compressed(sessions/'telegram-a2a/session.v4.jsonl.zstd',[0,1],time=3)
        for source,code in cases:
            db.execute('delete from zapisi');db.execute('insert into zapisi values(?,?,?,?,?)',(1,'urok',source,'fixture',1));db.commit()
            q=cli('sverka-s-istochnikom.mjs',base);require(q.returncode==code,source+': '+q.stdout+q.stderr)
        db.execute('delete from zapisi');db.execute('insert into zapisi values(?,?,?,?,?)',(1,'urok','telegram-a2a#3','fixture',4));db.commit()
        q=cli('sverka-s-istochnikom.mjs',base);require(q.returncode==1,'wrong pre/v4 selection: '+q.stdout+q.stderr)
        db.close()
    probe('18 singleton/window/hole/missing-session and old/v4 selection are checked',reference_formats)
    def startup_red_marker():
        y=subprocess.run(['python3','-c','import yaml'],env=env,capture_output=True)
        if y.returncode: raise Blind('PyYAML unavailable to the startup fixture')
        plugins=d/'startup-plugins'; names=['core','omega','secretary','byudzhet','nudzh','restore']
        cordis=plugins/'dsh-pamyat-core/node_modules/@deepseek-ai/cordis';cordis.mkdir(parents=True)
        (cordis/'package.json').write_text('{"type":"module","main":"index.js"}')
        (cordis/'index.js').write_text('export class Context {provide(){} plugin(m,c){m.apply(this,c);return {state:2}}}')
        for name in names:
            target=plugins/('dsh-pamyat-'+name);(target/'src').mkdir(parents=True,exist_ok=True)
            (target/'package.json').write_text('{"type":"module"}')
            body='' if name=='secretary' else 'console.error("[dsh-pamyat-'+name+' 1.1.51] подъём: fixture")'
            (target/'src/index.js').write_text('export const apply=()=>{'+body+'};')
        profile=d/'profile.yml';profile.write_text('insert:\n'+''.join('  - name: dsh-pamyat-'+n+'\n    config: {agent: fixture}\n' for n in names))
        conf.write_text(f'PAMYAT_CORE={plugins}/dsh-pamyat-core\nSLED_PROFIL={profile}\n')
        q=cli('proba-sleda-podyoma.mjs')
        require(q.returncode==1,q.stdout+q.stderr)
        require('secretary' in q.stdout and 'FAIL' in q.stdout,q.stdout)
        require('КРАСНА С null' not in q.stdout and 'NaN' not in q.stdout,q.stdout)
    probe('13 actual failed startup verdict omits unset redness date',startup_red_marker)
print(f'итог: {count-fail-blind} из {count} · слепых {blind}')
raise SystemExit(1 if fail else 2 if blind else 0)
