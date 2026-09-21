"""Annual outer tests, earlier half-year model selection, and truly earlier OOT
predictions for the race selector. Payout amounts never enter classifier features.
"""
import os
os.environ.setdefault('OPENBLAS_NUM_THREADS','1')
import argparse,itertools,json,time,hashlib
from pathlib import Path
import numpy as np
from catboost import CatBoostClassifier
from sklearn.metrics import log_loss,brier_score_loss
from sklearn.pipeline import make_pipeline
from sklearn.impute import SimpleImputer
from sklearn.preprocessing import StandardScaler
from sklearn.linear_model import LogisticRegression

YEARS=[2023,2024,2025,2026]
def stats(records,total=None):
 n=len(records);hits=sum(r['hit'] for r in records);paid=sum(r['payout'] for r in records);total=n if total is None else total
 return {'total':total,'evaluated':n,'hits':hits,'payoutTotal':paid,'coverage':n/total if total else None,'rate':hits/n if n else None,'average':paid/hits if hits else None,'product':paid/n if n else None}
def classifier(depth):return CatBoostClassifier(iterations=350,depth=depth,learning_rate=.04,l2_leaf_reg=15,random_seed=1307,loss_function='Logloss',thread_count=3,allow_writing_files=False,verbose=False)
def fit_model(X,y,dates,weights,year,label,out):
 cutoff=year*10000+101;validation=(year-1)*10000+701;train=dates<validation;val=(dates>=validation)&(dates<cutoff);best=None
 assert train.sum() and val.sum() and dates[train].max()<dates[val].min()
 for depth in (3,4):
  model=classifier(depth);model.fit(X[train],y[train],sample_weight=weights[train],eval_set=(X[val],y[val]),early_stopping_rounds=30)
  loss=log_loss(y[val],model.predict_proba(X[val])[:,1],sample_weight=weights[val]);it=model.tree_count_
  if best is None or loss<best[0]:best=(loss,depth,it)
 use=dates<cutoff;model=classifier(best[1]);model.set_params(iterations=best[2]);model.fit(X[use],y[use],sample_weight=weights[use]);model.save_model(str(out/f'{label}-{year}.cbm'))
 info={'depth':best[1],'trees':best[2],'validation_logloss':best[0],'train_through':int(dates[use].max()),'validation_from':validation,'selection_metric':'binary log loss, not payout'}
 print('FIT',label,year,info,flush=True);return model,info

def load(folder):
 a=np.load(folder/'features.npz');doc=json.loads((folder/'dataset.json').read_text());return a,doc

def horse_stage(folder):
 a,doc=load(folder);X,y,dates,rids=a['X'],a['y'],a['dates'],a['race_ids'];counts=np.bincount(rids);weights=1/counts[rids];pred={k:np.full(len(y),np.nan) for k in ['linear','core','full']};models={}
 for year in YEARS:
  test=(dates>=year*10000+101)&(dates<(year+1)*10000+101);train=dates<year*10000+101
  baseline=make_pipeline(SimpleImputer(add_indicator=True,keep_empty_features=True),StandardScaler(),LogisticRegression(C=1,max_iter=700))
  baseline.fit(X[train],y[train],logisticregression__sample_weight=weights[train]);pred['linear'][test]=baseline.predict_proba(X[test])[:,1]
  for variant,xx in [('core',X[:,:38]),('full',X)]:
   model,info=fit_model(xx,y,dates,weights,year,variant,folder);pred[variant][test]=model.predict_proba(xx[test])[:,1];models[f'{variant}-{year}']=info
 np.savez_compressed(folder/'horse-predictions.npz',**pred);(folder/'horse-models.json').write_text(json.dumps(models,indent=2));print('HORSE DONE',flush=True)

def pair_stage(folder):
 a,doc=load(folder);X=a['X'];numbers=a['numbers'];left=[];right=[];ys=[];rids=[];pdates=[];weights=[]
 for rid,r in enumerate(doc['races']):
  pairs=list(itertools.combinations(range(r['start'],r['end']),2));win={tuple(p['numbers']) for p in r['payouts']}
  for i,j in pairs:
   left.append(i);right.append(j);ys.append(int((int(numbers[i]),int(numbers[j])) in win));rids.append(rid);pdates.append(int(r['date']));weights.append(1/len(pairs))
 left=np.array(left);right=np.array(right);ys=np.array(ys);pdates=np.array(pdates);weights=np.array(weights);rids=np.array(rids)
 # Symmetric representation: swapping the two horses changes neither feature nor label.
 XP=np.column_stack([(X[left]+X[right])/2,np.abs(X[left]-X[right])]);pred=np.full(len(ys),np.nan);models={}
 print('PAIR DATA',XP.shape,flush=True)
 for year in YEARS:
  test=(pdates>=year*10000+101)&(pdates<(year+1)*10000+101)
  model,info=fit_model(XP,ys,pdates,weights,year,'pair',folder);pred[test]=model.predict_proba(XP[test])[:,1];models[str(year)]=info
 np.savez_compressed(folder/'pair-predictions.npz',left=left,right=right,y=ys,race_ids=rids,dates=pdates,pred=pred);(folder/'pair-models.json').write_text(json.dumps(models,indent=2));print('PAIR DONE',flush=True)

def collect_records(folder):
 a,doc=load(folder);hp=np.load(folder/'horse-predictions.npz');pp=dict(np.load(folder/'pair-predictions.npz'));hp=dict(hp);numbers=a['numbers'];X=a['X'];names=doc['feature_names'];records={k:[] for k in ['linear','core','full','pair']};offsets=np.r_[0,np.cumsum(np.bincount(pp['race_ids'],minlength=len(doc['races'])))];aux={k:names.index(k) for k in ['field_size','distance','grade','starts']}
 for rid,r in enumerate(doc['races']):
  if r['date']<'20230101':continue
  ids=np.arange(r['start'],r['end']);n=len(ids);win={tuple(p['numbers']):p['odds'] for p in r['payouts']};coreorder=ids[np.argsort(-hp['core'][ids],kind='stable')];fullorder=ids[np.argsort(-hp['full'][ids],kind='stable')];pairrows=np.arange(offsets[rid],offsets[rid+1]);pool={tuple(sorted((int(pp['left'][k]),int(pp['right'][k])))):float(pp['pred'][k]) for k in pairrows}
  for variant in records:
   if variant=='pair':
    # Keep the new horse model's rank-one anchor; only rank 2..10 partners compete.
    anchor=fullorder[0];partners=fullorder[1:10];partner=max(partners,key=lambda j:(pool[tuple(sorted((int(anchor),int(j))))],hp['full'][j],-numbers[j]));chosen=[anchor,partner];score=pool[tuple(sorted(map(int,chosen)))];order=fullorder;prob=hp['full']
    cands=sorted([pool[tuple(sorted((int(anchor),int(j))))] for j in partners],reverse=True)
   else:
    prob=hp[variant];order=ids[np.argsort(-prob[ids],kind='stable')];chosen=order[:2];score=float(prob[chosen[0]]*prob[chosen[1]]);cands=sorted([float(prob[order[0]]*prob[j]) for j in order[1:10]],reverse=True)
   nums=tuple(sorted(int(numbers[j]) for j in chosen));payout=float(win.get(nums,0));chosen=np.array(chosen)
   features=[score,cands[1] if len(cands)>1 else score,score-(cands[1] if len(cands)>1 else score),float(prob[chosen[0]]),float(prob[chosen[1]]),float(prob[order[2]]),float(np.std(prob[ids])),n,float(X[ids[0],aux['distance']]),float(X[ids[0],aux['grade']]),float(np.mean(X[chosen,aux['starts']])),float(np.isnan(X[chosen,:17]).mean()),int(set(chosen)!=set(fullorder[:2])),float(hp['core'][chosen[0]]*hp['core'][chosen[1]]),int(set(chosen)==set(coreorder[:2]))]
   records[variant].append({'date':r['date'],'race':r['race'],'numbers':list(nums),'hit':int(payout>0),'payout':payout,'score':score,'features':features})
 return records

def select_stage(folder):
 records=collect_records(folder);selection_members={};out={'protocol':{'outer_years':[2024,2025,2026],'label':'official pair top-three membership','payout_inputs':False,'selection_training':'earlier out-of-time predictions only','pair_anchor':'full horse model rank 1; partners ranks 2..10','targets':[40,60,80],'feature_info':json.loads((folder/'dataset.json').read_text())['feature_rule']},'all':{},'selected':{},'fold_models':{}}
 for variant,rs in records.items():
  tested=[r for r in rs if r['date']>='20240101'];out['all'][variant]={'overall':stats(tested),'years':{str(y):stats([r for r in tested if r['date'].startswith(str(y))]) for y in (2024,2025,2026)}}
 for variant in ['full','pair']:
  rs=records[variant];dates=np.array([int(r['date']) for r in rs]);XX=np.array([r['features'] for r in rs]);y=np.array([r['hit'] for r in rs]);selected={t:[] for t in (40,60,80)};folds={t:[] for t in selected}
  for year in (2024,2025,2026):
   cutoff=year*10000+101;validation=(year-1)*10000+701;train=dates<validation;val=(dates>=validation)&(dates<cutoff);test=(dates>=cutoff)&(dates<(year+1)*10000+101)
   assert dates[train].max()<dates[val].min()<dates[test].min()
   # Small, strongly regularized classifier fitted to genuine previous forecasts.
   selector=make_pipeline(SimpleImputer(add_indicator=True,keep_empty_features=True),StandardScaler(),LogisticRegression(C=.05,max_iter=700));selector.fit(XX[train],y[train]);vp=selector.predict_proba(XX[val])[:,1];tp=selector.predict_proba(XX[test])[:,1]
   vi=np.flatnonzero(val);ti=np.flatnonzero(test);basev=XX[val,0];baset=XX[test,0]
   # Three predeclared rankings; choice and thresholds use earlier validation only.
   vs=[vp,vp-basev,basev];ts=[tp,tp-baset,baset];mode_names=['predicted_hit','prediction_residual','base_confidence']
   for target in selected:
    candidates=[]
    for mode in range(3):
     threshold=float(np.sort(vs[mode])[::-1][max(0,int(np.ceil(len(vi)*target/100))-1)]);chosen=[rs[i] for i,s in zip(vi,vs[mode]) if s>=threshold];g=stats(chosen,len(vi));candidates.append((g['product'],mode,threshold,g))
    _,mode,threshold,training=max(candidates,key=lambda q:(q[0],-q[1]));kept=[rs[i] for i,s in zip(ti,ts[mode]) if s>=threshold];selected[target]+=kept;folds[target].append({'year':year,'mode':mode_names[mode],'threshold':threshold,'selector_train_through':int(dates[train].max()),'threshold_train_through':int(dates[val].max()),'prior_validation':training,'test':stats(kept,len(ti))})
  total=sum(r['date']>='20240101' for r in rs)
  for target,kept in selected.items():
   selection_members[f'{variant}-{target}']=[{'date':r['date'],'race':r['race'],'numbers':r['numbers']} for r in kept]
   out['selected'][f'{variant}-{target}']={'overall':stats(kept,total),'folds':folds[target],'meets_40_percent_each_year':all(f['test']['coverage']>=.4 for f in folds[target])}
 # Report classification diagnostics separately from payout performance.
 a,doc=load(folder);hp=np.load(folder/'horse-predictions.npz');mask=a['dates']>=20240101;out['horse_probability_quality']={k:{'logloss':log_loss(a['y'][mask],hp[k][mask]),'brier':brier_score_loss(a['y'][mask],hp[k][mask])} for k in hp.files}
 out['data']={'generated_at':doc['manifest']['generatedAt'],'through':doc['manifest']['to'],'horse_features':len(doc['feature_names']),'detail_missing_count':len(doc['detail_missing']),'detail_missing':doc['detail_missing'],'source_sha256':doc['source_sha256']};out['horse_models']=json.loads((folder/'horse-models.json').read_text());out['pair_models']=json.loads((folder/'pair-models.json').read_text());out['note']='Retrospective chronological research. Historical periods have been inspected before; not an untouched prospective test. Final payouts only evaluate candidates and select prior-validation rules.'
 (folder/'selection-members.json').write_text(json.dumps(selection_members,allow_nan=False));(folder/'report.json').write_text(json.dumps(out,ensure_ascii=False,indent=2,allow_nan=False));(folder/'predictions.json').write_text(json.dumps({k:[{field:value for field,value in r.items() if field!='features'} for r in rs] for k,rs in records.items()},ensure_ascii=False,allow_nan=False));print(json.dumps({'all':{k:v['overall'] for k,v in out['all'].items()},'selected':{k:{**v['overall'],'coverage_pass':v['meets_40_percent_each_year']} for k,v in out['selected'].items()}},ensure_ascii=False),flush=True)

if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('--data',type=Path,required=True);p.add_argument('--stage',choices=['horse','pair','select','all'],default='all');a=p.parse_args()
 if a.stage in ('horse','all'):horse_stage(a.data)
 if a.stage in ('pair','all'):pair_stage(a.data)
 if a.stage in ('select','all'):select_stage(a.data)
