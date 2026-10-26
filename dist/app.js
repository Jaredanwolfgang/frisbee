'use strict';
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const clone=o=>JSON.parse(JSON.stringify(o));
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const uid=()=>crypto.randomUUID?.()||`play-${Date.now()}-${Math.random().toString(36).slice(2)}`;
const KEY='frisbee-disc-playbook-v1';
const categories=['全部','进攻战术','防守战术','端区战术','基础训练'];
const points=(mode='vertical')=>{
 const shapes={vertical:[[245,335],[210,150],[420,265],[495,265],[570,265],[645,265],[720,265]],horizontal:[[270,280],[175,140],[175,420],[525,100],[525,220],[525,340],[525,460]],endzone:[[620,280],[500,155],[500,405],[800,160],[800,240],[800,320],[800,400]],defense:[[255,280],[380,165],[380,280],[380,395],[565,170],[565,390],[740,280]],reset:[[480,220],[310,335],[200,165],[680,125],[680,235],[680,345],[680,450]]};
 return shapes[mode].map(([x,y],i)=>({id:i+1,x,y,team:'offense'}));
};
const route=(id,kind,x,y,p)=>({id:uid(),player:id,kind,points:p||[],end:{x,y}});
function advance(f){const n=clone(f);n.routes.forEach(r=>{if(r.kind==='run'){const p=n.players.find(p=>p.id===r.player);if(p)Object.assign(p,r.end);}else n.disc={...r.end};});n.routes=[];return n;}
function example(id,name,english,cat,level,tags,summary,mode,routes,notes,nextNotes){const first={name:'起始配合',players:points(mode),disc:{x:points(mode)[0].x+22,y:points(mode)[0].y},routes,notes};const next=advance(first);next.name='衔接与重置';next.notes=nextNotes;return {id,name,english,category:cat,level,tags,summary,frames:[first,next],example:true,updated:1700000000000};}
const legacySamples=[
 example('sample-vertical','纵向列阵 · 开放侧切入','VERTICAL STACK','进攻战术','基础',['Vertical Stack','切入配合'],'拉开纵深空间，让切入与清空形成有序轮转。','vertical',[route(7,'run',380,380,[{x:620,y:410}]),route(6,'run',760,300,[{x:640,y:280}]),route(1,'pass',380,380)],'7 号先向外拉开，再向持盘人切入；6 号拉长纵深。示意路线可按本队习惯调整。','接盘后重新建立传接角度；未接盘的切入者清空通道，为后续切入留出空间。'),
 example('sample-horizontal','横向列阵 · 双人配合','HORIZONTAL STACK','进攻战术','进阶',['Horizontal Stack','空间拉扯'],'用相邻两人的反向跑动，打开中路接盘窗口。','horizontal',[route(5,'run',385,205),route(6,'run',740,350),route(1,'pass',385,205)],'5 号回切接应，6 号同时向深处跑动；两侧球员保持宽度，避免进入同一接盘窗口。','接盘人抬头观察纵深；没有机会时，保持耐心，回传并重新组织。'),
 example('sample-endzone','端区进攻 · 切入得分','END ZONE PLAY','端区战术','进阶',['端区','短传窗口'],'在有限的空间里，用一次假切创造接盘机会。','endzone',[route(4,'run',890,215,[{x:755,y:125}]),route(7,'run',715,435),route(1,'pass',890,215)],'4 号先向外侧假切，再进入端区；7 号拉开远侧空间。持盘人根据实际防守选择传盘。','若首个窗口关闭，立即清空端区近侧，重新建立支援传盘角度。'),
 example('sample-zone','区域防守 · 空间覆盖','ZONE DEFENSE','防守战术','进阶',['Zone','区域协作'],'用区域分工和横向移动，练习队友之间的补位。','defense',[route(2,'run',440,150),route(3,'run',440,255),route(4,'run',440,365)],'本图用 1–7 标出防守队员的职责位置，橙色球员示意对手。前线随盘移动，后线关注空当并沟通。','整体随盘侧移时，保持前后层次。这里是沟通练习示例，可调整成球队实际使用的站位。'),
 example('sample-reset','回传重置 · 重新组织','DUMP & SWING','进攻战术','基础',['Reset','回传转移'],'主动寻找回传角度，把进攻重新带回开阔区域。','reset',[route(2,'run',355,300),route(1,'pass',355,300)],'2 号横向移动，为持盘人建立安全回传角度；其他球员给回传区域留出空间。','回传完成后观察另一侧，再选择横向转移或向前推进。避免几名队员同时挤向飞盘。'),
 example('sample-drill','三角传接 · 跑传衔接','TRIANGLE FLOW','基础训练','基础',['传接训练','时机'],'从简单的三角配合开始，练习传盘后的持续跑动。','horizontal',[route(1,'pass',525,220),route(1,'run',390,110),route(5,'run',570,170)],'1 号向 5 号传盘后移动到新的支援位置。其余球员可作为下一组等待队员；训练时按实际人数调整。','接盘后先稳住轴心脚，再观察移动中的队友。按组循环，逐步提高跑传节奏。')
];
const coreSamples=buildCoreCatalog({route,advance});
const samples=[...coreSamples,buildPendulumDrill({route,advance}),...legacySamples.filter(t=>!['sample-vertical','sample-horizontal','sample-zone'].includes(t.id))];
// Restore only validated records. A malformed backup never replaces existing data.
function validMarkers(markers){return markers===undefined||(Array.isArray(markers)&&markers.length<=32&&new Set(markers.map(m=>m?.id)).size===markers.length&&markers.every(m=>m&&typeof m.id==='string'&&/^[A-Za-z0-9_-]{1,100}$/.test(m.id)&&validPoint(m)&&typeof m.label==='string'&&m.label.length<=24));}
function validTactic(t){try{return t&&validMarkers(t.markers)&&(t.loop===undefined||typeof t.loop==='boolean'&&(!t.loop||(t.kind||(t.category===categories[4]?'drill':'tactic'))==='drill'))&&(!t.formation||(typeof t.formation==='string'&&t.formation.length<300))&&(!t.roles||(typeof t.roles==='object'&&!Array.isArray(t.roles)&&Object.keys(t.roles).length<=14&&Object.entries(t.roles).every(([k,v])=>/^[1-9][0-9]{0,5}$/.test(k)&&typeof v==='string'&&v.length<160)))&&(!t.kind||['tactic','drill'].includes(t.kind))&&typeof t.id==='string'&&t.id.length<150&&typeof t.name==='string'&&t.name.trim()&&t.name.length<=100&&categories.slice(1).includes(t.category)&&['基础','进阶','挑战'].includes(t.level)&&typeof t.summary==='string'&&t.summary.length<=500&&Array.isArray(t.tags)&&t.tags.length<=12&&t.tags.every(v=>typeof v==='string'&&v.length<100)&&Array.isArray(t.frames)&&t.frames.length>0&&t.frames.length<=24&&t.frames.every(f=>typeof f.name==='string'&&f.name.length<=100&&typeof f.notes==='string'&&f.notes.length<=3000&&Array.isArray(f.players)&&f.players.length>0&&f.players.length<=14&&new Set(f.players.map(p=>p.id)).size===f.players.length&&f.players.every(p=>Number.isInteger(p.id)&&p.id>=1&&p.id<=999999&&(!('number' in p)||(Number.isInteger(p.number)&&p.number>=1&&p.number<=7))&&['offense','defense'].includes(p.team)&&validPoint(p))&&validPoint(f.disc)&&Array.isArray(f.routes)&&f.routes.length<=40&&f.routes.every(r=>r&&typeof r.id==='string'&&/^[a-zA-Z0-9_-]{1,100}$/.test(r.id)&&['run','pass'].includes(r.kind)&&f.players.some(p=>p.id===r.player)&&validPoint(r.end)&&Array.isArray(r.points)&&r.points.length<=12&&r.points.every(validPoint)&&(r.bend===undefined||r.kind==='pass'&&r.points.length===0&&validPoint(r.bend))));}catch{return false;}}
function validPoint(p){return p&&Number.isFinite(p.x)&&Number.isFinite(p.y)&&p.x>=20&&p.x<=980&&p.y>=20&&p.y<=540;}
const MIGRATION_KEY='frisbee-server-migration-v1';
let localBackup=[],migrated={};
try{const saved=JSON.parse(localStorage.getItem(KEY));if(saved&&Array.isArray(saved.tactics)&&saved.tactics.every(validTactic))localBackup=saved.tactics.filter(t=>!t.example||t.updated>1700000000000);}catch{}
try{migrated=JSON.parse(localStorage.getItem(MIGRATION_KEY))||{};}catch{}
let state={tactics:[],catalogRevision:3};
let canEdit=false,loaded=false,connected=false,saving=false,serverRevision=-1,openedSharedLink=false,pendingAuthAction=null,cacheShown=false,libraryRequest=null;
const API_BASE=new URL('api/',location.href.split('#')[0]);
async function api(path='',options={}){
 const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),20000);
 try{const response=await fetch(new URL(path,API_BASE),{credentials:'same-origin',cache:'no-store',...options,headers:{'Content-Type':'application/json',...(options.headers||{})},signal:controller.signal});
  let data;try{data=await response.json();}catch{throw new Error('服务器响应无效，请稍后重试。');}
  if(!response.ok){const error=new Error(data.error||'服务器暂时无法处理请求。');error.status=response.status;throw error;}return data;
 }catch(error){if(error.name==='AbortError')throw new Error('连接服务器超时，草稿仍然保留。');if(error instanceof TypeError)throw new Error('暂时无法连接服务器，草稿仍然保留。');throw error;}finally{clearTimeout(timeout);}
}
function migrationCandidates(){return localBackup.filter(t=>migrated[t.id]!==String(t.updated||0));}
function syncStatus(){
 $('#sync-label').textContent=connected?'服务器已同步':loaded?'连接中断':'正在连接服务器';
 $('.local-status').classList.toggle('offline',!connected);
 const pending=migrationCandidates();$('#server-banner').hidden=connected&&!pending.length;
 $('#server-message').textContent=!connected?(cacheShown?'显示上次同步的内容，连接成功后会自动更新；暂时只能查看。':loaded?'暂时无法连接服务器，当前内容仍可查看；未保存的草稿会保留在编辑器。':'正在连接球队战术库…'):('检测到 '+pending.length+' 套尚未上传的浏览器战术。上传后队友也能看到，原备份会保留。');
 $('#migrate-local').hidden=!connected||!pending.length;$('#retry-sync').hidden=connected;
}
function fillDraftForm(){if(!draft)return;playbackLoop=Roster.kind(draft)==='drill'&&draft.loop===true;$('#edit-name').value=draft.name;$('#edit-category').value=draft.category;$('#edit-kind').value=Roster.kind(draft);$('#edit-level').value=draft.level;$('#edit-summary').value=draft.summary;$('#edit-tags').value=draft.tags.join(', ');}
function syncSelectionToolbar(){
 const active=!!(canModifyDraft()&&draft&&(current().players.some(p=>p.id===selectedPlayer)||(draft.markers||[]).some(m=>m.id===selectedMarker)||!playing&&current().routes.some(r=>r.id===selectedRoute)));
 $('#roster-slot').classList.toggle('has-selection',active);$('#roster-controls').inert=active;$('#roster-controls').setAttribute('aria-hidden',String(active));
}
function permissions(){
 $$('#discard-dialog button').forEach(b=>b.disabled=saving);const modify=canModifyDraft();$('#editor').classList.toggle('phone-viewing',MobileUI.isPhone()&&!mobileEdit);$('#mobile-edit-btn').disabled=saving||cacheShown&&!connected;$('#mobile-edit-btn').hidden=!MobileUI.isPhone()||mobileEdit;$('#close-editor').setAttribute('aria-label',MobileUI.isPhone()&&mobileEdit?'返回查看':'返回战术库');
 document.body.classList.toggle('read-only',!canEdit);$('#access-btn').textContent=canEdit?'关闭编辑':'开启编辑';
 $('#editor-unlock-btn').hidden=canEdit;$('#save-btn').hidden=!modify;$('#save-btn').disabled=saving;$('#save-btn').textContent=saving?'保存中…':'保存';
 $('#delete-tactic').hidden=!modify||!draft||!state.tactics.some(t=>t.id===draft.id);
 $('#route-controls').hidden=!modify||playing||!draft?.frames[frameIndex]?.routes.some(r=>r.id===selectedRoute);
 $('#close-editor').disabled=saving;$('#marker-controls').hidden=!modify||!(draft?.markers||[]).some(m=>m.id===selectedMarker);$('#inspector-toggle').textContent=modify?'编辑详情':'查看详情';
 $$('#editor input,#editor select,#editor textarea').forEach(el=>el.disabled=!modify||saving);
 $$('[data-tool],#clear-routes,[data-count-team],#give-disc,#remove-player,#remove-marker,#straighten-route,#remove-route').forEach(el=>el.disabled=!modify||saving);
 $$('[data-count-team]').forEach(b=>{if(!draft){b.disabled=true;return;}const f=current(),off=f.players.filter(p=>p.team==='offense').length,def=f.players.length-off,d=Number(b.dataset.delta),n=f.players.length+d,team=(b.dataset.countTeam==='offense'?off:def)+d;b.disabled=!modify||saving||team<0||team>7||n<1||n>(Roster.kind(draft)==='drill'?7:14);});
 const selectedPass=draft?.frames[frameIndex]?.routes.find(r=>r.id===selectedRoute);$('#straighten-route').disabled=!canModifyDraft()||saving||!selectedPass||(!selectedPass.bend&&!selectedPass.points.length);
 $('#undo-btn').disabled=!canModifyDraft()||saving||!history.length;$('#add-frame').disabled=!canModifyDraft()||saving||!!draft&&draft.frames.length>=24;$('#delete-frame').disabled=!canModifyDraft()||saving||!draft||draft.frames.length===1;
 syncFormationSettings();$('#tool-hint').textContent=!canModifyDraft()?'只读查看 · 可播放、切换步骤和全屏展示':tool==='move'?'拖动排站位；点球员可设持盘人或移除':tool==='marker'?'点场地放置角标；拖动调整位置，点选后命名或移除':tool==='run'?'拖出跑线；长按队员至外圈走满可删除，松开或拖动取消':'拖出传盘线；长按飞盘至外圈走满可删除，松开或拖动取消';
 syncSelectionToolbar();
 const countLabel=draft?current().players.length+' 人 · ':'';$('#edit-status').textContent=countLabel+(!canEdit?'只读查看':dirty?'未保存':draft?._version?'已保存到服务器':'保存后队友可见');
}
function cacheLibrary(){if(connected&&serverRevision>=0)LibraryReadCache.write(state.tactics,serverRevision);}
function restoreLibraryCache(){const cached=LibraryReadCache.read(validTactic);if(!cached)return;state.tactics=cached.tactics;serverRevision=cached.revision;loaded=true;cacheShown=true;SpeedInfo.cached=true;const id=new URLSearchParams(location.hash.slice(1)).get('tactic');if(id&&state.tactics.some(t=>t.id===id)){openedSharedLink=true;openTactic(id);}}
async function loadLibrary({quiet=false}={}){
 if(libraryRequest)return libraryRequest;
 libraryRequest=(async()=>{const started=performance.now();try{
  const data=await api('tactics'+(connected&&serverRevision>=0?'?revision='+serverRevision:'')),wasLoaded=loaded,wasCached=cacheShown;
  const changed=serverRevision!==data.revision||wasCached&&JSON.stringify(state.tactics)!==JSON.stringify(data.tactics);
  if(!data.unchanged){if(!Array.isArray(data.tactics)||!data.tactics.every(validTactic))throw new Error('服务器中的战术格式无效。');state.tactics=data.tactics;}
  if(!SpeedInfo.library)SpeedInfo.library={duration:performance.now()-started};serverRevision=data.revision;canEdit=!!data.canEdit;loaded=true;connected=true;cacheShown=false;
  if(changed||!wasLoaded)render();
  if(changed&&draft&&!dirty&&!saving){const remote=state.tactics.find(t=>t.id===draft.id);if(remote&&remote._version!==draft._version){stop();draft=clone(remote);frameIndex=Math.min(frameIndex,draft.frames.length-1);fillDraftForm();renderBoard();}else if(!remote){closeEditor();toast('这套战术已从共享战术库移除。');}}
  if(changed||!wasLoaded||wasCached)cacheLibrary();permissions();syncStatus();
  if(!openedSharedLink){openedSharedLink=true;const id=new URLSearchParams(location.hash.slice(1)).get('tactic');if(id){if(state.tactics.some(t=>t.id===id))openTactic(id);else toast('分享的战术已不存在，或已被删除。');}}
 }catch(error){connected=false;syncStatus();if(!quiet)toast(error.message);}finally{libraryRequest=null;}})();
 return libraryRequest;
}
function requestEdit(action){if(canEdit){action?.();return;}pendingAuthAction=action||null;$('#auth-error').textContent='';$('#edit-password').value='';$('#auth-dialog').showModal();$('#edit-password').focus();}
let kindFilter='all',category='全部',search='',sort='recent',createKind='drill';
let creationUI=null;
let boardFull=false,nativeFullscreen=false,orientationLocked=false;
let draft=null,frameIndex=0,tool='move',history=[],dirty=false,playing=false,raf=0,playbackLoop=false,playbackRound=0,drag=null,selectedPlayer=null,selectedMarker=null,selectedRoute=null,mobileEdit=false;
const ROUTE_HOLD_MS=650;
const routeHold=createHoldGesture({duration:ROUTE_HOLD_MS,progress:drawHoldProgress,complete:finishRouteHold});
function drawHoldProgress(value,data){
 if(value===null){$('#route-hold-progress')?.remove();return;}
 const svg=$('#tactic-svg');if(!svg)return;let ring=$('#route-hold-progress');
 if(!ring){const scale=Math.hypot(svg.getScreenCTM().a,svg.getScreenCTM().b)||1,radius=Math.max(data.kind==='pass'?19:29,23/scale),length=2*Math.PI*radius;
  ring=document.createElementNS('http://www.w3.org/2000/svg','g');ring.id='route-hold-progress';ring.setAttribute('transform',`translate(${data.at.x},${data.at.y})`);ring.setAttribute('role','progressbar');ring.setAttribute('aria-label','长按删除路线');ring.setAttribute('aria-valuemin','0');ring.setAttribute('aria-valuemax','100');ring.innerHTML=`<circle class="hold-track" r="${radius}"/><circle class="hold-meter" r="${radius}" transform="rotate(-90)" stroke-dasharray="${length}" stroke-dashoffset="${length}"/>`;ring.dataset.length=length;svg.append(ring);
 }
 ring.setAttribute('aria-valuenow',String(Math.round(value*100)));ring.querySelector('.hold-meter').setAttribute('stroke-dashoffset',String(Number(ring.dataset.length)*(1-value)));
}
function finishRouteHold(data){
 if(drag!==data.gesture||!draft||frameIndex!==data.frame||tool!==data.tool||!canModifyDraft()||saving||playing||document.hidden||!$('#editor').open)return;
 drag=null;const f=current(),remove=r=>r.kind===data.kind&&(data.kind==='pass'||r.player===data.player);
 if(!f.routes.some(remove))return;checkpoint();f.routes=f.routes.filter(r=>!remove(r));selectedRoute=null;selectedPlayer=null;renderBoard();toast(data.kind==='pass'?'已删除本步传盘路线，可撤销。':'已删除该队员本步跑动路线，可撤销。');
}
function startRouteHold(e,kind,player,at){if(current().routes.some(r=>r.kind===kind&&(kind==='pass'||r.player===player)))routeHold.start(e,{kind,player,at,gesture:drag,frame:frameIndex,tool});}
function syncFormationSettings(){
 const box=$('#formation-settings');box.hidden=!draft||!canModifyDraft();if(!draft)return;const select=$('#formation-team'),f=current();
 for(const option of select.options){const count=f.players.filter(p=>p.team===option.value).length;option.disabled=count!==7;option.textContent=(option.value==='offense'?'练习 / 进攻组':'防守组')+' · '+count+' 人';}
 if(![...select.options].some(o=>o.value===select.value&&!o.disabled))select.value=[...select.options].find(o=>!o.disabled)?.value||'offense';
 const ready=f.players.filter(p=>p.team===select.value).length===7;select.disabled=!canModifyDraft()||saving||playing;
 $$('[data-formation]').forEach(b=>b.disabled=!canModifyDraft()||saving||playing||!ready);
 $('#formation-hint').textContent=ready?'仅调整所选组的当前步骤，清除本步路线；编号和攻防身份保留，可撤销。':'先将练习 / 进攻组或防守组设为 7 人，即可一键套用站位。';
}
$('#formation-team').onchange=syncFormationSettings;
$$('[data-formation]').forEach(button=>button.onclick=()=>{if(!canModifyDraft()||saving||playing)return;stop();try{const frame=Roster.arrange(current(),button.dataset.formation,$('#formation-team').value);checkpoint();draft.frames[frameIndex]=frame;delete draft.formation;selectedPlayer=selectedMarker=selectedRoute=null;renderBoard();if(MobileUI.isPhone())closeInspector();toast('已套用'+Roster.formations[button.dataset.formation].name+'，可撤销后重新选择。');}catch(error){toast(error.message);}});
function canModifyDraft(){return canEdit&&(!MobileUI.isPhone()||mobileEdit);}
function toast(msg){$('#toast').textContent=msg;$('#toast').classList.add('visible');clearTimeout(toast.timer);toast.timer=setTimeout(()=>$('#toast').classList.remove('visible'),3200);}
function svgField(frame,{mini=false,hero=false,interactive=false,markers=[]}={}){
 const dark=!mini||hero,base=dark?'#2b6047':'#dae5cf',line=dark?'#86aa80':'#9fb393',end=dark?'#24543e':'#cddcbe',run=dark?'#d7ee9f':'#688f4f',pass=dark?'#d1e7ee':'#6e98a3',id=uid().replace(/-/g,'');
 const playerLabel=Roster.label;
 const player=p=>`<g class="player" ${interactive?'data-player="'+p.id+'"':''} transform="translate(${p.x},${p.y})" ${interactive?'tabindex="0" role="button" aria-label="'+playerLabel(p)+' '+(p.team==='defense'?'防守':'进攻')+'球员，用方向键调整位置"':''}><circle r="${interactive?30:0}" fill="transparent"/><circle class="player-body" r="${mini?17:19}" fill="${p.team==='defense'?(dark?'#df9e76':'#c39773'):(dark?'#e4efb4':'#638951')}" stroke="${interactive&&p.id===selectedPlayer?'#f3ffd1':dark?'#234a36':'#f4f7ed'}" stroke-width="${interactive&&p.id===selectedPlayer?5:mini?2:3}"/><text text-anchor="middle" dy="5" fill="${p.team==='defense'?'#503d2f':dark?'#335034':'#fff'}" font-family="sans-serif" font-size="12" font-weight="600" pointer-events="none">${playerLabel(p)}</text></g>`;
 const cone=m=>`<g class="field-marker" ${interactive?'data-marker="'+esc(m.id)+'" tabindex="0" role="button" aria-label="角标 '+esc(m.label||'未命名')+'，可拖动或用方向键调整"':''} transform="translate(${m.x},${m.y})"><rect x="-30" y="-28" width="60" height="80" fill="transparent"/><circle r="30" fill="${interactive&&m.id===selectedMarker?'#f7efbe33':'transparent'}" stroke="${interactive&&m.id===selectedMarker?'#ffecb0':'none'}" stroke-width="3"/><path d="M0 -21 L-15 13 H15 Z" fill="#f1b653" stroke="#9b6a2c" stroke-width="2"/><path d="M-6 -9 H6 L9 0 H-9 Z" fill="#fff6dd"/><rect x="-21" y="12" width="42" height="7" rx="3" fill="#d18b39" stroke="#835d31" stroke-width="1.5"/><text x="0" y="39" text-anchor="middle" font-size="14" font-weight="600" fill="${dark?'#fff2cf':'#72542a'}" stroke="${dark?'#2b6047':'#dae5cf'}" stroke-width="3" paint-order="stroke" pointer-events="none">${esc(m.label)}</text></g>`;
 return `<svg viewBox="0 0 1000 560" aria-label="飞盘场地跑位示意图" ${interactive?'id="tactic-svg" role="group"':'role="img"'}><defs><marker id="run-${id}" markerWidth="7" markerHeight="7" refX="5.5" refY="3" orient="auto"><path d="M0,0 L6,3 L0,6" fill="none" stroke="${run}" stroke-width="1.3"/></marker><marker id="defrun-${id}" markerWidth="7" markerHeight="7" refX="5.5" refY="3" orient="auto"><path d="M0,0 L6,3 L0,6" fill="none" stroke="#df9e76" stroke-width="1.3"/></marker><marker id="pass-${id}" markerWidth="7" markerHeight="7" refX="5.5" refY="3" orient="auto"><path d="M0,0 L6,3 L0,6" fill="none" stroke="${pass}" stroke-width="1.3"/></marker></defs><rect x="0" y="0" width="1000" height="560" rx="10" fill="${base}"/>${[0,1,2,3,4,5,6,7,8,9].map(i=>`<rect x="${20+i*96}" y="25" width="48" height="510" fill="${dark?'#ffffff03':'#ffffff12'}"/>`).join('')}<rect x="25" y="25" width="150" height="510" fill="${end}"/><rect x="825" y="25" width="150" height="510" fill="${end}"/><rect x="25" y="25" width="950" height="510" rx="1" fill="none" stroke="${line}" stroke-width="2"/><path d="M175 25V535 M825 25V535" stroke="${line}" stroke-width="2"/>${[175,825].flatMap(x=>[25,535].map(y=>`<circle cx="${x}" cy="${y}" r="4" fill="${dark?'#d1b282':'#aab693'}"/>`)).join('')}<text x="100" y="280" fill="${line}" text-anchor="middle" font-size="12" letter-spacing="6" transform="rotate(-90 100 280)">END ZONE</text><text x="900" y="280" fill="${line}" text-anchor="middle" font-size="12" letter-spacing="6" transform="rotate(90 900 280)">END ZONE</text><g ${interactive?'id="routes-layer"':''}>${frame.routes.map(r=>{const p=frame.players.find(p=>p.id===r.player);if(!p)return'';return `${interactive&&r.kind==='pass'?`<path data-route-hit="${esc(r.id)}" d="${pathD(p,r)}" fill="none" stroke="transparent" stroke-width="22" vector-effect="non-scaling-stroke" pointer-events="stroke"/>`:''}<path ${interactive?'data-route="'+esc(r.id)+'"':''} d="${pathD(p,r)}" fill="none" stroke="${r.kind==='run'?(p.team==='defense'?'#df9e76':run):pass}" stroke-width="${mini?3:3}" ${r.kind==='pass'?'stroke-dasharray="9 7"':''} marker-end="url(#${r.kind==='run'&&p.team==='defense'?'defrun':r.kind}-${id})" opacity=".85"/>`;}).join('')}</g><g ${interactive?'id="markers-layer"':''}>${markers.map(cone).join('')}</g><g ${interactive?'id="players-layer"':''}>${frame.players.map(player).join('')}</g><g ${interactive?'id="disc"':''} ${interactive&&canModifyDraft()&&tool==='pass'&&!playing?'data-disc tabindex="0" role="button" aria-label="飞盘，长按删除本步传盘路线"':'pointer-events="none"'} transform="translate(${frame.disc.x},${frame.disc.y})">${interactive&&canModifyDraft()&&tool==='pass'&&!playing?'<circle class="disc-hit" r="12" fill="transparent" stroke="transparent" stroke-width="36" vector-effect="non-scaling-stroke"/>':''}<ellipse rx="10" ry="5" fill="#fff" stroke="${dark?'#b6c69e':'#8caa70'}" stroke-width="2" transform="rotate(-25)"/></g>${interactive&&canModifyDraft()&&!playing?routeHandle(frame):''}${!mini?'<text x="500" y="518" text-anchor="middle" font-size="10" letter-spacing="3" fill="#abc39a" opacity=".65">ATTACK →</text>':''}</svg>`;
}
function routeHandle(frame){const r=frame.routes.find(r=>r.id===selectedRoute&&r.kind==='pass');if(!r)return '';const p=frame.players.find(p=>p.id===r.player),b=RouteGeometry.middle(p,r);return `<g data-curve-handle="${esc(r.id)}" tabindex="0" role="button" aria-label="传盘弧度点，拖动或用方向键调整" transform="translate(${b.x},${b.y})"><circle r="12" fill="transparent" stroke="transparent" stroke-width="24" vector-effect="non-scaling-stroke"/><circle r="12" fill="#fff" stroke="#e8ba60" stroke-width="3"/><path d="M-4 2 Q0 -5 4 2" fill="none" stroke="#805d27" stroke-width="2"/></g>`;}
function pathD(p,r){return RouteGeometry.path(p,r);}
function render(){
 const rules=kindFilter==='rules';$$('[data-mode]').forEach(b=>{const active=(b.dataset.mode==='rules')===rules;b.classList.toggle('active',active);b.setAttribute('aria-pressed',String(active));});$('.filterbar').hidden=rules;$('.top-actions').hidden=rules;document.title=rules?'WFDF 规则 · Tiga':'Tiga战术库';document.body.classList.toggle('rules-mode',rules);$('#rules-panel').hidden=!rules;$('#rules-filters').hidden=!rules;$('#rules-header-actions').hidden=!rules;$('#cards').hidden=rules;$('#tactic-filters').hidden=rules;$('#search').placeholder=rules?'搜索规则：走步、Pick、18.2.1…':'搜索战术、Drill、标签或执行要点';$('#search').setAttribute('aria-label',rules?'搜索 WFDF 规则':'搜索战术与 Drill');
 if(rules){$$('#kind-tabs button').forEach(b=>b.classList.toggle('active',b.dataset.kind==='rules'));renderRules();return;}
 $$('#kind-tabs button').forEach(b=>b.classList.toggle('active',b.dataset.kind===kindFilter));
 $('footer>span:last-child').textContent='服务器共享';
 let data=state.tactics.filter(t=>(kindFilter==='all'||Roster.kind(t)===kindFilter)&&(category==='全部'||t.category===category)&&[t.name,t.summary,t.english,t.category,...t.tags,...t.frames.flatMap(f=>[f.name,f.notes])].join(' ').toLowerCase().includes(search.toLowerCase()));
 data.sort(sort==='name'?(a,b)=>a.name.localeCompare(b.name,'zh-CN'):(a,b)=>(b.updated||0)-(a.updated||0)||((samples.findIndex(t=>t.id===a.id)+1||999)-(samples.findIndex(t=>t.id===b.id)+1||999)));
 $('#list-title').textContent=kindFilter==='drill'?'Drill':kindFilter==='tactic'?'战术':'全部内容';$('#list-count').textContent=loaded?data.length+' 项':'加载中';$('#footer-count').textContent='共 '+data.length+' 项';
 $('#cards').innerHTML=data.map(t=>{const drill=Roster.kind(t)==='drill',f=t.frames[0],off=f.players.filter(p=>p.team==='offense').length,def=f.players.length-off;return '<article class="card"><button class="card-open" data-open="'+esc(t.id)+'"><div class="card-preview">'+svgField(f,{mini:true,markers:t.markers||[]})+'</div><div class="card-body"><div class="card-heading"><h3>'+esc(t.name)+'</h3><span class="kind-chip '+(drill?'drill':'')+'">'+(drill?'Drill':'战术')+'</span></div><div class="card-meta"><span>'+(drill?f.players.length+' 人':off+' 攻 / '+def+' 防')+'</span><span>'+t.frames.length+' 步</span>'+(drill?'':'<span>'+esc(t.category)+'</span>')+'</div>'+(t.summary?'<p class="card-desc">'+esc(t.summary)+'</p>':'')+'</div><span class="row-arrow">›</span></button></article>';}).join('');
 $('#empty').hidden=!!data.length||!loaded;permissions();
}
function closeMenus(){$$('.more-menu').forEach(d=>d.open=false);}
document.addEventListener('click',e=>{const k=e.target.closest('[data-kind]');if(k){const next=k.dataset.kind;if((next==='rules')!==(kindFilter==='rules')){search='';$('#search').value='';}kindFilter=next;if(next==='rules')window.history.replaceState(window.history.state,'','#rules');else if(location.hash==='#rules'||location.hash.startsWith('#rule='))window.history.replaceState(window.history.state,'',location.pathname+location.search);category='全部';$('#category-filter').value=category;render();}const open=e.target.closest('[data-open]');if(open)openTactic(open.dataset.open);if(!e.target.closest('.more-menu'))closeMenus();});
$('#search').addEventListener('input',e=>{search=e.target.value.trim();if(kindFilter==='rules')rulesLimit=8;render();});$('#sort').addEventListener('change',e=>{sort=e.target.value;render();});$('#category-filter').addEventListener('change',e=>{category=e.target.value;if(category==='基础训练')kindFilter='drill';else if(category!=='全部')kindFilter='tactic';render();});
function current(){return draft.frames[frameIndex];}
function holdsDisc(f,p){const closest=f.players.reduce((best,q)=>Math.hypot(q.x-f.disc.x,q.y-f.disc.y)<Math.hypot(best.x-f.disc.x,best.y-f.disc.y)?q:best);return closest.id===p.id&&Math.hypot(p.x-f.disc.x,p.y-f.disc.y)<40;}
function stop(){onCancel();playing=false;cancelAnimationFrame(raf);$('#play-btn').textContent='▶';$('#play-btn').setAttribute('aria-label','播放跑位');$('#frame-hint').textContent='逐步看清每一次配合';}
function checkpoint(){history.push({draft:clone(draft),frameIndex});if(history.length>40)history.shift();dirty=true;$('#undo-btn').disabled=!canModifyDraft()||saving;$('#edit-status').textContent='有未保存的修改';}
function setCreateKind(kind){createKind=kind;$$('[data-create-kind]').forEach(b=>b.setAttribute('aria-pressed',b.dataset.createKind===kind));$('#preset-label').hidden=creationUI?.isAI()===true;$('#create-preset').value=kind==='drill'?'blank':'basic-vertical';$('#create-offense').value=kind==='drill'?3:7;$('#create-defense').value=kind==='drill'?0:7;updateCreateTotal();}
function updateCreateTotal(){const n=Number($('#create-offense').value)+Number($('#create-defense').value),limit=createKind==='drill'?7:14;$('#create-total').textContent='共 '+n+' 人 · '+(createKind==='drill'?'Drill 最多 7 人':'每方最多 7 人');$('#create-total').classList.toggle('invalid',n<1||n>limit);}
function newTactic(){if(!canEdit){requestEdit(newTactic);return;}setCreateKind(kindFilter==='tactic'?'tactic':'drill');$('#create-name').value='';creationUI.openSetup('ai');}
$$('[data-create-kind]').forEach(b=>b.onclick=()=>setCreateKind(b.dataset.createKind));
['#create-offense','#create-defense'].forEach(id=>$(id).addEventListener('input',()=>{$('#create-preset').value='blank';updateCreateTotal();}));
$('#create-preset').onchange=()=>{if($('#create-preset').value!=='blank'){const off=Number($('#create-offense').value),def=Number($('#create-defense').value);if(off!==7&&def!==7){$('#create-offense').value=7;if(createKind==='drill')$('#create-defense').value=0;}}updateCreateTotal();};
$('#create-cancel').onclick=()=>$('#create-dialog').close();
$('#create-form').onsubmit=e=>{e.preventDefault();const off=Number($('#create-offense').value),def=Number($('#create-defense').value);let players;try{players=Roster.create(off,def,createKind);}catch(error){toast(error.message);return;}
 if(creationUI?.isAI()){creationUI.describe();return;}
 const preset=$('#create-preset').value,base=preset!=='blank'?coreSamples.find(t=>t.id===preset):null;
 if(base){const key={'basic-vertical':'vertical','basic-horizontal':'horizontal','defense-cup':'zone'}[preset];if(off===7&&def===7)players=clone(base.frames[0].players).map(p=>({...p,number:p.team==='defense'?p.id-7:p.id}));else if(key){const f=Roster.arrange({players,disc:{...players[0]},routes:[]},key,off===7?'offense':'defense');players=f.players;}}
 const first=players.find(p=>p.team==='offense')||players[0];draft={id:uid(),kind:createKind,name:$('#create-name').value.trim()||(createKind==='drill'?'新 Drill':'新战术'),category:createKind==='drill'?'基础训练':'进攻战术',level:'基础',tags:[],summary:'',english:'',example:false,updated:Date.now(),frames:[{name:'步骤 1',players,disc:{x:Math.min(975,first.x+22),y:first.y},routes:[],notes:''}]};if(base)draft.formation=off===7&&def===7?base.formation:Roster.formations[{'basic-vertical':'vertical','basic-horizontal':'horizontal','defense-cup':'zone'}[preset]].name;
 $('#create-dialog').close();openDraft();dirty=true;permissions();};
function resizePlayers(off,def){if(!canModifyDraft()||saving||!draft)return;stop();try{const resized=Roster.resize(draft,off,def);checkpoint();draft=resized;if(!current().players.some(p=>p.id===selectedPlayer))selectedPlayer=null;renderBoard();}catch(error){toast(error.message);renderBoard();}}
$$('[data-count-team]').forEach(b=>b.onclick=()=>{const off=current().players.filter(p=>p.team==='offense').length,def=current().players.length-off,delta=Number(b.dataset.delta);resizePlayers(off+(b.dataset.countTeam==='offense'?delta:0),def+(b.dataset.countTeam==='defense'?delta:0));});
['#roster-offense','#roster-defense'].forEach(id=>$(id).onchange=()=>resizePlayers(Number($('#roster-offense').value),Number($('#roster-defense').value)));
$('#remove-player').onclick=()=>{if(!canModifyDraft()||saving||!selectedPlayer)return;try{const next=Roster.remove(draft,selectedPlayer);checkpoint();draft=next;selectedPlayer=null;renderBoard();}catch(error){toast(error.message);}};
$('#give-disc').onclick=()=>{if(!canModifyDraft()||saving)return;const p=current().players.find(p=>p.id===selectedPlayer);if(!p)return;checkpoint();current().disc={x:Math.min(975,p.x+22),y:p.y};renderBoard();};
$('#deselect-player').onclick=()=>{selectedPlayer=null;renderBoard();};
function openTactic(id){const found=state.tactics.find(t=>t.id===id);if(!found){toast('这套战术已不存在，请刷新团队库。');return;}draft=clone(found);openDraft({editing:false});window.history.replaceState(window.history.state,'','#tactic='+encodeURIComponent(id));}
function openDraft({editing=true}={}){mobileEdit=editing;$('#fullscreen-host').inert=false;$('.editor-shell').classList.remove('inspector-open');$('#inspector-toggle').setAttribute('aria-expanded','false');stop();playbackLoop=Roster.kind(draft)==='drill'&&draft.loop===true;playbackRound=0;frameIndex=0;tool='move';history=[];dirty=false;selectedPlayer=null;selectedMarker=null;selectedRoute=null;$('#edit-name').value=draft.name;$('#edit-category').value=draft.category;$('#edit-kind').value=Roster.kind(draft);$('#edit-level').value=draft.level;$('#edit-summary').value=draft.summary;$('#edit-tags').value=draft.tags.join(', ');$('#editor-title').textContent=draft.name||'新建战术';$('#edit-status').textContent=canEdit?'修改后保存到服务器':'服务器战术 · 只读查看';$('#delete-tactic').hidden=!state.tactics.some(t=>t.id===draft.id);setTool('move');renderBoard();if(!$('#editor').open)$('#editor').showModal();}
function setTool(t){stop();selectedRoute=null;tool=t;if(t==='marker')selectedPlayer=null;if(t==='run'||t==='pass')selectedMarker=null;$$('[data-tool]').forEach(b=>b.classList.toggle('selected',b.dataset.tool===t));$('#tool-hint').textContent=t==='move'?'拖动球员调整站位 · 选中球员后可用方向键微调':t==='run'?'从球员身上拖向跑动终点 · 每名球员每步可绘制一条跑线':'从球员身上拖向接盘位置 · 每步一条传盘路线';}
function renderBoard(){
 routeHold.cancel();drag=null;
 const isDrill=Roster.kind(draft)==='drill';if(!isDrill)playbackLoop=false;$('#loop-play').hidden=!isDrill;$('#loop-play').setAttribute('aria-pressed',String(playbackLoop));$('#loop-play').title=playbackLoop?(Playback.continuous(draft)?'循环开启 · 首尾衔接':'循环开启 · 每轮回到首步站位'):'循环关闭 · 只播放一次';
 const selectedPass=current().routes.find(r=>r.id===selectedRoute&&r.kind==='pass');if(!selectedPass)selectedRoute=null;$('#route-controls').hidden=!selectedPass||!canEdit||playing;$('#straighten-route').disabled=!selectedPass?.bend&&!selectedPass?.points.length;
 const marker=(draft.markers||[]).find(m=>m.id===selectedMarker);if(!marker)selectedMarker=null;$('#marker-controls').hidden=!marker||!canModifyDraft();if(marker)$('#marker-label').value=marker.label;
 $('#edit-category').closest('label').hidden=Roster.kind(draft)==='drill';
 const f=current(),off=f.players.filter(p=>p.team==='offense').length;$('#roster-offense').value=off;$('#roster-defense').value=f.players.length-off;$('#roster-total').textContent=f.players.length+' 人'+(Roster.kind(draft)==='drill'?' / 7':'');const selected=f.players.find(p=>p.id===selectedPlayer);$('#selected-controls').hidden=!selected||!canModifyDraft();$('#selected-label').textContent=selected?Roster.label(selected):'';
 $('#tactic-overview').hidden=!draft.formation;$('#tactic-overview').textContent=draft.formation||'';
 const defenders=f.players.filter(p=>p.team==='defense');
 $('#defense-details').hidden=draft.category!=='防守战术'||!defenders.length;
 $('#defense-brief').innerHTML='<div class="brief-heading">起始防守分工 <small>换防与持盘变化请看当前步骤</small></div><div class="assignment-grid">'+defenders.map(p=>'<span><b>D'+Roster.number(p)+'</b>'+esc(draft.roles?.[p.id]||'对位与补位任务请在执行要点中记录')+'</span>').join('')+'</div>';
 $('#board-mount').innerHTML=svgField(f,{interactive:true,markers:draft.markers||[]});$('#editor-title').textContent=draft.name||'新建战术';$('#frame-title').textContent=`第 ${frameIndex+1} 步 · ${f.name||'未命名步骤'}`;$('#frame-counter').textContent=`${frameIndex+1} / ${draft.frames.length}`+(playing&&playbackLoop?` · 第 ${playbackRound} 轮`:'');$('#step-label').textContent=`STEP ${String(frameIndex+1).padStart(2,'0')}`;
 $('#edit-step-name').value=f.name;$('#edit-notes').value=f.notes;$('#frame-notes-preview').textContent=f.notes||'尚未填写。点「编辑详情」补充本步说明。';$('#frames').innerHTML=draft.frames.map((f,i)=>`<button data-frame="${i}" class="${i===frameIndex?'active':''}">${String(i+1).padStart(2,'0')} ${esc(f.name||'未命名步骤')}</button>`).join('');
 $('#prev-frame').disabled=frameIndex===0;$('#next-frame').disabled=frameIndex===draft.frames.length-1;$('#delete-frame').disabled=draft.frames.length===1;$('#add-frame').disabled=draft.frames.length>=24;$('#undo-btn').disabled=history.length===0;
 permissions();const svg=$('#tactic-svg');svg.addEventListener('pointerdown',onDown);svg.addEventListener('pointermove',onMove);svg.addEventListener('pointerup',onUp);svg.addEventListener('pointercancel',onCancel);svg.addEventListener('lostpointercapture',onCancel);svg.addEventListener('contextmenu',e=>{if(canModifyDraft()&&((tool==='run'&&e.target.closest('[data-player]'))||(tool==='pass'&&e.target.closest('[data-disc]'))))e.preventDefault();});svg.addEventListener('keydown',onPlayerKey);
}
function position(e){const svg=$('#tactic-svg'),p=new DOMPoint(e.clientX,e.clientY).matrixTransform(svg.getScreenCTM().inverse());return {x:Math.round(Math.min(956,Math.max(44,p.x))),y:Math.round(Math.min(515,Math.max(45,p.y)))};}
function applyRoute(id,end){const f=current(),p=f.players.find(p=>p.id===id);if(!p)return;if(tool==='pass'){f.routes=f.routes.filter(r=>r.kind!=='pass');f.disc={x:Math.min(975,p.x+22),y:p.y};}else f.routes=f.routes.filter(r=>!(r.kind==='run'&&r.player===id));const added=route(id,tool,end.x,end.y);f.routes.push(added);selectedRoute=tool==='pass'?added.id:null;}
function addMarker(at){
 selectedRoute=null;
 if((draft.markers||[]).length>=32){toast('每套战术最多 32 个角标。');return;}
 checkpoint();const used=new Set((draft.markers||[]).map(m=>m.label));let number=1;while(used.has(String(number)))number++;
 const marker={id:uid(),...at,label:String(number)};(draft.markers??=[]).push(marker);selectedMarker=marker.id;selectedPlayer=null;renderBoard();
}
function removeMarker(){if(!canModifyDraft()||saving||!selectedMarker)return;stop();checkpoint();draft.markers=(draft.markers||[]).filter(m=>m.id!==selectedMarker);selectedMarker=null;renderBoard();}
$('#straighten-route').onclick=()=>{if(!canModifyDraft()||saving)return;const r=current().routes.find(r=>r.id===selectedRoute);if(!r||(!r.bend&&!r.points.length))return;checkpoint();delete r.bend;r.points=[];renderBoard();};
$('#remove-route').onclick=()=>{if(!canModifyDraft()||saving||!selectedRoute)return;checkpoint();current().routes=current().routes.filter(r=>r.id!==selectedRoute);selectedRoute=null;renderBoard();};
$('#deselect-route').onclick=()=>{selectedRoute=null;renderBoard();};
$('#remove-marker').onclick=removeMarker;$('#deselect-marker').onclick=()=>{selectedMarker=null;renderBoard();};
$('#marker-label').addEventListener('input',e=>{if(!canModifyDraft()||saving)return;const marker=(draft.markers||[]).find(m=>m.id===selectedMarker);if(!marker)return;stop();checkpoint();marker.label=e.target.value;const label=$(`[data-marker="${marker.id}"] text`);if(label)label.textContent=marker.label;});
function onDown(e){if(!canModifyDraft()||saving||e.button>0)return;if(drag||e.isPrimary===false){e.preventDefault();onCancel();return;}const target=e.target.closest('[data-player]'),discTarget=e.target.closest('[data-disc]'),markerTarget=e.target.closest('[data-marker]'),handle=e.target.closest('[data-curve-handle]'),routeTarget=e.target.closest('[data-route-hit],[data-route]');
 if(playing){stop();renderBoard();return;}
 if(discTarget&&tool==='pass'){e.preventDefault();const f=current(),passing=f.routes.find(r=>r.kind==='pass'),p=f.players.find(p=>p.id===passing?.player)||f.players.reduce((a,b)=>Math.hypot(a.x-f.disc.x,a.y-f.disc.y)<Math.hypot(b.x-f.disc.x,b.y-f.disc.y)?a:b);selectedPlayer=p.id;selectedMarker=selectedRoute=null;drag={id:p.id,at:position(e),screenAt:{x:e.clientX,y:e.clientY},before:clone(draft),pointer:e.pointerId,moved:false};$('#tactic-svg').setPointerCapture(e.pointerId);startRouteHold(e,'pass',p.id,f.disc);return;}
 if(handle){e.preventDefault();drag={type:'curve',id:handle.dataset.curveHandle,at:position(e),screenAt:{x:e.clientX,y:e.clientY},before:clone(draft),pointer:e.pointerId,moved:false};$('#tactic-svg').setPointerCapture(e.pointerId);return;}
 if(routeTarget&&tool!=='marker'&&(!selectedPlayer||tool==='move')){const r=current().routes.find(r=>r.id===(routeTarget.dataset.routeHit||routeTarget.dataset.route)&&r.kind==='pass');if(r){e.preventDefault();selectedRoute=r.id;selectedMarker=null;selectedPlayer=null;renderBoard();return;}}
 selectedRoute=null;
 if(markerTarget){e.preventDefault();const m=(draft.markers||[]).find(m=>m.id===markerTarget.dataset.marker);if(!m)return;selectedMarker=m.id;selectedPlayer=null;drag={type:'marker',id:m.id,at:position(e),screenAt:{x:e.clientX,y:e.clientY},before:clone(draft),pointer:e.pointerId,moved:false};$('#tactic-svg').setPointerCapture(e.pointerId);return;}
 if(tool==='marker'){e.preventDefault();addMarker(position(e));return;}
 selectedMarker=null;
 if(tool!=='move'&&selectedPlayer&&!target){e.preventDefault();checkpoint();applyRoute(selectedPlayer,position(e));selectedPlayer=null;renderBoard();return;}
 if(!target){renderBoard();return;}e.preventDefault();const id=+target.dataset.player,pendingFrom=tool!=='move'&&selectedPlayer&&selectedPlayer!==id?selectedPlayer:null;selectedPlayer=id;const p=current().players.find(p=>p.id===id);drag={id,start:{x:p.x,y:p.y},at:position(e),screenAt:{x:e.clientX,y:e.clientY},before:clone(draft),pointer:e.pointerId,moved:false,discFollows:holdsDisc(current(),p),pressedAt:performance.now(),pendingFrom};$('#tactic-svg').setPointerCapture(e.pointerId);if(tool==='run')startRouteHold(e,'run',id,p);}
function onMove(e){routeHold.move(e);if(!drag||e.pointerId!==drag.pointer)return;const pos=position(e);if(Math.hypot(e.clientX-drag.screenAt.x,e.clientY-drag.screenAt.y)>10)drag.moved=true;if(!drag.moved)return;routeHold.cancel();if(drag.type==='curve'){const r=current().routes.find(r=>r.id===drag.id);r.bend=pos;r.points=[];const p=current().players.find(p=>p.id===r.player);$$('[data-route],[data-route-hit]').filter(n=>(n.dataset.route||n.dataset.routeHit)===r.id).forEach(n=>n.setAttribute('d',pathD(p,r)));$('[data-curve-handle]').setAttribute('transform',`translate(${pos.x},${pos.y})`);return;}if(drag.type==='marker'){const m=draft.markers.find(m=>m.id===drag.id);Object.assign(m,pos);$(`[data-marker="${m.id}"]`).setAttribute('transform',`translate(${m.x},${m.y})`);return;}const f=current(),p=f.players.find(p=>p.id===drag.id);if(tool==='move'){p.x=pos.x;p.y=pos.y;const node=$(`[data-player="${p.id}"]`);node.setAttribute('transform',`translate(${p.x},${p.y})`);if(drag.discFollows){f.disc={x:Math.min(975,p.x+22),y:p.y};$('#disc').setAttribute('transform',`translate(${f.disc.x},${f.disc.y})`);}f.routes.filter(r=>r.player===p.id).forEach(r=>{$$('[data-route],[data-route-hit]').filter(n=>(n.dataset.route||n.dataset.routeHit)===r.id).forEach(n=>n.setAttribute('d',pathD(p,r)));});}else{let preview=$('#route-preview');if(!preview){preview=document.createElementNS('http://www.w3.org/2000/svg','path');preview.id='route-preview';preview.setAttribute('fill','none');preview.setAttribute('stroke',tool==='run'?(p.team==='defense'?'#df9e76':'#e4efaf'):'#d1e7ee');preview.setAttribute('stroke-width','4');preview.setAttribute('stroke-dasharray',tool==='run'?'none':'8 6');$('#routes-layer').append(preview);}preview.setAttribute('d',`M${p.x} ${p.y} L${pos.x} ${pos.y}`);drag.end=pos;}}
function onUp(e){routeHold.end(e);if(!drag||e.pointerId!==drag.pointer)return;const d=drag;drag=null;if(!d.moved){if(d.pendingFrom&&performance.now()-d.pressedAt<ROUTE_HOLD_MS){checkpoint();applyRoute(d.pendingFrom,position(e));selectedPlayer=null;}renderBoard();$(`[data-${d.type==='curve'?'curve-handle':d.type==='marker'?'marker':'player'}="${d.id}"]`)?.focus({preventScroll:true});return;}history.push({draft:d.before,frameIndex});if(history.length>40)history.shift();dirty=true;$('#undo-btn').disabled=!canModifyDraft()||saving;$('#edit-status').textContent='有未保存的修改';if(!d.type&&tool!=='move'&&d.end){applyRoute(d.id,d.end);selectedPlayer=null;}renderBoard();}
function onCancel(){routeHold.cancel();if(drag){draft=drag.before;drag=null;renderBoard();}}
window.addEventListener('blur',onCancel);
document.addEventListener('visibilitychange',()=>{if(document.hidden)onCancel();});
document.addEventListener('pointerdown',event=>{if(drag&&!event.target.closest('#tactic-svg'))onCancel();},true);
function onPlayerKey(e){if(!canModifyDraft()||saving)return;if(['Delete','Backspace'].includes(e.key)&&!playing){const player=e.target.closest('[data-player]');if(tool==='pass'&&e.target.closest('[data-disc]')||tool==='run'&&player){e.preventDefault();onCancel();const kind=tool==='run'?'run':'pass',id=player?Number(player.dataset.player):null,remove=r=>r.kind===kind&&(kind==='pass'||r.player===id);if(current().routes.some(remove)){checkpoint();current().routes=current().routes.filter(r=>!remove(r));selectedRoute=null;renderBoard();toast('已删除本步路线，可撤销。');}return;}}const handle=e.target.closest('[data-curve-handle]');if(handle&&!playing){const delta={ArrowUp:[0,-5],ArrowDown:[0,5],ArrowLeft:[-5,0],ArrowRight:[5,0]}[e.key];if(!delta)return;e.preventDefault();const r=current().routes.find(r=>r.id===handle.dataset.curveHandle),p=current().players.find(p=>p.id===r.player),b=RouteGeometry.middle(p,r);checkpoint();r.bend={x:Math.min(956,Math.max(44,b.x+delta[0])),y:Math.min(515,Math.max(45,b.y+delta[1]))};r.points=[];renderBoard();$('[data-curve-handle]')?.focus({preventScroll:true});return;}const markerTarget=e.target.closest('[data-marker]');if(markerTarget){stop();selectedMarker=markerTarget.dataset.marker;if(['Delete','Backspace'].includes(e.key)){e.preventDefault();removeMarker();return;}const change={ArrowUp:[0,-5],ArrowDown:[0,5],ArrowLeft:[-5,0],ArrowRight:[5,0]}[e.key];if(change){e.preventDefault();const m=(draft.markers||[]).find(m=>m.id===selectedMarker);if(!m)return;checkpoint();m.x=Math.min(956,Math.max(44,m.x+change[0]));m.y=Math.min(515,Math.max(45,m.y+change[1]));renderBoard();$(`[data-marker="${m.id}"]`)?.focus({preventScroll:true});}return;}if(tool!=='move'||playing||!e.target.closest('[data-player]'))return;const delta={ArrowUp:[0,-5],ArrowDown:[0,5],ArrowLeft:[-5,0],ArrowRight:[5,0]}[e.key];if(!delta)return;e.preventDefault();const id=+e.target.closest('[data-player]').dataset.player;checkpoint();const p=current().players.find(p=>p.id===id),carry=holdsDisc(current(),p);p.x=Math.min(956,Math.max(44,p.x+delta[0]));p.y=Math.min(515,Math.max(45,p.y+delta[1]));if(carry)current().disc={x:Math.min(975,p.x+22),y:p.y};renderBoard();$(`[data-player="${id}"]`)?.focus({preventScroll:true});}
$$('[data-tool]').forEach(b=>b.addEventListener('click',()=>{setTool(b.dataset.tool);renderBoard();}));
function updateField(id,callback){$(id).addEventListener('input',e=>{if(!canModifyDraft()||saving)return;stop();checkpoint();callback(e.target.value);$('#editor-title').textContent=draft.name||'新建战术';});}
updateField('#edit-name',v=>draft.name=v);updateField('#edit-category',v=>{draft.category=v;if(v==='基础训练')draft.kind='drill';else{draft.kind='tactic';delete draft.loop;}$('#edit-kind').value=Roster.kind(draft);renderBoard();});updateField('#edit-kind',v=>{draft.kind=v;if(v!=='drill')delete draft.loop;if(v==='drill')draft.category='基础训练';else if(draft.category==='基础训练')draft.category='进攻战术';$('#edit-category').value=draft.category;renderBoard();});updateField('#edit-level',v=>draft.level=v);updateField('#edit-summary',v=>draft.summary=v);updateField('#edit-tags',v=>draft.tags=v.split(/[,，]/).map(s=>s.trim().slice(0,99)).filter(Boolean).slice(0,12));updateField('#edit-step-name',v=>{current().name=v;$('#frame-title').textContent=`第 ${frameIndex+1} 步 · ${v||'未命名步骤'}`;const b=$(`[data-frame="${frameIndex}"]`);if(b)b.textContent=`${String(frameIndex+1).padStart(2,'0')} ${v||'未命名步骤'}`;});updateField('#edit-notes',v=>{current().notes=v;$('#frame-notes-preview').textContent=v||'尚未填写。点「编辑详情」补充本步说明。';});
function goFrame(i){stop();selectedPlayer=null;selectedMarker=null;selectedRoute=null;frameIndex=Math.max(0,Math.min(draft.frames.length-1,i));renderBoard();}
$('#frames').addEventListener('click',e=>{const b=e.target.closest('[data-frame]');if(b)goFrame(+b.dataset.frame);});$('#prev-frame').onclick=()=>goFrame(frameIndex-1);$('#next-frame').onclick=()=>goFrame(frameIndex+1);$('#reset-play').onclick=()=>goFrame(0);
$('#add-frame').onclick=()=>{stop();if(draft.frames.length>=24)return;checkpoint();const f=advance(current());f.name=`第 ${draft.frames.length+1} 步`;f.notes='';draft.frames.splice(frameIndex+1,0,f);frameIndex++;renderBoard();toast('已沿用跑动终点和传盘落点，继续绘制下一步。');};
$('#delete-frame').onclick=()=>{if(draft.frames.length===1)return;stop();checkpoint();draft.frames.splice(frameIndex,1);frameIndex=Math.min(frameIndex,draft.frames.length-1);renderBoard();};
$('#clear-routes').onclick=()=>{stop();if(!current().routes.length)return;checkpoint();current().routes=[];renderBoard();};
$('#undo-btn').onclick=()=>{stop();const old=history.pop();if(!old)return;draft=old.draft;playbackLoop=Roster.kind(draft)==='drill'&&draft.loop===true;frameIndex=old.frameIndex;dirty=true;$('#edit-name').value=draft.name;$('#edit-category').value=draft.category;$('#edit-kind').value=Roster.kind(draft);$('#edit-level').value=draft.level;$('#edit-summary').value=draft.summary;$('#edit-tags').value=draft.tags.join(', ');renderBoard();};
$('#loop-play').onclick=()=>{if(!draft||Roster.kind(draft)!=='drill'||saving)return;stop();playbackLoop=!playbackLoop;if(canModifyDraft()){checkpoint();if(playbackLoop)draft.loop=true;else delete draft.loop;}renderBoard();if(playbackLoop&&!Playback.continuous(draft))toast('已开启循环；每轮会回到首步站位。首尾站位一致时可无缝衔接。');};
$('#play-btn').onclick=()=>{if(playing){stop();renderBoard();return;}playing=true;playbackRound=1;$('#play-btn').textContent='Ⅱ';$('#play-btn').setAttribute('aria-label','暂停播放');const hint=()=>$('#frame-hint').textContent=playbackLoop?`循环演示 · 第 ${playbackRound} 轮`+(Playback.continuous(draft)?' · 首尾衔接':' · 每轮复位'):'正在演示 · 每步内路线同时执行';renderBoard();hint();let start=performance.now();function tick(now){if(!playing)return;const f=current(),t=Math.min(1,(now-start)/2300),ease=t*t*(3-2*t);f.routes.forEach(r=>{const p=f.players.find(p=>p.id===r.player);if(!p)return;const q=RouteGeometry.at(p,r,ease);if(r.kind==='run')$(`[data-player="${r.player}"]`)?.setAttribute('transform',`translate(${q.x},${q.y})`);else $('#disc')?.setAttribute('transform',`translate(${q.x},${q.y})`);});if(t>=1&&now-start>=2900){const next=Playback.nextIndex(draft,frameIndex,playbackLoop);if(next!==null){if(next===0)playbackRound++;frameIndex=next;renderBoard();hint();start=now;}else{stop();$('#frame-hint').textContent='演示结束 · 复位可回到第一步';return;}}raf=requestAnimationFrame(tick);}raf=requestAnimationFrame(tick);};
async function saveDraft(){
 if(!canEdit){requestEdit(saveDraft);return;}if(saving||!draft)return;stop();draft.name=draft.name.trim();
 if(!draft.name){toast('先给战术起个名字。');$('#edit-name').focus();return;}if(Roster.kind(draft)==='drill'&&draft.frames.some(f=>f.players.length>7)){toast('Drill 最多 7 人，请先调整人数。');return;}if(!validTactic(draft)){toast('内容格式不正确，请检查战术信息。');return;}
 const snapshot=clone(draft);saving=true;permissions();
 try{const result=await api('tactics/'+encodeURIComponent(snapshot.id),{method:'PUT',body:JSON.stringify({tactic:snapshot,baseVersion:snapshot._version||0})});
  draft=clone(result.tactic);dirty=false;history=[];if(MobileUI.isPhone()){mobileEdit=false;closeInspector();}serverRevision=result.revision;const i=state.tactics.findIndex(t=>t.id===draft.id);if(i>=0)state.tactics[i]=clone(draft);else state.tactics.unshift(clone(draft));
  window.history.replaceState(window.history.state,'','#tactic='+encodeURIComponent(draft.id));connected=true;cacheLibrary();render();renderBoard();$('#edit-status').textContent='已保存到服务器';toast('已保存到服务器，队友打开链接即可查看。');
 }catch(error){if(error.status===401){canEdit=false;toast('编辑权限已过期，请解锁后再次保存。');}else if(error.status===409){toast(error.message);if(confirm('这套战术已被队友更新或删除。是否将你的修改另存为新战术，保留双方内容？')){draft.id=uid();delete draft._version;draft.example=false;draft.name=(draft.name+'（副本）').slice(0,100);saving=false;await saveDraft();return;}}else{connected=false;toast(error.message);}}
 finally{saving=false;permissions();syncStatus();}
}
$('#save-btn').onclick=saveDraft;
function closeEditor({discard=false}={}){if(saving)return false;if(boardFull){exitBoardFullscreen();return;}if(dirty&&!discard){if(!$('#discard-dialog').open)$('#discard-dialog').showModal();return false;}stop();$('#editor').close();draft=null;window.history.replaceState(window.history.state,'',location.pathname+location.search);}
function clearFullscreenStyle(){
 boardFull=false;nativeFullscreen=false;$('#editor .editor-head').inert=false;$('.inspector').inert=false;
 $('.board-column').classList.remove('board-fullscreen');document.body.classList.remove('board-is-fullscreen');
 $('#fullscreen-btn').textContent='⛶ 横屏全屏';$('#fullscreen-btn').setAttribute('aria-pressed','false');
 if(orientationLocked){try{screen.orientation.unlock();}catch{}orientationLocked=false;}
}
async function exitBoardFullscreen(){
 const wasNative=document.fullscreenElement===$('#fullscreen-host');clearFullscreenStyle();
 if(wasNative){try{await document.exitFullscreen();}catch{}}
}
$('#fullscreen-btn').onclick=async()=>{
 if(boardFull){await exitBoardFullscreen();return;}
 stop();renderBoard();boardFull=true;$('#editor .editor-head').inert=true;$('.inspector').inert=true;const board=$('.board-column');board.classList.add('board-fullscreen');document.body.classList.add('board-is-fullscreen');
 $('#fullscreen-btn').textContent='✕ 退出全屏';$('#fullscreen-btn').setAttribute('aria-pressed','true');
 try{const host=$('#fullscreen-host');if(host.requestFullscreen){await host.requestFullscreen();nativeFullscreen=document.fullscreenElement===host;}}catch{}
 if(nativeFullscreen&&screen.orientation?.lock){try{await screen.orientation.lock('landscape');orientationLocked=true;if(!boardFull){screen.orientation.unlock();orientationLocked=false;}}catch{}}
};
document.addEventListener('fullscreenchange',()=>{if(boardFull&&nativeFullscreen&&!document.fullscreenElement)clearFullscreenStyle();});
function endMobileEdit(){stop();mobileEdit=false;selectedPlayer=null;selectedMarker=null;selectedRoute=null;closeInspector();renderBoard();}
function editorBack(){if(saving)return;if(boardFull){exitBoardFullscreen();return;}if(MobileUI.isPhone()&&$('.editor-shell').classList.contains('inspector-open')){closeInspector();return;}if(MobileUI.isPhone()&&mobileEdit){endMobileEdit();return;}closeEditor();}
$('#mobile-edit-btn').onclick=()=>requestEdit(()=>{mobileEdit=true;renderBoard();});
$('#close-editor').onclick=editorBack;$('#editor').addEventListener('cancel',e=>{e.preventDefault();editorBack();});
$('#discard-cancel').onclick=()=>{$('#discard-dialog').close();if(MobileUI.isPhone()){mobileEdit=true;renderBoard();}};
$('#discard-confirm').onclick=()=>{dirty=false;$('#discard-dialog').close();closeEditor({discard:true});};
$('#discard-save').onclick=async()=>{await saveDraft();if(!dirty&&!saving){$('#discard-dialog').close();closeEditor();}};
watchMedia('(max-width:600px)',()=>{if(draft)renderBoard();});
$('#delete-tactic').onclick=()=>{
 if(!canModifyDraft()||saving||!draft)return;closeMenus();$('#delete-confirm-name').textContent='「'+draft.name+'」';$('#delete-dialog').showModal();$('#delete-cancel').focus();
};
$('#delete-cancel').onclick=()=>$('#delete-dialog').close();$('#delete-dialog').addEventListener('cancel',e=>{if(saving)e.preventDefault();});
$('#delete-form').onsubmit=async e=>{
 e.preventDefault();if(!canModifyDraft()||saving||!draft)return;const id=draft.id;$('#delete-confirm').disabled=true;$('#delete-cancel').disabled=true;
 saving=true;permissions();try{const result=await api('tactics/'+encodeURIComponent(id),{method:'DELETE',body:JSON.stringify({baseVersion:draft._version})});state.tactics=state.tactics.filter(t=>t.id!==id);serverRevision=result.revision;dirty=false;saving=false;$('#delete-dialog').close();closeEditor();cacheLibrary();render();toast('已从球队战术库移除。');}catch(error){toast(error.message);if(error.status===401)canEdit=false;}finally{saving=false;$('#delete-confirm').disabled=false;$('#delete-cancel').disabled=false;permissions();}
};
['#new-btn','#empty-new'].forEach(id=>$(id).onclick=newTactic);
function showSpeedInfo(){closeMenus();$('#speed-data').innerHTML=SpeedInfo.text().map(([label,value])=>'<div><dt>'+esc(label)+'</dt><dd>'+esc(value)+'</dd></div>').join('');$('#speed-dialog').showModal();}$('#speed-btn').onclick=showSpeedInfo;$('#ai-chat-speed').onclick=showSpeedInfo;$('#speed-close').onclick=()=>$('#speed-dialog').close();$('#speed-copy').onclick=async()=>{if(await copyText(SpeedInfo.report()))toast('已复制本机速度诊断。');else toast('复制未成功，请查看上方耗时。');};
$('#help-btn').onclick=()=>{closeMenus();$('#help').showModal();};$$('.help-close').forEach(b=>b.onclick=()=>$('#help').close());
$('#export-btn').onclick=()=>{closeMenus();const blob=new Blob([JSON.stringify({format:'disc-playbook',version:1,...state},null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`飞盘战术备份-${new Date().toISOString().slice(0,10)}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);toast('战术备份已导出。');};
async function importToServer(tactics){
 const result=await api('import',{method:'POST',body:JSON.stringify({tactics})});await loadLibrary({quiet:true});toast('已上传 '+result.added+' 套；保留冲突副本 '+result.copied+' 套；跳过相同内容 '+result.skipped+' 套。');return result;
}
$('#import-btn').onclick=()=>{closeMenus();requestEdit(()=>$('#import-file').click());};
$('#import-file').onchange=async e=>{const f=e.target.files[0];if(!f)return;try{if(f.size>5*1024*1024)throw Error('文件过大，请选择 5MB 以下的备份。');const data=JSON.parse(await f.text());if(data.format!=='disc-playbook'||data.version!==1||!Array.isArray(data.tactics)||data.tactics.length>500||!data.tactics.every(validTactic))throw Error('请选择本站导出的有效 JSON 备份。');if(!confirm('将 '+data.tactics.length+' 套战术合并到球队服务器？相同内容会跳过，发生冲突时另存副本，队友也能查看上传内容。'))return;await importToServer(data.tactics);}catch(error){toast(error instanceof SyntaxError?'无法读取 JSON 备份。':error.message);}finally{e.target.value='';}};
$('#migrate-local').onclick=()=>requestEdit(async()=>{const pending=migrationCandidates();if(!pending.length)return;$('#migrate-local').disabled=true;try{await importToServer(pending);pending.forEach(t=>migrated[t.id]=String(t.updated||0));try{localStorage.setItem(MIGRATION_KEY,JSON.stringify(migrated));}catch{}syncStatus();}catch(error){toast(error.message);}finally{$('#migrate-local').disabled=false;}});
$('#retry-sync').onclick=()=>loadLibrary();
$('#access-btn').onclick=async()=>{if(!canEdit){requestEdit();return;}try{await api('logout',{method:'POST',body:'{}'});canEdit=false;permissions();render();toast('编辑已关闭，仍可查看和分享。');}catch(error){toast(error.message);}};
$('#editor-unlock-btn').onclick=()=>requestEdit();
$('#auth-form').onsubmit=async e=>{e.preventDefault();$('#auth-submit').disabled=true;$('#auth-error').textContent='';try{await api('login',{method:'POST',body:JSON.stringify({password:$('#edit-password').value})});canEdit=true;$('#auth-dialog').close();$('#edit-password').value='';await loadLibrary({quiet:true});if(draft)renderBoard();const action=pendingAuthAction;pendingAuthAction=null;await action?.();toast('编辑已解锁，保存后会同步给队友。');}catch(error){$('#auth-error').textContent=error.message;}finally{$('#auth-submit').disabled=false;}};
$('#auth-cancel').onclick=()=>{$('#auth-dialog').close();pendingAuthAction=null;};
async function copyText(value){
 try{if(navigator.clipboard?.writeText){await Promise.race([navigator.clipboard.writeText(value),new Promise((_,reject)=>setTimeout(()=>reject(Error('copy timeout')),1200))]);return true;}}catch{}
 const input=document.createElement('textarea');input.value=value;input.setAttribute('readonly','');input.className='clipboard-helper';($('#share-dialog').open?$('.share-content'):$('#editor').open?$('.editor-shell'):document.body).append(input);input.select();input.setSelectionRange(0,value.length);let copied=false;try{copied=document.execCommand('copy');}catch{}input.remove();return copied;
}
$('#share-btn').onclick=async()=>{
 if(!draft)return;
 if(dirty||!state.tactics.some(t=>t.id===draft.id)){if(!canEdit){toast('先开启编辑并保存，再分享。');return;}await saveDraft();if(dirty||!state.tactics.some(t=>t.id===draft.id))return;}
 const url=new URL('.',location.href);url.hash='tactic='+encodeURIComponent(draft.id);
 if(await copyText(url.href)){toast('链接已复制，队友打开后会直接进入这套战术。');return;}
 $('#share-url').value=url.href;$('#share-copy-status').textContent='可点击复制，或长按链接手动复制。';$('#share-dialog').showModal();$('#share-url').focus();$('#share-url').select();
};
$('#view-share-link').onclick=()=>{if(!draft||!state.tactics.some(t=>t.id===draft.id)){toast('先保存到服务器，再分享给队友。');return;}const url=new URL('.',location.href);url.hash='tactic='+encodeURIComponent(draft.id);$('#share-url').value=url.href;$('#share-copy-status').textContent='队友打开后直接进入这套战术。';closeMenus();$('#share-dialog').showModal();$('#share-url').focus();$('#share-url').select();};
$('#share-close').onclick=()=>$('#share-dialog').close();
$('#share-copy').onclick=async()=>{$('#share-copy-status').textContent=await copyText($('#share-url').value)?'链接已复制。':'请长按或选中上方链接，手动复制。';};
function closeInspector(){document.activeElement?.blur();$('.editor-shell').classList.remove('inspector-open');$('#fullscreen-host').inert=false;$('#inspector-toggle').setAttribute('aria-expanded','false');}
$('#inspector-close').onclick=closeInspector;
$('#inspector-toggle').onclick=()=>{const open=$('.editor-shell').classList.toggle('inspector-open');$('#fullscreen-host').inert=open&&MobileUI.isPhone();$('#inspector-toggle').setAttribute('aria-expanded',String(open));if(open)$('#inspector-close').focus({preventScroll:true});};
window.addEventListener('hashchange',()=>{
 const id=new URLSearchParams(location.hash.slice(1)).get('tactic');
 if(id&&loaded&&id!==draft?.id){if(dirty||saving){toast('请先保存或关闭当前编辑，再打开分享链接。');return;}openTactic(id);}
 if(location.hash==='#rules'||location.hash.startsWith('#rule=')){const targetHash=location.hash;if($('#editor').open){if(dirty||saving)return;closeEditor();window.history.replaceState(window.history.state,'',targetHash);}showRulesLink();}
});
let rulesData=null,rulesVisuals=[],rulesVisualsError=false,rulesLoading=null,rulesError='',rulesLimit=8,rulesBilingual=false,focusedRuleKey=null,activeRuleVisuals=[];const modeQueries={tactics:'',rules:''};let lastTacticKind='all';
function switchMode(mode){closeMenus();const wasRules=kindFilter==='rules';modeQueries[wasRules?'rules':'tactics']=search;if(!wasRules)lastTacticKind=kindFilter;kindFilter=mode==='rules'?'rules':lastTacticKind;search=modeQueries[mode];$('#search').value=search;if(mode==='rules')window.history.replaceState(window.history.state,'','#rules');else window.history.replaceState(window.history.state,'',location.pathname+location.search);render();}
$$('[data-mode]').forEach(b=>bindTap(b,()=>switchMode(b.dataset.mode)));
function highlightRule(text){
 const query=search.trim();if(query.length<2||query.length>60||!text)return esc(text||'');
 const at=text.toLowerCase().indexOf(query.toLowerCase());return at<0?esc(text):esc(text.slice(0,at))+'<mark>'+esc(text.slice(at,at+query.length))+'</mark>'+esc(text.slice(at+query.length));
}
function ruleWords(e){
 const zh=e.zh?'<p lang="zh-CN">'+highlightRule(e.zh)+'</p>':'';
 const en=e.en&&(!e.zh||rulesBilingual)?'<p lang="en" class="rule-en">'+highlightRule(e.en)+'</p>':'';
 return zh+en;
}
function ruleSection(group){
 const root=group.root,short=root.doc==='core'&&root.chapter!=='definitions'&&root.zh?.length<32&&group.rows.length>1;
 const title=short?root.zh.replace(/[“”「」：:]/g,''):root.title;
 const label=root.doc==='core'?'':root.doc==='annotations'?'官方注释':'赛事附录';
 const rows=short?group.rows.filter(e=>e.key!==root.key):group.rows;
 return '<section class="rule-section" data-section="'+esc(root.key)+'"><header><div class="rule-section-title"><span>'+esc(root.ref)+'</span><h3>'+esc(title)+'</h3>'+(label?'<small>'+label+'</small>':'')+'</div><div class="rule-section-actions"><button data-copy-rule="'+esc(root.key)+'" aria-label="复制本节链接" title="复制本节链接">↗</button><a href="'+esc(root.url)+'" target="_blank" rel="noopener noreferrer" aria-label="查看来源网页" title="查看来源网页">⋯</a></div></header><div class="rule-rows">'+rows.map(e=>{
 const depth=root.doc==='core'?Math.max(0,e.ref.split('.').length-root.ref.split('.').length-1):0;
 const definition=e.chapter==='definitions',lead=e.key===root.key;
 return '<article class="rule-row'+(group.matches.includes(e.key)?' rule-hit':'')+(e.key===focusedRuleKey?' rule-target':'')+(definition?' definition-row':'')+(lead?' lead-rule':'')+'" data-rule-key="'+esc(e.key)+'" data-depth="'+Math.min(depth,3)+'">'+(definition||lead?'':'<button class="rule-number" data-copy-rule="'+esc(e.key)+'" title="复制此条链接" aria-label="复制 '+esc(e.ref)+' 条款链接">'+esc(e.ref)+'</button>')+'<div class="rule-copy">'+ruleWords(e)+'</div></article>';
 }).join('')+'</div></section>';
}
function visualThumb(v){return '<button class="visual-thumb" data-rule-visual="'+v.id+'" title="查看 '+esc(v.title)+' 示意"><img src="'+esc(staticAsset(v.image))+'" alt="'+esc(v.title)+'示意" loading="lazy"><span>'+esc(v.title)+'</span><small>'+esc(v.kind==='signal'?v.en+' · 手势':'WFDF 场地图')+' ↗</small></button>';}
function renderVisuals(hits){
 const query=search.toLowerCase().trim(),all=['手势图','手势','hand signals','signals'].includes(query);
 let visuals=all?rulesVisuals.filter(v=>v.kind==='signal'):query?rulesVisuals.filter(v=>v.aliases.some(a=>query.includes(a.toLowerCase()))||hits.slice(0,5).some(e=>v.refs.some(r=>(e.doc==='annotations'?[e.related||'']:[e.ref,...(e.refs||[])]).some(ref=>ref===r||ref.startsWith(r+'.'))))):[];
 if(!all&&!hits.length)visuals=[];
 visuals.sort((a,b)=>Number(b.aliases.some(x=>x.toLowerCase()===query))-Number(a.aliases.some(x=>x.toLowerCase()===query)));
 activeRuleVisuals=visuals;$('#rule-visuals').hidden=!visuals.length;$('#rule-visuals').classList.toggle('all-signals',all);
 $('#rule-visuals').innerHTML=(all?visuals:visuals.slice(0,4)).map(visualThumb).join('')+(!all&&visuals.length>4?'<button class="visual-more" id="visual-more">全部 '+visuals.length+' 张图解 ↗</button>':'');
 return all;
}
async function fetchRules(){
 if(rulesData||rulesLoading)return;rulesError='';
 rulesLoading=(async()=>{try{const [r,v]=await Promise.all([fetch(staticAsset('wfdf/index.json')),fetch(staticAsset('wfdf/visuals.json')).catch(()=>null)]);if(!r.ok)throw Error('规则文字暂时未能加载');rulesData=await r.json();try{if(!v?.ok)throw Error();rulesVisuals=(await v.json()).entries;}catch{rulesVisualsError=true;}
 $('#rules-chapter').innerHTML='<option value="">全部章节</option>'+rulesData.chapters.map(c=>'<option value="'+c.id+'">'+c.id+'. '+esc(c.title)+'</option>').join('')+'<option value="definitions">名词定义</option>';
 const linked=new URLSearchParams(location.hash.slice(1)).get('rule');if(linked)applyRuleLink(linked);
 }catch(error){rulesError=error.message;rulesData=null;}finally{rulesLoading=null;if(kindFilter==='rules')renderRules();}})();
}
function renderRules(){
 $('#list-title').textContent='';$('#footer-count').textContent='WFDF · 2025–2028';$('footer>span:last-child').textContent='';
 $$('[data-rule-query]').forEach(b=>{const active=b.dataset.ruleQuery.toLowerCase()===search.toLowerCase();b.classList.toggle('active',active);b.setAttribute('aria-pressed',String(active));});
 $('#rules-language-btn').setAttribute('aria-pressed',String(rulesBilingual));
 if(!rulesData){$('#rules-results-meta').textContent='';$('#list-count').textContent='';$('#rule-results').innerHTML=rulesError?'<div class="rules-message">'+esc(rulesError)+'<br><button class="quiet-btn" id="rules-retry">重新加载</button></div>':'<p class="rules-message">正在加载规则文字…</p>';$('#rules-more').hidden=true;if(rulesError)$('#rules-retry').onclick=fetchRules;else fetchRules();return;}
 const scope=$('#rules-scope').value,chapter=$('#rules-chapter').value;
 const hits=WFDFSearch.search(rulesData.entries,search,{scope,chapter});
 const allSignals=renderVisuals(hits);$('#rules-more').hidden=true;$('#rules-language-btn').hidden=allSignals||scope==='annotations'||scope==='appendix';
 if(allSignals){$('#rules-results-meta').textContent='24 种官方手势 · 点击放大';$('#rule-results').innerHTML=rulesVisualsError?'<p class="rules-message">示意图暂时无法加载，请刷新重试。</p>':'';return;}
 if(!search&&!chapter&&scope==='core'){
  $('#rules-results-meta').textContent='正文 2025–2028 · 按章节阅读';$('#rule-results').innerHTML='<div class="rule-chapter-grid">'+rulesData.chapters.map(c=>'<button data-rule-chapter="'+c.id+'"><span>'+c.id.padStart(2,'0')+'</span><strong>'+esc(c.title)+'</strong><i>›</i></button>').join('')+'<button data-rule-chapter="definitions"><span>词</span><strong>名词定义</strong><i>›</i></button></div>';return;
 }
 const groups=WFDFSearch.sections(rulesData.entries,hits);
 $('#list-count').textContent=hits.length+' 条';$('#rules-results-meta').textContent=hits.length?(search?hits.length+' 条命中 · '+groups.length+' 节上下文':groups.length+' 节 · '+hits.length+' 条'):'没有匹配条款';
 $('#rule-results').innerHTML=groups.length?groups.slice(0,rulesLimit).map(ruleSection).join(''):'<p class="rules-message">试试更短的关键词、英文术语或条款号，或扩大来源和章节范围。</p>';
 $('#rules-more').hidden=groups.length<=rulesLimit;
 if(focusedRuleKey){const key=focusedRuleKey;focusedRuleKey=null;requestAnimationFrame(()=>Array.from(document.querySelectorAll('[data-rule-key]')).find(el=>el.dataset.ruleKey===key)?.scrollIntoView({block:'center'}));}
}
function applyRuleLink(key){const entry=rulesData?.entries.find(e=>e.key===key);if(!entry)return;$('#rules-scope').value=entry.doc;$('#rules-chapter').value='';$('#rules-chapter').disabled=entry.doc!=='core';search=entry.ref;$('#search').value=search;rulesLimit=8;focusedRuleKey=key;}
function showRulesLink(){kindFilter='rules';const key=new URLSearchParams(location.hash.slice(1)).get('rule');if(key&&rulesData)applyRuleLink(key);render();}
$('#rules-scope').onchange=()=>{$('#rules-chapter').disabled=['annotations','appendix'].includes($('#rules-scope').value);if($('#rules-chapter').disabled)$('#rules-chapter').value='';rulesLimit=8;renderRules();};
$('#rules-chapter').onchange=()=>{rulesLimit=8;renderRules();};$('#rules-more').onclick=()=>{rulesLimit+=8;renderRules();};
$('#rules-language-btn').onclick=()=>{rulesBilingual=!rulesBilingual;renderRules();};
$('#rules-info-btn').onclick=()=>$('#rules-sources').showModal();$('#rules-sources-close').onclick=()=>$('#rules-sources').close();$('#visual-close').onclick=()=>$('#rule-visual-dialog').close();$('#visual-gallery-close').onclick=()=>$('#visual-gallery').close();
document.addEventListener('click',async e=>{
 const quick=e.target.closest('[data-rule-query]');if(quick){search=quick.dataset.ruleQuery;$('#search').value=search;rulesLimit=8;renderRules();}
 const chapter=e.target.closest('[data-rule-chapter]');if(chapter){$('#rules-chapter').value=chapter.dataset.ruleChapter;search='';$('#search').value='';rulesLimit=8;renderRules();}
 if(e.target.closest('#visual-more')){$('#visual-gallery-list').innerHTML=activeRuleVisuals.map(visualThumb).join('');$('#visual-gallery').showModal();}
 const visual=e.target.closest('[data-rule-visual]');if(visual){const v=rulesVisuals.find(x=>x.id===visual.dataset.ruleVisual);if(v){$('#visual-title').textContent=v.title;$('#visual-subtitle').textContent=v.en;$('#visual-image').src=staticAsset(v.image);$('#visual-image').alt=v.title+' · WFDF 官方示意';$('#visual-description').textContent=v.description;$('#visual-source').href=v.source;$('#rule-visual-dialog').showModal();}}
 const copy=e.target.closest('[data-copy-rule]');if(copy){const url=new URL('.',location.href);url.hash='rule='+encodeURIComponent(copy.dataset.copyRule);if(await copyText(url.href))toast('已复制规则条款链接。');else{$('#share-url').value=url.href;$('#share-copy-status').textContent='可长按链接手动复制。';$('#share-dialog').showModal();}}
});
creationUI=initFrisbeeAI({requestEdit,toast,prepareCreation:()=>{setCreateKind(kindFilter==='tactic'?'tactic':'drill');$('#create-name').value='';},drawFrame:(frame,markers)=>svgField(frame,{mini:true,markers}),onDraft:tactic=>requestEdit(()=>{if(!validTactic(tactic)){toast('AI 草稿格式无效，请重新生成。');return;}draft=clone(tactic);openDraft();checkpoint();permissions();})});
if(location.hash==='#rules'||location.hash.startsWith('#rule='))showRulesLink();
window.addEventListener('beforeunload',e=>{if(dirty||saving){e.preventDefault();e.returnValue='';}});
restoreLibraryCache();render();syncStatus();loadLibrary();
setInterval(()=>{if(!document.hidden&&!saving&&!dirty)loadLibrary({quiet:true});},20000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&!saving&&!dirty)loadLibrary({quiet:true});});
