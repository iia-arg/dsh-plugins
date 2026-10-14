"""Mark's actual API on synthetic SQLite and key; test-only observation endpoint."""
import io,json,secrets,signal,sys,tempfile,threading,os
from pathlib import Path
from http.server import ThreadingHTTPServer
sys.path.insert(0,sys.argv[1])
from server import App
stop=threading.Event()
signal.signal(signal.SIGTERM,lambda *_:stop.set())
with tempfile.TemporaryDirectory(prefix='gamma-sh4-api-') as tmp:
    key=secrets.token_hex(32).encode()
    p=Path(tmp)/'call.key';p.write_bytes(key+b'\n');p.chmod(0o600)
    app=App(Path(tmp)/'synthetic.db',{'username':'fixture','salt':'00'*16,'hash':'00'*64},'https://example.invalid')
    with app.store.connect() as db:
        profile=json.loads(db.execute('SELECT profile FROM staff_users').fetchone()[0])
        profile['telegramUserId']='123456'
        # Сайт 08853c4a5871+: права = profile.directions (permissions.effective), CRM требует 'calculations';
        # только 'calculations' — не 'leader': фикстура не даёт больше, чем нужно стенду. Старый сайт поле не читает.
        if os.environ.get('OSTROV_FIXTURE_CRM')=='1':profile['role']='hospitality';profile['directions']=['calculations']
        db.execute('UPDATE staff_users SET profile=?',(json.dumps(profile),));db.commit()
    app.plan_writes_enabled=True
    app.crm_access_enabled=os.environ.get("OSTROV_FIXTURE_CRM")=="1"
    base=app.assistant_handler(key,None,'127.0.0.1','8868419301')
    calls=[];mode={}
    class Handler(base):
        def reply(self,status,data):
            if getattr(self,"lost",False):
                self.lost=False
                return super().reply(500,{"error":"synthetic lost ACK after commit"})
            return super().reply(status,data)
        def do_POST(self):
            raw=self.rfile.read(int(self.headers['Content-Length']))
            calls.append(json.loads(raw))
            self.rfile=io.BytesIO(raw)
            forced=mode.pop('next',None)
            if forced=='lost-ack':self.lost=True;forced=None
            if forced=='stall':stop.wait(20);self.close_connection=True;return
            if forced=='bad-json':
                self.send_response(200);self.send_header('Content-Length','7');self.end_headers();self.wfile.write(b'notJSON');return
            if forced=='scalar-json':return self.reply(200,42)
            if forced=='invalid-role':return self.reply(200,{'role':'unsupported-role'})
            if forced=='slow-two':
                stop.wait(8);mode['next']='slow-final'
            elif forced=='slow-final':stop.wait(8)
            elif forced is not None:return self.reply(int(forced),{'error':'synthetic failure'})
            super().do_POST()
        def do_GET(self):
            if self.path=='/fixture/card-second-binding':
                c=app.store.client_self_read('7654321')
                profile={**c['profile'],'messengers':c['profile']['messengers']+[{'type':'telegram','username':'second_name','userId':'7654322'},{'type':'telegram','username':'alpha','userId':''},{'type':'telegram','username':'beta','userId':''}]}
                app.store.client_update(c['id'],c['version'],profile,'synthetic staff')
                return self.reply(200,{'ok':True})
            if self.path=='/fixture/stats':
                with app.store.connect() as db:n=db.execute('SELECT count(*) FROM resident_plans').fetchone()[0]
                return self.reply(200,{'residentPlans':n})
            if self.path=='/fixture/calls':return self.reply(200,{'calls':calls})
            if self.path=='/fixture/quote-negative-zero':
                quote=app.store.biggroup_quote({'policyVersion':3,'week':'2027-05-01','adults':25,'teens':0,'extraTeam':0,'organizer':'Тест','title':'Нулевая скидка'})
                return self.reply(200,quote)
            if self.path.startswith('/fixture/mode/'):
                mode['next']=self.path.rsplit('/',1)[1];return self.reply(200,{'ok':True})
            return super().do_GET()
    server=ThreadingHTTPServer(('127.0.0.1',0),Handler)
    thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start()
    print(json.dumps({'baseUrl':f'http://127.0.0.1:{server.server_port}','keyFile':str(p),'temp':tmp}),flush=True)
    stop.wait()
    server.shutdown();server.server_close();thread.join(2)
assert not Path(tmp).exists()
