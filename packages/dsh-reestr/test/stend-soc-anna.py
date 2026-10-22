#!/usr/bin/env python3
"""Real _f_parametry + _f_otrisovat on the package A templates; no live paths, no root.
Run: python3 -B test/stend-soc-anna.py [candidate/bin/agent-registry].
B-N-2027 (dsh-reestr 3.1.5): raskladka.socpriyom on the anna record gives agentName "anna" (Latin record name) + config.social in A;
without it A keeps the Cyrillic agentName and no social block; another record, bad form, AP mail together, override — refuse.
"""
import copy
import importlib.machinery
import importlib.util
from pathlib import Path
import sys
import unittest

sys.dont_write_bytecode = True
PACKAGE = Path(__file__).resolve().parents[1]
SOURCE = Path(sys.argv.pop(1)) if len(sys.argv) > 1 else PACKAGE / 'bin/agent-registry'
loader = importlib.machinery.SourceFileLoader('registry_soc_anna', str(SOURCE))
spec = importlib.util.spec_from_loader(loader.name, loader)
R = importlib.util.module_from_spec(spec)
loader.exec_module(R)
SHABLONY = PACKAGE / 'share/agent-registry/shablony-raskladki'
SOC = {'serviceUrl': 'http://127.0.0.1:8382', 'keyFile': '/opt/anna/.config/socseti/channel.key',
       'channelId': -1001925584120, 'discussionId': -1002103269359}

OB = {'vladelec_telegram': 158901453, 'postanovshchiki_celey': ['claudeclaw/telegram_main'], 'dsh_pokolenie': '0.2',
      'osnova': {'codex': {'predel_servera': 400000, 'dolya_platformy': 0.7}, 'sdk-claude': {'dolya': 0.8}},
      'autopilot_pochta': {'traffic_chat_id': -5388098055, 'publisher_bot_ids': [8602681419]}}


def agent(sem, soc, imya='anna', vidimoe='Анна'):
    r = {'semejstvo': sem, 'port_shlyuza': 8798, 'klyuch': {'fajl': '/etc/dsh-klyuchi/deepseek'}}
    if soc is not None:
        r['socpriyom'] = soc
    n = {'imya_vidimoe': vidimoe, 'kompakt_agent': imya, 'dom': f'/opt/{imya}', 'polzovatel': imya,
         'model': 'm', 'podpiska': R.PODPISKA_OBSHCHAYA, 'raskladka': r}
    return {'imya': imya, 'namerenie': n}


def konfig_kanala(sem, a, ob=OB):
    sem_, p = R._f_parametry(a, ob, 'личность')
    if sem_ is None:
        return None, p
    shablon = (SHABLONY / sem / 'A.tmpl').read_text(encoding='utf-8')
    # Метки, которые ставит обёртка сборки (корни памяти, вставка B и т.п.), — подставой; параметры соцприёма — только настоящие.
    for k in set(R.re.findall(r'@@ESLI ([A-Z0-9_]+)@@', shablon)) - set(p):
        p[k] = False
    for k in set(R.F_METKA.findall(shablon)) - set(p):
        p[k] = '[]' if k.endswith('KORNI') else '0'
    p['PRESET_B'] = ''
    tekst, beda = R._f_otrisovat(shablon, p)
    if tekst is None:
        return None, beda
    # YAML-разбор молча берёт последний из двух одноимённых ключей — число строк agentName считаем по тексту.
    if len(R.re.findall(r'(?m)^\s*agentName:', tekst)) != 1:
        return None, 'строк agentName в A не одна'
    najdeno = []

    def obhod(x):
        if isinstance(x, dict):
            if x.get('id') == 'dsh-telegram-multiagent' and isinstance(x.get('config'), dict):
                najdeno.append(x['config'])
            for v in x.values():
                obhod(v)
        elif isinstance(x, list):
            for v in x:
                obhod(v)
    obhod(R._yaml_terpimyj(tekst))
    return najdeno, None


def s(**izm):
    d = dict(SOC)
    for k, v in izm.items():
        if v is KeyError:
            del d[k]
        else:
            d[k] = v
    return d


class SocAnna(unittest.TestCase):
    def test_bez_priznaka_prezhnee(self):
        for sem in ('codex', 'sdk-claude'):
            for a, imya in ((agent(sem, None), 'анна'), (agent(sem, None, 'vintik', 'Винтик'), 'винтик')):
                k, beda = konfig_kanala(sem, a)
                self.assertIsNone(beda, f'{sem}: {beda}')
                self.assertEqual(len(k), 1, sem)
                self.assertEqual(k[0]['agentName'], imya, sem)
                self.assertNotIn('social', k[0], sem)

    def test_s_priznakom_blok(self):
        for sem in ('codex', 'sdk-claude'):
            for url in ('http://127.0.0.1:8382', 'http://127.0.0.1:8382/'):
                k, beda = konfig_kanala(sem, agent(sem, s(serviceUrl=url)))
                self.assertIsNone(beda, f'{sem}: {beda}')
                self.assertEqual(len(k), 1, sem)
                self.assertEqual(k[0]['agentName'], 'anna', sem)
                self.assertEqual(k[0]['social'], s(serviceUrl=url), sem)
                self.assertNotIn('autopilotMail', k[0], sem)

    def test_porcha_otkaz(self):
        sluchai = [('не объект', agent('codex', True), 'ровно с ключами'),
                   ('лишний ключ', agent('codex', s(extra=1)), 'ровно с ключами'),
                   ('нет ключа', agent('codex', s(keyFile=KeyError)), 'ровно с ключами'),
                   ('другая запись', agent('codex', s(), 'vintik', 'Винтик'), 'только у записи anna'),
                   ('https', agent('codex', s(serviceUrl='https://127.0.0.1:8382')), 'serviceUrl'),
                   ('не локальный', agent('codex', s(serviceUrl='http://10.0.0.1:8382')), 'serviceUrl'),
                   ('порт < 1024', agent('codex', s(serviceUrl='http://127.0.0.1:838')), 'serviceUrl'),
                   ('порт > 65535', agent('codex', s(serviceUrl='http://127.0.0.1:65536')), 'serviceUrl'),
                   ('путь', agent('codex', s(serviceUrl='http://127.0.0.1:8382/mcp')), 'serviceUrl'),
                   ('userinfo', agent('codex', s(serviceUrl='http://u@127.0.0.1:8382')), 'serviceUrl'),
                   ('ключ относительный', agent('codex', s(keyFile='channel.key')), 'keyFile'),
                   ('ключ с ..', agent('codex', s(keyFile='/opt/anna/../x.key')), 'keyFile'),
                   ('ключ с кавычкой', agent('codex', s(keyFile='/opt/anna/"x')), 'keyFile'),
                   ('канал > 0', agent('codex', s(channelId=1001925584120)), 'channelId'),
                   ('канал bool', agent('codex', s(channelId=True)), 'channelId'),
                   ('канал строкой', agent('codex', s(channelId='-1001925584120')), 'channelId'),
                   ('одинаковые', agent('codex', s(discussionId=SOC['channelId'])), 'channelId')]
        ap = agent('codex', s()); ap['namerenie']['raskladka']['autopilot_pochta'] = True
        sluchai.append(('вместе с почтой AP', ap, 'autopilot_pochta'))
        for param in ('SOCPRIYOM', 'SOC_URL', 'IMYA_KANALA_RU'):
            otl = agent('codex', None)
            otl['namerenie']['raskladka']['otlichiya'] = {'prichina': 'проба', 'parametry': {param: True}}
            sluchai.append((f'отличием {param}', otl, param))
        for imya, a, slovo in sluchai:
            k, beda = konfig_kanala('codex', a)
            self.assertIsNone(k, imya)
            self.assertIn(slovo, beda, imya)


if __name__ == '__main__':
    unittest.main(verbosity=1)
