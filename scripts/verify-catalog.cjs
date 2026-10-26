const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), assert = require('node:assert/strict'), crypto = require('node:crypto');
const root=path.resolve(__dirname,'..'), app=fs.readFileSync(path.join(root,'dist/app.js'),'utf8');
const ctx={crypto:crypto.webcrypto}; vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(root,'dist/catalog.js'),'utf8')+'\n'+app.slice(0,app.indexOf('const PREFS_KEY='))+'\nglobalThis.result=JSON.stringify({samples,valid:samples.every(validTactic)});',ctx);
const {samples,valid}=JSON.parse(ctx.result);assert(valid);assert.equal(samples.length,12);assert.equal(samples.filter(t=>t.category==='防守战术').length,7);
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
console.log('PASS: 12 tactics; correct stack geometry, 7 defensive sequences and consistent receiving points.');
