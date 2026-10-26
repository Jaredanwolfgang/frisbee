'use strict';
function initFrisbeeAI({requestEdit,onDraft,drawFrame,toast}){
 const $=s=>document.querySelector(s),escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 let generated=null,generation=null,chatRequest=null,history=[],turns=new Map(),turnNumber=0;
 const endpoint=path=>new URL('api/ai/'+path,location.href.split('#')[0]);
 let reviewSignature=null,reviewQuestions=false,reviewBaseline='';
 const sourceSnapshot=()=>JSON.stringify({description:$('#ai-description').value,kind:$('#ai-kind').value,offense:Number($('#ai-offense').value),defense:Number($('#ai-defense').value)});
 const settings=()=>({kind:$('#ai-kind').value,offense:Number($('#ai-offense').value),defense:Number($('#ai-defense').value)});
 function clearGenerated(){generated=null;$('#ai-plan-preview').innerHTML='';$('#ai-open-draft').hidden=true;}
 function confirmState(){const valid=reviewSignature===sourceSnapshot(),changed=$('#ai-formal-description').value.trim()!==reviewBaseline.trim();$('#ai-confirm-generate').disabled=!!generation||!valid||!$('#ai-formal-description').value.trim()||(reviewQuestions&&!changed);}
 function busy(on){for(const id of ['ai-kind','ai-offense','ai-defense','ai-description','ai-formal-description','ai-generate-btn'])$('#'+id).disabled=on;confirmState();}
 function showGeneration(){requestEdit(()=>{$('#create-dialog').close();clearGenerated();reviewSignature=null;$('#ai-review-section').hidden=true;$('#ai-source-details').open=true;$('#ai-tactic-result').textContent='';$('#ai-tactic-dialog').showModal();$('#ai-description').focus({preventScroll:true});});}
 $('#ai-new-btn').onclick=showGeneration;$('#ai-create-btn').onclick=showGeneration;
 $('#ai-tactic-close').onclick=()=>$('#ai-tactic-dialog').close();
 $('#ai-tactic-dialog').addEventListener('close',()=>generation?.abort());
 for(const id of ['ai-kind','ai-offense','ai-defense','ai-description'])$('#'+id).addEventListener('input',()=>{if(reviewSignature!==null){clearGenerated();$('#ai-tactic-result').textContent='原始描述或人数已修改，请先重新整理说明，再确认生成。';confirmState();}});
 $('#ai-formal-description').addEventListener('input',()=>{clearGenerated();$('#ai-tactic-result').textContent='说明可继续修改；确认后按这版说明生成战术图。';confirmState();});
 function showQuestions(questions){$('#ai-review-questions').hidden=!questions.length;$('#ai-review-questions').innerHTML=questions.length?'<strong>请在说明中补充这些信息，再确认生成</strong><ul>'+questions.map(q=>'<li>'+escape(q)+'</li>').join('')+'</ul>':'';}
 async function generationRequest(path,payload){
  const controller=new AbortController();generation=controller;const timer=setTimeout(()=>controller.abort(),140000);busy(true);
  try{const response=await fetch(endpoint(path),{method:'POST',credentials:'same-origin',signal:controller.signal,headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});const data=await response.json();if(!response.ok)throw Error(data.error||'AI 暂时不可用，请稍后重试。');return data;}
  finally{clearTimeout(timer);generation=null;busy(false);}
 }
 $('#ai-tactic-form').onsubmit=async event=>{
  event.preventDefault();if(generation)return;clearGenerated();reviewSignature=null;$('#ai-review-section').hidden=true;
  const signature=sourceSnapshot();$('#ai-tactic-result').textContent='正在把口语整理成固定角色与传跑说明…';
  try{const data=await generationRequest('outline',{...settings(),description:$('#ai-description').value});
   if(data.status!=='review'||!data.formal_description)throw Error('未收到完整说明，请重新整理。');
   reviewSignature=signature;reviewQuestions=!!data.questions?.length;reviewBaseline=data.formal_description;$('#ai-formal-description').value=reviewBaseline;showQuestions(data.questions||[]);$('#ai-review-section').hidden=false;$('#ai-source-details').open=false;
   $('#ai-tactic-result').textContent='说明已整理，尚未生成战术图。请核对 O1 / O2 对应的人、盘权和动作顺序，可直接修改下方文字。';confirmState();$('#ai-review-title').focus({preventScroll:true});$('#ai-review-section').scrollIntoView({block:'start',behavior:'smooth'});
  }catch(error){$('#ai-tactic-result').textContent=error.name==='AbortError'?'整理已停止或超时，原描述仍保留。':error.message;confirmState();}
 };
 $('#ai-confirm-generate').onclick=async()=>{
  if(generation||reviewSignature!==sourceSnapshot())return;
  const description=$('#ai-formal-description').value.trim();if(!description)return;
  clearGenerated();$('#ai-tactic-result').textContent='正在依据你确认的说明画图，优先沿进攻长边安排站位…';
  try{const data=await generationRequest('tactic',{...settings(),description,confirmed:true});
   if(data.status==='clarify'){reviewQuestions=true;reviewBaseline=description;showQuestions(data.questions||[]);$('#ai-tactic-result').textContent='绘图前仍有需要明确的动作，请补充或修改形式化说明，再确认生成。';confirmState();return;}
   if(data.status!=='ready'||!data.tactic)throw Error('没有收到完整草稿，请重试。');
   generated=data.tactic;const count=generated.frames[0].players.length;showQuestions([]);
   $('#ai-tactic-result').textContent='已按确认的说明生成草稿，结构与传跑衔接已校验，尚未保存。请再核对站位和路线。';
   $('#ai-plan-preview').innerHTML='<p class="ai-plan-facts">'+count+' 人 · '+generated.frames.length+' 步 · '+(generated.markers||[]).length+' 个角标</p><h3>'+escape(generated.name)+'</h3><p>'+escape(generated.summary)+'</p>'+(data.assumptions?.length?'<div class="ai-assumptions"><strong>绘图约定</strong><ul>'+data.assumptions.map(x=>'<li>'+escape(x)+'</li>').join('')+'</ul></div>':'')+'<div class="ai-frame-previews">'+generated.frames.slice(0,4).map(f=>'<figure>'+drawFrame(f,generated.markers||[])+'<figcaption>'+escape(f.name)+'</figcaption></figure>').join('')+'</div><ol class="ai-step-list">'+generated.frames.map(f=>'<li><strong>'+escape(f.name)+'</strong><p>'+escape(f.notes)+'</p></li>').join('')+'</ol>';
   $('#ai-open-draft').hidden=false;$('#ai-plan-preview').scrollIntoView({block:'start',behavior:'smooth'});
  }catch(error){$('#ai-tactic-result').textContent=error.name==='AbortError'?'生成已停止或超时，确认的说明仍保留。':error.message;}
 };
 $('#ai-open-draft').onclick=()=>{if(!generated)return;const draft=generated;$('#ai-tactic-dialog').close();onDraft(draft);};
 const sheet=$('#ai-chat-dialog'),sheetToggle=$('#ai-rules-btn');let sheetOpen=false,sheetHideTimer=0;
 function fitSheet(){const viewport=window.visualViewport,mobile=window.matchMedia('(max-width:600px)').matches;sheet.style.setProperty('--ai-visual-height',(viewport?.height||window.innerHeight)+'px');sheet.style.setProperty('--ai-keyboard-offset',(mobile&&viewport?Math.max(0,window.innerHeight-viewport.height-viewport.offsetTop):0)+'px');}
 function closeSheet(returnFocus=true){if(!sheetOpen)return;sheetOpen=false;sheet.classList.remove('is-open');sheet.inert=true;sheet.setAttribute('aria-hidden','true');sheetToggle.setAttribute('aria-expanded','false');if(returnFocus&&!$('#rules-header-actions').hidden)sheetToggle.focus({preventScroll:true});clearTimeout(sheetHideTimer);sheetHideTimer=setTimeout(()=>{if(!sheetOpen)sheet.hidden=true;},230);}
 function openSheet(){clearTimeout(sheetHideTimer);sheetOpen=true;sheet.hidden=false;sheet.inert=false;sheet.setAttribute('aria-hidden','false');sheetToggle.setAttribute('aria-expanded','true');fitSheet();requestAnimationFrame(()=>{if(!sheetOpen)return;void sheet.offsetHeight;sheet.classList.add('is-open');scrollChat();if(window.matchMedia('(min-width:701px)').matches)$('#ai-question').focus({preventScroll:true});else $('#ai-chat-title').focus({preventScroll:true});});}
 sheetToggle.onclick=()=>sheetOpen?closeSheet():openSheet();$('#ai-chat-close').onclick=()=>closeSheet();
 document.addEventListener('keydown',event=>{if(event.key==='Escape'&&sheetOpen&&!document.querySelector('dialog[open]')){event.preventDefault();closeSheet();}});
 new MutationObserver(()=>{if($('#rules-header-actions').hidden)closeSheet(false);}).observe($('#rules-header-actions'),{attributes:true,attributeFilter:['hidden']});
 window.addEventListener('resize',fitSheet);window.visualViewport?.addEventListener('resize',fitSheet);window.visualViewport?.addEventListener('scroll',fitSheet);
 $('#ai-chat-stop').onclick=()=>chatRequest?.abort();
 $('#ai-chat-clear').onclick=()=>{if(chatRequest)return;history=[];turns.clear();$('#ai-messages').innerHTML='';$('#ai-chat-intro').hidden=false;};
 function scrollChat(){const box=$('#ai-chat-scroll');box.scrollTop=box.scrollHeight;}
 function renderSourceButtons(turn){
  const box=document.querySelector('[data-turn="'+turn.id+'"] .ai-references');
  box.innerHTML=(turn.sources.length?'<span>检索依据</span>'+turn.sources.slice(0,8).map(s=>'<button data-ai-source="'+turn.id+'" data-ai-citation="'+escape(s.citation)+'">'+escape(s.citation)+'</button>').join('')+(turn.sources.length>8?'<button data-ai-all-sources="'+turn.id+'">全部 '+turn.sources.length+' 条</button>':''):'')+(turn.visuals.length?'<div class="ai-gesture-row">'+turn.visuals.map(v=>'<button data-ai-visual="'+turn.id+'" data-visual-id="'+escape(v.id)+'"><img src="'+escape(v.image)+'" alt="'+escape(v.title)+'" loading="lazy"><span>'+escape(v.title)+'</span></button>').join('')+'</div>':'');
 }
 function finishAnswer(turn,data){
  const article=document.querySelector('[data-turn="'+turn.id+'"]'),body=article.querySelector('.ai-answer'),state=article.querySelector('.ai-response-status');
  if(turn.answer&&data.grounded){
   const allowed=new Set(turn.sources.map(s=>s.citation));
   let value=escape(turn.answer).replace(/\[([^\[\]\n]{1,40})\]/g,(all,cite)=>allowed.has(cite)?'<button class="ai-inline-cite" data-ai-source="'+turn.id+'" data-ai-citation="'+escape(cite)+'">['+escape(cite)+']</button>':all);
   value=value.replace(/\*\*([^*\n]+)\*\*/g,'<strong>$1</strong>');body.innerHTML=value;state.textContent='已附可核对条款 · '+((performance.now()-turn.started)/1000).toFixed(1)+' 秒';
   history.push({role:'user',content:turn.question},{role:'assistant',content:turn.answer.slice(0,2000)});history=history.slice(-4);
  }else if(turn.sources.length&&turn.answer){
   body.textContent='这次回复未通过条款引用校验，已隐藏解释内容。请先核对检索原文，或补充情形后重新提问。';state.textContent='请核对原文';
  }else{body.textContent=turn.answer||'请补充具体情形后再试。';state.textContent='需要补充情形';}
 }
 async function consumeEvents(response,callback){
  const reader=response.body.getReader(),decoder=new TextDecoder();let buffer='';
  while(true){const {done,value}=await reader.read();if(done)break;buffer+=decoder.decode(value,{stream:true});buffer=buffer.replace(/\r\n/g,'\n');if(buffer.length>1048576)throw Error('回复内容过长，请重新提问。');let end;
   while((end=buffer.indexOf('\n\n'))>=0){const block=buffer.slice(0,end);buffer=buffer.slice(end+2);let event='message',data=[];for(const line of block.split('\n')){if(line.startsWith('event:'))event=line.slice(6).trim();if(line.startsWith('data:'))data.push(line.slice(5).trimStart());}if(data.length)callback(event,JSON.parse(data.join('\n')));}
  }
 }
 $('#ai-chat-form').onsubmit=async event=>{
  event.preventDefault();if(chatRequest)return;
  const question=$('#ai-question').value.trim();if(!question)return;
  $('#ai-chat-intro').hidden=true;$('#ai-question').value='';const id=String(++turnNumber),turn={id,question,sources:[],visuals:[],answer:'',started:performance.now()};turns.set(id,turn);
  $('#ai-messages').insertAdjacentHTML('beforeend','<article class="ai-user"><p>'+escape(question)+'</p></article><article class="ai-assistant" data-turn="'+id+'"><div class="ai-response-status">正在检索条款…</div><div class="ai-answer" aria-live="polite"></div><div class="ai-references"></div></article>');
  const article=document.querySelector('[data-turn="'+id+'"]'),body=article.querySelector('.ai-answer'),state=article.querySelector('.ai-response-status');
  const controller=new AbortController();chatRequest=controller;const timer=setTimeout(()=>controller.abort(),140000);$('#ai-chat-send').disabled=true;$('#ai-chat-stop').hidden=false;$('#ai-chat-clear').disabled=true;scrollChat();let completed=false;
  try{
   const response=await fetch(endpoint('rules'),{method:'POST',credentials:'same-origin',signal:controller.signal,headers:{'Content-Type':'application/json'},body:JSON.stringify({question,history:history.map(m=>({...m,content:m.content.slice(0,1500)}))})});
   if(!response.ok){const data=await response.json();throw Error(data.error||'AI 暂时不可用。');}
   await consumeEvents(response,(event,data)=>{
    if(event==='sources'){turn.sources=data.sources||[];turn.visuals=data.visuals||[];renderSourceButtons(turn);state.textContent='已检索 '+turn.sources.length+' 条依据，正在组织回答…';}
    if(event==='delta'){turn.answer+=data.text||'';body.textContent=turn.answer;state.textContent='正在回复…';scrollChat();}
    if(event==='done'){finishAnswer(turn,data);completed=true;}
    if(event==='error')throw Error(data.message||'回复中断，请重试。');
   });
   if(!completed)throw Error('回复未完整结束，以上文字尚未通过引用校验。');
  }catch(error){state.textContent=error.name==='AbortError'?'已停止；未完成的文字请以原文核对。':error.message;if(!turn.answer)body.textContent='可以补充信息后重试，或直接使用规则检索。';}
  finally{clearTimeout(timer);chatRequest=null;$('#ai-chat-send').disabled=false;$('#ai-chat-stop').hidden=true;$('#ai-chat-clear').disabled=false;}
 };
 document.addEventListener('click',event=>{
  const quick=event.target.closest('[data-ai-question]');if(quick){$('#ai-question').value=quick.dataset.aiQuestion;$('#ai-question').focus();}
  const source=event.target.closest('[data-ai-source],[data-ai-all-sources]');
  if(source){const turn=turns.get(source.dataset.aiSource||source.dataset.aiAllSources);if(!turn)return;const selected=turn.sources.find(s=>s.citation===source.dataset.aiCitation);let list=turn.sources;
   if(selected){const prefix=selected.doc==='core'?selected.ref.split('.').slice(0,2).join('.'):null;list=prefix?turn.sources.filter(s=>s.doc==='core'&&(s.ref===prefix||s.ref.startsWith(prefix+'.'))):[selected];}
   $('#ai-source-body').innerHTML=list.map(s=>'<article'+(s.citation===source.dataset.aiCitation?' class="ai-source-highlight"':'')+'><h3>'+escape(s.citation)+' · '+escape(s.title)+'</h3><p>'+escape(s.zh||s.en)+'</p>'+(s.zh&&s.en?'<details><summary>English 原文</summary><p lang="en">'+escape(s.en)+'</p></details>':'')+'<a href="'+escape(s.url)+'" target="_blank" rel="noopener noreferrer">来源 ↗</a></article>').join('');$('#ai-source-dialog').showModal();
  }
  const visual=event.target.closest('[data-ai-visual]');if(visual){const v=turns.get(visual.dataset.aiVisual)?.visuals.find(v=>v.id===visual.dataset.visualId);if(!v)return;$('#visual-title').textContent=v.title;$('#visual-subtitle').textContent=v.en;$('#visual-image').src=v.image;$('#visual-image').alt=v.title+' · WFDF 官方示意';$('#visual-description').textContent=v.description;$('#visual-source').href=v.source;$('#rule-visual-dialog').showModal();}
 });
 $('#ai-source-close').onclick=()=>$('#ai-source-dialog').close();
 fetch(endpoint('status'),{credentials:'same-origin'}).then(r=>r.json()).then(data=>{$$AIButtons(data.enabled);}).catch(()=>$$AIButtons(false));
 function $$AIButtons(enabled){for(const id of ['ai-new-btn','ai-create-btn','ai-rules-btn']){$('#'+id).disabled=!enabled;$('#'+id).title=enabled?(id==='ai-rules-btn'?'AI 问规则 · DeepSeek':'DeepSeek'):'AI 暂未配置或连接不可用';}}
}
