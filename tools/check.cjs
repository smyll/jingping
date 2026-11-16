const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process');
const root=path.join(__dirname,'..');
const manifest=JSON.parse(fs.readFileSync(path.join(root,'extension/manifest.json'),'utf8'));
for(const name of ['core.js','content.js','popup.js','background.js','engine.js'])cp.execFileSync(process.execPath,['--check',path.join(root,'extension',name)]);
if(JSON.stringify(manifest.permissions)!=='["storage","offscreen"]')throw Error('Unexpected permissions');
for(const entry of manifest.content_scripts)for(const name of [...entry.js,...entry.css])if(!fs.existsSync(path.join(root,'extension',name)))throw Error('Missing '+name);
for(const name of ['core.js','content.js','popup.js']){
  const s=fs.readFileSync(path.join(root,'extension',name),'utf8');
  if(/\bfetch\s*\(|XMLHttpRequest|sendBeacon|WebSocket|eval\s*\(|new Function/.test(s))throw Error('Unexpected network or dynamic code in '+name);
}
for(const name of ['models/bge-small-zh-v1.5/onnx/model_quantized.onnx','vendor/ort-wasm-simd-threaded.jsep.wasm','semantic-worker.js'])if(!fs.existsSync(path.join(root,'extension',name)))throw Error('Missing local asset: '+name);
console.log('Syntax, manifest, minimal permissions, local assets and application no-network checks passed.');
