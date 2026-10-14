#!/usr/bin/env python3
"""Direct Ostrov API client; saved-plan writes only through bridge-owned request keys. JSON request on stdin; key stays in a file."""
import argparse
import hashlib
import hmac
import http.client
import json
from pathlib import Path
import re
import secrets
import sys
import time
from urllib.parse import urlsplit

PUBLIC = frozenset({'identity', 'catalog', 'objects', 'quote'})
SAVED = frozenset({'plan.create', 'plan.read', 'plan.edit'})
CLIENT = frozenset({'client.read', 'client.save', 'plan.list', 'staff.list', 'staff.read', 'client.list', 'client.create', 'plan.connections', 'plan.link', 'client.assign'})
WRITES = frozenset({'plan.create', 'plan.edit', 'client.save', 'client.create', 'plan.link', 'client.assign'})
STAFF = frozenset({'manager', 'leader', 'hospitality'})
CALL = '/internal/v1/assistant/call'

class ClientError(Exception):
    pass

def decode(raw):
    def pairs(items):
        result = {}
        for key, value in items:
            if key in result:
                raise ClientError('Повторяющееся поле JSON')
            result[key] = value
        return result
    def constant(_):
        raise ClientError('В JSON нельзя использовать NaN/Infinity')
    try:
        return json.loads(raw, object_pairs_hook=pairs, parse_constant=constant)
    except (ValueError, UnicodeError) as error:
        raise ClientError('Нужен корректный JSON') from error

class Client:
    # Аудит №9: адрес и botId без умолчаний — прежние вели в частную сеть авторов.
    def __init__(self, key_file, base_url, bot_id):
        # A-N-1880 (F02 Гаммы): ОДНО правило с генератором профиля (a2a-bus bin/agent-registry, OSTROV_API.baseUrl/botId):
        #   только http://, знаки узла [A-Za-z0-9.[]:-], не больше одного «/» в конце, порт 1..65535 и не пустой; botId 1..16 цифр.
        if not isinstance(base_url, str) or not re.fullmatch(r'http://[A-Za-z0-9.\[\]:-]+/?', base_url):
            raise ClientError('Адрес API должен иметь вид http://host:port')
        self.base_url = base_url.rstrip('/')
        try:
            self.url = urlsplit(self.base_url)
        except ValueError as error:
            raise ClientError('Неверный адрес API') from error
        if self.url.scheme != 'http' or not self.url.hostname or self.url.username or self.url.password or self.url.path or self.url.query or self.url.fragment:
            raise ClientError('Адрес API должен иметь вид http://host:port')
        if not isinstance(bot_id, str) or not re.fullmatch(r'[1-9][0-9]{0,15}', bot_id):
            raise ClientError('Неверный ID бота')
        try:
            port = self.url.port
        except ValueError as error:
            raise ClientError('Неверный порт API') from error
        if self.url.netloc.endswith(':') or (port is not None and not 1 <= port <= 65535):
            raise ClientError('Неверный порт API')
        self.bot_id = bot_id
        try:
            self.key = Path(key_file).read_bytes().strip()
        except OSError as error:
            raise ClientError('Файл ключа API недоступен: '+str(key_file)) from error
        if len(self.key) < 32:
            raise ClientError('Файл ключа API имеет неверный формат')

    def send(self, operation, params, context=None, request_key=None):
        body = {'schemaVersion': 1, 'operation': operation, 'params': params}
        if context is not None:
            body['context'] = context
        if request_key is not None:
            body['requestKey'] = request_key
        try:
            raw = json.dumps(body, ensure_ascii=False, allow_nan=False, separators=(',', ':'), sort_keys=True).encode('utf-8')
        except (TypeError, ValueError) as error:
            raise ClientError('Параметры должны быть корректным JSON') from error
        if len(raw) > 262144:
            raise ClientError('Слишком большой запрос расчёта')
        stamp = str(int(time.time()))
        nonce = secrets.token_urlsafe(24)
        signed = '\n'.join([stamp, nonce, 'POST', CALL, hashlib.sha256(raw).hexdigest()]).encode()
        signature = hmac.new(self.key, signed, hashlib.sha256).hexdigest()
        connection = http.client.HTTPConnection(self.url.hostname, self.url.port or 80, timeout=10)
        try:
            connection.request('POST', CALL, raw, {'Content-Type': 'application/json', 'X-Ostrov-Time': stamp, 'X-Ostrov-Nonce': nonce, 'X-Ostrov-Signature': signature})
            response = connection.getresponse()
            content = response.read(4194305)
            if len(content) > 4194304:
                raise ClientError('Ответ API слишком большой')
            try:
                data = decode(content)
            except ClientError as error:
                raise ClientError('API вернул некорректный ответ (HTTP '+str(response.status)+')') from error
            if response.status != 200:
                reason = data.get('error', 'Запрос отклонён') if isinstance(data, dict) else 'Запрос отклонён'
                raise ClientError('API HTTP '+str(response.status)+': '+str(reason))
            if not isinstance(data, (dict, list)) and not (operation=='client.read' and data is None):
                raise ClientError('API вернул неожиданный формат ответа')
            return data
        except (OSError, http.client.HTTPException) as error:
            raise ClientError('API недоступен или не ответил за 10 секунд; проверьте сеть и запуск службы') from error
        finally:
            connection.close()

    def telegram_context(self, update):
        if not isinstance(update, dict) or not isinstance(update.get('message'), dict):
            raise ClientError('Для распознавания нужен исходный Telegram message update')
        message = update['message']
        sender, chat = message.get('from'), message.get('chat')
        if not isinstance(sender, dict) or not isinstance(chat, dict) or message.get('sender_chat') is not None or sender.get('is_bot') is not False:
            raise ClientError('Не установлен настоящий отправитель-человек')
        values = [sender.get('id'), chat.get('id'), update.get('update_id'), message.get('message_id')]
        if any(type(v) is not int for v in values) or values[0] <= 0 or values[1] == 0 or values[2] < 0 or values[3] <= 0:
            raise ClientError('Неверные числовые ID Telegram update')
        if chat.get('type') not in ('private', 'group', 'supergroup') or (chat['type'] == 'private' and values[0] != values[1]):
            raise ClientError('Неверный Telegram-чат')
        return {'route': 'guest-telegram', 'botId': self.bot_id, 'senderId': str(values[0]), 'chatId': str(values[1]), 'chatType': chat['type'], 'updateId': str(values[2]), 'messageId': str(values[3]), 'isBot': False}

    def site_context(self, value):
        if not isinstance(value, dict) or set(value) != {'route','conversationId','receiptId'} or value['route'] != 'guest-site':
            raise ClientError('Неверный контекст сайта')
        if not isinstance(value['conversationId'],str) or not re.fullmatch(r'[A-Za-z0-9_.:-]{1,128}',value['conversationId']):
            raise ClientError('Неверный разговор сайта')
        if not isinstance(value['receiptId'],str) or not re.fullmatch(r'[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}',value['receiptId']):
            raise ClientError('Неверная квитанция сайта')
        return dict(value)

    def call(self, operation, params, telegram_update=None, *, request_key=None, guest=False, site_context=None):
        if not isinstance(operation, str) or operation not in PUBLIC | SAVED | CLIENT or not isinstance(params, dict):
            raise ClientError('Операция закрыта: доступны публичные операции и сохранённые расчёты')
        if operation in WRITES and (not isinstance(request_key,str) or not re.fullmatch(r'[A-Za-z0-9._:-]{16,120}',request_key)):
            raise ClientError('Нет сохранённого requestKey кода моста')
        if site_context is not None and telegram_update is not None:
            raise ClientError('Одновременно Telegram и Site context недопустимы')
        context = self.site_context(site_context) if site_context is not None else (self.telegram_context(telegram_update) if telegram_update is not None else None)
        site = site_context is not None
        if operation in CLIENT and (not context or (not site and context['chatType']!='private')):
            raise ClientError('Нужен текущий приватный Telegram update')
        role = 'guest'
        if context and not site and context['chatType'] == 'private' and not guest:
            # This is only an identity lookup. The API, not the local sender ID,
            # decides whether the active staff binding exists.
            probe = self.send('identity', {}, {**context, 'route': 'staff-private'})
            if not isinstance(probe, dict) or probe.get('role') not in STAFF | {'guest'}:
                raise ClientError('API не вернул допустимую роль')
            role = probe['role']
            if role in STAFF:
                context['route'] = 'staff-private'
        staff_only = operation in {'client.list','client.create','plan.connections','plan.link','client.assign'} or (operation in {'client.read','client.save'} and 'id' in params) or (operation in {'plan.list','plan.create'} and 'clientId' in params)
        if staff_only and role not in STAFF:
            raise ClientError('Операция доступна только подтверждённому сотруднику')
        if operation == 'plan.create' and 'clientProfile' in params and context and not site and role not in STAFF:
            raise ClientError('Гостевой Telegram сохраняет расчёт в свою карточку без clientProfile')
        if operation == 'client.save' and not site and 'id' not in params:
            # Model never chooses Telegram userId. Existing binding changes are refused by API.
            profile = dict(params['profile'])
            messengers = [{**m,'userId':m.get('userId','')} for m in profile.get('messengers',[]) if m['type']!='telegram']
            if params['version'] is None:
                requested = [m for m in profile.get('messengers',[]) if m['type']=='telegram']
                if len(requested)>1:raise ClientError('Новая карточка имеет только текущую Telegram-привязку')
                messengers.append({'type':'telegram','username':requested[0]['username'] if requested else '', 'userId':context['senderId']})
            else:
                current = self.send('client.read',{},context)
                if not isinstance(current,dict):raise ClientError('Карточка не найдена; перечитайте её')
                requested=[m for m in profile.get('messengers',[]) if m['type']=='telegram']
                known=[m for m in current['profile']['messengers'] if m['type']=='telegram']
                ids={m['userId'] for m in known if m['userId']}
                updates={m.get('userId'):m['username'] for m in requested if m.get('userId') in ids}
                if len(requested)==1 and 'userId' not in requested[0]:updates[context['senderId']]=requested[0]['username']
                blank=[m for m in known if not m['userId']]
                requested_blank=[m for m in requested if m.get('userId')=='']
                blank_names=iter([m['username'] for m in requested_blank] if len(requested_blank)==len(blank) else [m['username'] for m in blank])
                messengers += [{**m,'username':updates.get(m['userId'],m['username']) if m['userId'] else next(blank_names)} for m in known]
            params = {**params,'profile':{**profile,'messengers':messengers}}
        # Model userId is optional; server wire profiles require it. Preserve explicit IDs
        # and normalize after self-save, where absence has its own Telegram meaning.
        field = 'clientProfile' if operation == 'plan.create' else 'profile' if operation in ('client.create','client.save') else None
        if field in params:
            profile = params[field]
            params = {**params,field:{**profile,'messengers':[{**m,'userId':m.get('userId','')} for m in profile['messengers']]}}
        result = self.send(operation, params, context, request_key)
        return {'ok': True, 'operation': operation, 'route': context['route'] if context else 'guest-telegram', 'role': role, 'result': result}

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--key-file', required=True)
    parser.add_argument('--url', required=True)
    parser.add_argument('--bot-id', required=True)
    parser.add_argument('--telegram-update-file', help='Только файл настоящего Telegram update; без него публичный гостевой режим')
    args = parser.parse_args()
    try:
        raw = sys.stdin.buffer.read(262145)
        if len(raw) > 262144:
            raise ClientError('Слишком большой JSON-запрос')
        request = decode(raw)
        if not isinstance(request, dict) or set(request) != {'operation', 'params'}:
            raise ClientError('JSON должен содержать только operation и params')
        if request['operation'] not in PUBLIC:raise ClientError('Сохранённые расчёты вызываются только инструментом моста')
        update = decode(Path(args.telegram_update_file).read_bytes()) if args.telegram_update_file else None
        result = Client(args.key_file, args.url, args.bot_id).call(request['operation'], request['params'], update)
    except (ClientError, OSError) as error:
        print(json.dumps({'ok': False, 'error': str(error)}, ensure_ascii=False))
        return 1
    print(json.dumps(result, ensure_ascii=False))
    return 0

if __name__ == '__main__':
    sys.exit(main())
