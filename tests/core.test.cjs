const {test}=require('node:test');
const assert=require('node:assert/strict');
const core=require('../extension/core.js');
const samples=require('./samples.cjs');
const parent='这个3D世界只有700KB，模型、纹理和音效均由代码生成，Three.js负责渲染。固定角度截图，子Agent只看图不看代码。';
test('normalization and overlap tolerate Chinese punctuation and casing',()=>{
  assert.equal(core.normalize('ＨＴＭＬ   THREE.js'), 'html three.js');
  assert.equal(core.overlap('模型 纹理 Three.js','模型，纹理，THREE.js'),1);
});
test('restatement plus elastic question folds; a question is not an exemption',()=>{
  const r=core.analyze({text:'这个3D世界只有700KB，模型、纹理和音效均由代码生成，这个思路挺有启发的。会不会让Three.js的价值重新被定价？',parent});
  assert.equal(r.fold,true); assert.ok(r.reasons.some(x=>x.includes('问题')));
});
test('missing parent never silently folds based on style or mutual-follow name',()=>{
  const r=core.analyze({text:samples.replies[4][1],displayName:'蓝V互关 Follow back'});
  assert.equal(r.fold,false);assert.equal(r.missingParent,true);
});
test('blue verification and mutual-follow branding alone are insufficient',()=>{
  assert.equal(core.analyze({text:'哪天有空一起试试？',parent,displayName:'蓝V互关'}).fold,false);
});
test('short genuine question and unrelated original argument stay visible',()=>{
  assert.equal(core.analyze({text:'开源地址在哪？',parent}).fold,false);
  assert.equal(core.analyze({text:samples.replies[0][1],parent:samples.parent}).fold,false);
});
test('substantive disagreement and reproducible error are not punished for quoting',()=>{
  assert.equal(core.analyze({text:'模型、纹理和音效均由代码生成，这并不意味着文件更小。这个结论不成立，测过资源总量吗？',parent}).fold,false);
  assert.equal(core.analyze({text:'子Agent只看图不看代码。我这里启动出现 TypeError: renderer.init is not a function，需要改成异步调用才能复现。',parent}).fold,false);
});
test('truncated or media-bearing comments require seeing the whole content',()=>{
  const text=samples.replies[4][1];
  assert.equal(core.analyze({text,parent:samples.parent,truncated:true}).fold,false);
  assert.equal(core.analyze({text,parent:samples.parent,hasMedia:true}).fold,false);
});
test('history uses distinct posts across threads, not repeatedly rendered nodes',()=>{
  const row={id:'2',seenAt:Date.now(),thread:'a',template:true,time:1000};
  assert.equal(core.historySignals([row,row,row],'1').repeated,false);
  const rows=[1,2,3,4].map(i=>({...row,id:String(i+10),thread:String(i)}));
  assert.equal(core.historySignals(rows,'1').repeated,true);
  assert.equal(core.historySignals(rows.map(r=>({...r,seenAt:Date.now()-15*86400000})),'1').repeated,false);
});
test('short enthusiasm and jokes remain visible despite semantic overlap',()=>{
  for(const text of [samples.replies[2][1],samples.replies[7][1],'这个思路不错，回头看看。']){
    assert.equal(core.analyze({text,parent:samples.parent,semantic:{similarity:.95}}).fold,false);
  }
});
test('a repeated account pattern can support a non-question reply',()=>{
  const rows=[1,2,3,4].map(i=>({id:String(i+10),thread:String(i),template:true,seenAt:Date.now(),time:1e9+i*1000000}));
  const r=core.analyze({text:samples.replies[1][1],parent:samples.parent,history:rows,semantic:{similarity:.8}});
  assert.equal(r.fold,true);
});
test('scheduled cadence needs four unique observations',()=>{
  const rows=[0,1,2,3].map(i=>({id:String(i),seenAt:Date.now(),time:1e9+i*36*60000}));
  assert.equal(core.historySignals(rows.slice(0,3),'x').regular,false);
  assert.equal(core.historySignals(rows,'x').regular,true);
  assert.equal(core.historySignals([...rows,{id:'reply',thread:'topic',seenAt:Date.now(),time:1e9+37*60000}],'x').regular,true);
});
test('sensitivity is monotone and paused mode does not fold',()=>{
  for(const [,text] of samples.replies){
    const data={text,parent:samples.parent};
    const a=core.analyze(data,{mode:'collapse',sensitivity:'gentle'}),b=core.analyze(data,{mode:'collapse',sensitivity:'balanced'}),c=core.analyze(data,{mode:'collapse',sensitivity:'strict'});
    assert.ok(!a.fold||b.fold);assert.ok(!b.fold||c.fold);assert.equal(core.analyze(data,{mode:'off'}).fold,false);
  }
});
test('settings only accept documented options',()=>{
  assert.deepEqual(core.sanitizeSettings({mode:'broken',sensitivity:999}),core.DEFAULTS);
});
const accountHistory=()=>[1,2,3,4].map(i=>({id:'past'+i,thread:'topic'+i,template:true,seenAt:Date.now(),time:1e9+i*1000000}));
test('account score needs enough independent history and excludes the current reply',()=>{
  const rows=accountHistory();
  for(const history of [[],rows.slice(0,3),[rows[0],rows[0],rows[0],rows[0]],rows.map(r=>({...r,thread:'same'})),rows.map(r=>({...r,seenAt:Date.now()-15*86400000}))]){
    assert.equal(core.historySignals(history,'current').score,null);
  }
  assert.equal(core.historySignals(rows,rows[0].id).score,null);
  const a=core.historySignals([...rows,{...rows[0],id:'current'}],'current');
  assert.equal(a.replyCount,4);assert.equal(a.threadCount,4);assert.equal(a.score,90);
});
test('history and comment scores are independent, with at most twenty extra points',()=>{
  const data={id:'current',parent:samples.parent,text:samples.replies[1][1]},history=accountHistory();
  const plain=core.analyze(data),weighted=core.analyze({...data,history});
  assert.equal(weighted.commentScore,plain.commentScore);
  assert.equal(weighted.account.score,core.analyze({...data,history,text:'开源地址在哪？'}).account.score);
  assert.ok(weighted.historyAdjustment>0&&weighted.historyAdjustment<=20);
  assert.equal(weighted.score,weighted.commentScore+weighted.historyAdjustment);
  assert.ok(weighted.score<=100);
  assert.deepEqual(weighted,core.analyze({...data,history,displayName:'AI搞钱 蓝V互赞 Follow back'}));
});
test('a high account score cannot override substantive replies, short questions or incomplete context',()=>{
  const history=accountHistory();
  const cases=[
    {text:'开源地址在哪？'},
    {text:'子Agent只看图不看代码。我这里启动出现 TypeError: renderer.init is not a function，需要改成异步调用才能复现。'},
    {text:'模型、纹理和音效均由代码生成，这并不意味着文件更小。这个结论不成立，测过资源总量吗？'},
    {text:samples.replies[4][1],hasMedia:true},
    {text:samples.replies[4][1],truncated:true},
    {text:samples.replies[4][1],parent:''}
  ];
  for(const data of cases){const r=core.analyze({parent,history,semantic:{similarity:.95},...data});assert.equal(r.account.score,90);assert.equal(r.historyAdjustment,0);assert.equal(r.fold,false);}
});
test('ordinary history dilutes the account score, and frequency alone adds nothing',()=>{
  const rows=accountHistory(),before=core.historySignals(rows,'current');
  const after=core.historySignals([...rows,{id:'ordinary',thread:'topic5',template:false,seenAt:Date.now()}],'current');
  assert.ok(after.score<before.score);
  const frequent=core.historySignals(rows.map(r=>({...r,template:false})),'current');
  assert.equal(frequent.regular,true);assert.equal(frequent.score,0);
  assert.equal(core.historySignals(rows.map(r=>({...r,thread:''})),'current').score,null);
});
test('with cleanup disabled, a high content score still requires the template condition',()=>{
  const r=core.analyze({text:'哈哈，模型、纹理和音效均由代码生成，Three.js负责渲染。',parent,semantic:{similarity:.99}},{...core.DEFAULTS,lowInformation:false});
  assert.ok(r.score>=r.threshold);assert.equal(r.eligible,false);assert.equal(r.fold,false);
});
test('reused points plus prospective advice can fold without a question',()=>{
  const r=core.analyze({...samples.adviceCase,semantic:{similarity:.8}});
  assert.equal(r.features.question,false);assert.equal(r.fold,true);
  assert.ok(r.reasons.some(x=>x.includes('建议与担忧')));
  assert.equal(core.analyze({...samples.adviceCase,parent:'今天分享做面包的方法，先和面再发酵。',semantic:{similarity:.8}}).fold,false);
  assert.equal(core.analyze({parent:samples.adviceCase.parent,text:'建议加一轮低配设备测试，记录帧率。',semantic:{similarity:.8}}).fold,false);
});
test('new measured results are kept even when they quote the same advice',()=>{
  const text=samples.adviceCase.text+' 我在集显上实测只有 28fps，关闭阴影后为 51fps。';
  const r=core.analyze({parent:samples.adviceCase.parent,text,semantic:{similarity:.9},history:accountHistory()});
  assert.equal(r.fold,false);assert.equal(r.historyAdjustment,0);
  assert.ok(!r.reasons.some(x=>x.includes('未给出结果')));
});
test('the advice adjustment preserves media and incomplete-content guards',()=>{
  for(const guard of [{hasMedia:true},{truncated:true}])assert.equal(core.analyze({...samples.adviceCase,...guard,semantic:{similarity:.8}}).fold,false);
});
test('new preference samples cover summary, reframing and untried intentions',()=>{
  for(const item of samples.feedbackCase.replies){
    const r=core.analyze({text:item.text,parent:samples.feedbackCase.parent,semantic:{similarity:.8}});
    assert.equal(r.fold,item.expected==='fold',item.href);
  }
});
test('specific new examples stay visible until repeated account history supports filtering',()=>{
  const item=samples.feedbackCase.replies.find(x=>x.expected==='keep');
  const data={text:item.text,parent:samples.feedbackCase.parent,semantic:{similarity:.8}};
  assert.equal(core.analyze(data).newReference,true);
  assert.equal(core.analyze(data).fold,false);
  assert.equal(core.analyze({...data,history:accountHistory()}).fold,true);
});
test('new template signals do not collapse unrelated suggestions or fresh measurements',()=>{
  assert.equal(core.analyze({parent,text:'这个思路挺有启发的。下次试试去海边露营，带上帐篷和炉子，门槛从跟团旅行变成自己安排路线，周末可以多一种放松方式。',semantic:{similarity:.9}}).fold,false);
  const item=samples.feedbackCase.replies.find(x=>x.href.includes('future'));
  assert.equal(core.analyze({parent:samples.feedbackCase.parent,text:item.text+' 我用集显实测只有 23fps，关闭后处理后为 48fps。',semantic:{similarity:.9}}).fold,false);
});
