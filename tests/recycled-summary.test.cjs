const {test}=require('node:test'),assert=require('node:assert/strict'),core=require('../extension/core.js');
const parent='一个月合入2,400个改动，回滚率0.8%。工程师把规则固化为静态检查，自动化测试提供运行结果，人负责最后的评审。';
const summary='一人每月合入2.4千个改动，回滚率0.8%，数字让人印象深刻。效率提升之后，人的价值转向判断哪些改动值得上线，最后还是得靠测试和评审。';
const data={parent,text:summary,semantic:{similarity:.72}};
test('numeric restatements tolerate grouping and Chinese magnitude notation',()=>{
  for(const n of ['2400','2,400','2.4千','0.24万'])assert.equal(core.analyze({...data,text:summary.replace('2.4千',n)}).fold,true,n);
  assert.equal(core.overlap('合入2,400个改动','合入2400个改动'),1);
});
test('two repeated values need topical and semantic evidence, not just matching numbers',()=>{
  for(const change of [{semantic:null},{semantic:{similarity:.5}},{text:summary.replace('0.8%','0.9%')},{parent:'1.准备材料。2.整理笔记。3.分享方法。'},{parent:''}])assert.equal(core.analyze({...data,...change}).fold,false,JSON.stringify(change));
});
test('quoted figures do not erase specific examples, measured results or a concrete question',()=>{
  for(const tail of [' 例如空数组输入会返回 undefined，调用方无法区分失败。',' 我试过这套检查，跨模块循环依赖仍然漏检。',' 我实测回滚处理耗时12秒。',' 实际出现 TypeError: queue.flush is not a function。',' 这不等于所有错误都能检出。',' 0.8%的分母是否包含未合入的改动？'])assert.equal(core.analyze({...data,text:summary+tail}).fold,false,tail);
  for(const guard of [{hasMedia:true},{truncated:true}])assert.equal(core.analyze({...data,...guard}).fold,false);
});
test('short contextual praise and empty conclusions fold without requiring numeric copies',()=>{
  for(const text of ['改动这么多还能压住回滚率，自动化工具得多强。','是的，评审已经成为改动流程的关键。','也是经过大量实践和优化的结果。','自动化测试要做到位。'])assert.equal(core.analyze({parent,text,semantic:{similarity:.65}}).fold,true,text);
});
test('short conclusions with an actionable detail or a reply to a question stay visible',()=>{
  for(const text of ['是的，具体命令是 npm run lint。','自动化测试要做到位，例如空数组的边界。','是的，我试过之后发现循环依赖没被拦住。','评审失败时需要人工审批吗？'])assert.equal(core.analyze({parent,text,semantic:{similarity:.8}}).fold,false,text);
  assert.equal(core.analyze({parent:'可以自动化测试吗？',text:'可以啊'}).fold,false);
});
test('new cleanup respects its opt-out and paused mode',()=>{
  assert.equal(core.analyze(data,{...core.DEFAULTS,lowInformation:false}).fold,false);
  assert.equal(core.analyze(data,{...core.DEFAULTS,mode:'off'}).fold,false);
});
test('a concrete input/output failure survives even near-verbatim numeric summaries',()=>{
  const text='一个月合入2400个改动，回滚率0.8%，数字让人印象深刻。效率提升之后，人的价值转向判断哪些改动值得上线，最后还是得靠测试和评审。';
  assert.equal(core.analyze({parent,text,semantic:{similarity:.9}}).fold,true);
  assert.equal(core.analyze({parent,text:text+' 例如空数组输入会返回 undefined，调用方无法区分失败。',semantic:{similarity:.9}}).fold,false);
});
