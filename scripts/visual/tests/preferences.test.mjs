import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fixture, request } from './helpers.mjs';
import { startWorkbench } from '../server.mjs';
import { normalizePreferences, savePreferences } from '../preferences.mjs';

const get = async url => JSON.parse((await request(url)).body);

export const tests = [
  ['normalizePreferences 把 v1 单值升级成数组并保留未知字段',()=>{
    const v1=normalizePreferences({version:1,updatedAt:'2026-11-15',preferences:{favoriteGenres:['悬疑推理'],preferredProtagonist:'男性主角（独角戏）',preferredPerspective:'第一人称',preferredTone:'紧张刺激',typicalChapterCount:20,customKey:{a:1}}});
    assert.deepEqual(v1.preferences.preferredProtagonist,['男性主角（独角戏）']);
    assert.deepEqual(v1.preferences.preferredPerspective,['第一人称']);
    assert.deepEqual(v1.preferences.preferredTone,['紧张刺激']);
    assert.equal(v1.preferences.typicalChapterCount,20);
    assert.deepEqual(v1.preferences.customKey,{a:1});
    assert.equal(v1.version,2);
  }],
  ['normalizePreferences 清洗列表并拒绝坏结构',()=>{
    const cleaned=normalizePreferences({preferences:{favoriteGenres:[' 悬疑推理 ','悬疑推理','',null,42],typicalChapterCount:999,dislikes:'人物过多'}});
    assert.deepEqual(cleaned.preferences.favoriteGenres,['悬疑推理']);
    assert.equal(cleaned.preferences.typicalChapterCount,null);
    assert.deepEqual(cleaned.preferences.dislikes,['人物过多']);
    assert.equal(normalizePreferences(null),null);
    assert.equal(normalizePreferences({preferences:'x'}),null);
    assert.equal(normalizePreferences([]),null);
  }],
  ['GET /api/projects 报告偏好：缺失为 null、损坏为 null、v1 归一化',async()=>{
    const f=await fixture();let server;
    try{
      server=await startWorkbench({workspace:f.root,intervalMs:0});
      assert.equal((await get(server.url+'api/projects')).preferences,null);
      await f.write('user-preferences.json','{ 坏 json');
      await server.catalog.refresh();
      assert.equal((await get(server.url+'api/projects')).preferences,null);
      await f.write('user-preferences.json',JSON.stringify({version:1,preferences:{preferredTone:'紧张刺激'}}));
      await server.catalog.refresh();
      const prefs=(await get(server.url+'api/projects')).preferences;
      assert.deepEqual(prefs.preferences.preferredTone,['紧张刺激']);
    }finally{if(server)await server.close();await f.close();}
  }],
  ['POST /api/preferences 校验令牌、类型与范围',async()=>{
    const f=await fixture();let server;
    try{
      await f.write('user-preferences.json',JSON.stringify({version:1,preferences:{}}));
      server=await startWorkbench({workspace:f.root,intervalMs:0});
      const token=(await get(server.url+'api/projects')).sessionToken;
      const post=(body,headers={})=>request(server.url+'api/preferences',{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(body)});
      assert.equal((await post({preferences:{}})).status,403);
      assert.equal((await request(server.url+'api/preferences',{method:'POST',headers:{'X-Workbench-Token':token},body:'{}'})).status,415);
      assert.equal((await post({preferences:{favoriteGenres:'悬疑'}},{'X-Workbench-Token':token})).status,400);
      assert.equal((await post({preferences:{typicalChapterCount:0}},{'X-Workbench-Token':token})).status,400);
      assert.equal((await post({preferences:{dislikes:['x'.repeat(101)]}},{'X-Workbench-Token':token})).status,400);
      assert.equal((await post({preferences:{}},{'X-Workbench-Token':token})).status,200);
    }finally{if(server)await server.close();await f.close();}
  }],
  ['POST 保留磁盘履历与未知字段，忽略请求里的履历',async()=>{
    const f=await fixture();let server;
    try{
      await f.write('user-preferences.json',JSON.stringify({version:1,updatedAt:'2026-01-01',preferences:{preferredTone:['沉重深刻'],customKeep:'留下我',creationHistory:[{title:'旧书',chapters:5,words:123}]}}));
      server=await startWorkbench({workspace:f.root,intervalMs:0});
      const token=(await get(server.url+'api/projects')).sessionToken;
      const saved=await request(server.url+'api/preferences',{method:'POST',headers:{'Content-Type':'application/json','X-Workbench-Token':token},body:JSON.stringify({preferences:{favoriteGenres:['悬疑推理'],preferredTone:['紧张刺激'],typicalChapterCount:20,creationHistory:[{title:'伪造的书'}]}})});
      assert.equal(saved.status,200);
      const onDisk=JSON.parse(await fs.readFile(path.join(f.root,'user-preferences.json'),'utf8'));
      assert.equal(onDisk.version,2);
      assert.deepEqual(onDisk.preferences.creationHistory,[{title:'旧书',chapters:5,words:123}]);
      assert.equal(onDisk.preferences.customKeep,'留下我');
      assert.deepEqual(onDisk.preferences.preferredTone,['紧张刺激']);
      assert.match(onDisk.updatedAt,/^\d{4}-\d{2}-\d{2}$/);
    }finally{if(server)await server.close();await f.close();}
  }],
  ['保存后 GET 反映新偏好，外部改动推进版本号',async()=>{
    const f=await fixture();let server;
    try{
      server=await startWorkbench({workspace:f.root,intervalMs:0});
      const token=(await get(server.url+'api/projects')).sessionToken;
      const v1=(await get(server.url+'api/projects')).version;
      const saved=await request(server.url+'api/preferences',{method:'POST',headers:{'Content-Type':'application/json','X-Workbench-Token':token},body:JSON.stringify({preferences:{favoriteGenres:['历史架空']}})});
      assert.equal(saved.status,200);
      let snapshot=await get(server.url+'api/projects');
      assert.deepEqual(snapshot.preferences.preferences.favoriteGenres,['历史架空']);
      const v2=snapshot.version;
      assert.notEqual(v2,v1);
      await f.write('user-preferences.json',JSON.stringify({version:2,preferences:{favoriteGenres:['科幻']}}));
      await server.catalog.refresh();
      snapshot=await get(server.url+'api/projects');
      assert.deepEqual(snapshot.preferences.preferences.favoriteGenres,['科幻']);
      assert.notEqual(snapshot.version,v2);
    }finally{if(server)await server.close();await f.close();}
  }],
  ['savePreferences 原子写并在 64KB 上限时拒绝',async()=>{
    const f=await fixture();
    try{
      await savePreferences(f.root,{preferences:{dislikes:Array.from({length:50},(_,i)=>'雷点'+i)}});
      const doc=JSON.parse(await fs.readFile(path.join(f.root,'user-preferences.json'),'utf8'));
      assert.equal(doc.preferences.dislikes.length,50);
      const leftovers=(await fs.readdir(f.root)).filter(name=>name.startsWith('.user-preferences'));
      assert.deepEqual(leftovers,[]);
      const big=()=>Array.from({length:50},(_,i)=>'深'.repeat(90)+'No.'+i);
      const oversized={favoriteGenres:big(),preferredProtagonist:big(),preferredPerspective:big(),preferredTone:big(),styleReferences:big(),dislikes:big()};
      await assert.rejects(()=>savePreferences(f.root,{preferences:oversized}),error=>error.status===413);
    }finally{await f.close();}
  }],
];
