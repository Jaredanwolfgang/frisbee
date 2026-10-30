'use strict';
// 技术统计：队员名单（含性别）、每一分上场阵容、实时比赛记录与场均数据。读写复用 /api/stats 与编辑会话。
const StatsUI=(()=>{
 const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
 const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const STATS=[['goals','得分'],['assists','助攻'],['passes','传盘完成'],['turnovers','失误'],['steals','防守成功'],['points','上场分数'],['oPoints','进攻开'],['dPoints','防守开']];
 const ZERO={goals:0,assists:0,passes:0,turnovers:0,steals:0,points:0,oPoints:0,dPoints:0};
 const GENDER_MARK={male:'♂',female:'♀'};
 let deps=null,data={players:[],games:[],trainings:[]},revision=-1,loaded=false,error='',inflight=null,busy=false,me=null;
 let openGameId=null,sel={thrower:null,receiver:null},sort={key:'goals',dir:1},editingId=null,formGender='male';
 let pointMode=false,pointSel=new Set(),pointStart='offense',pointSide='a',pointSides={a:new Set(),b:new Set()},editingGameId=null;
 let openTrainingId=null,attendSel=new Set(),attendDirty=false,scrimmageTrainingId=null;
 let trainingPane='plan',gamePane='record',chipQuery='',showAllPlayers=false,teamHub=null,discussionUI=null,drillJournal=null,messagesUI=null,notifications={unread:0,trainings:{}},readingTraining=null;

 const metricGroups={attack:['goals','assists','passes'],defense:['turnovers','steals'],line:['points','oPoints','dPoints'],all:STATS.map(([k])=>k)};
 const clearChipSearch=()=>{chipQuery='';$('#stats-chip-search').value='';};
 function focusStatsForm(dialog,field){const title=$(dialog+' h2');if(MobileUI.isPhone()){title?.focus({preventScroll:true});}else $(field).focus();}
 function syncGamePane(){const body=$('#stats-game-dialog .stats-game-body');body.dataset.pane=gamePane;$$('[data-stats-pane]').forEach(panel=>panel.hidden=panel.dataset.statsPane!==gamePane);$$('[data-stats-tab]').forEach(b=>{const selected=b.dataset.statsTab===gamePane;b.setAttribute('aria-selected',String(selected));b.tabIndex=selected?0:-1;});}
 function syncTrainingPane(){
  $('#training-body').dataset.trainingView=trainingPane;
  $$('[data-training-pane]').forEach(panel=>panel.hidden=panel.dataset.trainingPane!==trainingPane);
  $$('[data-training-tab]').forEach(button=>{const selected=button.dataset.trainingTab===trainingPane;button.setAttribute('aria-selected',String(selected));button.tabIndex=selected?0:-1;});
 }
 function bindViewTabs(nav,selector,key,select){
  const buttons=$$(selector);
  buttons.forEach(button=>bindTap(button,()=>select(button.dataset[key])));
  $(nav).addEventListener('keydown',event=>{const index=buttons.indexOf(document.activeElement);if(index<0||!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();const next=event.key==='Home'?0:event.key==='End'?buttons.length-1:(index+(event.key==='ArrowRight'?1:-1)+buttons.length)%buttons.length;select(buttons[next].dataset[key]);buttons[next].focus();});
 }
 const gameDate=g=>g.heldOn||'日期未设置';
 const trainingStatus={planned:'计划中',completed:'已完成',cancelled:'已取消'};
 function activityCard({attribute,id,name,status,label,heldOn,meta,count,unit,unread=false}){
  return '<button type="button" class="stats-game-card'+(unread?' has-alert':'')+'" '+attribute+'="'+esc(id)+'"><span class="stats-badge '+esc(status)+'">'+esc(label)+'</span><span class="stats-game-card-main"><strong>'+esc(name)+'</strong><span class="team-activity-date"><time'+(/^\d{4}-\d{2}-\d{2}$/.test(heldOn)?' datetime="'+esc(heldOn)+'"':'')+'>'+esc(heldOn)+'</time></span><span class="team-activity-meta">'+esc(meta)+'</span></span><span class="stats-game-card-side"><b>'+count+'</b><small>'+esc(unit)+'</small></span><span class="row-arrow" aria-hidden="true">›</span></button>';
 }
 const isScrimmage=g=>!!g&&(!!g.trainingId||data.trainings.some(t=>t.games.some(x=>x.id===g.id)));
 const sideName=side=>side==='a'?'A 队':'B 队';
 function gameCard(g){const internal=isScrimmage(g),score=TeamMetrics.score(g);return activityCard({attribute:'data-stats-game',id:g.id,unread:!!notifications.games?.[g.id],name:g.name,status:g.status,label:g.status==='live'?'进行中':'已结束',heldOn:gameDate(g),meta:(internal?'队内对抗 · ':g.opponent?'vs '+g.opponent+' · ':'')+g.events.length+' 条记录'+(g.video?' · ▶ 视频':'')+(internal&&score.unassigned?' · '+score.unassigned+' 次历史得分未分队':''),count:internal?score.a+' : '+score.b:g.events.filter(e=>e.kind==='goal').length,unit:internal?'A 队 / B 队':'得分'});}
 function metricView(target,value){const select=$('#stats-'+target+'-view'),table=$('#'+(target==='average'?'stats-averages':'stats-boxscore'));select.value=metricGroups[value]?value:'attack';table.closest('.stats-table-wrap').dataset.statsView=select.value;document.querySelector('[data-scroll-for="'+table.id+'"]').hidden=select.value!=='all';if(target==='average'&&!metricGroups[select.value].includes(sort.key)&&sort.key!=='name'&&sort.key!=='attendance'){sort={key:metricGroups[select.value][0],dir:1};renderAverages();}}
 const pad=n=>String(n).padStart(2,'0');
 const clock=ms=>{const d=new Date(ms||Date.now());return pad(d.getHours())+':'+pad(d.getMinutes());};
 const playerName=id=>{const p=data.players.find(p=>p.id===id);return p?'#'+p.number+' '+p.name:'已删除队员';};
 const genderMark=p=>p&&GENDER_MARK[p.gender]?'<b class="stats-g g-'+p.gender+'">'+GENDER_MARK[p.gender]+'</b>':'';
 const canEdit=()=>!!deps?.canEdit();
 const active=()=>document.body.classList.contains('stats-mode')||document.body.classList.contains('trainings-mode');

 function tally(totals,id,key){if(id==null)return;const row=totals[id]||(totals[id]={...ZERO});row[key]++;}
 function applyEvent(totals,e){
  if(e.kind==='pass')tally(totals,e.from,'passes');
  else if(e.kind==='goal'){tally(totals,e.from,'passes');tally(totals,e.from,'assists');tally(totals,e.to,'goals');}
  else if(e.kind==='turnover')tally(totals,e.to??e.from,'turnovers');
  else if(e.kind==='defense')tally(totals,e.from,'steals');
  else if(e.kind==='point'){(e.line||[]).forEach(id=>{tally(totals,id,'points');tally(totals,id,TeamMetrics.pointStart(e,id)==='defense'?'dPoints':'oPoints');});}
 }
 const gameTotals=game=>{const t={};(game.events||[]).forEach(e=>applyEvent(t,e));return t;};
 const seasonTotals=()=>{const finished=data.games.filter(g=>g.status==='finished'),t={};finished.forEach(g=>g.events.forEach(e=>applyEvent(t,e)));return{totals:t,games:finished.length};};

 function renderMeta(){
  $('#stats-meta').textContent=!loaded&&error?'连接失败：'+error:(!loaded?'正在加载…':data.players.length+' 名队员 · '+data.games.length+' 场比赛'+(canEdit()?'':' · 查看模式'));
  $('#stats-new-game').hidden=$('#stats-players-btn').hidden=!canEdit();
  $('#stats-players-btn').disabled=!loaded&&!error;$('#stats-new-game').disabled=!loaded&&!error;
  const meBox=$('#stats-me');
  meBox.hidden=!me;
  meBox.hidden=true;
  if(me)meBox.innerHTML='已登录：<b>#'+me.number+' '+esc(me.name)+'</b>（可参与赛后讨论）';
  $('#stats-logout').hidden=!me;
  $('#stats-name-options').innerHTML=data.players.map(p=>'<option value="'+esc(p.name)+'">').join('');
 }
 function fitAverageViewport(){const table=$('#stats-averages'),wrap=$('#team-averages-scroll'),rows=[...table.querySelectorAll('tbody tr')];$('#team-averages-hint').hidden=rows.length<=6;if(!rows.length){wrap.style.removeProperty('--team-table-height');return;}const bottom=rows[Math.min(6,rows.length)-1].getBoundingClientRect().bottom,top=table.getBoundingClientRect().top;if(bottom>top)wrap.style.setProperty('--team-table-height',Math.ceil(bottom-top)+'px');}
 function renderAverages(){
  const {totals,games}=seasonTotals(),table=$('#stats-averages'),empty=$('#stats-averages-empty'),wrap=$('#team-averages-scroll'),scroll={top:wrap.scrollTop,left:wrap.scrollLeft};
  $('#stats-average-note').textContent=games?'按 '+games+' 场已结束比赛平均 · 小字为总计':'结束后计入场均';
  if(!data.players.length){table.innerHTML='';fitAverageViewport();empty.hidden=false;empty.textContent='还没有队员。点「管理队员」添加盘名、号码和性别。';return;}
  empty.hidden=true;
  const trainings=data.trainings||[],today=localDate(),totalTrainings=trainings.filter(t=>TeamMetrics.eligible(t,null,today)).length;
  const attend=p=>{const a=TeamMetrics.attendance(trainings,p,today);return a.total?{n:a.present,r:a.present/a.total,total:a.total}:null;};
  $('#stats-average-note').textContent=(games?'按 '+games+' 场已结束比赛平均 · 小字为总计':'结束后计入场均')+(totalTrainings?' · 出勤率按 '+totalTrainings+' 次训练':'');
  const rows=data.players.map(p=>({p,t:totals[p.id]||ZERO}));
  const sortValue=row=>sort.key==='attendance'?(attend(row.p)?.r??-1):row.t[sort.key];
  rows.sort((a,b)=>{if(sort.key==='name')return (a.p.number-b.p.number)*(sort.dir>0?1:-1)||a.p.number-b.p.number;return (sortValue(b)-sortValue(a))*(sort.dir>0?1:-1)||a.p.number-b.p.number;});
  const avg=n=>games?(n/games).toFixed(1):'—';
  const attendCell=p=>{const a=attend(p);return '<td title="出勤 / 应计训练；入队前已登记的出勤计入，未出勤的入队前训练不算缺勤"><b>'+(a?Math.round(a.r*100)+'%':'—')+'</b><small>'+(a?a.n+'/'+a.total:'—')+'</small></td>';};
  table.innerHTML='<thead><tr>'+[['name','队员'],...STATS].map(([k,t])=>'<th'+(k==='name'?'':' data-stat="'+k+'"')+'><button type="button" data-stats-sort="'+k+'">'+t+(sort.key===k?(sort.dir>0?' ↓':' ↑'):'')+'</button></th>').join('')+'<th><button type="button" data-stats-sort="attendance">出勤率'+(sort.key==='attendance'?(sort.dir>0?' ↓':' ↑'):'')+'</button></th></tr></thead><tbody>'+
   rows.map(({p,t})=>'<tr><th scope="row"><span class="stats-number">#'+p.number+'</span><span class="stats-table-name" title="'+esc(p.name)+'">'+esc(p.name)+'</span>'+genderMark(p)+'</th>'+STATS.map(([k])=>'<td data-stat="'+k+'"><b>'+avg(t[k])+'</b><small>'+t[k]+'</small></td>').join('')+attendCell(p)+'</tr>').join('')+'</tbody>';
  fitAverageViewport();wrap.scrollTop=scroll.top;wrap.scrollLeft=scroll.left;
 }
 function renderGames(){
  const box=$('#stats-games'),empty=$('#stats-games-empty');
  const live=data.games.filter(g=>g.status==='live').length;
  $('#stats-games-note').textContent=data.games.length?(data.games.length+' 场'+(live?' · '+live+' 场进行中':'')):'';
  empty.hidden=!!data.games.length;
  box.innerHTML=TeamMetrics.gamesByDate(data.games).map(gameCard).join('');
 }
 const findGameContainer=id=>{
  const g=data.games.find(g=>g.id===id);
  if(g)return g;
  for(const t of data.trainings){const hit=t.games.find(g=>g.id===id);if(hit)return hit;}
  return null;
 };
 const currentGame=()=>openGameId?findGameContainer(openGameId):null;
 const currentTraining=()=>data.trainings.find(t=>t.id===openTrainingId)||null;
 function pointState(g){
  // Returns {point, open, count}: the latest lineup entry, whether that point is still open, and how many points have been recorded.
  let point=null,goalAfter=false,count=0;
  for(const e of g.events){
   if(e.kind==='point'){point=e;count++;goalAfter=false;}
   else if(e.kind==='goal')goalAfter=true;
  }
  return {point,open:!!point&&!goalAfter,count};
 }

 function renderChips(editable){
  const box=$('#stats-chips'),scroll=box.scrollTop,g=currentGame(),line=g?pointState(g).point?.line:null,internal=isScrimmage(g),all=$('#stats-show-all');
  all.hidden=internal||pointMode||!line?.length;all.setAttribute('aria-pressed',String(showAllPlayers));all.textContent=showAllPlayers?'仅本分阵容':'全部 '+data.players.length+' 人';
  if(!data.players.length){box.innerHTML='<p class="stats-empty">名单为空，先在「管理队员」里添加队员。</p>';return;}
  $('#stats-chip-search').placeholder=!pointMode&&line?.length&&!showAllPlayers?'搜索本分队员':'搜索盘名或号码';
  const players=data.players.filter(p=>(pointMode||showAllPlayers||!line?.length||line.includes(p.id))&&(!chipQuery||(p.name+' '+p.number).toLowerCase().includes(chipQuery)));
  box.innerHTML=players.map(p=>{
   const role=pointMode?(pointSel.has(p.id)?'line':''):(p.id===sel.thrower?'thrower':p.id===sel.receiver?'receiver':'');
   const side=internal?(pointMode?(pointSides.a.has(p.id)?'a':pointSides.b.has(p.id)?'b':null):TeamMetrics.sideOf(pointState(g).point,p.id)):null;
   const badge=(side?side.toUpperCase()+'队'+(!pointMode&&role?'·':''):'')+(pointMode?(internal?'':role==='line'?'场上':''):role==='thrower'?(sel.receiver!=null?'传盘':'持盘'):role==='receiver'?'接盘':role==='line'?'场上':'');
   return '<button type="button" class="stats-chip'+(side?' side-'+side:'')+(role?' is-'+role:'')+'" data-stats-chip="'+p.id+'" aria-label="#'+p.number+' '+esc(p.name)+(badge?'，'+badge:'')+'" title="'+esc(p.name)+'" aria-pressed="'+(!!role)+'"'+(editable&&(!internal||pointMode||(pointState(g).open&&!!pointState(g).point?.sides))?'':' disabled')+'><span class="stats-number">#'+p.number+'</span><span class="stats-chip-name">'+esc(p.name)+'</span>'+genderMark(p)+(badge?'<i>'+badge+'</i>':'')+'</button>';
  }).join('')||'<p class="stats-empty">没有匹配的队员，试试盘名或号码。</p>';
  box.scrollTop=scroll;
 }
 function renderPointUI(g,editable){
  const state=pointState(g),info=$('#stats-point-info'),btn=$('#rec-point'),setup=$('#stats-point-setup');
  const internal=isScrimmage(g);$('#scrimmage-team-setup').hidden=!internal;$('#stats-recorder').classList.toggle('scrimmage-setting',internal&&pointMode);
  info.innerHTML=internal?(!state.point?.sides?'先选择两队本分上场队员与进攻方':state.open?'<b>第 '+state.count+' 分</b> · '+sideName(state.point.sides.offense)+'进攻开 · '+state.point.sides.a.length+' vs '+state.point.sides.b.length:'第 '+state.count+' 分已结束，可沿用阵容开始下一分'):!state.point?'尚未记录上场阵容；不影响传盘记录':state.open
   ?'<b>第 '+state.count+' 分</b> · '+(state.point.start==='defense'?'防守开':'进攻开')+' · 场上 '+state.point.line.length+' 人'
   :'第 '+state.count+' 分已结束，点「新的一分」记录下一分阵容';
  btn.textContent=internal&&!state.point?.sides?'选择两队阵容':'＋ 新的一分';btn.hidden=!editable||pointMode;
  setup.hidden=!pointMode;
  $('.stats-point-actions').hidden=!pointMode;
  if(pointMode){
   $$('[data-pick-side]').forEach(button=>{const side=button.dataset.pickSide,ids=[...pointSides[side]];button.disabled=!editable;button.setAttribute('aria-pressed',String(pointSide===side));button.setAttribute('aria-label','调整'+sideName(side)+'阵容，已选 '+ids.length+' 人');button.innerHTML='<strong>'+sideName(side)+' <small>'+ids.length+'/7</small></strong><span>'+esc(ids.map(id=>data.players.find(p=>p.id===id)?.name||'').join('、')||'点选下方队员')+'</span>';});
   $('#point-offense').textContent=internal?'A 攻 · B 防':'进攻开';$('#point-defense').textContent=internal?'B 攻 · A 防':'防守开';$('#point-offense').disabled=$('#point-defense').disabled=!editable;
   $('#point-offense').setAttribute('aria-pressed',String(pointStart==='offense'));
   $('#point-defense').setAttribute('aria-pressed',String(pointStart==='defense'));
   $('#point-setup-note').textContent=internal?'正在选 '+sideName(pointSide)+'：点队员加入或移除，可直接换队。':'点选本分上场队员（已选 '+pointSel.size+' 人）'+(state.point?' · 上一分'+(state.point.start==='defense'?'防守':'进攻')+'开':'');
   $('#point-confirm').disabled=busy||(internal?(!pointSides.a.size||!pointSides.b.size):!pointSel.size);$('#point-confirm').textContent=internal?'开始这一分':'确认上场';
  }
 }
 function renderActions(editable,g){
  const state=pointState(g),internal=isScrimmage(g),canUndo=editable;if(internal&&(!state.open||!state.point?.sides))editable=false;
  const t=sel.thrower!=null,r=sel.receiver!=null,pair=t&&r;
  $('.stats-actions').hidden=pointMode;$('.stats-undo-row').hidden=pointMode;
  $('#rec-pass').disabled=!editable||!pair;$('#rec-goal').disabled=!editable||!pair;
  $('#rec-turn').disabled=!editable||!t;$('#rec-defense').disabled=!editable||!t||r;
  $('#rec-undo').disabled=!canUndo||!g.events.length;$('#rec-clear').disabled=!t;
  $('#rec-turn-note').textContent=pair?'记在接盘人（掉盘）':'记在持盘人（传丢）';
  $('#stats-recorder-hint').textContent=!canEdit()?'开启编辑后可记录':g.status!=='live'?'比赛已结束；在「比赛操作」中点「重新开始」可继续记录':pointMode?(internal?'分别选好两队，再选谁进攻开':'选择上场队员和进攻 / 防守开，确认后开始记录这一分'):internal&&(!state.open||!state.point?.sides)?'先设置新一分的两队阵容，再记录传盘与得分':!t?'点一名队员作为持盘人；记 D 防守成功也先点防守队员':!r?playerName(sel.thrower)+'：再点接盘人，或直接记失误 / D':playerName(sel.thrower)+' → '+playerName(sel.receiver)+'：记传盘、得分，或接盘失误';
 }
 function renderBoxScore(g){
  const totals=gameTotals(g),table=$('#stats-boxscore'),empty=$('#stats-boxscore-empty');
  const rows=data.players.filter(p=>totals[p.id]).map(p=>({p,t:totals[p.id]}));
  empty.hidden=!!rows.length;
  if(!rows.length){table.innerHTML='';return;}
  rows.sort((a,b)=>(b.t.goals+b.t.assists)-(a.t.goals+a.t.assists)||a.p.number-b.p.number);
  table.innerHTML='<thead><tr><th>队员</th>'+STATS.map(([k,t])=>'<th data-stat="'+k+'">'+t+'</th>').join('')+'</tr></thead><tbody>'+
   rows.map(({p,t})=>'<tr><th scope="row"><span class="stats-number">#'+p.number+'</span><span class="stats-table-name" title="'+esc(p.name)+'">'+esc(p.name)+'</span>'+genderMark(p)+'</th>'+STATS.map(([k])=>'<td data-stat="'+k+'">'+t[k]+'</td>').join('')+'</tr>').join('')+'</tbody>';
 }
 function describe(e,pointNumber){
  if(e.kind==='point')return '<em class="point">第 '+pointNumber+' 分 · '+(e.start==='defense'?'防守开':'进攻开')+' · 场上 '+(e.line||[]).map(id=>esc(playerName(id))).join('、')+'</em>';
  if(e.kind==='pass')return esc(playerName(e.from))+' <i>→</i> '+esc(playerName(e.to))+'<em>传盘</em>';
  if(e.kind==='goal')return esc(playerName(e.from))+' <i>→</i> '+esc(playerName(e.to))+'<em class="goal">得分</em>';
  if(e.kind==='turnover')return e.to!=null?esc(playerName(e.from))+' <i>→</i> '+esc(playerName(e.to))+'<em class="turn">掉盘失误</em>':esc(playerName(e.from))+'<em class="turn">传丢失误</em>';
  return esc(playerName(e.from))+'<em class="d">D 防守成功</em>';
 }
 function describePlain(e,pointNumber){
  if(e.kind==='point'&&e.sides)return '第 '+pointNumber+' 分阵容（A 队 '+e.sides.a.length+' 人，B 队 '+e.sides.b.length+' 人，'+sideName(e.sides.offense)+'进攻开）';
  if(e.kind==='point')return '第 '+pointNumber+' 分阵容（'+(e.start==='defense'?'防守开':'进攻开')+'，'+(e.line||[]).length+' 人）';
  if(e.kind==='pass')return playerName(e.from)+' → '+playerName(e.to)+' 传盘';
  if(e.kind==='goal')return playerName(e.from)+' → '+playerName(e.to)+' 得分';
  if(e.kind==='turnover')return e.to!=null?playerName(e.to)+' 掉盘失误':playerName(e.from)+' 传丢失误';
  return playerName(e.from)+' D 防守成功';
 }
 const pointOrdinal=(g,seq)=>g.events.filter(e=>e.kind==='point'&&e.seq<=seq).length;
 const eventRow=e=>'<div class="stats-event-row"><span class="stats-desc">'+describe(e)+'</span><time>'+clock(e.at)+'</time></div>';
 function renderLog(g){
  const box=$('#stats-event-log');
  const expanded=new Map([...box.querySelectorAll('[data-point-key]')].map(el=>[el.dataset.pointKey,el.open]));
  if(!g.events.length){box.innerHTML='<p class="stats-empty">每一分的得分结果会显示在这里；点开一分可看上场阵容和每一手传递。</p>';return;}
  const groups=[];let loose=[];
  for(const e of g.events){
   if(e.kind==='point')groups.push({point:e,events:[]});
   else if(groups.length)groups[groups.length-1].events.push(e);
   else loose.push(e);
  }
  let html='';
  if(loose.length)html+='<details class="stats-point-group loose"><summary><span class="stats-point-title">未记录阵容的记录</span><span class="stats-point-meta">'+loose.length+' 条</span></summary><div class="stats-point-body">'+loose.map(eventRow).join('')+'</div></details>';
  groups.forEach((grp,i)=>{
   const n=i+1,goal=grp.events.find(e=>e.kind==='goal'),hasGoal=!!goal,isLast=i===groups.length-1;
   const live=!hasGoal&&isLast&&g.status==='live';
   const result=hasGoal?'<em class="us">'+(isScrimmage(g)?(goal.side?sideName(goal.side)+'得分':'未分队得分'):'我方得分')+'</em>':live?'<em class="livebit">进行中</em>':'<em class="unrecorded">未记录结果</em>';
   const start=grp.point.sides?sideName(grp.point.sides.offense)+'进攻开':grp.point.start==='defense'?'防守开':'进攻开';
   const key=String(grp.point.seq),open=expanded.has(key)?expanded.get(key):live;
   html+='<details class="stats-point-group" data-point-key="'+key+'"'+(open?' open':'')+'><summary><span class="stats-point-no">'+pad(n)+'</span><span class="stats-point-title">第 '+n+' 分</span>'+result+'<span class="stats-point-meta">'+start+' · '+grp.point.line.length+' 人 · '+grp.events.length+' 条记录</span></summary>'
    +'<div class="stats-point-body">'+(grp.point.sides?['a','b'].map(side=>'<div class="stats-point-line"><b>'+sideName(side)+' · '+(grp.point.sides.offense===side?'进攻开':'防守开')+'</b>'+grp.point.sides[side].map(id=>esc(playerName(id))).join('、')+'</div>').join(''):'<div class="stats-point-line"><b>上场</b>'+(grp.point.line.map(id=>esc(playerName(id))).join('、')||'未记录')+'<b>本分起始</b>'+start+'</div>')
    +(grp.events.length?grp.events.map(eventRow).join(''):'<p class="stats-empty">这一分没有记录传递。</p>')+'</div></details>';
  });
  box.innerHTML=html;
 }
 function renderVideo(g){
  const link=$('#stats-game-video-link');
  if(g.video){link.hidden=false;link.href='#';}else{link.hidden=true;link.removeAttribute('href');}
 }
 function discussionVisible(kind,pane){const dialog=$('#'+(kind==='games'?'stats-game-dialog':'training-dialog'));return pane==='comments'&&dialog.open&&active()&&!document.hidden&&!$$('dialog').some(other=>other.open&&other!==dialog&&other.id!=='team-notifications-dialog'&&!(kind==='games'&&other.id==='training-dialog'));}
 function renderComments(g){const visible=discussionVisible('games',gamePane);discussionUI?.render($('#game-discussion'),'games',g,visible);discussionUI?.syncUnread($('#stats-tab-comments'),'games',g,visible);syncMentionRead('games',g,visible,$('#stats-tab-comments'));}
 function renderGame(){
  const g=currentGame(),dlg=$('#stats-game-dialog');
  if(!g){openGameId=null;if(dlg.open){dlg.close();deps.toast('这场比赛已被删除。');}return;}
  $('#stats-game-close').setAttribute('aria-label',$('#training-dialog').open?'返回训练赛':$('#team-notifications-dialog').open?'返回消息':'返回比赛列表');
  const editable=canEdit()&&g.status==='live'&&!busy;
  syncGamePane();
  $('#stats-game-title').textContent=g.name;
  $('#stats-game-sub').textContent=gameDate(g)+(isScrimmage(g)?' · 队内对抗':g.opponent?' · vs '+g.opponent:'')+' · '+(g.status==='live'?'进行中':'已结束');
  renderVideo(g);
  $('#stats-game-status').textContent=g.status==='live'?'结束比赛':'重新开始';
  $('#stats-game-status').hidden=!canEdit();$('#stats-game-date-edit').hidden=!canEdit();$('#stats-game-unlock').hidden=canEdit();$('.stats-game-more').hidden=!canEdit();
  const internal=isScrimmage(g),score=TeamMetrics.score(g);$('#stats-score-label').textContent=internal?'A 队':'我们';$('#stats-score-b-box').hidden=!internal;$('#stats-score-b').textContent=score.b;$('#stats-score-us').textContent=internal?score.a:g.events.filter(e=>e.kind==='goal').length;$('#stats-score-unassigned').hidden=!internal||!score.unassigned;$('#stats-score-unassigned').textContent=score.unassigned+' 次历史得分未分队';
  $('#stats-event-count').textContent=g.events.length+' 条记录 · '+pointState(g).count+' 分';
  renderChips(editable);renderPointUI(g,editable);renderActions(editable,g);renderBoxScore(g);renderLog(g);renderComments(g);
 }
 function renderPlayers(){
  const box=$('#stats-players-list'),scroll=box.scrollTop;
  box.innerHTML=data.players.length?data.players.map(p=>'<div class="stats-player-row'+(p.id===editingId?' is-editing':'')+'"><span class="stats-number">#'+p.number+'</span><strong>'+esc(p.name)+'</strong><span class="stats-gender '+(p.gender==='female'?'f':'m')+'">'+(p.gender==='female'?'女':p.gender==='male'?'男':'未设置')+'</span><small class="team-login-ready">'+(p.loginReady?'已设口令':'待设口令')+'</small><button type="button" class="quiet-btn" data-stats-edit="'+p.id+'">修改</button><button type="button" class="quiet-btn danger-text" data-stats-delete="'+p.id+'">删除</button></div>').join(''):'<p class="stats-empty">还没有队员。在上方填好盘名、号码和性别后点「添加队员」。</p>';
  box.scrollTop=scroll;$('#stats-player-save').textContent=editingId?'保存修改':'添加队员';$('#stats-player-password').required=!editingId;$('#stats-player-cancel').hidden=!editingId;
 }
 function renderAll(){renderMeta();renderAverages();renderGames();renderPlayers();renderTrainingsPanel();if($('#stats-game-dialog').open)renderGame();if($('#training-dialog').open)renderTraining();teamHub?.render();messagesUI?.update();}
 function renderTrainingsPanel(){
  const meta=$('#trainings-meta');if(!meta)return;
  meta.textContent=!loaded&&error?'连接失败：'+error:(!loaded?'正在加载…':data.trainings.length+' 次训练 · '+data.players.length+' 名队员'+(canEdit()?'':' · 查看模式'));
  $('#trainings-new').disabled=!loaded&&!error;$('#trainings-new').hidden=!canEdit();
  const box=$('#trainings-list'),empty=$('#trainings-empty');
  empty.hidden=!!data.trainings.length;
  box.innerHTML=data.trainings.map(t=>activityCard({attribute:'data-training-card',id:t.id,unread:!!notifications.trainings[t.id],name:t.name,status:t.status,label:trainingStatus[t.status]||'训练',heldOn:t.heldOn,meta:t.drills.length+' 个 Drill · '+t.games.length+' 场训练赛'+(t.comments.some(c=>!c.deleted)?' · '+t.comments.filter(c=>!c.deleted).length+' 条发言':''),count:t.attendees.length,unit:'出勤'})).join('');
 }
 function renderAttendance(t,editable){
  const note=$('#training-attendance-note');
  note.textContent=!data.players.length?'先在盘队中心添加队员':editable?'点选本次出勤的队员，保存后计入出勤率':'查看模式 · 出勤由编辑者记录';
  $('#training-attendance-chips').innerHTML=data.players.length?data.players.map(p=>{
   const on=attendSel.has(p.id);
   return '<button type="button" class="stats-chip'+(on?' is-line':'')+'" data-attend-chip="'+p.id+'" aria-pressed="'+on+'"'+(editable?'':' disabled')+'><span class="stats-number">#'+p.number+'</span><span class="stats-chip-name">'+esc(p.name)+'</span>'+genderMark(p)+(on?'<i>出勤</i>':'')+'</button>';
  }).join(''):'<p class="stats-empty">名单为空。</p>';
  $('#training-attendance-save').hidden=!editable||!attendDirty;
  $('#training-attendance-save').disabled=busy;
  $('#training-attendance-hint').textContent=editable?'已选 '+attendSel.size+' / '+data.players.length+' 人':'';
 }
 function renderWarmup(t){
  const ta=$('#training-warmup'),dirty=ta.value!==t.warmup;
  if(document.activeElement!==ta&&!dirty)ta.value=t.warmup;
  ta.readOnly=!canEdit();
  $('#training-warmup-save').hidden=!canEdit();$('#training-warmup-save').disabled=busy||!dirty;
  $('#training-warmup-save').textContent=dirty?'保存热身 ·':'保存热身';
 }
 function renderDrills(t){
  drillJournal?.renderTraining($('#training-drills'),t,canEdit()&&!busy,revision);
  $('#training-drill-add').hidden=!canEdit();$('#training-drill-add').disabled=busy;
 }
 function renderTrainingGames(t){
  $('#training-games').innerHTML=t.games.length?TeamMetrics.gamesByDate(t.games).map(gameCard).join(''):'<p class="stats-empty">还没有训练赛。点「添加训练赛」记录队内对抗。</p>';
  $('#training-game-add').hidden=!canEdit();$('#training-game-add').disabled=busy;const unread=t.games.some(g=>notifications.games?.[g.id]);$('#training-tab-games').classList.toggle('has-unread',unread);$('#training-tab-games').setAttribute('aria-label',unread?'训练赛，有未读消息':'训练赛');
 }
 function applyNotifications(summary){notifications=summary||{unread:0,trainings:{}};renderAll();}
 function syncMentionRead(kind,entry,visible,tab){
  const unread=kind==='games'?notifications.games?.[entry.id]:(notifications.trainingComments?notifications.trainingComments[entry.id]:notifications.trainings[entry.id]);
  if(!visible&&unread)tab.classList.add('has-unread');
  if(visible&&me&&unread&&!readingTraining){const actor=me.id;readingTraining=kind+':'+entry.id;const context=kind==='games'?{gameId:entry.id}:{trainingId:entry.id};deps.api('stats/notifications/read',{method:'POST',body:JSON.stringify(context)}).then(result=>{if(me?.id===actor)applyNotifications(result.summary);}).catch(error=>deps.toast(error.message)).finally(()=>readingTraining=null);}
 }
 function renderTrainingComments(t){const visible=discussionVisible('trainings',trainingPane);discussionUI?.render($('#training-discussion'),'trainings',t,visible);discussionUI?.syncUnread($('#training-tab-comments'),'trainings',t,visible);syncMentionRead('trainings',t,visible,$('#training-tab-comments'));}
 function renderTraining(){
  const t=currentTraining(),dlg=$('#training-dialog');
  if(!t){openTrainingId=null;if(dlg.open){dlg.close();deps.toast('这次训练已被删除。');}return;}
  const editable=canEdit()&&!busy;
  $('#training-title').textContent=t.name;$('#training-close').setAttribute('aria-label',$('#team-notifications-dialog').open?'返回消息':'返回训练列表');
  $('#training-sub').textContent=t.heldOn+' · '+(trainingStatus[t.status]||'')+' · 出勤 '+t.attendees.length+' / '+data.players.length+' 人 · '+t.games.length+' 场训练赛';
  $('#training-unlock').hidden=canEdit();$('#training-more').hidden=!canEdit();$('#team-training-date-edit').hidden=!canEdit();syncTrainingPane();
  renderAttendance(t,editable);renderWarmup(t);renderDrills(t);renderTrainingGames(t);renderTrainingComments(t);
 }
 function openTraining(id){
  const t=data.trainings.find(t=>t.id===id);
  if(!t)return;
  openTrainingId=id;trainingPane='plan';attendSel=new Set(t.attendees);attendDirty=false;
  $('#training-warmup').value=t.warmup;
  renderTraining();
  $('#training-dialog').showModal();
  $('#training-body').scrollTop=0;
 }
 function openDrillPicker(){
  const t=currentTraining();
  if(!t)return;
  const have=new Set(t.drills.map(d=>d.id)),drills=(deps.getDrills?.()||[]).filter(d=>!have.has(d.id));
  $('#drill-picker-list').innerHTML=drills.length?drills.map(d=>'<div class="drill-picker-item"><span class="stats-drill-icon" aria-hidden="true">▶</span><div class="drill-picker-copy"><strong>'+esc(d.name)+'</strong>'+(d.summary?'<small>'+esc(d.summary)+'</small>':'')+'</div><button type="button" class="quiet-btn" data-drill-pick="'+esc(d.id)+'">添加</button></div>').join(''):'<p class="stats-empty">训练库里还没有可添加的 Drill，或都已添加。先在战术库新建 Drill。</p>';
  $('#drill-picker-dialog').showModal();$('#drill-picker-title').focus({preventScroll:true});
 }

 function render(){
  renderAll();
  if(!loaded&&!inflight)refresh();
 }
 async function refresh(force=false){
  if(inflight){await inflight;if(!force)return;}
  if(force)revision=-1;
  inflight=(async()=>{try{
   const d=await deps.api('stats'+(revision>=0?'?revision='+revision:''));
   error='';
   if('me' in d)me=d.me;notifications=d.notifications||{unread:0,trainings:{}};
   if(typeof d.canEdit==='boolean'&&deps.syncCanEdit)deps.syncCanEdit(d.canEdit);
   if(!d.unchanged){data={players:d.players||[],games:d.games||[],trainings:d.trainings||[]};revision=d.revision;}
   loaded=true;renderAll();
  }catch(e){error=e.message;if(!loaded)renderAll();}finally{inflight=null;}})();
  return inflight;
 }
 function apply(res){
  if(res.revision!=null){if(res.revision!==revision+1)revision=-1;else revision=res.revision;}
  return res;
 }
 async function mutate(path,options,onDone,playerAuth){
  if(busy)return null;busy=true;if($('#stats-game-dialog').open)renderGame();if($('#training-dialog').open)renderTraining();
  try{
   const res=apply(await deps.api(path,options));
   onDone?.(res);renderAll();return res;
  }catch(e){
   deps.toast(e.message);
   if(e.status===401&&!playerAuth)deps.onUnauthorized?.();
   return null;
  }finally{busy=false;renderAll();}
 }
 const sortPlayers=()=>data.players.sort((a,b)=>a.number-b.number||a.id-b.id);

 function tapChip(id){
  if(busy||!canEdit())return;id=Number(id);
  if(pointMode){if(isScrimmage(currentGame())){const chosen=pointSides[pointSide],other=pointSides[pointSide==='a'?'b':'a'];if(chosen.has(id))chosen.delete(id);else{if(chosen.size>=7){deps.toast('每队每分最多上场 7 人。');return;}const moved=other.delete(id);chosen.add(id);if(moved)deps.toast('已将 '+playerName(id)+' 移到'+sideName(pointSide));}pointSel=new Set([...pointSides.a,...pointSides.b]);}else pointSel.has(id)?pointSel.delete(id):pointSel.add(id);}
  else if(isScrimmage(currentGame())&&sel.thrower!=null&&TeamMetrics.sideOf(pointState(currentGame()).point,sel.thrower)!==TeamMetrics.sideOf(pointState(currentGame()).point,id))sel={thrower:id,receiver:null};
  else if(sel.receiver===id)sel.receiver=null;
  else if(sel.thrower===id){if(sel.receiver!=null)sel.receiver=null;else sel.thrower=null;}
  else if(sel.thrower==null)sel.thrower=id;
  else if(sel.receiver==null)sel.receiver=id;
  else sel={thrower:id,receiver:null};
  renderGame();
 }
 function beginPoint(){
  const g=currentGame();
  if(!g||g.status!=='live'||busy||!canEdit())return;
  const state=pointState(g),last=state.point;
  pointMode=true;pointSide='a';pointSides={a:new Set(last?.sides?.a||[]),b:new Set(last?.sides?.b||[])};pointSel=new Set(isScrimmage(g)?[...pointSides.a,...pointSides.b]:last?.line||[]);clearChipSearch();
  const lastIsGoal=g.events.length&&g.events[g.events.length-1].kind==='goal';
  pointStart=isScrimmage(g)?(lastIsGoal&&g.events[g.events.length-1].side?(g.events[g.events.length-1].side==='a'?'defense':'offense'):(last?.start||'offense')):lastIsGoal?'defense':(last?last.start:'offense');
  sel={thrower:null,receiver:null};
  renderGame();
 }
 async function confirmPoint(){
  const g=currentGame();
  const internal=isScrimmage(g);if(internal&&(!pointSides.a.size||!pointSides.b.size)){deps.toast('请分别为 A、B 两队选择至少一名上场队员。');return;}
  if(!g||!pointSel.size){deps.toast('请至少选择一名上场队员。');return;}
  const line=[...pointSel],start=pointStart,body=internal?{kind:'point',sides:{a:[...pointSides.a],b:[...pointSides.b],offense:start==='offense'?'a':'b'}}:{kind:'point',line,start};
  const res=await mutate('stats/games/'+g.id+'/events',{method:'POST',body:JSON.stringify(body)},r=>{g.events.push(r.event);pointMode=false;pointSel=new Set();showAllPlayers=false;clearChipSearch();});
  if(res)deps.toast('已记录第 '+pointState(g).count+' 分阵容，开始记录传盘。');
 }
 function cancelPoint(){pointMode=false;pointSel=new Set();clearChipSearch();renderGame();}
 async function record(kind){
  const g=currentGame();
  if(!g||g.status!=='live'||sel.thrower==null)return;
  const body={kind,from:sel.thrower};
  if(kind==='pass'||kind==='goal'){if(sel.receiver==null)return;body.to=sel.receiver;}
  if(kind==='turnover'&&sel.receiver!=null)body.to=sel.receiver;
  const wasReceiver=sel.receiver;
  const res=await mutate('stats/games/'+g.id+'/events',{method:'POST',body:JSON.stringify(body)},r=>{
   g.events.push(r.event);
   if(kind==='pass')sel={thrower:wasReceiver,receiver:null};else sel={thrower:null,receiver:null};
  });
  if(res&&kind==='goal')deps.toast(isScrimmage(g)?sideName(res.event.side)+'得分！· '+TeamMetrics.score(g).a+' : '+TeamMetrics.score(g).b:'得分！'+playerName(wasReceiver)+' · 当前 '+g.events.filter(e=>e.kind==='goal').length+' 分');
 }
 function undoEvent(){
  const g=currentGame();
  if(!g||g.status!=='live'||!g.events.length)return;
  mutate('stats/games/'+g.id+'/events',{method:'DELETE'},r=>{
   const last=g.events[g.events.length-1];
   if(last&&last.seq===r.removed.seq){g.events.pop();deps.toast('已撤销：'+describePlain(r.removed,pointOrdinal(g,r.removed.seq)));}
   else revision=-1;
   sel={thrower:null,receiver:null};
  });
 }
 function openGame(id){
  openGameId=id;sel={thrower:null,receiver:null};pointMode=false;pointSel=new Set();
  gamePane=currentGame()?.status==='finished'?'box':'record';chipQuery='';showAllPlayers=false;$('#stats-chip-search').value='';$('#stats-event-log').innerHTML='';
  renderGame();
  if(!currentGame())return;
  discussionUI?.stop($('#training-discussion'));$('#stats-game-dialog').showModal();
  $('.stats-game-body').scrollTop=0;
 }
 function openPlayers(){
  editingId=null;formGender='male';$('#stats-player-form').reset();syncGenderButtons();renderPlayers();
  $('#stats-player-password').value='';$('#stats-player-joined').value='';
  $('#stats-players-dialog').showModal();focusStatsForm('#stats-players-dialog','#stats-player-name');
 }
 function syncGenderButtons(){$$('.stats-gender-group [data-gender]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.gender===formGender)));}
 function openGameInfo(){
  const g=currentGame();
  editingGameId=g?g.id:null;
  if(!g)return;
  document.querySelectorAll('.more-menu').forEach(m=>m.open=false);
  $('#stats-video-field').hidden=false;const internal=isScrimmage(g);scrimmageTrainingId=internal?(g.trainingId||data.trainings.find(t=>t.games.some(x=>x.id===g.id))?.id):null;$('#stats-opponent-field').hidden=internal;$('#stats-game-opponent').disabled=internal;
  $('#stats-new-game-title').textContent=internal?'修改训练赛信息':'修改比赛信息';
  $('#stats-new-game-note').textContent=internal?'队内 A / B 两队对抗，每一分可重新选上场阵容。':'设置实际比赛日期，修改名称、对手和录像链接。';
  $('#stats-new-game-submit').textContent='保存';
  $('#stats-game-date').value=g.heldOn||'';$('#stats-game-name').value=g.name;$('#stats-game-opponent').value=g.opponent;$('#stats-game-video').value=g.video||'';
  $('#stats-new-game-dialog').showModal();focusStatsForm('#stats-new-game-dialog',internal?'#stats-game-name':'#stats-game-opponent');
 }

 function init(deps_){
  deps=deps_;
  bindViewTabs('#stats-game-dialog .stats-game-tabs','[data-stats-tab]','statsTab',pane=>{gamePane=pane;syncGamePane();if(currentGame())renderComments(currentGame());$('#stats-game-dialog .stats-game-body').scrollTop=0;});
  bindViewTabs('#training-dialog .stats-game-tabs','[data-training-tab]','trainingTab',pane=>{trainingPane=pane;syncTrainingPane();if(currentTraining())renderTrainingComments(currentTraining());$('#training-body').scrollTop=0;});
  if(window.ResizeObserver)new ResizeObserver(fitAverageViewport).observe($('#stats-averages'));else window.addEventListener('resize',fitAverageViewport);
  $('#stats-average-view').onchange=event=>metricView('average',event.target.value);
  $('#stats-box-view').onchange=event=>metricView('box',event.target.value);
  $('#stats-chip-search').oninput=event=>{chipQuery=event.target.value.trim().toLowerCase();const g=currentGame();renderChips(!!g&&canEdit()&&g.status==='live'&&!busy);};
  $('#stats-show-all').onclick=()=>{showAllPlayers=!showAllPlayers;chipQuery='';$('#stats-chip-search').value='';renderGame();};
  $$('[data-stats-close]').forEach(b=>b.onclick=()=>$('#'+b.dataset.statsClose).close());
  $('#stats-unlock').onclick=()=>deps.requestEdit();
  $('#stats-players-btn').onclick=()=>deps.requestEdit(openPlayers);
  $('#stats-new-game').onclick=()=>deps.requestEdit(()=>{
   editingGameId=null;scrimmageTrainingId=null;$('#stats-video-field').hidden=true;$('#stats-opponent-field').hidden=false;$('#stats-game-opponent').disabled=false;
   $('#stats-new-game-title').textContent='新建比赛';$('#stats-new-game-note').textContent='创建后进入实时记录；可以随时结束，结束后计入场均。';
   $('#stats-new-game-submit').textContent='开始记录';
   $('#stats-new-game-form').reset();
   $('#stats-new-game-dialog').showModal();focusStatsForm('#stats-new-game-dialog','#stats-game-name');
  });
  $$('.stats-gender-group [data-gender]').forEach(b=>b.onclick=()=>{formGender=b.dataset.gender;syncGenderButtons();});
  $('#stats-players-close').onclick=()=>$('#stats-players-dialog').close();
  $('#stats-player-cancel').onclick=()=>{editingId=null;$('#stats-player-form').reset();renderPlayers();focusStatsForm('#stats-players-dialog','#stats-player-name');};
  $('#stats-player-form').onsubmit=async e=>{
   e.preventDefault();
   const name=$('#stats-player-name').value.trim(),rawNumber=$('#stats-player-number').value;
   if(!name){deps.toast('请填写盘名。');$('#stats-player-name').focus();return;}
   if(rawNumber===''){deps.toast('请填写号码。');$('#stats-player-number').focus();return;}
   const number=Number(rawNumber);
   if(!Number.isInteger(number)||number<0||number>99){deps.toast('号码需为 0–99 的整数。');return;}
   if(formGender!=='male'&&formGender!=='female'){deps.toast('请选择性别。');return;}
   const password=$('#stats-player-password').value;
   if(!editingId&&!password){deps.toast('请为新队员设置至少 8 位个人口令。');$('#stats-player-password').focus();return;}
   const body=JSON.stringify({name,number,gender:formGender,password,joinedOn:$('#stats-player-joined').value});
   const wasEditing=editingId;
   const res=wasEditing?await mutate('stats/players/'+wasEditing,{method:'PUT',body}):await mutate('stats/players',{method:'POST',body},r=>{data.players.push(r.player);sortPlayers();});
   if(!res)return;
   if(wasEditing){const p=data.players.find(p=>p.id===wasEditing);if(p){Object.assign(p,res.player);}sortPlayers();}
   editingId=null;$('#stats-player-form').reset();await refresh();renderAll();
   deps.toast((wasEditing?'已修改 ':'已添加 ')+'#'+res.player.number+' '+res.player.name);
   focusStatsForm('#stats-players-dialog','#stats-player-name');
  };
  $('#stats-new-game-form').onsubmit=async e=>{
   e.preventDefault();
   const heldOn=$('#stats-game-date').value;
   if(!heldOn){deps.toast('请选择实际比赛日期。');return;}
   const fallback=heldOn+' '+(scrimmageTrainingId?'训练赛':'比赛');
   const name=$('#stats-game-name').value.trim()||fallback,opponent=scrimmageTrainingId?'':$('#stats-game-opponent').value.trim();
   let video=BiliVideo.extractURL($('#stats-game-video').value);
   if(video&&!/^https?:\/\//i.test(video))video='https://'+video;
   if(editingGameId){
    const id=editingGameId;
    const res=await mutate('stats/games/'+id,{method:'PUT',body:JSON.stringify({name,opponent,video,heldOn})},r=>{
     const g=findGameContainer(id);if(g){Object.assign(g,r.game);}
    });
    if(!res)return;
    editingGameId=null;scrimmageTrainingId=null;$('#stats-new-game-dialog').close();
    deps.toast('比赛信息已更新。');
    return;
   }
   const res=await mutate('stats/games',{method:'POST',body:JSON.stringify({name,opponent,video,heldOn,trainingId:scrimmageTrainingId||undefined})},r=>{
    const t=scrimmageTrainingId&&data.trainings.find(t=>t.id===scrimmageTrainingId);
    if(t)t.games.unshift(r.game);else data.games.unshift(r.game);
   });
   if(!res)return;
   const created=scrimmageTrainingId;
   scrimmageTrainingId=null;$('#stats-new-game-dialog').close();
   openGame(res.game.id);
   if(created){deps.toast('已创建训练赛，记录结果不计入场均。');beginPoint();}
   else{beginPoint();deps.toast('已创建比赛，先记录第 1 分的上场阵容。');}
  };
  const login=$('#stats-login').onclick=()=>{$('#stats-login-name').value='';$('#stats-login-password').value='';$('#stats-login-error').textContent='';$('#stats-login-dialog').showModal();focusStatsForm('#stats-login-dialog','#stats-login-name');};
  $('#stats-login-dialog').addEventListener('close',()=>$('#stats-login-password').value='');
  $('#stats-players-dialog').addEventListener('close',()=>$('#stats-player-password').value='');
  $('#stats-login-cancel').onclick=()=>$('#stats-login-dialog').close();
  $('#stats-login-form').onsubmit=async e=>{
   e.preventDefault();
   const name=$('#stats-login-name').value.trim();
   if(!name){$('#stats-login-error').textContent='请输入盘名。';return;}
   try{
    const res=await deps.api('stats/login',{method:'POST',body:JSON.stringify({name,password:$('#stats-login-password').value})});
    me=res.me;notifications={unread:0,trainings:{}};await refresh(true);$('#stats-login-password').value='';$('#stats-login-dialog').close();renderAll();if(!$('#training-dialog').open&&!$('#stats-game-dialog').open)teamHub?.afterLogin();
    deps.toast('已登录为 #'+me.number+' '+me.name+'，已进入个人看板。');
   }catch(err){$('#stats-login-error').textContent=err.message;}
  };
  $('#stats-logout').onclick=async()=>{
   try{await deps.api('stats/logout',{method:'POST',body:'{}'});}catch{}
   me=null;notifications={unread:0,trainings:{}};discussionUI?.reset();renderAll();deps.toast('已退出登录。');
  };
  $('#stats-new-game-cancel').onclick=()=>{editingGameId=null;$('#stats-new-game-dialog').close();};
  $('#stats-game-close').onclick=()=>$('#stats-game-dialog').close();
  $('#stats-game-dialog').addEventListener('close',()=>{discussionUI?.stop($('#game-discussion'));openGameId=null;sel={thrower:null,receiver:null};pointMode=false;pointSel=new Set();if($('#training-dialog').open&&currentTraining())renderTrainingComments(currentTraining());});
  $('#stats-game-unlock').onclick=()=>deps.requestEdit(()=>renderGame());
  $('#stats-game-video-link').onclick=event=>{event.preventDefault();gamePane='comments';syncGamePane();renderComments(currentGame());};
  $('#stats-game-edit').onclick=$('#stats-game-date-edit').onclick=openGameInfo;
  $('#stats-game-status').onclick=()=>{
   const g=currentGame();if(!g||!canEdit())return;
   const finishing=g.status==='live';
   mutate('stats/games/'+g.id+'/status',{method:'POST',body:JSON.stringify({status:finishing?'finished':'live'})},r=>{
    const game=currentGame();if(game){game.status=r.game.status;game.updated=r.game.updated;}
    deps.toast(finishing?(isScrimmage(g)?'训练赛已结束；仅计入训练赛数据。':'比赛已结束；场均数据已计入这场。'):'已重新开始记录。');
   });
  };
  $('#stats-game-delete').onclick=()=>{
   const g=currentGame();if(!g)return;
   document.querySelectorAll('.more-menu').forEach(m=>m.open=false);
   $('#stats-delete-name').textContent='「'+g.name+'」（'+gameDate(g)+'）';
   $('#stats-delete-dialog').showModal();
  };
  $('#stats-delete-cancel').onclick=()=>$('#stats-delete-dialog').close();
  $('#stats-delete-form').onsubmit=async e=>{
   e.preventDefault();const g=currentGame();if(!g)return;
   const res=await mutate('stats/games/'+g.id,{method:'DELETE'},r=>{
    data.games=data.games.filter(x=>x.id!==r.deleted);
    for(const t of data.trainings)t.games=t.games.filter(x=>x.id!==r.deleted);
    $('#stats-delete-dialog').close();$('#stats-game-dialog').close();
   });
   if(res)deps.toast('已删除这场比赛，不再计入场均。');
  };
  $('#rec-point').onclick=beginPoint;
  $('#point-offense').onclick=()=>{pointStart='offense';renderGame();};
  $('#point-defense').onclick=()=>{pointStart='defense';renderGame();};
  $$('[data-pick-side]').forEach(button=>button.onclick=()=>{if(busy||!canEdit())return;pointSide=button.dataset.pickSide;renderGame();});
  $('#point-confirm').onclick=confirmPoint;
  $('#point-cancel').onclick=cancelPoint;
  $('#rec-pass').onclick=()=>record('pass');
  $('#rec-goal').onclick=()=>record('goal');
  $('#rec-turn').onclick=()=>record('turnover');
  $('#rec-defense').onclick=()=>record('defense');
  $('#rec-undo').onclick=undoEvent;
  $('#rec-clear').onclick=()=>{sel={thrower:null,receiver:null};renderGame();};
  $('#trainings-new').onclick=()=>deps.requestEdit(async()=>{
   const d=new Date(),name=(d.getMonth()+1)+'月'+d.getDate()+'日 训练';
   const res=await mutate('stats/trainings',{method:'POST',body:JSON.stringify({name})},r=>{data.trainings.unshift(r.training);});
   if(res){openTraining(res.training.id);deps.toast('已创建训练，先记录出勤。');}
  });
  $('#training-close').onclick=()=>$('#training-dialog').close();
  $('#training-dialog').addEventListener('close',()=>{discussionUI?.stop($('#training-discussion'));openTrainingId=null;attendSel=new Set();attendDirty=false;});
  $('#training-unlock').onclick=()=>deps.requestEdit(()=>renderTraining());
  $('#training-attendance-save').onclick=async()=>{
   const t=currentTraining();
   if(!t||!canEdit())return;
   const attendees=[...attendSel];
   const res=await mutate('stats/trainings/'+t.id,{method:'PUT',body:JSON.stringify({attendees})},r=>{t.attendees=r.training.attendees;attendSel=new Set(t.attendees);attendDirty=false;});
   if(res)deps.toast('已保存出勤：'+attendees.length+' 人。');
  };
  $('#training-warmup').oninput=()=>renderWarmup(currentTraining());
  $('#training-warmup-save').onclick=async()=>{
   const t=currentTraining();
   if(!t||!canEdit())return;
   const warmup=$('#training-warmup').value;
   const res=await mutate('stats/trainings/'+t.id,{method:'PUT',body:JSON.stringify({warmup})},r=>{t.warmup=r.training.warmup;});
   if(res)deps.toast('热身计划已保存。');
  };
  $('#training-drill-add').onclick=openDrillPicker;
  $('#drill-picker-close').onclick=()=>$('#drill-picker-dialog').close();
  $('#training-game-add').onclick=()=>{
   const t=currentTraining();if(!t)return;
   scrimmageTrainingId=t.id;editingGameId=null;$('#stats-video-field').hidden=true;$('#stats-opponent-field').hidden=true;$('#stats-game-opponent').disabled=true;
   $('#stats-new-game-title').textContent='添加训练赛';$('#stats-new-game-note').textContent='A、B 两队队内对抗，下一步选择上场队员与进攻方。';
   $('#stats-new-game-submit').textContent='开始记录';
   $('#stats-new-game-form').reset();$('#stats-game-date').value=t.heldOn||'';
   $('#stats-new-game-dialog').showModal();focusStatsForm('#stats-new-game-dialog','#stats-game-name');
  };
  $('#training-delete').onclick=async()=>{
   const t=currentTraining();
   if(!t||!canEdit())return;
   document.querySelectorAll('.more-menu').forEach(m=>m.open=false);
   if(!confirm('删除「'+t.name+'」？出勤、热身计划和其中的训练赛都会一并隐藏。'))return;
   const res=await mutate('stats/trainings/'+t.id,{method:'DELETE'},r=>{
    data.trainings=data.trainings.filter(x=>x.id!==r.deleted);
    $('#training-dialog').close();
   });
   if(res)deps.toast('已删除这次训练。');
  };
  document.addEventListener('click',e=>{
   if(!active())return;
   const drillLink=e.target.closest('[data-team-drill]');if(drillLink){deps.openDrill?.(drillLink.dataset.teamDrill);return;}
   const trainingCard=e.target.closest('[data-training-card]');
   if(trainingCard){openTraining(trainingCard.dataset.trainingCard);return;}
   const attendChip=e.target.closest('[data-attend-chip]');
   if(attendChip){if(attendChip.disabled)return;const id=Number(attendChip.dataset.attendChip);attendSel.has(id)?attendSel.delete(id):attendSel.add(id);attendDirty=true;renderTraining();return;}
   const drillRemove=e.target.closest('[data-drill-remove]');
   if(drillRemove){const t=currentTraining();if(!t||!canEdit()||busy)return;const drills=t.drills.filter(d=>d.id!==drillRemove.dataset.drillRemove).map(d=>d.id);mutate('stats/trainings/'+t.id,{method:'PUT',body:JSON.stringify({drills})},r=>{t.drills=r.training.drills;});return;}
   const drillPick=e.target.closest('[data-drill-pick]');
   if(drillPick){const t=currentTraining();if(!t||busy)return;mutate('stats/trainings/'+t.id,{method:'PUT',body:JSON.stringify({drills:[...t.drills.map(d=>d.id),drillPick.dataset.drillPick]})},r=>{t.drills=r.training.drills;$('#drill-picker-dialog').close();deps.toast('已添加 Drill，可记录本次练习的问题和进步。');}).then(result=>{if(result&&$('#training-dialog').open&&currentTraining()?.id===t.id)drillJournal?.expand($('#training-drills'),drillPick.dataset.drillPick);});return;}
   const sortBtn=e.target.closest('[data-stats-sort]');
   if(sortBtn){const key=sortBtn.dataset.statsSort;if(sort.key===key)sort.dir=-sort.dir;else sort={key,dir:1};renderAverages();return;}
   const chip=e.target.closest('[data-stats-chip]');
   if(chip){if(chip.disabled)return;tapChip(chip.dataset.statsChip);return;}
   const gameCard=e.target.closest('[data-stats-game]');
   if(gameCard){openGame(gameCard.dataset.statsGame);return;}
   const editBtn=e.target.closest('[data-stats-edit]');
   if(editBtn){
    editingId=Number(editBtn.dataset.statsEdit);
    const p=data.players.find(p=>p.id===editingId);
    if(p){$('#stats-player-name').value=p.name;$('#stats-player-number').value=p.number;$('#stats-player-password').value='';$('#stats-player-joined').value=p.joinedOn||'';formGender=p.gender==='female'?'female':'male';syncGenderButtons();}
    renderPlayers();$('#stats-player-name').focus();return;
   }
   const deleteBtn=e.target.closest('[data-stats-delete]');
   if(deleteBtn){
    const p=data.players.find(p=>p.id===Number(deleteBtn.dataset.statsDelete));
    if(p&&!confirm('删除 #'+p.number+' '+p.name+'？'))return;
    if(p)mutate('stats/players/'+p.id,{method:'DELETE'},r=>{data.players=data.players.filter(x=>x.id!==r.deleted);deps.toast('已删除 #'+p.number+' '+p.name);});
   }
  });
  drillJournal=DrillJournal.init({api:deps.api,toast:deps.toast,getMe:()=>me,login,refresh});
  discussionUI=TeamDiscussion.init({api:deps.api,toast:deps.toast,canEdit,getMe:()=>me,getPlayers:()=>data.players,login,refresh});
  teamHub=TeamHub.init({api:deps.api,toast:deps.toast,requestEdit:deps.requestEdit,canEdit,refresh,getState:()=>({data,me,loaded,error,busy,notifications}),login,toggleEdit:deps.toggleEdit,openTeam:deps.openTeam,currentTraining,openTraining,openReview:id=>{openGame(id);gamePane='comments';syncGamePane();renderComments(currentGame());},openTrainingReview:id=>{openTraining(id);trainingPane='comments';syncTrainingPane();renderTrainingComments(currentTraining());}});
  messagesUI=TeamMessages.init({api:deps.api,toast:deps.toast,getMe:()=>me,getSummary:()=>notifications,onSummary:applyNotifications,openMessage:async message=>{
   await refresh(true);
   if(message.gameId){const game=findGameContainer(message.gameId);if(!game)throw new Error('这场比赛已被删除。');if(message.trainingId){const training=data.trainings.find(t=>t.id===message.trainingId&&t.games.some(g=>g.id===message.gameId));if(!training)throw new Error('这次训练已被删除。');openTraining(training.id);trainingPane='games';syncTrainingPane();renderTrainingGames(training);}openGame(game.id);gamePane='comments';syncGamePane();renderComments(game);discussionUI.reveal($('#game-discussion'),message.commentId);}
   else{if(!data.trainings.some(t=>t.id===message.trainingId))throw new Error('这次训练已被删除。');openTraining(message.trainingId);trainingPane='comments';syncTrainingPane();renderTrainingComments(currentTraining());discussionUI.reveal($('#training-discussion'),message.commentId);}
  }});
  refresh();
  timer=setInterval(()=>{if(active()&&!document.hidden&&!busy)refresh();},8000);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden&&active())refresh();});
 }
 let timer=0;
 function localDate(){const d=new Date();return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate());}
 return {init,render,navigate:(section,updateURL=true)=>teamHub?.navigate(section,updateURL),syncHeader:()=>teamHub?.renderHeader(),renderDrillHistory:(host,id,visible=false)=>drillJournal?.renderHistory(host,id,visible)};
})();
