import importlib.util,copy
s=importlib.util.spec_from_file_location('features','scripts/prepare-weighted-v2.py');m=importlib.util.module_from_spec(s);s.loader.exec_module(m)
def race(date,finish=(1,2,3,4,5,6,7,8)):
 return {'date':date,'venue':'seoul','race_no':1,'distance':1200,'grade':'국4등급','place_k':3,'place_winners':[1,2,3],
 'horses':[{'number':i+1,'name':str(i+1),'age':4,'sex':'수','rating':50-i,'burden':55,'jockey':'J'+str(i),'trainer':'T'+str(i),'horse_weight':460,'finish':f,'race_seconds':73+i*.4} for i,f in enumerate(finish)]}
h=m.History();r=race('20220101');before=h.features(r);changed=copy.deepcopy(r);changed['horses'][0]['finish']=8;changed['horses'][0]['race_seconds']=99
assert h.features(changed)==before
h.add_day([r]);assert h.features(r)==before
later=race('20220201');f=h.features(later);assert f['1']['through']=='20220101'
heavy=copy.deepcopy(later);heavy['horses'][0]['burden']=57
assert h.features(heavy)['1']['raw'][7]<f['1']['raw'][7]
assert m.clip((16-8)/15,0,1)>m.clip((8-8)/7,0,1)
r2=copy.deepcopy(r);r2['horses'][0]['age']=9;assert m.key(r,r['horses'][0])!=m.key(r2,r2['horses'][0])
assert len(f['1']['raw'])==13 and f['1']['raw'][11] is not None
print('PASS outcome isolation, strict past date, corrected burden, relative finish, identity and 13 feature schema')
