// Actual ced3 and25d serializers, kernel child, private socket; no model/RPC/auth contents.
import fs from 'node:fs';import readline from 'node:readline';import {spawn} from 'node:child_process';import {createHash} from 'node:crypto';
const lines=readline.createInterface({input:process.stdin})[Symbol.asyncIterator]();const config=JSON.parse((await lines.next()).value);
const Old=await import(config.old),New=await import(config.new),Segments=await import(config.segments);
let now=1150;Date.now=()=>now;
const child=spawn(config.python,['-I','-B',config.child],{stdio:['pipe','pipe','inherit']});const replies=readline.createInterface({input:child.stdout})[Symbol.asyncIterator]();
child.stdin.write(JSON.stringify(config)+'\n');await replies.next();let old,modern;
const hash=()=>createHash('sha256').update(fs.readFileSync(config.file)).digest('hex');
const emit=value=>process.stdout.write(JSON.stringify(value)+'\n');
try{
 for(;;){const line=await lines.next();if(line.done)break;const cmd=JSON.parse(line.value);
  if(cmd.action==='old'){
   old=new Old.GatewayUsage({file:config.file,engine:'codex',descriptor:config.descriptor,heartbeatMs:0});old.codexSpawn({CODEX_HOME:config.home});now=1160;old.engineProcess(child);now=1220;old.ready({thread_id:config.thread,turn_id:config.turn});now=1300;old.emit({kind:'watermark',at:now});await old.flush();emit({stage:'ced3',fileSHA256:hash(),failure:old.failure});
  }else if(cmd.action==='submit'){
   child.stdin.write(JSON.stringify(cmd)+'\n');emit(JSON.parse((await replies.next()).value));
  }else if(cmd.action==='migrate'){
   await old.close();const before=hash();now=1300;Segments.prepareGatewaySegments(config.file);const after=hash();emit({stage:'migrated',beforeSHA256:before,afterSHA256:after,source:JSON.parse(fs.readFileSync(config.file+'.source.json','utf8'))});
  }else if(cmd.action==='modern'){
   now=3601000;modern=new New.GatewayUsage({file:config.file,engine:'codex',descriptor:config.descriptor,heartbeatMs:0});modern.codexSpawn({CODEX_HOME:config.home});now=3601100;modern.engineProcess(child);now=3601200;modern.ready({thread_id:config.thread,turn_id:config.turn});await modern.flush();now=3601300;modern.emit({kind:'watermark',at:now});await modern.flush();now=4201300;modern.emit({kind:'watermark',at:now});await modern.flush();const view=Segments.inspectGatewaySegments(config.file);emit({stage:'25d',generation:modern.generation,manifest:view.manifest,source:JSON.parse(fs.readFileSync(config.file+'.source.json','utf8')),failure:modern.failure});
  }else if(cmd.action==='stop'){emit({stopped:true});break}else throw Error('UNKNOWN_ACTION');
 }
}finally{if(modern)await modern.close();Segments.closeGatewaySegments();child.stdin.end();child.kill('SIGTERM')}
