// Platform cancellation must keep its terminal reader alive. An ACK alone does
// not prove the SDK stopped. A failed/expired stop remains explicitly unknown.
export function platformCancellation(signal, lease, log) {
  if (typeof lease?.stopOnAbort !== 'function') return {signal, observe(){}, async finish(){}, dispose(){}};
  const transport = new AbortController();
  let aborted=false,ready=false,terminal=false,stop,timer,failure;
  let expire;const deadline=new Promise(resolve=>{expire=resolve});
  let prove;const terminalProof=new Promise(resolve=>{prove=resolve});
  const fail = cause => {
    failure ??= Object.assign(new Error(`REMOTE_STOP_UNCONFIRMED: session ${lease.descriptor.binding.session_id}; SDK terminal not proved within platform cancellation`, {cause}), {code:'REMOTE_STOP_UNCONFIRMED'});
    log?.(failure.message);
    transport.abort(failure);
    expire();
  };
  const request = () => {
    if (!aborted || !ready || terminal || stop) return;
    stop=Promise.resolve().then(()=>terminal?undefined:lease.stopOnAbort()).catch(cause=>{if(!terminal)fail(cause);});
  };
  const abort = () => {
    aborted=true;
    timer=setTimeout(()=>fail(new Error('8000 ms stop deadline')),8000);
    request();
  };
  signal?.addEventListener('abort',abort,{once:true});
  if(signal?.aborted)abort();
  return {
    signal:transport.signal,
    get terminal(){return aborted&&terminal;},
    observe(event){
      if(event.type!=='task-status')return;
      if(event.state==='ready')ready=true;
      if(event.state==='terminal'){terminal=true;prove();}
      request();
    },
    async finish(nextEvent){
      if(!aborted)return;
      try{
        while(!terminal && await nextEvent()!==null){}
        if(!terminal){fail(new Error('stream ended before SDK terminal'));throw failure;}
        await Promise.race([stop,deadline,terminalProof]);
        if(failure&&!terminal)throw failure;
      }catch(cause){if(!failure)fail(cause);throw failure;}
    },
    dispose(){signal?.removeEventListener('abort',abort);clearTimeout(timer);},
  };
}
