"""Sectional/pace/jockey signals must be causal and honestly unavailable."""
import copy, importlib.util, math
spec=importlib.util.spec_from_file_location('features','scripts/prepare-weighted-v3.py')
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
def race(date):
    return dict(date=date,venue='seoul',race_no=1,distance=1200,grade='국5등급',place_k=3,
        horses=[dict(number=i,name=str(i),age=4,sex='수',finish=i,rating=30,burden=54,
                     jockey='new' if i==1 else 'old',trainer='t',race_seconds=73+i,
                     early_seconds=13+i/10,last_seconds=12+i/10,early_position=i) for i in range(1,7)])
r=race('20220301');h=m.History()
assert len(m.ACTIVE)==21 and len(m.FEATURES)==26
assert all(h.features(r)['1']['raw'][i] is None for i in range(22,26))
h.sections[(1200,'early')]=[14.0]*20
past=race('20220201');past['horses'][0]['jockey']='old';h.add_day([past])
assert math.isclose(h.horses[m.key(past,past['horses'][0])][-1]['early_speed'],.9)
assert math.isclose(h.horses[m.key(past,past['horses'][0])][-1]['late_kick'],.5)
# Jockey contrast uses observations available before today, with minimum samples.
h.people[('seoul','jockey','new')]=[dict(day=m.day('20220201'),residual=.4)]*20
h.people[('seoul','jockey','old')]=[dict(day=m.day('20220201'),residual=-.2)]*20
a=h.features(r)['1'];assert a['raw'][22]>0 and a['raw'][23]>0 and a['raw'][25]>0
for horse in r['horses']:h.horses[m.key(r,horse)][-1]['front']=horse['number']==1
assert h.features(r)['1']['raw'][24]==1
for horse in r['horses']:h.horses[m.key(r,horse)][-1]['front']=horse['number']<=3
assert h.features(r)['1']['raw'][24]==-1
h.horses[m.key(r,r['horses'][3])][-1]['late_kick']=.5
assert h.features(r)['4']['raw'][24]>0
# Changing current results, sectionals and passage positions cannot change inputs.
before=h.features(r);changed=copy.deepcopy(r)
for horse in changed['horses']:
    horse.update(finish=1,early_seconds=8,last_seconds=8,early_position=1,race_seconds=60)
assert before==h.features(changed)
# Same-day additions are excluded even if the feature calculation is repeated.
h.add_day([r]);assert before==h.features(r)
for horse in r['horses'][:2]:
    for x in h.horses[m.key(r,horse)]:x['front']=None
assert h.features(r)['3']['raw'][24] is None
h.people[('seoul','jockey','new')]=h.people[('seoul','jockey','new')][:19]
assert h.features(r)['1']['raw'][25] is None
# Same-day sectional references must be built from preceding dates only.
fresh=m.History();many=[race('20220101') for _ in range(4)];fresh.add_day(many)
assert all(x['early_speed'] is None for xs in fresh.horses.values() for x in xs)
print('PASS sectionals, lone/contested pace, missing styles, jockey minimums, and current/same-day outcome isolation')
