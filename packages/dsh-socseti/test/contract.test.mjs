import test from 'node:test';import assert from 'node:assert/strict';import {toolsForRole} from '../src/contract.mjs';
test('Varvara gets only three draft operations; monitor is disjoint',()=>{
 assert.deepEqual(toolsForRole('varvara').map(x=>x.name),['draft_post','revise_draft','draft_reply']);
 assert.deepEqual(toolsForRole('monitor').map(x=>x.name),['status']);
 assert.deepEqual(toolsForRole('unknown'),[]);
 for(const t of toolsForRole('varvara'))assert.equal(t.inputSchema.additionalProperties,false);
});
