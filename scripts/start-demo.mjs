// Synthetic vault only; never discovers or starts the live service.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const vault=path.join(root,'runtime/default'),home=path.join(root,'runtime/demo-home');
fs.mkdirSync(home,{recursive:true,mode:0o700});
// 既存の synthetic demo は一度だけ複製し、元は変更しない。
const legacy=path.join(root,'runtime/demo-vault');
if(!fs.existsSync(vault)&&fs.existsSync(legacy))fs.cpSync(legacy,vault,{recursive:true,errorOnExist:true,force:false});
const port=process.env.DAYLINE_DEMO_PORT||'44318';
if(!/^\d+$/.test(port)||Number(port)<1024||Number(port)>65535||port==='4317')throw new Error('Choose an unused demo port 1024–65535, never 4317');
if(process.argv.includes('--detach')){
  // 切り離し起動: サーバーを別プロセスで起こして、準備できたら戻る。出力はログへ流し、呼び出し元の stdout パイプを掴まない (起動済みなら再利用)。
  const { launch }=await import('../Dayline/scripts/launch.mjs');
  try{
    const result=await launch({home,defaultVault:vault,port:Number(port),openBrowser:false});
    console.log(`Synthetic TOODDAE: ${result.url}${result.reused?' (already running)':''}\nPID ${result.pid}; log ${path.join(home,'server.log')}; stop with: kill ${result.pid}`);
  }catch(error){console.error(error.message);process.exitCode=1;}
}else{
  const child=spawn(process.execPath,[path.join(root,'Dayline/server.js')],{cwd:path.join(root,'Dayline'),stdio:'inherit',env:{PATH:process.env.PATH||'',HOME:home,DAYLINE_DEFAULT_VAULT:vault,DAYLINE_HOME:home,PORT:port}});
  console.log(`Synthetic TOODDAE: http://127.0.0.1:${port}`);
  for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>child.kill(signal));
  child.on('exit',code=>{process.exitCode=code??1;});
}
