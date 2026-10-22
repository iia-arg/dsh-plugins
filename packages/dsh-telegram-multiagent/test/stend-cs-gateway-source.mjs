// A gateway fixture may read package code, never its account's profiles or SDK homes.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {copyGatewayFixture} from './cs-gateway-fixture.mjs';
const root=fs.mkdtempSync(path.join(os.tmpdir(),'cs-source-'));
const old={source:process.env.STEND_GATEWAY_SOURCE,deps:process.env.STEND_GATEWAY_NODE_MODULES};
let green=0,red=0;
function test(name,fn){try{fn();green++;console.log('PASS '+name)}catch(e){red++;console.log('FAIL '+name+': '+e.message)}}
try{
 const source=path.join(root,'home'),deps=path.join(root,'deps');fs.mkdirSync(source);fs.mkdirSync(deps);
 fs.mkdirSync(path.join(source,'test'));fs.mkdirSync(path.join(source,'.claude'));fs.mkdirSync(path.join(source,'.codex'));
 fs.mkdirSync(path.join(source,'sdk-runtime'));fs.mkdirSync(path.join(source,'node_modules'));
 fs.writeFileSync(path.join(source,'package.json'),JSON.stringify({type:'module',files:['gateway.mjs','test/extract.mjs','test','sdk-runtime','.claude','.codex','.claude.json','node_modules','../outside.mjs']}));
 fs.writeFileSync(path.join(source,'gateway.mjs'),'export const fixture=1;');
 fs.writeFileSync(path.join(source,'test/extract.mjs'),'export const extractFunction=()=>42;');
 fs.writeFileSync(path.join(source,'.claude.json'),'synthetic-private-marker');
 fs.writeFileSync(path.join(source,'test/unlisted.mjs'),'not part of the fixture');
 process.env.STEND_GATEWAY_SOURCE=source;process.env.STEND_GATEWAY_NODE_MODULES=deps;
 test('manifest code selection excludes profiles, SDKs, dependency trees and arbitrary directories',()=>{
  const target=path.join(root,'copy');copyGatewayFixture(target);
  assert.deepEqual(fs.readdirSync(target).sort(),['gateway.mjs','package.json','test']);
  assert.deepEqual(fs.readdirSync(path.join(target,'test')),['extract.mjs']);
  assert.equal(fs.readFileSync(path.join(target,'gateway.mjs'),'utf8'),'export const fixture=1;');
 });
 test('declared public runtime JSON is copied, arbitrary JSON stays private',()=>{
  const manifest=path.join(source,'package.json'),raw=fs.readFileSync(manifest),publicFiles=['usage-limits.json','child-source-versions.json','schedule.json'];
  for(const name of publicFiles)fs.writeFileSync(path.join(source,name),JSON.stringify({fixture:name}));
  fs.writeFileSync(path.join(source,'auth.json'),'synthetic-private-marker');fs.writeFileSync(path.join(source,'other.json'),'synthetic-private-marker');
  fs.writeFileSync(manifest,JSON.stringify({...JSON.parse(raw),files:[...JSON.parse(raw).files,...publicFiles,'auth.json','other.json']}));
  try{const target=path.join(root,'json-copy');copyGatewayFixture(target);assert.deepEqual(fs.readdirSync(target).sort(),['gateway.mjs','package.json','test',...publicFiles].sort());
   for(const name of publicFiles)assert.equal(fs.readFileSync(path.join(target,name),'utf8'),fs.readFileSync(path.join(source,name),'utf8'));
   assert(!fs.existsSync(path.join(target,'auth.json')));assert(!fs.existsSync(path.join(target,'other.json')));
  }finally{fs.writeFileSync(manifest,raw)}
  const undeclared=path.join(root,'undeclared-json-copy');copyGatewayFixture(undeclared);for(const name of publicFiles)assert(!fs.existsSync(path.join(undeclared,name)));
 });
 test('a selected runtime JSON symlink cannot read a private file',()=>{
  const manifest=path.join(source,'package.json'),raw=fs.readFileSync(manifest),file=path.join(source,'usage-limits.json');fs.unlinkSync(file);fs.symlinkSync(path.join(source,'.claude.json'),file);
  fs.writeFileSync(manifest,JSON.stringify({...JSON.parse(raw),files:[...JSON.parse(raw).files,'usage-limits.json']}));
  try{assert.throws(()=>copyGatewayFixture(path.join(root,'json-link-copy')),e=>e.code==='ELOOP');assert(!fs.existsSync(path.join(root,'json-link-copy')))}finally{fs.writeFileSync(manifest,raw);fs.unlinkSync(file)}
 });
 test('missing source is blindness before any copy',()=>{process.env.STEND_GATEWAY_SOURCE=path.join(root,'absent');try{assert.throws(()=>copyGatewayFixture(path.join(root,'absent-copy')),e=>e.code==='STEND_BLIND');assert(!fs.existsSync(path.join(root,'absent-copy')))}finally{process.env.STEND_GATEWAY_SOURCE=source}});
 test('a selected module symlink cannot read a private file',()=>{
  const code=path.join(source,'gateway.mjs');fs.unlinkSync(code);fs.symlinkSync(path.join(source,'.claude.json'),code);
  try{assert.throws(()=>copyGatewayFixture(path.join(root,'link-copy')),e=>e.code==='ELOOP');assert(!fs.existsSync(path.join(root,'link-copy/gateway.mjs')))}finally{fs.unlinkSync(code);fs.writeFileSync(code,'export const fixture=1;')}
 });
 test('a test directory symlink cannot redirect the extractor into a profile',()=>{
  fs.renameSync(path.join(source,'test'),path.join(source,'saved-test'));fs.symlinkSync(path.join(source,'saved-test'),path.join(source,'test'));
  try{assert.throws(()=>copyGatewayFixture(path.join(root,'dir-copy')),/directory|каталог/);assert(!fs.existsSync(path.join(root,'dir-copy/test/extract.mjs')))}finally{fs.unlinkSync(path.join(source,'test'));fs.renameSync(path.join(source,'saved-test'),path.join(source,'test'))}
 });
 test('missing public dependencies are blindness rather than an import failure',()=>{delete process.env.STEND_GATEWAY_NODE_MODULES;try{assert.throws(()=>copyGatewayFixture(path.join(root,'no-deps')),e=>e.code==='STEND_BLIND')}finally{process.env.STEND_GATEWAY_NODE_MODULES=deps}});
}finally{
 for(const [key,value] of [['STEND_GATEWAY_SOURCE',old.source],['STEND_GATEWAY_NODE_MODULES',old.deps]]){if(value===undefined)delete process.env[key];else process.env[key]=value}
 fs.rmSync(root,{recursive:true,force:true});
}
console.log('RESULT green='+green+' red='+red+' total='+(green+red));process.exitCode=red?1:0;
