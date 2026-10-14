import {Store} from '../src/store.mjs';
const s=new Store(process.env.TEST_STATE,{vk:'127999849'});
process.send('ready');
process.on('message',()=>{try{const r=s.execute('varvara',process.env.TEST_TOOL,JSON.parse(process.env.TEST_ARGS));process.send({ok:true,result:r})}catch(e){process.send({ok:false,error:e.message})}finally{process.exit(0)}});
