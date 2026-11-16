/* Local test harness. Synthetic controls do not operate an X account. */
window.XRF_DEMO_NAMESPACE='xrf.test.'+Date.now()+'.';
const legacyText='这是一条用于检查旧选择的评论。';
localStorage.setItem(window.XRF_DEMO_NAMESPACE+'xrf.authors',JSON.stringify({legacy_keep:'keep',legacy_fold:'fold'}));
localStorage.setItem(window.XRF_DEMO_NAMESPACE+'xrf.decisions',JSON.stringify({'2410':{sig:XReplyFilter.signature(legacyText),action:'keep'},'2412':{sig:XReplyFilter.signature(legacyText),action:'fold'}}));
const worker=new Worker('/extension/semantic-worker.js',{type:'module'}),pending=new Map();let seq=0;
window.XRF_DEMO_SEMANTIC=(parent,text)=>new Promise((resolve,reject)=>{const id=++seq,timer=setTimeout(()=>{pending.delete(id);reject(Error('Model timeout'));},60000);pending.set(id,{resolve,reject,timer});worker.postMessage({id,parent,text});});
worker.onmessage=({data})=>{const entry=pending.get(data.id);if(entry){clearTimeout(entry.timer);entry.resolve(data.result);pending.delete(data.id);}};
worker.onerror=e=>{document.getElementById('test-status').textContent='模型加载失败：'+e.message;for(const entry of pending.values()){clearTimeout(entry.timer);entry.reject(Error(e.message));}pending.clear();};
const timeline=document.getElementById('timeline'),status=document.getElementById('test-status');
let samples;
function article(id,handle,text){
  const a=document.createElement('article');a.dataset.testid='tweet';a.dataset.fixtureId=id;a.setAttribute('role','article');
  a.addEventListener('click',()=>{a.dataset.navigationLeak='true';},true);
  const inner=document.createElement('div'),name=document.createElement('div');name.dataset.testid='User-Name';
  const author=document.createElement('a');author.href='/'+handle;author.textContent=handle;
  const link=document.createElement('a');link.href='/'+handle+'/status/'+id;link.setAttribute('role','link');link.tabIndex=0;
  const time=document.createElement('time');time.dateTime=new Date(1794816000000+Number(id)*1000).toISOString();time.textContent='示例';link.append(time);name.append(author,link);
  const body=document.createElement('div');body.dataset.testid='tweetText';body.textContent=text;inner.append(name,body);a.append(inner);return a;
}
function populate(){
  history.replaceState({},'', '/demo/status/1000');
  timeline.replaceChildren();
  const root=article('1000','demo',samples.parent);root.dataset.fixtureRoot='true';timeline.append(root);
  samples.replies.forEach(([name,text],i)=>timeline.append(article(String(1100+i),name.replace(/[^\w]/g,'')||'sample'+i,text)));
}
document.getElementById('reset').onclick=()=>location.reload();
document.getElementById('add').onclick=()=>timeline.append(article(String(2000+seq),'new_reply',samples.replies[4][1]));
const pause=ms=>new Promise(r=>setTimeout(r,ms));
async function until(fn,timeout=60000){const end=Date.now()+timeout;while(Date.now()<end){if(fn())return;await pause(100);}throw Error('等待超时');}
const get=id=>document.querySelector('[data-fixture-id="'+id+'"]');
const folded=id=>Boolean(get(id)?.classList.contains('xrf-folded'));
const bar=id=>get(id)?.querySelector('[data-xrf-owned]')?.shadowRoot;
const press=(id,text)=>{const b=Array.from(bar(id)?.querySelectorAll('button')||[]).find(x=>x.textContent===text);if(!b)throw Error('找不到按钮 '+text);b.click();};
function settings(){return document.getElementById('xrf-controls').shadowRoot;}
function change(label,value){const el=settings().querySelector('[aria-label="'+label+'"]');el.value=value;el.dispatchEvent(new Event('change'));}
async function run(){
  const runButton=document.getElementById('run');runButton.disabled=true;const output=document.getElementById('results');output.replaceChildren();
  const results=[];
  async function test(name,fn){try{await fn();results.push({name,pass:true});}catch(e){results.push({name,pass:false,error:e.message});}const p=document.createElement('p'),r=results.at(-1);p.textContent=(r.pass?'通过：':'失败：')+name+(r.error?' — '+r.error:'');p.className=r.pass?'pass':'fail';output.append(p);}
  await test('真实本地模型与保守自动折叠',async()=>{await until(()=>folded('1104'));if(folded('1000')||folded('1100')||folded('1102')||folded('1107'))throw Error('原帖、独立观点、笑话或短附和被隐藏');});
  await test('正常评论没有评分、入口或附加布局',async()=>{for(const id of ['1100','1102','1107'])if(bar(id)||get(id).hasAttribute('data-xrf-managed'))throw Error('正常评论仍有附加界面');});
  await test('宿主页重写样式时折叠和布局仍然保留',async()=>{
    get('1104').className='host-rerender';get('1100').className='host-rerender';
    if(!get('1104').hasAttribute('data-xrf-folded')||bar('1100'))throw Error('折叠状态丢失或正常评论被插入界面');
    await until(()=>folded('1104')&&get('1104').classList.contains('xrf-managed'));
  });
  await test('折叠细栏只有展开按钮，不生成评分或理由',async()=>{const ui=bar('1104'),strip=ui.querySelector('.bar');const visible=[...ui.querySelectorAll('button')].filter(b=>b.getClientRects().length);if(visible.length!==1||visible[0].textContent!=='展开')throw Error('细栏出现了多余按钮');if(ui.querySelector('details,.score-summary')||strip.getBoundingClientRect().height>36)throw Error('仍生成理由或细栏过高');});
  await test('展开后保持展开',async()=>{press('1104','展开');await until(()=>!folded('1104'));get('1105').querySelector('[data-testid="tweetText"]').append(' ');await pause(500);if(folded('1104'))throw Error('展开被覆盖');});
  await test('展开后只恢复原文，不出现第二套工具栏',async()=>{if(bar('1104')||get('1104').hasAttribute('data-xrf-managed'))throw Error('展开后仍残留插件界面');if(getComputedStyle(get('1104').firstElementChild).display==='none')throw Error('原文仍被隐藏');});
  await test('动态加载的新评论被检查',async()=>{timeline.append(article('2100','fresh',samples.replies[4][1]));await until(()=>folded('2100'));});
  await test('节点复用不把旧结论贴到新内容',async()=>{const old=get('2100'),fresh=article('2101','different','这是在哪里下载的？');old.replaceChildren(...fresh.childNodes);old.dataset.fixtureId='2101';await until(()=>!folded('2101'));if(bar('2101')?.textContent.includes('已折叠'))throw Error('旧标签残留');});
  await test('自己的回复保持可见',async()=>{timeline.append(article('2200','self',samples.replies[4][1]));await pause(600);if(folded('2200')||bar('2200'))throw Error('处理了自己的回复');});
  await test('图片评论不根据文字强行折叠',async()=>{const a=article('2300','photo',samples.replies[4][1]),m=document.createElement('div');m.dataset.testid='tweetPhoto';m.textContent='附图测试';a.firstElementChild.append(m);timeline.append(a);await pause(600);if(folded('2300'))throw Error('图片回复被自动隐藏');});
  await test('原帖滚出页面后仍保留上下文',async()=>{get('1000').remove();timeline.append(article('2400','scrolled',samples.replies[4][1]));await until(()=>folded('2400'));});
  await test('暂停恢复所有折叠内容',async()=>{change('处理方式','off');await until(()=>document.querySelectorAll('.xrf-folded').length===0);});
  await test('恢复自动过滤',async()=>{change('处理方式','collapse');await until(()=>folded('2400'));});
  await test('旧的手动选择继续生效，单条选择优先于账号规则',async()=>{
    for(const [id,handle] of [['2410','legacy_fold'],['2411','legacy_fold'],['2412','legacy_keep'],['2413','legacy_keep']])timeline.append(article(id,handle,legacyText));
    await until(()=>folded('2411')&&folded('2412'));
    if(folded('2410')||folded('2413')||bar('2410')||bar('2413'))throw Error('旧的保留选择未生效');
    const saved=JSON.parse(localStorage.getItem(window.XRF_DEMO_NAMESPACE+'xrf.decisions'));if(saved['2410']?.action!=='keep'||saved['2412']?.action!=='fold')throw Error('旧选择被改写');
  });
  await test('仅后台评分时不插入评论控件',async()=>{change('处理方式','mark');await until(()=>document.querySelectorAll('article[data-testid="tweet"] [data-xrf-owned]').length===0);});
  await test('重新开启自动折叠后旧规则仍生效',async()=>{change('处理方式','collapse');await until(()=>folded('2411')&&folded('2412'));});
  await test('切换新帖不沿用旧原帖',async()=>{history.pushState({},'', '/other/status/9000');await until(()=>document.querySelectorAll('.xrf-folded').length===0);if(!settings().textContent.includes('等待原帖'))throw Error('缺上下文状态不正确');});
  await test('新原帖到达后重新判断',async()=>{const root=article('9000','other','今天讨论烘焙：面团需要冷藏发酵，烤箱必须提前预热。');root.dataset.fixtureRoot='true';timeline.prepend(root);timeline.append(article('9100','cook','这个方法很干净：面团需要冷藏发酵，烤箱必须提前预热。会不会让家庭烘焙的价值重新被定价？'));await until(()=>folded('9100'));});
  await test('没有误折叠页面侧栏或嵌套引用',async()=>{const outer=article('9200','outer','这篇文章的案例在这里。'),quote=article('9300','quoted',samples.replies[4][1]);outer.firstElementChild.append(quote);timeline.append(outer);await pause(600);if(bar('9300'))throw Error('嵌套引用被当成独立评论');});
  await test('主页观察能积累不同原帖的账号规律',async()=>{
    history.pushState({},'', '/pattern/with_replies');timeline.replaceChildren();
    for(let i=0;i<4;i++){timeline.append(article(String(10000+i*100),'source'+i,samples.parent));timeline.append(article(String(10001+i*100),'pattern',samples.replies[1][1]));}
    await until(()=>{const stored=JSON.parse(localStorage.getItem(window.XRF_DEMO_NAMESPACE+'xrf.history')||'{}');return stored.pattern?.length===4&&new Set(stored.pattern.map(x=>x.thread)).size===4;});
    if(document.querySelectorAll('.xrf-folded').length)throw Error('主页上不应自动折叠帖子');
  });
  await test('账号跨帖套路能辅助折叠无问号的模板回复',async()=>{
    history.pushState({},'', '/demo/status/12000');timeline.replaceChildren(article('12000','demo',samples.parent),article('12100','pattern',samples.replies[1][1]));await until(()=>folded('12100'));
  });
  await test('历史更新后已展开的评论和普通短问题都保持干净',async()=>{
    press('12100','展开');await until(()=>!folded('12100'));
    timeline.append(article('12101','pattern','源码在哪？'));
    await until(()=>JSON.parse(localStorage.getItem(window.XRF_DEMO_NAMESPACE+'xrf.history')||'{}').pattern?.some(r=>r.id==='12101'));
    if(folded('12100')||bar('12100')||folded('12101')||bar('12101'))throw Error('展开状态丢失或短问题出现附加界面');
  });
  await test('操作按钮不会触发原网页的捕获阶段导航',async()=>{
    timeline.append(article('12102','pattern',samples.replies[1][1]));await until(()=>folded('12102'));
    press('12102','展开');await until(()=>!folded('12102'));
    if(get('12102').dataset.navigationLeak)throw Error('按钮事件泄露给了原页面');
  });
  await test('合成建议评论可按多处复述折叠，有实测数据的版本保留',async()=>{
    history.pushState({},'', '/demo/status/13000');timeline.replaceChildren(article('13000','demo',samples.adviceCase.parent),article('13100','advice_sample',samples.adviceCase.text),article('13101','measured_sample',samples.adviceCase.text+' 我在集显上实测只有 28fps，关闭阴影后为 51fps。'));
    await until(()=>folded('13100'));
    if(folded('13101')||bar('13101'))throw Error('实测数据被折叠或附加了界面');
  });
  await test('细栏显示作者，展开后不残留控件',async()=>{
    if(!bar('13100').querySelector('.label')?.textContent.includes('@advice_sample'))throw Error('折叠后无法辨认作者');
    press('13100','展开');await until(()=>!folded('13100'));
    if(bar('13100'))throw Error('展开后残留控件');
  });
  await test('合成对照样例自动折叠，保留的新例子不显示评分',async()=>{
    history.pushState({},'', '/demo/status/14000');timeline.replaceChildren(article('14000','demo',samples.feedbackCase.parent));
    samples.feedbackCase.replies.forEach((r,i)=>timeline.append(article(String(14100+i),'feedback'+i,r.text)));
    await until(()=>settings().textContent.includes('当前已检查 5 条')&&samples.feedbackCase.replies.every((r,i)=>folded(String(14100+i))===(r.expected==='fold')));
    for(let i=0;i<samples.feedbackCase.replies.length;i++){const ui=bar(String(14100+i));if(ui?.querySelector('details,.score-summary')||(samples.feedbackCase.replies[i].expected==='keep'&&ui))throw Error('仍显示评分或正常评论附加界面');}
  });
  const summary={passed:results.filter(r=>r.pass).length,total:results.length,results};window.XRF_TEST_RESULTS=summary;status.textContent=`交互检查 ${summary.passed}/${summary.total} 通过。`;runButton.disabled=false;
  const pre=document.createElement('pre');pre.id='test-json';pre.hidden=true;pre.textContent=JSON.stringify(summary);output.append(pre);
}
document.getElementById('run').onclick=run;
fetch('/samples.json').then(r=>r.json()).then(data=>{samples=data;populate();status.textContent='已加载合成示例。命中的评论会自动折叠，点「展开」恢复原文。';}).catch(e=>{status.textContent='示例加载失败：'+e.message;});
