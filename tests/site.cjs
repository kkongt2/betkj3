const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');

const fixture={date:'20250928',venue:'seoul',race_no:1,start_time:'10:00',
 horses:Array.from({length:6},(_,i)=>({number:i+1,name:'말'+(i+1),rating:50-i,starts_1y:10,wins_1y:2,seconds_1y:1,thirds_1y:1,weighted_v3_features:Array.from({length:17},(_,j)=>j===4?1-i/7:.5)})),
 official_result:{status:'confirmed',starters:[1,2,3,4,5,6],place:{status:'confirmed',payouts:[{numbers:[1],odds:1.1},{numbers:[3],odds:2}]},pair:{status:'confirmed',payouts:[{numbers:[1,3],odds:3}]}}};

const doc={updated_at:'2026-09-14T09:00:00+09:00',scope:'seoul',
 races:[fixture,{...fixture,venue:'busan'},{...fixture,venue:'jeju'}],
 calendar:[{date:fixture.date,venues:['seoul','busan']},{date:'20260911',venues:['jeju','busan']}]};

const nativeModel=require('../model.js'),nativeTuning=require('../tuning-model.js');
const historyDoc={schema:2,policyVersion:'betkj3-configurable-anchor-v3',generatedAt:doc.updated_at,rows:[nativeTuning.pack(nativeModel.analyze(fixture),null)]};
const historicalRows=[{...historyDoc.rows[0],date:'20210108'},...historyDoc.rows];
const historyManifest={schema:3,scope:'seoul',policyVersion:historyDoc.policyVersion,generatedAt:doc.updated_at,from:'20210108',to:fixture.date,races:2,shards:[{url:'qpl-history-years/2021.json',rows:1},{url:'qpl-history-years/2025.json',rows:1}]};

const flush=async()=>{await new Promise(resolve=>setTimeout(resolve,180));for(let i=0;i<100&&nodes['#qplHistoryStats']['aria-busy']==='true';i++)await new Promise(resolve=>setTimeout(resolve,10));};
const nodes={},node=()=>({innerHTML:'',textContent:'',value:'',hidden:false,disabled:false,dataset:{},classList:{toggle(){}},setAttribute(k,v){this[k]=v},addEventListener(t,f){this[t]=f},focus(){}});
for(const m of fs.readFileSync('index.html','utf8').matchAll(/id="([^"]+)"/g))nodes['#'+m[1]]=node();
const venues=['seoul','busan','jeju'].map(venue=>({...node(),dataset:{venue}}));
const savedData=new Map([['betkj3-screening-strictness','75']]);
const requested=[];
const rollingFile=JSON.parse(fs.readFileSync('rolling-report.json'));
// Keep the archived fixture within the app's one-year calendar window regardless
// of when CI runs. Explicit dates still use the native constructor and UTC helpers.
const testNow=Date.parse('2026-09-20T12:00:00+09:00');
class TestDate extends Date {constructor(...args){super(...(args.length?args:[testNow]));}static now(){return testNow;}}
const sandbox={console,Intl,Date:TestDate,Math,Number,Set,Map,JSON,Array,String,Error,Infinity,AbortController,setTimeout,clearTimeout,
 document:{addEventListener(){},getElementById:id=>nodes['#'+id]||null,querySelector:s=>nodes[s]||null,querySelectorAll:()=>venues},
 localStorage:{getItem:k=>savedData.get(k)||null,setItem:(k,v)=>savedData.set(k,v)},
 fetch:async url=>{requested.push(String(url));return {ok:true,json:async()=>{
  const s=String(url);
  if(s.includes('top5-presets.json'))return JSON.parse(fs.readFileSync('top5-presets.json'));
  if(s.includes('rolling-report.json'))return rollingFile;
  if(s.includes('qpl-history.json'))return historyManifest;
  if(s.includes('qpl-history-years/'))return {...historyDoc,rows:[historicalRows[s.includes('2021.json')?0:1]]};
  if(s.includes('calendar/'))return {...doc,date:fixture.date,races:[{...fixture,calendar_archive:true}]};
  return doc;
 }}},
 alert:msg=>{throw Error(msg)}
};

vm.createContext(sandbox);
for(const p of ['model.js','qpl-policy.js','tuning-model.js','race-selection-model.js','race-selection-panel.js','search-policy.js','qpl-history-engine.js','weight-curve-engine.js','weight-curves.js','strategy-presets.js','weight-balance.js','global-weight-search.js','weight-search-engine.js','parallel-search.js','runner-search-contract.js','runner-search-panel.js','weight-search.js','joint-search-engine.js','history-summary.js','app.js'])vm.runInContext(fs.readFileSync(p,'utf8'),sandbox);

(async()=>{await flush();
 assert.equal(vm.runInContext('races.every(r=>r.venue==="seoul")',sandbox),true);
 assert(!vm.runInContext('venueDates().includes("20260911")',sandbox));
 assert(!/부경|제주|전국|weightVenue|analysisModel|anchorMode|최종배당/.test(fs.readFileSync('index.html','utf8')));
 assert.equal(vm.runInContext('current.calendar_archive',sandbox),true);

 // Recommendations must be available without loading any final-odds resource.
 assert(!requested.some(x=>x.includes('market-odds')));
 assert(!nodes['#placeLead'].innerHTML.includes('data-result-toggle'));
 assert(!nodes['#pairLead'].innerHTML.includes('data-result-toggle'));
 assert(nodes['#pairLead'].innerHTML.includes('동반입상확률 비교'));
 assert(nodes['#pairLead'].innerHTML.includes('연승확률 분석 1위'));
 assert(nodes['#pairLead'].innerHTML.includes('분석 3위'));
 assert(!nodes['#pairLead'].innerHTML.includes('최종배당'));

 assert.equal(nodes['#screeningEnabled'].checked,false);
 assert.equal(nodes['#screeningControls'].hidden,true);
 assert(!nodes['#pairLead'].innerHTML.includes('screening-badge'));
 assert(!nodes['#raceOverview'].innerHTML.includes('screening-badge'));
 nodes['#screeningEnabled'].checked=true;nodes['#screeningEnabled'].onchange();
 assert(nodes['#pairLead'].innerHTML.includes('screening-badge'));
 nodes['#screeningOnly'].checked=true;
 nodes['#screeningEnabled'].checked=false;nodes['#screeningEnabled'].onchange();
 assert.equal(nodes['#screeningOnly'].checked,false);
 assert(!nodes['#raceOverview'].innerHTML.includes('screening-badge'));
 assert(!nodes['#overviewStatus'].textContent.includes('선별'));
 assert(nodes['#qplHistoryStats'].innerHTML.includes('100.0%'));
 assert(!nodes['#qplHistoryStats'].innerHTML.includes('2021.01.08'));
 assert(nodes['#qplHistoryStats'].innerHTML.includes('2024년 이후 비교'));
 assert(nodes['#qplHistoryStats'].innerHTML.includes('실제 전적 확보'));
 assert(nodes['#qplHistoryStats'].innerHTML.includes('미확인'));
 assert(nodes['#qplHistoryStats'].innerHTML.includes('1경주'));
 assert(nodes['#qplHistoryStats'].innerHTML.includes('평균 적중 배당<strong>3.00배'));

 nodes['#partnerMin'].value='2';nodes['#partnerMin'].onchange();await flush();
 assert(nodes['#qplHistoryStats'].innerHTML.includes('0.0%'));
 assert(nodes['#pairLead'].innerHTML.includes('분석 2위'));

 nodes['#partnerMin'].value='3';nodes['#partnerMax'].value='6';nodes['#partnerMax'].onchange();await flush();
 assert(nodes['#pairLead'].innerHTML.includes('분석 3위'));
 assert(nodes['#rangeHelp'].textContent.includes('3~6위'));

 nodes['#anchorRank'].value='2';nodes['#anchorRank'].onchange();await flush();
 assert(nodes['#pairLead'].innerHTML.includes('연승확률 분석 2위'));
 assert.equal(vm.runInContext('tuningSettings.anchorRank',sandbox),2);

 const previous=vm.runInContext('ranked.places[0].prob',sandbox);
 nodes['#weight-4'].value='34';nodes['#weight-4'].oninput();await flush();
 assert.equal(vm.runInContext('tuningSettings.weights[4]',sandbox),34);
 assert.equal(vm.runInContext('ranked.models.place',sandbox),'user-weighted-seoul-pace21-v1');
 assert.notEqual(vm.runInContext('ranked.places[0].prob',sandbox),previous);
 assert(nodes['#qplHistoryStats'].innerHTML.includes('서울 최근 5경주 가중치'));
 assert(nodes['#qplHistoryStats'].innerHTML.includes('적중률 × 평균배당'));

 nodes['#weight-4'].value='34.5';nodes['#weight-4'].onchange();assert.equal(nodes['#weight-4'].value,'34');
 nodes['#presetName'].value='테스트 <설정>';nodes['#saveStrategy'].onclick();
 assert(nodes['#presetStatus'].textContent.includes('저장했습니다'));
 assert(nodes['#savedStrategy'].innerHTML.includes('&lt;설정&gt;'));
 nodes['#weight-4'].value='50';nodes['#weight-4'].oninput();
 nodes['#partnerMin'].value='2';nodes['#partnerMin'].onchange();
 nodes['#loadStrategy'].onclick();await flush();
 assert.equal(vm.runInContext('tuningSettings.weights[4]',sandbox),34);
 assert.equal(vm.runInContext('partnerRange.min',sandbox),3);
 assert.equal(nodes['#anchorRank'].value,'2');
 assert(nodes['#presetStatus'].textContent.includes('불러왔습니다'));
 nodes['#deleteStrategy'].onclick();assert(nodes['#presetStatus'].textContent.includes('삭제했습니다'));

 assert(!nodes['#top5Presets']);assert(!nodes['#rollingReport']);
 assert(!requested.some(x=>x.includes('top5-presets.json')||x.includes('rolling-report.json')));

 assert(!requested.some(x=>x.includes('market-odds')));
 assert(!nodes['#raceOverview'].innerHTML.includes('최종배당 대기'));
 assert(!nodes['#raceOverview'].innerHTML.includes('출전정보 확인 필요'));
 for(const [option,rank] of [['place-single',1],['place-single-2',2],['place-single-3',3]]){
  nodes['#betStrategy'].value=option;nodes['#betStrategy'].onchange();await flush();
  assert.equal(vm.runInContext('strategySettings().betStrategy',sandbox),'place-single');
  assert.equal(vm.runInContext('strategySettings().anchorRank',sandbox),rank);
  assert.equal(nodes['#anchorRank'].value,String(rank));assert.equal(nodes['#betStrategy'].value,option);
  assert.equal(vm.runInContext('strategySelection(ranked).picks[0].numbers[0]===ranked.places['+(rank-1)+'].numbers[0]',sandbox),true);
  assert.equal(JSON.parse(savedData.get('betkj3-tuning')).anchorRank,rank);
  assert(nodes['#historyStrategyTitle'].textContent.includes('분석 '+rank+'위'));
 }
 vm.runInContext('applySavedStrategy({...strategySettings(),anchorRank:2})',sandbox);await flush();
 assert.equal(nodes['#betStrategy'].value,'place-single-2');
 nodes['#anchorRank'].value='3';nodes['#anchorRank'].onchange();await flush();assert.equal(nodes['#betStrategy'].value,'place-single-3');
 nodes['#betStrategy'].value='trio-box3-2';nodes['#betStrategy'].onchange();await flush();
 assert.equal(vm.runInContext('betStrategy',sandbox),'trio-box3-2');
 assert(vm.runInContext('JSON.stringify(strategySelection(ranked).combos.map(c=>c.numbers))===JSON.stringify([[0,1,2],[0,1,3]].map(ids=>ids.map(i=>strategySelection(ranked).box[i].number)))',sandbox));
 assert.equal((nodes['#pairList'].innerHTML.match(/class="candidate"/g)||[]).length,2);
 assert(nodes['#pairLead'].innerHTML.includes('총 2조합'));assert(nodes['#rangeHelp'].textContent.includes('분석 1·2위 고정'));
 assert.equal(savedData.get('betkj3-bet-strategy'),'trio-box3-2');
 vm.runInContext('applySavedStrategy({...strategySettings(),betStrategy:"qpl-single"});applySavedStrategy({...strategySettings(),betStrategy:"trio-box3-2"})',sandbox);await flush();assert.equal(nodes['#betStrategy'].value,'trio-box3-2');
 nodes['#betStrategy'].value='trio-box3';nodes['#betStrategy'].onchange();await flush();
 assert.equal(vm.runInContext('betStrategy',sandbox),'trio-box3');
 assert.equal(vm.runInContext('strategySelection(ranked).combos.length',sandbox),3);
 assert(vm.runInContext('strategySelection(ranked).combos.every(c=>c.numbers.includes(strategySelection(ranked).box[0].number))',sandbox));
 assert.equal((nodes['#pairList'].innerHTML.match(/class="candidate"/g)||[]).length,3);
 assert(nodes['#pairLead'].innerHTML.includes('축마로 고정'));
 assert(nodes['#rangeHelp'].textContent.includes('분석 1위 축 고정'));
 assert(nodes['#modeHelp'].textContent.includes('1위를 축마로 고정'));
 assert.equal(savedData.get('betkj3-bet-strategy'),'trio-box3');
 nodes['#betStrategy'].value='hybrid';nodes['#betStrategy'].onchange();await flush();
 assert.equal(nodes['#hybridControls'].hidden,false);
 assert.equal(vm.runInContext('strategySelection(ranked).combos.length',sandbox),3);
 assert(nodes['#pairList'].innerHTML.includes('복연승'));
 assert(nodes['#pairList'].innerHTML.includes('삼복승'));
 nodes['#hybridRanks'].value='3';nodes['#hybridRanks'].onchange();await flush();
 assert.equal(vm.runInContext('strategySelection(ranked).combos.length',sandbox),2);
 assert.equal(vm.runInContext('TuningModel.settings(strategySettings()).hybridRanks.join()',sandbox),'3');
 assert(nodes['#qplHistoryStats'].innerHTML.includes('분석 1·2위 고정 + 복병 3위'));
 nodes['#hybridRanks'].value='3,4';nodes['#hybridRanks'].onchange();await flush();
 assert.equal(vm.runInContext('strategySelection(ranked).combos.length',sandbox),3);
 assert.equal(vm.runInContext('TuningModel.settings(strategySettings()).hybridRanks.join()',sandbox),'3,4');
 assert(nodes['#qplHistoryStats'].innerHTML.includes('분석 1·2위 고정 + 복병 3·4위'));
 nodes['#hybridRanks'].value='6';nodes['#hybridRanks'].onchange();await flush();
 assert.equal(vm.runInContext('strategySelection(ranked).combos.length',sandbox),2);
 assert.equal(vm.runInContext('TuningModel.settings(strategySettings()).hybridRanks.join()',sandbox),'6');
 assert(nodes['#qplHistoryStats'].innerHTML.includes('분석 1·2위 고정 + 복병 6위'));
 nodes['#weight-4'].value='35';nodes['#weight-4'].oninput();await flush();
 assert.equal(vm.runInContext('strategySettings().hybridRanks.join()',sandbox),'6');
 // Hybrid official results highlight only the matching tickets, per market and regardless of number order.
 const mixed={date:'20250928',official_result:{pair:{status:'confirmed',payouts:[{numbers:[5,8],odds:5.6},{numbers:[6,8],odds:2.4},{numbers:[5,6],odds:9.5}]},trio:{status:'confirmed',payouts:[{numbers:[5,6,8],odds:24.2}]}}};
 const tickets={kind:'hybrid',combos:[{kind:'pair',numbers:[8,6]},{kind:'trio',numbers:[8,6,2]},{kind:'trio',numbers:[8,6,5]}]};
 const resultHTML=(race,selection)=>vm.runInContext('strategyResultHTML('+JSON.stringify(race)+','+JSON.stringify(selection)+')',sandbox);
 const hybridHTML=resultHTML(mixed,tickets);
 assert.equal((hybridHTML.match(/result-line result-hit/g)||[]).length,2);
 assert(hybridHTML.includes('result-line result-hit"><strong>6–8</strong>'));
 assert(hybridHTML.includes('result-line result-hit"><strong>5–6–8</strong>'));
 assert(hybridHTML.includes('result-line"><strong>5–8</strong>'));
 assert(hybridHTML.includes('8.867배'));
 assert(hybridHTML.includes('hybrid-summary result-hit">✓ 적중 2 / 3조합'));
 assert(hybridHTML.includes('hybrid-summary result-hit">총 구매금액 기준 환급 8.867배'));
 const lowRefund={...tickets,combos:[{kind:'pair',numbers:[8,6]},{kind:'trio',numbers:[8,6,2]},{kind:'trio',numbers:[8,6,3]}]};
 assert(resultHTML(mixed,lowRefund).includes('hybrid-summary result-hit">✓ 적중 1 / 3조합'));
 assert(resultHTML(mixed,lowRefund).includes('hybrid-summary result-loss">총 구매금액 기준 환급 0.800배'));
 const breakEven=JSON.parse(JSON.stringify(mixed));breakEven.official_result.pair.payouts[1].odds=3;
 assert(resultHTML(breakEven,lowRefund).includes('hybrid-summary result-hit">총 구매금액 기준 환급 1.000배'));
 const missingOdds=JSON.parse(JSON.stringify(mixed));missingOdds.official_result.pair.payouts[1].odds=null;
 assert(resultHTML(missingOdds,lowRefund).includes('총 환급배수 · 배당 확인 필요'));
 const partial=JSON.parse(JSON.stringify(mixed));partial.official_result.trio={status:'pending'};
 assert.equal((resultHTML(partial,tickets).match(/result-line result-hit/g)||[]).length,1);
 const missed={...tickets,combos:[{kind:'pair',numbers:[1,2]},{kind:'trio',numbers:[1,2,3]}]};
 assert.equal((resultHTML(mixed,missed).match(/result-line result-hit/g)||[]).length,0);
 assert(resultHTML(mixed,missed).includes('hybrid-summary result-loss">미적중'));assert(resultHTML(mixed,missed).includes('환급 0.000배'));
 const outcome=(r,s)=>JSON.parse(vm.runInContext('JSON.stringify(purchaseOutcome('+JSON.stringify(r)+','+JSON.stringify({...s,ready:true})+'))',sandbox));
 assert(Math.abs(outcome(mixed,tickets).refund-26.6/3)<1e-10);assert.equal(outcome(mixed,tickets).hits.length,2);
 assert.equal(outcome(partial,tickets).status,'pending');assert.equal(outcome(missingOdds,lowRefund).refund,null);
 vm.runInContext('applySavedStrategy({...strategySettings(),hybridRanks:[3,4]})',sandbox);await flush();
 const daySelection=JSON.parse(vm.runInContext('JSON.stringify(strategySelection(analyzeForSite('+JSON.stringify(fixture)+')))',sandbox));
 const dayWin={...fixture,race_no:1,official_result:{pair:{status:'confirmed',payouts:[{numbers:daySelection.combos[0].numbers,odds:3}]},trio:{status:'confirmed',payouts:[{numbers:daySelection.combos[1].numbers,odds:12}]}}};
 const dayMiss={...dayWin,race_no:2,official_result:{pair:{status:'confirmed',payouts:[{numbers:[98,99],odds:2}]},trio:{status:'confirmed',payouts:[{numbers:[97,98,99],odds:3}]}}};
 const dayPending={...dayWin,race_no:3,official_result:{...dayWin.official_result,trio:{status:'pending'}}};
 const dayRefund={...dayWin,race_no:4,official_result:{...dayWin.official_result,pair:{status:'refunded'}}};
 const dayRows=[dayWin,dayMiss,dayPending,dayRefund],dayData=()=>JSON.parse(vm.runInContext('JSON.stringify(selectedDayResults('+JSON.stringify(dayRows)+'))',sandbox));
 const daily=dayData();assert.equal(daily.selected,4);assert.equal(daily.evaluated,2);assert.equal(daily.hitRaces,1);assert.equal(daily.pending,1);assert.equal(daily.refunded,1);assert.equal(daily.refund,2.5);assert.equal(daily.winners[0].refund,5);
 vm.runInContext('renderSelectedDayResults('+JSON.stringify(dayRows)+')',sandbox);
 assert(nodes['#selectedDayResults'].innerHTML.includes('적중 1 / 확정 2경주'));assert(nodes['#selectedDayResults'].innerHTML.includes('경주 최종 환급배수 5.000배'));assert(nodes['#selectedDayResults'].innerHTML.includes('삼복승'));assert(nodes['#selectedDayResults'].innerHTML.includes('12.0배'));assert(nodes['#selectedDayResults'].innerHTML.includes('전체 환급배수 2.500배'));
 nodes['#screeningEnabled'].checked=true;nodes['#screeningEnabled'].onchange();nodes['#screeningStrictnessNumber'].value='100';nodes['#screeningStrictnessNumber'].oninput();assert.equal(dayData().selected,0);assert.equal(dayData().refund,null);
 nodes['#screeningStrictnessNumber'].value='0';nodes['#screeningStrictnessNumber'].oninput();assert.equal(dayData().selected,4);
 nodes['#screeningEnabled'].checked=false;nodes['#screeningEnabled'].onchange();
 vm.runInContext('renderSelectedDayResults([])',sandbox);assert(!nodes['#selectedDayResults'].innerHTML.includes('5.000배'));

 // Monthly totals use all confirmed races, including losing races, rather than
 // averaging daily averages. Pending/refunded races stay outside the denominator.
 const monthRows=[...dayRows.map(r=>({...r,date:'20260912',calendar_archive:true})),{...dayWin,date:'20260913',calendar_archive:true}];
 const html=fs.readFileSync('index.html','utf8');assert(html.indexOf('id="calendarMonth"')<html.indexOf('id="selectedMonthResults"'));assert(html.indexOf('id="selectedMonthResults"')<html.indexOf('id="dateCalendar"'));
 vm.runInContext('races='+JSON.stringify(monthRows)+';source={calendar:[]};monthResultsKey=""',sandbox);nodes['#calendarMonth'].value='202609';
 await vm.runInContext('renderSelectedMonthResults()',sandbox);
 let monthHTML=nodes['#selectedMonthResults'].innerHTML;
 assert(monthHTML.includes('적중 2 / 확정 3경주'));assert(monthHTML.includes('전체 환급배수 3.333배'));assert(monthHTML.includes('2026-09-12 · 1R'));assert(monthHTML.includes('2026-09-13 · 1R'));assert(monthHTML.includes('12.0배'));assert(monthHTML.includes('결과 대기 1경주 · 환불 1경주'));assert.equal(nodes['#selectedMonthResults']['aria-busy'],'false');
 nodes['#screeningEnabled'].checked=true;nodes['#screeningEnabled'].onchange();nodes['#screeningStrictnessNumber'].value='100';nodes['#screeningStrictnessNumber'].oninput();
 await flush();await vm.runInContext('renderSelectedMonthResults()',sandbox);assert(nodes['#selectedMonthResults'].innerHTML.includes('적중 0 / 확정 0경주'));
 nodes['#screeningEnabled'].checked=false;nodes['#screeningEnabled'].onchange();await flush();
 // Calendar fetches are shared with daily navigation and reused across settings.
 vm.runInContext('calendarDocuments.clear()',sandbox);const before=requested.filter(x=>x.includes('calendar/')).length;
 await vm.runInContext('Promise.all([loadCalendarDay("20250928"),loadCalendarDay("20250928")])',sandbox);
 assert.equal(requested.filter(x=>x.includes('calendar/')).length-before,1);
 await vm.runInContext('loadCalendarDay("20250928")',sandbox);assert.equal(requested.filter(x=>x.includes('calendar/')).length-before,1);
 // Missing dates are explicit; retry fills them without changing the selected day.
 sandbox.monthCards=monthRows;sandbox.monthFail=true;
 vm.runInContext('source={calendar:[{date:"20260914",venues:["seoul"]}]};loadCalendarDay=async date=>{if(monthFail)throw Error("offline");return monthCards.slice(0,1).map(r=>({...r,date}));};monthResultsKey=""',sandbox);
 await vm.runInContext('renderSelectedMonthResults()',sandbox);assert(nodes['#selectedMonthResults'].innerHTML.includes('자료 누락 1일'));assert(nodes['#selectedMonthResults'].innerHTML.includes('data-month-results-retry'));
 sandbox.monthFail=false;nodes['#selectedMonthResults'].click({target:{closest:()=>true}});await flush();assert(!nodes['#selectedMonthResults'].innerHTML.includes('자료 누락'));assert(nodes['#selectedMonthResults'].innerHTML.includes('적중 3 / 확정 4경주'));
 // A slower previous-month fetch cannot overwrite the newly selected month.
 vm.runInContext('source={calendar:[{date:"20260815",venues:["seoul"]}]};loadCalendarDay=date=>new Promise(resolve=>{globalThis.resolveOldMonth=()=>resolve(monthCards.slice(0,1).map(r=>({...r,date})));});monthResultsKey=""',sandbox);
 nodes['#calendarMonth'].value='202608';const oldMonth=vm.runInContext('renderSelectedMonthResults()',sandbox);
 nodes['#calendarMonth'].value='202609';await vm.runInContext('renderSelectedMonthResults()',sandbox);const newest=nodes['#selectedMonthResults'].innerHTML;
 vm.runInContext('resolveOldMonth()',sandbox);await oldMonth;assert.equal(nodes['#selectedMonthResults'].innerHTML,newest);
 nodes['#calendarMonth'].value='202607';await vm.runInContext('renderSelectedMonthResults()',sandbox);assert(!nodes['#selectedMonthResults'].innerHTML.includes('3.333배'));assert(nodes['#selectedMonthResults'].innerHTML.includes('조회 가능한 경주가 없습니다'));
 console.log('PASS analysis-only QPL selection, no final-odds fetch, one preset, controls, history and result display');
})().catch(e=>{console.error(e);process.exitCode=1});
