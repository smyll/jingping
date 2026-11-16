const {test}=require('node:test'),assert=require('node:assert/strict'),core=require('../extension/core.js'),samples=require('./samples.cjs');
const base=samples.replies[4][1];
const analyze=(ending,parent=samples.parent)=>core.analyze({text:base+' '+ending,parent,semantic:{similarity:.85}});

test('reported measurements protect time, memory and cost results, not only frame rates',()=>{
  for(const text of [
    '我在旧笔记本上实测，首次打开用了 18 秒，内存占用从 600MB 涨到了 1.2GB。',
    '我拿自己的两个项目跑了一遍，每次调用花了 0.18 元，之前同样输入要 0.52 元。',
    '连续测试了五次，下载耗时 1.3s，显存占用 2.4 GiB。',
    '实测首帧延迟是 780 毫秒，连续五次都在这个范围。',
    '我实测命中率 82%，比上周高了一些。'
  ])assert.equal(analyze(text).fold,false,text);
});

test('hypothetical measurement targets do not make template replies concrete',()=>{
  for(const text of [
    '如果以后能跑到 60fps，会不会让这种方案成为主流？',
    '预计能做到 20ms，这个方向是不是值得继续试试？',
    '有没有人实测过 60fps？',
    '实测能到 60fps 吗？',
    '建议测试能不能跑到 60fps，是否值得期待？',
    '建议复测 60fps，是否值得期待？',
    '我还没实测过 60fps，会不会带来新的机会？',
    '我实测过这类工具，预计以后能压到 20ms，会不会更好用？'
  ])assert.equal(analyze(text).fold,true,text);
});

test('reported source numbers are not treated as the commenters own result',()=>{
  assert.equal(analyze('原帖写的是 60fps，作者说实测能到 120fps，会不会影响本地显卡的价值？').fold,true);
  assert.equal(analyze('实测 60 fps。',samples.parent+' 实测 60fps。').fold,true);
});

test('a real measurement followed by a question or target remains useful',()=>{
  for(const text of [
    '我这边实测只有 27fps，怎么优化？',
    '我实测加载用了 18 秒，希望以后能压到 5 秒。',
    '原帖给了 60fps。我实测只有 27fps。',
    '原帖说运行用了 18 秒，但我实测用了 27 秒。'
  ])assert.equal(analyze(text).fold,false,text);
});
