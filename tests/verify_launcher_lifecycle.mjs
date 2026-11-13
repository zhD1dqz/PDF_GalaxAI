/** Optional real-library test: requires installed dependencies and free 3000/8000. */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import fs from 'node:fs';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { PROJECT_ROOT, portInUse, readJSON, workspaceId } from '../scripts/launch.mjs';

async function waitUntil(check, timeoutMs, description) {
  const deadline=Date.now()+timeoutMs;
  while(Date.now()<deadline) { if(await check())return; await delay(200); }
  throw new Error(`Timed out: ${description}`);
}

if(process.platform!=='win32')throw new Error('This optional hard-close test is for Windows.');
for(const port of [3000,8000])assert.equal(await portInUse(port),false,`Port ${port} must be free; this test never stops existing services.`);
const libraryPath=path.join(PROJECT_ROOT,'backend/data/papers.json');
const snapshot=()=>{
  if(!fs.existsSync(libraryPath))return [];
  const data=JSON.parse(fs.readFileSync(libraryPath,'utf8'));
  return (Array.isArray(data)?data:data.papers).map(p=>({id:p.id,pos:p.pos}));
};
const before=snapshot();
for(let attempt=1;attempt<=2;attempt++) {
  console.log(`[test] Starting real launcher, attempt ${attempt}.`);
  const owner=spawn(process.execPath,['scripts/launch.mjs','--no-browser'],{cwd:PROJECT_ROOT,windowsHide:true,stdio:['pipe','pipe','pipe']});
  const exited=once(owner,'exit');
  let output='',errors='';
  owner.stdout.on('data',chunk=>{output+=chunk.toString();process.stdout.write(chunk);});
  owner.stderr.on('data',chunk=>{errors+=chunk.toString();process.stderr.write(chunk);});
  try {
    await waitUntil(()=>{
      if(owner.exitCode!==null)throw new Error(`Launcher exited before readiness: ${errors}`);
      return output.includes('[ready] http://127.0.0.1:3000/');
    },240000,'full library readiness');
    const expected=workspaceId(PROJECT_ROOT);
    for(const url of ['http://127.0.0.1:8000/api/health','http://127.0.0.1:3000/__galaxai/instance','http://127.0.0.1:3000/api/health']) {
      const body=await readJSON(url);
      assert.equal(body?.workspace_id,expected);
      assert.equal(body?.ok,true);
    }
    const graph=await readJSON('http://127.0.0.1:3000/api/papers',15000);
    assert.equal(graph.papers.length,before.length);
    assert.equal(owner.exitCode,null,'the owning launcher must remain alive');
    console.log(`[test] ${graph.papers.length} real PDFs loaded; forcibly closing launcher PID ${owner.pid}.`);
    owner.kill(); // Abrupt parent death simulates closing its terminal, not a cooperative shutdown.
    await exited;
    await waitUntil(async()=>!await portInUse(3000)&&!await portInUse(8000),15000,'both ports released after owner death');
    assert.deepEqual(snapshot(),before,'paper IDs or semantic coordinates changed');
    console.log(`[test] Attempt ${attempt}: both ports released; paper IDs and coordinates unchanged.`);
  } finally {
    if(owner.exitCode===null&&!owner.signalCode) {owner.kill();await exited;}
  }
}
console.log('[test] PASS: real startup, hard-close cleanup, and subsequent restart.');
