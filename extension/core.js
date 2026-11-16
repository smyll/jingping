/* SPDX-License-Identifier: MIT */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.XReplyFilter = api;
})(typeof globalThis === 'object' ? globalThis : this, function () {
  'use strict';
  const DEFAULTS = Object.freeze({ mode: 'collapse', sensitivity: 'balanced', semantic: true, lowInformation: true });
  const STOP = new Set('这个 那个 一个 这些 那些 就是 可以 不是 还是 因为 所以 但是 然后 什么 怎么 自己 已经 现在 真的 觉得 我们 你们 他们 有点 可能 不过 这种 这样 那样 没有 而且 一下 其实 里面 出来 东西 the and that this with from have has are was were for you your they their not but just it its to of in on as is at an be by or so'.split(' '));
  const PATTERNS = {
    praise: /很到位|挺有启发|有点东西|很干净|最关键|更值得|核心确实|确实是|讲得[很真]清楚|这个(?:思路|方法|比喻|角度)|最打动我|我(?:也)?觉得|哈哈|想试试|太省了|(?:great|good|fair) point|easy to (?:miss|overlook)|the (?:real|harder|useful) (?:test|question|part)|the bridge from/i,
    question: /[?？]\s*$|(?:吗|么|怎么看|如何看待)[。！!]?\s*$/i,
    elastic: /会不会|能不能|是不是|是否|还是|你(?:们)?(?:觉得|怎么看)|哪(?:个|种|些)|怎么(?:看|做|判断)|如何|好奇|跑起来顺吗|what would|which .{0,80}(?:would|could|best|first|today)|do you think/i,
    anecdote: /我(?:自己|这边|之前|做|也|手头|平时|家里|现在)|i(?:’|'| a)m|i(?:’|')d|my (?:own|workflow|setup)/i,
    pivot: /不过|但是|反而|真正|本质|关键|最后|才是|不然|更值得|而是|the harder|the useful|rather than|the real|instead/i,
    advice: /(?:我会|我建议|建议|最好|不妨|可以再|还(?:要|得)|应该)[^。！？!?]{0,28}(?:测试|检查|验证|记录|评估|对比|观察|加一轮|考虑)/i,
    caution: /不代表|不等于|否则|不然|但是|风险|成本|开销|门槛|前提/,
    future: /(?:下次|回头|有空|改天|之后|准备|打算).{0,12}(?:试试|试一|试下|用上|跑一|体验|做一)|收藏.{0,10}(?:慢慢|回头|之后|以后|再).{0,4}(?:看|研究|学习|消化)/,
    reframe: /背后(?:其实|本质)|这(?:也)?意味着|真正变的是|(?:门槛|成本|效率|价值).{0,16}(?:变成|降低|打下|从|提升)|(?:本质|核心|关键)(?:其实)?(?:是|在于)/,
    opposition: /不同意|不认同|不成立|说错|有误|反例|并不意味着|不能证明|逻辑跳跃|并不是|不等于|根本不|not true|incorrect|counterexample/i,
    concrete: /TypeError|ReferenceError|报错|错误码|复现|堆栈|issue\s*#?\d|https?:\/\/\S+/i
  };
  function normalize(value) {
    return String(value || '').normalize('NFKC').toLowerCase().replace(/https?:\/\/\S+/g, ' ').replace(/@[\w_]+/g, ' ').replace(/\s+/g, ' ').trim();
  }
  function signature(text) {
    let h = 2166136261;
    for (const c of normalize(text)) h = Math.imul(h ^ c.codePointAt(0), 16777619);
    return (h >>> 0).toString(36);
  }
  const segmenter = typeof Intl.Segmenter === 'function' ? new Intl.Segmenter('zh', { granularity: 'word' }) : null;
  const unitCache = new Map();
  function units(text) {
    const cacheKey=String(text||'');
    if(unitCache.has(cacheKey))return unitCache.get(cacheKey);
    const result = new Map();
    if (segmenter) for (const part of segmenter.segment(normalize(text))) {
      if (part.isWordLike && part.segment.length >= 2 && !STOP.has(part.segment)) result.set(part.segment, 3);
    }
    for (const run of normalize(text).match(/[\p{Script=Han}]+|[a-z][a-z0-9.+-]*|\d+(?:\.\d+)?/gu) || []) {
      if (/\p{Script=Han}/u.test(run)) {
        for (let size = 2; size <= 3; size++) for (let i = 0; i <= run.length - size; i++) {
          const key = run.slice(i, i + size);
          if (!STOP.has(key) && !result.has(key)) result.set(key, segmenter ? 0.25 : (size === 3 ? 1.5 : 1));
        }
      } else if (run.length > 1 && !STOP.has(run)) result.set(run, 2);
    }
    unitCache.set(cacheKey,result);
    if(unitCache.size>128)unitCache.delete(unitCache.keys().next().value);
    return result;
  }
  function clauses(text) {
    return String(text || '').split(/[。！？!?\n；;，,：:]/).map(s => s.trim()).filter(s => s.length >= 6);
  }
  function overlap(parent, reply) {
    const a = units(parent), b = units(reply);
    let total = 0, shared = 0;
    for (const [token, weight] of b) { total += weight; if (a.has(token)) shared += weight; }
    return total ? shared / total : 0;
  }
  function hasNewMeasurement(parent, text) {
    const metric = /\d+(?:\.\d+)?\s*(?:fps|ms|毫秒|秒\/帧|帧\/秒|秒|分钟|小时|s|[kmgt]i?b(?:\/s)?|[kmg]bps|%|美元|港元|港币|元|块|usd|hkd)(?![a-z])/gi;
    const value = raw=>normalize(raw).replace(/\s+/g, '');
    const known = new Set([...normalize(parent).matchAll(metric)].map(m=>value(m[0])));
    const observed = /实测|复测|测得|测了|测试(?:了|结果|下来)|跑了|跑过|跑下来|试了|试过|用了|花了|占用|耗时|用时|延迟(?:是|为)|平均(?:是|为)|峰值(?:是|为)|\b(?:measured|tested|observed|took|used|cost)\b/i;
    const prospective = /如果|假如|假设|要是|会不会|能不能|能否|是否|有没有|想知道|希望|期待|预计|估计|可能|也许|或许|目标|建议|不妨|下次|未来|以后|没(?:有)?(?:做过|进行过)?(?:实测|测试|测过)|尚未(?:测试|实测)|未实测|未测|\b(?:would|could|might|expect|target)\b/i;
    const attributed = /原帖|原文|文中|文章|作者(?:说|给)|楼主|标称|宣称|官方(?:说|给)|\b(?:post says|author says|advertised)\b/i;
    for (const sentence of String(text).normalize('NFKC').split(/(?<=[。！？!?\n；;])/).map(normalize)) {
      for (const match of sentence.matchAll(metric)) {
        if (known.has(value(match[0]))) continue;
        let prefix=sentence.slice(0,match.index+match[0].length);
        const ownContrast=prefix.match(/(?:但|不过|可是)\s*我/);
        if(ownContrast)prefix=prefix.slice(ownContrast.index);
        const suffix=sentence.slice(match.index+match[0].length).split(/[，,：:]/)[0];
        if(/[?？]|(?:吗|么)\s*[。!！]?$/.test(suffix))continue;
        // Evidence must precede this measurement; a later wish cannot erase an earlier result.
        if (observed.test(prefix) && !prospective.test(prefix) && !attributed.test(prefix)) return true;
      }
    }
    return false;
  }
  function features(text) {
    const f = {};
    for (const [key, pattern] of Object.entries(PATTERNS)) f[key] = pattern.test(text);
    f.length = Array.from(String(text || '')).length;
    f.template = f.length >= 30 && ((f.praise && (f.question || f.pivot || f.anecdote)) || (f.question && f.elastic && f.length >= 55) || (f.advice && f.caution && f.length >= 70) || ((f.future || f.reframe) && f.length >= 55));
    f.shape = [f.praise ? '接话' : '', f.anecdote ? '自述' : '', f.pivot ? '转折' : '', f.question ? '追问' : '', f.advice ? '建议' : '', f.future ? '试用意向' : '', f.reframe ? '总结' : ''].filter(Boolean).join('→');
    return f;
  }
  function lowInformationReason(text, f, ratio) {
    if(f.length>100 || f.question || /[?？]|出处|来源|证据|纠正|并未|不是官方|没有开源|并不是|不赞成|不建议|比如|例如|举个例子/.test(text))return '';
    // Specific details and usable observations take priority over generic praise.
    if(/https?:\/\/|`|\d\s*(?:px|fps|ms|[kmgt]i?b|%|秒|元)|报错|没反应|不支持|无法|失败|卡住|离线|断网|配置|参数|命令|函数|接口|字段|点击|关闭|打开|安装|改成|改为|按钮/i.test(text))return '';
    const plain=normalize(text).replace(/[\p{P}\p{S}\s]+/gu,'');
    const reaction=/^(?:(?:原来如此|谢谢(?:分享|整理|推荐|大佬)?|感谢(?:分享|整理|推荐|大佬)?|多谢|收藏(?:了|起来)?|已收藏|先收藏|学到了|学习了|受教了|涨知识了|支持|赞|太强了|太厉害了|厉害|好厉害|牛|牛逼|牛批|不错|很棒|太棒了|很有用|可以|先抄为敬|抄作业了|mark|thx|thanks|great|nice|哈哈|哈|慢慢看|慢慢消化|回头看)){1,6}$/i;
    if(plain && f.length<=40 && reaction.test(plain))return '纯附和、致谢或收藏，未补充信息';
    const praise=/省(?:了|下|不少|很多|点)?.{0,4}(?:劲|事|功夫)|高级(?:感)?|(?:太|真|很)?厉害|(?:太|很|真|够)(?:专业|详细|强|有用|不错)|有参考价值|直接抄作业|断层领先|这个(?:思路|方法).{0,4}(?:不错|挺好|真好)/;
    const abstractAdvice=/(?:关键|真正难|更难|难点).{0,18}(?:团队|习惯|落地)|(?:配合|结合|考虑).{0,14}(?:具体内容|实际(?:情况|场景|需求)|可用性)/;
    if((ratio>=0.22 || (ratio>0.08 && /^(?:厉害|太强了)[，,\s]*(?:没想到|原来)/.test(text))) && praise.test(text))return '围绕原帖作笼统评价，未补充具体细节';
    if(ratio>=0.1 && abstractAdvice.test(text))return '泛化的原则或建议，未说明具体做法';
    if(f.length>=12 && f.length<=65 && ratio>=0.88)return '短评论几乎完全重复原帖';
    return '';
  }
  function historySignals(history, currentId) {
    const now = Date.now(), rows = [...new Map((history || []).filter(x => x && x.id && x.id !== currentId && Number.isFinite(x.seenAt) && now >= x.seenAt && now - x.seenAt < 14 * 86400000).map(x => [x.id, x])).values()];
    const replies=rows.filter(x=>x.thread);
    const threads = new Set(replies.filter(x => x.template).map(x => x.thread));
    const templateCount = replies.filter(x => x.template).length;
    const templateRate = replies.length ? templateCount / replies.length : 0;
    const threadCount = new Set(replies.map(x => x.thread)).size;
    const times = [...new Set(rows.map(x => x.time).filter(Number.isFinite))].sort((a,b)=>a-b);
    let regular = false, burst = false;
    for (let i = 3; i < times.length; i++) {
      const gaps = [times[i]-times[i-1], times[i-1]-times[i-2], times[i-2]-times[i-3]];
      if (Math.min(...gaps) >= 60000 && Math.max(...gaps)-Math.min(...gaps) <= 5000) regular = true;
    }
    const originalTimes=[...new Set(rows.filter(x=>!x.thread).map(x=>x.time).filter(Number.isFinite))].sort((a,b)=>a-b);
    for(let i=3;i<originalTimes.length;i++){
      const gaps=[originalTimes[i]-originalTimes[i-1],originalTimes[i-1]-originalTimes[i-2],originalTimes[i-2]-originalTimes[i-3]];
      if(Math.min(...gaps)>=60000&&Math.max(...gaps)-Math.min(...gaps)<=5000)regular=true;
    }
    for (let i = 2; i < times.length; i++) if (times[i]-times[i-2] <= 60000) burst = true;
    const sufficient = replies.length >= 4 && threadCount >= 3;
    const repeated = sufficient && threads.size >= 3 && templateRate >= 0.75;
    // Cadence only reinforces a repeated reply pattern; busy accounts alone get no bonus.
    const score = sufficient ? Math.round(templateRate * 75 + (repeated && regular ? 15 : 0) + (repeated && burst ? 10 : 0)) : null;
    const reasons = [];
    if (sufficient) reasons.push(`已浏览 ${replies.length} 条历史回复，其中 ${templateCount} 条具有模板接话结构，涉及 ${threadCount} 个原帖`);
    if (repeated && regular) reasons.push('重复接话之外，还观察到至少四次近等间隔发布');
    if (repeated && burst) reasons.push('重复接话之外，还观察到一分钟内连续三次发布');
    return { score, sufficient, replyCount: replies.length, threadCount, templateCount, repeated, regular, burst, reasons };
  }
  function analyze({ text = '', parent = '', history = [], id = '', hasMedia = false, truncated = false, semantic = null }, settings = DEFAULTS) {
    const f = features(text), rawRatio = overlap(parent, text), reasons = [];
    const spans = clauses(text).map(value => ({ value, ratio: overlap(parent, value) }));
    const borrowed = spans.filter(x => x.ratio >= 0.55);
    const strongest = spans.filter(x=>x.value.length>=8).map(x=>x.ratio).sort((a,b)=>b-a).slice(0,2);
    // Added chatter must not dilute two independently copied points into a clean verdict.
    const ratio = strongest.length >= 2 ? Math.max(rawRatio, rawRatio * 0.4 + (strongest[0]+strongest[1]) * 0.3) : rawRatio;
    const newMeasurement = hasNewMeasurement(parent,text);
    const hasNewConcrete = newMeasurement || spans.some(x => x.ratio < 0.35 && PATTERNS.concrete.test(x.value));
    const substantive = (f.opposition && ratio < 0.8) || hasNewConcrete;
    const newReference = spans.some(x=>x.ratio<0.25 && /《[^》]+》|\b(?:19|20)\d{2}\s*年|\.[a-z][a-z0-9_-]{2,}/i.test(x.value));
    const lowInformation = settings.lowInformation!==false && parent && !substantive && !newReference && !hasMedia && !truncated ? lowInformationReason(text,f,ratio) : '';
    const linkedSpans = spans.filter(x=>x.ratio>=0.3 && x.value.length>=8).length;
    const summaryReuse = ratio>=0.6 || (ratio>=0.5 && semantic?.similarity>=0.65);
    const shortJoke = f.length<70 && /哈哈|笑死|分明是|😂|🤣/.test(text);
    const repetitiveSummary = f.length>=45 && linkedSpans>=2 && summaryReuse && !shortJoke && (f.praise || f.future || f.reframe);
    const repetitiveAdvice = !substantive && f.length >= 70 && f.advice && f.caution && spans.filter(x=>x.ratio>=0.3).length>=3 && (ratio>=0.62 || (ratio>=0.4 && semantic?.similarity>=0.7));
    const h = historySignals(history, id);
    const add = (points, reason) => { score += points; reasons.push(reason); };
    let score = 0;
    if (parent && f.length >= 15) {
      if (ratio >= 0.72) add(55, '大部分词句与原帖重合');
      else if (ratio >= 0.5) add(40, '较多内容复用原帖');
      else if (ratio >= 0.3) add(23, '部分内容复用原帖');
      if (borrowed.length >= 2) add(10, '连续多句重复原帖信息');
      if (f.praise && ratio >= 0.22) add(15, '复述后附和或点评');
      if (f.question && f.elastic && ((f.length >= 35 && ratio >= 0.2)||(f.length>=22&&ratio>=0.5))) add(20, '复述后追加开放式问题');
      if (f.anecdote && f.pivot && ratio >= 0.25 && f.length >= 50) add(12, '复述穿插自述与转折');
      if (repetitiveAdvice) add(18, '复用原帖多处信息，再追加未给出结果的建议与担忧');
      if (f.future && ratio>=0.35 && f.length>=45) add(12, '复述后追加尚未实践的试用意向');
      if (repetitiveSummary && !newReference) add(0, '多处复述原帖后附和或换角度总结');
    }
    if (parent && Number.isFinite(semantic?.similarity) && score >= 20) {
      if (semantic.similarity >= 0.7) add(25, '本地模型发现与原帖接近的表达');
      else if (semantic.similarity >= 0.58) add(12, '本地模型发现相关表达（辅助信号）');
    }
    // Similarity is supporting evidence, not proof that a reply was AI-authored.
    if (substantive) { score = Math.min(score-30,39); reasons.push('包含反驳或原帖之外的具体排错、测量信息'); }
    if (f.length < 15) score = Math.min(score, 25);
    if (hasMedia || truncated) { score = Math.min(score, 39); reasons.push(hasMedia ? '评论附有图片或视频，文字不足以判断' : '评论尚未展开，暂不自动折叠'); }
    if (!parent) score = Math.min(score, 35);
    if(lowInformation){score=Math.max(score,75);reasons.push(lowInformation);}
    const commentScore = Math.max(0, Math.min(100, Math.round(score)));
    const threshold = settings.sensitivity === 'strict' ? 45 : settings.sensitivity === 'gentle' ? 75 : 60;
    const quantities = value=>new Set((value.match(/\d+(?:\.\d+)?\s*(?:万|亿|千|百|[KMGT]?B\b|行|笔|次|项|个|帧)/gi) || []).map(part=>normalize(part).replace(/\s+/g, '')));
    const parentQuantities = quantities(parent);
    const repeatedQuantities = [...quantities(text)].filter(value=>parentQuantities.has(value));
    // Two reused quantities plus several linked clauses can be hidden by extra process chatter.
    const detailedQuestion = f.length >= 80 && linkedSpans >= 3 && borrowed.length >= 1 && repeatedQuantities.length >= 2 && ratio >= 0.5 && semantic?.similarity >= 0.65;
    const highReuse = ratio >= 0.62 || (ratio >= 0.35 && semantic?.similarity >= 0.74) || (rawRatio >= 0.48 && borrowed.length >= 2) || detailedQuestion;
    const repetitiveQuestion = highReuse && f.question && (f.elastic || ratio>=0.7) && f.length >= 35;
    const repeatedAccount = h.repeated && f.template && (ratio >= 0.3 || h.regular || h.burst);
    const protectedContent = substantive || hasMedia || truncated || !parent || (f.length < 15 && !lowInformation);
    const eligible = !protectedContent && (Boolean(lowInformation) || repeatedAccount || (!newReference && (repetitiveQuestion || repetitiveAdvice || repetitiveSummary)));
    const historyAdjustment = repeatedAccount && !protectedContent ? Math.min(100-commentScore, Math.round(h.score * 0.2)) : 0;
    score = commentScore + historyAdjustment;
    if(newReference)reasons.push('包含原帖之外的具体例子；单条文风不足以自动折叠');
    if (historyAdjustment) reasons.push(`本条也符合账号历史中的跨帖接话结构，辅助加 ${historyAdjustment} 分`);
    const decision = !eligible ? (protectedContent ? '保留：本条需要保留或补足上下文' : newReference ? '保留：有具体新例子，缺少跨帖重复证据' : '保留：未满足模板复述或跨帖重复条件') : score < threshold ? '保留：未达到折叠阈值' : '建议折叠：内容条件和分数均达到要求';
    return { score, commentScore, account: h, historyAdjustment, threshold, decision, fold: settings.mode !== 'off' && eligible && score >= threshold, reasons, ratio, borrowed: borrowed.map(x => x.value.slice(0,100)).slice(0,3), features: f, missingParent: !parent, semantic, eligible, newReference, lowInformation };
  }
  function sanitizeSettings(value) {
    return { mode: ['collapse','mark','off'].includes(value?.mode) ? value.mode : DEFAULTS.mode,
      sensitivity: ['gentle','balanced','strict'].includes(value?.sensitivity) ? value.sensitivity : DEFAULTS.sensitivity,
      semantic: typeof value?.semantic === 'boolean' ? value.semantic : DEFAULTS.semantic,
      lowInformation: typeof value?.lowInformation === 'boolean' ? value.lowInformation : DEFAULTS.lowInformation };
  }
  return { DEFAULTS, normalize, signature, overlap, features, historySignals, analyze, sanitizeSettings };
});
