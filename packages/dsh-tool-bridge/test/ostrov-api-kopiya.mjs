// Сверка копии API Острова (MARK_TEST_APP) с манифестом релиза до запуска стенда. Зовут stend-ostrov-api и stend-saved-plans.
// Задан OSTROV_API_MANIFEST — сверка обязательна: нет манифеста, состав app ≠ manifest.files или сумма файла ≠ манифесту
// → СЛЕПОТА (код 2) с причиной, стенд не идёт. Не задан — стенд идёт как прежде (рабочая копия разработчика), без сверки.
// Каталоги __pycache__ пропускаются: их пишет сам python3 при запуске server.py (в копии root их нет, под учёткой стенда записи нет).
// B-N-1740: при заданном OSTROV_API_MANIFEST обязательна и сверка release копии с живым сайтом: GET OSTROV_API_HEALTH
//   (/internal/v1/assistant/health, без подписи — из ответа берётся ТОЛЬКО release). Не задан адрес, не 200, ответ > 4 КБ
//   или не JSON, нет release из 12 hex — СЛЕПОТА с причиной; release ≠ манифесту копии — СЛЕПОТА «копия отстала от сайта».
// Чего НЕ ловит: сайт, отдающий чужой release (ответ не подписан); правку файлов на vps-ru без смены release.
import {readFileSync,readdirSync,statSync} from 'node:fs'
import {createHash} from 'node:crypto'
import {join,relative} from 'node:path'
export async function sverkaKopii(app){
  const put=process.env.OSTROV_API_MANIFEST
  if(!put)return
  const slep=why=>{console.log(`СЛЕПОТА: копия API Острова ${app} не годна: ${why}`);process.exit(2)}
  let m;try{m=JSON.parse(readFileSync(put,'utf8'))}catch(e){slep(`манифест ${put} не прочитан (${e.code??e.message})`)}
  if(!m?.files||typeof m.files!=='object')slep(`в манифесте ${put} нет files`)
  const est=[],obhod=d=>{for(const n of readdirSync(d)){if(n==='__pycache__')continue;const f=join(d,n);statSync(f).isDirectory()?obhod(f):est.push(relative(app,f))}}
  try{obhod(app)}catch(e){slep(`каталог не прочитан (${e.code??e.message})`)}
  const lishnie=est.filter(f=>!(f in m.files)),net=Object.keys(m.files).filter(f=>!est.includes(f))
  if(lishnie.length||net.length)slep(`состав ≠ манифесту релиза ${m.artifact}: лишние ${lishnie.length} [${lishnie.slice(0,3)}], нет ${net.length} [${net.slice(0,3)}]`)
  for(const f of est){const s=createHash('sha256').update(readFileSync(join(app,f))).digest('hex');if(s!==m.files[f])slep(`${f}: сумма ${s.slice(0,16)} ≠ манифесту релиза ${m.artifact} ${String(m.files[f]).slice(0,16)}`)}
  const url=process.env.OSTROV_API_HEALTH
  if(!url)slep('не задан OSTROV_API_HEALTH — release сайта не сверить')
  let telo
  try{const r=await fetch(url,{signal:AbortSignal.timeout(5000),redirect:'error'});if(r.status!==200)slep(`health сайта ${url} ответил HTTP ${r.status}`);telo=await r.text()}
  catch(e){slep(`health сайта ${url} недоступен (${e?.cause?.code??e?.cause?.message??e?.name??'ошибка'})`)}
  if(telo.length>4096)slep(`ответ health сайта ${url} больше 4 КБ`)
  let rel;try{rel=JSON.parse(telo)?.release}catch{slep(`ответ health сайта ${url} не JSON`)}
  if(typeof rel!=='string'||!/^[0-9a-f]{12}$/.test(rel))slep(`в ответе health сайта ${url} нет годного release`)
  if(rel!==m.artifact)slep(`копия отстала от сайта: копия ${m.artifact}, сайт ${rel}, обнови установщиком tools/kopiya-ostrov-api.sh`)
  console.log(`копия API Острова: релиз ${m.artifact} = сайту, файлов ${est.length}, суммы = манифесту`)
}
