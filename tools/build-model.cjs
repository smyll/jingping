const esbuild=require('esbuild'),fs=require('node:fs'),path=require('node:path');
(async()=>{
  const options={bundle:true,platform:'browser',format:'esm',minify:true,target:'es2022',conditions:['browser'],external:[],logLevel:'warning'};
  const build=await esbuild.build({...options,metafile:true,entryPoints:['src/semantic-worker.mjs'],outfile:'extension/semantic-worker.js'});
  await esbuild.build({...options,format:'iife',entryPoints:['src/background-firefox.mjs'],outfile:'extension/background-firefox.js'});
  fs.mkdirSync('extension/vendor',{recursive:true});
  for(const name of ['ort-wasm-simd-threaded.jsep.mjs','ort-wasm-simd-threaded.jsep.wasm'])fs.copyFileSync(path.join('node_modules/onnxruntime-web/dist',name),path.join('extension/vendor',name));
  fs.mkdirSync('extension/licenses',{recursive:true});
  const used=[...new Set(Object.keys(build.metafile.inputs).map(f=>f.match(/node_modules\/((?:@[^/]+\/)?[^/]+)/)?.[1]).filter(Boolean))];
  const notices=[];
  for(const pkg of used){
    const dir=path.join('node_modules',pkg),target=pkg.replaceAll('/','_').replace('@','');
    const meta=JSON.parse(fs.readFileSync(path.join(dir,'package.json'),'utf8'));notices.push(`${meta.name} ${meta.version}: ${meta.license}\n${JSON.stringify(meta.repository||meta.homepage||'')}`);
    for(const file of fs.readdirSync(dir).filter(f=>/^(LICENSE|NOTICE)/i.test(f)))fs.copyFileSync(path.join(dir,file),path.join('extension/licenses',target+'-'+file));
  }
  fs.writeFileSync('extension/licenses/DEPENDENCIES.txt',notices.join('\n\n'));
  console.log('Bundled local model runtime. No remote code or model downloads at runtime.');
})();
