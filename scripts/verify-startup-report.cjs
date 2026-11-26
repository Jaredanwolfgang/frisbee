const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const handlers = {};
const box = {hidden: true};
const detail = {textContent: ''};
const context = {
  window: {addEventListener(name, listener){handlers[name] = listener;}, location: {reload(){}}},
  document: {
    querySelector(){return {removeAttribute(){}};},
    getElementById(id){return {'startup-error': box, 'startup-error-detail': detail, 'startup-retry': {}}[id];}
  }
};
vm.runInNewContext(fs.readFileSync('dist/startup.js', 'utf8'), context);
handlers.error({message: 'Unexpected token'});
assert.equal(detail.textContent, '页面未能完整启动：Unexpected token');
context.window.frisbeeMarkReady();
assert.equal(detail.textContent, '运行时遇到问题：Unexpected token');
context.window.frisbeeReportIssue('Cannot read properties of undefined', '切换工作区');
assert.equal(detail.textContent, '运行时遇到问题：切换工作区：Cannot read properties of undefined');
handlers.error({target: {tagName: 'SCRIPT'}});
assert.equal(detail.textContent, '运行时遇到问题：页面脚本下载失败，请重新加载。');
handlers.unhandledrejection({reason: {message: '数据加载异常'}});
assert.equal(detail.textContent, '运行时遇到问题：数据加载异常');
console.log('PASS: startup errors and workspace action errors remain visible with appropriate context.');
