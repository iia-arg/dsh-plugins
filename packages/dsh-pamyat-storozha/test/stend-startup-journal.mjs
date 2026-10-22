// Actual Cordis mount without a stdout exporter: receipt reads process output, not logger.buffer.
import assert from 'node:assert/strict';
import {Context} from '@deepseek-ai/cordis';
import * as plugin from '../src/index.js';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
const root=fs.mkdtempSync(path.join(os.tmpdir(),'storozha-journal-'));
process.env.STOROZHA_STUPENI_FAJL=path.join(root,'stages.json');process.env.KOMPAKT_NASTROJKI_KATALOG=root;
const meta=JSON.parse(fs.readFileSync(new URL('../package.json',import.meta.url),'utf8'));
const output=[],original=console.log;console.log=(...args)=>output.push(args.join(' '));
const ctx=new Context();let fiber;
try{
 fiber=ctx.plugin(plugin,{agent:'startup-proof',stupeni:[0.85,0.9],komandaStoka:''});
 await new Promise(resolve=>setTimeout(resolve,30));
 const startup=output.filter(line=>line.includes(`[${meta.name} ${meta.version}] подъём:`));
 original(JSON.stringify({stdout_startup:startup.length,cordis_buffer_startup:ctx.logger.buffer.filter(m=>m.args.some(x=>String(x).includes('] подъём:'))).length}));
 assert.equal(startup.length,1,'startup version must reach process stdout without Cordis exporter');
 const parsed=new Map([...output.join('\n').matchAll(/\[([a-z][a-z0-9-]+) (\d[0-9a-z.-]*)(?:\s[^\]]*)?\]/g)].map(m=>[m[1],m[2]]));
 assert.equal(parsed.get(meta.name),meta.version,'actual pered-podyomom journal pattern must see loaded version');
 await fiber.dispose();fiber=null;
 const next=ctx.plugin(plugin,{agent:'startup-proof',stupeni:[0.85,0.9],komandaStoka:''});fiber=next;await new Promise(resolve=>setTimeout(resolve,30));
 assert.equal(output.filter(line=>line.includes(`[${meta.name} ${meta.version}] подъём:`)).length,2,'remount prints one fresh startup');
 original('PASS actual Cordis startup and remount are visible in process output, version matches manifest');
}finally{await fiber?.dispose();console.log=original;fs.rmSync(root,{recursive:true,force:true});}
