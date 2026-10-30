'use strict';
// Keep native pinch zoom available. Only fit input overlays to the visible keyboard area.
(()=>{
 const root=document.documentElement,viewport=window.visualViewport;
 let restingHeight=viewport?.height||window.innerHeight,lastWidth=window.innerWidth,keyboardOpen=false,frame=0;
 function schedule(){if(!frame)frame=requestAnimationFrame(()=>{frame=0;update();});}
 function update(){
  const mobile=window.matchMedia('(max-width:850px), (pointer:coarse)').matches;
  if(!mobile){keyboardOpen=false;root.classList.remove('keyboard-open','keyboard-compact');return;}
  const scale=viewport?.scale||1;if(Math.abs(scale-1)>.05)return;
  const height=viewport?.height||window.innerHeight,top=viewport?.offsetTop||0;
  if(Math.abs(window.innerWidth-lastWidth)>80){restingHeight=window.innerHeight;lastWidth=window.innerWidth;}
  const focused=document.activeElement?.matches('textarea,select,input:not([type="checkbox"]):not([type="radio"])');
  if(!focused&&height>=restingHeight-80)restingHeight=height;
  root.style.setProperty('--mobile-visual-height',height+'px');root.style.setProperty('--mobile-visual-top',top+'px');
  // iOS can blur the field before its keyboard has finished closing, including
  // when a formatting/link control takes focus. Keep fitting the visible area
  // until it actually recovers; never flash the full-height dialog on blur.
  const obscured=Math.max(restingHeight,window.innerHeight)-height;
  keyboardOpen=obscured>100?keyboardOpen||!!focused:obscured<80?false:keyboardOpen;
  root.classList.toggle('keyboard-open',keyboardOpen);
  root.classList.toggle('keyboard-compact',keyboardOpen&&height<340);
 }
 document.addEventListener('focusin',schedule);document.addEventListener('focusout',schedule);window.addEventListener('resize',schedule);viewport?.addEventListener('resize',schedule);viewport?.addEventListener('scroll',schedule);update();
})();
