import http from 'node:http';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createCatalog } from './catalog.mjs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { execFile } from 'node:child_process';
import { idFor } from './paths.mjs';
import { savePreferences } from './preferences.mjs';

const webRoot = new URL('./web/', import.meta.url);
const staticFiles = new Set(['index.html', 'styles.css', 'boot.js', 'app.js', 'views.js', 'reader.js', 'settings.js', 'report.js', 'markdown.js', 'documents.js', 'favicon.svg', 'vendor/markdown-it.min.js', 'vendor/purify.min.js']);
const types = { '.png':'image/png', '.jpg':'image/jpeg', '.jpeg':'image/jpeg', '.gif':'image/gif', '.webp':'image/webp', '.avif':'image/avif' };

/* 目录选择框的 PowerShell 脚本：IFileDialog 的 COM 互操作必须保持 vtable 顺序（IModalWindow::Show 起依次列出）。
   C# 源码保持 5.0 语法（powershell.exe 的 Add-Type 用旧编译器，不支持内联 out 声明等新语法）。 */
function pickerScript(title, presetPath) {
  /* 两个入参都会拼进 PowerShell 单引号字符串：统一在函数内做 '' 转义，调用方传原文 */
  const safeTitle = title.replace(/'/g, "''");
  const safePath = presetPath.replace(/'/g, "''");
  const cs = [
    'using System;',
    'using System.Runtime.InteropServices;',
    'public class FolderPicker {',
    '  private static Guid CLSID_FileOpenDialog = new Guid("DC1C5A9C-E88A-4dde-A5A1-60F82A20AEF7");',
    '  private static Guid IID_IShellItem = new Guid("43826D1E-E718-42EE-BC55-A1E261C37BFE");',
    '  [DllImport("shell32.dll")]',
    '  private static extern int SHCreateItemFromParsingName([MarshalAs(UnmanagedType.LPWStr)] string path, IntPtr pbc, ref Guid riid, out IShellItem item);',
    '  public string Title; public string InputPath; public string ResultPath;',
    '  [ComImport, Guid("D57C7288-D4AD-4768-BE02-9D969532D960"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]',
    '  private interface IFileOpenDialog {',
    '    [PreserveSig] int Show(IntPtr hwnd);',
    '    void SetFileTypes(uint c, IntPtr specs); void SetFileTypeIndex(uint i); void GetFileTypeIndex(out uint i);',
    '    void Advise(IntPtr sink, out uint cookie); void Unadvise(uint cookie);',
    '    void SetOptions(uint fos); void GetOptions(out uint fos);',
    '    void SetDefaultFolder(IShellItem item); void SetFolder(IShellItem item); void GetFolder(out IShellItem item);',
    '    void GetCurrentSelection(out IShellItem item);',
    '    void SetFileName(string name); void GetFileName(out string name);',
    '    void SetTitle(string title); void SetOkButtonLabel(string text); void SetFileNameLabel(string label);',
    '    void GetResult(out IShellItem item); void AddPlace(IShellItem item, int place); void SetDefaultExtension(string ext);',
    '    void ClearClientData(); void SetFilter(IntPtr filter); void GetResults(out IntPtr items); void GetSelectedItems(out IntPtr items);',
    '  }',
    '  [ComImport, Guid("43826D1E-E718-42EE-BC55-A1E261C37BFE"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]',
    '  private interface IShellItem {',
    '    void BindToHandler(IntPtr pbc, ref Guid bhid, ref Guid riid, out IntPtr ppv);',
    '    void GetParent(out IShellItem item);',
    '    void GetDisplayName(uint sigdn, [MarshalAs(UnmanagedType.LPWStr)] out string name);',
    '    void GetAttributes(uint mask, out uint attrs); void Compare(IShellItem other, uint hint, out int order);',
    '  }',
    '  [ComImport, Guid("DC1C5A9C-E88A-4dde-A5A1-60F82A20AEF7")] private class FileOpenDialogRCW { }',
    '  public bool ShowDialog() {',
    '    IFileOpenDialog dialog = (IFileOpenDialog)new FileOpenDialogRCW();',
    '    try {',
    '      uint options; dialog.GetOptions(out options);',
    '      options |= 0x20 | 0x40 | 0x8;',
    '      dialog.SetOptions(options);',
    '      if (!string.IsNullOrEmpty(Title)) dialog.SetTitle(Title);',
    '      if (!string.IsNullOrEmpty(InputPath)) {',
    '        IShellItem home; Guid iid = IID_IShellItem;',
    '        if (SHCreateItemFromParsingName(InputPath, IntPtr.Zero, ref iid, out home) == 0) dialog.SetFolder(home);',
    '      }',
    '      if (dialog.Show(IntPtr.Zero) != 0) return false;',
    '      IShellItem result; dialog.GetResult(out result);',
    '      string path; result.GetDisplayName(0x80058000, out path);',
    '      ResultPath = path;',
    '      return true;',
    '    } finally { Marshal.ReleaseComObject(dialog); }',
    '  }',
    '}',
  ].join('\n');
  return [
    "[Console]::OutputEncoding=[System.Text.Encoding]::UTF8",
    "$ok=$false",
    "try {",
    `  Add-Type -TypeDefinition @'`,
    cs,
    "'@ | Out-Null",
    "  $picker=New-Object FolderPicker",
    `  $picker.Title='${safeTitle}'`,
    `  $picker.InputPath='${safePath}'`,
    "  if($picker.ShowDialog()){[Console]::Out.Write($picker.ResultPath)}",
    "  $ok=$true",
    "} catch { }",
    "if(-not $ok){",
    "  Add-Type -AssemblyName System.Windows.Forms",
    "  $d=New-Object System.Windows.Forms.FolderBrowserDialog",
    `  $d.Description='${safeTitle}'`,
    `  $d.SelectedPath='${safePath}'`,
    "  if($d.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK){[Console]::Out.Write($d.SelectedPath)}",
    "}",
  ].join('\n');
}

export async function startWorkbench({ workspace, port = 0, intervalMs = 1500 }) {
  let catalog = await createCatalog(workspace),generation=0;
  const sessionToken=randomBytes(24).toString('hex');
  const clients = new Set(), sockets = new Set();
  let polling = false, closed = false;
  const composeVersion=()=>idFor(catalog.workspace)+':'+catalog.version;
  function broadcast(changes){for(const client of clients){if(client.writableLength>1024*1024){client.destroy();clients.delete(client);continue;}client.write(`event: catalog\ndata: ${JSON.stringify(changes)}\n\n`);}}
  function readBody(request,limit){return new Promise((resolve,reject)=>{let body='';request.on('data',chunk=>{body+=chunk;if(Buffer.byteLength(body)>limit)reject(Object.assign(new Error('请求过长'),{status:413}));});request.on('end',()=>resolve(body));request.on('error',reject);});}
  const server = http.createServer(async (req, res) => {
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'");
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Cache-Control', 'no-store');
    function json(status, value) { res.writeHead(status, {'Content-Type':'application/json; charset=utf-8'}); res.end(JSON.stringify(value)); }
    const address = server.address();
    const allowed = new Set([`127.0.0.1:${address.port}`, `localhost:${address.port}`]);
    if (!allowed.has(req.headers.host) || (req.headers.origin && req.headers.origin !== `http://${req.headers.host}`)) { json(403, {error:'仅允许本地同源访问'}); return; }
    if(req.method==='POST'&&(req.url==='/api/workspaces/open'||req.url==='/api/preferences')){
      const openWorkspace=req.url==='/api/workspaces/open';
      if(req.headers['x-workbench-token']!==sessionToken){json(403,{error:openWorkspace?'工作区切换需要当前会话授权':'保存偏好需要当前会话授权'});return;}
      if(!req.headers['content-type']?.startsWith('application/json')){json(415,{error:openWorkspace?'需要 JSON 格式的目录路径':'需要 JSON 格式的偏好数据'});return;}
      try{
        const text=await readBody(req,openWorkspace?8192:64*1024);
        if(openWorkspace){
          const selected=JSON.parse(text).path;
          if(typeof selected!=='string'||!path.isAbsolute(selected))throw new Error('请输入本地目录的绝对路径');
          const resolved=await fs.realpath(selected);if(!(await fs.stat(resolved)).isDirectory())throw new Error('请选择文件夹');
          const next=await createCatalog(resolved);catalog=next;generation++;
          broadcast({version:composeVersion(),workspace:catalog.workspace,changedProjects:[],changedDocuments:[]});
          json(200,{workspace:catalog.workspace});
        }else{
          /* 全站只读的唯一例外：仅允许写工作区根目录的 user-preferences.json；窄更新不触发全工作区重扫描 */
          const saved=await savePreferences(catalog.workspace,JSON.parse(text));
          catalog.updatePreferences(saved);
          broadcast({version:composeVersion(),changedProjects:[],changedDocuments:[]});
          json(200,{version:saved.version,updatedAt:saved.updatedAt,preferences:saved.preferences});
        }
      }catch(error){
        const status=openWorkspace?400:error.status||400;
        json(status,{error:openWorkspace?(error.code==='ENOENT'?'目录不存在，请检查路径':error.message):(error.message||'偏好保存失败')});
      }
      return;
    }
    /* 系统目录选择框：服务端在本机弹出原生对话框，只返回用户选中的绝对路径，不读不写任何文件。
       首选 Vista+ 的 IFileDialog（FOS_PICKFOLDERS，即资源管理器同款的现代选择框），
       加载失败再退回 WinForms 的 FolderBrowserDialog（老式树状框）。 */
    if (req.method === 'POST' && req.url === '/api/pick-folder') {
      if (req.headers['x-workbench-token'] !== sessionToken) { json(403, {error:'目录选择需要当前会话授权'}); return; }
      if (process.platform !== 'win32') { json(501, {error:'此系统不支持弹出目录选择框，请手动填写路径'}); return; }
      let from = '';
      try { const body = JSON.parse(await readBody(req, 8192)); if (typeof body.from === 'string') from = body.from; } catch { /* 预置路径可省略 */ }
      const script = pickerScript('选择小说工作区目录', from);
      execFile('powershell.exe', ['-NoProfile', '-Command', script], { timeout: 600000, maxBuffer: 8192, windowsHide: true }, (error, stdout) => {
        if (error && error.code !== 0) { json(500, {error:'目录选择框启动失败，请手动填写路径'}); return; }
        json(200, { path: String(stdout || '').trim() || null });
      });
      return;
    }
    if (!['GET', 'HEAD'].includes(req.method)) { json(405,{error:'小说内容只提供读取接口'});return; }
    try {
      const url = new URL(req.url, `http://${req.headers.host}`);
      const pathname = decodeURIComponent(url.pathname);
      if (pathname === '/api/projects') {
        const quote=value=>process.platform==='win32'?`"${value}"`:`'${value.replace(/'/g,"'\\''")}'`;
        const restartCommand=`node ${quote(fileURLToPath(new URL('../workbench.mjs',import.meta.url)))} --workspace ${quote(catalog.workspace)} --port ${address.port}`;
        json(200, {version:composeVersion(),workspace:catalog.workspace,sessionToken,projects:catalog.listProjects(),warnings:catalog.warnings,preferences:catalog.preferences,restartCommand}); return;
      }
      if (pathname === '/api/events' && req.method === 'GET') {
        res.writeHead(200, {'Content-Type':'text/event-stream; charset=utf-8','Connection':'keep-alive','X-Accel-Buffering':'no'});
        res.write(`event: catalog\ndata: ${JSON.stringify({version:composeVersion(),workspace:catalog.workspace,changedProjects:[],changedDocuments:[]})}\n\n`);
        clients.add(res); req.on('close',()=>clients.delete(res));return;
      }
      const analysis = pathname.match(/^\/api\/projects\/([a-f\d]{20})\/analysis$/);
      if (analysis) { json(200, await catalog.analyze(analysis[1])); return; }
      const match = pathname.match(/^\/api\/projects\/([a-f\d]{20})(?:\/(documents|assets)\/([\w-]+))?$/);
      if (match) {
        const [,id,kind,resource] = match;
        if (!kind) { const project=catalog.getProject(id); json(project?200:404,project||{error:'作品不存在或已被移除'});return; }
        if (kind === 'documents') { json(200,await catalog.readDocument(id,resource));return; }
        const asset=await catalog.readAsset(id,resource);res.writeHead(200,{'Content-Type':types[asset.extension]});res.end(asset.data);return;
      }
      const name = pathname === '/' ? 'index.html' : pathname.slice(1);
      if (staticFiles.has(name)) {
        const data=await fs.readFile(new URL(name,webRoot));
        const type=name.endsWith('.js')?'text/javascript':name.endsWith('.css')?'text/css':name.endsWith('.svg')?'image/svg+xml':'text/html';
        res.writeHead(200,{'Content-Type':type+'; charset=utf-8'});res.end(req.method==='HEAD'?undefined:data);return;
      }
      json(404,{error:'找不到此页面或资源'});
    } catch(error) { json(error.status || (error.code==='ENOENT'?404:503),{error:error.status?error.message:'资源暂不可读，请重试'}); }
  });
  server.on('connection', socket=>{sockets.add(socket);socket.on('close',()=>sockets.delete(socket));});
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',()=>{server.removeListener('error',reject);resolve();});});
  async function poll() {
    if (polling || closed) return;
    polling=true;
    try {
      const selected=catalog,epoch=generation,previous=selected.version;
      const changes=await selected.refresh();
      if(epoch!==generation)return;
      changes.version=idFor(selected.workspace)+':'+changes.version;
      if(previous!==selected.version)broadcast(changes);
    } finally { polling=false; }
  }
  const interval=intervalMs>0?setInterval(()=>poll().catch(()=>{}),intervalMs):null;
  const heartbeat=setInterval(()=>{for(const client of clients){if(client.writableLength>1024*1024)client.destroy();else client.write(': heartbeat\n\n');}},15000);
  return {
    url:`http://127.0.0.1:${server.address().port}/`, get catalog(){return catalog;},
    async close() {
      closed=true;clearInterval(interval);clearInterval(heartbeat);
      for(const client of clients)client.end();
      const closing=new Promise(resolve=>server.close(resolve));
      for(const socket of sockets)socket.destroy();
      await closing;
    },
  };
}
