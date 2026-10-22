// ID-only, bounded first-level capture. Billing and native graph proof belong to AP.
import {sourceVersionKey,codexSourceVersion,claudeSourceVersion,supportedSourceVersion} from './source-version.mjs';
const id=x=>typeof x==='string'&&/^[A-Za-z0-9:_-]{1,256}$/.test(x);
const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const key=(task,run)=>JSON.stringify([task,run]);
const statuses=new Set(['completed','failed','stopped']);
const taskOthers=new Set(['local_bash','mcp_task','monitor_mcp','monitor_ws']);
export class ChildCapture{
 constructor({engine,emit}){Object.assign(this,{engine,emit,closed:false,active:false,failed:null,version:null,root:null});this.runs=new Map();this.hooks=new Map();this.tools=new Map();this.orphans=new Map();this.threads=new Map();this.edges=new Map();this.childFrames=new Map();this.otherTasks=new Set()}
 gap(detail){if(this.closed||this.failed)return;this.failed=detail;if(detail==='CAPTURE_LIMIT'){for(const m of [this.hooks,this.tools,this.orphans,this.threads,this.edges,this.childFrames,this.otherTasks])m.clear();while(this.runs.size>128)this.runs.delete([...this.runs.keys()].at(-1))}this.emit({kind:'child_capture_gap',sourceVersionKey:this.version?.sourceVersionKey??null,reason:'CHILD_INCOMPLETE',detail})}
 send(row){if(this.closed||this.failed)return;const record={...row,sourceVersionKey:this.version?.sourceVersionKey??null};if(!this.version){this.gap('VERSION_WITNESS_UNAVAILABLE');return}this.emit(record)}
 bound(){if(this.runs.size>128||this.hooks.size+this.tools.size+this.orphans.size>128||this.runs.size+this.hooks.size+this.tools.size+this.orphans.size+this.childFrames.size+this.otherTasks.size+this.threads.size+this.edges.size>256||this.otherTasks.size>128||this.threads.size>129||this.edges.size>128||this.childFrames.size>128){this.gap('CAPTURE_LIMIT');return false}return !this.failed&&!this.closed}
 setVersion(v,proof,session){this.active=true;if(this.closed||this.failed)return;try{const k=sourceVersionKey(v);if(this.version){if(this.version.sourceVersionKey!==k||this.session!==session)this.gap('VERSION_CONFLICT');return}this.version={sourceVersion:v,sourceVersionKey:k,versionProof:proof};this.session=session;this.emit({kind:'source_version',...this.version});if(!supportedSourceVersion(v)){this.gap('SOURCE_VERSION_UNSUPPORTED');return}if(this.root&&session&&this.root.thread_id!==session){this.gap('ROOT_CONFLICT');return}this.join()}catch{this.gap('VERSION_WITNESS_UNAVAILABLE')}}
 claudeVersion(init,sdk){try{if(!id(init?.session_id))throw Error();this.setVersion(claudeSourceVersion(init,sdk),'claude_system_init_and_import_cache',init.session_id)}catch{this.gap('VERSION_WITNESS_UNAVAILABLE')}}
 codexVersion(reply,name){try{this.setVersion(codexSourceVersion(reply,name),'codex_initialize_user_agent',null)}catch{this.gap('VERSION_WITNESS_UNAVAILABLE')}}
 ready(engine){this.active=true;if(this.closed||this.failed)return;if(this.root&&!equal(this.root,engine)){this.gap('ROOT_CONFLICT');return}this.root={thread_id:engine.thread_id,turn_id:engine.turn_id};if(this.engine==='codex'){for(const [k,r] of this.runs)if(r.taskId===engine.thread_id)this.runs.delete(k);this.validateCodex()}if(this.engine==='claude'&&this.session&&this.session!==engine.thread_id)this.gap('ROOT_CONFLICT');this.join()}
 hook(input,hookId){this.active=true;if(this.closed||this.failed)return;if(!id(input?.agent_id)||!id(input?.prompt_id)||!id(input?.session_id)||!id(hookId)){this.gap('HOOK_ID_UNAVAILABLE');return}
  const h={agentId:input.agent_id,promptId:input.prompt_id,sessionId:input.session_id,hookId};
  const used=[...this.runs.values()].find(r=>r.hook?.hookId===hookId);if(used){if(!equal(used.hook,h))this.gap('JOIN_AMBIGUOUS');return}
  const old=this.hooks.get(hookId);if(old&&!equal(old,h)){this.gap('JOIN_AMBIGUOUS');return}this.hooks.set(hookId,h);if(this.bound())this.join();
 }
 claudeMessage(m){this.active=true;
  if(this.closed||this.failed)return;
  if(m.agent_id!=null||m.parent_tool_use_id!=null){
   if(m.agent_id!=null&&!id(m.agent_id)||m.parent_tool_use_id!=null&&!id(m.parent_tool_use_id)){this.gap('CHILD_ID_UNAVAILABLE');return}
   const frame={agent:m.agent_id??null,tool:m.parent_tool_use_id??null};
   if(![...this.runs.values()].some(r=>r.joined&&(!frame.agent||r.taskId===frame.agent)&&(!frame.tool||r.toolUseId===frame.tool)))this.childFrames.set(key(frame.agent,frame.tool),frame);
   this.bound();return;
  }
  if(m.type==='assistant')for(const b of m.message?.content??[]){if(b?.type!=='tool_use'||!['Agent','Task'].includes(b.name))continue;
   if(!id(b.id)||!id(m.message?.id)||!id(m.session_id)){this.gap('PARENT_TOOL_UNAVAILABLE');return}
   const t={toolUseId:b.id,parentMessageId:m.message.id,sessionId:m.session_id};
   const used=[...this.runs.values()].find(r=>r.joined&&r.toolUseId===b.id);if(used){if(used.parentMessageId!==t.parentMessageId)this.gap('JOIN_AMBIGUOUS');continue}
   const old=this.tools.get(b.id);if(old&&!equal(old,t)){this.gap('JOIN_AMBIGUOUS');return}this.tools.set(b.id,t);if(!this.bound())return;
  }
  if(m.type==='system'&&m.subtype==='task_started'){
   if(taskOthers.has(m.task_type)){if(!id(m.task_id)){this.gap('TASK_ID_UNAVAILABLE');return}this.otherTasks.add(m.task_id);this.bound();for(const [k,t] of this.orphans)if(t.taskId===m.task_id)this.orphans.delete(k);return;}
   if(m.task_type!=='local_agent'||m.spawn_depth!==1||m.parent_task_id!=null){this.gap('CHILD_DEPTH_OR_TYPE_UNSUPPORTED');return}
   if(![m.task_id,m.run_id,m.tool_use_id,m.session_id].every(id)){this.gap('TASK_ID_UNAVAILABLE');return}
   const k=key(m.task_id,m.run_id),r={taskId:m.task_id,runId:m.run_id,toolUseId:m.tool_use_id,sessionId:m.session_id};
   const old=this.runs.get(k);if(old){if(old.toolUseId!==r.toolUseId||old.sessionId!==r.sessionId)this.gap('JOIN_AMBIGUOUS')}
   else{if([...this.runs.values()].some(prior=>prior.taskId===r.taskId&&!prior.terminal)){this.gap('JOIN_AMBIGUOUS');return}this.runs.set(k,r);if(!this.bound())return}
  }
  if(m.type==='system'&&m.subtype==='task_notification'){
   if(this.otherTasks.has(m.task_id))return;
   // Unclassified terminal metadata remains bounded until its start arrives.
   if(![m.task_id,m.run_id,m.session_id].every(id)||!statuses.has(m.status)||m.tool_use_id!=null&&!id(m.tool_use_id)){this.gap('TERMINAL_ID_UNAVAILABLE');return}
   const k=key(m.task_id,m.run_id),t={taskId:m.task_id,runId:m.run_id,status:m.status,sessionId:m.session_id,...(m.tool_use_id!=null?{toolUseId:m.tool_use_id}:{})};
   const old=this.orphans.get(k)??this.runs.get(k)?.terminal;if(old&&!equal(old,t)){this.gap('TERMINAL_CONFLICT');return}
   this.orphans.set(k,t);if(!this.bound())return;
  }
  this.join();
 }
 join(){if(!this.version||!this.root||this.closed||this.failed)return;
  for(const [k,r] of this.runs){
   if(!r.joined){const hooks=[...this.hooks.values()].filter(h=>h.agentId===r.taskId);if(hooks.length>1){this.gap('JOIN_AMBIGUOUS');return}const h=hooks[0],t=this.tools.get(r.toolUseId);if(!h||!t)continue;
    if(r.toolUseId===h.hookId){this.gap('HOOK_CALL_ID_IS_NOT_TOOL_ID');return}
    if([r.sessionId,h.sessionId,t.sessionId].some(s=>s!==this.root.thread_id)){this.gap('JOIN_FOREIGN_SESSION');return}
    r.hook=h;r.parentMessageId=t.parentMessageId;r.joined=true;this.hooks.delete(h.hookId);this.tools.delete(r.toolUseId);
    this.send({kind:'child_started',taskId:r.taskId,runId:r.runId,agentId:r.taskId,childThreadId:r.taskId,parentThreadId:this.root.thread_id,promptId:h.promptId,toolUseId:r.toolUseId,parentMessageId:r.parentMessageId,taskType:'local_agent',spawnDepth:1});
   }
   const t=this.orphans.get(k);if(t){if(t.sessionId!==r.sessionId||t.toolUseId!=null&&t.toolUseId!==r.toolUseId){this.gap('TERMINAL_JOIN_CONFLICT');return}this.orphans.delete(k);if(!r.terminal){r.terminal=t;this.send({kind:'child_terminal',taskId:r.taskId,runId:r.runId,status:t.status,...(t.toolUseId?{toolUseId:t.toolUseId}:{})})}}
  }
  for(const [k,f] of this.childFrames)if([...this.runs.values()].some(r=>r.joined&&(!f.agent||r.taskId===f.agent)&&(!f.tool||r.toolUseId===f.tool)))this.childFrames.delete(k);
 }
 codex(method,p){this.active=true;if(this.closed||this.failed)return;
  if(method==='thread/started'){
   const t=p.thread;if(!id(t?.id)||t.parentThreadId!=null&&!id(t.parentThreadId)){this.gap('CHILD_ID_UNAVAILABLE');return}
   const parent=t.parentThreadId??null;if(this.threads.has(t.id)&&this.threads.get(t.id)!==parent){this.gap('JOIN_AMBIGUOUS');return}this.threads.set(t.id,parent);
  }else if(method==='item/completed'&&p.item?.type==='collabAgentToolCall'){
   const i=p.item;if(!['spawnAgent','sendInput','resumeAgent','wait','closeAgent','sendMessage','followupTask','interruptAgent','listAgents'].includes(i.tool)||!id(i.id)||!id(p.threadId)||!id(p.turnId)||!Array.isArray(i.receiverThreadIds)||!i.receiverThreadIds.every(id)){this.gap('CHILD_TOOL_UNAVAILABLE');return}
   if(this.root&&(p.threadId!==this.root.thread_id||p.turnId!==this.root.turn_id)){this.gap('CHILD_DEPTH_OR_TYPE_UNSUPPORTED');return}
   for(const child of i.receiverThreadIds){if(child===this.root?.thread_id){this.gap('CHILD_DEPTH_OR_TYPE_UNSUPPORTED');return}this.edges.set(child,{threadId:p.threadId,turnId:p.turnId});if(!this.bound())return}
  }else if(['turn/started','turn/completed'].includes(method)&&p.threadId!==this.root?.thread_id){
   if(!id(p.threadId)||!id(p.turn?.id)){this.gap('TASK_ID_UNAVAILABLE');return}
   const k=key(p.threadId,p.turn.id);let r=this.runs.get(k);if(!r){r={taskId:p.threadId,runId:p.turn.id};this.runs.set(k,r)}
   if(method==='turn/started')r.started=true;else if(!['completed','failed','interrupted'].includes(p.turn.status)){this.gap('TERMINAL_ID_UNAVAILABLE');return}else{if(r.terminal&&r.terminal!==p.turn.status){this.gap('TERMINAL_CONFLICT');return}r.terminal=p.turn.status}
  }
  this.validateCodex();this.bound();
 }
 validateCodex(){if(!this.root)return;for(const [child,e] of this.edges)if(child===this.root.thread_id||e.threadId!==this.root.thread_id||e.turnId!==this.root.turn_id)this.gap('CHILD_DEPTH_OR_TYPE_UNSUPPORTED');for(const [thread,parent] of this.threads)if(thread!==this.root.thread_id&&parent!==this.root.thread_id)this.gap(parent===null?'JOIN_UNPROVEN':'CHILD_DEPTH_OR_TYPE_UNSUPPORTED')}
 close(){if(this.closed)return;if(!this.active){this.closed=true;return}
  if(!this.version)this.gap('VERSION_WITNESS_UNAVAILABLE');
  if(this.engine==='claude'){
   this.join();if(this.hooks.size||this.tools.size||this.orphans.size||[...this.runs.values()].some(r=>!r.joined))this.gap('JOIN_UNPROVEN');
   if([...this.runs.values()].some(r=>!r.terminal))this.gap('TERMINAL_MISSING');
   if(this.childFrames.size)this.gap('JOIN_UNPROVEN');
  }else{
   for(const [thread,parent] of this.threads)if(thread!==this.root?.thread_id&&(parent!==this.root?.thread_id||!this.edges.has(thread)))this.gap('CHILD_DEPTH_OR_TYPE_UNSUPPORTED');
   for(const child of this.edges.keys())if(this.threads.get(child)!==this.root?.thread_id||![...this.runs.values()].some(r=>r.taskId===child&&r.started))this.gap('JOIN_UNPROVEN');
   for(const r of this.runs.values())if(!r.started||this.threads.get(r.taskId)!==this.root?.thread_id||!this.edges.has(r.taskId))this.gap('JOIN_UNPROVEN');else if(!r.terminal)this.gap('TERMINAL_MISSING');
  }
  this.emit({kind:'child_capture_end',sourceVersionKey:this.version?.sourceVersionKey??null,startedRuns:[...this.runs.values()].filter(r=>this.engine==='claude'?r.joined:r.started).length,terminalRuns:[...this.runs.values()].filter(r=>r.terminal).length,...(!this.version?{detail:'VERSION_WITNESS_UNAVAILABLE'}:{})});this.closed=true;
 }
}
