import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { workspaceId, isOurService, ensureService, waitForReady, main } from '../scripts/launch.mjs';

const identity={ok:true,app:'PDF_GalaxAI',workspace_id:'test-workspace'};
async function withServer(handler,run) {
  const server=http.createServer((request,response) => {
    response.setHeader('Content-Type','application/json');
    response.end(JSON.stringify(handler(request)));
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const port=server.address().port;
  try { await run(`http://127.0.0.1:${port}/health`,port); }
  finally { server.closeAllConnections(); await new Promise(resolve=>server.close(resolve)); }
}

test('workspace identity is stable for Windows path case and slash differences',()=>{
  assert.equal(workspaceId('C:\\Users\\Asus\\Desktop\\PDF_GalaxAI'),workspaceId('c:/users/asus/desktop/pdf_galaxai/'));
  assert.notEqual(workspaceId('c:/project-a'),workspaceId('c:/project-b'));
});
test('readiness rejects unrelated servers and legacy bare ok responses',()=>{
  assert.equal(isOurService(identity,'test-workspace'),true);
  assert.equal(isOurService({ok:true},'test-workspace'),false);
  assert.equal(isOurService(identity,'another-workspace'),false);
  assert.equal(isOurService({...identity,ok:false},'test-workspace'),false);
});
test('a ready service is reused without spawning duplicate processes',async()=>{
  await withServer(()=>identity,async(url,port)=>{
    let started=false;
    const result=await ensureService({label:'test',url,port,expectedWorkspace:'test-workspace',start:()=>{started=true;}});
    assert.equal(result.reused,true);
    assert.equal(started,false);
  });
});
test('an occupied foreign port is reported, not killed or replaced',async()=>{
  await withServer(()=>({ok:true,app:'another-app'}),async(url,port)=>{
    let started=false;
    await assert.rejects(ensureService({label:'test',url,port,expectedWorkspace:'test-workspace',start:()=>{started=true;}}),/occupied/);
    assert.equal(started,false);
  });
});
test('launcher waits for real readiness instead of a fixed three-second delay',async()=>{
  let requests=0;
  await withServer(()=>++requests>=3 ? identity : {...identity,ok:false},async(url)=>{
    await waitForReady(url,'test-workspace',{timeoutMs:3000,pollMs:10});
    assert.ok(requests>=3);
  });
});
test('an owned initializing process is awaited, not launched a second time',async()=>{
  let requests=0;
  await withServer(()=>++requests>=3 ? identity : {...identity,ok:false},async(url,port)=>{
    let started=false;
    const result=await ensureService({label:'test',url,port,expectedWorkspace:'test-workspace',timeoutMs:3000,
      pending:{pid:process.pid,workspace_id:'test-workspace'},start:()=>{started=true;}});
    assert.equal(started,false);
    assert.equal(result.initializing,true);
  });
});
test('early process exit fails startup instead of opening a frontend-only page',async()=>{
  await withServer(()=>({ok:false}),async(url)=>{
    await assert.rejects(waitForReady(url,'test-workspace',{timeoutMs:1000,pollMs:10,alive:()=>false}),/exited before/);
  });
});
test('the renamed Windows launcher runs the full app without recursive calls or a demo URL',async()=>{
  const cmd=fs.readFileSync(fileURLToPath(new URL('../PDF_GalaxAI.cmd',import.meta.url)),'utf8');
  assert.match(cmd,/node scripts\\launch\.mjs/);
  assert.match(cmd,/pushd "%~dp0"/);
  assert.match(cmd,/set "GALAXAI_EXIT_CODE=%errorlevel%"/);
  assert.doesNotMatch(cmd,/call\s+"%~dp0PDF_GalaxAI\.cmd"/i);
  assert.doesNotMatch(cmd,/graphicsDemo=1|timeout \/t 3/);
  await assert.rejects(main(['--demo']),/Unknown launcher option/);
});

test('source packaging requires the current launcher, not the removed alias',()=>{
  const packaging=fs.readFileSync(fileURLToPath(new URL('../scripts/package_github.py',import.meta.url)),'utf8');
  const rootFiles=packaging.match(/ROOT_FILES\s*=\s*\(([\s\S]*?)\)/)?.[1];
  assert.ok(rootFiles);
  const launchers=[...rootFiles.matchAll(/"([^"]+\.cmd)"/g)].map(match=>match[1]);
  assert.deepEqual(launchers,['PDF_GalaxAI.cmd']);
  for (const launcher of launchers) assert.ok(fs.existsSync(fileURLToPath(new URL(`../${launcher}`,import.meta.url))));
});
