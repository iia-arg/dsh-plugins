// B-N-1695 r3: only literal openBot=true adds PDF; ordinary agents retain file-only.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {podnyatPlatformu02} from './platforma-02.mjs';
import {installFileTools} from '../src/outgoing-files.js';
const root=fs.mkdtempSync(path.join(os.tmpdir(),'sh5-openbot-register-'));
let platform,passed=0,failed=0;
async function check(name,fn){try{await fn();passed++;console.log('PASS '+name)}catch(e){failed++;console.error('FAIL '+name+' '+e.message)}}
try {
  platform=await podnyatPlatformu02({root:path.join(root,'sessions')});
  const agent=(await platform.agents.create({sessionId:'telegram-123',meta:{cwd:root}})).agent;
  const tools=platform.ctx.get('tools');
  for(const [name,config] of [['omitted',{}],['false',{openBot:false}],['string true',{openBot:'true'}],['number one',{openBot:1}],['Varvara literal true',{openBot:true}]]) {
    const logs=[];
    const plugin=platform.ctx.plugin({name:'openbot-'+name,inject:['agents'],apply(ctx){
      installFileTools(ctx,{workspace:root,receipts:{},conversations:{},telegram:{},config,appDir:process.env.DSH_TEST_APP,log:s=>logs.push(s)});
    }});
    for(let n=0;n<100&&!tools.get('telegram_send_file',agent);n++)await new Promise(r=>setTimeout(r,2));
    await check(name+': existing file remains, PDF exactly matches literal true',()=>{
      assert(tools.get('telegram_send_file',agent),'old file tool missing; registration: '+logs.join(' | '));
      assert.equal(!!tools.get('telegram_make_pdf',agent),config.openBot===true);
      const names=tools.wireSchemas(agent).schemas.map(t=>t.name);
      assert.equal(names.includes('telegram_make_pdf'),config.openBot===true);
    });
    await plugin.dispose();
    await check(name+': dispose removes both additions',()=>{
      assert(!tools.get('telegram_make_pdf',agent));assert(!tools.get('telegram_send_file',agent));
    });
  }
} finally {await platform?.ctx.fiber.dispose();fs.rmSync(root,{recursive:true,force:true})}
console.log(`RESULT ${passed}/${passed+failed}`);process.exitCode=failed?1:0;
