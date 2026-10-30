// Optional DOM integration: NODE_PATH=/tmp/frisbee-discussion-dom/node_modules node scripts/verify-scrimmage-dom.cjs
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),{parseHTML}=require('linkedom');
const {document:doc,window:win}=parseHTML(fs.readFileSync('dist/index.html','utf8'));
win.HTMLElement.prototype.getBoundingClientRect=function(){return{top:0,bottom:60,left:0,right:390,width:390,height:60};};
win.HTMLElement.prototype.scrollTo=function(){};win.HTMLElement.prototype.scrollIntoView=function(){};win.HTMLElement.prototype.focus=function(){};
win.HTMLElement.prototype.showModal=function(){this.open=true;};win.HTMLElement.prototype.close=function(){this.open=false;this.dispatchEvent(new win.Event('close'));};
for(const form of doc.querySelectorAll('form'))form.reset=()=>{for(const input of form.querySelectorAll('input,textarea'))input.value='';};
Object.defineProperty(win.HTMLSelectElement.prototype,'value',{get(){return this.querySelector('option[selected]')?.getAttribute('value')||this.querySelector('option')?.getAttribute('value')||'';},set(value){for(const opt of this.querySelectorAll('option'))opt.toggleAttribute('selected',opt.getAttribute('value')===value);}});
doc.body.classList.add('stats-mode');win.history={replaceState(){}};win.matchMedia=()=>({matches:false});
const $=s=>doc.querySelector(s),clone=x=>JSON.parse(JSON.stringify(x)),tick=()=>new Promise(setImmediate),now=Date.now();
const players=Array.from({length:16},(_,i)=>({id:i+1,name:'队员'+(i+1),number:i+1,gender:'male',avatar:'',loginReady:true}));
const game={id:'practice',trainingId:'training',name:'队内对抗',opponent:'旧版的外部队伍',status:'live',heldOn:'2026-10-29',created:now,events:[],comments:[],video:''};
const training={id:'training',name:'训练',heldOn:'2026-10-29',status:'completed',attendees:players.map(p=>p.id),drills:[],warmup:'',games:[game],comments:[]};
const catalog=[{id:'simple',name:'二人钟摆',summary:''},{id:'long',name:'三人四角 Drill 基础版：Handler 接应与竖排排头补位及后续交叉跑动',summary:'观察持盘人，轮流回切。'.repeat(20)}];
const state={players,games:[],trainings:[training],me:null,revision:1};let seq=0;
const calls=[],toasts=[];
async function api(path,options){if(!options&&path.includes('/notes'))return{notes:[],total:0,trainingCount:0,nextOffset:null};if(!options)return clone(state);const body=JSON.parse(options.body||'{}');calls.push({path,...options,body});
 if(path.endsWith('/events')){let event;if(options.method==='DELETE')return{removed:game.events.pop(),revision:++state.revision};if(body.kind==='point')event={seq:++seq,at:now,kind:'point',line:body.sides?[...body.sides.a,...body.sides.b]:body.line,start:body.sides?(body.sides.offense==='a'?'offense':'defense'):body.start,...(body.sides?{sides:body.sides}:{})};else{const point=game.events.filter(e=>e.kind==='point').at(-1);event={seq:++seq,at:now,kind:body.kind,from:body.from,to:body.to??null,side:point.sides.a.includes(body.from)?'a':'b'};}game.events.push(clone(event));return{event,revision:++state.revision};}
 if(options.method==='PUT'&&path.startsWith('stats/trainings/')){training.drills=body.drills.map(id=>catalog.find(d=>d.id===id));return{training:clone(training),revision:++state.revision};}
 if(options.method==='PUT'){Object.assign(game,body);return{game:clone(game),revision:++state.revision};}
 return clone(state);
}
const cx={document:doc,window:win,Intl,Date,URLSearchParams,console,parseFloat,setInterval:()=>0,getComputedStyle:()=>({columnGap:'12px'}),MobileUI:{isPhone:()=>true},bindTap:(el,fn)=>el.onclick=fn};
cx.setTimeout=()=>0;cx.clearTimeout=()=>{};vm.createContext(cx);vm.runInContext(['bili-video.js','discussion-text.js','discussion.js','drill-journal.js','team-metrics.js','team-hub.js','team-messages.js','stats.js'].map(f=>fs.readFileSync('dist/'+f,'utf8')).join('\n')+'\nglobalThis.stats=StatsUI;',cx);
const click=s=>{const el=$(s);assert(el,'missing '+s);assert(!el.disabled,'disabled '+s);el.click();};
(async()=>{
 cx.stats.init({api,toast:t=>toasts.push(t),canEdit:()=>true,toggleEdit(){},openTeam(){},requestEdit:f=>f?.(),getDrills:()=>catalog});await tick();
 click('[data-training-card]');click('#training-drill-add');
 assert($('#drill-picker-dialog').open);assert.equal($('#drill-picker-dialog .stats-players-content'),null,'picker does not inherit roster modal widths');
 const longRow=$('[data-drill-pick="long"]').closest('.drill-picker-item');assert.equal(longRow.querySelector('.drill-picker-copy strong').textContent,catalog[1].name);assert(longRow.querySelector('button'),'add stays in its own grid column');
 click('[data-drill-pick="long"]');await tick();assert(!$('#drill-picker-dialog').open);assert($('#training-drills').textContent.includes(catalog[1].name));
 click('#training-drills [data-team-drill]');assert($('#training-dialog').open,'opening a Drill preserves the parent training for phone Back');
 click('#training-drill-add');assert.equal($('[data-drill-pick="long"]'),null,'already added Drills are filtered out');click('#drill-picker-close');
 click('#training-tab-games');click('#training-games [data-stats-game]');
 assert(!$('#stats-game-sub').textContent.includes('外部'));assert(!$('#stats-score-b-box').hidden);assert.equal($('#stats-score-label').textContent,'A 队');assert($('#rec-pass').disabled);
 click('#stats-game-date-edit');assert($('#stats-opponent-field').hidden);assert($('#stats-game-opponent').disabled);$('#stats-new-game-dialog').close();
 click('#rec-point');assert($('#stats-recorder').classList.contains('scrimmage-setting'));assert($('#point-confirm').disabled);
 click('[data-stats-chip="1"]');click('[data-stats-chip="2"]');click('[data-pick-side="b"]');click('[data-stats-chip="3"]');click('[data-stats-chip="4"]');assert(!$('#point-confirm').disabled);
 click('[data-stats-chip="1"]');assert($('[data-stats-chip="1"]').classList.contains('side-b'),'assigning an A player to B transfers them');
 click('[data-stats-chip="1"]');click('[data-pick-side="a"]');click('[data-stats-chip="1"]');
 click('[data-pick-side="b"]');for(let i=5;i<=9;i++)click('[data-stats-chip="'+i+'"]');click('[data-stats-chip="10"]');assert(!$('[data-stats-chip="10"]').classList.contains('side-b'),'the UI caps each side at seven');
 for(let i=5;i<=9;i++)click('[data-stats-chip="'+i+'"]');
 click('#point-defense');click('#point-confirm');await tick();
 assert.deepEqual(calls.at(-1).body.sides,{a:[2,1],b:[3,4],offense:'b'});assert.equal($('#stats-chips').querySelectorAll('button').length,4);assert($('#stats-show-all').hidden);
 click('[data-stats-chip="1"]');click('[data-stats-chip="3"]');assert($('#rec-pass').disabled,'cross-team selection changes holder instead of forming a pass');
 click('[data-stats-chip="4"]');click('#rec-goal');await tick();assert.equal($('#stats-score-b').textContent,'1');assert.equal($('#stats-score-us').textContent,'0');assert($('#rec-goal').disabled);assert(!$('#rec-undo').disabled,'a scored point can still be undone');
 click('#rec-undo');await tick();assert.equal($('#stats-score-b').textContent,'0');
 click('[data-stats-chip="3"]');click('#rec-defense');await tick();click('[data-stats-chip="3"]');click('[data-stats-chip="4"]');click('#rec-goal');await tick();
 click('#rec-point');assert.equal($('#point-offense').getAttribute('aria-pressed'),'true','after B scores A receives next');assert($('[data-pick-side="a"]').textContent.includes('2/7'),'the previous lineup is retained');
 click('#point-confirm');await tick();click('[data-stats-chip="1"]');click('[data-stats-chip="2"]');click('#rec-goal');await tick();assert.equal($('#stats-score-us').textContent,'1');assert.equal($('#stats-score-b').textContent,'1');
 click('#stats-tab-log');assert($('#stats-event-log').textContent.includes('B 队得分'));assert($('#stats-event-log').textContent.includes('A 队得分'));assert(!$('#stats-event-log').textContent.includes('我方得分'));
 click('#stats-new-game');assert(!$('#stats-opponent-field').hidden,'formal matches retain the opponent input');assert(!$('#stats-game-opponent').disabled);$('#stats-new-game-dialog').close();
 $('#stats-game-dialog').close();click('#training-game-add');assert($('#stats-opponent-field').hidden,'new scrimmages have no opponent field');
 assert.equal($('#stats-game-date').value,'2026-10-29');
 console.log('PASS: long-name Drill selection and adding, mobile A/B setup, transfer and seven-player cap, per-point offense, score and undo, lineup reuse, same-team recording, two-side logs and formal-match isolation.');
})().catch(e=>{console.error(e);process.exitCode=1;});
