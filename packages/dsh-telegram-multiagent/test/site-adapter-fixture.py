# RU: Поднимает настоящий код тестового адаптера с временными папками, БД и приёмником HTTP; боевых секретов или отправки нет.
# EN: Loads the real test adapter using temporary folders, a database, and a synthetic HTTP sink; no production secrets or delivery.
                                                                                     
import os,sys,runpy,json,time
subject,root,action=sys.argv[1:]
os.environ.update(SAJT_STEND='1',SAJT_SPOOL=root,SAJT_STATE=root+'/state/zakryto',SAJT_DB=root+'/adapter/db',SAJT_ALERT='/bin/true')
m=runpy.run_path(subject);g=m['kopiya'].__globals__;g['B']=m['Baza'](root+'/adapter/db');posts=[];g['chatwoot_post']=lambda conv,text:posts.append({'conversation':conv,'text':text})
if action=='emit':
 m['reshit'](11,{'id':101,'content':'visitor normal'},'cw-11-101')  # id конверта — форма адаптера cw-<conv>-<mid> (sajt-chat 1.0.6, B-N-1913)
 m['kopiya'](12,'operator','human','operator response','delivery-operator')
 m['kopiya'](13,'avtootvet','auto','auto response','delivery-auto')
 m['kopiya'](14,'otsecheno','length','😀'*9000,'delivery-long')
 for i in range(7):m['kopiya'](15,'otsecheno','closed','extra '+str(i),'extra-'+str(i))
 m['svodka_okna']('conv:15')
elif action=='consume':m['otpravit_otvety']()
open(root+'/adapter-posts.json','w').write(json.dumps(posts))
