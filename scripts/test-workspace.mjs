// All generated notes, keys and browser profiles remain inside this workspace.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),app=path.join(root,'Dayline');
const tmp=path.join(root,'runtime/tmp'),home=path.join(root,'runtime/test-home');
for(const dir of [tmp,home,path.join(root,'evidence')])fs.mkdirSync(dir,{recursive:true});
const env={...Object.fromEntries(Object.entries(process.env).filter(([key])=>!/API_KEY|TOKEN|SECRET|PASSWORD/i.test(key))),TMPDIR:tmp,TMP:tmp,TEMP:tmp,DAYLINE_HOME:home};
function run(args){const r=spawnSync(process.execPath,args,{cwd:app,env,stdio:'inherit'});if(r.status!==0)process.exit(r.status??1);}
run(['--test',...fs.readdirSync(path.join(app,'test')).filter(f=>f.endsWith('.test.js')).map(f=>'test/'+f)]);
run(['test/playwright/lint.mjs']);
const cli=path.join(app,'test/playwright/node_modules/playwright/cli.js');
if(!fs.existsSync(cli))throw new Error('Install the pinned test dependencies first: cd Dayline/test/playwright && npm ci --ignore-scripts --omit=optional');
const projects=process.argv.includes('--chromium-only')?['--project=chromium','--project=mobile-chrome']:[];
run([cli,'test','--config=test/playwright/playwright.config.js','--workers=3','--repeat-each=2',...projects]);
