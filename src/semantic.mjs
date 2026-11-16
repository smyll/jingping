import { pipeline, env } from '@huggingface/transformers';

export function chunks(text) {
  const parts=String(text).split(/(?<=[。！？!?])\s*|\n+/).map(s=>s.trim()).filter(s=>s.length>=10);
  const out=[];
  for(const part of parts)for(let i=0;i<part.length;i+=180)out.push(part.slice(i,i+200));
  return out.slice(0,48);
}
export function cosine(a,b){let n=0;for(let i=0;i<a.length;i++)n+=a[i]*b[i];return n;}
export function createSemantic(base,device='wasm'){
  env.allowRemoteModels=false;
  env.allowLocalModels=true;
  env.localModelPath=base+'models/';
  env.backends.onnx.wasm.numThreads=1;
  env.backends.onnx.wasm.proxy=false;
  env.backends.onnx.wasm.wasmPaths=base+'vendor/';
  let pipelinePromise;
  const cache=new Map();
  async function vectors(texts){
    if(!pipelinePromise)pipelinePromise=pipeline('feature-extraction','bge-small-zh-v1.5',{dtype:'q8',device});
    const model=await pipelinePromise;
    const missing=[...new Set(texts)].filter(t=>!cache.has(t));
    for(let i=0;i<missing.length;i+=4){
      const batch=missing.slice(i,i+4);
      const tensor=await model(batch,{pooling:'cls',normalize:true,truncation:true,max_length:256});
      const values=tensor.tolist();batch.forEach((s,j)=>cache.set(s,values[j]));
      await new Promise(resolve=>setTimeout(resolve,0));
    }
    const result=texts.map(t=>cache.get(t));
    while(cache.size>600)cache.delete(cache.keys().next().value);
    return result;
  }
  return async(parent,reply)=>{
    const parts=chunks(parent);if(!parts.length)return null;
    const first=chunks(reply)[0],queries=[String(reply).slice(0,280)];
    if(first&&first.length>=18&&first!==queries[0])queries.push(first);
    const p=await vectors(parts),q=await vectors(queries);
    let best=-1,index=-1;
    for(let i=0;i<p.length;i++)for(const value of q){const score=cosine(p[i],value);if(score>best){best=score;index=i;}}
    return { similarity:best, matched:parts[index], model:'bge-small-zh-v1.5/q8' };
  };
}
