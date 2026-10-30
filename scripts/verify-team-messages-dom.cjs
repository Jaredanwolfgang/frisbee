const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),{parseHTML}=require('linkedom');
const {document,window}=parseHTML(fs.readFileSync('dist/index.html','utf8'));window.HTMLElement.prototype.focus=function(){};window.HTMLElement.prototype.showModal=function(){this.open=true;};window.HTMLElement.prototype.close=function(){this.open=false;};
const cx={document};vm.createContext(cx);vm.runInContext(fs.readFileSync('dist/lite-markdown.js','utf8')+'\n'+fs.readFileSync('dist/markdown-editor.js','utf8')+'\n'+fs.readFileSync('dist/team-messages.js','utf8')+'\nglobalThis.messages=TeamMessages;',cx);
let me={id:1},summary={unread:1,trainings:{'training-a':1}},nextResolve,opened=null,reads=0;const $=s=>document.querySelector(s),tick=()=>new Promise(setImmediate);
const ui=cx.messages.init({getMe:()=>me,getSummary:()=>summary,onSummary:s=>{summary=s;ui.update();},toast(){},openMessage:async m=>opened=m,api:async(path,options)=>{if(options){reads++;return{summary:{unread:0,trainings:{}}};}return new Promise(resolve=>nextResolve=resolve);}});
const msg={type:'reply',id:1,trainingId:'training-a',trainingName:'训练',heldOn:'2026-10-30',name:'<队友>',text:'@我 一起复盘',unread:true};
(async()=>{
 ui.update();assert(!$('#team-notifications').hidden);assert(!$('.notification-dot').hidden);$('#team-notifications').onclick();nextResolve({messages:[msg,{...msg,id:2,type:'mention'}],nextOffset:null,summary});await tick();assert.equal($('[data-messages-list] img'),null);assert($('[data-messages-list]').textContent.includes('<队友>'));assert($('[data-messages-list]').textContent.includes('回复了你'));assert($('[data-messages-list]').textContent.includes('@ 了你'));
 await $('[data-messages-list]').onclick({target:$('[data-message-open]')});assert.equal(opened.trainingId,'training-a');assert.equal(reads,1);assert($('.notification-dot').hidden);assert.equal($('[data-messages-list] .has-alert'),null);assert($('#team-notifications-dialog').open,'message inbox remains underneath child navigation');
 $('#team-notifications').onclick();me={id:2};ui.update();assert(!$('#team-notifications-dialog').open);nextResolve({messages:[msg],nextOffset:null,summary:{unread:1,trainings:{'training-a':1}}});await tick();assert.equal($('[data-messages-list]').textContent,'','late response cannot expose previous member inbox');
 me=null;ui.update();assert($('#team-notifications').hidden);
 console.log('PASS: private inbox rendering, read red dots, parent navigation and identity-change response isolation.');
})().catch(e=>{console.error(e);process.exitCode=1;});
