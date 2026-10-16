'use strict';
const RunnerSearchPanel=(()=>{
 const base='https://raw.githubusercontent.com/kkongt2/betkj3/refs/heads/runner-results/';
 const modes={'place-single':'연승 1두','qpl-single':'복연승 1조합','qpl-anchor2':'복연승 2조합','trio-box3':'삼복승 3두 박스','trio-box4':'삼복승 4두 박스',hybrid:'복연승+삼복승 하이브리드'};
 const goals={product:'적중률×평균배당',rate:'적중률',average:'평균 적중배당'};
 const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const duration=s=>s>=86400&&s%86400===0?(s/86400)+'일':s>=3600&&s%3600===0?(s/3600)+'시간':Number((s/60).toFixed(2))+'분';
 const pct=x=>Number.isFinite(x)?(x*100).toFixed(2)+'%':'—',odds=x=>Number.isFinite(x)?x.toFixed(4)+'배':'—';
 const date=x=>new Date(x).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'});
 function settings(s){
  if(!s||![1,2,3].includes(s.anchorRank)||![s.min,s.max].every(x=>Number.isInteger(x)&&x>=2&&x<=20)||s.min>s.max)throw Error('실행 조건 확인 필요');
  const betStrategy=s.betStrategy||'qpl-single';if(!Object.keys(modes).includes(betStrategy))throw Error('승식 확인 필요');
  const out={betStrategy,anchorRank:s.anchorRank,min:s.min,max:s.max};
  if(betStrategy==='hybrid'){const ranks=s.hybridRanks||[4,5];if(!['4','5','6','3,4','4,5','4,6','5,6'].includes(ranks.join(',')))throw Error('하이브리드 순위 확인 필요');out.hybridRanks=ranks.slice();}
  if(s.weights!==undefined){if(!Array.isArray(s.weights)||![10,13,16,17,21,22,26].includes(s.weights.length)||!s.weights.every(w=>Number.isInteger(w)&&w>=0&&w<=100))throw Error('실행 가중치 확인 필요');out.weights=s.weights.slice();}
  if(s.screening&&Number.isInteger(s.screening.threshold)&&s.screening.threshold>=0&&s.screening.threshold<=99)out.threshold=s.screening.threshold;
  if(s.threshold!==undefined&&Number.isInteger(s.threshold)&&s.threshold>=0&&s.threshold<=99)out.threshold=s.threshold;
  return out;
 }
 // Read-only summary keeps the original betting strategy and saved performance.
 // Importing the result separately may migrate weights and recompute performance.
 function summarize(raw){
  const q=raw?.request,r=raw?.result;
  if(raw?.schema!==1||!/^\d+(?:-\d+)?$/.test(raw.runId)||!Number.isFinite(Date.parse(raw.finishedAt))||!q||!r||!['local','de'].includes(q.method)||!Object.keys(goals).includes(q.objective)||typeof q.joint!=='boolean'||!Number.isInteger(q.seconds)||q.seconds<1||q.seconds>604800||![40,50,60,80].includes(q.target))throw Error('실행 요약 자료 확인 필요');
  if(!Number.isFinite(r.elapsed)||r.elapsed<0||r.elapsed>q.seconds||!Number.isSafeInteger(r.count)||r.count<0||!Number.isInteger(r.workers)||r.workers<1||r.workers>8||!('best' in r))throw Error('최종 실행 자료 확인 필요');
  const minHitRate=q.minHitRate??15;if(!Number.isFinite(minHitRate)||minHitRate<0||minHitRate>100)throw Error('최저 적중률 확인 필요');
  const request={requestId:typeof q.requestId==='string'?q.requestId:'',settings:settings(q.settings),method:q.method,objective:q.objective,joint:q.joint,target:q.target,minHitRate,balanced:q.balanced===true,parallel:q.parallel===true,seconds:q.seconds};
  if(q.fitness){const {cap,floor}=q.fitness;if(!Number.isFinite(cap)||cap<1||cap>1000||!Number.isFinite(floor)||floor<0||floor>2)throw Error('안정성 옵션 확인 필요');request.fitness={cap,floor};}
  if(r.best!==null&&(typeof r.best!=='object'||Array.isArray(r.best)))throw Error('최종 후보 확인 필요');
  let best=null;
  if(r.best){
   const g=r.best.all;
   if(!g||!['total','evaluated','hits','paidHits','excluded'].every(k=>Number.isSafeInteger(g[k])&&g[k]>=0)||g.evaluated>g.total||g.hits>g.evaluated||g.paidHits>g.hits||g.excluded!==g.total-g.evaluated||!Number.isFinite(g.payoutTotal)||g.payoutTotal<0)throw Error('최종 성적 확인 필요');
   const all=Object.fromEntries(['total','evaluated','hits','paidHits','excluded','payoutTotal'].map(k=>[k,g[k]]));
   const H=typeof module!=='undefined'?require('./qpl-history-engine.js'):QplHistoryEngine;
   best={settings:settings(r.best.settings),all,metrics:H.metrics(all)};
   if(r.best.training&&Number.isFinite(r.best.training.score)){best.training={score:r.best.training.score,worst:Number.isFinite(r.best.training.worst)?r.best.training.worst:null};}
  }
  return {schema:1,runId:raw.runId,finishedAt:raw.finishedAt,modelVersion:String(raw.modelVersion||'').slice(0,100),from:/^\d{8}$/.test(raw.from)?raw.from:'',to:/^\d{8}$/.test(raw.to)?raw.to:'',request,result:{best,elapsed:r.elapsed,count:r.count,workers:r.workers,segments:Number.isInteger(r.segments)?r.segments:null,partial:r.elapsed<q.seconds-1e-6}};
 }
 function selection(s){
  if(s.betStrategy==='place-single')return '연승확률 분석 '+s.anchorRank+'위 · 1두';
  if(s.betStrategy==='trio-box4')return '분석 상위 4두 · 4조합';
  if(s.betStrategy==='trio-box3')return '분석 상위 4두 · 1위 축 고정 · 3조합';
  if(s.betStrategy==='hybrid')return '분석 1·2위 고정 + 복병 '+s.hybridRanks.join('·')+'위 · 총 '+(1+s.hybridRanks.length)+'조합';
  return '축마 분석 '+s.anchorRank+'위 · 상대 '+s.min+'~'+s.max+'위 · '+(s.betStrategy==='qpl-anchor2'?2:1)+'조합';
 }
 const modeLabel=s=>modes[s.betStrategy]+(s.betStrategy==='place-single'?' · 분석 '+s.anchorRank+'위':'');
 function label(s){
  const q=s.request,b=s.result.best;
  return date(s.finishedAt)+' · '+modeLabel(q.settings)+' · '+(q.joint?'공동 '+q.target+'%':'전체')+' · '+(q.method==='de'?'DE':'혼합')+' · 하한 '+q.minHitRate+'%'+(q.balanced?' · 균형ON':'')+' · '+duration(s.result.elapsed)+(s.result.partial?' / 요청 '+duration(q.seconds)+' · 중간 결과':'')+' · '+(b?'적중 '+pct(b.metrics.rate)+' · 환급 '+odds(b.metrics.product):'조건 만족 후보 없음');
 }
 function preview(s){
  const q=s.request,r=s.result,b=r.best,row=(k,v)=>'<tr><th>'+esc(k)+'</th><td>'+esc(v)+'</td></tr>';
  const weights=b?.settings.weights,T=typeof module!=='undefined'?require('./tuning-model.js'):TuningModel,indices=weights?(s.modelVersion===T.VERSION&&weights.length===T.FEATURES.length?T.ACTIVE:weights.map((_,i)=>i)):[];
  return '<article class="runner-result-preview"><h4>'+esc(modeLabel(q.settings))+' · '+(r.partial?'중간 저장·복구 결과':'완료 결과')+'</h4><p class="hint">'+esc(date(s.finishedAt))+' · 실행 '+esc(s.runId)+'</p>'+
   (b?'<div class="search-metrics"><span>적중률<strong>'+pct(b.metrics.rate)+'</strong></span><span>평균 적중배당<strong>'+odds(b.metrics.average)+'</strong></span><span>실제 환급배수<strong>'+odds(b.metrics.product)+'</strong></span></div><p class="hint">적중 '+b.all.hits.toLocaleString()+' / 평가 '+b.all.evaluated.toLocaleString()+'경주 · 대상 '+b.all.total.toLocaleString()+'경주의 '+pct(b.all.total?b.all.evaluated/b.all.total:null)+'</p>':'<p><strong>조건을 만족한 최종 후보가 없습니다.</strong></p>')+
   '<table class="validation-table">'+row('승식·구매 방식',modeLabel(q.settings))+row('요청 말 선정',selection(q.settings))+row('탐색 대상',q.joint?'가중치 + 경기 선별 · 목표 '+q.target+'%':'전체 경기 · 가중치')+row('알고리즘·목표',(q.method==='de'?'전역 DE':'혼합 탐색')+' · '+goals[q.objective])+row('적중률 하한',q.minHitRate+'%')+row('균형 제한',q.balanced?'ON':'OFF')+row('병렬 탐색',(q.parallel?'ON':'OFF')+' · 실제 '+r.workers+'개 작업')+row('안정성 반영',q.fitness?'ON · 상한 '+q.fitness.cap+'배 · 분기 기준 '+q.fitness.floor+'배':'OFF · 원래 환급배수 기준')+row('요청·실제 탐색 시간',duration(q.seconds)+' / '+duration(r.elapsed)+(r.partial?' · 요청 시간 미완료':''))+row('평가 횟수·구간',r.count.toLocaleString()+'회'+(r.segments!==null?' · '+r.segments+'개 구간':''))+(s.from?row('평가 자료 기간',s.from+'~'+s.to):'')+(b?row('최종 말 선정',selection(b.settings))+(b.settings.threshold!==undefined?row('최종 경기 선별',b.settings.threshold+'점 이상'):'')+(b.training?row('안정성 탐색 점수',b.training.score.toFixed(4)+(b.training.worst!==null?' · 분기 최저 '+odds(b.training.worst):'')):''):'')+'</table>'+
   (weights?'<details><summary>저장 당시 최종 가중치 '+indices.length+'개 보기</summary><table class="validation-table">'+indices.map(i=>row(T.FEATURES[i]?.label||'지표 '+(i+1),weights[i]+'%')).join('')+'</table></details>':'')+
   '<p class="hint">저장 당시의 승식·옵션·성적입니다. 목록 선택만으로 현재 설정은 적용되지 않습니다. 불러오기에서는 이전 가중치 정책을 이관하거나 현재 자료로 성적을 재계산할 수 있습니다.</p><p><a href="https://github.com/kkongt2/betkj3/actions/runs/'+s.runId.split('-')[0]+'" target="_blank" rel="noopener noreferrer">이 실행의 GitHub 진행 기록 ↗</a></p></article>';
 }
 function init(api){
  const el=id=>document.getElementById(id),status=el('runnerSearchStatus'),requestBox=el('runnerSearchRequest'),list=el('runnerSearchResults');
  let requestId='',loading=false,revision=0,entries=[],generation=0;const reports=new Map(),pending=new Map(),summaries=new Map(),previewRoot=el('runnerSearchPreview');
  const cacheKey=e=>e.runId+':'+e.finishedAt;
  async function getReport(e,fresh=false){const key=cacheKey(e);if(fresh)reports.delete(key);if(reports.has(key))return reports.get(key);if(pending.has(key))return pending.get(key);const task=read('runs/'+e.runId+'.json').then(raw=>{if(!raw||raw.runId!==e.runId)throw Error('선택한 실행 결과를 찾지 못했습니다.');reports.set(key,raw);return raw;}).finally(()=>pending.delete(key));pending.set(key,task);return task;}
  function showPreview(){const e=entries.find(e=>e.runId===list.value),s=e&&summaries.get(cacheKey(e));if(previewRoot){previewRoot.hidden=!e;previewRoot.innerHTML=s?preview(s):e?'<p class="hint">승식·옵션·최종 성적을 확인하는 중입니다…</p>':'';}}
  list.onchange=()=>{revision++;showPreview();el('loadRunnerSearch').disabled=!entries.some(e=>e.runId===list.value);};
  try{requestId=localStorage.getItem('betkj3-runner-request')||'';}catch{}
  function changed(){if(!requestBox.hidden){requestBox.hidden=true;el('runnerPrepared').hidden=true;status.textContent='조건이 바뀌었습니다. Runner 탐색 준비를 다시 눌러 주세요.';}}
  el('prepareRunnerSearch').onclick=async()=>{
   try{
    if(!api.canPrepare())throw Error('이 기기의 탐색을 중지한 후 준비해 주세요.');
    const request=RunnerSearchContract.request({schema:1,requestId:crypto.randomUUID(),...api.options()});
    requestId=request.requestId;requestBox.value=JSON.stringify(request);requestBox.hidden=false;el('runnerPrepared').hidden=false;
    try{localStorage.setItem('betkj3-runner-request',requestId);}catch{}
    try{await navigator.clipboard.writeText(requestBox.value);status.textContent='조건을 복사했습니다. GitHub에서 Run workflow → request에 붙여넣기 → Run workflow를 누르세요. 아직 실행된 상태는 아닙니다.';}
    catch{requestBox.focus();requestBox.select();status.textContent='아래 조건을 길게 눌러 복사한 뒤 GitHub 실행 화면의 request에 붙여넣으세요. 아직 실행된 상태는 아닙니다.';}
   }catch(e){status.textContent=e.message;}
  };
  el('copyRunnerSearch').onclick=async()=>{try{await navigator.clipboard.writeText(requestBox.value);status.textContent='탐색 조건을 복사했습니다. GitHub 실행 화면에서 붙여넣으세요.';}catch{requestBox.focus();requestBox.select();status.textContent='조건을 길게 눌러 직접 복사해 주세요.';}};
  async function read(file){const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),20000);try{const r=await fetch(base+file+'?t='+Date.now(),{cache:'no-store',signal:controller.signal});if(r.status===404)return null;if(!r.ok)throw Error('결과 조회 HTTP '+r.status);return await r.json();}finally{clearTimeout(timer);}}
  async function refresh(){
   if(loading)return;loading=true;const id=++generation;el('refreshRunnerSearch').disabled=true;
   try{const selected=list.value,data=await read('index.json'),seen=new Set();entries=data?.schema===1&&Array.isArray(data.entries)?data.entries.filter(e=>/^\d+(?:-\d+)?$/.test(e.runId)&&Number.isFinite(Date.parse(e.finishedAt))&&!seen.has(e.runId)&&seen.add(e.runId)).slice(0,30):[];
    const keys=new Set(entries.map(cacheKey));for(const map of [reports,summaries])for(const key of map.keys())if(!keys.has(key))map.delete(key);
    list.replaceChildren();for(const e of entries){try{if(e.summary){const s=summarize(e.summary);if(s.runId===e.runId&&s.finishedAt===e.finishedAt)summaries.set(cacheKey(e),s);}}catch{}const option=document.createElement('option');option.value=e.runId;const s=summaries.get(cacheKey(e));option.textContent=(s?label(s):date(e.finishedAt)+' · '+(e.joint?'공동':'전체')+' · '+(e.method==='de'?'DE':'혼합')+' · '+duration(e.seconds)+' · 상세 조회 중')+(e.requestId===requestId?' · 내 최근 요청':'');list.append(option);}
    const own=entries.find(e=>e.requestId===requestId);if(own)list.value=own.runId;else if(entries.some(e=>e.runId===selected))list.value=selected;
    el('loadRunnerSearch').disabled=!entries.length;showPreview();
    status.textContent=entries.length?'승식·탐색 옵션·최종 성적을 확인합니다…':'아직 저장된 Runner 결과가 없습니다.';
    const queue=entries.filter(e=>!summaries.has(cacheKey(e))).sort((a,b)=>(b.runId===list.value)-(a.runId===list.value));let next=0,failed=0;
    async function hydrate(){while(next<queue.length){const e=queue[next++];try{const s=summarize(await getReport(e));if(id!==generation)return;summaries.set(cacheKey(e),s);const option=[...list.options].find(o=>o.value===e.runId);if(option)option.textContent=label(s)+(e.requestId===requestId?' · 내 최근 요청':'');if(list.value===e.runId)showPreview();}catch{failed++;if(id===generation){const option=[...list.options].find(o=>o.value===e.runId);if(option)option.textContent=option.textContent.replace('상세 조회 중','상세 조회 실패');if(list.value===e.runId&&previewRoot)previewRoot.innerHTML='<p class="hint">상세 정보를 불러오지 못했습니다. 결과 불러오기를 눌러 다시 조회하세요.</p>';}}}}
    await Promise.all(Array.from({length:Math.min(3,queue.length)},hydrate));
    status.textContent=(own?'최근 요청의 완료 결과가 있습니다.':entries.length?'완료된 실행의 승식·옵션·최종 성적을 확인한 뒤 불러오세요.':'아직 저장된 Runner 결과가 없습니다.')+(failed?' 상세 조회 실패 '+failed+'개 · 불러오기에서 다시 조회할 수 있습니다.':'');
   }catch(e){status.textContent='Runner 결과 조회 실패: '+e.message;}finally{loading=false;el('refreshRunnerSearch').disabled=false;}
  }
  el('refreshRunnerSearch').onclick=refresh;
  el('loadRunnerSearch').onclick=async()=>{
   const selected=entries.find(e=>e.runId===list.value);if(!selected)return;const id=++revision,current=()=>id===revision&&list.value===selected.runId&&entries.some(e=>cacheKey(e)===cacheKey(selected));el('loadRunnerSearch').disabled=true;
   try{const raw=await getReport(selected,true);if(!current())return;if(!raw||raw.runId!==selected.runId)throw Error('선택한 실행 결과를 찾지 못했습니다.');summaries.set(cacheKey(selected),summarize(raw));showPreview();const report=RunnerSearchContract.report(JSON.parse(JSON.stringify(raw)));status.textContent='현재 최고 조합의 연도별 성적을 재계산 중…';const accepted=await api.receive(report,current);if(!current())return;if(accepted===false){status.textContent='설정이 변경되어 결과 불러오기를 취소했습니다.';return;}status.textContent='Runner 결과를 불러왔습니다. '+report.from+'~'+report.to+' 자료 기준 · 완료 '+new Date(report.finishedAt).toLocaleString()+'. 아래에서 결과를 확인하고 적용·저장하세요.';}
   catch(e){if(current())status.textContent='결과 불러오기 실패: '+e.message;}finally{if(current())el('loadRunnerSearch').disabled=!entries.length;}
  };
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')refresh();});
  return {changed};
 }
 return {init,summarize,label,preview,selection};
})();

if(typeof module!=='undefined')module.exports=RunnerSearchPanel;
