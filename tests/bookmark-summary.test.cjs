const {test}=require('node:test'),assert=require('node:assert/strict'),core=require('../extension/core.js'),samples=require('./samples.cjs');
const text='建筑、材质和音乐通过代码生成，不需要另外下载素材。文件保存生成规则，显卡在打开页面时生成画面。固定机位截图，检查透视、遮挡和灯光问题，收藏了慢慢消化。';
test('a multi-point restatement followed by a bookmarking intention can fold',()=>{
  assert.equal(core.analyze({parent:samples.parent,text,semantic:{similarity:.8}}).fold,true);
  assert.equal(core.analyze({parent:samples.parent,text:'收藏了，慢慢看。',semantic:{similarity:.9}}).fold,false);
  assert.equal(core.analyze({parent:samples.parent,text:'昨天去海边骑车，傍晚的风把白天的闷热都吹散了，路边小店的老板还送了我们一瓶水。收藏这份旅行路线，回头慢慢研究。',semantic:{similarity:.9}}).fold,false);
  assert.equal(core.analyze({parent:samples.parent,text:text+' 我在集显上实测只有 28fps，关掉阴影后是 51fps。',semantic:{similarity:.9}}).fold,false);
});
