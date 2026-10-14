// RU: Если этот стенд красный в исходном дереве — не подгоняйте его под код. Он был написан раньше, чем код
//     догнал рабочую редакцию; красноту снимает приведение кода, а не правка стенда. Подогнанный под старый код
//     стенд перестаёт что-либо проверять.
// EN: If this stand is red in the source tree, do not adjust it to the code. It was written before the code
//     caught up with the production revision; the red is cleared by bringing the code up to date, not by
//     editing the stand. A stand fitted to old code stops checking anything.
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';
import {zanyatostIzZhurnala} from './index.mjs';
// RU: Временное стенда убирается на ЛЮБОМ выходе — обычном, падении пробы, process.exit, SIGTERM/SIGINT (стенды
//     обычно гоняют через timeout 120). Каждый mkdtemp стенда — через vremennyj(). От SIGKILL не спасает ничто;
//     временное, созданное ДОЧЕРНИМ процессом, — забота того процесса.
// EN: The stand's temporary files are removed on ANY exit — normal, failed probe, process.exit, SIGTERM/SIGINT
//     (stands are usually run under timeout 120). Every mkdtemp of the stand goes through vremennyj(). Nothing
//     protects against SIGKILL; temporary files created by a CHILD process are that process's responsibility.
import { mkdtempSync as mkdtempSync_, rmSync as rmSync_ } from 'node:fs'
const VREMENNYE = []
const vremennyj = (...a) => { const k = mkdtempSync_(...a); VREMENNYE.push(k); return k }
process.on('exit', () => { for (const k of VREMENNYE) rmSync_(k, { recursive: true, force: true }) })
process.on('SIGTERM', () => process.exit(143)); process.on('SIGINT', () => process.exit(130))
const d=vremennyj(join(tmpdir(),'cs-reader-'));
try { const f=join(d,'rollout.jsonl');writeFileSync(f,JSON.stringify({payload:{type:'token_count',info:{last_token_usage:{input_tokens:141100,cached_input_tokens:139648,output_tokens:172},total_token_usage:{output_tokens:97779},model_context_window:258400}}})+'\n');
const v=zanyatostIzZhurnala(f);assert.equal(v.vyhod,172,'must return last output, never cumulative');console.log('PASS last output'); }finally{rmSync(d,{recursive:true,force:true})}
