from pathlib import Path
import importlib.util,json,os,unittest
import test_time_usage as F

def load(name):
    spec=importlib.util.spec_from_file_location('_publication_'+name,F.PKG/'runtime'/name);m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m);return m

class PublicV5(unittest.TestCase):
    def setUp(self):
        self.assertTrue(Path('/run/time-publication-private').is_file(),'private namespace required')
        self.f=F.TimeUsage();self.f.setUp();self.addCleanup(self.f.doCleanups)
        self.f.paths['master'].write_bytes(F.end(10));self.m=self.f.module()
        self.source=load('runtime_receipt_source.py');self.core=load('team_usage.py')
        self.root=Path('/run/public-'+self._testMethodName);self.root.mkdir(mode=0o755)
        self.index=self.root/'index.json';self.output=self.root/'runs';self.core.TEAM_USAGE_ROOT=self.output
        self.assertTrue(callable(getattr(self.m,'publish',None)),'time collector has no public v5 writer')

    def test_real_lock_state_public_pointer_and_reader(self):
        with self.source.registry_lock(self.index):
            result=self.f.tick()
            path=self.m.publish(result['receipts']['run1'],self.output)
        self.assertEqual(self.core.read_public('run1','/fixture/project'),result['receipts']['run1'])
        self.assertEqual(path.stat().st_mode&0o777,0o644)
        self.assertEqual((self.output/'run1/current.json').stat().st_mode&0o777,0o644)
        self.assertEqual(self.f.state.stat().st_mode&0o777,0o600)
        with self.assertRaises(self.core.Incomplete):self.core.read_public('run1','/other/project')
        path.write_text(path.read_text().replace('approximate','exact'))
        with self.assertRaises(self.core.Incomplete):self.core.read_public('run1','/fixture/project')

    def test_unsafe_public_parent_refused(self):
        self.output.mkdir(mode=0o777);self.output.chmod(0o777)
        with self.assertRaisesRegex(ValueError,'PUBLIC_UNSAFE'):
            self.m.publish(self.f.tick()['receipts']['run1'],self.output)
        self.assertFalse((self.output/'run1').exists())

    def test_generation_parent_durable_before_current_pointer(self):
        from unittest.mock import patch
        value=self.f.tick()['receipts']['run1'];events=[]
        sync=os.fsync;replace=os.replace
        def synced(fd):
            events.append(('fsync',os.readlink('/proc/self/fd/'+str(fd))));return sync(fd)
        def replaced(src,dst):
            events.append(('replace',str(dst)));return replace(src,dst)
        with patch.object(self.m.os,'fsync',side_effect=synced),patch.object(self.m.os,'replace',side_effect=replaced):
            self.m.publish(value,self.output)
        parent=('fsync',str(self.output/'run1/public'));pointer=('replace',str(self.output/'run1/current.json'))
        self.assertIn(parent,events,'generation name can be lost while current survives: public directory not synced')
        self.assertLess(events.index(parent),events.index(pointer))

    def test_retry_persists_ancestors_created_by_failed_attempt(self):
        from unittest.mock import patch
        value=self.f.tick()['receipts']['run1'];events=[]
        with patch.object(self.m,'atomic_state',side_effect=OSError('injected before receipt commit')):
            with self.assertRaises(OSError):self.m.publish(value,self.output)
        self.assertTrue((self.output/'run1/public').is_dir())
        self.assertFalse((self.output/'run1/current.json').exists())
        sync=os.fsync;replace=os.replace
        def synced(fd):
            events.append(('fsync',os.readlink('/proc/self/fd/'+str(fd))));return sync(fd)
        def replaced(src,dst):
            events.append(('replace',str(dst)));return replace(src,dst)
        with patch.object(self.m.os,'fsync',side_effect=synced),patch.object(self.m.os,'replace',side_effect=replaced):
            self.m.publish(value,self.output)
        pointer=('replace',str(self.output/'run1/current.json'))
        for parent in [self.output,self.output.parent]:
            event=('fsync',str(parent));self.assertIn(event,events,'retry must persist prior attempt directories')
            self.assertLess(events.index(event),events.index(pointer))
        self.assertEqual(self.core.read_public('run1','/fixture/project'),value)
