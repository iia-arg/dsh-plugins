"""Bridge stdin adapter for the shared Client based on Mark's direct client, not a second HTTP client."""
import argparse,json,sys
from ostrov_api import Client,ClientError,decode
p=argparse.ArgumentParser(allow_abbrev=False)
p.add_argument('--key-file',required=True);p.add_argument('--url',required=True);p.add_argument('--bot-id',required=True)
a=p.parse_args()
try:
    raw=sys.stdin.buffer.read(1048577)
    if len(raw)>1048576:raise ClientError('Ввод моста слишком большой')
    data=decode(raw)
    if not isinstance(data,dict)or set(data)-{'operation','params','telegramUpdate','requestKey','guest','siteContext'}or not {'operation','params'}<=set(data):raise ClientError('Неверный ввод моста')
    if 'siteContext' in data and not isinstance(data['siteContext'],dict):raise ClientError('Неверный контекст сайта')
    result=Client(a.key_file,a.url,a.bot_id).call(data['operation'],data['params'],data.get('telegramUpdate'),request_key=data.get('requestKey'),guest=data.get('guest') is True,site_context=data.get('siteContext'))
except ClientError as error:
    print(json.dumps({'ok':False,'error':str(error)},ensure_ascii=False));sys.exit(1)
except Exception:
    print(json.dumps({'ok':False,'error':'Не установлен исход вызова клиента'},ensure_ascii=False));sys.exit(1)
print(json.dumps(result,ensure_ascii=False,allow_nan=False))
