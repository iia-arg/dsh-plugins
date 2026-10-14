import './approval-fixture.mjs';import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {Store} from '../src/store.mjs';import {MetaState} from '../src/meta-receiver.mjs';import {MetaApi} from '../src/meta-api.mjs';
const mod=await import('../src/meta-refresh.mjs').catch(e=>{if(e.code==='ERR_MODULE_NOT_FOUND')return {};throw e});
const now=Date.parse('2026-10-14T03:00:00Z'),account='17841453053403067';
function fixture(t,extra={}){
 assert.equal(typeof mod.MetaRefresh,'function','guarded Meta refresh missing');
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'meta-refresh-')),store=new Store(dir,{instagram:account,threads:'26794519373575025',vk:'127999849',telegram:'-1001925584120'},{profile:'anna',now:()=>now});t.after(()=>{store.close();fs.rmSync(dir,{recursive:true,force:true})});
 const config={enabled:true,armed:true,apiVersion:'v22.0',token:{passRef:'fixture/token'},startAt:'2026-10-14T00:00:00Z',refresh:{enabled:true,contractVerified:true,localSourceConfirmed:true,tokenType:'long_lived',issuedAt:'2026-10-12T03:00:00Z',expiresAt:'2026-10-26T03:00:00Z',minAgeSeconds:86400,...extra}};
 const state=new MetaState(store,'instagram:'+account,config),effects={calls:0,read:0,write:0},read=()=>{effects.read++;return 'old-fixture-token'},install=async()=>{effects.write++},loaded=async()=>true;
 const apiFactory=token=>new MetaApi({provider:'instagram',account,version:'v22.0',token,budget:state,allowRefresh:true,fetchImpl:async url=>{effects.calls++;return new Response(JSON.stringify(new URL(url).pathname.endsWith('/refresh_access_token')?{access_token:'new-fixture-token',expires_in:5184000}:{user_id:account}))}});
 return {store,state,effects,config,make:opts=>new mod.MetaRefresh(store,'instagram',config,{read,install,loaded,apiFactory,...opts})};
}
test('missing type/contract/expiry holds before credential read or HTTP',async t=>{
 const {effects,make}=fixture(t,{contractVerified:false});const result=await make().run();assert.equal(result.phase,'precondition_missing');assert.deepEqual(effects,{calls:0,read:0,write:0});
});
test('eligible refresh verifies account before installation; repeat is not another renewal',async t=>{
 const {effects,make,state}=fixture(t);assert.equal((await make().run()).phase,'idle');assert.equal(effects.write,1);assert.equal(effects.calls,2);assert.equal(state.get().refresh.expires_at,now+5184000000);
 assert.equal((await make().run()).phase,'idle');assert.equal(effects.calls,2);
});
test('crashed refreshing phase remains unknown and never sends another refresh request',async t=>{
 const {effects,make,state}=fixture(t);state.patch({refresh:{phase:'refreshing',last_attempt:now-1000,id:'crashed'}});
 assert.equal((await make().run()).phase,'unknown');assert.deepEqual(effects,{calls:0,read:0,write:0});assert.equal((await make().run()).phase,'unknown');assert.equal(effects.calls,0);
});
test('wrong refreshed account never installs and absent live load confirmation stays held',async t=>{
 const {make,effects,state}=fixture(t);const wrong=()=>({refresh:async()=>({access_token:'fixture-new',expires_in:5184000}),call:async()=>({user_id:'999'})});
 assert.equal((await make({apiFactory:wrong}).run()).phase,'unknown');assert.equal(effects.write,0);
 state.patch({refresh:null});assert.equal((await make({loaded:async()=>false}).run()).phase,'saved_not_loaded');assert.equal(effects.write,1);assert.equal((await make().run()).phase,'saved_not_loaded');assert.equal(effects.write,1);
});
test('late persisted live worker ACK resolves saved_not_loaded without HTTP or installation',async t=>{
 const {state,make,effects}=fixture(t);state.patch({refresh:{id:'op',phase:'saved_not_loaded',candidate_hash:'digest',last_attempt:now,expires_at:now+30*86400000},loadedRefresh:'op',credentialFingerprint:'digest'});
 assert.equal((await make().run()).phase,'idle');assert.deepEqual(effects,{calls:0,read:0,write:0});
});
test('concurrent renewer cannot mark live operation unknown or read its credentials',async t=>{
 const {state,make,effects}=fixture(t);let finish,started=false;
 const apiFactory=token=>({refresh:async()=>{started=true;return new Promise(r=>{finish=r})},call:async()=>({user_id:account})});
 const first=make({apiFactory}).run();for(let i=0;i<20&&!started;i++)await new Promise(r=>setTimeout(r,1));
 const second=await make({apiFactory}).run();assert.equal(second.phase,'busy');assert.equal(state.get().refresh.phase,'refreshing');assert.equal(effects.read,1);
 finish({access_token:'new-fixture-token',expires_in:5184000});assert.equal((await first).phase,'idle');
});
test('owner installer uses same account lock and stages generation only after profile verification',async t=>{
 const installer=await import('../src/meta-token-install.mjs').catch(e=>{if(e.code==='ERR_MODULE_NOT_FOUND')return {};throw e});assert.equal(typeof installer.installMetaToken,'function');
 const {store,config,state}=fixture(t);let writes=0;const result=await installer.installMetaToken(store,'instagram',config,'dummy-owner-token',{apiFactory:()=>({call:async()=>({user_id:account})}),install:()=>{writes++}});
 assert.equal(writes,1);assert.equal(result.phase,'saved_not_loaded');assert.equal(state.get().refresh.candidate_hash.length,64);
 await assert.rejects(installer.installMetaToken(store,'instagram',config,'dummy-wrong-token',{apiFactory:()=>({call:async()=>({user_id:'999'})}),install:()=>{writes++}}));assert.equal(writes,1);
});
