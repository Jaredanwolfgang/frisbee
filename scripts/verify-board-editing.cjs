const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');
const root=path.resolve(__dirname,'..');
let now=0,serial=0,timers=new Map(),animations=new Map(),values=[],completed=[];
const ctx={performance:{now:()=>now},setTimeout:(fn,delay)=>{timers.set(++serial,{fn,at:now+delay});return serial;},clearTimeout:id=>timers.delete(id),requestAnimationFrame:fn=>{animations.set(++serial,fn);return serial;},cancelAnimationFrame:id=>animations.delete(id)};
vm.createContext(ctx);vm.runInContext(fs.readFileSync(path.join(root,'dist/hold-gesture.js'),'utf8'),ctx);
const hold=ctx.createHoldGesture({progress:(n,data)=>values.push([n,data]),complete:data=>completed.push(data)}),event=(id=1,x=10,y=10)=>({pointerId:id,clientX:x,clientY:y,button:0,isPrimary:true});
function advance(ms){now+=ms;const jobs=[...animations.values()];animations.clear();jobs.forEach(fn=>fn(now));for(const [id,job] of [...timers])if(job.at<=now){timers.delete(id);job.fn();}}
hold.start(event(),'run');advance(325);assert.equal(values.at(-1)[0],.5);assert.equal(completed.length,0);hold.end(event());advance(1000);assert.equal(completed.length,0);assert.equal(values.at(-1)[0],null);
hold.start(event(),'pass');advance(650);assert.deepEqual(completed,['pass']);hold.end(event());advance(1000);assert.equal(completed.length,1,'release must not delete twice');
hold.start(event(),'drag');hold.move(event(1,22,10));advance(700);assert.equal(completed.length,1);
hold.start(event(),'jitter');hold.move(event(1,12,12));hold.end(event(2));advance(650);assert.equal(completed.at(-1),'jitter','small movement is tolerated and another pointer cannot finish this hold');
for(const invalid of [{...event(),button:2},{...event(),isPrimary:false}]){hold.start(invalid,'invalid');advance(700);}assert(!completed.includes('invalid'));
hold.start(event(),'old');hold.start(event(),'replacement');advance(650);assert.equal(completed.at(-1),'replacement');assert(!completed.includes('old'));
hold.start(event(),'cancelled');hold.cancel();advance(700);assert(!completed.includes('cancelled'));assert.equal(animations.size,0);assert.equal(timers.size,0);
console.log('PASS: visible timed progress, early release, drag cancellation, pointer isolation, restart and timer cleanup.');

const rosterContext={};vm.createContext(rosterContext);vm.runInContext(fs.readFileSync(path.join(root,'dist/roster.js'),'utf8')+'\nglobalThis.roster=Roster;',rosterContext);const roster=rosterContext.roster;
const frame={name:'Keep this step',notes:'Keep coach notes',players:JSON.parse(JSON.stringify(roster.create(7,7))),disc:{x:672,y:280},routes:[{kind:'run',player:2,end:{x:700,y:300},points:[]}]};frame.disc={x:frame.players[3].x+22,y:frame.players[3].y};
const original=JSON.stringify(frame);
for(const key of ['vertical','horizontal','zone']){
 const f=roster.arrange(frame,key,'offense'),team=f.players.filter(p=>p.team==='offense');assert.equal(JSON.stringify(frame),original);assert.equal(f.routes.length,0);assert.equal(f.notes,frame.notes);assert.equal(f.name,frame.name);
 assert.deepEqual(JSON.parse(JSON.stringify(f.players.map(p=>[p.id,p.number,p.team]))),frame.players.map(p=>[p.id,p.number,p.team]));
 assert.deepEqual(JSON.parse(JSON.stringify(f.players.filter(p=>p.team==='defense'))),frame.players.filter(p=>p.team==='defense'));
 assert.deepEqual(JSON.parse(JSON.stringify(f.disc)),{x:team[3].x+22,y:team[3].y},'disc follows the same holder');
 for(let i=0;i<team.length;i++)for(let j=i+1;j<team.length;j++)assert(Math.hypot(team[i].x-team[j].x,team[i].y-team[j].y)>=44);
 if(key==='vertical'){assert.equal(new Set(team.slice(2).map(p=>p.y)).size,1);assert.equal(new Set(team.slice(2).map(p=>p.x)).size,5);}
 if(key==='horizontal'){assert.equal(new Set(team.slice(3).map(p=>p.x)).size,1);assert.equal(new Set(team.slice(3).map(p=>p.y)).size,4);}
 if(key==='zone'){assert(team.slice(0,3).every(p=>p.x<=400));assert(team[6].x>team[5].x);}
 const defense=roster.arrange(frame,key,'defense');assert.deepEqual(JSON.parse(JSON.stringify(defense.disc)),frame.disc);assert.deepEqual(JSON.parse(JSON.stringify(defense.players.filter(p=>p.team==='offense'))),frame.players.filter(p=>p.team==='offense'));
}
assert.throws(()=>roster.arrange({...frame,players:frame.players.slice(0,6)},'vertical','offense'));
assert.throws(()=>roster.arrange(frame,'unknown','offense'));
const onlyDefense={...frame,players:JSON.parse(JSON.stringify(roster.create(0,7,'drill')))};onlyDefense.disc={x:onlyDefense.players[0].x+22,y:onlyDefense.players[0].y};assert.equal(roster.arrange(onlyDefense,'zone','defense').players.length,7);
console.log('PASS: seven-player templates, actual stack axes, zone layers, stable roles/IDs, same holder, other-side preservation and invalid-count protection.');

// Exercise the actual app mutation callback, with UI and history boundaries stubbed.
const app=fs.readFileSync(path.join(root,'dist/app.js'),'utf8'),callback=app.slice(app.indexOf('function finishRouteHold('),app.indexOf('function startRouteHold('));
function deletionTest(kind,blocked={}){
 const gesture={},routes=[{id:'run1',kind:'run',player:1},{id:'run2',kind:'run',player:2},{id:'pass',kind:'pass',player:1}];let undo=null,renders=0;
 const c={drag:gesture,draft:{frames:[{routes:JSON.parse(JSON.stringify(routes))},{routes:JSON.parse(JSON.stringify(routes))}]},frameIndex:0,tool:kind,canModifyDraft:()=>true,saving:false,playing:false,document:{hidden:false},$:()=>({open:true}),current:()=>c.draft.frames[c.frameIndex],checkpoint:()=>undo=JSON.stringify(c.draft),renderBoard:()=>renders++,toast:()=>{},...blocked};
 vm.createContext(c);vm.runInContext(callback,c);c.finishRouteHold({gesture,frame:0,tool:kind,kind,player:2});return {c,undo,renders,routes};
}
let result=deletionTest('run');assert.deepEqual(result.c.draft.frames[0].routes.map(r=>r.id),['run1','pass']);assert.equal(result.c.draft.frames[1].routes.length,3);assert(result.undo.includes('run2'));assert.equal(result.renders,1);
result=deletionTest('pass');assert.deepEqual(result.c.draft.frames[0].routes.map(r=>r.id),['run1','run2']);
for(const blocked of [{frameIndex:1},{tool:'move'},{saving:true},{playing:true},{canModifyDraft:()=>false},{document:{hidden:true}},{$:()=>({open:false})}]){result=deletionTest('run',blocked);assert.equal(result.undo,null);assert.equal(result.renders,0);assert.equal(result.c.draft.frames[0].routes.length,3);}
console.log('PASS: deletion affects only the matching current-step routes, creates an undo snapshot and rejects stale, read-only, saving, hidden and playback contexts.');

const releaseCallback=app.slice(app.indexOf('function onUp('),app.indexOf('function onCancel('));
for(const duration of [100,750]){
 let added=0,checkpoints=0;
 const release={ROUTE_HOLD_MS:650,routeHold:{end(){}},performance:{now:()=>duration},drag:{id:2,pointer:1,moved:false,pendingFrom:1,pressedAt:0},position:()=>({x:500,y:200}),checkpoint:()=>checkpoints++,applyRoute:()=>added++,selectedPlayer:2,renderBoard(){},$:()=>({focus(){}})};
 vm.createContext(release);vm.runInContext(releaseCallback,release);release.onUp({pointerId:1});assert.equal(added,duration<650?1:0);assert.equal(checkpoints,added);assert.equal(release.drag,null);
 release.onUp({pointerId:1});assert.equal(added,duration<650?1:0,'a later release cannot recreate a deleted route');
}
console.log('PASS: tap-to-receive remains available; holding an empty target cannot redraw the previously selected player route.');
