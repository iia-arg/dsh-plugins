#!/usr/bin/env python3
"""Bounded AST comparison of the AP and receiver deadline limits; no input exec."""
import argparse
import ast
from pathlib import Path

class LimitError(ValueError):pass

def missing(path,why):
    raise LimitError(f'{path}: предел не найден ({why})')

def tree(path):
    try:
        path=Path(path)
        if path.stat().st_size>262144:missing(path,'исходник больше 262144 байт')
        return ast.parse(path.read_bytes(),filename=str(path))
    except (OSError,SyntaxError,ValueError,RecursionError) as error:
        if isinstance(error,LimitError):raise
        missing(path,type(error).__name__)

def declarations(parsed,name):
    values=[]
    for n in parsed.body:
        if isinstance(n,ast.Assign) and any(isinstance(t,ast.Name) and t.id==name for t in n.targets):values.append(n.value)
        elif isinstance(n,(ast.AnnAssign,ast.AugAssign)) and isinstance(n.target,ast.Name) and n.target.id==name:values.append(n.value if isinstance(n,ast.AnnAssign) else None)
    writes=sum(isinstance(n,ast.Name) and n.id==name and isinstance(n.ctx,ast.Store) for n in ast.walk(parsed))
    if writes!=len(values):return []
    return values

def linked(parsed,path):
    # Narrow static codec for the pinned AP loader. Unknown loaders are refused,
    # never executed or approximated by a neighbouring constant file.
    expressions={
        '_limits_here':"Path(__file__).resolve().parent",
        '_limits_path':"_limits_here / 'task_limits.py'",
        '_limits_spec':"_limits_import.spec_from_file_location('_ap_task_limits', _limits_path)",
        '_task_limits':"_limits_import.module_from_spec(_limits_spec)",
    }
    if Path(path).resolve().parent!=Path(path).absolute().parent:missing(path,'не physical AP/post pilot')
    reserved=set(expressions)|{'TASK_DEADLINE_MAX','_limits_import','Path','__file__'}
    for node in ast.walk(parsed):
        if isinstance(node,ast.arg) and node.arg in reserved:missing(path,'параметр затеняет '+node.arg)
        if isinstance(node,(ast.Import,ast.ImportFrom)):
            for alias in node.names:
                target=alias.asname or alias.name.split('.')[0]
                if target in reserved and not (node in parsed.body and (isinstance(node,ast.Import) and alias.name=='importlib.util' and alias.asname=='_limits_import' or isinstance(node,ast.ImportFrom) and node.level==0 and node.module=='pathlib' and alias.name=='Path' and alias.asname in (None,'Path'))):missing(path,'импорт затеняет '+target)
        if isinstance(node,ast.ExceptHandler) and node.name in reserved:missing(path,'except затеняет '+node.name)
        if isinstance(node,ast.Name) and node.id in {'_limits_import','Path','__file__'} and isinstance(node.ctx,ast.Store):missing(path,'перезапись importlib loader')
        if isinstance(node,ast.Name) and node.id in reserved and isinstance(node.ctx,ast.Del):missing(path,'удаление имени loader')
        if isinstance(node,ast.Attribute) and isinstance(node.ctx,(ast.Store,ast.Del)) and any(isinstance(n,ast.Name) and n.id in reserved for n in ast.walk(node.value)):missing(path,'запись в атрибут loader/константы')
        if isinstance(node,(ast.FunctionDef,ast.ClassDef,ast.AsyncFunctionDef)) and node.name in reserved:missing(path,'переопределение имени loader')
        if isinstance(node,ast.Global) and set(node.names)&reserved:missing(path,'global-запись в loader')
    paths=[a for n in parsed.body if isinstance(n,ast.ImportFrom) and n.module=='pathlib' and n.level==0 for a in n.names if a.name=='Path' and a.asname in (None,'Path')]
    if len(paths)!=1:missing(path,'Path не закреплён на pathlib')
    aliases=[a for n in parsed.body if isinstance(n,ast.Import) for a in n.names if a.asname=='_limits_import']
    if len(aliases)!=1 or aliases[0].name!='importlib.util':missing(path,'importlib loader не закреплён')
    for name,expression in expressions.items():
        values=declarations(parsed,name)
        if len(values)!=1 or ast.dump(values[0])!=ast.dump(ast.parse(expression,mode='eval').body):missing(path,'неразрешённый источник '+name)
    calls=[n for n in parsed.body if isinstance(n,ast.Expr) and ast.dump(n.value)==ast.dump(ast.parse('_limits_spec.loader.exec_module(_task_limits)',mode='eval').body)]
    if len(calls)!=1:missing(path,'нет загрузки закреплённого AP-модуля')

def constant(path):
    values=declarations(tree(path),'TASK_DEADLINE_MAX')
    if len(values)!=1 or not isinstance(values[0],ast.Constant) or type(values[0].value) is not int or values[0].value<=0:
        missing(path,'ожидалось одно положительное int-объявление TASK_DEADLINE_MAX')
    return values[0].value

def clock(node):
    return (isinstance(node,ast.Call) and not node.args and not node.keywords and
            isinstance(node.func,ast.Attribute) and node.func.attr=='clock' and
            isinstance(node.func.value,ast.Name) and node.func.value.id=='self')

def deadline(node):
    return (isinstance(node,ast.Subscript) and isinstance(node.value,ast.Name) and
            node.value.id=='task' and isinstance(node.slice,ast.Constant) and node.slice.value=='deadline')

def bound(path,expected):
    parsed=tree(path);classes=[n for n in parsed.body if isinstance(n,ast.ClassDef) and n.name in {'Postman','Ledger'}]
    methods=[n for c in classes for n in c.body if isinstance(n,ast.FunctionDef) and n.name=='validate']
    found=[]
    for method in methods:
        for node in ast.walk(method):
            if not isinstance(node,ast.Compare):continue
            if len(node.ops)!=2 or not isinstance(node.ops[0],ast.Lt) or not isinstance(node.ops[1],ast.LtE):continue
            if not clock(node.left) or not deadline(node.comparators[0]):continue
            rhs=node.comparators[1]
            if not isinstance(rhs,ast.BinOp) or not isinstance(rhs.op,ast.Add) or not clock(rhs.left):missing(path,'форма верхней границы')
            value=rhs.right
            if isinstance(value,ast.Constant) and type(value.value) is int:found.append(value.value)
            elif isinstance(value,ast.Name) and value.id=='TASK_DEADLINE_MAX':
                links=declarations(parsed,'TASK_DEADLINE_MAX')
                if len(links)!=1 or not isinstance(links[0],ast.Attribute) or links[0].attr!='TASK_DEADLINE_MAX' or not isinstance(links[0].value,ast.Name) or links[0].value.id!='_task_limits':missing(path,'неразрешённая ссылка TASK_DEADLINE_MAX')
                linked(parsed,path)
                found.append(constant(Path(path).with_name('task_limits.py')))
            else:missing(path,'верхняя граница не литерал/именованная AP-константа')
    if len(methods)!=1 or len(found)!=1:missing(path,'ожидалась одна верхняя граница Postman.validate')
    return found[0]

def check(ap,post,limits):
    expected=constant(limits)
    for path in (ap,post):
        value=bound(path,expected)
        if value!=expected:raise LimitError(f'{path}: предел {value} != TASK_DEADLINE_MAX {expected}')
    return dict(limit=expected,ap=str(ap),post=str(post),constant=str(limits))

def installed_post(command=Path('/usr/local/bin/autopilot-mail')):
    command=Path(command)
    try:
        physical=command.resolve(strict=True)
        if physical.name!='autopilot-mail' or physical.parent.name!='bin' or physical.parents[2].name!='post':missing(command,'не versioned post/<version>/bin')
        return physical.parent.parent/'pilot/pilot_mail.py'
    except OSError as error:missing(command,type(error).__name__)

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--ap',type=Path,required=True)
    parser.add_argument('--limits',type=Path,required=True)
    parser.add_argument('--post',type=Path)
    args=parser.parse_args()
    try:
        value=check(args.ap,args.post if args.post is not None else installed_post(),args.limits)
        print('deadline OK '+str(value['limit'])+' '+value['post']);return 0
    except LimitError as error:print(str(error));return 1

if __name__=='__main__':raise SystemExit(main())
