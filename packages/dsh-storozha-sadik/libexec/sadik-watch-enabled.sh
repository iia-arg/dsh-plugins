#!/usr/bin/env bash
# Agents/gateways plus declared AP boot units; notice instances from registry intent.
# Read-only collector: caller 60s, collection 15s, bulk systemctl 5s; no retry.
# AP required units: persistent enable even if inactive; no automatic enable/start.
# AP static/template declarations are named, not enabled; no proof of a real reboot.
sadik_enabled_collect() (
  # One agent-registry load; two bulk property reads and one native AP enable-state read.
  timeout --kill-after=1s 15 python3 - "$1" "${2:-/}" "${3:-collect}" <<'PY'
import configparser,json,re,runpy,shutil,subprocess,sys
from pathlib import Path,PurePosixPath
import yaml

def need(ok,reason):
 if not ok:raise ValueError(reason)
def show(units,fields):
 q=subprocess.run(['systemctl','show',*sorted(units),'-p',','.join(fields)],capture_output=True,text=True,timeout=5)
 need(q.returncode==0,'systemctl show: отказ');rows={};seen={}
 for block in q.stdout.strip().split('\n\n'):
  row={}
  for line in block.splitlines():
   key,sep,value=line.partition('=');need(sep and key not in row,'systemctl show: негодная/повторная строка');row[key]=value
  need(set(row)==set(fields),'systemctl show: неполные свойства')
  primary=row['Id'];matched=units & (set(row['Names'].split())|{primary})
  need(matched,'systemctl show: чужой Id');seen[primary]=seen.get(primary,0)+1
  need(seen[primary]<=len(matched),'systemctl show: повторный Id')
  for name in matched:
   need(name not in rows or rows[name]==row,'systemctl show: противоречивый Id');rows[name]=row
 need(set(rows)==set(units),'systemctl show: потеряна служба')
 return rows

def read(root,name):
 p=PurePosixPath(name)
 need(p.is_absolute() and '..' not in p.parts,'AP: негодный путь декларации')
 f=root/str(p).lstrip('/')
 need(f.is_file() and not f.is_symlink() and f.stat().st_size<=2097152,'AP: декларация отсутствует/негодна '+name)
 return f.read_text()
def autopilot(root,data,module):
 try:plugins=yaml.safe_load(read(root,'/etc/agent-registry/plugins.yaml'))
 except yaml.YAMLError:raise ValueError('AP: plugins.yaml не разобран') from None
 need(isinstance(plugins,dict) and isinstance(plugins.get('plugins'),list),'AP: негодный реестр плагинов')
 found=[r for r in plugins['plugins'] if isinstance(r,dict) and r.get('id')=='dsh-autopilot']
 need(len(found)==1,'AP: dsh-autopilot отсутствует/повторён в реестре')
 plugin=found[0];base=plugin.get('path');need(isinstance(base,str),'AP: не задан path пакета')
 try:manifest=json.loads(read(root,base+'/MAIL-LAYOUT.json'))
 except json.JSONDecodeError:raise ValueError('AP: MAIL-LAYOUT.json не разобран') from None
 need(isinstance(manifest,dict) and manifest.get('schema')==1 and manifest.get('package')=='dsh-autopilot' and isinstance(manifest.get('system_units'),list) and manifest['system_units'],'AP: пустой/негодный MAIL-LAYOUT.system_units')
 declared={}
 def add(target,source):
  t=PurePosixPath(target);s=PurePosixPath(source)
  need(t.parent==PurePosixPath('/etc/systemd/system') and re.fullmatch(r'[a-z][a-z0-9@_.:-]*\.(service|timer)',t.name),'AP: негодный/неподдерживаемый юнит '+str(target))
  need(not s.is_absolute() and '..' not in s.parts,'AP: негодный source юнита')
  need(t.name not in declared or declared[t.name]==str(s),'AP: противоречивый юнит '+t.name)
  declared[t.name]=str(s)
 for row in manifest['system_units']:add(row['target'],row['source'])
 files=plugin.get('derevo',{}).get('files');need(isinstance(files,list),'AP: нет derevo.files')
 for row in files:
  target=row.get('local','')
  if isinstance(target,str) and PurePosixPath(target).parent==PurePosixPath('/etc/systemd/system'):
   add(target,row['remote'])
 actors=[]
 for row in data['agenty']:
  intent=module['namerenie'](row);flag=intent.get('raskladka',{}).get('autopilot_pochta',False)
  need(type(flag)==bool,'AP: autopilot_pochta не boolean у '+str(row.get('imya')))
  if flag:
   name=row['imya'];need(isinstance(name,str) and re.fullmatch(r'[a-z][a-z0-9-]*',name) and name not in actors,'AP: негодный/повторный получатель');actors.append(name)
 required=set();skipped={}
 for name,source in sorted(declared.items()):
  parser=configparser.ConfigParser(interpolation=None,strict=False);parser.optionxform=str
  parser.read_string(read(root,base+'/'+source))
  install=parser['Install'] if parser.has_section('Install') else {}
  enabled=any(install.get(k,'').strip() for k in ('WantedBy','RequiredBy','UpheldBy'))
  if not enabled:
   need(not any(install.get(k,'').strip() for k in ('Alias','Also')),'AP: неясный Install у '+name)
   skipped[name]='template' if '@.' in name else 'static';continue
  if '@.' not in name:required.add(name);continue
  if name=='autopilot-mail-notice@.timer':
   need(actors,'AP: пустой список autopilot_pochta для '+name);instances=actors
  else:
   default=install.get('DefaultInstance','').strip()
   need(re.fullmatch(r'[a-z][a-z0-9-]*',default),'AP: неизвестное раскрытие шаблона '+name);instances=[default]
  required.update(name.replace('@.','@'+actor+'.') for actor in instances)
 need(required,'AP: пустая область обязательных юнитов')
 units=sorted(required)
 q=subprocess.run(['systemctl','--root',str(root),'is-enabled',*units],capture_output=True,text=True,timeout=5)
 values=q.stdout.splitlines()
 need(q.returncode in (0,1) and len(values)==len(units),'AP: systemctl is-enabled — неполный/отказавший срез: '+', '.join(units))
 valid={'enabled','enabled-runtime','disabled','masked','masked-runtime','static','indirect','alias','linked','linked-runtime','generated','transient','not-found'}
 need(all(v in valid for v in values),'AP: неизвестный UnitFileState')
 return dict(zip(units,values)),skipped,len(actors)
try:
 root=Path(sys.argv[2]);need(root.is_absolute() and '..' not in root.parts and root.resolve()==root and root.is_dir(),'AP: --root должен быть физическим абсолютным каталогом')
 module=runpy.run_path(shutil.which('agent-registry'));data=module['zagruzit']()
 ap,skipped,actors=autopilot(root,data,module)
 units=set();states={}
 if sys.argv[3]=='collect':
  scope=json.loads(sys.argv[1]);need(isinstance(scope,dict) and isinstance(scope.get('doma'),dict) and isinstance(scope.get('nepolnye',[]),list),'registry: негодная рамка')
  expected=list(scope['doma'])+[r['imya'] for r in scope.get('nepolnye',[])]
  need(expected and len(expected)==len(set(expected)) and all(isinstance(n,str) and re.fullmatch(r'[a-z][a-z0-9-]*',n) for n in expected),'registry: пустой/негодный список агентов')
  agents={}
  for row in data['agenty']:
   name=row['imya'];need(name in expected and name not in agents,'registry: состав агентов изменился')
   unit=module['obyazatelnoe'](module['namerenie'](row),name,'sluzhba')
   need(isinstance(unit,str) and re.fullmatch(r'[a-z][a-z0-9-]*\.service',unit),'registry: негодная служба '+str(name));agents[name]=unit
  need(set(agents)==set(expected),'registry: потерян агент')
  units=set(agents.values());need(units,'registry: пустой список служб')
  for row in show(units,['Id','Names','After','Wants']).values():
   for dep in (row['After']+' '+row['Wants']).split():
    if dep.endswith('.service') and dep.startswith(('claude-oauth-gateway@','coder-gateway')):
     need(re.fullmatch(r'[a-z][a-z0-9@_.:-]*\.service',dep),'негодное имя шлюза');units.add(dep)
  states=show(units,['Id','Names','ActiveState','UnitFileState'])
  for unit,row in states.items():
   need(row['ActiveState'] in ('active','inactive','failed','activating','deactivating','reloading','maintenance'),unit+': ActiveState неизвестен')
   need(row['UnitFileState'] in ('enabled','enabled-runtime','disabled','masked','masked-runtime','static','indirect','alias','linked','linked-runtime','generated','transient'),unit+': UnitFileState неизвестен')
 need(not units.intersection(ap),'AP: область пересеклась с агентами')
 print('ENABLED_SCOPE|'+str(len(units)+len(ap)))
 print('ENABLED_AP_SCOPE|'+str(len(ap))+'|'+str(actors))
 for unit in sorted(units):
  enabled=states[unit]['UnitFileState'] if unit==states[unit]['Id'] else 'alias'
  print('ENABLED_UNIT|'+unit+'|'+states[unit]['ActiveState']+'|'+enabled)
 for unit,kind in sorted(skipped.items()):print('ENABLED_SKIP|'+unit+'|'+kind)
 for unit,state in sorted(ap.items()):print('ENABLED_REQUIRED|'+unit+'|'+state)
except (Exception,SystemExit) as exc:
 reason='registry: загрузчик/поле отказало (код '+str(exc)+')' if isinstance(exc,SystemExit) else str(exc)
 print('REGISTRY_ERROR|autostart: '+reason);sys.exit(2)
PY
  rc=$?
  if [ "$rc" -ne 0 ]; then
    [ "$rc" -eq 2 ] || printf 'REGISTRY_ERROR|autostart: сбор отказал/истёк срок (код %s)\n' "$rc"
    exit 2
  fi
)
sadik_enabled_check() {
  local tag unit active enabled extra expected='' count=0 bad='' broken='' ap_expected='' ap_actors='' ap_count=0 ap_bad=''
  declare -A seen=()
  while IFS='|' read -r tag unit active enabled extra; do
    case "$tag" in
      ENABLED_SCOPE)
        if [ -n "$expected" ] || [[ ! "$unit" =~ ^[1-9][0-9]*$ ]] || [ -n "$active$enabled$extra" ]; then broken=да; else expected="$unit"; fi;;
      ENABLED_AP_SCOPE)
        if [ -n "$ap_expected" ] || [[ ! "$unit" =~ ^[1-9][0-9]*$ || ! "$active" =~ ^(0|[1-9][0-9]*)$ ]] || [ -n "$enabled$extra" ]; then ap_bad=да; else ap_expected="$unit"; ap_actors="$active"; fi;;
      ENABLED_REQUIRED)
        if [[ ! "$unit" =~ ^[a-z][a-z0-9@_.:-]*\.(service|timer)$ ]] || [ -n "${seen[$unit]:-}" ] || [ -n "$enabled$extra" ]; then broken=да; continue; fi
        case "$active" in enabled|enabled-runtime|disabled|masked|masked-runtime|static|indirect|alias|linked|linked-runtime|generated|transient|not-found) ;; *) broken=да; continue;; esac
        seen["$unit"]=1; count=$((count+1)); ap_count=$((ap_count+1))
        if [ "$active" != enabled ]; then bad="$bad${bad:+, }$unit ($active)"; BEDY=$((BEDY+1)); fi;;
      ENABLED_UNIT)
        if [[ ! "$unit" =~ ^[a-z][a-z0-9@_.:-]*\.service$ ]] || [ -n "${seen[$unit]:-}" ] || [ -z "$active" ] || [ -z "$enabled" ] || [ -n "$extra" ]; then broken=да; continue; fi
        case "$active" in active|inactive|failed|activating|deactivating|reloading|maintenance) ;; *) broken=да;; esac
        case "$enabled" in enabled|enabled-runtime|disabled|masked|masked-runtime|static|indirect|alias|linked|linked-runtime|generated|transient) ;; *) broken=да;; esac
        seen["$unit"]=1; count=$((count+1))
        if [ "$active" = active ] && [ "$enabled" != enabled ]; then bad="$bad${bad:+, }$unit ($enabled)"; BEDY=$((BEDY+1)); fi;;
    esac
  done <<< "$1"
  if [ -n "$broken" ] || [ -z "$expected" ] || [ "$count" != "$expected" ]; then
    BEDY=$((BEDY+1)); gruppa service-autostart unknown 'СЛЕПОТА: autostart — неполный/пустой список юнитов' 21600; return 2
  fi
  if [ -z "$ap_bad" ] && [ -n "$ap_expected" ] && [ "$ap_expected" = "$ap_count" ]; then
    log "   AP: юнитов $ap_expected, получателей $ap_actors"
  else
    log '   AP: размер области не измерен (нет/негодная сводка)'
  fi
  if [ -n "$bad" ]; then
    gruppa service-autostart "$bad" "Автозапуск не закреплён: $bad" 21600
  else
    gruppa service-autostart "" "" 21600
  fi
}
if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
  if [ "$#" -eq 2 ] && [ "$1" = collect ]; then
    sadik_enabled_collect "$2"
  elif [ "$#" -eq 3 ] && [ "$1" = autopilot ] && [ "$2" = --root ]; then
    sadik_enabled_collect '{}' "$3" autopilot
  else
    echo 'ОТКАЗ: collect <registry coverage JSON> | autopilot --root <physical root>' >&2; exit 2
  fi
fi
