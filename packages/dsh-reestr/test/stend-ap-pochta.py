#!/usr/bin/env python3
"""Real _f_parametry + _f_otrisovat on the package A templates; no live paths, no root.
Run: python3 -B test/stend-ap-pochta.py [candidate/bin/agent-registry].
AP-POCHTA (a2a-bus 3.1.6): raskladka.autopilot_pochta: true gives Latin agentName + autopilotMail in A;
without the flag A keeps the Cyrillic agentName and no block; bad input refuses.
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
loader = importlib.machinery.SourceFileLoader('registry_ap_pochta', str(SOURCE))
spec = importlib.util.spec_from_loader(loader.name, loader)
R = importlib.util.module_from_spec(spec)
loader.exec_module(R)
SHABLONY = PACKAGE / 'share/agent-registry/shablony-raskladki'
CHAT, BOTY = -5388098055, [8602681419, 8724280510]

OB = {'vladelec_telegram': 158901453, 'postanovshchiki_celey': ['claudeclaw/telegram_main'], 'dsh_pokolenie': '0.2',
      'osnova': {'codex': {'predel_servera': 400000, 'dolya_platformy': 0.7}, 'sdk-claude': {'dolya': 0.8}},
      'autopilot_pochta': {'traffic_chat_id': CHAT, 'publisher_bot_ids': BOTY}}


def agent(sem, ap):
    r = {'semejstvo': sem, 'port_shlyuza': 8800, 'klyuch': {'fajl': '/etc/dsh-klyuchi/deepseek'}}
    if ap is not None:
        r['autopilot_pochta'] = ap
    n = {'imya_vidimoe': 'Винтик', 'kompakt_agent': 'vintik', 'dom': '/opt/vintik', 'polzovatel': 'vintik',
         'model': 'm', 'podpiska': R.PODPISKA_OBSHCHAYA, 'raskladka': r}
    return {'imya': 'vintik', 'namerenie': n}


def konfig_kanala(sem, a, ob=OB):
    sem_, p = R._f_parametry(a, ob, 'личность')
    if sem_ is None:
        return None, p
    shablon = (SHABLONY / sem / 'A.tmpl').read_text(encoding='utf-8')
    # Метки, которые ставит обёртка сборки (корни памяти, вставка B и т.п.), — подставой; параметры почты — только настоящие.
    for k in set(R.re.findall(r'@@ESLI ([A-Z0-9_]+)@@', shablon)) - set(p):
        p[k] = False
    for k in set(R.F_METKA.findall(shablon)) - set(p):
        p[k] = '[]' if k.endswith('KORNI') else '0'
    p['PRESET_B'] = ''
    tekst, beda = R._f_otrisovat(shablon, p)
    if tekst is None:
        return None, beda
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


class ApPochta(unittest.TestCase):
    def test_bez_priznaka_prezhnee(self):
        for sem in ('codex', 'sdk-claude'):
            for ap in (None, False):
                k, beda = konfig_kanala(sem, agent(sem, ap))
                self.assertIsNone(beda, f'{sem} {ap}: {beda}')
                self.assertEqual(len(k), 1, sem)
                self.assertEqual(k[0]['agentName'], 'винтик', sem)
                self.assertNotIn('autopilotMail', k[0], sem)

    def test_s_priznakom_blok(self):
        for sem in ('codex', 'sdk-claude'):
            k, beda = konfig_kanala(sem, agent(sem, True))
            self.assertIsNone(beda, f'{sem}: {beda}')
            self.assertEqual(k[0]['agentName'], 'vintik', sem)
            self.assertEqual(k[0]['autopilotMail'], {'noticeDir': '/opt/vintik/a2a/zakryto/vintik', 'trafficChatId': CHAT,
                                                     'publisherBotIds': BOTY, 'names': ['Винтик', 'vintik']}, sem)

    def test_porcha_otkaz(self):
        bez_obshchego = copy.deepcopy(OB); del bez_obshchego['autopilot_pochta']
        pol_chat = copy.deepcopy(OB); pol_chat['autopilot_pochta']['traffic_chat_id'] = 5
        dubl = copy.deepcopy(OB); dubl['autopilot_pochta']['publisher_bot_ids'] = [1, 1]
        sluchai = [('не bool', agent('codex', 'da'), OB, 'true|false'),
                   ('нет общего', agent('codex', True), bez_obshchego, 'traffic_chat_id'),
                   ('чат > 0', agent('codex', True), pol_chat, 'traffic_chat_id'),
                   ('повтор бота', agent('codex', True), dubl, 'publisher_bot_ids')]
        otl = agent('codex', None)
        otl['namerenie']['raskladka']['otlichiya'] = {'prichina': 'проба', 'parametry': {'AP_POCHTA': True}}
        sluchai.append(('отличием', otl, OB, 'AP_POCHTA'))
        for imya, a, ob, slovo in sluchai:
            k, beda = konfig_kanala('codex', a, ob)
            self.assertIsNone(k, imya)
            self.assertIn(slovo, beda, imya)


if __name__ == '__main__':
    unittest.main(verbosity=1)
