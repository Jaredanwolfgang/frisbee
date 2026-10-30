'use strict';
// Shared, deterministic calculations: formal games and practice never mix.
const TeamMetrics=(()=>{
 const zero=()=>({goals:0,assists:0,passes:0,turnovers:0,steals:0,points:0,oPoints:0,dPoints:0});
 const gamesByDate=games=>games.slice().sort((a,b)=>(b.heldOn||'').localeCompare(a.heldOn||'')||(b.created||0)-(a.created||0));
 const pointStart=(e,id)=>e.sides?((e.sides[e.sides.offense]||[]).includes(id)?'offense':'defense'):e.start;
 const sideOf=(point,id)=>point?.sides?.a.includes(id)?'a':point?.sides?.b.includes(id)?'b':null;
 const score=g=>(g.events||[]).reduce((out,e)=>{if(e.kind==='goal'){if(e.side==='a'||e.side==='b')out[e.side]++;else out.unassigned++;}return out;},{a:0,b:0,unassigned:0});
 const participates=(g,id)=>(g.events||[]).some(e=>e.from===id||e.to===id||(e.line||[]).includes(id));
 function tally(games,id){const t=zero();for(const g of games)for(const e of g.events||[]){if(e.kind==='pass'&&e.from===id)t.passes++;if(e.kind==='goal'){if(e.from===id){t.passes++;t.assists++;}if(e.to===id)t.goals++;}if(e.kind==='turnover'&&(e.to??e.from)===id)t.turnovers++;if(e.kind==='defense'&&e.from===id)t.steals++;if(e.kind==='point'&&(e.line||[]).includes(id)){t.points++;t[pointStart(e,id)==='defense'?'dPoints':'oPoints']++;}}return t;}
 function eligible(t,p,today){return t.status==='completed'&&!!t.heldOn&&t.heldOn<=today&&(!p?.joinedOn||t.heldOn>=p.joinedOn||t.attendees.includes(p.id));}
 function attendance(trainings,p,today){const list=trainings.filter(t=>eligible(t,p,today)),present=list.filter(t=>t.attendees.includes(p.id));return{total:list.length,present:present.length,rate:list.length?Math.round(present.length/list.length*100):null,list:list.slice().sort((a,b)=>b.heldOn.localeCompare(a.heldOn))};}
 function personal(data,p,today,practice=false){const source=practice?data.trainings.flatMap(t=>t.games):data.games;const games=gamesByDate(source.filter(g=>participates(g,p.id))),finished=games.filter(g=>g.status==='finished');return{games,finished,totals:tally(finished,p.id),attendance:attendance(data.trainings,p,today)};}
 return{gamesByDate,pointStart,sideOf,score,participates,tally,eligible,attendance,personal};
})();
if(typeof module!=='undefined')module.exports=TeamMetrics;
