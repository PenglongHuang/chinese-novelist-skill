import assert from 'node:assert/strict';
import http from 'node:http';
import { fixture, plan, request } from './helpers.mjs';
import { startWorkbench } from '../server.mjs';

export const tests = [
  ['switches workspace only with session token and keeps current root on failure',async()=>{
    const a=await fixture(),b=await fixture();let service;
    try{
      await a.write('book/第01章.md','甲');await b.write('book/第01章.md','乙');
      service=await startWorkbench({workspace:a.root,intervalMs:0});
      const initial=JSON.parse((await request(service.url+'api/projects')).body);
      const data={method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({path:b.root})};
      assert.equal((await request(service.url+'api/workspaces/open',data)).status,403);
      data.headers['X-Workbench-Token']=initial.sessionToken;
      assert.equal((await request(service.url+'api/workspaces/open',data)).status,200);
      let current=JSON.parse((await request(service.url+'api/projects')).body);assert.equal(current.workspace,b.root);
      data.body=JSON.stringify({path:b.root+'/missing'});
      assert.equal((await request(service.url+'api/workspaces/open',data)).status,400);
      current=JSON.parse((await request(service.url+'api/projects')).body);assert.equal(current.workspace,b.root);
    }finally{if(service)await service.close();await a.close();await b.close();}
  }],
  ['serves read-only API and rejects traversal, foreign origin and host', async () => {
    const f = await fixture(); let server;
    try {
      await f.write('book/02-写作计划.json', plan()); await f.write('book/第02章-第二章.md', '# 你好');
      server = await startWorkbench({workspace:f.root, intervalMs:0});
      const result = await request(server.url + 'api/projects'); assert.equal(result.status, 200);
      const id = JSON.parse(result.body).projects[0].id;
      const project = JSON.parse((await request(server.url + `api/projects/${id}`)).body);
      const chapter = project.chapters.find(c => c.exists);
      assert.equal(JSON.parse((await request(server.url + `api/projects/${id}/documents/${chapter.id}`)).body).text, '# 你好');
      assert.equal((await request(server.url + 'api/projects', {method:'POST'})).status,405);
      assert.equal((await request(server.url + 'api/projects', {headers:{Host:'evil.example'}})).status,403);
      assert.equal((await request(server.url + 'api/projects', {headers:{Origin:'https://evil.example'}})).status,403);
      assert.equal((await request(server.url + '%2e%2e%2fREADME.md')).status,404);
      assert.equal((await request(server.url + `api/projects/${id}/assets/${Buffer.from('../../secret.png').toString('base64url')}`)).status,403);
      assert.equal((await request(server.url + 'unknown')).status,404);
      assert.match(result.headers['content-security-policy'], /default-src 'self'/);
    } finally { if(server)await server.close(); await f.close(); }
  }],
  ['SSE reports file changes and closes cleanly', async () => {
    const f = await fixture(); let server, connection;
    try {
      await f.write('book/第01章-一.md','一'); server=await startWorkbench({workspace:f.root,intervalMs:40});
      const events=[];
      await new Promise((resolve,reject)=>{
        connection=http.get(server.url+'api/events',res=>{res.setEncoding('utf8');res.on('data',chunk=>{events.push(chunk);if(events.join('').includes('event: catalog'))resolve();});});connection.on('error',reject);
      });
      await f.write('book/第02章-二.md','二');
      const deadline=Date.now()+3000;
      while(Date.now()<deadline && !events.join('').includes('chapter')) {
        if(server.catalog.listProjects()[0].chapters.length===2 && events.join('').match(/event: catalog/g).length>1)break;
        await new Promise(r=>setTimeout(r,30));
      }
      assert.equal(server.catalog.listProjects()[0].chapters.length,2);
      assert(events.join('').match(/event: catalog/g).length>=2);
    } finally { connection?.destroy(); if(server)await server.close();await f.close(); }
  }],
];
