import {createSemantic} from './semantic.mjs';
const compare=createSemantic(new URL('./',import.meta.url).href);
let queue=Promise.resolve();
self.onmessage=({data})=>{
  queue=queue.then(async()=>{
    try{const result=await compare(data.parent,data.text);self.postMessage({id:data.id,result});}
    catch(error){console.error('Local semantic engine:',error);self.postMessage({id:data.id,result:{error:'本地模型加载或计算失败'}});}
  });
};
