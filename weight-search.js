'use strict';
const WeightSearch=(()=>{
 function jointView(candidate){
  const j=candidate.joint,v=j.validation,pct=x=>x===null?'—':(100*x).toFixed(2)+'%',odds=x=>x===null?'—':x.toFixed(4)+'배';
  return '<p><b>목표 '+j.target+'% · 선별 기준 '+candidate.settings.screening.threshold+'점 이상</b></p><table class="validation-table"><thead><tr><th>목표 비율</th><th>실제 선택</th><th>과거 탐색 최고</th></tr></thead><tbody>'+j.ratios.map(r=>'<tr><td>'+r.target+'%</td><td>'+pct(r.ratio)+'</td><td>'+odds(r.product)+'</td></tr>').join('')+'</tbody></table><p class="hint">각 비율에서 찾은 가중치와 선별 기준은 서로 다를 수 있습니다. 적용·저장은 선택한 목표 '+j.target+'% 결과입니다. 다른 비율을 적용하려면 목표 비율을 바꾸고 다시 탐색하세요.</p><p><b>시간 순서 검증 · '+odds(v.metrics.product)+'</b><br>적중률 '+pct(v.metrics.rate)+' · 평균 적중배당 '+odds(v.metrics.average)+'<br>적중 '+v.all.hits+' / 평가 '+v.all.evaluated+'경주 · 실제 선택 '+pct(v.all.total?v.all.evaluated/v.all.total:null)+'</p><table class="validation-table"><thead><tr><th>평가 연도</th><th>선택 비율</th><th>적중률 × 배당</th></tr></thead><tbody>'+v.folds.map(f=>'<tr><td>'+f.year+'</td><td>'+pct(f.test.ratio)+'</td><td>'+odds(f.test.product)+'</td></tr>').join('')+'</tbody></table><p class="hint">'+(v.folds.length?'각 연도 시작 전 자료로 가중치·선별 기준을 정하고 해당 연도에는 고정했습니다. 평가 연도 성과는 후보 선정에 사용하지 않습니다. 연도마다 적용 모델이 달라 현재 최고 조합의 검증값은 아닙니다.':'검증할 연도 또는 학습 자료가 부족합니다. 최소 3개 연도와 학습 200경주가 필요합니다.')+' 현재·저장 가중치는 전체 탐색에만 사용하며 시간 순서 검증에서는 제외합니다. 기본 가중치와 고정 난수 후보를 사용한 과거 재검증으로, 아직 관측하지 않은 미래 실전 성과는 아닙니다.</p><details><summary>적용할 경기 선별 기준 보기</summary><table class="validation-table"><tbody>'+j.modelLabels.map((label,i)=>'<tr><td>'+label+'</td><td>'+candidate.settings.screening.coefficients[i]+'</td></tr>').join('')+'</tbody></table><p class="hint">양수는 값이 클수록, 음수는 값이 작을수록 선별 점수를 높입니다. 배당은 과거 성과 평가에만 사용하며 경기 전 선별 입력에는 사용하지 않습니다.</p></details>';
 }
 function init(api){
  const el=id=>document.getElementById(id),start=el('startWeightSearch'),stop=el('stopWeightSearch'),status=el('weightSearchStatus'),result=el('weightSearchResult'),apply=el('applyWeightSearch'),save=el('saveWeightSearch');
  const labels={rate:'적중률',average:'평균 적중배당',product:'적중률 × 평균배당'};
  let token=0,busy=false,snapshot='',best=null;
  const key=()=>JSON.stringify([api.settings(),api.dataKey()]);
  function buttons(){start.disabled=busy;stop.disabled=!busy;apply.disabled=save.disabled=busy||!best;}
  function display(candidate){if(!candidate){result.textContent='조건을 만족한 후보가 아직 없습니다.';return;}const m=candidate.metrics,g=candidate.all,s=candidate.settings;
   result.innerHTML='<p><b>'+labels[el('weightSearchGoal').value]+' 기준 탐색 중 최고</b><br>'+'연승확률 분석 '+s.anchorRank+'위 축마 · 두 번째 말 분석 '+s.min+'~'+s.max+'위</p><div class="search-metrics"><span>적중률<strong>'+(m.rate*100).toFixed(2)+'%</strong></span><span>평균 적중배당<strong>'+m.average.toFixed(3)+'배</strong></span><span>적중률 × 평균배당<strong>'+m.product.toFixed(4)+'배</strong></span></div><p class="hint">적중 '+g.hits.toLocaleString()+' / 평가 '+g.evaluated.toLocaleString()+'경주 · 전체 '+g.total.toLocaleString()+'경주의 '+(g.evaluated/g.total*100).toFixed(2)+'%</p>'+(candidate.joint?jointView(candidate):HistorySummary.comparison(candidate.comparison))+'<details><summary>탐색 가중치 17개 보기</summary><table class="validation-table"><tbody>'+TuningModel.FEATURES.map((f,i)=>'<tr><td>'+f.label+'</td><td>'+s.weights[i]+'%</td></tr>').join('')+'</tbody></table></details>';
  }
  function invalidate(message){token++;api.abort();busy=false;best=null;api.pause(false);buttons();result.textContent='';status.textContent=message;}
  function refresh(){if(snapshot&&snapshot!==key()){snapshot='';invalidate('설정 또는 자료가 바뀌었습니다. 현재 설정으로 다시 탐색하세요.');}}
  start.onclick=async()=>{
   const seconds=Number(el('weightSearchSeconds').value);if(!Number.isInteger(seconds)||seconds<1||seconds>600){status.textContent='탐색 시간은 1~600초 정수로 입력하세요.';return;}
   if(!api.dataKey()){status.textContent='과거 자료를 불러온 뒤 시작해 주세요.';return;}
   const id=++token;snapshot=key();busy=true;best=null;buttons();api.pause(true);display(null);status.textContent='2022년 이후 자료 준비 중… (준비 시간은 탐색 시간에서 제외)';
   try{const out=await api.run({seconds,objective:el('weightSearchGoal').value,balanced:el('weightSearchBalanced').checked,settings:api.settings(),joint:el('weightSearchMode').value==='joint',target:+el('weightSearchTarget').value},p=>{
    if(id!==token)return;display(p.best);stop.disabled=p.phase==='verifying';status.textContent=p.phase==='verifying'?'최고 후보를 기존 통계 계산으로 검산 중…':p.elapsed.toFixed(1)+' / '+seconds+'초 · '+p.count.toLocaleString()+'개 조합 평가';
   });if(id!==token)return;best=out?.best||null;display(best);status.textContent=out?(out.stopped?'중지 완료':'탐색 완료')+' · '+out.elapsed.toFixed(1)+'초 · '+out.count.toLocaleString()+'개 조합 평가'+(best?' · 검산 완료':' · 적중률 15%·평가 비율 40% 조건을 만족한 조합이 없습니다. 시간을 늘리거나 순위 범위를 바꿔 주세요.'):'탐색이 취소되었습니다.';
   }catch(e){if(id===token){best=null;result.textContent='';status.textContent='탐색 실패: '+e.message;}}
   finally{if(id===token){busy=false;buttons();api.pause(false);}}
  };
  stop.onclick=()=>{api.stop();stop.disabled=true;status.textContent='중지 후 완료된 후보 중 최고 조합을 검산합니다…';};
  apply.onclick=()=>{if(!best)return;const selected=best; snapshot='';const saved=api.apply(selected.settings);snapshot=key();status.textContent='탐색 결과를 적용했습니다.'+(selected.settings.screening?' 선별 ON/OFF 상태는 유지됩니다. 위 경기 선별 사용을 켜면 적용한 기준으로 표시됩니다.':'')+(saved?' 이 기기의 현재 설정에 저장했습니다.':' 현재 설정 자동 저장에 실패했습니다.');};
  save.onclick=()=>{if(!best)return;try{const name='자동탐색 '+labels[el('weightSearchGoal').value]+' '+new Date().toISOString().slice(0,19).replace('T',' ');api.save(name,best.settings);status.textContent='“'+name+'” 설정을 저장했습니다. 저장한 설정에서 불러올 수 있습니다.';}catch(e){status.textContent='저장 실패: '+e.message;}};
  for(const id of ['weightSearchSeconds','weightSearchGoal','weightSearchBalanced','weightSearchMode','weightSearchTarget'])el(id).onchange=()=>{if(id==='weightSearchMode'&&el('weightSearchMode').value==='joint')el('weightSearchBalanced').checked=false;if(el('weightSearchMode').value==='joint')el('weightSearchGoal').value='product';el('weightSearchGoal').disabled=el('weightSearchMode').value==='joint';el('weightSearchTarget').disabled=el('weightSearchMode').value!=='joint';snapshot='';invalidate('탐색 조건을 변경했습니다. 시작 버튼을 눌러 주세요.');};
  buttons();return {refresh,reset:()=>{snapshot='';invalidate('자료를 다시 준비합니다. 잠시 후 탐색을 시작해 주세요.');}};
 }
 return {init};
})();
