#!/usr/bin/python3
import argparse,pwd,json,yaml,sys
p=argparse.ArgumentParser();p.add_argument('--registry',required=True);p.add_argument('--extras');a=p.parse_args()
doc=yaml.safe_load(open(a.registry));extras={};rows=[];seen=set();agents=set()
# B-N-1869: no extras file = empty extras (extras only ADD callers, so absence narrows access, never opens it);
# without this, a missing file failed render -> ingress -> all gateways (Requires=). Broken/invalid file still fails.
if a.extras:
 try:extras=json.load(open(a.extras))
 except FileNotFoundError:print(f'dsh-gateway-ingress: WARNING no extras file {a.extras}: extra callers empty (agent owner and root only)',file=sys.stderr)
# A-N-1948 #31: valid JSON of the wrong shape ([], "x", {agent: "x"}, {agent: ["x"]}) used to die with AttributeError and a
# traceback; now a ValueError names the file and the shape. The outcome is the same (render fails), the cause is readable.
if not isinstance(extras,dict):raise ValueError(f'{a.extras}: expected an object {{agent: [{{user, reason}}, ...]}}, got {type(extras).__name__}')
for k,v in extras.items():
 if not isinstance(v,list) or not all(isinstance(e,dict) for e in v):raise ValueError(f'{a.extras}: agent {k!r} must map to a list of objects {{user, reason}}')
for a in doc['agenty']:
 n=a['namerenie'];port=n.get('raskladka',{}).get('port_shlyuza')
 if port is None:continue
 if type(port)!=int or not 1<=port<=65535 or port in seen:raise ValueError('invalid or duplicate gateway port')
 seen.add(port);name=a['imya'];agents.add(name);uids={0,pwd.getpwnam(n['polzovatel']).pw_uid}
 for entry in extras.get(name,[]):
  if not entry.get('reason'):raise ValueError('extra caller needs evidence/reason')
  uids.add(pwd.getpwnam(entry['user']).pw_uid)
 rows.append((port,sorted(uids)))
if not rows or set(extras)-agents:raise ValueError('empty ports or unknown extra agent')
ports=', '.join(str(p) for p,_ in rows);pairs=', '.join(f'{p} . {u}' for p,users in rows for u in users)
print('table inet dsh_gateway_ingress {')
print(' set ports { type inet_service; elements = { '+ports+' }; }')
print(' set callers { type inet_service . uid; elements = { '+pairs+' }; }')
print(' chain gate { tcp dport . meta skuid @callers counter accept')
print('  limit rate 10/minute burst 10 packets log prefix "dsh-gateway-denied "')
print('  counter reject with tcp reset\n }')
print(' chain output { type filter hook output priority -10; policy accept;')
# A-N-1948 #32: the gate covers ANY local destination address, not only 127.0.0.0/8 and ::1: a gateway listening on
# 0.0.0.0 was reachable by a local caller via 10.240.x.x or the public address, bypassing the uid check. Local delivery
# always leaves via lo, so oifname lo + fib daddr type local is every address of this host, both families.
print('  oifname "lo" fib daddr type local tcp dport @ports jump gate\n }\n}')
