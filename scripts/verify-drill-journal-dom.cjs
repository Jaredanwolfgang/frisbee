// NODE_PATH=/tmp/frisbee-discussion-dom/node_modules node scripts/verify-drill-journal-dom.cjs
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),{parseHTML}=require('linkedom');
const {document:doc,window:win}=parseHTML('<html><body><div id="training"></div><div id="history"></div></body></html>');win.HTMLElement.prototype.scrollIntoView=function(){};
const cx={document:doc};vm.createContext(cx);vm.runInContext(fs.readFileSync('dist/lite-markdown.js','utf8')+'\n'+fs.readFileSync('dist/markdown-editor.js','utf8')+'\n'+fs.readFileSync('dist/drill-journal.js','utf8')+'\nglobalThis.journal=DrillJournal;',cx);
const host=doc.querySelector('#training'),history=doc.querySelector('#history'),$=s=>host.querySelector(s),tick=()=>new Promise(setImmediate);
let me={id:1},notes=[],posts=0,logins=0,revision=1;
const training={id:'training-one',drills:[{id:'drill-one',name:'长名称 Drill：回传、切入与后续衔接',noteCount:0,noteVersion:0}]};let journal;
journal=cx.journal.init({getMe:()=>me,login:()=>logins++,toast(){},refresh:async()=>journal.renderTraining(host,training,true,revision),api:async(path,options)=>{if(options){posts++;const body=JSON.parse(options.body);notes=[{id:1,player:1,name:'<队员>',number:1,trainingName:'周五训练',heldOn:'2026-10-30',avatar:'',...body}];training.drills[0].noteCount=1;training.drills[0].noteVersion=++revision;}return{notes,total:notes.length,trainingCount:notes.length?1:0,nextOffset:null};}});
(async()=>{
 journal.renderTraining(host,training,true,revision);$('[data-j="toggle"]').onclick();await tick();$('[data-j="write"]').onclick();
 $('[data-j="problems"]').value='<img src=x onerror=alert(1)>切入时机';$('[data-j="problems"]').oninput();$('[data-j="progress"]').value='回传更稳定';$('[data-j="progress"]').oninput();
 await $('[data-j="form"]').onsubmit({preventDefault(){}});assert.equal(posts,1);assert.equal($('[data-j="notes"] img'),null,'text is escaped');assert($('[data-j="notes"]').textContent.includes('<img'));
 assert.equal($('[data-j="save"]').textContent,'更新我的记录');assert($('[data-j="form"]').hidden,'saved record replaces the form');$('[data-j="write"]').onclick();assert.equal($('[data-j="progress"]').value,'回传更稳定');
 $('[data-j="problems"]').value='尚未保存的下一次修改';$('[data-j="problems"]').oninput();journal.renderTraining(host,training,true,++revision);await tick();assert.equal($('[data-j="problems"]').value,'尚未保存的下一次修改','polling does not reset a dirty form');
 await $('[data-j="form"]').onsubmit({preventDefault(){}});assert.equal(notes.length,1);assert.equal(posts,2);
 journal.renderHistory(history,'drill-one',true);await tick();assert(history.textContent.includes('2026-10-30'));assert(history.textContent.includes('尚未保存的下一次修改'));assert(history.textContent.includes('回传更稳定'));assert.equal(history.querySelector('details'),null,'history is a full page, not a collapsed sidebar');assert(history.querySelector('.drill-history-observations'));assert.equal(history.querySelectorAll('.drill-history-session').length,1);
 journal.renderHistory(history,null);assert(history.hidden);assert.equal(history.children.length,0);
 me=null;journal.renderTraining(host,training,false,revision);assert($('[data-j="form"]').hidden);assert(!$('[data-j="login"]').hidden);$('[data-j="login"]').click();assert.equal(logins,1);assert($('[data-drill-remove]').hidden);
 console.log('PASS: member Drill observations, own-record updating, escaped text, polling draft preservation, dated preview history and guest/admin separation.');
})().catch(e=>{console.error(e);process.exitCode=1;});
