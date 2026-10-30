'use strict';
// A deliberately small, text-only Markdown vocabulary. No raw HTML or media embeds.
const LiteMarkdown=(()=>{
 const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 function url(value){try{const parsed=new URL(value);return /^https?:$/.test(parsed.protocol)&&parsed.hostname&&!parsed.username&&!parsed.password?parsed.href:null;}catch{return null;}}
 function render(value,options={}){
  const source=String(value??''),positions=[0];for(const char of source)positions.push(positions.at(-1)+char.length);
  const anchors=(options.anchors||[]).filter(a=>Number.isInteger(a.start)&&Number.isInteger(a.end)&&a.start>=0&&a.end>a.start&&a.end<positions.length).map(a=>({...a,from:positions[a.start],to:positions[a.end]})).sort((a,b)=>a.from-b.from);
  const byStart=new Map(anchors.map(a=>[a.from,a])),inside=at=>anchors.some(a=>a.from<=at&&at<a.to),overlap=(from,to)=>anchors.some(a=>a.from<to&&a.to>from);
  function closing(marker,from,end){let at=source.indexOf(marker,from);while(at>=0&&at<end){if(!inside(at)&&!overlap(at,at+marker.length))return at;at=source.indexOf(marker,at+marker.length);}return -1;}
  function inline(from,end,depth=0,links=true){let html='';for(let at=from;at<end;){
   const anchor=byStart.get(at);if(anchor&&anchor.to<=end){html+=anchor.html;at=anchor.to;continue;}
   if(source[at]==='\\'&&at+1<end&&/[\\*\[\]>]/.test(source[at+1])&&!inside(at+1)){html+=escape(source[at+1]);at+=2;continue;}
   if(depth<6&&source.slice(at,at+2)==='**'&&!overlap(at,at+2)){const close=closing('**',at+2,end);if(close>at+2){html+='<strong>'+inline(at+2,close,depth+1,links)+'</strong>';at=close+2;continue;}}
   if(links&&depth<6&&source[at]==='['&&source[at-1]!=='!'){
    const labelEnd=closing('](',at+1,end);
    if(labelEnd>at+1&&!source.slice(at,labelEnd).includes('\n')){let tail=labelEnd+2,balance=0;for(;tail<end;tail++){if(source[tail]==='(')balance++;if(source[tail]===')'){if(!balance)break;balance--;}if(/\s/.test(source[tail])||balance>8)break;}
     const href=tail<end&&source[tail]===')'?url(source.slice(labelEnd+2,tail)):null;
     if(href&&!overlap(at,tail+1)){html+='<a href="'+escape(href)+'" target="_blank" rel="noopener noreferrer">'+inline(at+1,labelEnd,depth+1,false)+'</a>';at=tail+1;continue;}
    }
   }
   html+=source[at]==='\n'?'<br>':source[at]==='\r'?(source[at+1]==='\n'?'':'<br>'):escape(source[at]);at++;
  }return html;}
  let offset=0;const lines=source.split('\n').map(text=>{const line={text,start:offset,end:offset+text.length};offset+=text.length+1;return line;});
  function kind(line){const quote=/^ {0,3}> ?/.exec(line.text),list=/^ {0,3}([-+*]|\d{1,6}[.)]) +/.exec(line.text),match=quote||list;if(match&&!overlap(line.start,line.start+match[0].length))return{type:quote?'quote':/^\d/.test(list[1])?'ol':'ul',prefix:match[0].length,number:list?parseInt(list[1],10):0};return{type:'p',prefix:0};}
  let html='';for(let i=0;i<lines.length;){if(!lines[i].text.trim()){i++;continue;}const block=kind(lines[i]),group=[lines[i++]];while(i<lines.length&&lines[i].text.trim()&&kind(lines[i]).type===block.type)group.push(lines[i++]);
   if(block.type==='ol'||block.type==='ul'){html+='<'+block.type+(block.type==='ol'&&block.number!==1?' start="'+block.number+'"':'')+'>'+group.map(line=>'<li>'+inline(line.start+kind(line).prefix,line.end)+'</li>').join('')+'</'+block.type+'>';}
   else if(block.type==='quote'){html+='<blockquote><p>'+group.map(line=>inline(line.start+kind(line).prefix,line.end)).join('<br>')+'</p></blockquote>';}
   else html+='<p>'+inline(group[0].start,group.at(-1).end)+'</p>';
  }
  if(options.prefix)html=html.startsWith('<p>')?'<p>'+options.prefix+html.slice(3):'<p class="md-context">'+options.prefix+'</p>'+html;
  return html;
 }
 function text(value){return render(value).replace(/<br>|<\/(?:p|li|blockquote|ul|ol)>/g,' ').replace(/<[^>]*>/g,'').replace(/&(?:amp|lt|gt|quot|#39);/g,s=>({'&amp;':'&','&lt;':'<','&gt;':'>','&quot;':'"','&#39;':"'"}[s])).replace(/\s+/g,' ').trim();}
 return{render,text,url};
})();
if(typeof module!=='undefined')module.exports=LiteMarkdown;
