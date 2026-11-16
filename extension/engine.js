/* SPDX-License-Identifier: MIT */
const worker=new Worker('semantic-worker.js',{type:'module'}),pending=new Map();
let sequence=0;
worker.onmessage=({data})=>{const entry=pending.get(data.id);if(entry){clearTimeout(entry.timer);entry.respond(data.result);pending.delete(data.id);}};
worker.onerror=()=>{for(const entry of pending.values()){clearTimeout(entry.timer);entry.respond({error:'本地模型加载失败'});}pending.clear();};
chrome.runtime.onMessage.addListener((message,sender,respond)=>{
  if(message?.target!=='xrf.engine'||sender.id!==chrome.runtime.id)return;
  const id=++sequence,timer=setTimeout(()=>{pending.delete(id);respond({error:'本地模型计算超时'});},60000);
  pending.set(id,{respond,timer});worker.postMessage({id,parent:message.parent,text:message.text});return true;
});
