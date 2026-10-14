// RU: Вызывает настоящий apply с реальными импортами DSH; lifecycle effects не запускаются, сеть и модель не вызываются.
// EN: Calls actual apply with real DSH imports; lifecycle effects are held, and neither network nor model is invoked.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {apply} from '../src/index.js';
const appDir=process.env.DSH_TEST_APP;
if(!appDir){console.error('СЛЕПОТА: нужен DSH_TEST_APP');process.exit(2);}
const root=fs.mkdtempSync(path.join(os.tmpdir(),'owner-mount-'));
const originalError=console.error;
try {
  for(const [caseName,value,expected] of [['configured',101,true],['removed',null,false],['restored',101,true],['unreadable-json','{',false]]){
    const workspace=path.join(root,caseName);fs.mkdirSync(workspace);
    const settingsFile=path.join(workspace,'settings.json');fs.writeFileSync(settingsFile,value==='{'?'{':JSON.stringify({deliveryMode:'owner-all',ownerChatId:value}));
    const logs=[],effects=[];
    console.error=(...args)=>logs.push(args.join(' '));
    const context={fiber:{uid:'test'},agents:{roots:()=>[]},provide(){},get(){},on(){},effect:fn=>{effects.push(fn);}};
    apply(context,{token:'fixture',appDir,workspace,settingsFile,openBot:true,allowedUsers:[101,202],ownerChatId:202,mergeChatIntoA2A:202,site:{preset:'website-guest',spoolDir:workspace,stateFile:path.join(workspace,'closed')}});
    console.error=originalError;
    const db=new DatabaseSync(path.join(workspace,'.message-receipts/receipts.sqlite'),{readOnly:true});
    const enabled=!!db.prepare("SELECT 1 FROM sqlite_master WHERE name='site_messages'").get();db.close();
    assert.equal(enabled,expected,caseName);
    assert(effects.length>0,'actual mount must register lifecycle effects');
    if(!expected)assert(logs.some(s=>/ownerChatId.*выключены/.test(s)));
  }
  console.log('PASS actual apply: JSON owner configured → disabled → restored; real DSH imports');
} finally {console.error=originalError;fs.rmSync(root,{recursive:true,force:true});}
