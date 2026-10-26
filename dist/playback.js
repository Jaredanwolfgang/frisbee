'use strict';
// Playback order is independent of editing permissions and saved route coordinates.
const Playback={
 nextIndex(tactic,index,loop){return index<tactic.frames.length-1?index+1:loop&&(tactic.kind==='drill'||(!tactic.kind&&tactic.category==='基础训练'))?0:null;},
 endState(frame){const out=JSON.parse(JSON.stringify(frame));for(const r of frame.routes){if(r.kind==='run'){const p=out.players.find(p=>p.id===r.player);if(p)Object.assign(p,r.end);}else out.disc={...r.end};}return out;},
 continuous(tactic){
  const near=(a,b,tolerance=1)=>Math.hypot(a.x-b.x,a.y-b.y)<=tolerance;
  const holder=f=>f.players.find(p=>near(p,f.disc,35))?.id;
  return tactic.frames.every((frame,i)=>{const end=this.endState(frame),next=tactic.frames[(i+1)%tactic.frames.length];return end.players.length===next.players.length&&end.players.every(p=>{const q=next.players.find(q=>q.id===p.id&&q.team===p.team);return q&&near(p,q);})&&(near(end.disc,next.disc)||holder(end)!==undefined&&holder(end)===holder(next));});
 }
};
