"""Reproducible, offline, chronological ML experiment; does not modify site models.
Inputs: official source reports + site's payout archive. Payout amounts are evaluation
only. Horse/pair classifiers and the selector learn binary outcomes, not odds.
"""
import os
os.environ.setdefault('OPENBLAS_NUM_THREADS','1')
import argparse, gzip, importlib.util, itertools, json, math, sys, time, hashlib
from pathlib import Path
from collections import defaultdict
import numpy as np
from catboost import CatBoostClassifier
from sklearn.metrics import log_loss, brier_score_loss
ROOT=Path(__file__).resolve().parent.parent
spec=importlib.util.spec_from_file_location('previous_features',ROOT/'scripts/prepare-weighted-v3.py')
F=importlib.util.module_from_spec(spec);spec.loader.exec_module(F)

def read_gz(path):
 with gzip.open(path,'rt') as stream:return [json.loads(line) for line in stream]
def racekey(r):return (r['date'],r.get('race_no',r.get('race')))
def numeric(v):
 try:return float(v) if v is not None else np.nan
 except (ValueError,TypeError):return np.nan
def slope(values):
 if len(values)<2:return np.nan
 x=np.arange(len(values));return float(np.polyfit(x,values,1)[0])
def summarize(values):
 v=[float(x) for x in values if x is not None and np.isfinite(x)]
 return [np.mean(v),slope(v),np.std(v),v[-1]] if v else [np.nan]*4

def prepare(source_path,out):
 manifest=json.loads((ROOT/'qpl-history.json').read_text());archive=[r for s in manifest['shards'] for r in json.loads((ROOT/s['url']).read_text())['rows'] if r['venue']=='seoul' and r['date']>='20220101'];lookup={racekey(r):r for r in archive}
 source={racekey(r):r for r in read_gz(source_path) if r['venue']=='seoul'}
 for r in read_gz(ROOT/'history/weighted-source.jsonl.gz'):
  if r['venue']=='seoul':source[racekey(r)]=r
 missing=[list(k) for k in lookup if k not in source]
 metadata=F.read_targets() if missing else {}
 for date,race in missing:
  r=metadata.get((date,'seoul',race))
  if r is None:raise ValueError(f'Missing entry metadata: {date} {race}')
  source[date,race]=r
 print('Detailed outcomes absent; entry metadata retained:',len(missing),flush=True)
 byday=defaultdict(list)
 for r in source.values():byday[r['date']].append(r)
 history=F.History();extra=defaultdict(list);X=[];Y=[];dates=[];race_ids=[];numbers=[];race_info=[];feature_names=None;started=time.time()
 for day in sorted(byday):
  races=sorted(byday[day],key=lambda r:r['race_no'])
  for r in races:
   key=racekey(r)
   if key not in lookup:continue
   ar=lookup[key]
   if not ar['settled']:continue
   snapshots=history.features(r);hs=sorted([h for h in r['horses'] if ar['starters'] is None or h['number'] in ar['starters']],key=lambda h:h['number']);n=len(hs)
   # Labels follow official pair settlement, including the third finisher in small fields.
   winning={tuple(sorted(p['numbers'])):p['odds'] for p in ar['payouts']};top3={v for pair in winning for v in pair}
   rid=len(race_info);rnums=[h['number'] for h in hs];start=len(X);rows=[]
   for h in hs:
    s=snapshots[str(h['number'])];identity=F.key(r,h);past=history.horses[identity][-5:];early=extra[identity][-5:];d=F.day(day)
    assert all(v['day']<d for v in past+early)
    names=['raw_'+f for f in F.FEATURES];values=[numeric(v) if s['available'][i] else np.nan for i,v in enumerate(s['raw'])]
    names += ['available_'+f for f in F.FEATURES];values += [int(v) for v in s['available']]
    for name in ['starts','distanceStarts','recordStarts','marginStarts']:
     names.append(name);values.append(s[name])
    now={'age':h.get('age'),'sex_code':{'암':0,'수':1,'거':2}.get(h.get('sex')),'rating_absolute':h.get('rating'),'burden_absolute':h.get('burden'),'body_absolute':h.get('horse_weight'),'body_change':h.get('horse_weight_change'),'number_position':h['number']/max(rnums),'field_size':n,'distance':r['distance'],'grade':F.grade(r.get('grade')),'rest_days':d-past[-1]['day'] if past else None,'distance_change':r['distance']-past[-1]['distance'] if past else None,'grade_change':F.grade(r.get('grade'))-past[-1]['grade'] if past and F.grade(r.get('grade')) and past[-1].get('grade') else None,'weight_change':h.get('burden')-past[-1]['burden'] if past and h.get('burden') and past[-1].get('burden') else None}
    names+=list(now);values += [numeric(v) for v in now.values()]
    for name in ['form','speed','margin']:
     names += [name+'_'+stat for stat in ['mean5','slope5','std5','last']];values+=summarize([p.get(name) for p in past])
    for name in ['early_form','late_form','early_seconds','last_seconds']:
     names += [name+'_'+stat for stat in ['mean5','slope5','std5','last']];values+=summarize([p.get(name) for p in early])
    rows.append(values)
   raw=np.array(rows,float)
   # Race-relative competition features, calculated using only the current entry field.
   indices=[0,2,3,4,5,6,10,11,12,13,14,16]
   with np.errstate(all='ignore'):
    import warnings
    with warnings.catch_warnings():
     warnings.simplefilter('ignore',RuntimeWarning);mean=np.nanmean(raw[:,indices],axis=0)
   enriched=np.column_stack([raw,raw[:,indices]-mean])
   names += ['field_difference_'+F.FEATURES[i] for i in indices]
   if feature_names is None:feature_names=names
   assert names==feature_names
   X.extend(enriched);Y.extend([int(h['number'] in top3) for h in hs]);dates.extend([int(day)]*n);race_ids.extend([rid]*n);numbers.extend(rnums)
   race_info.append({'date':day,'race':r['race_no'],'start':start,'end':len(X),'numbers':rnums,'payouts':[{'numbers':list(pair),'odds':odds} for pair,odds in winning.items()]})
  # All same-day predictions are constructed before any outcomes enter history.
  complete=[r for r in races if all('finish' in h for h in r['horses'])]
  history.add_day(complete)
  for r in complete:
   n=len(r['horses'])
   for h in r['horses']:
    extra[F.key(r,h)].append({'day':F.day(day),'early_form':(n-h['early_position'])/max(1,n-1) if h.get('early_position') else None,'late_form':(n-h['last_position'])/max(1,n-1) if h.get('last_position') else None,'early_seconds':h.get('early_seconds'),'last_seconds':h.get('last_seconds')})
  if day.endswith(('0101','1231')):print('features',day,len(race_info),round(time.time()-started,1),flush=True)
 np.savez_compressed(out/'features.npz',X=np.array(X,dtype=np.float32),y=np.array(Y,dtype=np.int8),dates=np.array(dates),race_ids=np.array(race_ids),numbers=np.array(numbers))
 doc={'feature_names':feature_names,'races':race_info,'manifest':manifest,'source_sha256':hashlib.sha256(Path(source_path).read_bytes()).hexdigest(),'detail_missing':missing,'site_head':None,'feature_rule':'prior days only; last five starts; raw features without global scaler; binary top-three labels; no payout amount inputs'}
 (out/'dataset.json').write_text(json.dumps(doc,ensure_ascii=False))
 print('PREPARED',len(race_info),'races',len(X),'horses',len(feature_names),'features',round(time.time()-started,1),flush=True)

if __name__=='__main__':
 parser=argparse.ArgumentParser();parser.add_argument('--source',type=Path,required=True);parser.add_argument('--out',type=Path,required=True);args=parser.parse_args();args.out.mkdir(parents=True,exist_ok=True);prepare(args.source,args.out)
