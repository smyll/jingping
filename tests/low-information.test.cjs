const {test}=require('node:test'),assert=require('node:assert/strict'),core=require('../extension/core.js');
const parent='这份界面设计规范给出了字号、留白、颜色和组件要求。默认字号是16px。通过限制花哨装饰保持视觉一致，团队可以参考这些规则设计自己的界面。';
test('empty acknowledgments fold, including short replies',()=>{
  for(const text of ['谢谢分享','原来如此，谢谢整理。','收藏了，慢慢看。','太强了','学到了','厉害！']){
    const r=core.analyze({parent,text});assert.equal(r.fold,true,text);assert.ok(r.lowInformation);
  }
});
test('contextual praise and abstract advice fold without claiming AI authorship',()=>{
  for(const text of ['有这套界面设计规范，照着抄省不少事。','规范要求这么详细，界面自然显得高级。','规范需要结合具体内容与可用性考虑。','规范可以抄，真正难的是让团队形成执行习惯。'])assert.equal(core.analyze({parent,text}).fold,true,text);
});
test('specific observations, source questions, corrections and meaningful jokes remain',()=>{
  for(const text of ['我用14px做列表，手机上看比小字号清楚。','有官方出处吗？','这并不是官方文档，原作者已经澄清过。','我在手机上点按钮没反应，电脑端正常。','几百行代码把显卡叫醒了，风扇先开始演奏。','这个设置改为 false 后就正常了。','规范需要结合具体需求，例如阅读障碍用户对文字背景的要求。'])assert.equal(core.analyze({parent,text,semantic:{similarity:.8}}).fold,false,text);
});
test('cleanup is optional and preserves media, incomplete context and paused mode',()=>{
  const data={parent,text:'谢谢分享'};
  assert.equal(core.analyze(data,{...core.DEFAULTS,lowInformation:false}).fold,false);
  for(const change of [{parent:''},{hasMedia:true},{truncated:true}])assert.equal(core.analyze({...data,...change}).fold,false);
  assert.equal(core.analyze(data,{...core.DEFAULTS,mode:'off'}).fold,false);
  assert.equal(core.sanitizeSettings({semantic:false}).lowInformation,true);
  assert.equal(core.sanitizeSettings({lowInformation:false}).lowInformation,false);
});
