'use strict';
// Keep native pinch zoom available. Only fit input overlays to the visible keyboard area.
(()=>{
 const root=document.documentElement,viewport=window.visualViewport;
 let restingHeight=viewport?.height||window.innerHeight,lastWidth=window.innerWidth;
 function update(){
  const mobile=window.matchMedia('(max-width:850px), (pointer:coarse)').matches;
  if(!mobile){root.classList.remove('keyboard-open');return;}
  const scale=viewport?.scale||1;if(Math.abs(scale-1)>.05)return;
  const height=viewport?.height||window.innerHeight,top=viewport?.offsetTop||0;
  if(Math.abs(window.innerWidth-lastWidth)>80){restingHeight=window.innerHeight;lastWidth=window.innerWidth;}
  const focused=document.activeElement?.matches('textarea,select,input:not([type="checkbox"]):not([type="radio"])');
  if(!focused&&height>=restingHeight-80)restingHeight=height;
  root.style.setProperty('--mobile-visual-height',height+'px');root.style.setProperty('--mobile-visual-top',top+'px');
  root.classList.toggle('keyboard-open',!!focused&&Math.max(restingHeight,window.innerHeight)-height>100);
 }
 document.addEventListener('focusin',update);document.addEventListener('focusout',()=>requestAnimationFrame(update));window.addEventListener('resize',update);viewport?.addEventListener('resize',update);viewport?.addEventListener('scroll',update);update();
})();
