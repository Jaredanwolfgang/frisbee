'use strict';
// Phone pages share one Back path, including browser/Android Back. Dialogs still
// provide focus trapping; presentation and navigation are independent of storage.
const MobileUI=(()=>{
 const media=window.matchMedia('(max-width:600px)'),stack=[],handlers=new Map();
 let sequence=0,backSteps=0,scheduled=false,navigating=false,popping=false,queued=[];
 const token=()=>window.history.state?.frisbeePage;
 function push(entry){if(entry.key==='dialog:editor'&&!stack.length)window.history.replaceState(window.history.state,'',location.pathname+location.search);stack.push(entry);window.history.pushState({...window.history.state,frisbeePage:entry.token},'',entry.url);}
 function enter(key,close){if(!media.matches||stack.some(e=>e.key===key)||queued.some(e=>e.key===key))return;const entry={key,close,token:'phone-'+Date.now()+'-'+(++sequence),url:location.href};if(backSteps||navigating){queued.push(entry);return;}push(entry);}
 function leave(key){const pending=queued.findIndex(e=>e.key===key);if(pending>=0){queued.splice(pending,1);return;}const index=stack.findIndex(e=>e.key===key);if(index<0)return;const removed=stack.splice(index);if(popping)return;backSteps+=removed.length;if(scheduled)return;scheduled=true;queueMicrotask(()=>{scheduled=false;if(!backSteps)return;const steps=backSteps;backSteps=0;navigating=true;window.history.go(-steps);});}
 window.addEventListener('popstate',()=>{
  if(navigating){navigating=false;const next=queued;queued=[];next.forEach(push);return;}
  while(stack.length&&stack[stack.length-1].token!==token()){
   const entry=stack.pop();popping=true;let closed;try{closed=entry.close();}finally{popping=false;}
   if(closed===false){push(entry);break;}
  }
 });
 function dialogBack(dialog){const handler=handlers.get(dialog.id);if(handler)return handler();const cancel=new Event('cancel',{cancelable:true});dialog.dispatchEvent(cancel);if(!cancel.defaultPrevented)dialog.close();return !dialog.open;}
 function syncDialogs(){document.querySelectorAll('dialog[id]').forEach(dialog=>{const key='dialog:'+dialog.id;if(dialog.open)enter(key,()=>dialogBack(dialog));else leave(key);});document.body.classList.toggle('phone-dialog-open',media.matches&&!!document.querySelector('dialog[open]'));}
 new MutationObserver(syncDialogs).observe(document.body,{subtree:true,attributes:true,attributeFilter:['open']});watchMedia(media,syncDialogs);
 return {isPhone:()=>media.matches,enter,leave,registerBack:(id,handler)=>handlers.set(id,handler)};
})();
