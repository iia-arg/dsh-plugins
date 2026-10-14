// Test-only subprocess: stop before HTTP after the real writer has committed sending.
import {Store} from '../src/store.mjs';
import {createVkPostWriter,VkPostApi} from '../src/vk-post-writer.mjs';
const store=new Store(process.argv[2],{vk:'127999849',telegram:'-202'},{profile:'anna',now:()=>Date.parse('2026-10-13T06:00:00Z')});
const api=new VkPostApi('crash-fixture-only',{fetchImpl:async()=>{process.send({event:'unexpected_http'});throw Error('HTTP must not begin before the crash')}});
api.transport.rate.tail=new Promise(()=>{});
const worker=createVkPostWriter(store,{enabled:true},{api,log(){}});
worker.tick().catch(()=>process.exit(2));
const action=store.db.prepare('SELECT state FROM vk_post_actions').get();
const draft=store.db.prepare('SELECT state FROM drafts').get();
process.send({event:'committed',action:action?.state,draft:draft?.state});
setInterval(()=>{},1000);
