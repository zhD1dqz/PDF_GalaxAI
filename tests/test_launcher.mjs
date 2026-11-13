import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { PROJECT_ROOT, workspaceId, isOurService, ensureService, waitForReady, main, acquireSessionLock, findPython, portInUse, stopChildren } from '../scripts/launch.mjs';

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
test('an existing same-project service is not adopted by a different window',async()=>{
  await withServer(()=>identity,async(url,port)=>{
    let started=false;
    await assert.rejects(ensureService({label:'test',url,port,expectedWorkspace:'test-workspace',start:()=>{started=true;}}),/already running in another window/);
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
test('shutdown cancels initialization without waiting for its long startup timeout',async()=>{
  await withServer(()=>({ok:false}),async(url)=>{
    const controller=new AbortController();
    const pending=waitForReady(url,'test-workspace',{timeoutMs:240000,pollMs:10,signal:controller.signal});
    controller.abort();
    await assert.rejects(pending,/abort/i);
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
  assert.ok(fs.existsSync(path.join(PROJECT_ROOT,'scripts/windows_supervisor.py')));
});

test('session lock rejects a second live owner and ignores recycled legacy PIDs',async()=>{
  const logs=fs.mkdtempSync(path.join(os.tmpdir(),'galaxai-lock-'));
  const id=workspaceId(logs);
  // A legacy PID that now belongs to this test process must not block startup.
  fs.writeFileSync(path.join(logs,'launcher.lock'),JSON.stringify({pid:process.pid,workspace_id:id,nonce:'legacy'}));
  const release=await acquireSessionLock(logs,id);
  try { await assert.rejects(acquireSessionLock(logs,id),/already has a launcher window/); }
  finally { await release(); }
  const releaseAgain=await acquireSessionLock(logs,id);
  await releaseAgain();
  assert.equal(fs.existsSync(path.join(logs,'launcher.lock')),false);
  fs.rmdirSync(logs);
});

test('normal cleanup stops only owned ChildProcess handles',async()=>{
  const owned=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{windowsHide:true,stdio:'ignore'});
  const unrelated=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{windowsHide:true,stdio:'ignore'});
  await Promise.all([once(owned,'spawn'),once(unrelated,'spawn')]);
  try {
    await stopChildren([owned]);
    assert.ok(owned.exitCode!==null||owned.signalCode);
    assert.equal(unrelated.exitCode,null);
    assert.equal(unrelated.killed,false);
  } finally { unrelated.kill(); await once(unrelated,'exit'); }
});

for (const mode of ['parent-pipe-closed','supervisor-killed','outer-launcher-killed','startup-failure']) {
  test(`Windows job reaps frontend, backend and grandchild on ${mode}`,{skip:process.platform!=='win32',timeout:25000},async()=>{
    const python=findPython(PROJECT_ROOT);
    const supervisor=path.join(PROJECT_ROOT,'scripts/windows_supervisor.py');
    const fixture=path.join(PROJECT_ROOT,'tests/fixtures/window_child.mjs');
    const child=mode==='outer-launcher-killed'
      ? spawn(process.execPath,[fixture,'--owner',python,supervisor],{windowsHide:true,stdio:['pipe','pipe','pipe']})
      : spawn(python,['-u',supervisor,process.execPath,fixture,...(mode==='startup-failure'?['--fail']:[])],{windowsHide:true,stdio:['pipe','pipe','pipe']});
    const exited=once(child,'exit');
    const records=[]; let output='',errors='';
    child.stdin.on('error',()=>{});
    child.stdout.on('data',chunk=>{
      output+=chunk.toString();
      const lines=output.split(/\r?\n/); output=lines.pop();
      for(const line of lines) try { const record=JSON.parse(line); if(record.port)records.push(record); } catch {}
    });
    child.stderr.on('data',chunk=>{errors+=chunk.toString();});
    try {
      const deadline=Date.now()+10000;
      while(records.length<3 && child.exitCode===null && Date.now()<deadline)await delay(25);
      assert.equal(records.length,3,`fixture did not start three descendants: ${errors}`);
      await withServer(()=>identity,async(url,unrelatedPort)=>{
        if(mode==='parent-pipe-closed')child.stdin.end();
        else if(mode!=='startup-failure')child.kill();
        const [exitCode]=await exited;
        if(mode==='parent-pipe-closed')assert.equal(exitCode,0,errors);
        if(mode==='startup-failure')assert.equal(exitCode,2,errors);
        assert.doesNotMatch(errors,/Fatal Python error/);
        const stopDeadline=Date.now()+7000;
        while((await Promise.all(records.map(record=>portInUse(record.port)))).some(Boolean) && Date.now()<stopDeadline) await delay(50);
        for(const record of records) assert.equal(await portInUse(record.port),false,`${record.role} port ${record.port} leaked`);
        assert.equal(await portInUse(unrelatedPort),true,'an unrelated server was stopped');
      });
    } finally {
      child.stdin.end();
      if(child.exitCode===null && !child.signalCode) { child.kill(); await exited; }
    }
  });
}
