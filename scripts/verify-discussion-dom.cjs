// Optional component tests: npm install --prefix /tmp/frisbee-discussion-dom linkedom
// NODE_PATH=/tmp/frisbee-discussion-dom/node_modules node scripts/verify-discussion-dom.cjs
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {parseHTML}=require('linkedom');
const {document,window}=parseHTML('<html><body><div id="test-discussion"></div></body></html>');
window.HTMLElement.prototype.scrollIntoView=function(){};window.HTMLElement.prototype.focus=function(){};
Object.defineProperty(window.HTMLSelectElement.prototype,'value',{get(){return this.querySelector('option[selected]')?.getAttribute('value')||this.querySelector('option')?.getAttribute('value')||'';},set(value){for(const option of this.querySelectorAll('option')){if(option.getAttribute('value')===value)option.setAttribute('selected','');else option.removeAttribute('selected');}}});
const context={document,URLSearchParams,Intl,Date,console};context.setTimeout=()=>0;context.clearTimeout=()=>{};vm.createContext(context);
vm.runInContext(fs.readFileSync('dist/lite-markdown.js','utf8')+'\n'+fs.readFileSync('dist/markdown-editor.js','utf8')+'\n'+fs.readFileSync('dist/bili-video.js','utf8')+'\n'+fs.readFileSync('dist/discussion-text.js','utf8')+'\n'+fs.readFileSync('dist/discussion.js','utf8')+'\nglobalThis.discussion=TeamDiscussion;',context);
const host=document.querySelector('#test-discussion'),$=s=>host.querySelector(s),clone=x=>JSON.parse(JSON.stringify(x));
let me={id:1},admin=true,loginCount=0,nextId=3;
const stamp=Date.now();
const video={id:'game-a',name:'训练赛',video:'https://www.bilibili.com/video/BV1B7411m7LV',videoMeta:{key:'BV1B7411m7LV',page:1}};
let data={id:'training-a',games:[video],comments:[{id:1,parentId:null,player:2,name:'另一名队员',number:2,text:'<img src=x onerror=alert(1)>切入时机',avatar:'api/stats/avatars/2/'+('a'.repeat(64)),created:stamp,at:stamp,deleted:false,video:{gameId:'game-a',key:'BV1B7411m7LV',seconds:85,page:1,available:true,name:'训练赛'}},{id:2,parentId:1,player:1,name:'我',number:1,text:'历史回复',avatar:'',created:stamp,at:stamp,deleted:false,video:null}]};
const calls=[],toasts=[];
let ui;
async function api(path,options){calls.push([path,options]);const body=options.body?JSON.parse(options.body):{};const id=Number(path.split('/').at(-1));
 if(options.method==='POST'){data.comments.push({id:nextId++,parentId:body.parentId,player:1,name:'我',number:1,text:body.text,created:stamp,at:stamp,deleted:false,video:null,videoRefs:(body.videoRefs||[]).map(r=>({...r,available:true,name:'训练赛'}))});}
 else if(options.method==='DELETE'){const c=data.comments.find(c=>c.id===id);c.deleted=true;c.saved=c.text;c.text='';}
 else if(body.restore){const c=data.comments.find(c=>c.id===id);c.deleted=false;c.text=c.saved;}
 else{const c=data.comments.find(c=>c.id===id);c.text=body.text;c.video=null;c.videoRefs=(body.videoRefs||[]).map(r=>({...r,available:true,name:'训练赛'}));}
 return {comments:clone(data.comments)};
}
ui=context.discussion.init({getMe:()=>me,canEdit:()=>admin,login:()=>loginCount++,toast:t=>toasts.push(t),api,refresh:async()=>{data=clone(data);ui.render(host,'trainings',data,true);}});
(async()=>{
 ui.render(host,'trainings',data,true);
 assert.equal($('iframe').src.includes('player.bilibili.com'),true);assert.equal($('.discussion-heading'),null);assert.equal($('.discussion-hint'),null);
 const children=[...host.children];assert(children.indexOf($('[data-d="feed"]'))<children.indexOf($('[data-d="form"]')),'composer stays outside and after the scrolling feed');assert.equal($('[data-d="list"]').parentElement,$('[data-d="feed"]'));assert.equal($('[data-d="text"]').closest('.discussion-compose-row'),$('[data-d="submit"]').closest('.discussion-compose-row'));assert.equal($('[data-d="attach"]').closest('.discussion-compose-row'),$('[data-d="submit"]').closest('.discussion-compose-row'));assert.equal($('[data-d="form"]').lastElementChild,$('.discussion-compose-row'),'time fields expand above the bottom input row');
 const text=$('[data-d="text"]');assert.equal(text.getAttribute('rows'),'1');
 Object.defineProperty(text,'scrollHeight',{configurable:true,get:()=>20+24*Math.max(1,text.value.split('\n').length)});
 text.value='一行';text.oninput();assert.equal(text.style.height,'46px');
 text.value='第一行\n第二行\n第三行';text.oninput();assert.equal(text.style.height,'94px');
 text.value='一\n二\n三\n四\n五\n六';text.oninput();assert.equal(text.style.height,'118px');assert.equal(text.style.overflowY,'auto');
 text.value='';text.oninput();assert.equal(text.style.height,'46px');assert.equal(text.style.overflowY,'hidden');
 assert($('[data-d="submit"] svg'));assert.equal($('[data-d="submit"]').getAttribute('aria-label'),'发送评论');
 assert(!$('[data-d="attach"]').hidden);$('[data-d="attach"]').onclick();assert.equal($('[data-d="attach"]').getAttribute('aria-expanded'),'true');assert(!$('[data-d="time-fields"]').hidden);
 $('[data-d="attach"]').onclick();assert.equal($('[data-d="attach"]').getAttribute('aria-pressed'),'false');assert($('[data-d="time-fields"]').hidden);
 assert.equal($('[data-message="1"] .discussion-avatar img').getAttribute('src'),data.comments[0].avatar);
 assert.equal($('[data-message="1"] .discussion-message-main p').textContent,data.comments[0].text+' 1:25');
 assert.equal($('[data-message="1"] .discussion-message-main p img'),null,'comment HTML must remain text');
 $('[data-d="feed"]').scrollTop=123;const frame=$('iframe');$('[data-d="text"]').value='尚未发出的观察';ui.render(host,'trainings',clone(data),true);
 assert.equal($('iframe'),frame,'polling must not reset the player');assert.equal($('[data-d="feed"]').scrollTop,123,'polling preserves the scrolling feed');assert.equal($('[data-d="text"]').value,'尚未发出的观察');
 await host.onclick({target:$('[data-action="reply"][data-comment="1"]')});
 assert.equal($('[data-d="reply-note"]').textContent,'回复 另一名队员 的评论');
 $('[data-d="text"]').value='补充：接盘前先观察。';$('[data-d="attach"]').onclick();
 $('[data-d="time"]').value='1:25';await $('[data-d="form"]').onsubmit({preventDefault(){}});
 const posted=JSON.parse(calls.at(-1)[1].body);assert.equal(posted.parentId,1);assert.equal(posted.videoRefs[0].seconds,85);assert.equal(data.comments.length,3);assert.equal($('[data-d="text"]').value,'');assert.equal($('[data-d="text"]').style.height,'46px');assert($('[data-d="submit"] svg'));assert.equal($('[data-d="attach"]').getAttribute('aria-expanded'),'false');
 await host.onclick({target:$('[data-action="seek"][data-comment="1"]')});
 assert.equal(new URL($('iframe').src).searchParams.get('t'),'85');const firstSeek=$('iframe');
 await host.onclick({target:$('[data-action="seek"][data-comment="1"]')});assert.notEqual($('iframe'),firstSeek,'clicking the same time point must seek again');
 data.comments[0].video.seconds=0;ui.render(host,'trainings',data,true);await host.onclick({target:$('[data-action="seek"][data-comment="1"]')});assert.equal(new URL($('iframe').src).searchParams.get('t'),'0');assert.equal(new URL($('iframe').src).searchParams.get('autoplay'),'0');
 await host.onclick({target:$('[data-action="edit"][data-comment="2"]')});$('[data-d="text"]').value='修订后的补充';await $('[data-d="form"]').onsubmit({preventDefault(){}});
 assert.equal(data.comments.find(c=>c.id===2).text,'修订后的补充');
 await host.onclick({target:$('[data-action="delete"][data-comment="2"]')});await host.onclick({target:$('[data-action="delete"][data-comment="2"]')});assert(data.comments.find(c=>c.id===2).deleted);
 await host.onclick({target:$('[data-action="restore"][data-comment="2"]')});assert(!data.comments.find(c=>c.id===2).deleted);
 ui.stop(host);assert.equal($('iframe'),null,'closing a view stops embedded playback');
 me=null;ui.render(host,'trainings',data,true);assert($('[data-d="form"]').hidden);assert(!$('[data-action="login"]').hidden);
 await host.onclick({target:$('[data-action="reply"][data-comment="1"]')});assert.equal(loginCount,1);
 me={id:1};ui.render(host,'trainings',{id:'other-training',games:[],comments:[]},true);assert($('[data-d="attach"]').hidden,'no video means no timestamp button');assert($('.discussion-media').hidden,'no video leaves no empty media explanation');$('[data-d="text"]').value='新训练的评论';const before=calls.length;await $('[data-d="form"]').onsubmit({preventDefault(){}});assert.equal(calls.length,before+1,'changing context must replace old event handlers');
 console.log('PASS: bottom composer outside the feed, same-row icon controls, one-to-four-line sizing, icon controls, discussion DOM, XSS-safe text, avatars, reply/timestamp publish, editing, delete/restore, player persistence, repeated seeking, guest login and context isolation.');
})().catch(error=>{console.error(error);process.exitCode=1;});

// Load the actual team modules against index.html to catch removed-ID/startup regressions.
async function verifyStartup(){
 const dom=parseHTML(fs.readFileSync('dist/index.html','utf8')),doc=dom.document,win=dom.window;
 win.HTMLElement.prototype.getBoundingClientRect=function(){return{top:0,bottom:60,left:0,right:390,width:390,height:60};};
 win.HTMLElement.prototype.scrollTo=function(){};win.HTMLElement.prototype.showModal=function(){this.open=true;};win.HTMLElement.prototype.close=function(){this.open=false;this.dispatchEvent(new win.Event('close'));};
 doc.body.classList.add('stats-mode');
 win.history={replaceState(){}};win.matchMedia=()=>({matches:false});
 const g={id:'fixture-game',name:'训练赛',status:'finished',created:stamp,heldOn:'2026-10-28',events:[],comments:clone(data.comments),video:video.video,videoMeta:video.videoMeta};
 const t={id:'fixture-training',name:'训练',status:'completed',created:stamp,heldOn:'2026-10-28',games:[g],comments:clone(data.comments),warmup:'热身',attendees:[1],drills:[]};
 const state={players:[{id:1,number:1,name:'测试队员',gender:'male',avatar:'',loginReady:true}],games:[],trainings:[t],me:{id:1,name:'测试队员',number:1},revision:1};
 const errors=[];let poll;let inboxRows=[];
 const cx={document:doc,window:win,URLSearchParams,Intl,Date,console,setInterval:fn=>{poll=fn;return 0;},parseFloat,getComputedStyle:()=>({columnGap:'12px'}),MobileUI:{isPhone:()=>false},bindTap:(el,fn)=>el.onclick=fn};
 cx.setTimeout=()=>0;cx.clearTimeout=()=>{};vm.createContext(cx);vm.runInContext(fs.readFileSync('dist/lite-markdown.js','utf8')+'\n'+fs.readFileSync('dist/markdown-editor.js','utf8')+'\n'+['bili-video.js','discussion-text.js','discussion.js','drill-journal.js','team-metrics.js','team-hub.js','team-messages.js','stats.js'].map(name=>fs.readFileSync('dist/'+name,'utf8')).join('\n')+'\nglobalThis.stats=StatsUI;',cx);
 cx.stats.init({api:async(path,options)=>{if(path.startsWith('stats/notifications?'))return{messages:clone(inboxRows),summary:clone(state.notifications),nextOffset:null};if(path==='stats/notifications/read'){const body=JSON.parse(options.body);inboxRows.forEach(m=>{if(body.all||m.id===body.id||m.gameId===body.gameId||(!m.gameId&&m.trainingId===body.trainingId))m.unread=false;});const summary={unread:0,trainings:{},games:{},trainingComments:{}};for(const m of inboxRows.filter(m=>m.unread)){summary.unread++;if(m.trainingId)summary.trainings[m.trainingId]=(summary.trainings[m.trainingId]||0)+1;if(m.gameId)summary.games[m.gameId]=(summary.games[m.gameId]||0)+1;else if(m.trainingId)summary.trainingComments[m.trainingId]=(summary.trainingComments[m.trainingId]||0)+1;}state.notifications=summary;return{summary:clone(summary)};}return clone(state);},toast:e=>errors.push(e),canEdit:()=>true,toggleEdit(){},openTeam(){},requestEdit:fn=>fn?.(),getDrills:()=>[]});
 await new Promise(setImmediate);
 assert.equal(doc.querySelector('#stats-meta').textContent.includes('测试'),false);
 assert.equal(doc.querySelector('#trainings-list [data-training-card]')?.textContent.includes('训练'),true,'stats must initialize against real HTML IDs');
 doc.querySelector('#trainings-list [data-training-card]').click();
 assert(doc.querySelector('#training-tab-comments').classList.contains('has-unread'),'training discussion tab advertises unseen comments');
 doc.querySelector('#training-tab-comments').click();
 assert(!doc.querySelector('#training-tab-comments').classList.contains('has-unread'),'entering discussion clears its dot');
 assert.equal(doc.querySelector('#training-dialog').open,true);
 assert(doc.querySelector('#training-discussion [data-d="text"]'));
 assert(!doc.querySelector('#training-discussion [data-d="form"]').hidden);
 doc.querySelector('#training-tab-games').click();
 assert.equal(doc.querySelector('#training-discussion iframe'),null);
 doc.querySelector('#training-games [data-stats-game]').click();
 assert(doc.querySelector('#stats-tab-comments').classList.contains('has-unread'),'match discussion has a separate unread dot');
 doc.querySelector('#stats-game-video-link').click();
 assert(!doc.querySelector('#stats-tab-comments').classList.contains('has-unread'));
 assert(doc.querySelector('#game-discussion iframe'));
 assert.equal(doc.querySelector('#game-discussion .discussion-video-editor'),null);
 doc.querySelector('#stats-game-close').click();
 assert.equal(doc.querySelector('#game-discussion iframe'),null);
 doc.querySelector('#training-close').click();
 assert.equal(doc.querySelector('#training-discussion iframe'),null);
 state.players[0].joinedOn='2026-10-29';state.players.push({id:2,name:'晚添加的队员',number:2,gender:'female',avatar:'',joinedOn:'2026-10-28'});
 state.me.joinedOn='2026-10-29';state.trainings=[{...t,id:'before-join',heldOn:'2026-10-22',attendees:[1,2]},{...t,id:'after-join',heldOn:'2026-10-29',attendees:[1]}];state.revision++;
 poll();await new Promise(setImmediate);
 const averageRows=[...doc.querySelectorAll('#stats-averages tbody tr')];
 assert.equal(averageRows.find(r=>r.textContent.includes('测试队员')).lastElementChild.textContent,'100%2/2');
 assert.equal(averageRows.find(r=>r.textContent.includes('晚添加的队员')).lastElementChild.textContent,'50%1/2');
 assert(doc.querySelector('#team-roster-grid').textContent.includes('训练 2/2'));
 assert(doc.querySelector('#team-dashboard').textContent.includes('出勤 2 / 2 次'));
 // Both dashboard lists keep every record while their viewport fits exactly five rows.
 win.HTMLElement.prototype.getBoundingClientRect=function(){const i=this.parentElement?.dataset.teamFeed?[...this.parentElement.children].indexOf(this):0;return{top:i*60,bottom:(i+1)*60,left:0,right:390,width:390,height:60};};
 state.me.joinedOn=null;state.players[0].joinedOn=null;state.games=[];state.trainings=Array.from({length:8},(_,i)=>({...t,id:'past-'+i,name:'历史训练'+i,heldOn:'2026-10-'+String(i+1).padStart(2,'0'),attendees:[1],comments:i<2?[{id:800+i,player:1,text:'已写心得',deleted:false,parentId:null,created:stamp,at:stamp}]:[]}));state.revision++;
 poll();await new Promise(setImmediate);
 for(const list of doc.querySelectorAll('[data-team-feed]')){assert.equal(list.children.length,8);assert.equal(list.closest('.team-personal-records').style.getPropertyValue('--team-record-slots'),'5');list.scrollTop=120;}
 poll();await new Promise(setImmediate);for(const list of doc.querySelectorAll('[data-team-feed]'))assert.equal(list.scrollTop,120,'polling preserves record-list scroll');
 // Inbox deep links land in either a formal match or the right training scrimmage.
 const author={player:2,name:'队友',number:2,created:stamp,at:stamp,parentId:null,deleted:false};
 const formal={...g,id:'formal-match',name:'正式比赛',trainingId:null,comments:[{...author,id:901,text:'@测试队员 正式比赛复盘',mentions:[{player:1,name:'测试队员',start:0,end:5}]}]};
 const scrim={...g,id:'training-match',name:'训练对抗',trainingId:'training-links',comments:[{...author,id:902,text:'@测试队员 训练赛复盘',mentions:[{player:1,name:'测试队员',start:0,end:5}]}]};
 state.games=[formal];state.trainings=[{...t,id:'training-links',games:[scrim],comments:[]}];state.players[1].name='队友';state.notifications={unread:2,trainings:{'training-links':1},games:{'formal-match':1,'training-match':1},trainingComments:{}};state.revision++;
 inboxRows=[{id:501,trainingId:null,gameId:formal.id,gameName:formal.name,trainingName:null,commentId:901,name:'队友',text:formal.comments[0].text,heldOn:'2026-10-28',unread:true},{id:502,trainingId:'training-links',gameId:scrim.id,gameName:scrim.name,trainingName:'训练',commentId:902,name:'队友',text:scrim.comments[0].text,heldOn:'2026-10-28',unread:true}];
 poll();await new Promise(setImmediate);assert(doc.querySelector('[data-team-tab=games]').classList.contains('has-alert'));assert(doc.querySelector('[data-team-tab=trainings]').classList.contains('has-alert'));
 doc.querySelector('#team-notifications').click();await new Promise(setImmediate);
 await doc.querySelector('[data-messages-list]').onclick({target:doc.querySelector('[data-message-open="501"]')});await new Promise(setImmediate);
 assert(doc.querySelector('#stats-game-dialog').open);assert(!doc.querySelector('#training-dialog').open);assert(doc.querySelector('#game-discussion [data-message="901"]'));
 const input=doc.querySelector('#game-discussion [data-d="text"]');input.value='@#2';input.selectionStart=input.selectionEnd=3;input.oninput();assert(!doc.querySelector('#game-discussion [data-d="mention-picker"]').hidden);assert(doc.querySelector('#game-discussion [data-mention-person="2"]'));assert.equal(doc.querySelector('#game-discussion [data-d="mention-search"]'),null);
 doc.querySelector('#stats-game-close').click();assert(doc.querySelector('#team-notifications-dialog').open);assert(!doc.querySelector('[data-team-tab=games]').classList.contains('has-alert'));assert(doc.querySelector('[data-team-tab=trainings]').classList.contains('has-alert'),'formal reading does not clear training alerts');
 await doc.querySelector('[data-messages-list]').onclick({target:doc.querySelector('[data-message-open="502"]')});await new Promise(setImmediate);
 assert(doc.querySelector('#training-dialog').open);assert.equal(doc.querySelector('#training-body').dataset.trainingView,'games');assert(doc.querySelector('#stats-game-dialog').open);assert(doc.querySelector('#game-discussion [data-message="902"]'));assert.equal(doc.querySelector('#stats-game-close').getAttribute('aria-label'),'返回训练赛');
 const gameInput=doc.querySelector('#game-discussion [data-d="text"]');gameInput.value='＠队';gameInput.selectionStart=gameInput.selectionEnd=2;gameInput.oninput();assert(!doc.querySelector('#game-discussion [data-d="mention-picker"]').hidden,'full-width @ also works in training scrimmage discussion');
 doc.querySelector('#stats-game-close').click();assert(doc.querySelector('#training-dialog').open);assert(!doc.querySelector('#training-tab-games').classList.contains('has-unread'));assert(!doc.querySelector('#training-tab-comments').classList.contains('has-unread'),'scrimmage mention is not incorrectly shown as a training-comment alert');doc.querySelector('#training-close').click();assert(doc.querySelector('#team-notifications-dialog').open);
 assert.equal(errors.length,0,errors.join('\n'));
 console.log('PASS: actual StatsUI/TeamHub startup, formal/scrimmage mention deep links and independent read dots, five-row dashboard viewports with scroll preservation, player cleanup and backfilled attendance.');
}
verifyStartup().catch(error=>{console.error(error);process.exitCode=1;});

// A delayed submission must not clear a different training's composer or replace its thread.
async function verifyPendingNavigation(){
 const iso=document.createElement('div');iso.id='pending-navigation';document.body.append(iso);
 const a={id:'slow-a',games:[],comments:[]};
 const b={id:'visible-b',games:[],comments:[{id:200,parentId:null,player:2,name:'B 队员',number:2,text:'B 训练的讨论',created:stamp,at:stamp,video:null}]};
 let shown=a,release;
 let pendingUI;
 pendingUI=context.discussion.init({getMe:()=>({id:1}),canEdit:()=>false,toast(){},login(){},api:()=>new Promise(resolve=>release=resolve),refresh:async()=>pendingUI.render(iso,'trainings',shown,true)});
 pendingUI.render(iso,'trainings',shown,true);iso.querySelector('[data-d="text"]').value='A 的发言';
 const submission=iso.querySelector('[data-d="form"]').onsubmit({preventDefault(){}});
 shown=b;pendingUI.render(iso,'trainings',shown,true);iso.querySelector('[data-d="text"]').value='B 里还没发出的草稿';
 release({comments:[{id:100,parentId:null,player:1,name:'A 队员',number:1,text:'A 的发言',created:stamp,at:stamp,video:null}]});
 await submission;
 assert.equal(iso.querySelector('[data-d="text"]').value,'B 里还没发出的草稿');
 assert(iso.querySelector('[data-message="200"]'));assert.equal(iso.querySelector('[data-message="100"]'),null);
 console.log('PASS: a late submission response cannot overwrite another training discussion or clear its draft.');
}
verifyPendingNavigation().catch(error=>{console.error(error);process.exitCode=1;});

// Read cursors are scoped to viewer and context, durable per browser, and safe without storage.
function verifyUnread(){
 const dom=parseHTML('<html><body><button role="tab">训练讨论</button></body></html>'),doc=dom.document,tab=doc.querySelector('button');
 const saved=new Map();let reader={id:1},storageBlocked=false;
 const cx={document:doc,localStorage:{getItem(key){if(storageBlocked)throw Error('blocked');return saved.get(key)||null;},setItem(key,value){if(storageBlocked)throw Error('blocked');saved.set(key,value);}}};
 cx.setTimeout=()=>0;cx.clearTimeout=()=>{};vm.createContext(cx);vm.runInContext(fs.readFileSync('dist/lite-markdown.js','utf8')+'\n'+fs.readFileSync('dist/markdown-editor.js','utf8')+'\n'+fs.readFileSync('dist/discussion-text.js','utf8')+'\n'+fs.readFileSync('dist/discussion.js','utf8')+'\nglobalThis.discussion=TeamDiscussion;',cx);
 const make=()=>cx.discussion.init({getMe:()=>reader}),has=()=>tab.classList.contains('has-unread');let ui=make();
 const entry={id:'read-training',comments:[{id:100,player:1,deleted:false}]};
 ui.syncUnread(tab,'trainings',entry,false);assert(!has(),'own messages do not trigger a dot');
 entry.comments.push({id:101,player:2,deleted:false});ui.syncUnread(tab,'trainings',entry,false);assert(has());assert(tab.getAttribute('aria-label').includes('未读'));
 ui.syncUnread(tab,'trainings',entry,true);assert(!has());assert.equal(saved.size,1);
 ui=make();ui.syncUnread(tab,'trainings',entry,false);assert(!has(),'read state survives component/page reload');
 entry.comments[1].at=Date.now();ui.syncUnread(tab,'trainings',entry,false);assert(!has(),'editing old comments does not create unread messages');
 entry.comments.push({id:102,parentId:101,player:2,deleted:false});
 doc.hidden=true;ui.syncUnread(tab,'trainings',entry,true);assert(has(),'a background view must not mark new replies read');
 doc.hidden=false;ui.syncUnread(tab,'trainings',entry,false);assert(has(),'another tab leaves replies unread');
 ui.syncUnread(tab,'trainings',entry,true);assert(!has());
 entry.comments.push({id:103,player:2,deleted:true});ui.syncUnread(tab,'trainings',entry,false);assert(!has(),'deleted comments are not new-message alerts');
 ui.syncUnread(tab,'games',entry,false);assert(has(),'match read state is separate from training');
 reader={id:3};ui.syncUnread(tab,'trainings',entry,false);assert(has(),'different members have separate read state');
 reader=null;ui.syncUnread(tab,'trainings',entry,false);assert(has(),'guest read state is separate');ui.syncUnread(tab,'trainings',entry,true);assert(!has());
 storageBlocked=true;reader={id:4};ui.syncUnread(tab,'trainings',entry,true);ui.syncUnread(tab,'trainings',entry,false);assert(!has(),'blocked storage falls back to current-session memory');
 entry.comments.push({id:104,player:2,deleted:false});ui.syncUnread(tab,'trainings',entry,false);assert(has());
 console.log('PASS: unread roots/replies, own/deleted/edit exclusion, reading, background safety, per-member/context persistence and blocked-storage fallback.');
}
verifyUnread();

async function verifyMultipleVideos(){
 const iso=document.createElement('div');iso.id='multiple-videos';document.body.append(iso);
 const clips=[{id:'first-game',name:'第一场对抗',video:'https://www.bilibili.com/video/av123',videoMeta:{key:'av123',page:1}},{id:'second-game',name:'第二场对抗',video:'https://www.bilibili.com/video/BV1B7411m7LV?p=2',videoMeta:{key:'BV1B7411m7LV',page:2}}];
 const entry={id:'multi-training',games:clips,comments:[{id:1,parentId:null,player:2,name:'队员',number:2,text:'第一场的节点',created:stamp,at:stamp,video:{gameId:clips[0].id,key:'av123',seconds:15,page:1,available:true,name:clips[0].name}}]};
 let payload,scroll,animated=false,multi;
 multi=context.discussion.init({getMe:()=>({id:1}),canEdit:()=>false,toast(){},login(){},api:async(path,options)=>{payload=JSON.parse(options.body);entry.comments.push({id:2,parentId:null,player:1,name:'我',number:1,text:payload.text,created:stamp,at:stamp,video:null,videoRefs:payload.videoRefs.map(r=>({...r,available:true,name:clips.find(g=>g.id===r.gameId).name}))});return{comments:clone(entry.comments)};},refresh:async()=>multi.render(iso,'trainings',entry,true)});
 const q=s=>iso.querySelector(s);multi.render(iso,'trainings',entry,true);
 assert(!q('.discussion-video-select').hidden);assert.equal(q('[data-d="attach-video"]').options.length,2);
 q('[data-d="attach"]').onclick();q('[data-d="time"]').value='00:15';q('[data-d="attach-video"]').value=clips[1].id;q('[data-d="attach-video"]').onchange({target:q('[data-d="attach-video"]')});
 assert.equal(q('[data-d="time"]').value,'','changing videos clears stale time input');assert.equal(q('[data-d="page"]'),null);
 q('[data-d="text"]').value='观察';q('[data-d="text"]').oninput();q('[data-d="attach-video"]').value=clips[0].id;q('[data-d="attach-video"]').onchange({target:q('[data-d="attach-video"]')});q('[data-d="time"]').value='00:15';q('[data-d="insert-time"]').onclick();
 q('[data-d="text"]').value+='对比';q('[data-d="text"]').oninput();q('[data-d="attach"]').onclick();q('[data-d="attach-video"]').value=clips[1].id;q('[data-d="attach-video"]').onchange({target:q('[data-d="attach-video"]')});q('[data-d="time"]').value='01:25';q('[data-d="insert-time"]').onclick();await q('[data-d="form"]').onsubmit({preventDefault(){}});
 assert.equal(payload.videoRefs.length,2);assert.equal(payload.videoRefs[1].gameId,clips[1].id);assert.equal(payload.videoRefs[1].seconds,85);assert.equal(payload.videoRefs[1].page,2);assert.equal(q('[data-message="2"] p').querySelectorAll('button').length,2,'both nodes flow inside the same paragraph');assert.equal(q('[data-message="2"] p').textContent.includes('P2'),false);
 q('.discussion-media').scrollIntoView=options=>scroll=options;q('.discussion-media').animate=()=>animated=true;
 await iso.onclick({target:q('[data-action="seek"][data-comment="2"][data-ref="1"]')});
 const direct=q('.discussion-video-controls a[aria-label]');assert.equal(new URL(direct.href).searchParams.get('t'),'85');assert.equal(new URL(direct.href).searchParams.get('p'),'2');assert.equal(direct.target,'_blank');const params=new URL(q('iframe').src).searchParams;assert.equal(params.get('bvid'),'BV1B7411m7LV');assert.equal(params.get('t'),'85');assert.equal(params.get('p'),'2');assert.equal(q('[data-d="watch-video"]').value,'second-game');
 assert(q('[data-d="media-current"]').textContent.includes('第二场对抗 · 1:25'));assert.equal(scroll.behavior,'smooth');assert(animated);
 const frame=q('iframe');multi.render(iso,'trainings',clone(entry),true);assert.equal(q('iframe'),frame,'refresh preserves the chosen clip');
 await iso.onclick({target:q('[data-action="seek"][data-comment="1"]')});assert.equal(new URL(q('iframe').src).searchParams.get('aid'),'123');assert.equal(new URL(q('iframe').src).searchParams.get('t'),'15');assert(q('[data-d="media-current"]').textContent.includes('第一场对抗'));
 console.log('PASS: multiple scrimmage videos, selected source and part submission, timestamp-driven source switching, playback offset, smooth scroll/highlight and polling persistence.');
}
verifyMultipleVideos().catch(error=>{console.error(error);process.exitCode=1;});

async function verifyMentionsAndMobileVideo(){
 const context={document,URLSearchParams,Intl,Date,console,setTimeout:()=>0,clearTimeout:()=>{}};vm.createContext(context);vm.runInContext(fs.readFileSync('dist/lite-markdown.js','utf8')+'\n'+fs.readFileSync('dist/markdown-editor.js','utf8')+'\n'+['bili-video.js','discussion-text.js','discussion.js'].map(f=>fs.readFileSync('dist/'+f,'utf8')).join('\n')+'\nglobalThis.discussion=TeamDiscussion;',context);
 const iso=document.createElement('div');iso.id='mention-demo';document.body.append(iso);const entry={id:'mention-training',games:[video],comments:[]};let sent;
 context.window={matchMedia:()=>({matches:true})};
 const ui=context.discussion.init({getMe:()=>({id:1}),getPlayers:()=>[{id:1,name:'我',number:1},{id:2,name:'队友',number:2},...Array.from({length:8},(_,i)=>({id:i+3,name:'训练队友'+(i+3),number:i+3}))],toast(){},login(){},api:async(path,options)=>{sent=JSON.parse(options.body);entry.comments=[{...sent,id:11,parentId:null,player:1,name:'我',number:1,created:stamp,at:stamp,mentions:sent.mentions.map(m=>({...m,name:'队友'})),videoRefs:sent.videoRefs.map(r=>({...r,available:true}))}];return{comments:entry.comments};},refresh:async()=>ui.render(iso,'trainings',entry,true)});
 const q=s=>iso.querySelector(s);ui.render(iso,'trainings',entry,true);
 assert.equal(q('iframe'),null,'mobile does not connect to Bili until user chooses to watch');q('.discussion-video-start').onclick();assert(q('iframe'));assert(q('iframe').src.startsWith('https://player.bilibili.com/player.html?'));assert.equal(new URL(q('iframe').src).searchParams.get('autoplay'),'0');const frame=q('iframe');ui.render(iso,'trainings',entry,true);assert.equal(q('iframe'),frame,'polling does not reload video');q('.discussion-video-controls button').onclick();assert.notEqual(q('iframe'),frame,'retry creates a fresh player');
 const input=q('[data-d="text"]');input.setSelectionRange=(a,b)=>{input.selectionStart=a;input.selectionEnd=b;};input.value='@';input.selectionStart=input.selectionEnd=1;input.oninput();assert.equal(q('[data-d="mention-options"]').querySelectorAll('button').length,9,'bare @ shows all teammates');assert.equal(q('[data-d="mention-search"]'),null,'query is typed in the comment itself');input.value='@#10';input.selectionStart=input.selectionEnd=input.value.length;input.oninput();assert.equal(q('[data-d="mention-options"]').querySelectorAll('button').length,1);assert(q('[data-mention-person="10"]'));input.value='🥏请 @队';input.selectionStart=input.selectionEnd=input.value.length;input.oninput();assert(!q('[data-d="mention-picker"]').hidden);q('[data-d="mention-options"]').onclick({target:q('[data-mention-person="2"]')});assert(input.value.includes('@队友'));assert(!q('[data-d="highlight"]').hidden);assert.equal(q('.discussion-draft-mention').textContent,'@队友');assert(input.classList.contains('has-mention-highlight'));
 q('[data-d="attach"]').onclick();q('[data-d="time"]').value='00:15';q('[data-d="insert-time"]').onclick();await q('[data-d="form"]').onsubmit({preventDefault(){}});
 assert(q('[data-d="highlight"]').hidden,'successful sending clears draft decorations');assert.equal(sent.mentions.length,1);assert.equal(sent.mentions[0].player,2);assert.equal(Array.from(sent.text).slice(sent.mentions[0].start,sent.mentions[0].end).join(''),'@队友');assert.equal(sent.videoRefs.length,1);assert.equal(q('.discussion-mention').textContent,'@队友');assert(q('[data-message="11"] .discussion-timestamp'));
 await iso.onclick({target:q('[data-action="edit"]')});assert(input.value.includes('@队友'));input.value='前缀'+input.value;input.oninput();await q('[data-d="form"]').onsubmit({preventDefault(){}});assert.equal(Array.from(sent.text).slice(sent.mentions[0].start,sent.mentions[0].end).join(''),'@队友');
 ui.stop(iso);assert.equal(q('iframe'),null,'leaving discussion releases the player');delete context.window;
 console.log('PASS: typed teammate mentions, selection and Unicode anchors coexist with inline video nodes; mobile deliberate loading, retry and polling preservation.');
}
verifyMentionsAndMobileVideo().catch(e=>{console.error(e);process.exitCode=1;});
