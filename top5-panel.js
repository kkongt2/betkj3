'use strict';
const Top5Panel=(()=>{
 const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),pct=x=>(x*100).toFixed(2)+'%';
 async function init(apply,refresh){
  const root=document.querySelector('#top5Presets'),status=document.querySelector('#top5Status');
  try{
   const response=await fetch('top5-presets.json?v=top10-1-'+Date.now(),{cache:'no-store'});if(!response.ok)throw Error();const r=await response.json();
   if(r.scope!=='seoul'||r.version!==TuningModel.VERSION||r.presets?.length!==10||r.presets.some(p=>p.all.evaluated<Math.ceil(r.sourceRaces*.4)||p.all.hits*10<p.all.evaluated))throw Error();
   const configs=r.presets.map(p=>StrategyPresets.config(p.settings));
   root.innerHTML='<p class="hint">'+esc(r.from)+' ~ '+esc(r.to)+' · 서울 '+r.sourceRaces.toLocaleString()+'경주<br>최소 '+r.minimumEvaluated.toLocaleString()+'경주(40%) 이상 평가 · 적중률 10% 이상<br>성과 80% + 다양성 20%로 선정 · 곱이 높은 순</p>'+r.presets.map((p,i)=>{const c=configs[i],m=p.metrics;return '<article class="preset-candidate"><h3>'+esc(p.name)+' · '+m.product.toFixed(3)+'배</h3><p><strong>'+(c.anchorMode==='analysis'?'분석 1위':'최종배당 1위')+' 축마 · 두 번째 말 배당 '+c.min+'~'+c.max+'위</strong></p><p>적중률 '+pct(m.rate)+' × 평균 적중배당 '+m.average.toFixed(2)+'배<br>적중 '+p.all.hits.toLocaleString()+' / 평가 '+p.all.evaluated.toLocaleString()+'경주 · 전체의 '+pct(p.coverage)+'<br>다른 프리셋과 실제 선택 차이 최소 '+pct(p.nearestPairDifference)+'</p><button type="button" data-top5="'+i+'">프리셋 '+p.rank+' 적용·저장</button><details><summary>16개 가중치 보기</summary><table class="validation-table"><thead><tr><th>요소</th><th>가중치</th></tr></thead><tbody>'+TuningModel.FEATURES.map((f,j)=>'<tr><td>'+esc(f.label)+'</td><td>'+c.weights[j]+'%</td></tr>').join('')+'</tbody></table></details><details><summary>연도별 성적</summary><table class="validation-table"><thead><tr><th>연도</th><th>평가 / 전체</th><th>곱</th></tr></thead><tbody>'+Object.entries(p.years).map(([year,g])=>'<tr><td>'+esc(year)+'</td><td>'+g.evaluated+' / '+g.total+'</td><td>'+(QplHistoryEngine.metrics(g).product?.toFixed(3)??'—')+'</td></tr>').join('')+'</tbody></table></details></article>';}).join('')+'<p class="hint">'+esc(r.note)+' 불러오면 현재 확보된 자료로 아래 과거 통계가 다시 계산됩니다.</p>';
   const saveAll=document.querySelector('#saveAllTopPresets');saveAll.hidden=false;saveAll.onclick=()=>{try{StrategyPresets.saveMany(localStorage,r.presets.map((p,i)=>({name:p.name,settings:configs[i]})));refresh();status.textContent='10개 프리셋을 모두 저장했습니다. 현재 적용된 설정은 유지됩니다.';}catch(e){status.textContent='일괄 저장하지 못했습니다. '+e.message;}};
   root.addEventListener('click',event=>{const button=event.target.closest('[data-top5]');if(!button)return;const i=Number(button.dataset.top5);if(!Number.isInteger(i)||!configs[i])return;apply(configs[i]);document.querySelector('#presetName').value=r.presets[i].name;document.querySelector('#saveStrategy').onclick();status.textContent=r.presets[i].name+'을 적용했습니다. '+document.querySelector('#presetStatus').textContent;});
  }catch{root.textContent='분산 10개 프리셋을 불러오지 못했습니다. 새로고침해 주세요.';}
 }
 return {init};
})();
