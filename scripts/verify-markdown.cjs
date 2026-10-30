const assert=require('node:assert/strict');
const Markdown=require('../dist/lite-markdown.js'),Editor=require('../dist/markdown-editor.js'),Text=require('../dist/discussion-text.js');
assert.equal(Markdown.render('普通评论\n继续补充'),'<p>普通评论<br>继续补充</p>');
assert.equal(Markdown.render('**本次重点**\n\n- 提前观察\n- 出盘后移动\n\n1. 切入\n2. 清空\n\n> 先看空间\n> 再启动'),'<p><strong>本次重点</strong></p><ul><li>提前观察</li><li>出盘后移动</li></ul><ol><li>切入</li><li>清空</li></ol><blockquote><p>先看空间<br>再启动</p></blockquote>');
assert(Markdown.render('3. 第三步').startsWith('<ol start="3">'));
assert(Markdown.render('[**参考**](https://example.com/a(b)?x=1&y=2)').includes('<a href="https://example.com/a(b)?x=1&amp;y=2" target="_blank" rel="noopener noreferrer"><strong>参考</strong></a>'));
for(const value of ['javascript:alert(1)','data:text/html,hi','file:///etc/passwd','https://user:pass@example.com/','//example.com','https://'])assert.equal(Markdown.url(value),null,value);
for(const value of ['[点击](javascript:alert(1))','[点击](data:text/html,hi)','[点击](https://user:pass@example.com/)'])assert(!Markdown.render(value).includes('<a '),value);
const hostile='<img src=x onerror=alert(1)>\n<script>alert(1)</script>\n![图片](https://example.com/a.jpg)';
assert(!/<(?:img|script|iframe|video)\b/i.test(Markdown.render(hostile)));
assert(Markdown.render(hostile).includes('&lt;img'));
assert.equal((Markdown.render('[a [b](https://example.com)](https://example.org)').match(/<a /g)||[]).length,1,'links cannot nest');
assert.equal(Markdown.text('**观察**\n- 切入\n> 先看 [资料](https://example.com)'), '观察 切入 先看 资料');
function anchors(text){const chars=Text.cp(text),find=label=>{const start=chars.join('').indexOf(label),a=Text.cp(text.slice(0,start)).length;return{start:a,end:a+Text.cp(label).length};};return[{...find('@队友'),html:'<span data-person="2">@队友</span>'},{...find('0:05'),html:'<button data-seek="5">0:05</button>'}];}
for(const body of ['🥏 **@队友** 在 0:05 接盘\n- 继续跑动','🥏\r\n> **@队友** 在 0:05 接盘','[@队友 0:05](https://example.com)']){
 const html=Markdown.render(body,{anchors:anchors(body)});assert(html.includes('<span data-person="2">@队友</span>'));assert(html.includes('<button data-seek="5">0:05</button>'));assert(!html.includes('<a '),'interactive anchors cannot be nested inside a link');
}
assert(Markdown.render('**@队友** 在 0:05',{anchors:anchors('**@队友** 在 0:05')}).includes('<strong><span data-person="2">@队友</span></strong>'));
assert.equal(Markdown.render('**unfinished'),'<p>**unfinished</p>');
assert.equal(Markdown.render('\\**不加粗**'),'<p>**不加粗**</p>');
assert(Markdown.render('*'.repeat(800)).length<5000,'bounded input produces bounded output');
let source='🥏 @队友 看 0:05\n第二个观察',refs=anchors(source).map(({start,end},i)=>({start,end,id:i}));
for(const kind of ['bold','list','quote','ordered']){
 const change=Editor.edits(source,0,source.length,kind);for(const c of change.changes){refs=Text.replace(source,refs,c.from,c.to,c.text);source=source.slice(0,c.from)+c.text+source.slice(c.to);}
 assert.equal(refs.length,2,kind);assert.equal(Text.cp(source).slice(refs[0].start,refs[0].end).join(''),'@队友',kind);assert.equal(Text.cp(source).slice(refs[1].start,refs[1].end).join(''),'0:05',kind);
}
const ordered=Editor.edits('第一点\n第二点',0,7,'ordered');let raw='第一点\n第二点';for(const c of ordered.changes)raw=raw.slice(0,c.from)+c.text+raw.slice(c.to);assert.equal(raw,'1. 第一点\n2. 第二点');
assert.deepEqual(Editor.edits('**重点**',2,4,'bold').changes,[{from:4,to:6,text:''},{from:0,to:2,text:''}]);
console.log('PASS: lightweight blocks, safe links, HTML/media exclusion, Unicode/CRLF anchors, protected interactive nodes, plain previews and precise formatting edits.');
