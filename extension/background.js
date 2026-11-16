/* SPDX-License-Identifier: MIT */
let creating;
async function ensureEngine(){
  const url=chrome.runtime.getURL('engine.html');
  if((await chrome.runtime.getContexts({contextTypes:['OFFSCREEN_DOCUMENT'],documentUrls:[url]})).length)return;
  if(!creating)creating=chrome.offscreen.createDocument({url:'engine.html',reasons:['WORKERS'],justification:'在设备本地运行中文语义模型，避免阻塞 X 页面。'}).finally(()=>{creating=null;});
  await creating;
}
chrome.runtime.onMessage.addListener((message,sender,respond)=>{
  if(message?.target!=='xrf.semantic')return;
  if(sender.id!==chrome.runtime.id||typeof message.parent!=='string'||typeof message.text!=='string'||message.parent.length>40000||message.text.length>5000){respond({error:'输入无效'});return;}
  ensureEngine().then(()=>chrome.runtime.sendMessage({target:'xrf.engine',parent:message.parent,text:message.text})).then(respond,()=>respond({error:'本地模型暂时不可用'}));
  return true;
});
