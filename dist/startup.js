// Keep the startup reporter compatible even when the main application cannot parse.
(function(){
 window.frisbeeStartupIssue='';
 function unlock(){var workspace=document.querySelector('.workspace');if(workspace)workspace.removeAttribute('inert');}
 unlock();window.addEventListener('pageshow',unlock);
 function report(message){window.frisbeeStartupIssue=String(message).slice(0,300);var box=document.getElementById('startup-error'),detail=document.getElementById('startup-error-detail');if(box&&detail){detail.textContent='页面未能完整启动：'+window.frisbeeStartupIssue;box.hidden=false;}}
 window.addEventListener('error',function(event){if(event.message)report(event.message);else if(event.target&&event.target.tagName==='SCRIPT')report('页面脚本下载失败，请重新加载。');},true);
 window.addEventListener('unhandledrejection',function(event){var reason=event.reason;if(reason&&reason.message)report(reason.message);});
 var retry=document.getElementById('startup-retry');if(retry)retry.onclick=function(){window.location.reload();};
})();
