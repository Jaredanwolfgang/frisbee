// NODE_PATH=/tmp/frisbee-discussion-dom/node_modules node scripts/verify-flat-replies-dom.cjs
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),{parseHTML}=require('linkedom');
const {document,window}=parseHTML('<html><body><div id="thread"></div></body></html>');
window.HTMLElement.prototype.scrollIntoView=function(){};window.HTMLElement.prototype.focus=function(){};
Object.defineProperty(window.HTMLSelectElement.prototype,'value',{get(){return this.getAttribute('data-value')||'';},set(value){this.setAttribute('data-value',value);}});
Object.defineProperty(window.HTMLElement.prototype,'open',{get(){return this.hasAttribute('open');},set(value){this.toggleAttribute('open',!!value);}});
const cx={document,window,URLSearchParams,Intl,Date,setTimeout:()=>0,clearTimeout(){}};vm.createContext(cx);
vm.runInContext(['bili-video.js','discussion-text.js','discussion.js'].map(name=>fs.readFileSync('dist/'+name,'utf8')).join('\n')+'\nglobalThis.discussion=TeamDiscussion;',cx);
const host=document.querySelector('#thread'),$=s=>host.querySelector(s),stamp=Date.now();
const comment=(id,parentId,player,name,text,replyTo=null)=>({id,parentId,player,name,number:player,text,created:stamp,at:stamp,deleted:false,video:null,replyTo});
async function check(kind){
 const root=comment(1,null,2,'根评论队友','主观点'),child=comment(2,1,3,'回复队友','补充观点',{id:1,player:2,name:'根评论队友'});
 const entry={id:'thread-'+kind,comments:[root,child],games:[]};let sent,ui;
 ui=cx.discussion.init({getMe:()=>({id:1}),toast(){},login(){},api:async(path,options)=>{sent=JSON.parse(options.body);const target=entry.comments.find(c=>c.id===sent.parentId);entry.comments.push(comment(3,target.parentId||target.id,1,'我',sent.text,{id:target.id,player:target.player,name:target.name}));return{comments:entry.comments};},refresh:async()=>ui.render(host,kind,entry,true)});
 ui.render(host,kind,entry,true);
 assert.equal($('.discussion-reply-group'),null,'one reply stays expanded');
 assert($('[data-message="2"] [data-action="reply"]'),'a reply itself can be replied to');
 await host.onclick({target:$('[data-message="2"] [data-action="reply"]')});
 assert.equal($('[data-d="reply-note"]').textContent,'回复 回复队友 的评论');
 $('[data-d="text"]').value='回复你的补充';await $('[data-d="form"]').onsubmit({preventDefault(){}});
 assert.equal(sent.parentId,2,'submit the actual recipient, not the root author');
 assert.equal(entry.comments[2].parentId,1);
 assert.equal($('.discussion-reply-group').open,false,'two replies start collapsed');
 assert($('.discussion-reply-group summary').textContent.includes('展开 2 条回复'));
 assert.equal($('[data-message="3"] .discussion-reply-target').textContent,'回复 回复队友：');
 assert.equal($('.discussion-replies .discussion-replies'),null,'never add another indentation level');
 assert.equal($('.discussion-reply-group .discussion-reply-group'),null);
 ui.reveal(host,3);assert($('.discussion-reply-group').open,'opening a notification reveals its collapsed reply');
 ui.render(host,kind,entry,true);assert($('.discussion-reply-group').open,'polling preserves the expanded state');
 $('.discussion-reply-group').open=false;ui.render(host,kind,entry,true);assert(!$('.discussion-reply-group').open,'polling preserves the collapsed state');
 entry.comments[2].replyTo.name='<img src=x onerror=alert(1)>';ui.render(host,kind,entry,true);
 assert.equal($('[data-message="3"] .discussion-reply-target img'),null,'recipient names are escaped');
 entry.comments.pop();ui.render(host,kind,entry,true);assert.equal($('.discussion-reply-group'),null,'returning to one reply removes the collapsed group');
 ui.stop(host);
}
(async()=>{await check('trainings');await check('games');console.log('PASS: reply-to-reply recipient targeting, flat rendering, two-reply folding, polling state, inbox reveal and escaped names in training and match discussions.');})().catch(error=>{console.error(error);process.exitCode=1;});
