import {createSemantic} from './semantic.mjs';
const compare=createSemantic(browser.runtime.getURL(''));
let queue=Promise.resolve();
browser.runtime.onMessage.addListener((m,sender)=>{
  if(m?.target!=='xrf.semantic'||sender.id!==browser.runtime.id)return;
  if(typeof m.parent!=='string'||typeof m.text!=='string'||m.parent.length>40000||m.text.length>5000)return Promise.resolve({error:'输入无效'});
  const result=queue.then(()=>compare(m.parent,m.text));queue=result.catch(()=>{});
  return result.catch(()=>({error:'本地模型加载或计算失败'}));
});
