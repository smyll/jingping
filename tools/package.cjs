const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),out=path.join(root,'release');
fs.mkdirSync(out,{recursive:true});
for(const name of ['extension','README.md','README.en.md','LICENSE','PRIVACY.md','docs'])fs.cpSync(path.join(root,name),path.join(out,name),{recursive:true});
function walk(dir){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(entry=>entry.isDirectory()?walk(path.join(dir,entry.name)):[path.join(dir,entry.name)]);}
const files=walk(path.join(out,'extension')).map(file=>({path:path.relative(out,file).replaceAll('\\','/'),bytes:fs.statSync(file).size,sha256:crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')}));
fs.writeFileSync(path.join(out,'checksums.json'),JSON.stringify({version:require('../extension/manifest.json').version,files},null,2));
console.log(`Release folder: ${out}\nExtension bytes: ${files.reduce((n,f)=>n+f.bytes,0)}`);
