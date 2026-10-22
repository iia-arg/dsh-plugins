"""Sender fairness and one durable capacity signal, with external alert stubbed."""
import json
from pathlib import Path
import unittest
from unittest.mock import patch
import test_dedicated_mail as fixture

class CapacityTests(unittest.TestCase):
    setUp=fixture.DedicatedMailTests.setUp
    call=fixture.DedicatedMailTests.call

    def send(self,n,actor='master',body='x'):
        return self.service.handle(actor,fixture.USERS[actor],{'op':'send','to':'vintik','nonce':str(n),'subject':'','body':body})

    def test_sender_200_pending_quota_does_not_block_another_and_ack_frees_one(self):
        for n in range(200):self.assertTrue(self.send(n)['ok'])
        self.assertTrue(self.send(0)['ok'],'retry at full quota must remain idempotent')
        self.assertEqual(self.send(200),{'ok':False,'reason':'SENDER_QUOTA_FULL'})
        self.assertTrue(self.send(200,'shpuntik')['ok'])
        message=self.send(0)['id'];self.call('vintik',{'op':'ack','id':message})
        self.assertTrue(self.send(200)['ok'])
        status=self.call('master',{'op':'status'})
        self.assertTrue(status['ok']);self.assertEqual(status['sender_pending'],200);self.assertEqual(status['sender_limit'],200)

    def test_80_percent_signal_once_and_restart_does_not_resend(self):
        self.assertTrue(callable(getattr(self.service,'notify_capacity',None)),'missing capacity signal reader')
        self.service.policy.limits['max_live_body_bytes']=10;signals=[]
        send=lambda text:(signals.append(text) or 'sent')
        for n in range(7):self.assertTrue(self.send(n)['ok'])
        self.service.notify_capacity(send)
        self.assertEqual(signals,[])
        self.assertEqual(self.call('master',{'op':'status'})['body_warning_at'],8)
        self.assertTrue(self.send(7)['ok']);self.service.notify_capacity(send);self.service.notify_capacity(send)
        self.assertEqual(len(signals),1);self.assertIn('8/10',signals[0]);self.assertIn('Забава',signals[0])
        status=self.call('master',{'op':'status'});self.assertEqual(status['messages'],8);self.assertEqual(status['alert'],'sent')
        self.service.stop();self.service=self.api.Postman(self.socket,self.state,fixture.USERS,65534,retention=self.service.policy.config);self.service.start()
        self.service.notify_capacity(send);self.assertEqual(len(signals),1)
        self.assertEqual(self.call('master',{'op':'status'})['alert'],'sent')

    def test_ambiguous_claim_after_restart_is_unknown_without_another_signal(self):
        self.assertTrue(callable(getattr(self.service,'notify_capacity',None)),'missing capacity signal reader')
        self.service.policy.limits['max_live_body_bytes']=5
        for n in range(4):self.assertTrue(self.send(n)['ok'])
        with self.service.guard,self.service.db:self.service.db.execute("UPDATE capacity_alert SET state='claimed'")
        self.service.stop();self.service=self.api.Postman(self.socket,self.state,fixture.USERS,65534,retention=self.service.policy.config);self.service.start()
        self.service.notify_capacity(lambda _:self.fail('claimed signal must never replay'))
        self.assertEqual(self.call('master',{'op':'status'})['alert'],'unknown')

    def test_byte_cap_warns_at_80_percent_even_below_message_threshold(self):
        self.service.policy.limits['max_live_body_bytes']=100
        for n in range(7):self.assertTrue(self.send(n,body='я'*5)['ok'])
        self.assertEqual(self.call('master',{'op':'status'})['alert'],'none')
        self.assertTrue(self.send(7,body='я'*5)['ok'])
        status=self.call('master',{'op':'status'});self.assertEqual(status['body_bytes'],80);self.assertEqual(status['body_warning_at'],80);self.assertEqual(status['alert'],'pending')
        seen=[];self.service.notify_capacity(lambda text:seen.append(text) or 'sent');self.assertEqual(len(seen),1)

    def test_failed_signal_is_visible_and_never_retried_automatically(self):
        self.service.policy.limits['max_live_body_bytes']=5
        for n in range(4):self.assertTrue(self.send(n)['ok'])
        seen=[]
        for _ in range(3):self.service.notify_capacity(lambda text:seen.append(text) or 'failed')
        self.assertEqual(len(seen),1);self.assertEqual(self.call('master',{'op':'status'})['alert'],'failed')

    def test_alert_transport_forces_spool_bounds_wait_and_maps_unknown(self):
        import subprocess
        calls=[]
        class Process:
            pid=987654
            def __init__(self,code,timeout=False):self.returncode=code;self.timeout=timeout;self.once=True
            def communicate(self,text=None,timeout=None):
                calls.append(('input',text,timeout))
                if self.timeout and self.once:
                    self.once=False;raise subprocess.TimeoutExpired('fixture',15)
        for code,want in [(0,'sent'),(75,'unknown'),(65,'failed')]:
            calls.clear()
            def launch(argv,**kw):calls.append(('launch',argv,kw));return Process(code)
            with patch.object(self.api.subprocess,'Popen',launch):self.assertEqual(self.api.send_capacity_alert('capacity fixture'),want)
            argv,kwargs=calls[0][1:];self.assertEqual(argv,['/usr/local/bin/agent-alert','--plain'])
            self.assertEqual(kwargs['env']['AGENT_ALERT_CHEREZ_SPUL'],'1');self.assertEqual(kwargs['env']['AGENT_ALERT_ITOG_ZHDAT'],'10')
            self.assertEqual(calls[1],('input','capacity fixture',15));self.assertTrue(kwargs['start_new_session'])
        with patch.object(self.api.subprocess,'Popen',lambda *a,**k:Process(0,True)),patch.object(self.api.os,'killpg') as killed:
            self.assertEqual(self.api.send_capacity_alert('capacity fixture'),'unknown');killed.assert_called_once_with(987654,self.api.signal.SIGKILL)

    def test_old_alert_completion_cannot_consume_a_new_capacity_episode(self):
        import time
        self.service.policy.limits['max_live_body_bytes']=10
        for settings in self.service.policy.config['agents'].values():
            for direction in settings.values():direction['keep_count']=1
        for n in range(8):
            message=self.send(n)['id'];self.service.handle('vintik',fixture.USERS['vintik'],{'op':'ack','id':message})
        self.service.clock=lambda:time.time()+100*3600
        seen=[]
        def old_callback(text):
            seen.append(text)
            for n in range(8,17):self.assertTrue(self.send(n)['ok'])
            self.assertEqual(self.call('master',{'op':'status'})['alert'],'pending')
            return 'sent'
        self.service.notify_capacity(old_callback)
        self.assertEqual(self.call('master',{'op':'status'})['alert'],'pending','old callback must not mark a newer episode sent')
        self.service.notify_capacity(lambda text:seen.append(text) or 'sent')
        self.assertEqual(len(seen),2)

if __name__=='__main__':unittest.main()
