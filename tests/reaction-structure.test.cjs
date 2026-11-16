const {test}=require('node:test'),assert=require('node:assert/strict'),core=require('../extension/core.js');
const parent='今天分享一个开源视频工具，支持批量生成和自定义风格，完整文档已经公布。';
test('empty reactions tolerate deictics, addresses, interjections and particles',()=>{
  for(const text of ['这个可以有','这可以有啊','太强了兄弟','谢谢分享呀大佬','我靠，正好需要','那我真得期待了','老师，这个不错啊'])assert.equal(core.analyze({parent,text}).fold,true,text);
});
test('generic publication excitement folds without hardcoding a complete sentence',()=>{
  for(const text of ['终于放出来机密了','总算公开了','可算等到完整版了','终于把答案公布了','终于开源啦'])assert.equal(core.analyze({parent,text}).fold,true,text);
});
test('the same openings with an actual contribution remain visible',()=>{
  for(const text of ['这个可以有，但我试过导出后字幕丢了。','终于公布了 A库 v2，新加了多轨道时间轴。','太强了兄弟，我把配置文件发到 issue 里了。','我靠，正好需要一个离线可用的识别工具，这个离线能跑吗？','那我真得期待了，旧版复现了 UnicodeDecodeError。','终于公布的规范把最小字号改为14px。'])assert.equal(core.analyze({parent,text,semantic:{similarity:.85}}).fold,false,text);
});
test('question answers and the cleanup opt-out still work',()=>{
  assert.equal(core.analyze({parent:'这个版本可以批量处理吗？',text:'可以啊'}).fold,false);
  assert.equal(core.analyze({parent,text:'这个可以有'},{...core.DEFAULTS,lowInformation:false}).fold,false);
  for(const guard of [{hasMedia:true},{truncated:true}])assert.equal(core.analyze({parent,text:'终于公开了',...guard}).fold,false);
});
