const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), assert = require('node:assert/strict'), crypto = require('node:crypto');
const root=path.resolve(__dirname,'..'), app=fs.readFileSync(path.join(root,'dist/app.js'),'utf8');
const ctx={crypto:crypto.webcrypto}; vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(root,'dist/roster.js'),'utf8')+'\n'+fs.readFileSync(path.join(root,'dist/catalog.js'),'utf8')+'\n'+app.slice(0,app.indexOf('const MIGRATION_KEY='))+'\nglobalThis.result=JSON.stringify({samples,valid:samples.every(validTactic)});globalThis.roster=Roster;',ctx);
const {samples,valid}=JSON.parse(ctx.result);assert(valid);assert.equal(samples.length,13);assert.equal(samples.filter(t=>t.category==='防守战术').length,7);
const v=samples.find(t=>t.id==='basic-vertical').frames[0].players.filter(p=>p.team==='offense'&&p.id>=3);
assert.equal(new Set(v.map(p=>p.y)).size,1);assert.equal(new Set(v.map(p=>p.x)).size,5);
const h=samples.find(t=>t.id==='basic-horizontal').frames[0].players.filter(p=>p.team==='offense'&&p.id>=4);
assert.equal(new Set(h.map(p=>p.x)).size,1);assert.equal(new Set(h.map(p=>p.y)).size,4);
for(const t of samples.filter(t=>t.catalogRevision===3)){
 assert.equal(t.frames[0].players.length,14);assert.equal(t.frames[0].routes.length,0);
 for(let i=1;i<t.frames.length;i++){
  const prev=t.frames[i-1],f=t.frames[i];
  for(const p of f.players){const old=prev.players.find(q=>q.id===p.id),move=prev.routes.find(r=>r.kind==='run'&&r.player===p.id);assert.deepEqual([p.x,p.y],move?[move.end.x,move.end.y]:[old.x,old.y]);}
  for(const pass of f.routes.filter(r=>r.kind==='pass')){assert(f.players.some(p=>p.team==='offense'&&p.id!==pass.player&&((f.routes.find(r=>r.kind==='run'&&r.player===p.id)?.end.x??p.x)===pass.end.x)&&((f.routes.find(r=>r.kind==='run'&&r.player===p.id)?.end.y??p.y)===pass.end.y)),t.id+' receiving point');}
 }
 if(t.category==='防守战术')assert(t.frames.some(f=>f.routes.some(r=>r.kind==='run'&&r.player>7)));
}
console.log('PASS: 13 tactics; correct stack geometry, 7 defensive sequences and consistent receiving points.');
const roster=ctx.roster;
for(let n=1;n<=7;n++)assert.equal(roster.create(n,0,'drill').length,n);
assert.throws(()=>roster.create(4,4,'drill'));
assert.equal(roster.create(7,7,'tactic').length,14);
const drill=JSON.parse(JSON.stringify(samples[0]));drill.kind='drill';drill.category='基础训练';
const small=roster.resize(drill,3,2);
assert(small.frames.every(f=>f.players.length===5));
assert(small.frames.every(f=>f.routes.every(r=>f.players.some(p=>p.id===r.player))));
assert.equal(small.frames[0].players[0].x,drill.frames[0].players[0].x);
const larger=roster.resize(small,4,2),added=larger.frames[0].players.find(p=>!small.frames[0].players.some(old=>old.id===p.id));
assert(!small.frames[0].players.some(p=>p.id===added.id));assert.equal(roster.label(added),'O4');assert(larger.frames.every(f=>f.players.some(p=>p.id===added.id)));
assert.throws(()=>roster.resize(larger,5,3));
const removed=roster.remove(larger,1);
assert(removed.frames.every(f=>!f.players.some(p=>p.id===1)&&!f.routes.some(r=>r.player===1)));
assert.notEqual(removed.frames[0].disc.x,larger.frames[0].disc.x);
assert.throws(()=>roster.remove({frames:[{players:roster.create(1,0,'drill'),disc:{x:372,y:280},routes:[]}]},1));
console.log('PASS: variable Drill rosters, seven-player cap, stable numbering, cross-step resizing and route cleanup.');

const restored=roster.resize(roster.remove(samples[0],4),7,7);assert(restored.frames[0].players.some(p=>p.id>14));

ctx.markerSample=JSON.parse(JSON.stringify(samples[0]));ctx.markerSample.markers=[{id:'corner-1',x:150,y:140,label:'起点'}];
assert(vm.runInContext('validTactic(markerSample)',ctx));
const markerTactic=JSON.parse(JSON.stringify(ctx.markerSample));assert.equal(JSON.stringify(roster.resize(markerTactic,3,2).markers),JSON.stringify(markerTactic.markers));
assert.equal(JSON.stringify(roster.remove(markerTactic,1).markers),JSON.stringify(markerTactic.markers));
ctx.markerSample.markers.push({...ctx.markerSample.markers[0]});assert(!vm.runInContext('validTactic(markerSample)',ctx));
ctx.markerSample.markers=[{id:'corner-1',x:0,y:140,label:'起点'}];assert(!vm.runInContext('validTactic(markerSample)',ctx));
console.log('PASS: marker validation, unique IDs, field bounds and preservation during roster edits.');
ctx.loopSample=JSON.parse(JSON.stringify(samples.find(t=>t.id==='drill-pendulum')));
assert(vm.runInContext('validTactic(loopSample)',ctx));
ctx.loopSample.loop='true';assert(!vm.runInContext('validTactic(loopSample)',ctx));
ctx.loopSample.loop=true;ctx.loopSample.kind='tactic';assert(!vm.runInContext('validTactic(loopSample)',ctx));
console.log('PASS: looping Drill example and loop field validation.');
