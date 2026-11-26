const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
let url=new URL('https://example.test/frisbee/#tactic=test'),entries=[{state:null,url:url.href}],index=0,phone=true,events={},tasks=[],moves=[];
const history={
 get state(){return entries[index].state;},
 pushState(state,_,next){url=new URL(next,url);entries.splice(index+1);entries.push({state,url:url.href});index++;},
 replaceState(state,_,next){url=new URL(next,url);entries[index]={state,url:url.href};},
 go(delta){moves.push(delta);tasks.push(()=>{index=Math.max(0,Math.min(entries.length-1,index+delta));url=new URL(entries[index].url);events.popstate?.();});}
};
const context={window:{history,matchMedia:()=>({get matches(){return phone;},addEventListener(){}}),addEventListener:(name,fn)=>events[name]=fn},location:{get href(){return url.href;},get pathname(){return url.pathname;},get search(){return url.search;}},document:{body:{classList:{toggle(){}}},querySelectorAll:()=>[],querySelector:()=>null},MutationObserver:class{observe(){}},queueMicrotask:fn=>tasks.push(fn),Date,Event};
vm.createContext(context);vm.runInContext(fs.readFileSync(path.resolve(__dirname,'../dist/tap.js'),'utf8')+'\n'+fs.readFileSync(path.resolve(__dirname,'../dist/mobile-ui.js'),'utf8')+'\nglobalThis.ui=MobileUI;',context);const ui=context.ui;
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

// Simulate the iOS wrapper reported by the user: the instance-level methods
// lose the native History receiver, while prototype methods still require it.
{
 const calls=[],actual={state:{keep:true}};
 const prototype={};
 for(const name of ['replaceState','pushState','go']){
  prototype[name]=function(...args){assert.equal(this,actual,'native History method must keep its receiver');calls.push([name,...args]);};
  actual[name]=()=>{throw new TypeError('Can only call History.'+name+' on instances of History');};
 }
 const ctx={window:{history:actual,History:{prototype}},performance:{now:()=>0},Math};
 vm.createContext(ctx);
 vm.runInContext(fs.readFileSync(path.resolve(__dirname,'../dist/tap.js'),'utf8'),ctx);
 ctx.browserHistory('replaceState',actual.state,'','#team');
 ctx.browserHistory('pushState',actual.state,'','#rules');
 ctx.browserHistory('go',-1);
 assert.deepEqual(calls.map(c=>c[0]),['replaceState','pushState','go']);
 assert.equal(calls[0][3],'#team');
}
console.log('PASS: workspace navigation and mobile Back keep the native History receiver when an iOS instance wrapper is broken.');
