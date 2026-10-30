// Optional component tests: npm install --prefix /tmp/frisbee-discussion-dom linkedom
// NODE_PATH=/tmp/frisbee-discussion-dom/node_modules node scripts/verify-discussion-dom.cjs
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {parseHTML}=require('linkedom');
const {document,window}=parseHTML('<html><body><div id="test-discussion"></div></body></html>');
window.HTMLElement.prototype.scrollIntoView=function(){};window.HTMLElement.prototype.focus=function(){};
Object.defineProperty(window.HTMLSelectElement.prototype,'value',{get(){return this.querySelector('option[selected]')?.getAttribute('value')||this.querySelector('option')?.getAttribute('value')||'';},set(value){for(const option of this.querySelectorAll('option')){if(option.getAttribute('value')===value)option.setAttribute('selected','');else option.removeAttribute('selected');}}});
const context={document,URLSearchParams,Intl,Date,console};vm.createContext(context);
vm.runInContext(fs.readFileSync('dist/bili-video.js','utf8')+'\n'+fs.readFileSync('dist/discussion.js','utf8')+'\nglobalThis.discussion=TeamDiscussion;',context);
const host=document.querySelector('#test-discussion'),$=s=>host.querySelector(s),clone=x=>JSON.parse(JSON.stringify(x));
let me={id:1},admin=true,loginCount=0,nextId=3;
const stamp=Date.now();
const video={id:'game-a',name:'训练赛',video:'https://www.bilibili.com/video/BV1B7411m7LV',videoMeta:{key:'BV1B7411m7LV',page:1}};
let data={id:'training-a',games:[video],comments:[{id:1,parentId:null,player:2,name:'另一名队员',number:2,text:'<img src=x onerror=alert(1)>切入时机',avatar:'api/stats/avatars/2/'+('a'.repeat(64)),created:stamp,at:stamp,deleted:false,video:{gameId:'game-a',key:'BV1B7411m7LV',seconds:85,page:1,available:true,name:'训练赛'}},{id:2,parentId:1,player:1,name:'我',number:1,text:'历史回复',avatar:'',created:stamp,at:stamp,deleted:false,video:null}]};
const calls=[],toasts=[];
let ui;
async function api(path,options){calls.push([path,options]);const body=options.body?JSON.parse(options.body):{};const id=Number(path.split('/').at(-1));
 if(options.method==='POST'){data.comments.push({id:nextId++,parentId:body.parentId,player:1,name:'我',number:1,text:body.text,created:stamp,at:stamp,deleted:false,video:body.video?{...body.video,available:true,name:'训练赛'}:null});}
 else if(options.method==='DELETE'){const c=data.comments.find(c=>c.id===id);c.deleted=true;c.saved=c.text;c.text='';}
 else if(body.restore){const c=data.comments.find(c=>c.id===id);c.deleted=false;c.text=c.saved;}
 else{const c=data.comments.find(c=>c.id===id);c.text=body.text;c.video=body.video;}
 return {comments:clone(data.comments)};
}
ui=context.discussion.init({getMe:()=>me,canEdit:()=>admin,login:()=>loginCount++,toast:t=>toasts.push(t),api,refresh:async()=>{data=clone(data);ui.render(host,'trainings',data,true);}});
(async()=>{
 ui.render(host,'trainings',data,true);
 assert.equal($('iframe').src.includes('player.bilibili.com'),true);
 const children=[...host.children];assert(children.indexOf($('[data-d="list"]'))<children.indexOf($('[data-d="form"]')),'composer belongs after the comments');
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
 assert.equal($('[data-message="1"] .discussion-message-main p').textContent,data.comments[0].text);
 assert.equal($('[data-message="1"] .discussion-message-main p img'),null,'comment HTML must remain text');
 const frame=$('iframe');$('[data-d="text"]').value='尚未发出的观察';ui.render(host,'trainings',clone(data),true);
 assert.equal($('iframe'),frame,'polling must not reset the player');assert.equal($('[data-d="text"]').value,'尚未发出的观察');
 await host.onclick({target:$('[data-action="reply"][data-comment="1"]')});
 assert.equal($('[data-d="reply-note"]').textContent,'回复 另一名队员 的评论');
 $('[data-d="text"]').value='补充：接盘前先观察。';$('[data-d="attach"]').onclick();
 $('[data-d="time"]').value='1:25';$('[data-d="page"]').value='1';await $('[data-d="form"]').onsubmit({preventDefault(){}});
 const posted=JSON.parse(calls.at(-1)[1].body);assert.equal(posted.parentId,1);assert.equal(posted.video.seconds,85);assert.equal(data.comments.length,3);assert.equal($('[data-d="text"]').value,'');assert.equal($('[data-d="text"]').style.height,'46px');assert($('[data-d="submit"] svg'));assert.equal($('[data-d="attach"]').getAttribute('aria-expanded'),'false');
 await host.onclick({target:$('[data-action="seek"][data-comment="1"]')});
 assert.equal(new URL($('iframe').src).searchParams.get('t'),'85');const firstSeek=$('iframe');
 await host.onclick({target:$('[data-action="seek"][data-comment="1"]')});assert.notEqual($('iframe'),firstSeek,'clicking the same time point must seek again');
 data.comments[0].video.seconds=0;ui.render(host,'trainings',data,true);await host.onclick({target:$('[data-action="seek"][data-comment="1"]')});assert.equal(new URL($('iframe').src).searchParams.get('t'),'0');assert.equal(new URL($('iframe').src).searchParams.get('autoplay'),'1');
 await host.onclick({target:$('[data-action="edit"][data-comment="2"]')});$('[data-d="text"]').value='修订后的补充';await $('[data-d="form"]').onsubmit({preventDefault(){}});
 assert.equal(data.comments.find(c=>c.id===2).text,'修订后的补充');
 await host.onclick({target:$('[data-action="delete"][data-comment="2"]')});await host.onclick({target:$('[data-action="delete"][data-comment="2"]')});assert(data.comments.find(c=>c.id===2).deleted);
 await host.onclick({target:$('[data-action="restore"][data-comment="2"]')});assert(!data.comments.find(c=>c.id===2).deleted);
 ui.stop(host);assert.equal($('iframe'),null,'closing a view stops embedded playback');
 me=null;ui.render(host,'trainings',data,true);assert($('[data-d="form"]').hidden);assert(!$('[data-action="login"]').hidden);
 await host.onclick({target:$('[data-action="reply"][data-comment="1"]')});assert.equal(loginCount,1);
 me={id:1};ui.render(host,'trainings',{id:'other-training',games:[],comments:[]},true);assert($('[data-d="attach"]').hidden,'no video means no timestamp button');$('[data-d="text"]').value='新训练的评论';const before=calls.length;await $('[data-d="form"]').onsubmit({preventDefault(){}});assert.equal(calls.length,before+1,'changing context must replace old event handlers');
 console.log('PASS: bottom composer, one-to-four-line sizing, icon controls, discussion DOM, XSS-safe text, avatars, reply/timestamp publish, editing, delete/restore, player persistence, repeated seeking, guest login and context isolation.');
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
 const errors=[];
 const cx={document:doc,window:win,URLSearchParams,Intl,Date,console,setInterval:()=>0,parseFloat,getComputedStyle:()=>({columnGap:'12px'}),MobileUI:{isPhone:()=>false},bindTap:(el,fn)=>el.onclick=fn};
 vm.createContext(cx);vm.runInContext(['bili-video.js','discussion.js','team-metrics.js','team-hub.js','stats.js'].map(name=>fs.readFileSync('dist/'+name,'utf8')).join('\n')+'\nglobalThis.stats=StatsUI;',cx);
 cx.stats.init({api:async()=>clone(state),toast:e=>errors.push(e),canEdit:()=>true,toggleEdit(){},openTeam(){},requestEdit:fn=>fn?.(),getDrills:()=>[]});
 await new Promise(setImmediate);
 assert.equal(doc.querySelector('#stats-meta').textContent.includes('测试'),false);
 assert.equal(doc.querySelector('#trainings-list [data-training-card]')?.textContent.includes('训练'),true,'stats must initialize against real HTML IDs');
 doc.querySelector('#trainings-list [data-training-card]').click();
 doc.querySelector('#training-tab-comments').click();
 assert.equal(doc.querySelector('#training-dialog').open,true);
 assert(doc.querySelector('#training-discussion [data-d="text"]'));
 assert(!doc.querySelector('#training-discussion [data-d="form"]').hidden);
 doc.querySelector('#training-tab-games').click();
 assert.equal(doc.querySelector('#training-discussion iframe'),null);
 doc.querySelector('#training-games [data-stats-game]').click();
 doc.querySelector('#stats-game-video-link').click();
 assert(doc.querySelector('#game-discussion iframe'));
 assert.equal(doc.querySelector('#game-discussion .discussion-video-editor').hidden,false);
 doc.querySelector('#stats-game-close').click();
 assert.equal(doc.querySelector('#game-discussion iframe'),null);
 doc.querySelector('#training-close').click();
 assert.equal(doc.querySelector('#training-discussion iframe'),null);
 assert.equal(errors.length,0,errors.join('\n'));
 console.log('PASS: actual StatsUI/TeamHub startup, training discussion navigation, logged-in composer and player cleanup against index.html.');
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
