"""Retain a full sender-owned placement record for the Telegram owner-all reader."""
import datetime,hashlib,json,os,pathlib,pwd,re,secrets,subprocess,sys,time

class UnknownSender(ValueError):pass
class MissingField(ValueError):pass

def field(registry,sender,key):
    result=subprocess.run([registry,'pole',sender,key,'--json'],stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=3)
    if result.returncode:
        # Stable machine markers; localized human diagnostics are not the protocol.
        errors=result.stderr.decode('utf-8','replace').splitlines()
        if result.returncode==3 and not result.stdout:
            if 'agent-registry-error: agent-not-found' in errors:
                raise UnknownSender('sender_not_registered')
            if 'agent-registry-error: field-not-found' in errors:
                raise MissingField('sender_field_not_assigned')
        raise ValueError('sender_registry_lookup_failed')
    return json.loads(result.stdout)

def publish(recipient,operation_id,raw=None):
    def skipped(reason):
        # Drain stdin even on skip so a long personal send cannot fail through SIGPIPE.
        if raw is None:
            for _ in iter(lambda:sys.stdin.buffer.read(65536),b''):pass
        print('source owner copy skipped: '+reason)
    registry=os.environ.get('A2A_REESTR_BIN','/usr/local/bin/agent-registry')
    context=os.environ.get('DSH_HOME')
    home=pathlib.Path(context).parent if context else pathlib.Path(os.environ.get('HOME',''))
    sender=home.name
    try:channel=field(registry,sender,'kanal')
    except (UnknownSender,MissingField):
        return skipped('sender or channel not assigned; owner-all not established')
    if channel is None:
        return skipped('channel not assigned')
    if not isinstance(channel,dict):raise ValueError('sender_channel_invalid')
    if channel.get('rezhim_dostavki')!='owner-all':
        return skipped('mode is not owner-all')
    if context and (not pathlib.Path(context).is_absolute() or pathlib.Path(context).name!='.dsh'):raise ValueError('sender_context_invalid')
    if not re.fullmatch(r'[a-z][a-z0-9_-]{0,63}',sender):raise ValueError('sender_context_invalid')
    registered=field(registry,sender,'dom')
    if str(home)!=registered or home.is_symlink() or not home.is_dir() or home.stat().st_uid!=os.getuid():raise ValueError('sender_context_invalid')
    if field(registry,sender,'polzovatel')!=pwd.getpwuid(os.getuid()).pw_name:raise ValueError('sender_context_invalid')
    cwd=pathlib.Path.cwd().resolve()
    if cwd!=home.resolve() and home.resolve()not in cwd.parents:raise ValueError('sender_context_invalid')
    if raw is None:raw=sys.stdin.buffer.read(1048577)
    if len(raw)>1048576:raise ValueError('mirror_body_too_large')
    body=raw.decode('utf-8')
    if not re.fullmatch(r'[a-z][a-z0-9_-]{0,63}',recipient) or not re.fullmatch(r'[a-f0-9]{64}',operation_id):raise ValueError('mirror_scope_invalid')
    if hashlib.sha256((recipient+'\n'+body).encode()).hexdigest()!=operation_id:raise ValueError('mirror_body_mismatch')
    # The shell invokes this only after it independently checked publication.
    record={'version':1,'stage':'placed','sender':sender,'recipient':recipient,'operation_id':operation_id,
            'placed_at':int(time.time()*1000),'body':body,'body_sha256':hashlib.sha256(raw).hexdigest()}
    for folder in [home/'a2a',home/'a2a/polnye']:
        folder.mkdir(mode=0o700,exist_ok=True)
        if folder.is_symlink() or not folder.is_dir() or folder.stat().st_uid!=os.getuid():raise ValueError('mirror_directory_untrusted')
    directory=home/'a2a/polnye';target=directory/('agent-outgoing-'+operation_id+'.json')
    if target.exists():
        st=target.lstat()
        if target.is_symlink()or not target.is_file()or st.st_uid!=os.getuid()or st.st_size>8388608:raise ValueError('mirror_conflict')
        old=json.loads(target.read_bytes())
        if any(old.get(k)!=record[k]for k in ['version','stage','sender','recipient','operation_id','body','body_sha256']):raise ValueError('mirror_conflict')
        print('source owner copy already retained: '+str(target));return
    temporary=directory/('.owner-copy-'+secrets.token_hex(12))
    encoded=(json.dumps(record,ensure_ascii=False)+'\n').encode()
    if len(encoded)>8388608:raise ValueError('mirror_record_too_large')
    try:
        fd=os.open(temporary,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600)
        with os.fdopen(fd,'wb')as stream:
            stream.write(encoded);stream.flush();os.fsync(stream.fileno())
        os.link(temporary,target,follow_symlinks=False)
        fd=os.open(directory,os.O_RDONLY|os.O_DIRECTORY)
        try:os.fsync(fd)
        finally:os.close(fd)
    finally:
        try:temporary.unlink()
        except FileNotFoundError:pass
    print('source owner copy retained: '+str(target))

if __name__=='__main__':
    try:
        if len(sys.argv)!=3:raise ValueError('mirror_arguments_invalid')
        publish(*sys.argv[1:])
    except Exception as error:
        reason=str(error)if isinstance(error,ValueError)else type(error).__name__
        print('source owner copy unconfirmed: '+reason,file=sys.stderr);sys.exit(4)
