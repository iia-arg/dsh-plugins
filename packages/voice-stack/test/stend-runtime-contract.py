#!/usr/bin/env python3
"""Execute the wrappers with synthetic audio and external tools, never live models.
Run with python3. Optional argv[1] selects a package copy. No system account switches,
journal access or alerts; HTTP tests use their own loopback server only.
"""
from pathlib import Path
import http.server
import json
import os
import shlex
import shutil
import socket
import subprocess
import sys
import tempfile
import threading
import unittest

ROOT = Path(sys.argv.pop(1)) if len(sys.argv)>1 else Path(__file__).resolve().parents[1]


class Contract(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(prefix='voice-contract-')
        self.addCleanup(self.tmp.cleanup)
        self.d = Path(self.tmp.name)
        self.bin = self.d/'bin'
        self.bin.mkdir()
        self.wav = self.d/'audio.wav'
        self.wav.write_bytes(b'SYNTHETIC_AUDIO_CANARY')
        self.env = os.environ.copy()
        self.env.update(PATH=str(self.bin)+':/usr/sbin:/usr/bin:/bin', LC_ALL='C.UTF-8',
                        DENOISE='0', WHISPER_HOME=str(self.d/'absent-whisper'), DENOISE_HOME=str(self.d/'absent-denoiser'), SAGE_HOME=str(self.d), SAGE_LOG=str(self.d/'log'),
                        SAGE_SOCK=str(self.d/'missing.sock'))
        for key in list(self.env):
            if key.startswith(('GOLOS_', 'VOICE_ARCHIVE_', 'SAGE_')):
                self.env.pop(key)
        self.env.update(SAGE_HOME=str(self.d), SAGE_LOG=str(self.d/'log'),
                        SAGE_SOCK=str(self.d/'missing.sock'))
        self.helper('logger', 'pass')
        self.helper('ffmpeg', 'import sys\nif "volumedetect" in sys.argv: print("mean_volume: -40",file=sys.stderr)\nelse: Path(sys.argv[-1]).write_bytes(b"normalized")')
        self.helper('engine', 'import os,sys\nprint(os.environ.get("TEXT", "ordinary speech"),end="")\nsys.exit(int(os.environ.get("CODE","0")))')
        (self.d/'hallucination-filter.txt').write_text('^impossible phrase$\n')

    def helper(self, name, body):
        p = self.bin/name
        p.write_text('#!/usr/bin/python3\nfrom pathlib import Path\n'+body+'\n')
        p.chmod(0o755)
        return p

    def run_script(self, name, lang='auto', **env):
        return subprocess.run(['bash',str(ROOT/'bin'/name),str(self.wav),lang],
                              env=self.env|env,capture_output=True,text=True,timeout=8)

    def correction(self, text, **env):
        return self.run_script('transcribe-correct-wrap', TEXT=text,
                               SAGE_INNER_TRANSCRIBER=str(self.bin/'engine'), **env)

    def test_filter_dash_is_pattern_not_option(self):
        (self.d/'hallucination-filter.txt').write_text('- Спасибо\\.\n')
        q = self.correction('- Спасибо.')
        self.assertEqual(q.returncode,0,q.stderr)
        self.assertIn('речь не распознана',q.stdout)
        self.assertNotIn('grep:',q.stderr)

    def cold(self, lang):
        self.helper('curl','import sys; sys.exit(7)')
        p = self.d/'whisper/build-vulkan/bin'
        p.mkdir(parents=True)
        cli = p/'whisper-cli'
        cli.write_text('#!/usr/bin/python3\nimport sys,json\nprint(json.dumps(sys.argv[1:]))\n')
        cli.chmod(0o755)
        q = self.run_script('transcribe-whispercpp-core',lang,WHISPER_HOME=str(self.d/'whisper'))
        self.assertEqual(q.returncode,0,q.stderr)
        return json.loads(q.stdout)

    def test_cold_auto_is_explicit(self):
        a = self.cold('auto')
        self.assertIn('-l',a)
        self.assertEqual(a[a.index('-l')+1],'auto')

    def test_cold_language_cannot_add_flags(self):
        language = 'ru -otxt -of /tmp/unauthorized'
        a = self.cold(language)
        self.assertEqual(a[a.index('-l')+1],language)
        self.assertNotIn('-otxt',a)

    def test_multipart_filename_roundtrip(self):
        self.wav = self.d/'file,semi;quote"back\\slash.wav'
        self.wav.write_bytes(b'SYNTHETIC_AUDIO_CANARY')
        posts=[]
        class Handler(http.server.BaseHTTPRequestHandler):
            def do_GET(self):
                self.send_response(200); self.end_headers()
            def do_POST(self):
                posts.append(self.rfile.read(int(self.headers['Content-Length'])))
                self.send_response(200); self.end_headers(); self.wfile.write(b'warm transcript')
            def log_message(self,*args): pass
        server = http.server.HTTPServer(('127.0.0.1',0),Handler)
        worker = threading.Thread(target=server.serve_forever,daemon=True)
        worker.start()
        try:
            q = self.run_script('transcribe-whispercpp-core',WHISPERCPP_PORT=str(server.server_port))
            self.assertEqual(q.returncode,0,q.stderr)
            self.assertEqual(q.stdout.strip(),'warm transcript')
            self.assertEqual(len(posts),1)
            self.assertIn(b'SYNTHETIC_AUDIO_CANARY',posts[0])
        finally:
            server.shutdown(); server.server_close(); worker.join()

    def archive(self, code=0, disable=None):
        pending=self.d/'pending'
        conf=self.d/'archive.conf'
        conf.write_text('REAL_TRANSCRIBER='+shlex.quote(str(self.bin/'engine'))+'\nPENDING_DIR='+shlex.quote(str(pending))+'\n')
        env=dict(VOICE_ARCHIVE_CONF=str(conf),TEXT='public fixture',CODE=str(code))
        if disable is not None: env['VOICE_ARCHIVE_DISABLE']=disable
        q=self.run_script('transcribe-local-shared',**env)
        return q,pending

    def test_partial_failed_transcript_is_not_archived(self):
        q,p=self.archive(7)
        self.assertEqual((q.returncode,q.stdout),(7,'public fixture'))
        self.assertFalse(list(p.glob('*')))

    def test_archive_private_modes_even_under_umask_022(self):
        previous=os.umask(0o022)
        try: q,p=self.archive()
        finally: os.umask(previous)
        self.assertEqual(q.returncode,0,q.stderr)
        self.assertEqual(p.stat().st_mode&0o777,0o700)
        files=list(p.glob('*'))
        self.assertEqual(len(files),2)
        for f in files: self.assertEqual(f.stat().st_mode&0o777,0o600,f.name)

    def test_existing_group_archive_permissions_are_preserved(self):
        pending=self.d/'pending'; pending.mkdir(); pending.chmod(0o770)
        q,p=self.archive()
        self.assertEqual((q.returncode,q.stdout),(0,'public fixture'))
        self.assertEqual(p.stat().st_mode&0o777,0o770)
        self.assertEqual(len(list(p.glob('*'))),2)
        for f in p.iterdir(): self.assertEqual(f.stat().st_mode&0o777,0o600)

    def test_archive_optout_and_invalid_values(self):
        q,p=self.archive(disable='1')
        self.assertEqual((q.returncode,q.stdout),(0,'public fixture'))
        self.assertFalse(p.exists())
        for value in ['', 'yes']:
            with self.subTest(value=value):
                q,p=self.archive(disable=value)
                self.assertEqual(q.returncode,2)
                self.assertEqual(q.stdout,'')
                self.assertIn('VOICE_ARCHIVE_DISABLE',q.stderr)

    def test_gain_archive_source_depends_on_TMPDIR(self):
        original=self.d/'audio.ogg'
        original.write_bytes(b'ORIGINAL_AUDIO_CANARY')
        conf=self.d/'archive.conf'
        pending=self.d/'pending'
        installed=self.bin/'transcribe-local-shared'
        shutil.copyfile(ROOT/'bin/transcribe-local-shared',installed)
        installed.chmod(0o755)
        conf.write_text('REAL_TRANSCRIBER='+shlex.quote(str(self.bin/'engine'))+'\nPENDING_DIR='+shlex.quote(str(pending))+'\n')
        common=self.d/'common'; common.mkdir()
        for tmpdir, suffix, content in [(self.d,'.ogg',b'ORIGINAL_AUDIO_CANARY'),
                                        (common,'.wav',b'normalized')]:
            with self.subTest(tmpdir=tmpdir.name):
                for f in pending.glob('*'): f.unlink()
                q=self.run_script('transcribe-correct-wrap',SAGE_INNER_TRANSCRIBER=str(installed),
                                  VOICE_ARCHIVE_CONF=str(conf),TMPDIR=str(tmpdir),TEXT='public fixture')
                self.assertEqual((q.returncode,q.stdout),(0,'public fixture'),q.stderr)
                self.assertEqual(next(f for f in pending.iterdir() if f.suffix==suffix).read_bytes(),content)

    def test_invalid_chunk_limit_fails_promptly_with_reason(self):
        sock=socket.socket(socket.AF_UNIX)
        sock.bind(str(self.d/'sock'))
        self.addCleanup(sock.close)
        client=self.d/'client.py'
        client.write_text('import sys; print(sys.stdin.read(),end="")\n')
        # Keep the original wrapper timeout boundary, shorten its duration for this stand.
        self.helper('timeout','import os,sys\na=sys.argv[1:]; a[0]="1" if a[0]=="70" else a[0]\nos.execv("/usr/bin/timeout",["timeout",*a])')
        for limit in ['0','-1']:
            with self.subTest(limit=limit):
                (self.d/'log').unlink(missing_ok=True)
                q=self.correction('ordinary speech',SAGE_KUSOK=limit,SAGE_CLIENT=str(client),SAGE_SOCK=str(self.d/'sock'))
                self.assertEqual((q.returncode,q.stdout),(0,'ordinary speech'))
                self.assertIn('SAGE_KUSOK', (self.d/'log').read_text())

    def test_gain_threshold_is_data_not_awk_program(self):
        flag=self.d/'INJECTED'
        threshold='0+system("touch '+str(flag)+'")'
        q=self.correction('ordinary speech',GAIN_THRESHOLD_DB=threshold)
        self.assertEqual(q.returncode,0,q.stderr)
        self.assertFalse(flag.exists(),'threshold executed as an awk program')

    def watcher(self, name='probe', incomplete=False, uid='0', uppercase=False):
        self.helper('id','import os,sys\nprint(os.environ.get("FAKE_UID","0"))')
        self.helper('espeak-ng','import sys\na=sys.argv[1:]; Path(a[a.index("-w")+1]).write_bytes(b"speech")')
        self.helper('runuser','import os,sys\na=sys.argv[1:]; os.execvpe(a[3],a[3:],os.environ)')
        self.helper('journalctl','pass')
        alert=self.helper('alert','pass')
        command=self.bin/'engine'
        profile=self.d/'agent/.dsh/profiles/web/cordis.patch.yml'
        profile.parent.mkdir(parents=True)
        profile.write_text('transcribeCommand: '+str(command)+'\n')
        intention={'platforma':'dsh','dom':str(self.d/'agent'),'polzovatel':'root'}
        if incomplete: intention.pop('polzovatel')
        registry=self.d/'registry.json'
        registry.write_text(json.dumps({'agenty':[{'imya':name,'namerenie':intention}]}))
        return subprocess.run(['bash',str(ROOT/'bin/golos-watch')],capture_output=True,text=True,timeout=8,
            env=self.env|dict(LC_ALL='C',FAKE_UID=uid,GOLOS_REESTR=str(registry),GOLOS_ALERT=str(alert),
                GOLOS_DVIZHOK=str(command),GOLOS_PREDEL_PROBY='2',GOLOS_KURSOR=str(self.d/'cursor'),
                TEXT='Проверка голоса' if uppercase else 'проверка голоса'))

    def test_watch_uppercase_cyrillic_under_C(self):
        q=self.watcher(uppercase=True)
        self.assertEqual(q.returncode,0,q.stdout+q.stderr)
        self.assertIn('1 из 1',q.stdout)

    def test_watch_name_never_becomes_filename(self):
        q=self.watcher(name='-/nested/name')
        self.assertEqual(q.returncode,0,q.stdout+q.stderr)
        self.assertIn('-/nested/name',q.stdout)

    def test_watch_incomplete_entry_is_named_agent_failure(self):
        q=self.watcher(incomplete=True)
        self.assertEqual(q.returncode,1,q.stdout+q.stderr)
        self.assertIn('probe',q.stdout)
        self.assertIn('polzovatel',q.stdout)
        self.assertNotIn('KeyError',q.stderr)

    def test_watch_nonroot_is_blind_before_probes(self):
        q=self.watcher(uid='1003')
        self.assertEqual(q.returncode,2,q.stdout+q.stderr)
        self.assertIn('root',q.stdout+q.stderr)


if __name__=='__main__':
    unittest.main(verbosity=2)
