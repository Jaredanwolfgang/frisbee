'use strict';
// Anchor positions use Unicode code points, matching Python and preserving emoji in comments.
const DiscussionText=(()=>{
 const cp=s=>Array.from(s||'');
 const clean=(text,refs)=>(refs||[]).filter(r=>Number.isInteger(r.start)&&Number.isInteger(r.end)&&r.start>=0&&r.end>r.start&&r.end<=cp(text).length).map(r=>({...r})).sort((a,b)=>a.start-b.start).filter((r,i,all)=>!i||r.start>=all[i-1].end);
 function rebase(before,after,refs){const a=cp(before),b=cp(after);let left=0,right=0;while(left<a.length&&left<b.length&&a[left]===b[left])left++;while(right<a.length-left&&right<b.length-left&&a[a.length-1-right]===b[b.length-1-right])right++;const end=a.length-right,delta=b.length-a.length;return clean(before,refs).flatMap(r=>r.end<=left?[r]:r.start>=end?[{...r,start:r.start+delta,end:r.end+delta}]:[]);}
 function replace(text,anchors,from,to,chunk){const left=cp(text.slice(0,from)).length,right=cp(text.slice(0,to)).length,delta=cp(chunk).length-(right-left);return clean(text,anchors).flatMap(r=>r.end<=left?[r]:r.start>=right?[{...r,start:r.start+delta,end:r.end+delta}]:[]);}
 function insert(text,refs,from,to,video,label){const prefix=text.slice(0,from),chunk=' '+label+' ',next=prefix+chunk+text.slice(to),start=cp(prefix+' ').length;return{text:next,refs:[...replace(text,refs,from,to,chunk),{...video,start,end:start+cp(label).length}].sort((a,b)=>a.start-b.start),caret:(prefix+chunk).length};}
 function trim(text,refs){const next=text.trim(),left=cp(text).length-cp(text.trimStart()).length;return{text:next,refs:clean(text,refs).map(r=>({...r,start:r.start-left,end:r.end-left})).filter(r=>r.start>=0&&r.end<=cp(next).length)};}
 function draft(c,format){const pack=(text,refs)=>({text,refs,mentions:clean(c.text,c.mentions||[])});if(c.videoRefs?.length)return pack(c.text,clean(c.text,c.videoRefs));if(c.video){const label=format(c.video.seconds),text=c.text+' '+label,start=cp(c.text+' ').length;return pack(text,[{...c.video,start,end:start+cp(label).length}]);}return pack(c.text,[]);}
 return{cp,clean,rebase,replace,insert,trim,draft};
})();
if(typeof module!=='undefined')module.exports=DiscussionText;
