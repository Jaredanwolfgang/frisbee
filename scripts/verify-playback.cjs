const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');
const root=path.resolve(__dirname,'..'),ctx={};vm.createContext(ctx);vm.runInContext(fs.readFileSync(path.join(root,'dist/playback.js'),'utf8')+'\nglobalThis.playback=Playback;',ctx);
const playback=ctx.playback,seeds=JSON.parse(fs.readFileSync(path.join(root,'server/seed.json'),'utf8')),drill=seeds.find(t=>t.id==='drill-pendulum');
assert(drill.loop);assert.equal(drill.frames.length,4);assert(drill.frames.every(f=>f.players.length===2));assert.equal(drill.markers.length,3);assert(playback.continuous(drill));
let index=0,seen=[],holder=1;
for(let i=0;i<12;i++){
 const frame=drill.frames[index];seen.push(index);
 const hold=frame.players.find(p=>p.id===holder);assert.deepEqual(frame.disc,{x:hold.x+22,y:hold.y});
 assert(!frame.routes.some(r=>r.kind==='run'&&r.player===holder),'holder must remain stationary');
 for(const pass of frame.routes.filter(r=>r.kind==='pass')){
  assert.equal(pass.player,holder);const receiver=frame.players.find(p=>p.id!==holder),run=frame.routes.find(r=>r.kind==='run'&&r.player===receiver.id);
  assert.deepEqual(pass.end,run?.end||{x:receiver.x,y:receiver.y});holder=receiver.id;
 }
 const next=playback.nextIndex(drill,index,true),end=playback.endState(frame);
 assert.deepEqual(JSON.parse(JSON.stringify(end.players)),drill.frames[next].players);const nextDisc=drill.frames[next].disc,receiver=end.players.find(p=>p.id===holder);assert(Math.hypot(end.disc.x-nextDisc.x,end.disc.y-nextDisc.y)<=22);assert.deepEqual(nextDisc,{x:receiver.x+22,y:receiver.y});index=next;
}
assert.deepEqual(seen,[0,1,2,3,0,1,2,3,0,1,2,3]);assert.equal(playback.nextIndex(drill,3,false),null);assert.equal(playback.nextIndex({...drill,kind:'tactic'},3,true),null);
const broken=JSON.parse(JSON.stringify(drill));broken.frames[0].players[0].x+=50;assert(!playback.continuous(broken));
// Legacy records without an explicit kind still receive the right playback behavior.
const legacy={...drill};delete legacy.kind;assert.equal(playback.nextIndex(legacy,3,true),0);
console.log('PASS: three continuous pendulum rounds, correct holders and receiving points; single-play stop, tactic isolation and reset detection.');

vm.runInContext('globalThis.geometry=RouteGeometry;',ctx);
const geometry=ctx.geometry,plain={points:[],end:{x:800,y:280}},curved={...plain,bend:{x:500,y:100}},start={x:200,y:280};
const point=(p,x,y)=>{assert(Math.abs(p.x-x)<1e-8);assert(Math.abs(p.y-y)<1e-8);};
point(geometry.at(start,curved,0),200,280);point(geometry.at(start,curved,.5),500,100);point(geometry.at(start,curved,1),800,280);
assert.equal(geometry.path(start,curved),'M200 280 Q500 -80 800 280');
assert.equal(geometry.path(start,plain),'M200 280 L800 280');point(geometry.at(start,plain,.5),500,280);
const legacyRoute={points:[{x:200,y:100}],end:{x:800,y:100}};
assert.equal(geometry.path(start,legacyRoute),'M200 280 L200 100 L800 100');point(geometry.at(start,legacyRoute,180/780),200,100);
point(geometry.at(start,{points:[],end:start},.5),200,280);
console.log('PASS: curved SVG and playback share exact start, bend and end; existing straight and waypoint routes unchanged.');
