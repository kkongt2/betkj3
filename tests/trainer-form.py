"""Trainer trend windows and the source/evaluation boundary must be past-only."""
import importlib.util,copy,math
spec=importlib.util.spec_from_file_location('features','scripts/prepare-weighted-v3.py')
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
r={'date':'20230101','venue':'seoul','race_no':1,'distance':1200,'horses':[{'number':1,'name':'A','age':4,'trainer':'T'}]}
d=m.day(r['date']);pool=('seoul','trainer','T')
def history(recent=20,baseline=50):
    h=m.History()
    h.people[pool]=[{'day':d-365+i,'residual':-.1} for i in range(baseline)]+[{'day':d-90+i,'residual':.2} for i in range(recent)]
    return h
h=history();f=h.features(r)['1']
assert len(m.FEATURES)==22 and m.FEATURES[21]=='trainer_form'
assert f['available'][21] and math.isclose(f['raw'][21],4/50+5/80)
assert f['detail']['trainerForm']['recentStarts']==20
assert f['detail']['trainerForm']['baselineStarts']==50
assert f['detail']['counts'][21]==70
for a,b in [(19,50),(20,49),(0,0)]:
    x=history(a,b).features(r)['1'];assert not x['available'][21] and x['raw'][21] is None
for e in h.people[pool]:e['residual']=-e['residual']
assert h.features(r)['1']['raw'][21]<0
h=history();before=h.features(r)
# Same-day, future, and more-than-one-year-old records cannot change the score.
h.people[pool]+=[{'day':date,'residual':999} for date in [d,d+1,d-366]]
assert h.features(r)==before
changed=copy.deepcopy(r);changed['horses'][0]['finish']=1
changed['official_result']={'pair':{'payouts':[{'numbers':[1,2],'odds':999}]}}
assert h.features(changed)==before
# 2021 is excluded before *any* horse, person or time history is updated.
old=copy.deepcopy(r);old['date']='20211231'
empty=m.History();empty.add_day([old])
assert not empty.horses and not empty.people and not empty.times and empty.through==''
assert m.SOURCE_FROM=='20220101' and m.EVALUATION_FROM=='20230101' and m.FIT_TO=='20221231'
print('PASS trainer trend sign, exact 90/275-day windows, 20/50 minimums, outcome isolation and 2021 source exclusion')
