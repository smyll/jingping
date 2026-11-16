const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.wasm':'application/wasm','.onnx':'application/octet-stream'};
const server=http.createServer((req,res)=>{
  let name;try{name=decodeURIComponent(new URL(req.url,'http://127.0.0.1').pathname);}catch{res.writeHead(400).end();return;}
  if(name==='/samples.json'){res.setHeader('Content-Type',types['.json']);res.end(JSON.stringify(require('../tests/samples.cjs')));return;}
  if(name==='/'||/^\/[\w]+\/status\/\d+$/.test(name))name='/preview/index.html';
  if(!/^\/(preview|extension)\//.test(name)){res.writeHead(404).end();return;}
  const file=path.resolve(root,'.'+name);
  if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
  fs.stat(file,(e,s)=>{if(e||!s.isFile()){res.writeHead(404).end();return;}res.setHeader('Content-Type',types[path.extname(file)]||'application/octet-stream');res.setHeader('Cache-Control','no-cache');fs.createReadStream(file).pipe(res);});
});
server.listen(8766,'127.0.0.1',()=>console.log('Preview: http://127.0.0.1:8766/demo/status/1000'));
