/* 首帧引导：在渲染前应用本地偏好，避免刷新时侧栏/主题/排版闪动。
   取值范围以此为准（单一事实源）：reader.js 的 TYPOGRAPHY 表——改默认值/范围时两处同步（本文件无法 import，module 加载晚于首帧）。 */
(function(){
  try{
    var get=function(key,fallback){try{var v=localStorage.getItem('novel-workbench:'+key);return v===null?fallback:JSON.parse(v);}catch(e){return fallback;}};
    var root=document.documentElement;
    var appearance=get('appearance',null);
    if(['light','dark','paper'].indexOf(appearance)<0)appearance=matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';
    root.dataset.appearance=appearance;
    var uiFont=get('uiFont','kai');
    root.dataset.uiFont=['kai','song','hei','system'].indexOf(uiFont)>-1?uiFont:'kai';
    root.style.setProperty('--ui-size',Math.min(17,Math.max(13,Number(get('uiFontSize',14))||14))+'px');
    root.style.setProperty('--ui-leading',String(Math.min(2,Math.max(1.5,Number(get('uiLineHeight',1.7))||1.7))));
    var font=get('readerFont','kai');
    root.dataset.readerFont=['song','kai','hei'].indexOf(font)>-1?font:'kai';
    root.style.setProperty('--reader-size',Math.min(26,Math.max(15,Number(get('fontSize',18))||18))+'px');
    root.style.setProperty('--reader-leading',String(Math.min(2.6,Math.max(1.6,Number(get('lineHeight',2.1))||2.1))));
    root.dataset.readerIndent=get('readerIndent',true)===false?'false':'true';
    if(innerWidth>=1024&&get('sidebarCollapsed',false))root.classList.add('sidebar-collapsed');
  }catch(e){/* 偏好不可读时按默认渲染 */}
})();
