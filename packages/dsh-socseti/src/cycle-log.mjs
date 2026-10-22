// Safe aggregate cycle observations; no event bodies, provider IDs or credentials.
export function cycleReporter(platform,lane,log,{windowMs=0}={}){
 let previous=null,lastFlush=null,group=null;
 return sample=>{
  const interval=previous===null?null:sample.finished-previous;previous=sample.finished;
  group??={cycles:0,api_attempts:0,started_at_ms:sample.started,interval_min_ms:null,interval_max_ms:null,elapsed_total_ms:0,clock_regression:false,outcomes:{halted:0,blocked:0,parked:0,partial:0,ok:0}};
  const outcome=Object.hasOwn(group.outcomes,sample.result)?sample.result:'blocked';group.outcomes[outcome]++;
  group.cycles++;group.api_attempts=sample.calls===undefined||group.api_attempts===null?null:group.api_attempts+sample.calls;group.elapsed_total_ms+=sample.elapsed;
  if(interval!==null&&interval>=0){group.interval_min_ms=group.interval_min_ms===null?interval:Math.min(group.interval_min_ms,interval);group.interval_max_ms=group.interval_max_ms===null?interval:Math.max(group.interval_max_ms,interval)}
  if(interval!==null&&interval<0)group.clock_regression=true;
  if(lastFlush!==null&&sample.finished-lastFlush<windowMs&&!group.clock_regression)return;
  log({event:'social_cycle',platform,lane,...group,finished_at_ms:sample.finished,last_result:outcome,result:Object.keys(group.outcomes).find(k=>group.outcomes[k]>0)});
  lastFlush=sample.finished;group=null;
 };
}
