// RU: Изолированный стенд stend-site-timer.mjs: проверяет реальные границы модуля на управляемых входах. Условия внешних сервисов и код слепоты читай в сценариях; прохождение не доказывает живую доставку.
// EN: Isolated harness stend-site-timer.mjs: exercises module boundaries using controlled inputs. Read its scenarios for external-service requirements and blind outcomes; passing does not prove live delivery.
import assert from 'node:assert/strict';import {startSitePolling} from '../src/site-channel.js';
let closed=false,stops=0,polls=0,release;const run={alive:true};const site={closed:()=>closed,stop:async()=>{stops++;},poll:async()=>{polls++;await new Promise(r=>{release=r;});}};
const timer=startSitePolling(site,run,()=>{});try{
 await new Promise(r=>setTimeout(r,1100));assert.equal(polls,1);const at=Date.now();closed=true;
 await new Promise(r=>setTimeout(r,1100));assert.equal(stops,1);assert.equal(polls,1);assert(Date.now()-at<5000);console.log('PASS external close interrupts while input poll awaits; below5s');
 run.alive=false;clearInterval(timer);release();await new Promise(r=>setTimeout(r,1100));assert.equal(polls,1);assert.equal(site.active(),false);console.log('PASS last unmount prevents another site poll');
}finally{run.alive=false;clearInterval(timer);release?.();}
