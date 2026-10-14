import Ajv from 'ajv';
import {readPrivateFile} from './auth.mjs';
const absolute={type:'string',pattern:'^/',maxLength:1024};
const object=(properties)=>({type:'object',properties,required:Object.keys(properties),additionalProperties:false});
const schema=object({
 port:{type:'integer',minimum:1024,maximum:65535},stateDir:absolute,
 keyFiles:object({varvara:absolute,monitor:absolute}),
 telegram:object({enabled:{type:'boolean'},tokenFile:absolute,approvalChatId:{type:'integer',maximum:-1,minimum:-9007199254740991}}),
 targets:object({vk:{type:'string',pattern:'^[0-9]{1,32}$'},instagram:{type:'string',pattern:'^[0-9]{1,32}$'},threads:{type:'string',pattern:'^[0-9]{1,32}$'},telegram:{type:'string',pattern:'^-[1-9][0-9]{0,15}$'}})
});schema.required=schema.required.filter(k=>k!=='telegram');
const valid=new Ajv({strict:true,coerceTypes:false}).compile(schema);
const annaSchema=structuredClone(schema);annaSchema.properties.profile={const:'anna'};annaSchema.required.push('profile');annaSchema.properties.keyFiles=object({anna:absolute,monitor:absolute,channel:absolute});
annaSchema.properties.telegram.properties.externalPoll={const:true};annaSchema.properties.telegram.properties.writerEnabled={type:'boolean'};annaSchema.properties.telegram.required.push('externalPoll','writerEnabled');
const tokenRef={oneOf:[object({file:absolute}),object({passRef:{type:'string',pattern:'^[A-Za-z0-9_][A-Za-z0-9_./-]{0,1023}$'}})]};
annaSchema.properties.vk=object({enabled:{const:true},armed:{const:true},idleAt:{const:'2026-10-13T11:35:20Z'},apiVersion:{type:'string',pattern:'^5\\.[0-9]+$',maxLength:8},groupToken:tokenRef,wallToken:tokenRef});
annaSchema.properties.vk.properties.writer=object({enabled:{const:true},token:tokenRef});
annaSchema.properties.vk.properties.writer.properties.replies={type:'object',properties:{enabled:{const:true},unknownReplyObjects:{type:'array',maxItems:2000,uniqueItems:true,items:{type:'string',maxLength:128,pattern:'^(comment:-127999849:[1-9][0-9]*:[1-9][0-9]*|dm:-?[1-9][0-9]*:[1-9][0-9]*)$'}}},required:['enabled'],additionalProperties:false};
const metaReader=object({enabled:{type:'boolean'},armed:{const:true},apiVersion:{type:'string',pattern:'^v[0-9]{1,2}[.][0-9]{1,2}$'},token:tokenRef,startAt:{type:'string',pattern:'^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z$'},maxRoots:{type:'integer',minimum:1,maximum:100000},dailyCallLimit:{type:'integer',minimum:1,maximum:100000},editCards:{type:'boolean'},messagesEnabled:{type:'boolean'},accessEpoch:{type:'integer',minimum:0,maximum:2147483647}});
metaReader.required=['enabled','armed','apiVersion','token','startAt'];
metaReader.properties.refresh=object({enabled:{type:'boolean'},contractVerified:{type:['boolean','null']},localSourceConfirmed:{type:['boolean','null']},tokenType:{enum:['long_lived','unknown',null]},issuedAt:{type:['string','null'],maxLength:30},expiresAt:{type:['string','null'],maxLength:30},minAgeSeconds:{type:'integer',minimum:86400,maximum:5184000}});

annaSchema.properties.meta={type:'object',properties:{instagram:metaReader,threads:metaReader},additionalProperties:false,minProperties:1};
metaReader.properties.refresh.required=['enabled'];
const validAnna=new Ajv({strict:true,coerceTypes:false}).compile(annaSchema);
export function loadConfig(file){const config=JSON.parse(readPrivateFile(file));if(!(config?.profile==='anna'?validAnna(config):valid(config))||!Number.isSafeInteger(Number(config.targets.telegram))||config.telegram&&String(config.telegram.approvalChatId)===config.targets.telegram)throw Error('config rejected');if(config.profile==='anna'){if(config.vk&&config.targets.vk!=='127999849')throw Error('config rejected');if(config.telegram?.approvalChatId!==-1001659691422&&config.telegram)throw Error('config rejected');for(const [provider,m] of Object.entries(config.meta??{})){if(!Number.isFinite(Date.parse(m.startAt))||provider==='instagram'&&config.targets.instagram!=='17841453053403067')throw Error('config rejected');m.maxRoots??=10000;m.dailyCallLimit??=2000;m.editCards??=true;m.messagesEnabled??=true}for(const ref of [config.vk?.groupToken,config.vk?.wallToken,config.vk?.writer?.token,...Object.values(config.meta??{}).map(m=>m.token)])if(ref?.passRef?.split('/').some(p=>!p||p==='.'||p==='..'))throw Error('config rejected');return config}if(config.telegram?.enabled&&(config.targets.telegram==='-1001925584120'||config.telegram.approvalChatId===-1001710291240))throw Error('stage2 Telegram production target refused');return config}
