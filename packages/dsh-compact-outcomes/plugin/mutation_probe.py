"""Three evidence states; never calls production outbox or APIs."""
import copy,json,hashlib
from observer import classify
from test_observer import own
saved=[{'istochnik':'s#1','soderzhim':'Сводка 😀','id':8}]
good=own();bad=copy.deepcopy(good);bad[3]['data']['content'][0]['text']='ПОДМЕНА 😀'
def digest(x):return hashlib.sha256(json.dumps(x,ensure_ascii=False,sort_keys=True).encode()).hexdigest()
assert digest(good)!=digest(bad)
assert sum(e.get('data',{}).get('content',[{}])[0].get('text')=='ПОДМЕНА 😀' for e in bad if isinstance(e.get('data',{}).get('content'),list))==1
print('MUTATION replacements=1 before='+digest(good)+' after='+digest(bad))
for name,ds,want in [('healthy',good,'ours'),('corrupt',bad,'unknown'),('restored',good,'ours')]:
 r=classify('s',ds,{},saved,0,1000);row=r['events'][0];assert row['category']==want
 print(name,row['category'],row['reason'])
