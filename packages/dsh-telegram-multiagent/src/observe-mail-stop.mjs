#!/usr/bin/env node
import fs from 'node:fs';import path from 'node:path';
import {observeStopArrivals} from './mail-stop-arrival.js';
try{
 if(process.argv.length!==3||process.argv[2].startsWith('-'))throw Error('expected one root-owned observer config file');
 const file=process.argv[2],st=fs.lstatSync(file);
 if(!path.isAbsolute(file)||!st.isFile()||st.isSymbolicLink()||st.uid!==0||(st.mode&0o022)||st.size>8192)throw Error('untrusted observer config');
 const config=JSON.parse(fs.readFileSync(file,'utf8'));
 if(Object.keys(config).sort().join(',')!=='mailboxes,root')throw Error('invalid observer config fields');
 const observer=observeStopArrivals({...config,onError:code=>console.error('mail-stop-arrival: observation unavailable ('+code+')')});
 console.log('mail-stop-arrival: ready; existing files remain delivery-unknown');
 for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>{observer.close();process.exit(0)});
}catch(error){console.error('ОТКАЗ observer: '+(['expected one root-owned observer config file','untrusted observer config','invalid observer config fields'].includes(error.message)?error.message:(error.code??'observer_unavailable')));process.exitCode=2}
