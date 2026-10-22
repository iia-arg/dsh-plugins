"""B-N-2111 (25): общий каталог (/opt/agent-plugins/<пакет>) и строка «служба без пар».

Настоящий сторож, подставные systemctl/journalctl/logger и канал тревог (PATH), свой файл состояния.
OBSHCHIJ_KOREN подменяется после загрузки модуля — боевой /opt/agent-plugins не читается.
Ожидания — в именах проб, записаны до прогона."""
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest

PKG = Path(__file__).resolve().parents[1]
WATCH = os.environ.get('ZHIVAYA_PREDMET', str(PKG / 'sbin/zhivaya-versiya-watch'))
ZAPUSK = ('import importlib.machinery, importlib.util, sys\n'
          'z = importlib.machinery.SourceFileLoader("zhiv", sys.argv[1])\n'
          'M = importlib.util.module_from_spec(importlib.util.spec_from_loader("zhiv", z)); z.exec_module(M)\n'
          'M.JOURNAL_DIRS = (str(__import__("pathlib").Path(sys.argv[2]).parent / "journal-files"),); M.OBSHCHIJ_KOREN = sys.argv[2]; sys.argv = ["zhivaya-versiya-watch"] + sys.argv[3:]\n'
          'sys.exit(M.main())\n')
PODYOM = '[petrovich] [dsh-telegram-multiagent {} · область 151] подъём'


class ObshchijNositel(unittest.TestCase):
    def setUp(self):
        self.root = Path(tempfile.mkdtemp(prefix='b2111-obshchij-'))
        self.bin = self.root / 'bin'
        self.bin.mkdir()
        self.konf = self.root / 'konf.json'
        self.koren = self.root / 'agent-plugins'
        self.disk = self.koren / 'dsh-telegram-multiagent' / 'package.json'
        self.disk.parent.mkdir(parents=True)
        self.sled = self.root / 'sled-kanala.txt'
        self.sost = self.root / 'kartina.json'
        self.cmd('systemctl', 'import sys, json\nk = json.load(open(%r)); a = sys.argv[1:]\n'
                 'if a[0] == "list-units":\n    [print(u + " loaded active running stend") for u in k]\n'
                 'elif a[0] == "show":\n    print(k.get(a[-1], {}).get(a[a.index("-p") + 1], ""))\n' % str(self.konf))
        self.cmd('journalctl', 'import sys, json\nk = json.load(open(%r))\n'
                 'pid = next(x[5:] for x in sys.argv[1:] if x.startswith("_PID="))\n'
                 '[print(u.get("_zhurnal", "")) for u in k.values() if u.get("MainPID") == pid]\n' % str(self.konf))
        self.cmd('logger', 'pass\n')
        self.kanal = self.cmd('kanal', 'import sys\nopen(%r, "a").write(" ".join(sys.argv[1:]).replace(chr(10), " | ") + chr(10))\n'
                              % str(self.sled))

    def tearDown(self):
        shutil.rmtree(self.root)

    def cmd(self, name, body):
        p = self.bin / name
        p.write_text('#!/usr/bin/env python3\n' + body)
        p.chmod(0o755)
        return p

    def agent(self, zhurnal, pid='301', dom=None):
        return {'ExecStart': '{ argv[]=/usr/bin/node /x/node_modules/@deepseek-ai/dsh/lib/bin.js web }',
                'Environment': 'HOME=' + str(dom or self.root / 'pustoj-dom'), 'MainPID': pid,
                'ActiveEnterTimestamp': 'Fri 2026-10-16 08:35:46 UTC', '_zhurnal': zhurnal}

    def progon(self, disk, sluzhby):
        if disk is None:
            self.disk.unlink(missing_ok=True)
        else:
            self.disk.write_text(json.dumps({'version': disk}))
        self.konf.write_text(json.dumps(sluzhby))
        do = self.sled.read_text().splitlines() if self.sled.exists() else []
        p = subprocess.run(['python3', '-B', '-c', ZAPUSK, WATCH, str(self.koren), '--kanal', str(self.kanal),
                            '--sost', str(self.sost)], env={**os.environ, 'PATH': f'{self.bin}:{os.environ["PATH"]}'},
                           capture_output=True, text=True, timeout=30)
        posle = self.sled.read_text().splitlines() if self.sled.exists() else []
        return p, posle[len(do):]

    def test_ispravnoe_porcha_vozvrat(self):
        p, novye = self.progon('3.1.12', {'petrovich.service': self.agent(PODYOM.format('3.1.12'))})
        self.assertEqual(p.returncode, 0, p.stdout + p.stderr)
        self.assertIn('сошлось   petrovich.service · dsh-telegram-multiagent · 3.1.12', p.stdout)
        self.assertEqual(novye, [], 'исправное обязано молчать')
        p, novye = self.progon('3.1.12', {'petrovich.service': self.agent(PODYOM.format('3.1.11'))})
        self.assertEqual(p.returncode, 1, p.stdout + p.stderr)
        self.assertIn('РАЗОШЛОСЬ petrovich.service · dsh-telegram-multiagent · живая 3.1.11 ≠ диск 3.1.12', p.stdout)
        self.assertEqual(len(novye), 1, novye)
        self.assertIn('petrovich.service · dsh-telegram-multiagent · живая 3.1.11 ≠ диск 3.1.12', novye[0])
        p, novye = self.progon('3.1.12', {'petrovich.service': self.agent(PODYOM.format('3.1.12'), pid='302')})
        self.assertEqual(p.returncode, 0, p.stdout + p.stderr)
        self.assertEqual(len(novye), 1, novye)
        self.assertIn('снова в порядке', novye[0])

    def test_sluzhba_bez_par_nazvana(self):
        dom = self.root / 'dom-s-mostom'
        (dom / 'plugins/dsh-tool-bridge').mkdir(parents=True)
        (dom / 'plugins/dsh-tool-bridge/package.json').write_text('{"version":"1.0.0"}')
        p, _ = self.progon('3.1.12', {'s-mostom.service': self.agent('[dsh-tool-bridge 1.0.0] подъём', pid='401', dom=dom),
                                      'golaya.service': self.agent('старт без строк пакетов', pid='402')})
        self.assertEqual(p.returncode, 0, p.stdout + p.stderr)
        self.assertIn('служба без пар: 1 — golaya.service', p.stdout)
        self.assertIn('пар служба×носитель 1 · служб 2 · без пар 1 ·', p.stdout)

    def test_bez_stroki_podyoma_pary_net(self):
        p, _ = self.progon('3.1.12', {'petrovich.service': self.agent('[dsh-telegram-multiagent 3.1.11] старт')})
        self.assertNotIn('dsh-telegram-multiagent', p.stdout)
        self.assertIn('служба без пар: 1 — petrovich.service', p.stdout)

    def test_disk_ne_chitaetsya_slepota(self):
        p, _ = self.progon(None, {'petrovich.service': self.agent(PODYOM.format('3.1.12'))})
        self.assertEqual(p.returncode, 2, p.stdout + p.stderr)
        self.assertIn('СЛЕПОТА   petrovich.service · dsh-telegram-multiagent · диск не читается', p.stdout)


if __name__ == '__main__':
    unittest.main()
