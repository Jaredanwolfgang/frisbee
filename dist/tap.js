'use strict';
// WebKit may cancel a compatibility click after a touch-driven viewport change.
// Handle a stationary touch once, while retaining mouse and keyboard activation.
function bindTap(button,action){
 let start=null,lastTouch=-Infinity;
 const run=event=>{if(button.disabled)return;action(event);};
 const finish=event=>{const p=event.changedTouches?.[0]||event;if(!start||Math.hypot(p.clientX-start.x,p.clientY-start.y)>12){start=null;return;}start=null;if(button.disabled)return;lastTouch=performance.now();if(event.cancelable)event.preventDefault();run(event);};
 if(window.PointerEvent){button.addEventListener('pointerdown',e=>{if(e.pointerType==='touch')start={x:e.clientX,y:e.clientY};});button.addEventListener('pointerup',e=>{if(e.pointerType==='touch')finish(e);});button.addEventListener('pointercancel',()=>start=null);}
 else{button.addEventListener('touchstart',e=>{const p=e.touches[0];start={x:p.clientX,y:p.clientY};},{passive:true});button.addEventListener('touchend',finish,{passive:false});button.addEventListener('touchcancel',()=>start=null);}
 button.onclick=e=>{if(performance.now()-lastTouch<600){e.preventDefault();return;}run(e);};
}

function watchMedia(query,listener){const media=typeof query==='string'?window.matchMedia(query):query;if(media.addEventListener)media.addEventListener('change',listener);else if(media.addListener)media.addListener(listener);return media;}
