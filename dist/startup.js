// Keep the startup reporter compatible even when the main application cannot parse.
(function(){
 window.frisbeeStartupIssue='';
 window.frisbeeAppReady=false;
 function unlock(){var workspace=document.querySelector('.workspace');if(workspace)workspace.removeAttribute('inert');}
 unlock();window.addEventListener('pageshow',unlock);
 function report(message,context){
  var text=String(message||'未知错误').slice(0,200);
  window.frisbeeStartupIssue=(context?context+'：':'')+text;
  var box=document.getElementById('startup-error'),detail=document.getElementById('startup-error-detail');
  if(box&&detail){detail.textContent=(window.frisbeeAppReady?'运行时遇到问题：':'页面未能完整启动：')+window.frisbeeStartupIssue;box.hidden=false;}
 }
 window.frisbeeReportIssue=report;
 window.frisbeeMarkReady=function(){
  window.frisbeeAppReady=true;
  if(window.frisbeeStartupIssue)report(window.frisbeeStartupIssue);
 };
 window.addEventListener('error',function(event){if(event.message)report(event.message);else if(event.target&&event.target.tagName==='SCRIPT')report('页面脚本下载失败，请重新加载。');},true);
 window.addEventListener('unhandledrejection',function(event){var reason=event.reason;if(reason&&reason.message)report(reason.message);});
 var retry=document.getElementById('startup-retry');if(retry)retry.onclick=function(){window.location.reload();};
})();
