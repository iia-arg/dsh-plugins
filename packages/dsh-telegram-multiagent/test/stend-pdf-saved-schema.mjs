import assert from 'node:assert/strict';
import {pdfTool} from '../src/pdf-tool.js';
import {testPlatform} from './test-platform.mjs';
// A-N-1948 №24: платформа — через testPlatform (нет её или dsh-tools — СЛЕПОТА, код 2), как у прочих стендов, а не исключением с кодом 1.
const schema=(await testPlatform(['dsh-tools']))['dsh-tools'].defineTool(pdfTool({config:{}})).parameters;
assert.equal(schema.type,'object');
for(const name of ['oneOf','anyOf','allOf'])assert(!Object.hasOwn(schema,name));
assert.equal(schema.properties.result?.type,'object');
assert(schema.properties.quote,'legacy quote disappeared');
assert(!schema.required.includes('quote'),'saved DTO must not require legacy quote');
console.log(JSON.stringify(schema,null,2));
