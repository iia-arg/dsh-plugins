#!/usr/bin/python3
"""Native certificate/consumer probes. No real alert transport is called."""
import hashlib,importlib.util,json,os
from pathlib import Path
import shutil,subprocess,sys,tempfile,time,unittest
from unittest.mock import patch

ROOT=Path(__file__).resolve().parents[1]
sys.dont_write_bytecode=True
HELPER=ROOT/'libexec/autopilot-mail-health.py'


def certificate(directory,name,days):
    key=directory/(name+'.key');cert=directory/(name+'.pem')
    subprocess.run(['/usr/bin/openssl','req','-x509','-newkey','ec','-pkeyopt','ec_paramgen_curve:P-256','-nodes','-days',str(days),'-subj','/CN=fixture','-keyout',str(key),'-out',str(cert)],check=True,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,timeout=10)
    return cert


def states(mail='active',copy='active',since=1):
    return ('Id=autopilot-mail.service\nLoadState=loaded\nActiveState='+mail+'\nActiveEnterTimestampMonotonic='+str(since)+'\n\n'+
        'Id=autopilot-copy.service\nLoadState=loaded\nActiveState='+copy+'\nActiveEnterTimestampMonotonic=1\n')


class HealthTests(unittest.TestCase):
    def setUp(self):
        self.assertTrue(HELPER.is_file(),'the permanent helper is missing')
        self.assertEqual(os.geteuid(),0,'private certificate metadata fixture requires root')
        self.tmp=tempfile.TemporaryDirectory(prefix='ap-health-');self.addCleanup(self.tmp.cleanup);self.root=Path(self.tmp.name)
        self.long=certificate(self.root,'long',365);self.short=certificate(self.root,'short',1)
        self.cert=self.root/'server.pem';shutil.copyfile(self.long,self.cert)
        spec=importlib.util.spec_from_file_location('ap_health',HELPER);self.module=importlib.util.module_from_spec(spec);spec.loader.exec_module(self.module)

    def inspect(self,unit_data=None,returncode=0):
        real=subprocess.run
        def provider(argv,**kwargs):
            if argv[0]=='/usr/bin/systemctl':
                self.assertEqual(argv[-2:],['autopilot-mail.service','autopilot-copy.service'])
                return subprocess.CompletedProcess(argv,returncode,states() if unit_data is None else unit_data,'')
            return real(argv,**kwargs)
        with patch.object(self.module.subprocess,'run',provider):
            return self.module.inspect(self.cert,14,30)

    def test_real_expiry_damage_and_restore(self):
        self.assertEqual(self.inspect()['certificate_state'],'')
        before=hashlib.sha256(self.cert.read_bytes()).hexdigest()
        shutil.copyfile(self.short,self.cert);after=hashlib.sha256(self.cert.read_bytes()).hexdigest()
        self.assertNotEqual(before,after)
        count=subprocess.check_output(['grep','-cF','--','-----BEGIN CERTIFICATE-----',str(self.cert)],text=True).strip();self.assertEqual(count,'1')
        print('DAMAGE certificate PEM count='+count+' SHA '+before+' -> '+after,flush=True)
        result=self.inspect();self.assertEqual(result['certificate_state'],'cert_expiring');self.assertIn(str(self.cert),result['certificate_detail']);self.assertIn('14',result['certificate_detail'])
        # Different criterion in openssl: its C checkend, not the helper's Python date parser.
        check=subprocess.run(['/usr/bin/openssl','x509','-checkend',str(14*86400),'-noout','-in',str(self.cert)],capture_output=True,timeout=3)
        self.assertEqual(check.returncode,1)
        shutil.copyfile(self.long,self.cert);self.assertEqual(hashlib.sha256(self.cert.read_bytes()).hexdigest(),before)
        check=subprocess.run(['/usr/bin/openssl','x509','-checkend',str(14*86400),'-noout','-in',str(self.cert)],capture_output=True,timeout=3)
        self.assertEqual(check.returncode,0)
        self.assertEqual(self.inspect()['certificate_state'],'')

    def test_copy_implication_and_startup_grace(self):
        self.assertEqual(self.inspect()['copy_state'],'')
        for copy in ['inactive','failed']:
            bad=self.inspect(states(copy=copy));self.assertEqual(bad['copy_state'],'copy_not_active');self.assertIn('autopilot-copy.service',bad['copy_detail'])
        self.assertEqual(self.inspect(states(mail='inactive',copy='inactive'))['copy_state'],'')
        fresh=int(time.monotonic()*1000000)
        self.assertEqual(self.inspect(states(copy='inactive',since=fresh))['copy_state'],'')
        self.assertEqual(self.inspect()['copy_state'],'')

    def test_unmeasured_is_not_healthy(self):
        self.assertEqual(self.inspect('',1)['copy_state'],'copy_unmeasured')
        self.assertEqual(self.inspect('Id=not-our-unit.service\nActiveState=active\n')['copy_state'],'copy_unmeasured')
        self.assertEqual(self.inspect(states(mail='unknown'))['copy_state'],'copy_unmeasured')
        self.cert.write_text('broken public certificate')
        self.assertEqual(self.inspect()['certificate_state'],'cert_unmeasured')

    def test_actual_sadik_caller_grouped_alarm_and_return(self):
        source=(ROOT/'sbin/sadik-watch').read_text()
        start=source.index('gruppa() {');end=source.index('\n}\n',start)+3
        grouping=source[start:end]
        begin=source.index('# AP-MAIL-HEALTH BEGIN');finish=source.index('# AP-MAIL-HEALTH END',begin)
        block=source[begin:finish]
        stage=self.root/'watch';(stage/'sbin').mkdir(parents=True);(stage/'libexec').mkdir()
        shutil.copyfile(ROOT/'libexec/sadik-watch-autopilot.sh',stage/'libexec/sadik-watch-autopilot.sh')
        (stage/'sbin/caller.sh').write_text(block)
        data=self.root/'units.txt';data.write_text(states());alerts=self.root/'alerts';state=self.root/'state';state.mkdir()
        wrapper=self.root/'helper.py'
        wrapper.write_text('import importlib.util,subprocess,os\nfrom pathlib import Path\n'+
            'spec=importlib.util.spec_from_file_location("health",'+repr(str(HELPER))+');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)\n'+
            'original=m.subprocess.run\n'+
            'def run(argv,**kwargs):\n if argv[0]=="/usr/bin/systemctl":return subprocess.CompletedProcess(argv,0,Path('+repr(str(data))+').read_text(),"")\n return original(argv,**kwargs)\n'+
            'm.subprocess.run=run\ncode=m.main()\nraise SystemExit(int(os.environ.get("TEST_HEALTH_EXIT_CODE",code)))\n')
        harness=self.root/'harness.sh';harness.write_text('set -uo pipefail\n'+grouping+'\n'+
            'SOST='+repr(str(state))+'\nSEYCHAS=$(date +%s)\nBEDY=0\nMESTNO=${TEST_WATCH_MESTNO:-1}\n'+
            'log(){ printf "%s\\n" "$*"; }\nkanal(){ printf "%s\\n" "$1" >> '+repr(str(alerts))+'; }\n'+
            '. '+repr(str(stage/'sbin/caller.sh'))+'\nprintf "BEDY=%s\\n" "$BEDY"\n')
        env=dict(os.environ,SADIK_AP_HEALTH_BIN=str(wrapper),SADIK_AP_CERT=str(self.cert),SADIK_AP_CERT_WARN_DAYS='14')
        def run():
            got=subprocess.run(['/bin/bash',str(harness)],env=env,capture_output=True,text=True,timeout=12);self.assertEqual(got.returncode,0,got.stderr);return got
        healthy=run();self.assertIn('BEDY=0',healthy.stdout);self.assertFalse(alerts.exists())
        before=hashlib.sha256(data.read_bytes()).hexdigest();data.write_text(states(copy='inactive'));after=hashlib.sha256(data.read_bytes()).hexdigest();self.assertNotEqual(before,after)
        count=subprocess.check_output(['grep','-cF','--','ActiveState=inactive',str(data)],text=True).strip();self.assertEqual(count,'1');print('DAMAGE inactive unit count='+count+' SHA '+before+' -> '+after,flush=True)
        bad=run();self.assertIn('BEDY=1',bad.stdout);self.assertIn('autopilot-copy.service',alerts.read_text())
        run();self.assertEqual(len(alerts.read_text().splitlines()),1,'cooldown did not suppress duplicate')
        data.write_text(states());restored=run();self.assertIn('BEDY=0',restored.stdout);self.assertEqual(len(alerts.read_text().splitlines()),2)
        run();self.assertEqual(len(alerts.read_text().splitlines()),2)
        before=hashlib.sha256(self.cert.read_bytes()).hexdigest();shutil.copyfile(self.short,self.cert);after=hashlib.sha256(self.cert.read_bytes()).hexdigest();self.assertNotEqual(before,after)
        count=subprocess.check_output(['grep','-cF','--','-----BEGIN CERTIFICATE-----',str(self.cert)],text=True).strip();self.assertEqual(count,'1');print('DAMAGE caller certificate count='+count+' SHA '+before+' -> '+after,flush=True)
        bad=run();self.assertIn('BEDY=1',bad.stdout);self.assertIn(str(self.cert),alerts.read_text());self.assertEqual(len(alerts.read_text().splitlines()),3)
        run();self.assertEqual(len(alerts.read_text().splitlines()),3)
        shutil.copyfile(self.long,self.cert);restored=run();self.assertIn('BEDY=0',restored.stdout);self.assertEqual(len(alerts.read_text().splitlines()),4)
        env['TEST_WATCH_MESTNO']='0';data.write_text(states(copy='inactive'));skipped=run()
        self.assertIn('not applied in remote mode',skipped.stdout);self.assertEqual(len(alerts.read_text().splitlines()),4)
        env['TEST_WATCH_MESTNO']='1';data.write_text(states());env['TEST_HEALTH_EXIT_CODE']='2'
        inconsistent=run();self.assertIn('BEDY=1',inconsistent.stdout);self.assertEqual(len(alerts.read_text().splitlines()),5)
        del env['TEST_HEALTH_EXIT_CODE'];restored=run();self.assertIn('BEDY=0',restored.stdout);self.assertEqual(len(alerts.read_text().splitlines()),6)


if __name__=='__main__':unittest.main()
