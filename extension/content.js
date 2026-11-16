/* SPDX-License-Identifier: MIT */
(() => {
  'use strict';
  if (globalThis.__xrfRunning || !globalThis.XReplyFilter) return;
  globalThis.__xrfRunning = true;
  const core = globalThis.XReplyFilter;
  const controlActions=new WeakMap();
  const controlPath=event=>event.composedPath().some(n=>n?.nodeType===1&&n.hasAttribute?.('data-xrf-owned'));
  // X delegates article navigation above the shadow host; intercept before its React root.
  document.addEventListener('click',event=>{
    if(!controlPath(event))return;
    event.stopImmediatePropagation();
    const target=event.composedPath().find(n=>controlActions.has(n));
    if(target){event.preventDefault();controlActions.get(target)(event);}
  },true);
  for(const type of ['pointerdown','pointerup','mousedown','mouseup','keydown','keyup'])document.addEventListener(type,event=>{if(controlPath(event))event.stopImmediatePropagation();},true);
  const api = globalThis.browser || globalThis.chrome;
  const demo = ['localhost', '127.0.0.1'].includes(location.hostname);
  const demoKey = key => (globalThis.XRF_DEMO_NAMESPACE || 'xrf.demo.') + key;
  const storage = api?.storage?.local || (demo ? {
    async get(keys) { const out = {}; for (const key of keys) out[key] = JSON.parse(localStorage.getItem(demoKey(key)) || 'null'); return out; },
    async set(values) { for (const [key, value] of Object.entries(values)) localStorage.setItem(demoKey(key), JSON.stringify(value)); }
  } : null);
  if (!storage) return;
  const keys = { settings: 'xrf.settings', decisions: 'xrf.decisions', authors: 'xrf.authors', history: 'xrf.history' };
  let settings = { ...core.DEFAULTS }, decisions = {}, authors = {}, history = {};
  let ready = false, error = '', routeKey = '', rootText = '', rootHandle = '', excluded = new Set();
  let timer, historyTimer, historyBusy = false, foldedCount = 0, evaluatedCount = 0;
  const pendingHistory = new Map(), elements = new Map(), expanded = new Set();
  const semanticCache = new Map(), semanticQueue = new Map();
  let semanticBusy=false, semanticFailed=false;
  const ARTICLE = 'article[data-testid="tweet"]';
  const STYLE = `
    :host{font-family:Geist,"Microsoft YaHei",system-ui,sans-serif;color:var(--xrf-fg,#303b43);font-size:14px;line-height:20px;color-scheme:light dark;--xrf-line:#dce5e5;--xrf-soft:#f3f7f6;--xrf-accent:#176b61}
    *{box-sizing:border-box}button,select{font:inherit;cursor:pointer}
    button{border:1px solid var(--xrf-line);border-radius:8px;padding:4px 8px;background:var(--xrf-bg,#fff);color:inherit;font-weight:600;min-height:32px}
    button:hover{background:var(--xrf-hover,#edf4f5)}button:active{transform:scale(.98)}
    button:focus-visible,select:focus-visible{outline:2px solid #008276;outline-offset:2px}
    .row{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.bar{padding:4px 12px}.bar.is-folded{padding:0 8px;background:var(--xrf-soft);border:0;border-radius:4px;margin:0;flex-wrap:nowrap}.muted{color:var(--xrf-muted,#596771)}
    .bar.is-folded .label{display:block;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.bar.is-folded>button{flex-shrink:0;border:0;background:transparent;font-size:12px;line-height:16px;color:var(--xrf-accent)}.bar.is-folded>button:hover{background:var(--xrf-hover,#edf4f5)}
    .label{flex:1;min-width:96px}.label small{font-size:12px;line-height:16px}.note{font-size:12px;line-height:16px;margin:8px 0;text-wrap:pretty}
    .launcher{background:#176b61;color:#fff;border-color:#176b61;padding:8px 12px;font-size:14px;line-height:20px;box-shadow:0 2px 12px #0002}
    .panel{width:min(320px,calc(100vw - 32px));max-height:70vh;overflow:auto;background:var(--xrf-bg,#fff);border:1px solid #aeb8c0;border-radius:12px;padding:16px;margin-bottom:8px;box-shadow:0 4px 24px #0002}
    h2{font-size:18px;line-height:28px;margin:0 0 12px;font-weight:600}label{display:grid;gap:4px;margin:12px 0}select{width:100%;padding:8px;border:1px solid #aeb8c0;border-radius:8px;background:var(--xrf-bg,#fff);color:inherit}
    .error{color:#bd3c2d}a{color:inherit} [hidden]{display:none!important}
    @media(prefers-color-scheme:dark){:host{--xrf-fg:#e4e9ed;--xrf-bg:#181818;--xrf-hover:#272727;--xrf-muted:#aeb8c0;--xrf-line:#414c4b;--xrf-soft:#272727;--xrf-accent:#90c7b9}}
  `;
  function node(tag, text, cls) { const n = document.createElement(tag); if (text) n.textContent = text; if (cls) n.className = cls; return n; }
  function button(text, action) { const b = node('button', text); b.type = 'button'; controlActions.set(b,action); return b; }
  function shadow(host) {
    host.dataset.xrfOwned = 'true';
    const root = host.attachShadow({ mode: 'open' });
    root.append(node('style', STYLE));
    host.addEventListener('click', e => e.stopPropagation());
    host.addEventListener('keydown', e => e.stopPropagation());
    return root;
  }
  const launcherHost = node('div');
  launcherHost.id = 'xrf-controls';
  launcherHost.style.cssText = 'position:fixed;right:16px;bottom:24px;z-index:2147483000;width:auto;max-width:calc(100vw - 32px)';
  const launcherRoot = shadow(launcherHost), panel = node('section', '', 'panel');
  panel.hidden = true;
  const title = node('h2', '净评'), status = node('p', '', 'note muted'), errors = node('p', '', 'note error');
  errors.setAttribute('role', 'status');
  function select(label, options, field) {
    const wrap = node('label', label), input = node('select');
    input.setAttribute('aria-label', label);
    for (const [value,text] of options) { const o = node('option',text); o.value=value; input.append(o); }
    input.addEventListener('change', () => save(keys.settings, { ...settings, [field]: input.value }));
    wrap.append(input); panel.append(wrap); return input;
  }
  panel.append(title);
  const modeInput = select('处理方式', [['collapse','自动折叠'],['mark','仅后台评分'],['off','暂停过滤']], 'mode');
  const sensitivityInput = select('过滤力度', [['gentle','温和'],['balanced','标准'],['strict','较强']], 'sensitivity');
  const semanticWrap=node('label','本地中文语义辅助'),semanticInput=node('input');semanticInput.type='checkbox';semanticInput.setAttribute('aria-label','本地中文语义辅助');
  semanticInput.addEventListener('change',()=>save(keys.settings,{...settings,semantic:semanticInput.checked}));semanticWrap.append(semanticInput);
    panel.append(semanticWrap,status, node('p','重点过滤多处复述后的附和、总结、追问与试用意向，结合账号历史判断。具体新例子优先保留。模型在本机计算。','note muted'), errors);
  const accountList = node('div'); panel.append(accountList);
  const toggle = button('净评', () => { panel.hidden = !panel.hidden; toggle.setAttribute('aria-expanded', String(!panel.hidden)); });
  toggle.className = 'launcher'; toggle.setAttribute('aria-expanded','false'); toggle.setAttribute('aria-label','打开净评设置');
  launcherRoot.append(panel, toggle); if(demo)document.body.append(launcherHost);
  async function save(key, value) {
    try { await storage.set({ [key]:value }); applyStored({ [key]:value }); error = ''; }
    catch { error = '设置未能保存。请刷新页面后重试。'; }
    schedule();
  }
  function applyStored(data) {
    if (keys.settings in data) settings = core.sanitizeSettings(data[keys.settings]);
    if (keys.decisions in data) decisions = data[keys.decisions] && typeof data[keys.decisions] === 'object' ? data[keys.decisions] : {};
    if (keys.authors in data) authors = data[keys.authors] && typeof data[keys.authors] === 'object' ? data[keys.authors] : {};
    if (keys.history in data) history = data[keys.history] && typeof data[keys.history] === 'object' ? data[keys.history] : {};
  }
  function refreshPanel() {
    modeInput.value = settings.mode; sensitivityInput.value = settings.sensitivity;semanticInput.checked=settings.semantic;
    toggle.textContent = settings.mode === 'off' ? '净评 · 已暂停' : `净评 · 已折叠 ${foldedCount}`;
    status.textContent = !routeKey ? '进入帖子详情页后过滤评论。' : !rootText ? '等待原帖正文，暂不自动折叠。' : `当前已检查 ${evaluatedCount} 条，折叠 ${foldedCount} 条。${semanticBusy?' 本地语义计算中…':semanticFailed?' 语义辅助不可用，正在使用规则。':settings.semantic?' 中文语义辅助已开启。':' 仅使用规则。'}`;
    errors.textContent = error;
    accountList.replaceChildren();
    const rules = Object.entries(authors).filter(([,v]) => ['fold','keep'].includes(v));
    if (rules.length) accountList.append(node('p','你指定的账号规则','note'));
    for (const [handle,action] of rules) {
      const row = node('div','','row'); row.append(node('span',`@${handle} · ${action === 'fold' ? '折叠' : '保留'}`,'label'));
      row.append(button('恢复自动', () => save(keys.authors, { ...authors, [handle]:'auto' }))); accountList.append(row);
    }
  }
  function primaryNodes(article, selector) {
    return Array.from(article.querySelectorAll(selector)).filter(n => n.closest(ARTICLE) === article && !n.closest('div[role="link"][tabindex]'));
  }
  function read(article, currentRoot) {
    const times = primaryNodes(article,'time').map(n=>({ n, match:n.closest('a')?.getAttribute('href')?.match(/^\/([\w]+)\/status\/(\d+)(?:\?.*)?$/) })).filter(x=>x.match);
    const chosen = times.find(x=>x.match[2]===currentRoot) || times[0];
    if (!chosen) return null;
    const rich = article.querySelector('[data-testid="twitterArticleRichTextView"]');
    const text = rich?.innerText || primaryNodes(article,'[data-testid="tweetText"]').map(n=>n.innerText).join('\n');
    const name = primaryNodes(article,'[data-testid="User-Name"]')[0]?.innerText || '';
    const truncated = primaryNodes(article,'[data-testid="tweet-text-show-more-link"]').length > 0;
    const hasMedia = primaryNodes(article,'[data-testid="tweetPhoto"], [data-testid="videoPlayer"]').length > 0;
    const time = Date.parse(chosen.n.getAttribute('datetime'));
    return { id:chosen.match[2], handle:chosen.match[1].toLowerCase(), text:text.slice(0,40000), displayName:name, time:Number.isFinite(time)?time:null, truncated, hasMedia };
  }
  function ownHandle() {
    const profile = document.querySelector('a[data-testid="AppTabBar_Profile_Link"]');
    if (profile) return profile.getAttribute('href')?.split('/')[1]?.toLowerCase();
    const editor = document.querySelector('[data-testid="tweetTextarea_0"]');
    let parent = editor?.parentElement;
    for (let i=0; parent && i<6; i++,parent=parent.parentElement) {
      const avatar = parent.querySelector('[data-testid^="UserAvatar-Container-"]');
      if (avatar) return avatar.dataset.testid.slice('UserAvatar-Container-'.length).toLowerCase();
    }
    return '';
  }
  function record(item, thread) {
    if (!item.handle || !item.id || !item.text || item.truncated) return;
    const sig=core.signature(item.text), rows=Array.isArray(history[item.handle])?history[item.handle]:[], f=core.features(item.text);
    if (rows.some(r=>r.id===item.id && r.sig===sig && r.template===f.template && r.shape===f.shape)) return;
    const row={id:item.id,sig,thread,time:item.time,seenAt:Date.now(),template:f.template,shape:f.shape};
    history={...history,[item.handle]:[...rows.filter(r=>r.id!==item.id),row].slice(-16)};
    if (!pendingHistory.has(item.handle)) pendingHistory.set(item.handle,new Map());
    pendingHistory.get(item.handle).set(item.id,row);
    clearTimeout(historyTimer); historyTimer=setTimeout(flushHistory,1200);
  }
  async function flushHistory() {
    if (historyBusy || !pendingHistory.size) return;
    historyBusy=true;
    const pending=new Map(pendingHistory); pendingHistory.clear();
    try {
      const stored=(await storage.get([keys.history]))[keys.history] || {};
      for (const [handle,rows] of pending) {
        const merged=new Map((Array.isArray(stored[handle])?stored[handle]:[]).map(r=>[r.id,r]));
        for(const [id,row] of rows) merged.set(id,row);
        stored[handle]=[...merged.values()].filter(r=>Date.now()-r.seenAt<14*86400000).sort((a,b)=>a.seenAt-b.seenAt).slice(-16);
      }
      const bounded=Object.fromEntries(Object.entries(stored).filter(([,v])=>Array.isArray(v)&&v.length).sort((a,b)=>b[1].at(-1).seenAt-a[1].at(-1).seenAt).slice(0,200));
      await storage.set({[keys.history]:bounded});
    } catch { error='账号规律暂时无法保存，当前页面仍可过滤。'; refreshPanel(); }
    finally { historyBusy=false; if(pendingHistory.size) historyTimer=setTimeout(flushHistory,1200); }
  }
  function restore(article, removeBar=true) {
    if(article.classList.contains('xrf-folded')||article.classList.contains('xrf-managed'))article.classList.remove('xrf-folded','xrf-managed');
    article.removeAttribute('data-xrf-managed');article.removeAttribute('data-xrf-folded');
    if(removeBar) { elements.get(article)?.host.remove(); elements.delete(article); }
  }
  function semanticFor(item,parent){
    if(!settings.semantic||item.hasMedia||item.truncated||item.text.length<15)return null;
    const key=core.signature(parent)+'/'+core.signature(item.text);
    if(semanticCache.has(key))return semanticCache.get(key);
    if(!semanticQueue.has(key))semanticQueue.set(key,{parent,text:item.text.slice(0,5000)});
    pumpSemantic();return null;
  }
  async function pumpSemantic(){
    if(semanticBusy||!semanticQueue.size||settings.mode==='off'||(!demo&&document.hidden))return;
    semanticBusy=true;
    const [key,item]=semanticQueue.entries().next().value;semanticQueue.delete(key);
    try{
      const result=demo?await globalThis.XRF_DEMO_SEMANTIC(item.parent,item.text):await api.runtime.sendMessage({target:'xrf.semantic',...item});
      semanticFailed=Boolean(result?.error);semanticCache.set(key,result?.error?null:result);
    }catch{semanticFailed=true;semanticCache.set(key,null);}
    finally{semanticBusy=false;while(semanticCache.size>300)semanticCache.delete(semanticCache.keys().next().value);schedule();if(semanticQueue.size)setTimeout(pumpSemantic,30);}
  }
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)pumpSemantic();});
  function render(article,item,result) {
    const sig=core.signature(item.text), rule=decisions[item.id]?.sig===sig?decisions[item.id].action:null;
    const authorRule=authors[item.handle];
    const force=rule==='fold'||(rule!=='keep'&&authorRule==='fold');
    const keep=rule==='keep'||(rule!=='fold'&&authorRule==='keep');
    const folded=settings.mode==='collapse'&&!keep&&!expanded.has(item.id)&&(force||result.fold);
    if(!folded){restore(article);return;}
    article.dataset.xrfManaged='true';
    article.toggleAttribute('data-xrf-folded',true);
    if(!article.classList.contains('xrf-managed'))article.classList.add('xrf-managed');
    if(!article.classList.contains('xrf-folded'))article.classList.add('xrf-folded');
    foldedCount++;
    const key=JSON.stringify([item.id,sig,item.handle]);
    if(elements.get(article)?.key===key) return;
    const old=elements.get(article); if(old) old.host.remove();
    const host=node('div'), root=shadow(host), bar=node('div','','row bar is-folded');
    const label=node('div','','label');
    label.append(node('small','@'+item.handle+' · 已折叠','muted'));
    bar.append(label,button('展开',()=>{expanded.add(item.id);schedule();}));
    root.append(bar);article.append(host);
    elements.set(article,{host,key,id:item.id});
  }
  function scan() {
    timer=null; if(!ready)return;
    const route=location.pathname.match(/^\/([\w]+)\/status\/(\d+)/);
    const id=route?.[2] || '';
    if(id!==routeKey) {
      for(const el of elements.keys())restore(el);
      routeKey=id;rootText='';rootHandle='';excluded=new Set();expanded.clear();semanticQueue.clear();
    }
    foldedCount=0;evaluatedCount=0;
    for(const el of elements.keys())if(!el.isConnected)elements.delete(el);
    const articles=Array.from(document.querySelectorAll(ARTICLE)).filter(el=>!el.parentElement.closest(ARTICLE)&&!el.closest('aside'));
    const rows=articles.map(el=>({el,item:read(el,id)})).filter(x=>x.item);
    const rootIndex=rows.findIndex(x=>x.item.id===id);
    if(rootIndex>=0) {
      const main=rows[rootIndex].item;
      if(main.text)rootText=main.text;
      rootHandle=main.handle;
      for(let i=0;i<=rootIndex;i++){excluded.add(rows[i].item.id);restore(rows[i].el);}
    }
    const own=ownHandle();
    const profile=location.pathname.match(/^\/([\w]+)(?:\/with_replies)?\/?$/)?.[1]?.toLowerCase();
    const boundary=Array.from(document.querySelectorAll('h2,[role="heading"]')).find(n=>/^(Discover more|发现更多|探索更多|更多值得关注的内容)$/i.test(n.textContent.trim()));
    let profileParent='';
    for(const {el,item} of rows) {
      if(profile) {
        if(item.handle!==profile)profileParent=item.id;
        else record(item,profileParent);
      }
      const isReply=id&&rootText&&!excluded.has(item.id)&&BigInt(item.id)>BigInt(id)&&item.handle!==own&&item.handle!==rootHandle;
      const afterBoundary=boundary&&Boolean(boundary.compareDocumentPosition(el)&Node.DOCUMENT_POSITION_FOLLOWING);
      if(!isReply||afterBoundary||settings.mode==='off'){restore(el);continue;}
      record(item,id);evaluatedCount++;
      render(el,item,core.analyze({...item,parent:rootText,history:history[item.handle]||[],semantic:semanticFor(item,rootText)},settings));
    }
    launcherHost.hidden=!id&&!profile;
    refreshPanel();
  }
  function schedule() { if(!timer)timer=setTimeout(scan,200); }
  new MutationObserver(records=>{
    if(records.some(r=>{
      if(r.type==='attributes'&&r.attributeName==='class')return r.target.matches?.(ARTICLE);
      if(r.target.nodeType===1&&r.target.closest('[data-xrf-owned]'))return false;
      if(r.type==='childList'&&[...r.addedNodes,...r.removedNodes].length&&[...r.addedNodes,...r.removedNodes].every(n=>n.nodeType===1&&n.hasAttribute('data-xrf-owned')))return false;
      return true;
    }))schedule();
  }).observe(document.body,{childList:true,subtree:true,characterData:true,attributes:true,attributeFilter:['href','datetime','class']});
  let lastPath=location.pathname;
  setInterval(()=>{if(location.pathname!==lastPath){lastPath=location.pathname;schedule();}},700);
  api?.storage?.onChanged?.addListener((changes,area)=>{
    if(area!=='local')return;
    const values={};for(const key of Object.values(keys))if(changes[key])values[key]=changes[key].newValue;
    applyStored(values);schedule();
  });
  storage.get(Object.values(keys)).then(data=>{applyStored(data);ready=true;schedule();}).catch(()=>{error='本地存储不可用，自动过滤未启用。请刷新页面或重新加载扩展。';refreshPanel();});
})();
