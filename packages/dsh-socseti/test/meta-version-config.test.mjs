import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {loadConfig} from '../src/config.mjs';import {MetaApi} from '../src/meta-api.mjs';
test('disabled IG v25 setting is the request version; no fixed v22 config gate',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'meta-version-config-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));const file=path.join(dir,'config.json');
 const cfg={profile:'anna',port:8899,stateDir:dir,keyFiles:{anna:'/tmp/a',monitor:'/tmp/m',channel:'/tmp/c'},targets:{vk:'127999849',instagram:'17841453053403067',threads:'26794519373575025',telegram:'-1001925584120'},meta:{instagram:{enabled:false,armed:true,apiVersion:'v25.0',token:{passRef:'instagram/ostrov-2026-access-token'},startAt:'2026-10-14T00:00:00Z'}}};
 fs.writeFileSync(file,JSON.stringify(cfg),{mode:0o600});const parsed=loadConfig(file);assert.equal(parsed.meta.instagram.enabled,false);const sent=[];const api=new MetaApi({provider:'instagram',account:parsed.targets.instagram,version:parsed.meta.instagram.apiVersion,token:'fixture',budget:{reserve(){}},fetchImpl:async url=>{sent.push(new URL(url));return new Response('{"data":[]}')}});
 try{await api.call('roots');assert.equal(sent[0].pathname,'/v25.0/17841453053403067/media');assert.equal(api.nextCursor({next:'https://graph.instagram.com/v25.0/17841453053403067/media?after=n'},sent[0].pathname),'n');assert.throws(()=>api.nextCursor({next:'https://graph.instagram.com/v26.0/17841453053403067/media?after=n'},sent[0].pathname),e=>e.reason==='page_origin')}
 finally{api.stop()}
 for(const bad of ['v25','v25x0','https://evil.invalid']){cfg.meta.instagram.apiVersion=bad;fs.writeFileSync(file,JSON.stringify(cfg),{mode:0o600});assert.throws(()=>loadConfig(file))}
 cfg.meta.instagram.apiVersion='v25.0';cfg.targets.instagram='999';fs.writeFileSync(file,JSON.stringify(cfg),{mode:0o600});assert.throws(()=>loadConfig(file));
});
