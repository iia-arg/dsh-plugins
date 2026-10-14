// Cursor links are metadata, never an HTTP destination or source of credentials.
import test from 'node:test';import assert from 'node:assert/strict';import {MetaApi} from '../src/meta-api.mjs';
const account='17841453053403067',path='/v22.0/'+account+'/media';
function client(){const sent=[];const api=new MetaApi({provider:'instagram',account,version:'v22.0',token:'test-only-token',budget:{reserve(){}},fetchImpl:async url=>{sent.push(new URL(url));return new Response('{"data":[]}')}});return {api,sent}}
test('canonical IG cursor continues at the fixed host, version and edge',async()=>{
 const {api,sent}=client();try{const after=api.nextCursor({next:'https://graph.instagram.com'+path+'?after=n&access_token=foreign-token'},path);assert.equal(after,'n');await api.call('roots',{after});assert.equal(sent.length,1);assert.equal(sent[0].origin,'https://graph.instagram.com');assert.equal(sent[0].pathname,path);assert.equal(sent[0].searchParams.get('after'),'n');assert.equal(sent[0].searchParams.has('access_token'),false)}finally{api.stop()}
});
for(const [name,url]of [
 ['foreign host','https://evil.invalid'+path+'?after=n'],
 ['Facebook login host','https://graph.facebook.com'+path+'?after=n'],
 ['HTTP scheme','http://graph.instagram.com'+path+'?after=n'],
 ['file scheme','file://'+path+'?after=n'],
 ['nondefault port','https://graph.instagram.com:8443'+path+'?after=n'],
 ['userinfo','https://user:secret@graph.instagram.com'+path+'?after=n'],
 ['fragment','https://graph.instagram.com'+path+'?after=n#fragment'],
 ['other object','https://graph.instagram.com/v22.0/999/media?after=n'],
 ['other edge','https://graph.instagram.com/v22.0/'+account+'/comments?after=n'],
 ['older explicit version','https://graph.instagram.com/v21.0/'+account+'/media?after=n'],
 ['newer explicit version','https://graph.instagram.com/v25.0/'+account+'/media?after=n'],
 ['unversioned path','https://graph.instagram.com/'+account+'/media?after=n'],
 ['malformed version','https://graph.instagram.com/v25x0/'+account+'/media?after=n'],
 ['different edge at v25','https://graph.instagram.com/v25.0/'+account+'/comments?after=n'],
 ['different object at v25','https://graph.instagram.com/v25.0/999/media?after=n'],
 ['relative URL',path+'?after=n']]){
 test(name+' rejected without HTTP',()=>{const {api,sent}=client();try{assert.throws(()=>api.nextCursor({next:url},path),e=>e.reason==='page_origin');assert.equal(sent.length,0)}finally{api.stop()}});
}
for(const method of ['roots','conversations'])test('IG v25 '+method+' cursor retains configured v25 for the next request',async()=>{
 const sent=[],api=new MetaApi({provider:'instagram',account,version:'v25.0',token:'fixture',budget:{reserve(){}},fetchImpl:async url=>{sent.push(new URL(url));return new Response('{"data":[]}')}});try{const expected=api.route(method,{}).pathname,next=expected;
  const cursor=api.nextCursor({next:'https://graph.instagram.com'+next+'?fields=id&limit=50&after=next-page&access_token=foreign-token',cursors:{after:'next-page'}},expected);
  assert.equal(cursor,'next-page');await api.call(method,{after:cursor});assert.equal(sent.length,1);assert.equal(sent[0].origin,'https://graph.instagram.com');assert.equal(sent[0].pathname,expected);assert.equal(sent[0].searchParams.get('after'),'next-page');assert.equal(sent[0].searchParams.has('access_token'),false);
 }finally{api.stop()}
});
test('Threads still rejects an unmeasured version change',()=>{
 const api=new MetaApi({provider:'threads',account:'26794519373575025',version:'v1.0',token:'fixture',budget:{reserve(){}}});
 try{assert.throws(()=>api.nextCursor({next:'https://graph.threads.net/v2.0/26794519373575025/threads?after=n'},'/v1.0/26794519373575025/threads'),e=>e.reason==='page_origin')}finally{api.stop()}
});
test('IG pagination cannot skip its expected object and edge check',()=>{const {api}=client();try{assert.throws(()=>api.nextCursor({next:'https://graph.instagram.com'+path+'?after=n'}),e=>e.reason==='page_origin')}finally{api.stop()}});
test('IG metadata version matches configuration exactly, including the minor component',()=>{
 const api=new MetaApi({provider:'instagram',account,version:'v22.9',token:'fixture',budget:{reserve(){}}}),expected='/v22.9/'+account+'/media';
 try{assert.equal(api.nextCursor({next:'https://graph.instagram.com/v22.9/'+account+'/media?after=n'},expected),'n');for(const v of ['v22.8','v22.10'])assert.throws(()=>api.nextCursor({next:'https://graph.instagram.com/'+v+'/'+account+'/media?after=n'},expected),e=>e.reason==='page_origin')}finally{api.stop()}
});
