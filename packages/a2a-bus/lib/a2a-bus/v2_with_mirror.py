"""Observe the existing v2 publisher after put; do not alter its authority or probe protocol.
Depends on internal a2a-v2.py names main/put/wire and main's global put lookup.
Recheck this interface whenever the external publisher changes; test/stend-outgoing-mirror.py
exercises the interface with a private publisher and refuses an incomplete interface.
"""
import contextlib,hashlib,importlib.util,os,pathlib,runpy,sqlite3,sys
sys.dont_write_bytecode=True

class MirrorFailure(RuntimeError):pass

def main():
    helper=os.environ.get('A2A_V2_HELPER','/usr/local/libexec/a2a-v2.py')
    namespace=runpy.run_path(helper)
    entry=namespace.get('main');original=namespace.get('put');wire=namespace.get('wire')
    if not all(callable(x)for x in [entry,original,wire]):raise ValueError('v2 publisher ABI unavailable')
    spec=importlib.util.spec_from_file_location('sender_mirror',pathlib.Path(__file__).with_name('outgoing_mirror.py'))
    mirror=importlib.util.module_from_spec(spec);spec.loader.exec_module(mirror)
    def placed(route,metadata,body):
        raw=wire(metadata,body)
        limit=int(os.environ.get('A2A_PREDEL_BAJT','1048576'))
        if not 0<limit<=1048576 or len(raw)>limit:raise ValueError('v2 A2A_PREDEL_BAJT must be 1..1048576 and cover wire bytes; not published')
        target=original(route,metadata,body)
        # Publication is the actual publisher's return, not guessed from its printed output.
        recipient=metadata['recipient']['id']
        op=hashlib.sha256(recipient.encode()+b'\n'+raw).hexdigest()
        try:
            with contextlib.redirect_stdout(sys.stderr):mirror.publish(recipient,op,raw)
        except Exception as error:
            raise MirrorFailure('v2 placed; source owner copy unconfirmed: '+type(error).__name__)from error
        return target
    entry.__globals__['put']=placed
    sys.argv[0]=helper
    entry()

if __name__=='__main__':
    try:main()
    except MirrorFailure as error:print(str(error)+'; no original retry',file=sys.stderr);sys.exit(4)
    except (OSError,ValueError,KeyError,IndexError,AttributeError,TypeError,sqlite3.Error,TimeoutError)as error:
        print('ОТКАЗ v2: '+str(error),file=sys.stderr);sys.exit(3)
