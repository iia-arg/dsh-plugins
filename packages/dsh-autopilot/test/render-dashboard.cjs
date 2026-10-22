// Runs the real inline dashboard scripts. DOM/timers are a bounded test platform,
// not a browser/layout test; no network or model process is started.
const fs = require('node:fs');
const vm = require('node:vm');
const elem = () => ({innerHTML:'',hidden:false,dataset:{},style:{setProperty(){}},
  classList:{add(){},remove(){},toggle(){},contains(){return false}},
  setAttribute(){},removeAttribute(){},addEventListener(){},appendChild(){},remove(){}});
const app=elem(), link=elem(); link.parentNode={hidden:false};
const document={documentElement:elem(),head:elem(),hidden:false,title:'',
  getElementById:id=>id==='app'?app:link,querySelectorAll:()=>[],querySelector:()=>null,
  createElement:elem,addEventListener(){}};
const errors=[];
const options=JSON.parse(process.argv[4]||'{}');
const context={document,console,Date,location:{protocol:'http:',pathname:options.pathname||'/'},navigator:{language:process.argv[3]||'ru'},
  localStorage:{getItem:key=>(options.storage||{})[key]||null,setItem(){},removeItem(){}},matchMedia:()=>({matches:false,addEventListener(){}}),
  setTimeout:()=>0,clearTimeout(){},setInterval:()=>0,clearInterval(){},addEventListener(){},scrollTo(){},scrollY:0};
context.window=context;vm.createContext(context);
const page=fs.readFileSync(process.argv[2],'utf8');
for(const block of page.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)){
  if(!block[1].trim())continue;
  try{vm.runInContext(block[1],context,{timeout:1000});}catch(e){errors.push(e.message);}
}
process.stdout.write(JSON.stringify({html:app.innerHTML,title:document.title,errors,receiptSchemaVersion:context.STATE?.usageTeam?.schemaVersion??null}));
