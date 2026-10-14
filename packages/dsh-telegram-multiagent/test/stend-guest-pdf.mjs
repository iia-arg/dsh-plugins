// Actual native tools, receipts, scoped policy and HTTP bridge; synthetic inputs only.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import fsAsync from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {podnyatPlatformu02} from './platforma-02.mjs';
import {MessageReceipts} from '../src/message-receipts.js';
import {ConversationSessions} from '../src/conversation-sessions.js';
import {installFileTools} from '../src/outgoing-files.js';
import {installSitePolicy} from '../src/site-policy.js';
// B-N-1734: мост — через sosedi.mjs (BRIDGE_CANDIDATE или сосед дерева ../../dsh-tool-bridge); прежний '../../bridge' не было ни в бою, ни в дереве.
import {bridgeDir,iz} from './sosedi.mjs';
const {apply:installBridge}=await iz(bridgeDir(),'src/index.js');
const fixtures=JSON.parse(fs.readFileSync(new URL('./fixtures/sh5-quotes.json',import.meta.url)));
const root=fs.mkdtempSync(path.join(os.tmpdir(),'b1695-guest-pdf-'));
let platform,ledger,passed=0,failed=0,serial=0;
async function test(name,fn){try{await fn();passed++;console.log('PASS '+name)}catch(e){failed++;console.error('FAIL '+name+' '+e.message)}}
try {
  platform=await podnyatPlatformu02({root:path.join(root,'sessions')});
  ledger=new MessageReceipts(path.join(root,'ledger'));
  const conversations=new ConversationSessions(ledger),uploads=[];
  const plugin=platform.ctx.plugin({name:'sh5-channel',inject:['agents'],apply(ctx){
    installFileTools(ctx,{workspace:root,receipts:ledger,conversations,
      config:{openBot:true,allowedUsers:[703],pdfTemplatesDir:new URL('./fixtures/letterheads',import.meta.url).pathname},appDir:process.env.DSH_TEST_APP,
      telegram:{async sendFile(chat,file){uploads.push({chat,file});return{message_id:71}}}});
  }});
  const tools=platform.ctx.get('tools');
  // B-N-1734: подставки — через defineTool платформы, как боевой код (src/index.js:289, outgoing-files.js:141): сырой register
  //   отдаёт мосту карту свойств без верхнего type:object, и мост ≥1.3.33-b1700 такие схемы отбрасывает — стенд краснел на подставке.
  const defineTool=createRequire(path.join(process.env.DSH_TEST_APP,'file-tool-dependencies.js'))('@deepseek-ai/dsh-tools').defineTool;
  tools.register(defineTool({name:'pismo_rukovoditelyu',description:'fixture',parameters:{},
    output:{schema:{type:'string'},render:(_a,v)=>[{type:'text',text:v}]},execute:async()=>'fixture'}));
  tools.register(defineTool({name:'ostrov_api',description:'optional API registration fixture',parameters:{},
    output:{schema:{type:'string'},render:(_a,v)=>[{type:'text',text:v}]},execute:async()=>'fixture API result'}));
  async function agent(chat,prefix='gost-',sender=Number(chat)){
    const a=(await platform.agents.create({sessionId:'telegram-'+prefix+chat,meta:{cwd:root}})).agent;
    conversations.pin(prefix+chat,a.session.header);
    const r=ledger.receive('fixture-'+(++serial),JSON.stringify({message:{chat:{id:Number(chat)},from:{id:sender,is_bot:false},text:'synthetic'}}),{route:'tg',routeKey:chat,hold:false});
    ledger.db.prepare('UPDATE receipts SET session_id=?,session_created=?,dsh_id=?,claimed_turn=1 WHERE id=?').run(a.id,a.session.header.createdAt,'m'+serial,r.id);
    a.session.append('turn/start',{turn:1});
    return {a,r};
  }
  const guest=await agent('701'),other=await agent('702'),work=await agent('703','',703);
  const site=(await platform.agents.create({sessionId:'telegram-site-1',meta:{cwd:root}})).agent;
  installSitePolicy(guest.a.ctx,guest.a,{closed:()=>false});
  installSitePolicy(other.a.ctx,other.a,{closed:()=>false});
  installSitePolicy(site.ctx,site,{closed:()=>false});
  let bridge,dispose=[];
  const bridgeCtx={get:n=>({tools,agents:platform.agents,goals:{get:()=>null},jobs:{},typertGateway:{}}[n]),
    provide:(n,v)=>{if(n==='mcpBridge')bridge=v},on(){},effect:fn=>dispose.push(fn()),logger:{info(){},warn(){},error(){}}};
  installBridge(bridgeCtx,{port:0});
  async function descriptor(a){for(let n=0;n<100;n++){const d=bridge?.descriptor(a.id);if(d)return d;await new Promise(r=>setTimeout(r,10))}throw Error('bridge unavailable')}
  const call=(a,name,args)=>tools.execute({agent:a,name,arguments:args,callId:'sh5-'+(++serial),signal:new AbortController().signal});
  async function refused(a,args){const n=uploads.length;const result=await call(a,'telegram_send_file',args);assert.equal(result.isError,true,JSON.stringify(result));assert.equal(uploads.length,n)}
  await test('TG guest sees both tools in native and HTTP bridge, no bash',async()=>{
    const names=tools.wireSchemas(guest.a).schemas.map(x=>x.name);
    assert(names.includes('telegram_send_file'),'file missing');assert(names.includes('telegram_make_pdf'),'PDF missing');assert(!names.includes('bash'));
    const names2=(await descriptor(guest.a)).tools.map(x=>x.name);assert(names2.includes('telegram_send_file'));assert(names2.includes('telegram_make_pdf'));
    assert(names.includes('ostrov_api'));assert(names2.includes('ostrov_api'));
    assert(!(await call(guest.a,'ostrov_api',{})).isError,'global API tool denied by native restriction');
  });
  await test('site sees API and pismo in native and HTTP bridge',async()=>{
    assert.deepEqual(tools.wireSchemas(site).schemas.map(x=>x.name).sort(),['ostrov_api','pismo_rukovoditelyu']);
    assert.deepEqual((await descriptor(site)).tools.map(x=>x.name).sort(),['ostrov_api','pismo_rukovoditelyu']);
    assert(!(await call(site,'ostrov_api',{})).isError,'site API denied by native restriction');
  });
  for(const [name,args] of [
    ['telegram_send_file',{path:'site-probe.pdf',mode:'document'}],
    ['telegram_make_pdf',{kind:'resident',quote:fixtures.resident,guestName:'Site Ёжик 😀'}]
  ])await test('site direct '+name+' refuses without upload or PDF',async()=>{
    fs.writeFileSync(path.join(root,'site-probe.pdf'),'%PDF-1.4 synthetic');
    const before=fs.existsSync(path.join(root,'vydacha'))?fs.readdirSync(path.join(root,'vydacha'),{recursive:true}).sort():[];
    const n=uploads.length;
    const result=await call(site,name,args);
    assert.equal(result.isError,true,JSON.stringify(result));
    assert.equal(uploads.length,n);
    assert.deepEqual(fs.existsSync(path.join(root,'vydacha'))?fs.readdirSync(path.join(root,'vydacha'),{recursive:true}).sort():[],before);
  });
  fs.mkdirSync(path.join(root,'vydacha/701'),{recursive:true});
  const pdfs=[];
  for(const kind of ['group','biggroup','resident'])await test(kind+' API-shaped quote -> PDF with complete Cyrillic',async()=>{
    const result=await call(guest.a,'telegram_make_pdf',{kind,quote:fixtures[kind],guestName:'Тестовая Анна Ёжик'});
    assert(!result.isError,JSON.stringify(result));const value=result.value;
    assert.match(value.path,/^vydacha\/701\/raschet-\d+\.pdf$/);
    const file=path.join(root,value.path);assert(fs.readFileSync(file).subarray(0,5).toString()==='%PDF-');
    const check=spawnSync('/usr/bin/python3',['-B','-c','from pypdf import PdfReader; import sys,json; p=PdfReader(sys.argv[1]); print(json.dumps({"pages":len(p.pages),"text":"\\n".join(x.extract_text() for x in p.pages)},ensure_ascii=False))',file],{encoding:'utf8'});
    assert.equal(check.status,0,check.stderr);const decoded=JSON.parse(check.stdout);assert(decoded.pages>=1);
    const extracted=decoded.text.replace(/\s+/g,' ');
    for(const expected of ['Остров',kind==='resident'?fixtures[kind].name:(fixtures[kind].organizer||'Тестовая Анна Ёжик'),({group:'1 661 000,00 ₽',biggroup:'1 820 000,00 ₽',resident:'94 500,00 ₽'})[kind],...(fixtures[kind].warnings??[])])assert(extracted.includes(expected.replace(/\s+/g,' ')),expected);
    const sent=await call(guest.a,'telegram_send_file',{path:value.path,mode:'document'});
    assert(!sent.isError,JSON.stringify(sent));assert.equal(uploads.at(-1).chat,'701');assert.equal(uploads.at(-1).file.contentType,'application/pdf');
    pdfs.push(value.path);
  });
  await test('all letterheads execute through native and unknown choice leaves no PDF',async()=>{
    for(const letterhead of ['general_portrait','general_landscape','legal']) {
      const result=await call(guest.a,'telegram_make_pdf',{kind:'resident',quote:fixtures.resident,guestName:'Бланк Ёжик 😀',letterhead});
      assert(!result.isError,JSON.stringify(result));
      assert(fs.readFileSync(path.join(root,result.value.path)).subarray(0,5).equals(Buffer.from('%PDF-')));
    }
    const before=fs.readdirSync(path.join(root,'vydacha/701')).sort();
    const invalid=await call(guest.a,'telegram_make_pdf',{kind:'resident',quote:fixtures.resident,guestName:'Тест',letterhead:'4'});
    assert.equal(invalid.isError,true);assert.deepEqual(fs.readdirSync(path.join(root,'vydacha/701')).sort(),before);
  });
  await test('unavailable letterheads give a reason and create no output',async()=>{
    const before=fs.readdirSync(path.join(root,'vydacha/701')).sort();
    const {pdfTool}=await import('../src/pdf-tool.js');
    const missing=pdfTool({ctx:guest.a.ctx,workspace:root,receipts:ledger,conversations,
      config:{openBot:true,pdfTemplatesDir:path.join(root,'missing-templates')}});
    await assert.rejects(missing.execute({kind:'resident',quote:fixtures.resident,guestName:'Тест'},
      {agent:guest.a,signal:new AbortController().signal}),/бланк .*недоступен/);
    assert.deepEqual(fs.readdirSync(path.join(root,'vydacha/701')).sort(),before);
  });
  await test('saved DTO through native contains visible and clickable exact URL',async()=>{
    const url='https://ostrov.center/residents?x=1&y=2#plan=bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
    const result=await call(guest.a,'telegram_make_pdf',{result:{kind:'resident',quote:fixtures.resident,url,updatedAt:'2026-10-06T18:00:00Z'},guestName:'Сохранённый Ёжик 😀'});
    assert(!result.isError,JSON.stringify(result));
    const check=spawnSync('/usr/bin/python3',['-B','-c',
      'from pypdf import PdfReader; import sys,json; p=PdfReader(sys.argv[1]); print(json.dumps({"text":"\\n".join(x.extract_text() for x in p.pages),"uris":[str(a.get_object().get("/A",{}).get("/URI","")) for x in p.pages for a in x.get("/Annots",[])]},ensure_ascii=False))',path.join(root,result.value.path)],{encoding:'utf8'});
    assert.equal(check.status,0,check.stderr);const decoded=JSON.parse(check.stdout);assert(decoded.text.includes(url));assert(decoded.uris.includes(url));
  });
  await test('ambiguous and invalid saved result leave no output file',async()=>{
    const before=fs.readdirSync(path.join(root,'vydacha/701')).sort();
    for(const args of [
      {kind:'resident',quote:fixtures.resident,result:{quote:fixtures.resident,url:'https://ostrov.me/x'},guestName:'Тест'},
      {kind:'resident',result:{quote:fixtures.resident,url:'javascript:alert(1)'},guestName:'Тест'},
      {kind:'resident',result:{quote:fixtures.resident},guestName:'Тест'},
      {kind:'resident',result:{quote:fixtures.resident,url:'https://ostrov.center/x',updatedAt:'2026-10-06T18:00:00Z'},guestName:'Тест'},
      {kind:'resident',result:{kind:'resident',quote:fixtures.resident,url:'https://ostrov.center/x'},guestName:'Тест'}])assert.equal((await call(guest.a,'telegram_make_pdf',args)).isError,true);
    assert.deepEqual(fs.readdirSync(path.join(root,'vydacha/701')).sort(),before);
  });
  await test('foreign guest output directory refused',async()=>{
    fs.mkdirSync(path.join(root,'vydacha/702'),{recursive:true});fs.writeFileSync(path.join(root,'vydacha/702/foreign.pdf'),'%PDF-1.4 synthetic');
    await refused(guest.a,{path:'vydacha/702/foreign.pdf'});
  });
  await test('outside workspace refused',()=>refused(guest.a,{path:'/etc/hosts'}));
  await test('workspace root outside own folder refused',async()=>{fs.writeFileSync(path.join(root,'root.pdf'),'%PDF-1.4 synthetic');await refused(guest.a,{path:'root.pdf'})});
  await test('model cannot select chat for send or generation',async()=>{
    await refused(guest.a,{path:pdfs[0]??'unused.pdf',chat_id:'702'});
    const result=await call(guest.a,'telegram_make_pdf',{kind:'resident',quote:fixtures.resident,guestName:'Тест',chat_id:'702'});assert.equal(result.isError,true);
  });
  await test('guest arbitrary txt extension refused',async()=>{fs.writeFileSync(path.join(root,'vydacha/701/text.txt'),'synthetic');await refused(guest.a,{path:'vydacha/701/text.txt'})});
  await test('generator refuses null total',async()=>{const r=await call(guest.a,'telegram_make_pdf',{kind:'group',quote:{...fixtures.group,total:null},guestName:'Тест'});assert.equal(r.isError,true)});
  await test('generator does not overwrite prior PDF',async()=>{assert.equal(new Set(pdfs).size,pdfs.length);assert.equal(pdfs.length,3)});
  await test('cancellation at output creation removes own file and refuses path',async()=>{
    const before=fs.readdirSync(path.join(root,'vydacha/701')).sort(),controller=new AbortController();
    const original=fsAsync.open;let injected=false;
    fsAsync.open=async(...args)=>{const handle=await original(...args);
      if(typeof args[1]==='number'&&(args[1]&fs.constants.O_CREAT)){injected=true;controller.abort()}
      return handle;};
    try {await assert.rejects(tools.get('telegram_make_pdf',guest.a).execute({kind:'resident',quote:fixtures.resident,guestName:'Тест'},
      {agent:guest.a,signal:controller.signal}));}
    finally{fsAsync.open=original;}
    assert(injected,'abort injection missed output O_CREAT');
    assert.deepEqual(fs.readdirSync(path.join(root,'vydacha/701')).sort(),before);
  });
  await test('HTTP bridge executes PDF tool and returns current folder path',async()=>{
    const d=await descriptor(guest.a);
    const response=await fetch(d.url,{method:'POST',headers:{'content-type':'application/json','x-bridge-ticket':d.ticket},
      body:JSON.stringify({tool:'telegram_make_pdf',args:{kind:'resident',quote:fixtures.resident,guestName:'Тест через мост'}}),signal:AbortSignal.timeout(10000)});
    const result=await response.json();assert.equal(result.ok,true,JSON.stringify(result));
    assert.match(result.value.value.path,/^vydacha\/701\/raschet-\d+\.pdf$/);
  });
  await test('working chat retains file tool and txt behavior',async()=>{fs.writeFileSync(path.join(root,'working.txt'),'worker');const r=await call(work.a,'telegram_send_file',{path:'working.txt'});assert(!r.isError);assert.equal(uploads.at(-1).chat,'703')});
  for(const f of dispose)f?.();await plugin.dispose();
} finally {await platform?.ctx.fiber.dispose();ledger?.close();fs.rmSync(root,{recursive:true,force:true})}
console.log(JSON.stringify({passed,failed}));process.exitCode=failed?1:0;
