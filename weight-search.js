'use strict';
const WeightSearch=(()=>{
 function init(api){
  const el=id=>document.getElementById(id),start=el('startWeightSearch'),stop=el('stopWeightSearch'),status=el('weightSearchStatus'),result=el('weightSearchResult'),apply=el('applyWeightSearch'),save=el('saveWeightSearch');
  const labels={rate:'적중률',average:'평균 적중배당',product:'적중률 × 평균배당'};
  let token=0,busy=false,snapshot='',best=null;
  const key=()=>JSON.stringify([api.settings(),api.dataKey()]);
  function buttons(){start.disabled=busy;stop.disabled=!busy;apply.disabled=save.disabled=busy||!best;}
  function display(candidate){if(!candidate){result.textContent='조건을 만족한 후보가 아직 없습니다.';return;}const m=candidate.metrics,g=candidate.all,s=candidate.settings;
   result.innerHTML='<p><b>'+labels[el('weightSearchGoal').value]+' 기준 탐색 중 최고</b><br>'+(s.anchorMode==='analysis'?'분석':'최종배당')+' '+s.anchorRank+'위 축마 · 두 번째 말 배당 '+s.min+'~'+s.max+'위</p><div class="search-metrics"><span>적중률<strong>'+(m.rate*100).toFixed(2)+'%</strong></span><span>평균 적중배당<strong>'+m.average.toFixed(3)+'배</strong></span><span>적중률 × 평균배당<strong>'+m.product.toFixed(4)+'배</strong></span></div><p class="hint">적중 '+g.hits.toLocaleString()+' / 평가 '+g.evaluated.toLocaleString()+'경주 · 전체 '+g.total.toLocaleString()+'경주의 '+(g.evaluated/g.total*100).toFixed(2)+'%</p><details><summary>탐색 가중치 17개 보기</summary><table class="validation-table"><tbody>'+TuningModel.FEATURES.map((f,i)=>'<tr><td>'+f.label+'</td><td>'+s.weights[i]+'%</td></tr>').join('')+'</tbody></table></details>';
  }
  function invalidate(message){token++;api.abort();busy=false;best=null;api.pause(false);buttons();result.textContent='';status.textContent=message;}
  function refresh(){if(snapshot&&snapshot!==key()){snapshot='';invalidate('설정 또는 자료가 바뀌었습니다. 현재 설정으로 다시 탐색하세요.');}}
  start.onclick=async()=>{
   const seconds=Number(el('weightSearchSeconds').value);if(!Number.isInteger(seconds)||seconds<1||seconds>600){status.textContent='탐색 시간은 1~600초 정수로 입력하세요.';return;}
   if(!api.dataKey()){status.textContent='과거 자료를 불러온 뒤 시작해 주세요.';return;}
   const id=++token;snapshot=key();busy=true;best=null;buttons();api.pause(true);display(null);status.textContent='전체 기간 자료 준비 중… (준비 시간은 탐색 시간에서 제외)';
   try{const out=await api.run({seconds,objective:el('weightSearchGoal').value,balanced:el('weightSearchBalanced').checked,settings:api.settings()},p=>{
    if(id!==token)return;display(p.best);stop.disabled=p.phase==='verifying';status.textContent=p.phase==='verifying'?'최고 후보를 기존 통계 계산으로 검산 중…':p.elapsed.toFixed(1)+' / '+seconds+'초 · '+p.count.toLocaleString()+'개 조합 평가';
   });if(id!==token)return;best=out?.best||null;display(best);status.textContent=out?(out.stopped?'중지 완료':'탐색 완료')+' · '+out.elapsed.toFixed(1)+'초 · '+out.count.toLocaleString()+'개 조합 평가'+(best?' · 검산 완료':' · 적중률 15%·평가 비율 40% 조건을 만족한 조합이 없습니다. 시간을 늘리거나 순위 범위를 바꿔 주세요.'):'탐색이 취소되었습니다.';
   }catch(e){if(id===token){best=null;result.textContent='';status.textContent='탐색 실패: '+e.message;}}
   finally{if(id===token){busy=false;buttons();api.pause(false);}}
  };
  stop.onclick=()=>{api.stop();stop.disabled=true;status.textContent='중지 후 완료된 후보 중 최고 조합을 검산합니다…';};
  apply.onclick=()=>{if(!best)return;const selected=best; snapshot='';const saved=api.apply(selected.settings);snapshot=key();status.textContent='탐색 결과를 적용했습니다.'+(saved?' 이 기기의 현재 설정에 저장했습니다.':' 현재 설정 자동 저장에 실패했습니다.');};
  save.onclick=()=>{if(!best)return;try{const name='자동탐색 '+labels[el('weightSearchGoal').value]+' '+new Date().toISOString().slice(0,19).replace('T',' ');api.save(name,best.settings);status.textContent='“'+name+'” 설정을 저장했습니다. 저장한 설정에서 불러올 수 있습니다.';}catch(e){status.textContent='저장 실패: '+e.message;}};
  for(const id of ['weightSearchSeconds','weightSearchGoal','weightSearchBalanced'])el(id).onchange=()=>{snapshot='';invalidate('탐색 조건을 변경했습니다. 시작 버튼을 눌러 주세요.');};
  buttons();return {refresh,reset:()=>{snapshot='';invalidate('자료를 다시 준비합니다. 잠시 후 탐색을 시작해 주세요.');}};
 }
 return {init};
})();
