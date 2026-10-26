'use strict';
// Measure finger movement in screen pixels, independent of board scale/rotation.
function createHoldGesture({duration=650,tolerance=10,progress,complete}){
 let active=null,timer=0,animation=0;
 function cancel(){if(!active)return;const data=active.data;active=null;clearTimeout(timer);cancelAnimationFrame(animation);timer=animation=0;progress(null,data);}
 function start(event,data){cancel();if(event.isPrimary===false||event.button>0)return;active={pointer:event.pointerId,x:event.clientX,y:event.clientY,at:performance.now(),data};progress(0,data);
  const tick=()=>{if(!active)return;progress(Math.min(1,(performance.now()-active.at)/duration),active.data);animation=requestAnimationFrame(tick);};animation=requestAnimationFrame(tick);
  timer=setTimeout(()=>{if(!active)return;const data=active.data;progress(1,data);cancel();complete(data);},duration);
 }
 function move(event){if(active&&event.pointerId===active.pointer&&Math.hypot(event.clientX-active.x,event.clientY-active.y)>tolerance)cancel();}
 function end(event){if(active&&event.pointerId===active.pointer)cancel();}
 return {start,move,end,cancel};
}
