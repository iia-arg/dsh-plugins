"""Sova R-source regressions: real cursor/ledger/exporter and receipt v3."""
from pathlib import Path
import json,os,sqlite3,tempfile,unittest
import test_runtime_receipt_source as fixtures

class RuntimeGapAndCut(unittest.TestCase):
    def incomplete(self,m,data,reason):
        with self.assertRaisesRegex(m.Incomplete,'^'+reason+'$'):m.export_owner(data)
    def gap(self,m,p):
        r=Path(p['runtimeSource']['raw']);saved=r.read_bytes();base=m.lines(saved)[0]
        row={k:base[k] for k in ['schemaVersion','generation','uid','recipient']};row.update(kind='source_gap',seq=4,at=2000,reason='R_DURABILITY_UNPROVEN')
        r.write_bytes(saved+(json.dumps(row)+'\n').encode());return r,saved
    def restore(self,path,raw):
        new=path.with_suffix('.returned');new.write_bytes(raw);new.chmod(0o600);new.replace(path)
    def test_source_gap_is_named_and_persists_at_unchanged_eof_then_return(self):
        with tempfile.TemporaryDirectory() as tmp:
            m,p,data=fixtures.RuntimeSource().files(Path(tmp));m.export_owner(data);r,saved=self.gap(m,p)
            self.incomplete(m,data,'R_DURABILITY_UNPROVEN');self.incomplete(m,data,'R_DURABILITY_UNPROVEN')
            self.restore(r,saved);out=m.export_owner(data);self.assertEqual(out['runtimeDiagnostics']['unboundRecords'],0)
            self.assertEqual(len([x for x in out['rows'] if x['kind']=='request']),1)
    def test_gap_is_not_cleared_by_an_unverified_watermark(self):
        with tempfile.TemporaryDirectory() as tmp:
            m,p,data=fixtures.RuntimeSource().files(Path(tmp));r,_=self.gap(m,p)
            with r.open('a') as f:f.write(json.dumps(dict(kind='watermark',generation='unverified',at=2100))+'\n')
            self.incomplete(m,data,'R_DURABILITY_UNPROVEN')
    def test_gap_is_not_cleared_by_a_complete_but_malformed_watermark(self):
        with tempfile.TemporaryDirectory() as tmp:
            m,p,data=fixtures.RuntimeSource().files(Path(tmp));r,saved=self.gap(m,p);marker=dict(m.lines(saved)[-1],generation='new-generation',seq=1,at='invalid-not-a-timestamp')
            with r.open('a') as f:f.write(json.dumps(marker)+'\n')
            self.incomplete(m,data,'R_DURABILITY_UNPROVEN')
    def test_legacy_replay_is_incomplete_until_tail_has_been_checked(self):
        from unittest.mock import patch
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);m,p,data=fixtures.RuntimeSource().files(root);m.export_owner(data);r=Path(p['runtimeSource']['raw']);base=m.lines(r.read_bytes())[-1]
            with r.open('a') as f:
                for i in range(30):f.write(json.dumps(dict(base,seq=4+i,at=2100+i))+'\n')
                f.write(json.dumps(dict(base,kind='source_gap',seq=34,at=2200,reason='R_DURABILITY_UNPROVEN'))+'\n')
            state=next((root/'.usage-reader').glob('*.sqlite'))
            with sqlite3.connect(state) as c:c.execute('DROP TABLE IF EXISTS source_status');c.execute('PRAGMA user_version=2');c.execute('UPDATE cursor SET offset=?',(r.stat().st_size,))
            module=m.incremental_module()
            # Supply only public policy data; real cursor/exporter/decoder code remains intact.
            with patch.object(m,'incremental_module',return_value=module),patch.object(module,'load_policy',return_value=(dict(schemaVersion=1,fileMaxBytes=1000,recordMaxBytes=1000),'fixture-policy')):
                self.incomplete(m,data,'R_SOURCE_REPLAY_PENDING')
                for _ in range(20):
                    try:m.export_owner(data)
                    except m.Incomplete as error:
                        if str(error)=='R_DURABILITY_UNPROVEN':break
                        self.assertEqual(str(error),'R_SOURCE_REPLAY_PENDING')
                    else:self.fail('measured export escaped before replay completion')
                else:self.fail('bounded legacy replay did not reach the gap')
    def test_source_gap_with_object_generation_still_has_named_failure(self):
        with tempfile.TemporaryDirectory() as tmp:
            m,p,data=fixtures.RuntimeSource().files(Path(tmp));r,_=self.gap(m,p);rows=m.lines(r.read_bytes());rows[-1]['generation']={}
            r.write_text(''.join(json.dumps(x)+'\n' for x in rows))
            self.incomplete(m,data,'R_DURABILITY_UNPROVEN')
    def test_new_valid_source_generation_can_clear_gap(self):
        with tempfile.TemporaryDirectory() as tmp:
            m,p,data=fixtures.RuntimeSource().files(Path(tmp));r,saved=self.gap(m,p)
            marker=dict(m.lines(saved)[-1],generation='new-source-generation',seq=1,at=2100)
            with r.open('a') as f:f.write(json.dumps(marker)+'\n')
            out=m.export_owner(data);self.assertEqual(len([x for x in out['rows'] if x['kind']=='request']),1)
    def test_legacy_cursor_at_eof_rediscovers_previously_discarded_gap(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);m,p,data=fixtures.RuntimeSource().files(root);m.export_owner(data);r,_=self.gap(m,p)
            state=next((root/'.usage-reader').glob('*.sqlite'))
            with sqlite3.connect(state) as c:
                c.execute('DROP TABLE IF EXISTS source_status');c.execute('PRAGMA user_version=2');c.execute('UPDATE cursor SET offset=?',(r.stat().st_size,))
            self.incomplete(m,data,'R_DURABILITY_UNPROVEN');self.incomplete(m,data,'R_DURABILITY_UNPROVEN')
    def test_acked_gateway_request_without_r_is_not_ordinary_zero_then_return(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);m,p,data=fixtures.RuntimeSource().files(root);r=Path(p['runtimeSource']['raw']);saved=r.read_bytes();rows=m.lines(saved);r.write_text(json.dumps(rows[-1])+'\n')
            data['deliveries']['a'*64]['acked']=True
            self.incomplete(m,data,'DELIVERY_UNBOUND')
            self.restore(r,saved);out=m.export_owner(data);self.assertEqual(len([x for x in out['rows'] if x['kind']=='request']),1)
if __name__=='__main__':unittest.main(verbosity=2)
