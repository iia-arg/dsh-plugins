import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import {createHash} from 'node:crypto';
import {sentCopyCandidates,sentCopyText} from '../src/sent-copies.js';
const root=fs.mkdtempSync(path.join(os.tmpdir(),'sender-record-reader-')),sha=x=>createHash('sha256').update(x).digest('hex');
try{
 const body='Своё письмо Искре 😀'.repeat(500)+'END',recipient='iskra',id=sha(recipient+'\n'+body),name='agent-outgoing-'+id+'.json',file=path.join(root,name);
 const record={version:1,stage:'placed',sender:'alfa',recipient,operation_id:id,placed_at:1000000,body,body_sha256:sha(body)};fs.writeFileSync(file,JSON.stringify(record),{mode:0o600});
 const read=sentCopyCandidates(root,999000);assert.equal(read.length,1,'reader must consume placed a2a-send source record');assert(sentCopyText(read[0]).includes(body));
 assert.equal(sentCopyCandidates(root,1000001).length,0,'personal-era source record does not bypass cutoff');
 const before=fs.readFileSync(file);fs.writeFileSync(file,JSON.stringify({...record,body:'CORRUPTED'}));const after=fs.readFileSync(file);assert.notEqual(sha(before),sha(after));assert(fs.readFileSync(file,'utf8').includes('CORRUPTED'));assert.equal(sentCopyCandidates(root,999000).length,0,'changed source bytes must refuse, not copy altered letter');
 fs.writeFileSync(file,before);assert.equal(sentCopyCandidates(root,999000).length,1);
 fs.unlinkSync(file);const target=path.join(root,'private');fs.writeFileSync(target,before);fs.symlinkSync(target,file);assert.equal(sentCopyCandidates(root,999000).length,0,'symlink is not sender publication');
 console.log('PASS source record reader: exact full Unicode/body/operation, cutoff, corruption-return and symlink denial');
}finally{fs.rmSync(root,{recursive:true,force:true})}
