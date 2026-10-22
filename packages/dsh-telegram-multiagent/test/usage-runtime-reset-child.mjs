import fs from 'node:fs';import path from 'node:path';import {UsageRuntime} from '../src/usage-runtime.js';
const x=JSON.parse(fs.readFileSync(0,'utf8'));if(!path.resolve(x.root).startsWith(path.resolve(process.env.TMPDIR||'/tmp')+path.sep))throw Error('fixture only');
function kill(stage){console.log('FAULT_ENTERED '+stage+' root='+x.root);process.kill(process.pid,'SIGKILL')}
const rename=fs.promises.rename.bind(fs.promises);fs.promises.rename=async(a,b)=>{if(x.stage==='before-rename')kill(x.stage);await rename(a,b);if(x.stage==='after-rename')kill(x.stage)};
const open=fs.promises.open.bind(fs.promises);fs.promises.open=async(file,...args)=>{const fd=await open(file,...args),sync=fd.sync.bind(fd);fd.sync=async()=>{await sync();if(x.stage==='after-temp-sync'&&String(file).endsWith('.tmp'))kill(x.stage);if(x.stage==='after-directory-sync'&&String(file)===x.root)kill(x.stage)};return fd};
const j=new UsageRuntime({root:x.root},'fixture',{heartbeatMs:0,policyPath:x.policyPath});j.watermark(800);await j.close();throw Error('fault stage not reached');
