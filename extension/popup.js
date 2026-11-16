/* SPDX-License-Identifier: MIT */
(async()=>{
  const store=(globalThis.browser||globalThis.chrome).storage.local;
  const fields=['mode','sensitivity','semantic'],status=document.getElementById('status');
  try {
    const data=await store.get('xrf.settings'),settings=XReplyFilter.sanitizeSettings(data['xrf.settings']);
    for(const field of fields){const input=document.getElementById(field);if(field==='semantic')input.checked=settings[field];else input.value=settings[field];input.addEventListener('change',async()=>{
      try{const fresh=(await store.get('xrf.settings'))['xrf.settings'];await store.set({'xrf.settings':{...XReplyFilter.sanitizeSettings(fresh),[field]:field==='semantic'?input.checked:input.value}});status.textContent='已保存，打开的 X 页面会自动应用。';}
      catch{status.textContent='保存失败，请重试。';}
    });}status.textContent='设置自动保存在本机。';
  }catch{status.textContent='无法读取设置，请重新加载扩展。';}
})();
