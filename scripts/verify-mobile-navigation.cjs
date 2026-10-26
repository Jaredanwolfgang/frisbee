const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
let url=new URL('https://example.test/frisbee/#tactic=test'),entries=[{state:null,url:url.href}],index=0,phone=true,events={},tasks=[],moves=[];
const history={
 get state(){return entries[index].state;},
 pushState(state,_,next){url=new URL(next,url);entries.splice(index+1);entries.push({state,url:url.href});index++;},
 replaceState(state,_,next){url=new URL(next,url);entries[index]={state,url:url.href};},
 go(delta){moves.push(delta);tasks.push(()=>{index=Math.max(0,Math.min(entries.length-1,index+delta));url=new URL(entries[index].url);events.popstate?.();});}
};
const context={window:{history,matchMedia:()=>({get matches(){return phone;},addEventListener(){}}),addEventListener:(name,fn)=>events[name]=fn},location:{get href(){return url.href;},get pathname(){return url.pathname;},get search(){return url.search;}},document:{body:{classList:{toggle(){}}},querySelectorAll:()=>[],querySelector:()=>null},MutationObserver:class{observe(){}},queueMicrotask:fn=>tasks.push(fn),Date,Event};
vm.createContext(context);vm.runInContext(fs.readFileSync(path.resolve(__dirname,'../dist/mobile-ui.js'),'utf8')+'\nglobalThis.ui=MobileUI;',context);const ui=context.ui;
function flush(){let n=0;while(tasks.length){assert(++n<30,'navigation must settle without loops');tasks.shift()();}}
let mode='edit',closed=false;
ui.enter('dialog:editor',()=>{if(mode==='edit'){mode='view';return false;}closed=true;return true;});
assert.equal(new URL(entries[0].url).hash,'','closing a shared-link editor must return to the library, not reopen itself');
history.go(-1);flush();assert.equal(mode,'view');assert(!closed);assert.equal(url.hash,'#tactic=test');
let readerClosed=false;ui.enter('dialog:reader',()=>{readerClosed=true;return true;});history.go(-1);flush();assert(readerClosed);assert(!closed);
history.go(-1);flush();assert(closed);assert.equal(url.hash,'');
ui.enter('dialog:create',()=>true);ui.leave('dialog:create');ui.enter('dialog:editor',()=>true);flush();assert(history.state.frisbeePage,'create-to-editor transitions retain a Back destination');
ui.enter('dialog:discard',()=>true);moves=[];ui.leave('dialog:discard');ui.leave('dialog:editor');flush();assert.deepEqual(moves,[-2],'closing a confirmation and its parent uses one history move');
const length=entries.length;phone=false;ui.enter('desktop-dialog',()=>true);assert.equal(entries.length,length,'desktop dialogs do not add phone navigation');
console.log('PASS: shared-link return, edit-to-view Back, child reader Back, creation transitions, batched close and desktop isolation.');
