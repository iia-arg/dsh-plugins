#!/usr/bin/python3 -B
import json, urllib.request, urllib.error, datetime, time
from pathlib import Path
import os, base64
p=Path(os.environ.get('CODEX_AUTH_JSON','/var/lib/coder-gateway-alfa/codex-home/auth.json'))
a=json.loads(p.read_text())['tokens']
# B-N-798 (24.09.2026): токен ОБНОВЛЯЕТ ТОЛЬКО Codex шлюза при своей работе (refresh_token одноразовый —
# ротация; обновлять здесь или во временной копии CODEX_HOME = списать токен у всех четырёх шлюзов).
# Истёкший access_token — не поломка замера, а «ждём обновления шлюзом»: отдельный код 3, в сеть не ходим.
def _exp(jwt):
 try:
  pl=jwt.split('.')[1]; pl+='='*(-len(pl)%4); return int(json.loads(base64.urlsafe_b64decode(pl))['exp'])
 except Exception:
  return None
_e=_exp(a.get('access_token',''))
if _e is not None and time.time() >= _e-60:
 print(json.dumps({'measured_at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'http_status':None,
  'prichina':'access_token истёк '+datetime.datetime.fromtimestamp(_e,datetime.timezone.utc).isoformat()+'; обновляет только Codex шлюза при работе; замер невозможен до обновления'},ensure_ascii=False,indent=2))
 raise SystemExit(3)
req=urllib.request.Request('https://chatgpt.com/backend-api/wham/usage',headers={
 'Authorization':'Bearer '+a['access_token'],
 'ChatGPT-Account-Id':a['account_id'],
 'Accept':'application/json',
 'User-Agent':'codex-limit-probe/1.0',
},method='GET')
start=time.monotonic()
try:
 r=urllib.request.urlopen(req,timeout=20)
except urllib.error.HTTPError as e:
 r=e
headers={k:v for k,v in r.headers.items() if k.lower() in ['date','content-type','cache-control','retry-after','server','x-request-id'] or k.lower().startswith('x-ratelimit')}
raw=r.read()
try:
 body=json.loads(raw)
except ValueError:
 body={}
allowed=['plan_type','rate_limit','code_review_rate_limit','credits','additional_rate_limits','rate_limit_reset_credits','model_usage','spend_control','rate_limit_reached_type','promo']
print(json.dumps({'measured_at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'http_status':r.status,'elapsed_seconds':round(time.monotonic()-start,3),'headers':headers,'body_fields':list(body),'usage':{k:body[k] for k in allowed if k in body}},ensure_ascii=False,indent=2))
if r.status != 200: raise SystemExit(1)
