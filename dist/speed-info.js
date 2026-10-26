'use strict';
// Timings stay in this page. No questions, credentials or automatic telemetry.
const SpeedInfo={
 cached:false,library:null,ai:null,
 text(){const time=value=>Number.isFinite(value)?(value/1000).toFixed(2)+' 秒':'尚无记录';const nav=performance.getEntriesByType?.('navigation')?.[0];return [
  ['页面启动',window.frisbeeStartupIssue||'正常'],
  ['网页首字节',time(nav?nav.responseStart-nav.startTime:null)],
  ['页面资源加载',time(nav?.loadEventEnd>0?nav.loadEventEnd-nav.startTime:null)],
  ['上次战术预览',this.cached?'已先显示缓存内容':'本次从服务器加载'],
  ['首次战术同步',time(this.library?.duration)],
  ['规则原文返回',time(this.ai?.sources)],
  ['AI 首字返回',time(this.ai?.firstText)],
  ['AI 完整回复',time(this.ai?.total)]
 ];},
 report(){return 'Tiga 速度诊断\n'+this.text().map(([label,value])=>label+'：'+value).join('\n');}
};
