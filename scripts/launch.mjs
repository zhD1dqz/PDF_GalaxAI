/** Window-owned full-app session. Windows uses a kill-on-close Job Object. */
import { spawn, spawnSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';

export const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const APP = 'PDF_GalaxAI';
const FRONTEND_URL = 'http://127.0.0.1:3000';
const BACKEND_URL = 'http://127.0.0.1:8000';

export function workspaceId(root) {
  return createHash('sha256').update(root.replace(/\\/g, '/').replace(/\/$/, '').toLowerCase()).digest('hex').slice(0, 16);
}

export async function readJSON(url, timeoutMs = 2500, signal) {
  try {
    const response = await fetch(url, {
      signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)]) : AbortSignal.timeout(timeoutMs), cache: 'no-store',
    });
    return response.ok ? await response.json() : null;
  } catch { return null; }
}

export function isOurService(body, expectedWorkspace) {
  return body?.ok === true && body.app === APP && body.workspace_id === expectedWorkspace;
}

export function portInUse(port) {
  return new Promise(resolve => {
    const socket = net.createConnection({ host: '127.0.0.1', port });
    let done = false;
    const finish = value => { if (!done) { done = true; socket.destroy(); resolve(value); } };
    socket.setTimeout(600);
    socket.once('connect', () => finish(true)); socket.once('error', () => finish(false)); socket.once('timeout', () => finish(false));
  });
}

export async function waitForReady(url, expectedWorkspace, {
  timeoutMs = 240000, pollMs = 650, alive = () => true, onWaiting = () => {}, signal,
} = {}) {
  const start = Date.now();
  let lastReport = -10000;
  while (Date.now() - start < timeoutMs) {
    signal?.throwIfAborted();
    if (isOurService(await readJSON(url, 2500, signal), expectedWorkspace)) return;
    signal?.throwIfAborted();
    if (!alive()) throw new Error('Service exited before it became ready. See the startup logs.');
    const elapsed = Date.now() - start;
    if (elapsed - lastReport >= 8000) { onWaiting(Math.floor(elapsed / 1000)); lastReport = elapsed; }
    await delay(pollMs, undefined, { signal });
  }
  throw new Error(`Startup timed out after ${Math.round(timeoutMs / 1000)} seconds. See the startup logs.`);
}

export async function assertServiceAvailable({ label, url, port, expectedWorkspace }) {
  const body = await readJSON(url);
  if (isOurService(body, expectedWorkspace)) throw new Error(`${label} is already running in another window. Keep that window open, or close it before starting a new session. Legacy background services must be stopped separately.`);
  if (body || await portInUse(port)) throw new Error(`Port ${port} is occupied by another service or project copy. No existing process was stopped.`);
}

export async function ensureService({ label, url, port, expectedWorkspace, start, timeoutMs = 240000, signal }) {
  // Never adopt an old PID: it does not belong to this window's Job Object.
  await assertServiceAvailable({ label, url, port, expectedWorkspace });
  signal?.throwIfAborted();
  console.log(`[start] ${label} ...`);
  const child = await start();
  await waitForReady(url, expectedWorkspace, {
    timeoutMs, signal, alive: () => child.exitCode === null && !child.killed,
    onWaiting: elapsed => console.log(`[wait] ${label} initialization: ${elapsed}s`),
  });
  return { pid: child.pid };
}

export function findPython(root) {
  const candidates = process.platform === 'win32'
    ? [path.join(root, '.venv/Scripts/python.exe'), path.join(root, 'backend/.venv/Scripts/python.exe'), 'python', 'python3']
    : [path.join(root, '.venv/bin/python'), path.join(root, 'backend/.venv/bin/python'), 'python3', 'python'];
  for (const candidate of candidates) {
    if (path.isAbsolute(candidate) && !fs.existsSync(candidate)) continue;
    const result = spawnSync(candidate, ['-c', 'import sys; print(sys.executable); sys.exit(0 if sys.version_info >= (3,10) else 1)'], { encoding: 'utf8', windowsHide: true, timeout: 10000 });
    if (!result.error && result.status === 0) return result.stdout.trim();
  }
  throw new Error('Python 3.10+ was not found. Install Python or create a project .venv.');
}

export async function stopChildren(children, graceMs = 2500) {
  await Promise.all([...children].reverse().map(child => new Promise(resolve => {
    if (child.exitCode !== null || child.signalCode) return resolve();
    const timer = setTimeout(() => child.kill('SIGKILL'), graceMs);
    child.once('exit', () => { clearTimeout(timer); resolve(); });
    child.kill('SIGTERM'); // Only ChildProcess handles created by this session.
  })));
}

export async function acquireSessionLock(logs, expectedWorkspace) {
  const nonce = randomUUID();
  const endpoint = process.platform === 'win32' ? `\\\\.\\pipe\\galaxai-session-${expectedWorkspace}` : path.join(logs, 'launcher.sock');
  const server = net.createServer(socket => socket.end(`${expectedWorkspace}\n`));
  // Kernel IPC ownership avoids mistaking a recycled PID for an old launcher.
  if (process.platform !== 'win32' && fs.existsSync(endpoint)) {
    const active = await new Promise(resolve => {
      const socket = net.createConnection(endpoint);
      socket.setTimeout(500);
      socket.once('connect', () => { socket.destroy(); resolve(true); });
      socket.once('error', error => { socket.destroy(); resolve(!['ECONNREFUSED', 'ENOENT'].includes(error.code)); });
      socket.once('timeout', () => { socket.destroy(); resolve(true); });
    });
    if (!active) fs.unlinkSync(endpoint);
  }
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(endpoint, resolve); }).catch(error => {
    if (['EADDRINUSE', 'EACCES'].includes(error.code)) throw new Error('This project already has a launcher window open. Use or close that window first.');
    throw error;
  });
  server.unref();
  const lockPath = path.join(logs, 'launcher.lock');
  try { fs.writeFileSync(lockPath, JSON.stringify({ pid: process.pid, workspace_id: expectedWorkspace, nonce, endpoint })); }
  catch (error) { await new Promise(resolve => server.close(resolve)); throw error; }
  return async () => {
    await new Promise(resolve => server.close(resolve));
    try { if (JSON.parse(fs.readFileSync(lockPath, 'utf8')).nonce === nonce) fs.unlinkSync(lockPath); } catch {}
  };
}

function openBrowser(url) {
  const command = process.platform === 'win32' ? 'rundll32.exe' : process.platform === 'darwin' ? 'open' : 'xdg-open';
  const args = process.platform === 'win32' ? ['url.dll,FileProtocolHandler', url] : [url];
  const child = spawn(command, args, { detached: true, windowsHide: true, stdio: 'ignore' });
  child.once('error', () => console.log(`[open] Open this URL manually: ${url}`)); child.unref();
}

function validateArguments(args) {
  const allowed = new Set(['--no-browser', '--check-only']);
  for (const arg of args) if (!allowed.has(arg)) throw new Error(`Unknown launcher option: ${arg}`);
  const [major, minor] = process.versions.node.split('.').map(Number);
  if (!((major === 20 && minor >= 19) || (major === 22 && minor >= 12) || major > 22)) throw new Error('Install Node.js 20.19+ or 22.12+.');
}

export async function main(args = process.argv.slice(2)) {
  validateArguments(args);
  const expectedWorkspace = workspaceId(PROJECT_ROOT);
  if (args.includes('--check-only')) {
    const backend = isOurService(await readJSON(`${BACKEND_URL}/api/health`), expectedWorkspace);
    const frontend = isOurService(await readJSON(`${FRONTEND_URL}/__galaxai/instance`), expectedWorkspace);
    const proxy = isOurService(await readJSON(`${FRONTEND_URL}/api/health`), expectedWorkspace);
    console.log(JSON.stringify({ backend, frontend, proxy, url: FRONTEND_URL }, null, 2));
    if (!backend || !frontend || !proxy) throw new Error('The complete application is not ready. Run PDF_GalaxAI.cmd.');
    return;
  }
  const logs = path.join(PROJECT_ROOT, 'logs'); fs.mkdirSync(logs, { recursive: true });
  const owned = [], controller = new AbortController();
  const state = { workspace_id: expectedWorkspace, owner_pid: process.pid, started_at: new Date().toISOString(), mode: 'window-owned' };
  let stopping = false, failure, releaseLock, resolveStop;
  const stopped = new Promise(resolve => { resolveStop = resolve; });
  const stop = error => { if (!stopping) { stopping = true; failure = error; controller.abort(); resolveStop(); } };
  const onSignal = () => stop();
  const signals = ['SIGINT', 'SIGTERM', 'SIGHUP', ...(process.platform === 'win32' ? ['SIGBREAK'] : [])];
  for (const signal of signals) process.on(signal, onSignal);
  const persist = () => fs.writeFileSync(path.join(logs, 'launcher-processes.json'), JSON.stringify(state, null, 2));
  const startService = (label, command, commandArgs, cwd, fatalExit = true) => {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const stdout = path.join(logs, `${label}-${stamp}.log`), stderr = path.join(logs, `${label}-${stamp}.error.log`);
    const out = fs.openSync(stdout, 'a'), err = fs.openSync(stderr, 'a');
    let child;
    try { child = spawn(command, commandArgs, {
      cwd, detached: false, windowsHide: true, stdio: ['ignore', out, err],
      env: { ...process.env, PYTHONUTF8: '1', TEMP: logs, TMP: logs },
    }); } finally { fs.closeSync(out); fs.closeSync(err); }
    return new Promise((resolve, reject) => {
      child.once('error', reject);
      child.once('spawn', () => {
        owned.push(child);
        state[label] = { pid: child.pid, started_at: new Date().toISOString(), stdout, stderr };
        try { persist(); } catch (error) { reject(error); return; }
        child.once('exit', code => { if (fatalExit && !stopping) stop(new Error(`${label} exited unexpectedly (${code}). See ${stderr}`)); });
        console.log(`[log] ${label}: ${stderr}`); resolve(child);
      });
    });
  };
  try {
    releaseLock = await acquireSessionLock(logs, expectedWorkspace);
    console.log('\nPDF_GalaxAI: starting the real PDF library + backend.');
    console.log('[session] Keep THIS window open. Close it or press Ctrl+C to stop both services.');
    // Check both ports first; never adopt or stop an existing listener.
    await assertServiceAvailable({ label: 'backend', url: `${BACKEND_URL}/api/health`, port: 8000, expectedWorkspace });
    await assertServiceAvailable({ label: 'frontend', url: `${FRONTEND_URL}/__galaxai/instance`, port: 3000, expectedWorkspace });
    controller.signal.throwIfAborted();
    if (!fs.existsSync(path.join(PROJECT_ROOT, 'node_modules/vite/bin/vite.js'))) {
      console.log('[init] Installing frontend dependencies. Keep this window open; progress is in the dependencies log.');
      const installer = process.platform === 'win32'
        ? await startService('dependencies', 'cmd.exe', ['/d', '/s', '/c', 'npm ci'], PROJECT_ROOT, false)
        : await startService('dependencies', 'npm', ['ci'], PROJECT_ROOT, false);
      const code = await Promise.race([
        installer.exitCode !== null ? Promise.resolve(installer.exitCode) : new Promise(resolve => installer.once('exit', resolve)),
        stopped.then(() => controller.signal.throwIfAborted()),
      ]);
      if (code !== 0) throw new Error('npm ci failed. Check the dependencies log and your network connection.');
    }
    const python = findPython(PROJECT_ROOT);
    const modules = spawnSync(python, ['-c', 'import fastapi, uvicorn'], { encoding: 'utf8', windowsHide: true, timeout: 30000 });
    if (modules.error || modules.status !== 0) throw new Error(`Backend dependencies are missing. Run: "${python}" -m pip install -r backend/requirements.txt`);
    controller.signal.throwIfAborted();
    await ensureService({ label: 'backend', url: `${BACKEND_URL}/api/health`, port: 8000, expectedWorkspace, signal: controller.signal,
      start: () => startService('backend', python, ['-u', '-m', 'uvicorn', 'main:app', '--host', '127.0.0.1', '--port', '8000'], path.join(PROJECT_ROOT, 'backend')),
    });
    await ensureService({ label: 'frontend', url: `${FRONTEND_URL}/__galaxai/instance`, port: 3000, expectedWorkspace, signal: controller.signal,
      start: () => startService('frontend', process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', '3000', '--strictPort', '--configLoader', 'runner'], PROJECT_ROOT),
    });
    await waitForReady(`${FRONTEND_URL}/api/health`, expectedWorkspace, { timeoutMs: 20000, signal: controller.signal });
    const graph = await readJSON(`${FRONTEND_URL}/api/papers`, 15000, controller.signal);
    controller.signal.throwIfAborted();
    if (!graph || !Array.isArray(graph.papers) || !Array.isArray(graph.edges)) throw new Error('The frontend paper API proxy did not return a valid library.');
    console.log(`[ready] Backend connected through the frontend. ${graph.papers.length} real papers loaded.`);
    console.log(`[ready] ${FRONTEND_URL}/`);
    console.log('[session] Running. Closing the webpage does not stop services; closing THIS window does.');
    if (!args.includes('--no-browser')) openBrowser(`${FRONTEND_URL}/`);
    await stopped;
    if (failure) throw failure;
  } catch (error) { if (!stopping || failure) throw failure || error; }
  finally {
    stopping = true; controller.abort();
    try { await stopChildren(owned); }
    finally {
      if (owned.length) {
        state.stopped_at = new Date().toISOString();
        for (const label of ['backend', 'frontend']) if (state[label]) state[label].stopped = true;
        try { persist(); } catch {}
      }
      await releaseLock?.();
      for (const signal of signals) process.removeListener(signal, onSignal);
    }
    if (owned.length) console.log('[stopped] This session\'s frontend and backend have stopped.');
  }
}

export async function runCLI(args = process.argv.slice(2)) {
  validateArguments(args);
  if (process.platform !== 'win32' || args.includes('--check-only') || process.env.GALAXAI_MANAGED_SESSION === '1') return main(args);
  const python = findPython(PROJECT_ROOT);
  const childArgs = args.includes('--no-browser') ? args : [...args, '--no-browser'];
  const supervisor = spawn(python, ['-u', path.join(PROJECT_ROOT, 'scripts/windows_supervisor.py'), process.execPath, fileURLToPath(import.meta.url), ...childArgs], {
    cwd: PROJECT_ROOT, detached: false, windowsHide: true, stdio: ['pipe', 'pipe', 'inherit'], env: { ...process.env, PYTHONUTF8: '1' },
  });
  let buffer = '', opened = false;
  supervisor.stdout.on('data', chunk => {
    process.stdout.write(chunk); buffer += chunk.toString();
    const lines = buffer.split(/\r?\n/); buffer = lines.pop();
    for (const line of lines) if (!opened && !args.includes('--no-browser') && line === `[ready] ${FRONTEND_URL}/`) {
      opened = true; openBrowser(`${FRONTEND_URL}/`); // Browser stays OUTSIDE the Job Object.
    }
  });
  supervisor.stdin.on('error', () => {});
  const stop = () => supervisor.stdin.end();
  const signals = ['SIGINT', 'SIGTERM', 'SIGHUP', 'SIGBREAK'];
  for (const signal of signals) process.on(signal, stop);
  try {
    const code = await new Promise((resolve, reject) => {
      supervisor.once('error', reject); supervisor.once('exit', (code, signal) => resolve(code ?? (signal ? 1 : 0)));
    });
    if (code !== 0) throw new Error(`Launcher session exited (${code}).`);
  } finally { for (const signal of signals) process.removeListener(signal, stop); supervisor.stdin.end(); }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runCLI().catch(error => { console.error(`[error] ${error.message}`); console.error(`[logs] ${path.join(PROJECT_ROOT, 'logs')}`); process.exitCode = 1; });
}
