"""Private inputs for legacy-window probes; no live registry authority."""
import copy,json,yaml

def relocate_registry(original, command):
    text=original.decode()
    document=yaml.safe_load(text);tree=yaml.compose(text)
    matches=[]
    for _,group in tree.value:
        if not isinstance(group,yaml.SequenceNode):continue
        for entry in group.value:
            if not isinstance(entry,yaml.MappingNode):continue
            fields={k.value:v for k,v in entry.value}
            if fields.get('id') is not None and fields['id'].value=='dsh-autopilot':
                matches.append(fields.get('installed_check'))
    assert len(matches)==1 and isinstance(matches[0],yaml.ScalarNode),'installed_check: expected exactly one scalar'
    node=matches[0]
    suffix='\n' if node.style in ('|','>') else ''
    replacement=json.dumps(command,ensure_ascii=False)+suffix
    changed=text[:node.start_mark.index]+replacement+text[node.end_mark.index:]
    expected=copy.deepcopy(document)
    entry=next(e for group in expected.values() if isinstance(group,list) for e in group if isinstance(e,dict) and e.get('id')=='dsh-autopilot')
    entry['installed_check']=command
    assert changed!=text and yaml.safe_load(changed)==expected,'installed_check: replacement not applied exactly once'
    return changed.encode()

def seed_layout(package, root):
    """Build current014 from the tested package and retained releases from fixed pins."""
    from pathlib import Path
    import hashlib,importlib.util
    spec=importlib.util.spec_from_file_location('window_fixture_installer',package/'lib/install.py')
    installer=importlib.util.module_from_spec(spec);spec.loader.exec_module(installer)
    lock,raw=installer.source();expected,managed=installer.layout(root,lock,raw)
    rows=[];contents={}
    for path,(kind,mode,data) in expected.items():
        path='/'+path.relative_to(root).as_posix()
        row=dict(path=path,kind=kind,mode=mode,uid=0,gid=0)
        if kind=='file':
            row['sha256']=hashlib.sha256(data).hexdigest();contents[path]=data
        elif kind=='link':row['target']=data
        rows.append(row)
    retained=json.loads((package/'test/fixtures/legacy-window-layout.json').read_text())
    rows.extend(retained['rows'])
    checker='/usr/local/libexec/dsh-autopilot/layout-check.py';contents[checker]=(package/'checks/layout-check.py').read_bytes()
    rows.append(dict(path=checker,kind='file',mode=0o755,uid=0,gid=0,sha256=hashlib.sha256(contents[checker]).hexdigest()))
    manifest=dict(version='0.1.14',rows=rows,managed=['/'+p.relative_to(root).as_posix() for p in managed]+retained['managed'],public=dict(operator='master',group='autopilot-view'))
    return manifest,contents,managed[1].name
