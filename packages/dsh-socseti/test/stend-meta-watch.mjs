#!/usr/local/bin/node
// External live reader called by the nightly runner, independent of meta-watch.timer.
import path from 'node:path';import {loadConfig} from '../src/config.mjs';import {probeMetaWatch} from '../src/meta-watch.mjs';
if(process.argv.length!==2||!process.env.META_WATCH_CONFIG||!path.isAbsolute(process.env.META_WATCH_CONFIG)){console.error('СЛЕПО: META_WATCH_CONFIG must name Anna private config');process.exitCode=2}
else try{const result=await probeMetaWatch(loadConfig(process.env.META_WATCH_CONFIG));console.log(JSON.stringify(result));process.exitCode=result.code}catch{console.error('СЛЕПО: Meta timer/state read rejected');process.exitCode=2}
