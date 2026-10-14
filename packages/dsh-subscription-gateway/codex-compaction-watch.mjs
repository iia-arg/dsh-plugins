// RU: Наблюдать реальный rollout и token_count по времени события. Пропавшие числа — unknown, не ноль; telemetry не равна доказанному физическому уменьшению platform checkpoint.
// EN: Observe actual rollout and token_count using event timestamps. Missing counts are unknown, not zero; telemetry is not proof of physical reduction of a platform checkpoint.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {StringDecoder} from 'node:string_decoder';
const UNKNOWN='не сообщено';
const number=v=>Number.isSafeInteger(v)&&v>=0?v:UNKNOWN;
const usage=u=>Object.fromEntries(['input_tokens','cached_input_tokens','output_tokens','total_tokens'].map(k=>[k,number(u?.[k])]));

// RU: compactionParser: Наблюдать реальный rollout и token_count по времени события. Пропавшие числа — unknown, не ноль; telemetry не равна доказанному физическому уменьшению platform checkpoint.
// EN: compactionParser: Observe actual rollout and token_count using event timestamps. Missing counts are unknown, not zero; telemetry is not proof of physical reduction of a platform checkpoint.
export function compactionParser(emit, context=()=>({}), onTokenCount=null, onCompacted=null) {
  let ordinary=null, record=null, window=UNKNOWN, pending=null;
  const finish=(after=UNKNOWN)=>{if(pending){emit({...pending,after_tokens:after,...context(pending.model_context_window)});pending=null;}};
  return {
    accept(event, report=true, atClose=false) {
      const p=event.payload??{};
      if(event.type==='token_usage_record')record=p;
      if(event.type==='event_msg'&&p.type==='token_count'){
        window=number(p.info?.model_context_window);
        if(pending)finish(number(p.info?.last_token_usage?.total_tokens));
        ordinary={time:event.timestamp,usage:p.info?.last_token_usage};

        if(report&&onTokenCount){try{onTokenCount({time:event.timestamp,last:p.info?.last_token_usage,window,atClose});}catch{}}
      }
      if(event.type==='compacted'){
        if(report&&onCompacted){try{onCompacted({time:event.timestamp});}catch{}}
        finish();
        const id=p.compaction_response_id;
        const u=p.latest_token_usage_record?.response_id===id ? p.latest_token_usage_record : (id&&record?.response_id===id?record:null);
        if(report)pending={event:'codex_compacted',event_time:event.timestamp??UNKNOWN,
          ordinary_time:ordinary?.time??UNKNOWN,ordinary_usage:usage(ordinary?.usage),
          compaction_response_id:id??UNKNOWN,compaction_usage:usage(u?.usage),model_context_window:window,
          codex_auto_compact_effective:UNKNOWN,codex_trigger_counter:UNKNOWN,codex_trigger_reason:UNKNOWN,
          after_tokens_kind:'первый token_count после compacted; не расход API'};
        ordinary=null;
      }
    }, finish
  };
}
// RU: snapshot: Наблюдать реальный rollout и token_count по времени события. Пропавшие числа — unknown, не ноль; telemetry не равна доказанному физическому уменьшению platform checkpoint.
// EN: snapshot: Observe actual rollout and token_count using event timestamps. Missing counts are unknown, not zero; telemetry is not proof of physical reduction of a platform checkpoint.
function snapshot(file){const raw=fs.readFileSync(file);return {text:raw.toString('utf8'),file,sha256:crypto.createHash('sha256').update(raw).digest('hex').slice(0,16),mtime:fs.statSync(file).mtime.toISOString()};}
// RU: diskContext: Наблюдать реальный rollout и token_count по времени события. Пропавшие числа — unknown, не ноль; telemetry не равна доказанному физическому уменьшению platform checkpoint.
// EN: diskContext: Observe actual rollout and token_count using event timestamps. Missing counts are unknown, not zero; telemetry is not proof of physical reduction of a platform checkpoint.
export function diskContext(env, window) {
  const result={agent:env.KOMPAKT_AGENT||UNKNOWN,observed_at:new Date().toISOString(),
    codex_auto_compact_config:UNKNOWN,platform_threshold_config:UNKNOWN,platform_threshold_effective:UNKNOWN,
    settings_scope:'файлы на момент наблюдения; НЕ effective процесса'};
  try{
    const s=snapshot(path.join(env.CODEX_HOME,'config.toml'));
    const top=s.text.split(/^\s*\[/m)[0];
    const values=[...top.matchAll(/^\s*model_auto_compact_token_limit\s*=\s*([0-9_]+)\s*(?:#.*)?$/gm)];
    if(values.length===1)result.codex_auto_compact_config=number(Number(values[0][1].replaceAll('_','')));
    result.codex_config={file:s.file,sha256:s.sha256,mtime:s.mtime};
  }catch{result.codex_config='не прочитан';}
  // B-N-1742: тот же D/defaultRoute, что chitat_porog_d; окно rollout не основание порога.
  const agent=env.KOMPAKT_AGENT;
  let file=env.KOMPAKT_NASTROJKI_KATALOG||'/etc/dsh-pamyat/agenty';
  try{
    if(typeof agent!=='string'||!/^[A-Za-z0-9_-]+$/.test(agent))throw Error('негодное имя агента');
    file=path.join(file,agent+'.json');
    const s=snapshot(file),p=JSON.parse(s.text).porogi;
    const exact=(v,keys)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).sort().join(',')===keys.sort().join(',');
    const route=v=>exact(v,['provider','model'])&&['provider','model'].every(k=>typeof v[k]==='string'&&v[k].length>0);
    if(!exact(p,['schema','defaultRoute','routes'])||p.schema!==1)throw Error('неизвестная schema porogi');
    if(!route(p.defaultRoute))throw Error('негодный defaultRoute');
    if(!Array.isArray(p.routes)||!p.routes.length)throw Error('пустые routes');
    const seen=new Set();let chosen=null;
    for(const r of p.routes){
      if(!exact(r,['provider','model','window','ratio','nominalThreshold'])||!route({provider:r.provider,model:r.model}))throw Error('негодный маршрут');
      const key=JSON.stringify([r.provider,r.model]);
      if(seen.has(key))throw Error('повтор маршрута');seen.add(key);
      if(!Number.isSafeInteger(r.window)||r.window<=0||!Number.isSafeInteger(r.nominalThreshold)||r.nominalThreshold<=0||r.nominalThreshold>=r.window)throw Error('негодные window/nominalThreshold');
      if(typeof r.ratio!=='number'||!Number.isFinite(r.ratio)||r.ratio<=0||r.ratio>=1)throw Error('негодная ratio');
      if(r.provider===p.defaultRoute.provider&&r.model===p.defaultRoute.model)chosen=r;
    }
    if(!chosen)throw Error('defaultRoute не объявлен в routes');
    result.platform_threshold_config=chosen.nominalThreshold;result.platform_ratio_config=chosen.ratio;
    result.platform_model_config=chosen.model;result.platform_provider_config=chosen.provider;
    result.platform_window_config=chosen.window;result.platform_route_source='defaultRoute';
    result.platform_config={file:s.file,sha256:s.sha256,mtime:s.mtime};
  }catch(error){result.platform_config='не прочитан';result.platform_config_error=`${agent||UNKNOWN}: D ${file}: ${error.message}`;}
  return result;
}

export const STUPEN_CODEX = 25000;

const eventTime=(time,label='событие')=>typeof time==='string'&&Number.isFinite(Date.parse(time))
  ? `${label} ${time}` : 'время события не сообщено';
// RU: davlenieCodex: Наблюдать реальный rollout и token_count по времени события. Пропавшие числа — unknown, не ноль; telemetry не равна доказанному физическому уменьшению platform checkpoint.
// EN: davlenieCodex: Observe actual rollout and token_count using event timestamps. Missing counts are unknown, not zero; telemetry is not proof of physical reduction of a platform checkpoint.
export function davlenieCodex({porog, log}) {
  let k=0, max=null, maxTime=null, okno=null, napechatano=null, krasnoe=false;
  const P = porog?.porog;
  const opisP = P!==undefined ? `${P} (${porog.okno} × ${porog.dolya})` : `НЕ ПРОЧИТАН (${porog?.prichina ?? 'причина не названа'})`;
  return {
    accept({time, last, window, atClose=false}) {
      const z = last?.input_tokens;
      if(!Number.isSafeInteger(z)||z<0) return;
      k++; if(Number.isSafeInteger(window)) okno=window;
      if(max===null||z>max){max=z;maxTime=time;}
      const timing=`${eventTime(time)} · ${atClose ? 'напечатано в конце хода' : 'чтение rollout в ходе'}`;
      if(napechatano===null||z>=napechatano+STUPEN_CODEX){ napechatano=z;
        log(`давление Codex внутри хода: занято ${z} из окна ${okno ?? '?'} · порог платформы ${opisP} · ${timing}`); }
      if(!krasnoe&&(P===undefined||z>=P)){ krasnoe=true;
        log((P===undefined
          ? `🔴 ДАВЛЕНИЕ: Codex внутри хода занял ${z} — порог платформы ${opisP}, сравнить не с чем`
          : `🔴 ДАВЛЕНИЕ: Codex внутри хода занял ${z} ≥ порога платформы ${P} (окно Codex ${okno ?? '?'}) — платформа сожмёт только после хода, Codex сожмёт сам на своём пороге`) + ` · ${timing}`); }
    },
    close() {
      log(k===0 ? 'давление Codex за ход: token_count 0 — давление внутри хода НЕ видно (rollout не прочитан или ход без вызовов модели)'
        : `давление Codex за ход: token_count ${k}, наибольшее занято ${max} из окна ${okno ?? '?'} · порог платформы ${P ?? '?'} — ${P===undefined ? 'не сравнить' : (max>=P ? 'ПРЕВЫШЕН внутри хода' : 'не превышен')} · ${eventTime(maxTime,'событие максимума')} · итог напечатан в конце хода`);
    },
  };
}

// RU: watchCodexCompactions: Наблюдать реальный rollout и token_count по времени события. Пропавшие числа — unknown, не ноль; telemetry не равна доказанному физическому уменьшению platform checkpoint.
// EN: watchCodexCompactions: Observe actual rollout and token_count using event timestamps. Missing counts are unknown, not zero; telemetry is not proof of physical reduction of a platform checkpoint.
export function watchCodexCompactions({resolveFile,log,env=process.env,onTokenCount=null,onCompacted=null,onBlind=null}) {
  let file=null,position=0,identity=null,tail='',decoder=new StringDecoder('utf8'),warned=false,closed=false;
  let thresholdWarned=false;
  const parser=compactionParser(row=>{
    if(row.platform_config_error){
      if(!thresholdWarned)log('[codex-compaction] '+JSON.stringify({event:'observer_blind',agent:row.agent,reason:row.platform_config_error}));
      thresholdWarned=true;
    }else thresholdWarned=false;
    log('[codex-compaction] '+JSON.stringify({...row,rollout_file:file}));
  },w=>diskContext(env,w),onTokenCount,onCompacted);
  const warn=reason=>{try{onBlind?.()}catch{}if(!warned){warned=true;log('[codex-compaction] '+JSON.stringify({event:'observer_blind',agent:env.KOMPAKT_AGENT||UNKNOWN,reason}));}};
  function read(seed=false,atClose=false){
    try{
      const next=resolveFile();if(!next){if(file)warn('rollout path unavailable');return;}
      if(file&&file!==next){warn('rollout path changed');return;}
      const st=fs.statSync(next);file=next;const id=`${st.dev}:${st.ino}`;
      if(identity&&(identity!==id||st.size<position)){warn('rollout replaced or truncated');return;}
      identity=id;
      let skip=false;
      if(seed&&st.size>1048576){position=st.size-1048576;skip=true;}
      const fd=fs.openSync(file,'r');
      try{
        const buf=Buffer.alloc(1048576);
        while(position<st.size){
          const n=fs.readSync(fd,buf,0,Math.min(buf.length,st.size-position),position);if(!n)break;
          position+=n;tail+=decoder.write(buf.subarray(0,n));
          let end;
          while((end=tail.indexOf('\n'))>=0){const line=tail.slice(0,end);tail=tail.slice(end+1);
            if(skip){skip=false;continue;}
            if(!line.trim())continue;
            try{parser.accept(JSON.parse(line),!seed,atClose);}catch{warn('rollout line not parsed');}
          }
          if(tail.length>32*1024*1024){warn('rollout line exceeds 32 MiB');tail='';skip=true;}
        }
      }finally{fs.closeSync(fd);}
    }catch(error){if(file||error.code!=='ENOENT')warn('rollout not readable');}
  }
  read(true);
  const timer=setInterval(()=>read(),1000);timer.unref();
  return {close(){if(closed)return;closed=true;clearInterval(timer);read(false,true);parser.finish();if(!file)warn('rollout not found before request ended');}};
}
