const {test}=require('node:test'),assert=require('node:assert/strict'),core=require('../extension/core.js');
const parent='一个小工具写了 3600 行 Python 直接调用 Blender API，生成桥梁的构件并渲染画面。另一个工具用 58 万笔绘制了一幅山水，落笔、调色和画面检查都由程序完成。还有做灯光试验、场景对比和材质修改的示例。';
const text='3600 行 Python 直接调用 Blender API 的桥有意思，输出代码可以做版本对比、换几个参数再执行，不用每次推翻整套设计。58 万笔那幅是直接画完的，还是让程序看了几轮渲染结果再修改参数？';
test('multiple reused quantities support a long restatement question when semantics agree',()=>{
  assert.equal(core.analyze({parent,text,semantic:{similarity:.68}}).fold,true);
  assert.equal(core.analyze({parent,text,semantic:{similarity:.64}}).fold,false);
  assert.equal(core.analyze({parent,text:text.replace('58 万笔','那幅风景'),semantic:{similarity:.68}}).fold,false);
  assert.equal(core.analyze({parent:parent.replace('58 万笔','158 万笔'),text,semantic:{similarity:.68}}).fold,false);
});
test('reused quantities do not override new measurements, missing context or media',()=>{
  const data={parent,text,semantic:{similarity:.68}};
  for(const change of [{text:text+' 实测修改后是 26fps，关掉阴影是 43fps。'},{hasMedia:true},{truncated:true},{parent:''}])assert.equal(core.analyze({...data,...change}).fold,false);
});
