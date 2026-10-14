import assert from 'node:assert/strict';
import {pdfTool} from '../src/pdf-tool.js';
import {testPlatform} from './test-platform.mjs';
// A-N-1948 №24: платформа — через testPlatform (нет её или dsh-tools — СЛЕПОТА, код 2), как у прочих стендов, а не исключением с кодом 1.
const {defineTool}=(await testPlatform(['dsh-tools']))['dsh-tools'];
const schema=defineTool(pdfTool({config:{}})).parameters;
assert.equal(schema.type,'object');
for(const name of ['oneOf','anyOf','allOf'])assert(!Object.hasOwn(schema,name),'top '+name);
assert.deepEqual(schema.properties.letterhead?.enum,['general_portrait','general_landscape','legal']);
assert.equal(schema.properties.letterhead.default,'general_portrait');
console.log(JSON.stringify(schema,null,2));
