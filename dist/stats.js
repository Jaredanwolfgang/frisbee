'use strict';
// 技术统计：队员名单（含性别）、每一分上场阵容、实时比赛记录与场均数据。读写复用 /api/stats 与编辑会话。
const StatsUI=(()=>{
 const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
 const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const STATS=[['goals','得分'],['assists','助攻'],['passes','传盘'],['turnovers','失误'],['steals','抢断'],['points','上场'],['oPoints','进攻'],['dPoints','防守']];
 const ZERO={goals:0,assists:0,passes:0,turnovers:0,steals:0,points:0,oPoints:0,dPoints:0};
 const GENDER_MARK={male:'♂',female:'♀'};
 let deps=null,data={players:[],games:[]},revision=-1,loaded=false,error='',inflight=null,busy=false,me=null;
 let openGameId=null,sel={thrower:null,receiver:null},sort={key:'goals',dir:1},editingId=null,formGender='male';
 let pointMode=false,pointSel=new Set(),pointStart='offense',editingGameId=null;
 const pad=n=>String(n).padStart(2,'0');
 const date=ms=>{const d=new Date(ms||Date.now());return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate());};
 const clock=ms=>{const d=new Date(ms||Date.now());return pad(d.getHours())+':'+pad(d.getMinutes());};
 const playerName=id=>{const p=data.players.find(p=>p.id===id);return p?'#'+p.number+' '+p.name:'已删除队员';};
 const genderMark=p=>p&&GENDER_MARK[p.gender]?'<b class="stats-g g-'+p.gender+'">'+GENDER_MARK[p.gender]+'</b>':'';
 const canEdit=()=>!!deps?.canEdit();
 const active=()=>document.body.classList.contains('stats-mode');

 function tally(totals,id,key){if(id==null)return;const row=totals[id]||(totals[id]={...ZERO});row[key]++;}
 function applyEvent(totals,e){
  if(e.kind==='pass')tally(totals,e.from,'passes');
  else if(e.kind==='goal'){tally(totals,e.from,'passes');tally(totals,e.from,'assists');tally(totals,e.to,'goals');}
  else if(e.kind==='turnover')tally(totals,e.to??e.from,'turnovers');
  else if(e.kind==='defense')tally(totals,e.from,'steals');
  else if(e.kind==='point'){const key=e.start==='defense'?'dPoints':'oPoints';(e.line||[]).forEach(id=>{tally(totals,id,'points');tally(totals,id,key);});}
 }
 const gameTotals=game=>{const t={};(game.events||[]).forEach(e=>applyEvent(t,e));return t;};
 const seasonTotals=()=>{const finished=data.games.filter(g=>g.status==='finished'),t={};finished.forEach(g=>g.events.forEach(e=>applyEvent(t,e)));return{totals:t,games:finished.length};};

 function renderMeta(){
  $('#stats-meta').textContent=!loaded&&error?'连接失败：'+error:(!loaded?'正在加载…':data.players.length+' 名队员 · '+data.games.length+' 场比赛'+(canEdit()?'':' · 查看模式'));
  $('#stats-unlock').hidden=canEdit();
  $('#stats-players-btn').disabled=!loaded&&!error;$('#stats-new-game').disabled=!loaded&&!error;
  const meBox=$('#stats-me');
  meBox.hidden=!me;
  if(me)meBox.innerHTML='已登录：<b>#'+me.number+' '+esc(me.name)+'</b>（可写赛后总结）';
  $('#stats-login').hidden=!!me;$('#stats-logout').hidden=!me;
  $('#stats-name-options').innerHTML=data.players.map(p=>'<option value="'+esc(p.name)+'">').join('');
 }
 function renderAverages(){
  const {totals,games}=seasonTotals(),table=$('#stats-averages'),empty=$('#stats-averages-empty');
  $('#stats-average-note').textContent=games?'按 '+games+' 场已结束比赛平均 · 小字为总计':'结束后计入场均';
  if(!data.players.length){table.innerHTML='';empty.hidden=false;empty.textContent='还没有队员。点「管理队员」添加盘名、号码和性别。';return;}
  empty.hidden=true;
  const rows=data.players.map(p=>({p,t:totals[p.id]||ZERO}));
  rows.sort((a,b)=>{if(sort.key==='name')return (a.p.number-b.p.number)*(sort.dir>0?1:-1)||a.p.number-b.p.number;return (b.t[sort.key]-a.t[sort.key])*(sort.dir>0?1:-1)||a.p.number-b.p.number;});
  const avg=n=>games?(n/games).toFixed(1):'—';
  table.innerHTML='<thead><tr>'+[['name','队员'],...STATS].map(([k,t])=>'<th><button type="button" data-stats-sort="'+k+'">'+t+(sort.key===k?(sort.dir>0?' ↓':' ↑'):'')+'</button></th>').join('')+'</tr></thead><tbody>'+
   rows.map(({p,t})=>'<tr><th scope="row"><span class="stats-number">#'+p.number+'</span>'+esc(p.name)+genderMark(p)+'</th>'+STATS.map(([k])=>'<td><b>'+avg(t[k])+'</b><small>'+t[k]+'</small></td>').join('')+'</tr>').join('')+'</tbody>';
 }
 function renderGames(){
  const box=$('#stats-games'),empty=$('#stats-games-empty');
  const live=data.games.filter(g=>g.status==='live').length;
  $('#stats-games-note').textContent=data.games.length?(data.games.length+' 场'+(live?' · '+live+' 场进行中':'')):'';
  empty.hidden=!!data.games.length;
  box.innerHTML=data.games.map(g=>{
   const goals=g.events.filter(e=>e.kind==='goal').length;
   return '<button type="button" class="stats-game-card" data-stats-game="'+esc(g.id)+'"><span class="stats-badge '+g.status+'">'+(g.status==='live'?'进行中':'已结束')+'</span><span class="stats-game-card-main"><strong>'+esc(g.name)+'</strong><span>'+esc(date(g.created))+(g.opponent?' · vs '+esc(g.opponent):'')+' · '+g.events.length+' 条记录</span></span><span class="stats-game-card-side"><b>'+goals+'</b><small>得分</small></span><span class="row-arrow">›</span></button>';
  }).join('');
 }
 const currentGame=()=>data.games.find(g=>g.id===openGameId)||null;
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
  const box=$('#stats-chips');
  if(!data.players.length){box.innerHTML='<p class="stats-empty">名单为空，先在「管理队员」里添加队员。</p>';return;}
  box.innerHTML=data.players.map(p=>{
   const role=pointMode?(pointSel.has(p.id)?'line':''):(p.id===sel.thrower?'thrower':p.id===sel.receiver?'receiver':'');
   const badge=role==='thrower'?(sel.receiver!=null?'传盘':'持盘'):role==='receiver'?'接盘':role==='line'?'场上':'';
   return '<button type="button" class="stats-chip'+(role?' is-'+role:'')+'" data-stats-chip="'+p.id+'" aria-pressed="'+(!!role)+'"'+(editable?'':' disabled')+'><span class="stats-number">#'+p.number+'</span>'+esc(p.name)+genderMark(p)+(badge?'<i>'+badge+'</i>':'')+'</button>';
  }).join('');
 }
 function renderPointUI(g,editable){
  const state=pointState(g),info=$('#stats-point-info'),btn=$('#rec-point'),setup=$('#stats-point-setup');
  info.innerHTML=!state.point?'尚未记录上场阵容；不影响传盘记录':state.open
   ?'<b>第 '+state.count+' 分</b> · '+(state.point.start==='defense'?'防守开':'进攻开')+' · 场上 '+state.point.line.length+' 人'
   :'第 '+state.count+' 分已结束，点「新的一分」记录下一分阵容';
  btn.hidden=!editable||pointMode;
  setup.hidden=!pointMode;
  if(pointMode){
   $('#point-offense').setAttribute('aria-pressed',String(pointStart==='offense'));
   $('#point-defense').setAttribute('aria-pressed',String(pointStart==='defense'));
   $('#point-setup-note').textContent='点选这一分的上场队员（已选 '+pointSel.size+' 人；上一分为'+(state.point&&state.point.start==='defense'?'防守':'进攻')+'开）';
   $('#point-confirm').disabled=!pointSel.size;
  }
 }
 function renderActions(editable,g){
  const t=sel.thrower!=null,r=sel.receiver!=null,pair=t&&r;
  $('.stats-actions').hidden=pointMode;$('.stats-undo-row').hidden=pointMode;
  $('#rec-pass').disabled=!editable||!pair;$('#rec-goal').disabled=!editable||!pair;
  $('#rec-turn').disabled=!editable||!t;$('#rec-defense').disabled=!editable||!t||r;
  $('#rec-undo').disabled=!editable||!g.events.length;$('#rec-clear').disabled=!t;
  $('#rec-turn-note').textContent=pair?'记在接盘人（掉盘）':'记在持盘人（传丢）';
  $('#stats-recorder-hint').textContent=!canEdit()?'开启编辑后可记录':g.status!=='live'?'比赛已结束；点「重新开始」可继续记录':pointMode?'选择上场队员和进攻 / 防守开，确认后开始记录这一分':!t?'点一名队员作为持盘人；记 D 抢断也先点防守队员':!r?playerName(sel.thrower)+'：再点接盘人，或直接记失误 / D':playerName(sel.thrower)+' → '+playerName(sel.receiver)+'：记传盘、得分，或接盘失误';
 }
 function renderBoxScore(g){
  const totals=gameTotals(g),table=$('#stats-boxscore'),empty=$('#stats-boxscore-empty');
  const rows=data.players.filter(p=>totals[p.id]).map(p=>({p,t:totals[p.id]}));
  empty.hidden=!!rows.length;
  if(!rows.length){table.innerHTML='';return;}
  rows.sort((a,b)=>(b.t.goals+b.t.assists)-(a.t.goals+a.t.assists)||a.p.number-b.p.number);
  table.innerHTML='<thead><tr><th>队员</th>'+STATS.map(([,t])=>'<th>'+t+'</th>').join('')+'</tr></thead><tbody>'+
   rows.map(({p,t})=>'<tr><th scope="row"><span class="stats-number">#'+p.number+'</span>'+esc(p.name)+genderMark(p)+'</th>'+STATS.map(([k])=>'<td>'+t[k]+'</td>').join('')+'</tr>').join('')+'</tbody>';
 }
 function describe(e,pointNumber){
  if(e.kind==='point')return '<em class="point">第 '+pointNumber+' 分 · '+(e.start==='defense'?'防守开':'进攻开')+' · 场上 '+(e.line||[]).map(id=>esc(playerName(id))).join('、')+'</em>';
  if(e.kind==='pass')return esc(playerName(e.from))+' <i>→</i> '+esc(playerName(e.to))+'<em>传盘</em>';
  if(e.kind==='goal')return esc(playerName(e.from))+' <i>→</i> '+esc(playerName(e.to))+'<em class="goal">得分</em>';
  if(e.kind==='turnover')return e.to!=null?esc(playerName(e.from))+' <i>→</i> '+esc(playerName(e.to))+'<em class="turn">掉盘失误</em>':esc(playerName(e.from))+'<em class="turn">传丢失误</em>';
  return esc(playerName(e.from))+'<em class="d">D 抢断</em>';
 }
 function describePlain(e,pointNumber){
  if(e.kind==='point')return '第 '+pointNumber+' 分阵容（'+(e.start==='defense'?'防守开':'进攻开')+'，'+(e.line||[]).length+' 人）';
  if(e.kind==='pass')return playerName(e.from)+' → '+playerName(e.to)+' 传盘';
  if(e.kind==='goal')return playerName(e.from)+' → '+playerName(e.to)+' 得分';
  if(e.kind==='turnover')return e.to!=null?playerName(e.to)+' 掉盘失误':playerName(e.from)+' 传丢失误';
  return playerName(e.from)+' D 抢断';
 }
 const pointOrdinal=(g,seq)=>g.events.filter(e=>e.kind==='point'&&e.seq<=seq).length;
 const eventRow=e=>'<div class="stats-event-row"><span class="stats-desc">'+describe(e)+'</span><time>'+clock(e.at)+'</time></div>';
 function renderLog(g){
  const box=$('#stats-event-log');
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
   const n=i+1,hasGoal=grp.events.some(e=>e.kind==='goal'),isLast=i===groups.length-1;
   const live=!hasGoal&&isLast&&g.status==='live';
   const result=hasGoal?'<em class="us">我方得分</em>':live?'<em class="livebit">进行中</em>':'<em class="them">对方得分</em>';
   const start=grp.point.start==='defense'?'防守开':'进攻开';
   html+='<details class="stats-point-group"'+(live?' open':'')+'><summary><span class="stats-point-no">'+pad(n)+'</span><span class="stats-point-title">第 '+n+' 分</span>'+result+'<span class="stats-point-meta">'+start+' · '+grp.point.line.length+' 人 · '+grp.events.length+' 手</span></summary>'
    +'<div class="stats-point-body"><div class="stats-point-line"><b>上场</b>'+(grp.point.line.map(id=>esc(playerName(id))).join('、')||'未记录')+'<b>开球</b>'+start+'</div>'
    +(grp.events.length?grp.events.map(eventRow).join(''):'<p class="stats-empty">这一分没有记录传递。</p>')+'</div></details>';
  });
  box.innerHTML=html;
 }
 const myComment=g=>me?g.comments.find(c=>c.player===me.id):null;
 function renderVideo(g){
  const link=$('#stats-game-video-link');
  if(g.video){link.hidden=false;link.href=g.video;}else{link.hidden=true;link.removeAttribute('href');}
 }
 function renderComments(g){
  const mine=myComment(g),form=$('#stats-comment-form');
  form.hidden=!me;
  $('#stats-comments-note').textContent=me?(mine?'已发布你的总结 · 可修改或删除':'还没有写下你的总结'):'用盘名登录后，写下你自己的总结';
  if(me&&document.activeElement!==$('#stats-comment-text'))$('#stats-comment-text').value=mine?mine.text:'';
  $('#stats-comment-submit').textContent=mine?'更新我的总结':'发布总结';
  $('#stats-comment-submit').disabled=busy;$('#stats-comment-delete').hidden=!mine;$('#stats-comment-delete').disabled=busy;
  $('#stats-comments').innerHTML=g.comments.length?g.comments.map(c=>'<article class="stats-comment"><header><span class="stats-number">#'+c.number+'</span><b>'+esc(c.name)+'</b>'+(me&&c.player===me.id?'<i>我</i>':'')+'<time>'+clock(c.at)+'</time></header><p>'+esc(c.text)+'</p></article>').join(''):'<p class="stats-empty">还没有人写总结。</p>';
 }
 function renderGame(){
  const g=currentGame(),dlg=$('#stats-game-dialog');
  if(!g){openGameId=null;if(dlg.open){dlg.close();deps.toast('这场比赛已被删除。');}return;}
  const editable=canEdit()&&g.status==='live'&&!busy;
  $('#stats-game-title').textContent=g.name;
  $('#stats-game-sub').textContent=date(g.created)+(g.opponent?' · vs '+g.opponent:'')+' · '+(g.status==='live'?'进行中':'已结束');
  renderVideo(g);
  $('#stats-game-status').textContent=g.status==='live'?'结束比赛':'重新开始';
  $('#stats-game-status').hidden=!canEdit();$('#stats-game-unlock').hidden=canEdit();$('.stats-game-more').hidden=!canEdit();
  $('#stats-score-us').textContent=g.events.filter(e=>e.kind==='goal').length;
  $('#stats-event-count').textContent=g.events.length+' 条记录 · '+pointState(g).count+' 分';
  renderChips(editable);renderPointUI(g,editable);renderActions(editable,g);renderBoxScore(g);renderLog(g);renderComments(g);
 }
 function renderPlayers(){
  const box=$('#stats-players-list');
  box.innerHTML=data.players.length?data.players.map(p=>'<div class="stats-player-row'+(p.id===editingId?' is-editing':'')+'"><span class="stats-number">#'+p.number+'</span><strong>'+esc(p.name)+'</strong><span class="stats-gender '+(p.gender==='female'?'f':'m')+'">'+(p.gender==='female'?'女':p.gender==='male'?'男':'未设置')+'</span><button type="button" class="quiet-btn" data-stats-edit="'+p.id+'">修改</button><button type="button" class="quiet-btn danger-text" data-stats-delete="'+p.id+'">删除</button></div>').join(''):'<p class="stats-empty">还没有队员。在上方填好盘名、号码和性别后点「添加队员」。</p>';
  $('#stats-player-save').textContent=editingId?'保存修改':'添加队员';$('#stats-player-cancel').hidden=!editingId;
 }
 function renderAll(){renderMeta();renderAverages();renderGames();renderPlayers();if($('#stats-game-dialog').open)renderGame();}

 function render(){
  renderAll();
  if(!loaded&&!inflight)refresh();
 }
 async function refresh(){
  if(inflight)return inflight;
  inflight=(async()=>{try{
   const d=await deps.api('stats'+(revision>=0?'?revision='+revision:''));
   error='';
   if('me' in d)me=d.me;
   if(typeof d.canEdit==='boolean'&&deps.syncCanEdit)deps.syncCanEdit(d.canEdit);
   if(!d.unchanged){data={players:d.players||[],games:d.games||[]};revision=d.revision;}
   loaded=true;renderAll();
  }catch(e){error=e.message;if(!loaded)renderAll();}finally{inflight=null;}})();
  return inflight;
 }
 function apply(res){
  if(res.revision!=null){if(res.revision!==revision+1)revision=-1;else revision=res.revision;}
  return res;
 }
 async function mutate(path,options,onDone,playerAuth){
  if(busy)return null;busy=true;if($('#stats-game-dialog').open)renderGame();
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
  id=Number(id);
  if(pointMode){pointSel.has(id)?pointSel.delete(id):pointSel.add(id);}
  else if(sel.receiver===id)sel.receiver=null;
  else if(sel.thrower===id){if(sel.receiver!=null)sel.receiver=null;else sel.thrower=null;}
  else if(sel.thrower==null)sel.thrower=id;
  else if(sel.receiver==null)sel.receiver=id;
  else sel={thrower:id,receiver:null};
  renderGame();
 }
 function beginPoint(){
  const g=currentGame();
  if(!g||g.status!=='live')return;
  const state=pointState(g),last=state.point;
  pointMode=true;pointSel=new Set(last?.line||[]);
  const lastIsGoal=g.events.length&&g.events[g.events.length-1].kind==='goal';
  pointStart=lastIsGoal?'defense':(last?last.start:'offense');
  sel={thrower:null,receiver:null};
  renderGame();
 }
 async function confirmPoint(){
  const g=currentGame();
  if(!g||!pointSel.size){deps.toast('请至少选择一名上场队员。');return;}
  const line=[...pointSel],start=pointStart;
  const res=await mutate('stats/games/'+g.id+'/events',{method:'POST',body:JSON.stringify({kind:'point',line,start})},r=>{g.events.push(r.event);pointMode=false;pointSel=new Set();});
  if(res)deps.toast('已记录第 '+pointState(g).count+' 分阵容，开始记录传盘。');
 }
 function cancelPoint(){pointMode=false;pointSel=new Set();renderGame();}
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
  if(res&&kind==='goal')deps.toast('得分！'+playerName(wasReceiver)+' · 当前 '+g.events.filter(e=>e.kind==='goal').length+' 分');
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
  renderGame();
  if(!currentGame())return;
  $('#stats-game-dialog').showModal();
  $('.stats-game-body').scrollTop=0;
 }
 function openPlayers(){
  editingId=null;formGender='male';$('#stats-player-form').reset();syncGenderButtons();renderPlayers();
  $('#stats-players-dialog').showModal();$('#stats-player-name').focus();
 }
 function syncGenderButtons(){$$('.stats-gender-group [data-gender]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.gender===formGender)));}
 function openGameInfo(){
  const g=currentGame();
  editingGameId=g?g.id:null;
  if(!g)return;
  document.querySelectorAll('.more-menu').forEach(m=>m.open=false);
  $('#stats-new-game-title').textContent='修改比赛信息';
  $('#stats-new-game-note').textContent='修改名称、对手和比赛录像链接。';
  $('#stats-new-game-submit').textContent='保存';
  $('#stats-game-name').value=g.name;$('#stats-game-opponent').value=g.opponent;$('#stats-game-video').value=g.video||'';
  $('#stats-new-game-dialog').showModal();$('#stats-game-opponent').focus();
 }

 function init(deps_){
  deps=deps_;
  $('#stats-unlock').onclick=()=>deps.requestEdit();
  $('#stats-players-btn').onclick=()=>deps.requestEdit(openPlayers);
  $('#stats-new-game').onclick=()=>deps.requestEdit(()=>{
   editingGameId=null;
   $('#stats-new-game-title').textContent='新建比赛';$('#stats-new-game-note').textContent='创建后进入实时记录；可以随时结束，结束后计入场均。';
   $('#stats-new-game-submit').textContent='开始记录';
   $('#stats-new-game-form').reset();
   $('#stats-new-game-dialog').showModal();$('#stats-game-name').focus();
  });
  $$('.stats-gender-group [data-gender]').forEach(b=>b.onclick=()=>{formGender=b.dataset.gender;syncGenderButtons();});
  $('#stats-players-close').onclick=()=>$('#stats-players-dialog').close();
  $('#stats-player-cancel').onclick=()=>{editingId=null;$('#stats-player-form').reset();renderPlayers();$('#stats-player-name').focus();};
  $('#stats-player-form').onsubmit=async e=>{
   e.preventDefault();
   const name=$('#stats-player-name').value.trim(),rawNumber=$('#stats-player-number').value;
   if(!name){deps.toast('请填写盘名。');$('#stats-player-name').focus();return;}
   if(rawNumber===''){deps.toast('请填写号码。');$('#stats-player-number').focus();return;}
   const number=Number(rawNumber);
   if(!Number.isInteger(number)||number<0||number>99){deps.toast('号码需为 0–99 的整数。');return;}
   if(formGender!=='male'&&formGender!=='female'){deps.toast('请选择性别。');return;}
   const body=JSON.stringify({name,number,gender:formGender});
   const wasEditing=editingId;
   const res=wasEditing?await mutate('stats/players/'+wasEditing,{method:'PUT',body}):await mutate('stats/players',{method:'POST',body},r=>{data.players.push(r.player);sortPlayers();});
   if(!res)return;
   if(wasEditing){const p=data.players.find(p=>p.id===wasEditing);if(p){p.name=res.player.name;p.number=res.player.number;p.gender=res.player.gender;}sortPlayers();}
   editingId=null;$('#stats-player-form').reset();renderAll();
   deps.toast((wasEditing?'已修改 ':'已添加 ')+'#'+res.player.number+' '+res.player.name);
   $('#stats-player-name').focus();
  };
  $('#stats-new-game-form').onsubmit=async e=>{
   e.preventDefault();
   const d=new Date(),fallback=(d.getMonth()+1)+'月'+d.getDate()+'日 比赛';
   const name=$('#stats-game-name').value.trim()||fallback,opponent=$('#stats-game-opponent').value.trim();
   let video=$('#stats-game-video').value.trim();
   if(video&&!/^https?:\/\//i.test(video))video='https://'+video;
   if(editingGameId){
    const id=editingGameId;
    const res=await mutate('stats/games/'+id,{method:'PUT',body:JSON.stringify({name,opponent,video})},r=>{
     const g=data.games.find(g=>g.id===id);if(g){g.name=r.game.name;g.opponent=r.game.opponent;g.video=r.game.video;}
    });
    if(!res)return;
    editingGameId=null;$('#stats-new-game-dialog').close();
    deps.toast('比赛信息已更新。');
    return;
   }
   const res=await mutate('stats/games',{method:'POST',body:JSON.stringify({name,opponent,video})},r=>{data.games.unshift(r.game);});
   if(!res)return;
   $('#stats-new-game-dialog').close();
   openGame(res.game.id);
   deps.toast('已创建比赛，先记录第 1 分的上场阵容。');
  };
  $('#stats-login').onclick=()=>{$('#stats-login-name').value='';$('#stats-login-error').textContent='';$('#stats-login-dialog').showModal();$('#stats-login-name').focus();};
  $('#stats-login-cancel').onclick=()=>$('#stats-login-dialog').close();
  $('#stats-login-form').onsubmit=async e=>{
   e.preventDefault();
   const name=$('#stats-login-name').value.trim();
   if(!name){$('#stats-login-error').textContent='请输入盘名。';return;}
   try{
    const res=await deps.api('stats/login',{method:'POST',body:JSON.stringify({name})});
    me=res.me;$('#stats-login-dialog').close();renderAll();
    deps.toast('已登录为 #'+me.number+' '+me.name+'，可以写赛后总结了。');
   }catch(err){$('#stats-login-error').textContent=err.message;}
  };
  $('#stats-logout').onclick=async()=>{
   try{await deps.api('stats/logout',{method:'POST',body:'{}'});}catch{}
   me=null;renderAll();deps.toast('已退出登录。');
  };
  $('#stats-comment-form').onsubmit=async e=>{
   e.preventDefault();
   const g=currentGame();
   if(!g||!me)return;
   const text=$('#stats-comment-text').value.trim();
   if(!text){deps.toast('总结不能为空。');$('#stats-comment-text').focus();return;}
   const res=await mutate('stats/games/'+g.id+'/comments',{method:'POST',body:JSON.stringify({text})},r=>{
    const mine=myComment(g);
    if(mine)Object.assign(mine,r.comment);else g.comments.push(r.comment);
   },true);
   if(res)deps.toast('总结已发布。');
  };
  $('#stats-comment-delete').onclick=async()=>{
   const g=currentGame();
   if(!g||!me)return;
   if(!confirm('删除你的赛后总结？'))return;
   const res=await mutate('stats/games/'+g.id+'/comments',{method:'DELETE'},r=>{
    g.comments=g.comments.filter(c=>!(me&&c.player===me.id));
   },true);
   if(res)deps.toast('已删除你的总结。');
  };
  $('#stats-new-game-cancel').onclick=()=>{editingGameId=null;$('#stats-new-game-dialog').close();};
  $('#stats-game-close').onclick=()=>$('#stats-game-dialog').close();
  $('#stats-game-dialog').addEventListener('close',()=>{openGameId=null;sel={thrower:null,receiver:null};pointMode=false;pointSel=new Set();});
  $('#stats-game-unlock').onclick=()=>deps.requestEdit(()=>renderGame());
  $('#stats-game-edit').onclick=openGameInfo;
  $('#stats-game-status').onclick=()=>{
   const g=currentGame();if(!g||!canEdit())return;
   const finishing=g.status==='live';
   mutate('stats/games/'+g.id+'/status',{method:'POST',body:JSON.stringify({status:finishing?'finished':'live'})},r=>{
    const game=currentGame();if(game){game.status=r.game.status;game.updated=r.game.updated;}
    deps.toast(finishing?'比赛已结束；场均数据已计入这场。':'已重新开始记录。');
   });
  };
  $('#stats-game-delete').onclick=()=>{
   const g=currentGame();if(!g)return;
   document.querySelectorAll('.more-menu').forEach(m=>m.open=false);
   $('#stats-delete-name').textContent='「'+g.name+'」（'+date(g.created)+'）';
   $('#stats-delete-dialog').showModal();
  };
  $('#stats-delete-cancel').onclick=()=>$('#stats-delete-dialog').close();
  $('#stats-delete-form').onsubmit=async e=>{
   e.preventDefault();const g=currentGame();if(!g)return;
   const res=await mutate('stats/games/'+g.id,{method:'DELETE'},r=>{
    data.games=data.games.filter(x=>x.id!==r.deleted);
    $('#stats-delete-dialog').close();$('#stats-game-dialog').close();
   });
   if(res)deps.toast('已删除这场比赛，不再计入场均。');
  };
  $('#rec-point').onclick=beginPoint;
  $('#point-offense').onclick=()=>{pointStart='offense';renderGame();};
  $('#point-defense').onclick=()=>{pointStart='defense';renderGame();};
  $('#point-confirm').onclick=confirmPoint;
  $('#point-cancel').onclick=cancelPoint;
  $('#rec-pass').onclick=()=>record('pass');
  $('#rec-goal').onclick=()=>record('goal');
  $('#rec-turn').onclick=()=>record('turnover');
  $('#rec-defense').onclick=()=>record('defense');
  $('#rec-undo').onclick=undoEvent;
  $('#rec-clear').onclick=()=>{sel={thrower:null,receiver:null};renderGame();};
  document.addEventListener('click',e=>{
   if(!active())return;
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
    if(p){$('#stats-player-name').value=p.name;$('#stats-player-number').value=p.number;formGender=p.gender==='female'?'female':'male';syncGenderButtons();}
    renderPlayers();$('#stats-player-name').focus();return;
   }
   const deleteBtn=e.target.closest('[data-stats-delete]');
   if(deleteBtn){
    const p=data.players.find(p=>p.id===Number(deleteBtn.dataset.statsDelete));
    if(p&&!confirm('删除 #'+p.number+' '+p.name+'？'))return;
    if(p)mutate('stats/players/'+p.id,{method:'DELETE'},r=>{data.players=data.players.filter(x=>x.id!==r.deleted);deps.toast('已删除 #'+p.number+' '+p.name);});
   }
  });
  timer=setInterval(()=>{if(active()&&!document.hidden&&!busy)refresh();},8000);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden&&active())refresh();});
 }
 let timer=0;
 return {init,render};
})();
