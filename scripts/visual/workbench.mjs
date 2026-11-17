#!/usr/bin/env node
import path from 'node:path';
import { startWorkbench } from './server.mjs';

const args=process.argv.slice(2);
if(args.includes('--help')||args.includes('-h')) {
  console.log('小说只读工作台\n用法: node <skillBaseDir>/scripts/visual/workbench.mjs --workspace <小说集合或单部小说目录> [--port 端口]\n默认目录: 当前目录/chinese-novelist\n停止服务: Ctrl+C；作品文件不会被修改。');
} else {
  try {
    const options={workspace:path.resolve('chinese-novelist'),port:0};
    for(let i=0;i<args.length;i++) {
      const arg=args[i],value=args[++i];
      if(arg==='--workspace'&&value)options.workspace=path.resolve(value);
      else if(arg==='--port'&&/^\d+$/.test(value||'')&&Number(value)<=65535)options.port=Number(value);
      else throw new Error('参数无效，请使用 --help 查看用法');
    }
    const service=await startWorkbench(options);
    console.log(`小说工作台：${service.url}\n工作区：${options.workspace}\n本地只读，文件变化后自动更新。停止服务按 Ctrl+C。`);
    for(const warning of service.catalog.warnings)console.log(warning);
    let stopping=false;
    const stop=async()=>{if(stopping)return;stopping=true;await service.close();};
    process.on('SIGINT',stop);process.on('SIGTERM',stop);
  } catch(error) { console.error(error.code==='EADDRINUSE'?'端口已占用，请改用 --port 0 或指定其他端口。':error.message);process.exitCode=1; }
}
