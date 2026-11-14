import http from 'node:http';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createCatalog } from './catalog.mjs';

const webRoot = new URL('./web/', import.meta.url);
const staticFiles = new Set(['index.html', 'styles.css', 'app.js', 'views.js', 'reader.js', 'markdown.js', 'documents.js', 'vendor/markdown-it.min.js', 'vendor/purify.min.js']);
const types = { '.png':'image/png', '.jpg':'image/jpeg', '.jpeg':'image/jpeg', '.gif':'image/gif', '.webp':'image/webp', '.avif':'image/avif' };

export async function startWorkbench({ workspace, port = 0, intervalMs = 1500 }) {
  const catalog = await createCatalog(workspace);
  const clients = new Set(), sockets = new Set();
  let polling = false, closed = false;
  const server = http.createServer(async (req, res) => {
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'");
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Cache-Control', 'no-store');
    function json(status, value) { res.writeHead(status, {'Content-Type':'application/json; charset=utf-8'}); res.end(JSON.stringify(value)); }
    const address = server.address();
    const allowed = new Set([`127.0.0.1:${address.port}`, `localhost:${address.port}`]);
    if (!allowed.has(req.headers.host) || (req.headers.origin && req.headers.origin !== `http://${req.headers.host}`)) { json(403, {error:'仅允许本地同源访问'}); return; }
    if (!['GET', 'HEAD'].includes(req.method)) { json(405,{error:'工作台只提供读取接口'});return; }
    try {
      const url = new URL(req.url, `http://${req.headers.host}`);
      const pathname = decodeURIComponent(url.pathname);
      if (pathname === '/api/projects') {
        const quote=value=>process.platform==='win32'?`"${value}"`:`'${value.replace(/'/g,"'\\''")}'`;
        const restartCommand=`node ${quote(fileURLToPath(new URL('../workbench.mjs',import.meta.url)))} --workspace ${quote(catalog.workspace)} --port ${address.port}`;
        json(200, {version:catalog.version,projects:catalog.listProjects(),warnings:catalog.warnings,restartCommand}); return;
      }
      if (pathname === '/api/events' && req.method === 'GET') {
        res.writeHead(200, {'Content-Type':'text/event-stream; charset=utf-8','Connection':'keep-alive','X-Accel-Buffering':'no'});
        res.write(`event: catalog\ndata: ${JSON.stringify({version:catalog.version,changedProjects:[],changedDocuments:[]})}\n\n`);
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
        const type=name.endsWith('.js')?'text/javascript':name.endsWith('.css')?'text/css':'text/html';
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
      const previous=catalog.version;
      const changes=await catalog.refresh();
      if(previous!==changes.version)for(const client of clients) {
        if(client.writableLength>1024*1024){client.destroy();clients.delete(client);continue;}
        client.write(`event: catalog\ndata: ${JSON.stringify(changes)}\n\n`);
      }
    } finally { polling=false; }
  }
  const interval=intervalMs>0?setInterval(()=>poll().catch(()=>{}),intervalMs):null;
  const heartbeat=setInterval(()=>{for(const client of clients){if(client.writableLength>1024*1024)client.destroy();else client.write(': heartbeat\n\n');}},15000);
  return {
    url:`http://127.0.0.1:${server.address().port}/`, catalog,
    async close() {
      closed=true;clearInterval(interval);clearInterval(heartbeat);
      for(const client of clients)client.end();
      const closing=new Promise(resolve=>server.close(resolve));
      for(const socket of sockets)socket.destroy();
      await closing;
    },
  };
}
