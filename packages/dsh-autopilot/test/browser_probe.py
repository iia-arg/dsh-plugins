"""Optional DOM acceptance by the coordinator/general acceptance hand only.
Runs candidate Python/AP in fixtures, not just a browser read. Browser routing
restrictions do NOT sandbox Python or subprocesses. Requires an explicitly
approved isolated runtime/HOME; never borrow an agent's private environment.
This file has not been executed for browser acceptance.
"""
import functools
import http.server
import json
import os
from pathlib import Path
import threading
from playwright.sync_api import sync_playwright
from test_sadik import Sadik


def main():
    case=Sadik('test_http_view_wait_answer_finish_and_server_restart');case.setUp()
    class Quiet(http.server.SimpleHTTPRequestHandler):
        def log_message(self,*args): pass
    server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Quiet,directory=str(case.public)))
    thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start()
    try:
        initial=case.init();dest=case.exported(initial)
        url='http://127.0.0.1:'+str(server.server_port)+'/'+dest.relative_to(case.public).as_posix()+'/dashboard.html'
        with sync_playwright() as playwright:
            browser=playwright.chromium.launch(headless=True)
            try:
                context=browser.new_context()
                context.route('**/*',lambda route: route.continue_() if route.request.url.startswith('http://127.0.0.1:'+str(server.server_port)+'/') else route.abort())
                page=context.new_page();errors=[];page.on('pageerror',lambda exc: errors.append(str(exc)))
                rows=[]
                for args,label in [(('sync',),'working'),(('ask','action','--note','browser probe'),'waiting'),(('answered',),'answered'),(('finish','--result','browser verified'),'finished')]:
                    result=case.call(*args);assert result.returncode==0,result.stdout+result.stderr
                    page.goto(url,wait_until='networkidle')
                    page.locator('.hero').wait_for()
                    snapshot=page.evaluate('window.STATE')
                    assert '_sadik' not in snapshot
                    assert bool(snapshot.get('waiting'))==(label=='waiting')
                    assert bool(snapshot.get('finishedAt'))==(label=='finished')
                    assert page.locator('.hero.ask').count()==int(label=='waiting')
                    assert page.locator('.hero.won').count()==int(label=='finished')
                    assert page.locator('h1').inner_text()=='same-slug'
                    rows.append(dict(state=label,rev=snapshot['rev'],title=page.title()))
                assert not errors,errors
                print(json.dumps(dict(browser=browser.version,uid=os.getuid(),transitions=rows,javascript_errors=errors),ensure_ascii=False))
            finally: browser.close()
    finally:
        server.shutdown();server.server_close();thread.join(timeout=2);case.tearDown()


if __name__=='__main__': main()
