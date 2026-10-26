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

// A bend is a point on the curve halfway through its parameter, not a waypoint.
// Existing waypoint routes keep their original straight segments.
const RouteGeometry={
 control(start,route){return {x:2*route.bend.x-(start.x+route.end.x)/2,y:2*route.bend.y-(start.y+route.end.y)/2};},
 middle(start,route){return route.bend||{x:(start.x+route.end.x)/2,y:(start.y+route.end.y)/2};},
 path(start,route){if(route.bend){const c=this.control(start,route);return `M${start.x} ${start.y} Q${c.x} ${c.y} ${route.end.x} ${route.end.y}`;}return `M${start.x} ${start.y}`+[...route.points,route.end].map(p=>` L${p.x} ${p.y}`).join('');},
 at(start,route,t){t=Math.max(0,Math.min(1,t));if(route.bend){const c=this.control(start,route),u=1-t;return {x:u*u*start.x+2*u*t*c.x+t*t*route.end.x,y:u*u*start.y+2*u*t*c.y+t*t*route.end.y};}return this.polyAt([start,...route.points,route.end],t);},
 polyAt(poly,t){const seg=poly.slice(1).map((p,i)=>Math.hypot(p.x-poly[i].x,p.y-poly[i].y)),total=seg.reduce((a,b)=>a+b,0);let dist=t*total;for(let i=0;i<seg.length;i++){if(dist<=seg[i]||i===seg.length-1){const q=seg[i]?Math.min(1,dist/seg[i]):1;return {x:poly[i].x+(poly[i+1].x-poly[i].x)*q,y:poly[i].y+(poly[i+1].y-poly[i].y)*q};}dist-=seg[i];}return poly[0];}
};
