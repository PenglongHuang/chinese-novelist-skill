#!/usr/bin/env node
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { startWorkbench } from './server.mjs';

const args=process.argv.slice(2);
const usage='小说书房 · 本地只读\n用法: node <skillBaseDir>/scripts/visual/workbench.mjs [--workspace <小说集合或单部小说目录>] [--port 端口] [--detach]\n--workspace 可省，默认当前目录下的 .chinese-novelist/。\n--detach 后台启动：命令立即返回，服务脱离会话存活（Agent 调用必用，否则会阻塞到超时）；后台默认端口 5112，可用 --port 覆盖，已运行则自动复用；日志在系统临时目录 novel-workbench-<端口>.log。\n前台运行时端口上已有本工具实例会自动探活复用；Ctrl+C 停止，作品文件不会被修改。';

/* 端口探活：已运行的书房实例直接复用（识别特征：/api/projects 返回带 workspace 的 JSON） */
const probeExisting=port=>new Promise(resolve=>{
  const request=http.get({host:'127.0.0.1',port,path:'/api/projects',timeout:1500},response=>{
    let body='';
    response.setEncoding('utf8');
    response.on('data',chunk=>body+=chunk);
    response.on('end',()=>{try{const data=JSON.parse(body);resolve(data&&typeof data.workspace==='string'?data:null);}catch{resolve(null);}});
  });
  request.on('timeout',()=>{request.destroy();resolve(null);});
  request.on('error',()=>resolve(null));
});

/* 启动横幅：Windows Terminal / Unix 上用 ANSI 上色（印朱＋淡墨），老控制台与重定向时降级纯文本 */
function banner({url,workspace,projects=[],reused=false,note}){
  const color=!!process.stdout.isTTY&&!process.env.NO_COLOR&&(process.platform!=='win32'||process.env.WT_SESSION||/xterm|vt100|vt220|ansi/i.test(process.env.TERM||''));
  const c=(code,text)=>color?`\x1b[${code}m${text}\x1b[0m`:text;
  const chapters=projects.reduce((n,p)=>n+p.chapters.filter(x=>x.exists).length,0);
  const words=projects.reduce((n,p)=>n+(p.actualWords||0),0);
  const line=(label,value)=>`  ${c('2',label.padEnd(4,'　'))}  ${value}`;
  console.log('');
  console.log(`  ${c('38;5;160','▍')} ${c('1','小说书房')} ${c('2',reused?'· 已在运行，直接复用':'· 本地只读')}`);
  console.log(`  ${c('38;5;160','▍')} ${c('2','作品文件不会被修改 · 文件变化后自动更新')}`);
  console.log('');
  console.log(line('地址',c('1',url)));
  console.log(line('工作区',workspace));
  if(projects.length)console.log(line('作品',`${projects.length} 部 · ${chapters} 章正文 · ${words.toLocaleString('zh-CN')} 字`));
  console.log('');
  console.log(`  ${c('2',reused?'无需重复启动，浏览器打开上面的地址即可':'Ctrl+C 停止服务')}`);
  if(note)console.log(c('33',`  ⚠ ${note}`));
}

if(args.includes('--help')||args.includes('-h')) {
  console.log(usage);
} else {
  try {
    const options={workspace:path.resolve('.chinese-novelist'),port:0,detach:false};
    for(let i=0;i<args.length;i++) {
      const arg=args[i];
      if(arg==='--detach'){options.detach=true;continue;}
      const value=args[++i];
      if(arg==='--workspace'&&value)options.workspace=path.resolve(value);
      else if(arg==='--port'&&/^\d+$/.test(value||'')&&Number(value)<=65535)options.port=Number(value);
      else throw new Error('参数无效，请使用 --help 查看用法');
    }
    if(options.detach) {
      /* 后台自举：Agent 的 shell 调用会阻塞到超时，必须脱壳——本进程只负责拉起脱离会话的子进程并报告地址后立即退出 */
      const port=options.port||5112;
      const existing=await probeExisting(port);
      if(existing){
        const note=existing.workspace&&path.resolve(existing.workspace)!==path.resolve(options.workspace)?`该实例的工作区是 ${existing.workspace}，与本次指定不同；如需另开实例请用 --port 0（前台）。`:null;
        banner({url:`http://127.0.0.1:${port}/`,workspace:existing.workspace,reused:true,note,projects:existing.projects||[]});
        process.exit(0);
      }
      const log=path.join(os.tmpdir(),`novel-workbench-${port}.log`);
      const childArgs=args.filter(a=>a!=='--detach');
      if(!childArgs.includes('--port'))childArgs.push('--port',String(port));
      const fd=fs.openSync(log,'a');
      /* 注意 unref() 返回 undefined，必须先接住 child 再调用 */
      const child=spawn(process.execPath,[fileURLToPath(import.meta.url),...childArgs],{detached:true,stdio:['ignore',fd,fd],windowsHide:true});
      child.unref();
      let spawnError=null;
      child.on('error',error=>{spawnError=error;});
      for(let i=0;i<40;i++){
        await new Promise(r=>setTimeout(r,250));
        if(await probeExisting(port)){
          console.log(`✓ 书房已在后台启动：http://127.0.0.1:${port}/（进程 PID ${child.pid}，日志 ${log}）`);
          process.exit(0);
        }
        if(spawnError||child.exitCode!==null){console.error(`后台启动失败（${spawnError?.code||spawnError?.message||'子进程已退出'}），日志见 ${log}`);process.exit(1);}
      }
      console.error(`后台启动超时（10 秒），日志见 ${log}；写作继续，不阻塞。`);
      process.exit(1);
    }
    if(options.port>0) {
      const existing=await probeExisting(options.port);
      if(existing){
        const note=existing.workspace&&path.resolve(existing.workspace)!==path.resolve(options.workspace)?`该实例的工作区是 ${existing.workspace}，与本次指定不同；如需另开实例请用 --port 0。`:null;
        banner({url:`http://127.0.0.1:${options.port}/`,workspace:existing.workspace,reused:true,note,projects:existing.projects||[]});
        process.exit(0);
      }
    }
    const service=await startWorkbench(options);
    banner({url:service.url,workspace:options.workspace,projects:service.catalog.listProjects()});
    for(const warning of service.catalog.warnings)console.log(`  ⚠ ${warning}`);
    let stopping=false;
    const stop=async()=>{if(stopping)return;stopping=true;await service.close();};
    process.on('SIGINT',stop);process.on('SIGTERM',stop);
  } catch(error) { console.error(error.code==='EADDRINUSE'?'端口已占用（且不是本工具实例），请改用 --port 0 或指定其他端口。':error.message);process.exitCode=1; }
}
