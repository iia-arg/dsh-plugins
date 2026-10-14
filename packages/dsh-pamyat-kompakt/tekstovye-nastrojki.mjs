// RU: Размещение и названия для данных модели; JSON не исполняется. Первое успешное чтение при сжатии; ошибка не кешируется.
// EN: Deployment and labels for model data; JSON is never executed. First successful read occurs at compaction; failures are not cached.
import {readFileSync,statSync} from 'node:fs';
import {isAbsolute} from 'node:path';
const DEFAULT_FILE='/etc/memory-compaction/deployment.json';
export const KATALOG_D_PO_UMOLCHANIYU='/etc/dsh-pamyat/agenty';
const DEFAULT_LABELS=Object.freeze({
 ownerInstrumental:'владельцем',ownerNominative:'владелец',ownerGenitive:'владельца',ownerDative:'владельцу',
 coordinatorExample:'я и агент-координатор',evidenceRuleLabel:'правило прослеживаемости',exampleHost:'example-host',
 roleClarification:'«Главная» в письмах — агент-координатор на узле управления (не локальный координатор и не агент рабочего узла); кто есть кто — только из стенограммы, не выводи.',
});
const TOKENS=Object.freeze({OWNER_INSTRUMENTAL:'ownerInstrumental',OWNER_NOMINATIVE:'ownerNominative',OWNER_GENITIVE:'ownerGenitive',OWNER_DATIVE:'ownerDative',COORDINATOR_EXAMPLE:'coordinatorExample',EVIDENCE_RULE:'evidenceRuleLabel',EXAMPLE_HOST:'exampleHost',ROLE_CLARIFICATION:'roleClarification'});
function absolute(value,key){
 if(typeof value!=='string'||!value.trim()||!isAbsolute(value)||value.split('/').includes('..')||/[\0\r\n]/.test(value))throw Error(`${key}: нужен непустой абсолютный путь без ..`);
 return value;
}
// RU: Допустимая схема имеет непересекающиеся имена ключей; лексический обход ловит и JSON-escaped дубли.
// EN: Valid schema key names are disjoint; the lexical walk also catches JSON-escaped duplicate keys.
function rejectDuplicateKeys(text){
 const seen=new Set();
 for(let i=0;i<text.length;i++){
  if(text[i]!== '"')continue;
  let end=i+1;for(;end<text.length;end++){if(text[end]==='\\'){end++;continue;}if(text[end]==='"')break;}
  let next=end+1;while(/\s/.test(text[next]??'')&&next<text.length)next++;
  if(text[next]===':'){const key=JSON.parse(text.slice(i,end+1));if(seen.has(key))throw Error(`повторный ключ размещения: ${key}`);seen.add(key);}
  i=end;
 }
}
function load(){
 const filename=absolute(process.env.KOMPAKT_RAZMESCHENIE??DEFAULT_FILE,'KOMPAKT_RAZMESCHENIE');let config={};
 try{
  const stat=statSync(filename);if(!stat.isFile())throw Error('настройка размещения не обычный файл');
  const text=readFileSync(filename,'utf8');config=JSON.parse(text);rejectDuplicateKeys(text);
 }catch(error){if(error.code!=='ENOENT'||Object.hasOwn(process.env,'KOMPAKT_RAZMESCHENIE'))throw Error(`размещение компакта: ${error instanceof SyntaxError?'некорректный JSON':error.message}`);}
 if(!config||typeof config!=='object'||Array.isArray(config))throw Error('размещение компакта: нужен JSON-объект');
 for(const key of Object.keys(config))if(key!=='promptSubstitutions')throw Error(`неизвестная настройка размещения: ${key}`);
 const values=Object.hasOwn(config,'promptSubstitutions')?config.promptSubstitutions:{};
 if(!values||typeof values!=='object'||Array.isArray(values))throw Error('promptSubstitutions: нужен объект');
 for(const [key,value] of Object.entries(values)){
  if(!Object.hasOwn(DEFAULT_LABELS,key))throw Error(`неизвестная подстановка промта: ${key}`);
  if(typeof value!=='string'||!value.trim()||value.includes('{{')||value.includes('}}'))throw Error(`подстановка промта ${key}: нужна непустая строка без меток`);
 }
 return Object.freeze({promptSubstitutions:Object.freeze({...DEFAULT_LABELS,...values})});
}
let snapshot;
// RU: Нет IO при импорте. Ошибка остаётся отказом отдельного сжатия; следующий вызов может прочесть исправленный файл.
// EN: No import-time IO. Failure refuses an individual compaction; the next call can read a repaired file.
export function chitatRazmeschenie(){
  if(snapshot===undefined)snapshot=load();
  return snapshot;
}
// RU: Только исходный шаблон до вставки стенограммы/хвоста; значения не интерпретируются повторно.
// EN: Render only the original template before transcript/tail insertion; replacement values are not interpreted again.
export function podstavitTeksty(template,nastrojka=chitatRazmeschenie()){
 return template.replace(/\{\{KOMPAKT_([^{}]*)\}\}/g,(_match,token)=>{
  if(!Object.hasOwn(TOKENS,token))throw Error(`неизвестная метка промта: KOMPAKT_${token}`);
  return nastrojka.promptSubstitutions[TOKENS[token]];
 });
}
