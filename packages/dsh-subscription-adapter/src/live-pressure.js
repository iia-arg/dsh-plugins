// RU: Порог из config живого scoped engine; успешный compact только по паре событий сессии.
// EN: Read the scoped live engine config; compaction requires a successful session event pair.
export function createLivePressure(ctx, {scopeTarget,agent,model,window,maxTokens=0,identity,now=Date.now,onUnavailable}) {
  let reason='status-read-failed';
  try {
    if (!agent?.session) { reason='initiator-session-missing'; throw Error(); }
    if (typeof scopeTarget!=='function') { reason='scope-service-unavailable'; throw Error(); }
    if (!identity) { reason='process-identity-unavailable'; throw Error(); }
    const configs=[];
    ctx.emit(scopeTarget(agent,agent),'our/compaction-status',configs);
    if (configs.length!==1) { reason=configs.length===0?'compaction-status-missing':'compaction-status-ambiguous'; throw Error(); }
    const config=configs[0];
    const override=config.modelPolicies?.find(p=>p.provider==='claude-oauth'&&p.model===model);
    const session=agent.session;
    let compact=null;
    const starts=new Set();
    for(let seq=0;seq<session.seq;seq++) {
      const event=session.eventAt(seq), id=event?.data?.compactionId;
      if(event?.type==='compaction/start')starts.add(id);
      else if(event?.type==='compaction/end') {
        if(starts.has(id)&&event.data.error===undefined)compact={id,endSeq:event.seq,time:event.time};
        starts.delete(id);
      }
    }
    return {schema:1,observedAt:now(),process:{pid:identity.pid,startTicks:identity.startTicks},
      adapter:{version:identity.version,sourceSha:identity.sourceSha,policySha:identity.policySha},
      route:{provider:'claude-oauth',model},session:{id:session.header.id,createdAt:session.header.createdAt},
      policy:{window,ratio:override?.thresholdRatio??config.thresholdRatio??.8,
        headroomTokens:override?.headroomTokens??config.headroomTokens??65536,
        reservedCompletionTokens:maxTokens,auto:config.auto??true},compact};
  } catch { onUnavailable?.(reason); return {error:'live-pressure-unavailable',reason}; }
}
