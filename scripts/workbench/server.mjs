import http from 'node:http';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createCatalog } from './catalog.mjs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { idFor } from './paths.mjs';
import { savePreferences } from './preferences.mjs';

const webRoot = new URL('./web/', import.meta.url);
const staticFiles = new Set(['index.html', 'styles.css', 'boot.js', 'app.js', 'views.js', 'reader.js', 'settings.js', 'markdown.js', 'documents.js', 'favicon.svg', 'vendor/markdown-it.min.js', 'vendor/purify.min.js']);
const types = { '.png':'image/png', '.jpg':'image/jpeg', '.jpeg':'image/jpeg', '.gif':'image/gif', '.webp':'image/webp', '.avif':'image/avif' };

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
        const status=openWorkspace?(error.code==='ENOENT'?400:400):error.status||400;
        json(status,{error:openWorkspace?(error.code==='ENOENT'?'目录不存在，请检查路径':error.message):(error.message||'偏好保存失败')});
      }
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
