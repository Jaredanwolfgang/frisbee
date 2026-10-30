// Deterministic iOS-style visualViewport lifecycle; does not claim device testing.
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const events={},tasks=[],props={},classes=new Set();let focused=false,mobile=true,frames=0;
const viewport={height:844,offsetTop:0,scale:1,addEventListener:(event,fn)=>events['visual:'+event]=fn};
const root={style:{setProperty:(key,value)=>props[key]=value},classList:{toggle:(key,value)=>value?classes.add(key):classes.delete(key),remove:(...keys)=>keys.forEach(key=>classes.delete(key))}};
const document={documentElement:root,activeElement:{matches:()=>focused},addEventListener:(event,fn)=>events[event]=fn};
const window={innerHeight:844,innerWidth:390,visualViewport:viewport,matchMedia:()=>({matches:mobile}),addEventListener:(event,fn)=>events['window:'+event]=fn};
vm.runInNewContext(fs.readFileSync('dist/mobile-viewport.js','utf8'),{window,document,requestAnimationFrame:fn=>(tasks.push(fn),++frames)});
function emit(...names){names.forEach(name=>events[name]());while(tasks.length)tasks.shift()();}
const open=()=>classes.has('keyboard-open');
focused=true;emit('focusin');assert(!open());
viewport.height=400;viewport.offsetTop=64;const beforeFrame=frames;emit('visual:resize','visual:scroll');assert.equal(frames,beforeFrame+1,'resize and scroll share a layout frame');assert(open());assert.equal(props['--mobile-visual-height'],'400px');assert.equal(props['--mobile-visual-top'],'64px');
focused=false;emit('focusout');assert(open(),'toolbar/submit blur must not restore full height while keyboard remains');
focused=true;emit('focusin');assert(open(),'moving from draft to URL input preserves keyboard state');
viewport.height=370;emit('visual:resize');assert(open(),'keyboard suggestion bar can change visible height');
viewport.scale=1.5;viewport.height=230;emit('visual:resize');assert.equal(props['--mobile-visual-height'],'370px','pinch zoom must not be treated as a new keyboard resize');
viewport.scale=1;viewport.height=400;emit('visual:resize');assert(open());
focused=false;viewport.height=754;emit('focusout','visual:resize');assert(open(),'hysteresis avoids flicker near keyboard dismissal');
viewport.height=844;viewport.offsetTop=0;emit('visual:resize','visual:scroll');assert(!open(),'dismissal ends once visible area is restored');
// Browser chrome alone must not claim keyboard mode.
viewport.height=700;emit('visual:resize');assert(!open());
focused=true;viewport.height=400;emit('focusin','visual:resize');assert(open());
window.innerWidth=844;window.innerHeight=390;viewport.height=205;viewport.offsetTop=20;emit('window:resize','visual:resize');assert(open());assert(classes.has('keyboard-compact'));assert.equal(props['--mobile-visual-height'],'205px');
focused=false;viewport.height=390;viewport.offsetTop=0;emit('focusout','visual:resize');assert(!open(),'orientation uses the new resting height');assert(!classes.has('keyboard-compact'));
mobile=false;emit('window:resize');assert(!open());
console.log('PASS: keyboard open/blur/refocus/dismissal, viewport offsets, suggestion bar, event coalescing, orientation and pinch zoom isolation.');
