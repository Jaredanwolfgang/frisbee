'use strict';
const BiliVideo=(()=>{
 const keyOK=key=>/^(BV[0-9A-Za-z]{10}|av[1-9]\d{0,15})$/.test(key||'');
 function extractURL(value){const text=String(value||'').trim();if(/^BV[0-9A-Za-z]{10}$/.test(text))return'https://www.bilibili.com/video/'+text;return(text.match(/https?:\/\/[^\s<>"'，。）》】]+/)||[text])[0].replace(/[),.!;]+$/,'');}
 function parseTime(value){const raw=String(value).trim();if(!/^\d+(?::\d{1,2}){0,2}$/.test(raw))return null;const parts=raw.split(':').map(Number);if(parts.slice(1).some(n=>n>59))return null;const seconds=parts.reduce((a,n)=>a*60+n,0);return Number.isSafeInteger(seconds)&&seconds<=86400?seconds:null;}
 const formatTime=value=>{const n=Math.max(0,Math.floor(value||0)),h=Math.floor(n/3600),m=Math.floor(n/60)%60,s=n%60;return(h?h+':'+String(m).padStart(2,'0'):String(m))+':'+String(s).padStart(2,'0');};
 function embed(meta,seconds=0,page=meta?.page||1,play=false){if(!keyOK(meta?.key)||!Number.isInteger(seconds)||seconds<0||seconds>86400||!Number.isInteger(page)||page<1||page>1000)return'';const q=new URLSearchParams({[meta.key.startsWith('BV')?'bvid':'aid']:meta.key.startsWith('BV')?meta.key:meta.key.slice(2),p:String(page),t:String(seconds),autoplay:play?'1':'0',danmaku:'0',poster:'1'});return'https://player.bilibili.com/player.html?'+q;}
 function link(meta,seconds=0,page=meta?.page||1){return keyOK(meta?.key)?'https://www.bilibili.com/video/'+meta.key+'?p='+page+'&t='+seconds:'';}
 return{extractURL,parseTime,formatTime,embed,link};
})();
if(typeof module!=='undefined')module.exports=BiliVideo;
