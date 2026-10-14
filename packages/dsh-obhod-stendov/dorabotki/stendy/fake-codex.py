#!/usr/bin/env python3
# Подставной `codex app-server --listen stdio://` для стенда B-N-1232. FAKE_REZHIM: norm | paket | obryv | net_polya | molchit.
#   paket — на account/rateLimits/read ОДНОЙ записью: уведомление + ответ (ответ оседает в буфере читателя);
#   obryv — ответ без перевода строки, затем молчание; net_polya — ответ без ordinaryUsageAllowed; molchit — не отвечает.
import json, os, sys, time
R = os.environ.get('FAKE_REZHIM', 'norm')
def out(b): os.write(1, b)
otv = {'ordinaryUsageAllowed': True, 'rateLimits': {'primary': {'usedPercent': 42.0, 'windowDurationMins': 10080, 'resetsAt': 1791290724},
       'secondary': None, 'credits': {'hasCredits': False, 'balance': '0'}, 'spendControlReached': False, 'planType': 'pro'}}
for l in sys.stdin:
    x = json.loads(l)
    if x.get('id') == 1:
        out((json.dumps({'id': 1, 'result': {}}) + '\n').encode())
    elif x.get('id') == 2:
        if R == 'molchit':
            time.sleep(120)
        elif R == 'obryv':
            out(json.dumps({'id': 2, 'result': otv}).encode()[:40]); time.sleep(120)
        elif R == 'net_polya':
            o = dict(otv); o.pop('ordinaryUsageAllowed'); out((json.dumps({'id': 2, 'result': o}) + '\n').encode())
        elif R == 'paket':
            out((json.dumps({'method': 'account/rateLimits/updated', 'params': {}}) + '\n' + json.dumps({'id': 2, 'result': otv}) + '\n').encode())
            time.sleep(120)   # после пакета — тишина: ответ уже в буфере читателя, дескриптор больше не «готов»
        else:
            out((json.dumps({'id': 2, 'result': otv}) + '\n').encode())
