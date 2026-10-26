/* Topic aliases are navigation aids. Results always contain source text. */
(function(root){
 const topics=[
  {terms:['走步','走几步','跑几步','travel','轴心','pivot'],refs:['18.2']},
  {terms:['pick','阻挡','挡拆'],refs:['18.3']},
  {terms:['读秒','数秒','stall','快数','fast count'],refs:['9','18.1.1.1','13.4']},
  {terms:['出界','踩线','界外','out of bounds','out-of-bounds'],refs:['11']},
  {terms:['危险','dangerous','冲撞'],refs:['17.1','12.6']},
  {terms:['同时接盘','争盘','simultaneous'],refs:['12.3']},
  {terms:['接盘犯规','receiving foul'],refs:['17.2']},
  {terms:['打手','防盘犯规','throwing foul','contact'],refs:['17.6','17.7']},
  {terms:['strip','剥夺','拍盘','抢盘'],refs:['17.3']},
  {terms:['双人防守','double team','包夹'],refs:['18.1.1.5','18.1.1.4']},
  {terms:['暂停','time out','time-out'],refs:['20','A5']},
  {terms:['争议','contest','不认'],refs:['1.12','15','16','9.5']},
  {terms:['开盘','pull','越位','offside','brick'],refs:['7']},
  {terms:['得分','进区','端区','goal','score'],refs:['14']},
  {terms:['受伤','流血','injury','bleeding'],refs:['19']},
  {terms:['飞盘精神','spirit'],refs:['1','A13']},
  {terms:['男女比例','性别比例','abba','混合','mixed'],refs:['5.4','6.4','A6']},
  {terms:['天气','雷电','下雨','weather','lightning'],refs:['B4']},
  {terms:['加时','时间上限','time cap'],refs:['A4','A5']},
  {terms:['换人','替换','substitution'],refs:['5.3','19.1','A7']},
 ];
 const norm=s=>String(s||'').toLowerCase().replace(/[“”‘’「」]/g,'').trim();
 const within=(ref,prefix)=>ref===prefix||ref.startsWith(prefix+'.');
 function search(entries,query,{scope='core',chapter=''}={}){
  const q=norm(query),numeric=/^(?:[a-f])?\d+(?:\.\d+)*\.?$/i.test(q),refq=q.replace(/\.$/,'').toUpperCase();
  const active=topics.filter(t=>t.terms.some(w=>q.includes(w))),tokens=q.split(/\s+/).filter(Boolean);
  return entries.flatMap((e,index)=>{
   if(scope!=='all'&&e.doc!==scope||chapter&&e.chapter!==chapter)return [];
   let body=norm([e.ref,e.title,e.zh,e.en].join(' '));
   if(q==='pick')body=body.replace(/\bpick(?:ed|ing|s)?\s+up\b/g,'');
   const relevant=active.some(t=>t.refs.some(r=>within(e.doc==='annotations'?e.related||'':e.ref,r)||(e.refs||[]).some(x=>within(x,r))));
   const direct=!!q&&tokens.every(t=>body.includes(t));
   const refmatch=numeric&&within(e.ref.toUpperCase(),refq);
   if(q&&!direct&&!relevant&&!refmatch)return [];
   let score=!q?0:direct?50:relevant?30:0;
   if(numeric){if(e.ref.toUpperCase()===refq)score=200;else if(refmatch)score=150-e.ref.split('.').length;}
   if(relevant)score=100+(e.ref.split('.').length===2?4:0)+(active.some(t=>t.refs[0]===e.ref)?12:0);
   if(numeric&&e.ref.toUpperCase()===refq)score=250;
   if(e.doc==='core')score+=5;
   return [{entry:e,score,index}];
  }).sort((a,b)=>b.score-a.score||a.index-b.index).map(x=>x.entry);
 }
 function context(entries,e){
  let ref=e.doc==='annotations'?e.related:e.ref;
  if(!/^[A-F]?\d+(?:\.\d+)*$/.test(ref||''))return [];
  const prefix=ref.split('.').slice(0,e.doc==='appendix'?1:2).join('.');
  return entries.filter(x=>x.doc===(e.doc==='annotations'?'core':e.doc)&&within(x.ref,prefix));
 }
 function sections(entries,hits){
  const groups=new Map();
  for(const hit of hits){
   const numeric=hit.doc==='core'&&/^\d+(?:\.\d+)+$/.test(hit.ref);
   const prefix=numeric?hit.ref.split('.').slice(0,2).join('.'):hit.ref;
   const key=numeric?'core:'+prefix:hit.key;
   if(!groups.has(key)){
    const rows=numeric?entries.filter(e=>e.doc==='core'&&within(e.ref,prefix)):[hit];
    const root=rows.find(e=>e.ref===prefix)||hit;
    groups.set(key,{root,rows,matches:[]});
   }
   groups.get(key).matches.push(hit.key);
  }
  return Array.from(groups.values());
 }
 root.WFDFSearch={search,context,sections,topics};
 if(typeof module!=='undefined')module.exports=root.WFDFSearch;
})(globalThis);
