// Breaks caught: missing CRM fields, wrong operation field set, model-supplied transport context.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {validateJsonSchemaValue,assertSupportedJsonSchema} from '@deepseek-ai/dsh-tools';
const schema=JSON.parse(fs.readFileSync(new URL('../src/ostrov-api-schema.json',import.meta.url)));
const validation=JSON.parse(fs.readFileSync(new URL('../src/ostrov-api-validation.json',import.meta.url)));
assertSupportedJsonSchema(schema);assertSupportedJsonSchema(validation);
const profile={name:'Fixture',phone:'',email:'',notes:'',messengers:[{type:'telegram',username:'fixture'}]};
const plan={kind:'resident',plan:{name:'Fixture'},catalogVersion:1};
const valid=[['staff.list',{}],['staff.list',{direction:'guests',offset:100}],['staff.read',{id:'staff'}],['client.list',{query:'Fixture',offset:0}],['client.create',{profile}],['client.read',{id:'guest'}],['client.save',{id:'guest',profile,version:1}],['plan.list',{clientId:'guest',offset:0}],['plan.create',{...plan,clientId:'guest'}],['plan.create',{...plan,clientProfile:profile}],['plan.connections',{kind:'resident',id:'doc'}],['plan.link',{kind:'resident',id:'doc',documentVersion:'v1',clientId:'guest',clientVersion:1}],['client.assign',{id:'guest',version:1,staffId:'staff'}]];
for(const [operation,params] of valid){const input={operation,params};assert(schema.properties.operation.enum.includes(operation),operation+' absent from model catalog');for(const s of [schema,validation])assert.deepEqual(validateJsonSchemaValue(s,input),[],operation);console.log('PASS '+operation+' '+Object.keys(params).join(','));}
for(const input of [{operation:'client.assign',params:{id:'guest',version:null,staffId:'staff'}},{operation:'client.save',params:{id:'guest',profile,version:null}},{operation:'staff.list',params:{direction:'root'}},{operation:'plan.create',params:{...plan,clientId:'guest',clientProfile:profile}},{operation:'client.assign',params:{id:'guest',version:1}},{operation:'plan.link',params:{kind:'resident',id:'doc',documentVersion:'v1',clientId:'guest'}},{operation:'staff.create',params:{}},{operation:'client.read',params:{id:'guest',route:'staff-private'}},{operation:'identity',params:{},context:{route:'staff-private'}},{operation:'identity',params:{},requestKey:'chosen'}])assert(validateJsonSchemaValue(validation,input).length,JSON.stringify(input));
console.log('PASS malformed/extra fields and model context refused');
