'use strict';
const Roster = (() => {
  const max = 14;
  const copy = value => JSON.parse(JSON.stringify(value));
  const number = p => p.number ?? (p.team === 'defense' && p.id > 7 ? p.id - 7 : p.id);
  const label = p => (p.team === 'defense' ? 'D' : 'O') + number(p);
  const kind = t => t.kind || (t.category === '基础训练' ? 'drill' : 'tactic');
  function counts(offense, defense, limit = max) {
    if (offense > 7 || defense > 7) throw new Error('每方最多 7 人。');
    if (!Number.isInteger(offense) || !Number.isInteger(defense) || offense < 0 || defense < 0 || offense + defense < 1 || offense + defense > limit) {
      throw new Error('总人数需为 1–'+limit+' 人。');
    }
  }
  function grid(n) {
    if (n === 1) return [{x: 350, y: 280}];
    if (n === 2) return [{x: 300, y: 280}, {x: 650, y: 280}];
    if (n === 3) return [{x: 300, y: 280}, {x: 650, y: 150}, {x: 650, y: 410}];
    const cols = Math.ceil(Math.sqrt(n * 1.6)), rows = Math.ceil(n / cols);
    return Array.from({length: n}, (_, i) => ({x: Math.round(190 + (i % cols + .5) * 620 / cols), y: Math.round(65 + (Math.floor(i / cols) + .5) * 430 / rows)}));
  }
  function create(offense, defense, type = 'tactic') {
    counts(offense, defense, type === 'drill' ? 7 : max);
    return grid(offense + defense).map((p, i) => ({id: i + 1, number: i < offense ? i + 1 : i - offense + 1, team: i < offense ? 'offense' : 'defense', ...p}));
  }
  function cleanup(frame, removed) {
    const holder = frame.players.reduce((a,b) => Math.hypot(a.x-frame.disc.x,a.y-frame.disc.y) <= Math.hypot(b.x-frame.disc.x,b.y-frame.disc.y) ? a : b);
    frame.players = frame.players.filter(p => !removed.has(p.id));
    frame.routes = frame.routes.filter(r => !removed.has(r.player));
    if (removed.has(holder.id)) {
      const p = frame.players.find(p => p.team === 'offense') || frame.players[0];
      if (p) frame.disc = {x: Math.min(975,p.x + 22), y: p.y};
    }
  }
  function resize(tactic, offense, defense) {
    counts(offense, defense, kind(tactic) === 'drill' ? 7 : max);
    const t = copy(tactic), all = [...new Map(t.frames.flatMap(f => f.players).map(p => [p.id,p])).values()];
    const keep = all.filter(p => p.team === 'offense').slice(0,offense).concat(all.filter(p => p.team === 'defense').slice(0,defense));
    const keepIds = new Set(keep.map(p => p.id)), removed = new Set(all.filter(p => !keepIds.has(p.id)).map(p => p.id));
    let id = Math.max(0,...all.map(p => p.id));
    for (const [team,total] of [['offense',offense],['defense',defense]]) {
      const usedNumbers = new Set(keep.filter(p => p.team === team).map(number));
      while (keep.filter(p => p.team === team).length < total) {
        let next = 1; while (usedNumbers.has(next)) next++;
        usedNumbers.add(next);
        const available = grid(max).find(q => keep.every(p => Math.hypot(p.x-q.x,p.y-q.y)>42)) || grid(max)[keep.length];
        keep.push({id: ++id, number: next, team, ...available});
      }
    }
    for (const f of t.frames) {
      // Missing roster members are added before removal, including when a whole side is replaced.
      const existing = new Set(f.players.map(p => p.id));
      f.players.push(...keep.filter(p => !existing.has(p.id)).map(copy));
      cleanup(f, removed);
    }
    if (t.roles) for (const id of removed) delete t.roles[id];
    delete t.formation;
    return t;
  }
  function remove(tactic, id) {
    if (tactic.frames.some(f => f.players.length === 1 && f.players[0].id === id)) throw new Error('至少保留一名队员。');
    const t = copy(tactic);
    for (const f of t.frames) cleanup(f,new Set([id]));
    if (t.roles) delete t.roles[id];
    delete t.formation;
    return t;
  }
  const formations={
    vertical:{name:'竖排 2–5',points:[[245,335],[210,150],[420,265],[495,265],[570,265],[645,265],[720,265]]},
    horizontal:{name:'横排 3–4',points:[[250,280],[205,130],[205,430],[560,100],[560,220],[560,340],[560,460]]},
    zone:{name:'区域 3–3–1',points:[[310,250],[330,350],[400,280],[500,90],[500,465],[610,285],[800,280]]}
  };
  function arrange(frame,key,team){
    if(!formations[key]||!['offense','defense'].includes(team))throw new Error('请选择有效的站位模板。');
    const f=copy(frame),group=f.players.filter(p=>p.team===team).sort((a,b)=>number(a)-number(b));
    if(group.length!==7)throw new Error('这组站位模板需要 7 名队员，请先调整人数。');
    const holder=f.players.reduce((a,b)=>Math.hypot(a.x-f.disc.x,a.y-f.disc.y)<=Math.hypot(b.x-f.disc.x,b.y-f.disc.y)?a:b);
    group.forEach((p,i)=>{[p.x,p.y]=formations[key].points[i];});
    if(holder.team===team)f.disc={x:Math.min(975,holder.x+22),y:holder.y};
    f.routes=[];
    return f;
  }
  return {max, number, label, kind, create, resize, remove, formations, arrange};
})();
