/** Full-app launcher; no new runtime dependency and no PowerShell policy override. */
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

export async function readJSON(url, timeoutMs = 2500) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(timeoutMs), cache: 'no-store' });
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
    socket.once('connect', () => finish(true));
    socket.once('error', () => finish(false));
    socket.once('timeout', () => finish(false));
  });
}

export async function waitForReady(url, expectedWorkspace, {
  timeoutMs = 240000, pollMs = 650, alive = () => true, onWaiting = () => {},
} = {}) {
  const start = Date.now();
  let lastReport = -10000;
  while (Date.now() - start < timeoutMs) {
    if (isOurService(await readJSON(url), expectedWorkspace)) return;
    if (!alive()) throw new Error('Service exited before it became ready. See the startup logs.');
    const elapsed = Date.now() - start;
    if (elapsed - lastReport >= 8000) { onWaiting(Math.floor(elapsed / 1000)); lastReport = elapsed; }
    await delay(pollMs);
  }
  throw new Error(`Startup timed out after ${Math.round(timeoutMs / 1000)} seconds. See the startup logs.`);
}

export async function ensureService({ label, url, port, expectedWorkspace, start, pending, timeoutMs = 240000 }) {
  if (isOurService(await readJSON(url), expectedWorkspace)) {
    console.log(`[reuse] ${label} is already ready on port ${port}.`);
    return { reused: true };
  }
  // A large first import may still be running after a launcher timeout. Reuse
  // the process recorded by this workspace, instead of spawning a second importer.
  if (pending?.workspace_id === expectedWorkspace && pidIsAlive(pending.pid)) {
    console.log(`[wait] Reusing the initializing ${label} process (${pending.pid}).`);
    await waitForReady(url, expectedWorkspace, {
      timeoutMs, alive: () => pidIsAlive(pending.pid),
      onWaiting: elapsed => console.log(`[wait] ${label} initialization: ${elapsed}s`),
    });
    return { reused: true, initializing: true, pid: pending.pid };
  }
  if (await portInUse(port)) {
    throw new Error(`Port ${port} is occupied by an old or different service. Close that service and run this launcher again. No existing process was stopped.`);
  }
  console.log(`[start] ${label} ...`);
  const child = await start();
  await waitForReady(url, expectedWorkspace, {
    timeoutMs, alive: () => child.exitCode === null && !child.killed,
    onWaiting: elapsed => console.log(`[wait] ${label} initialization: ${elapsed}s`),
  });
  return { reused: false, pid: child.pid };
}

function findPython(root) {
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

function launchDetached(label, command, args, cwd, logDirectory, state) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const stdout = path.join(logDirectory, `${label}-${stamp}.log`);
  const stderr = path.join(logDirectory, `${label}-${stamp}.error.log`);
  const out = fs.openSync(stdout, 'a'), err = fs.openSync(stderr, 'a');
  const child = spawn(command, args, {
    cwd, detached: true, windowsHide: true, stdio: ['ignore', out, err],
    env: { ...process.env, PYTHONUTF8: '1', TEMP: logDirectory, TMP: logDirectory },
  });
  fs.closeSync(out); fs.closeSync(err);
  return new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('spawn', () => {
      state[label] = { pid: child.pid, started_at: new Date().toISOString(), stdout, stderr };
      fs.writeFileSync(path.join(logDirectory, 'launcher-processes.json'), JSON.stringify(state, null, 2));
      child.unref();
      console.log(`[log] ${label}: ${stderr}`);
      resolve(child);
    });
  });
}

function pidIsAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try { process.kill(pid, 0); return true; } catch (error) { return error.code !== 'ESRCH'; }
}

async function acquireLock(lockPath, expectedWorkspace) {
  const nonce = randomUUID();
  const started = Date.now();
  while (Date.now() - started < 250000) {
    try {
      const fd = fs.openSync(lockPath, 'wx');
      fs.writeFileSync(fd, JSON.stringify({ pid: process.pid, workspace_id: expectedWorkspace, nonce }));
      fs.closeSync(fd);
      return () => {
        try {
          if (JSON.parse(fs.readFileSync(lockPath, 'utf8')).nonce === nonce) fs.unlinkSync(lockPath);
        } catch {}
      };
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      try {
        const owner = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
        if (owner.workspace_id === expectedWorkspace && !pidIsAlive(owner.pid)) {
          fs.unlinkSync(lockPath); continue; // Only remove our own stale lock file.
        }
      } catch (readError) {
        if (readError.code === 'ENOENT') continue;
        if (Date.now() - fs.statSync(lockPath).mtimeMs > 250000) throw new Error('The launcher lock is unreadable. Check logs/launcher.lock.');
      }
      console.log('[wait] Another launcher is initializing this project ...');
      await delay(8000);
    }
  }
  throw new Error('Another launcher is still busy. Please wait for it to finish.');
}

function openBrowser(url) {
  const command = process.platform === 'win32' ? 'rundll32.exe' : process.platform === 'darwin' ? 'open' : 'xdg-open';
  const args = process.platform === 'win32' ? ['url.dll,FileProtocolHandler', url] : [url];
  const child = spawn(command, args, { detached: true, windowsHide: true, stdio: 'ignore' });
  child.once('error', () => console.log(`[open] Open this URL manually: ${url}`));
  child.unref();
}

export async function main(args = process.argv.slice(2)) {
  const allowed = new Set(['--no-browser', '--check-only']);
  for (const arg of args) if (!allowed.has(arg)) throw new Error(`Unknown launcher option: ${arg}`);
  const [major, minor] = process.versions.node.split('.').map(Number);
  if (!((major === 20 && minor >= 19) || (major === 22 && minor >= 12) || major > 22)) throw new Error('Install Node.js 20.19+ or 22.12+.');
  const expectedWorkspace = workspaceId(PROJECT_ROOT);
  if (args.includes('--check-only')) {
    const backend = isOurService(await readJSON(`${BACKEND_URL}/api/health`), expectedWorkspace);
    const frontend = isOurService(await readJSON(`${FRONTEND_URL}/__galaxai/instance`), expectedWorkspace);
    const proxy = isOurService(await readJSON(`${FRONTEND_URL}/api/health`), expectedWorkspace);
    console.log(JSON.stringify({ backend, frontend, proxy, url: FRONTEND_URL }, null, 2));
    if (!backend || !frontend || !proxy) throw new Error('The complete application is not ready. Run PDF_GalaxAI.cmd.');
    return;
  }
  const logs = path.join(PROJECT_ROOT, 'logs');
  fs.mkdirSync(logs, { recursive: true });
  const releaseLock = await acquireLock(path.join(logs, 'launcher.lock'), expectedWorkspace);
  try {
    console.log('\nPDF_GalaxAI: starting the real PDF library + backend, not synthetic demo data.');
    const viteScript = path.join(PROJECT_ROOT, 'node_modules/vite/bin/vite.js');
    if (!fs.existsSync(viteScript)) {
      console.log('[init] Installing frontend dependencies ...');
      const npm = process.platform === 'win32'
        ? spawnSync('cmd.exe', ['/d', '/s', '/c', 'npm ci'], { cwd: PROJECT_ROOT, stdio: 'inherit', windowsHide: true })
        : spawnSync('npm', ['ci'], { cwd: PROJECT_ROOT, stdio: 'inherit' });
      if (npm.error || npm.status !== 0) throw new Error('npm ci failed. Check Node.js / npm and your connection.');
    }
    const python = findPython(PROJECT_ROOT);
    const modules = spawnSync(python, ['-c', 'import fastapi, uvicorn'], { encoding: 'utf8', windowsHide: true, timeout: 30000 });
    if (modules.error || modules.status !== 0) throw new Error(`Backend dependencies are missing. Run: "${python}" -m pip install -r backend/requirements.txt`);
    let previous = {};
    try { previous = JSON.parse(fs.readFileSync(path.join(logs, 'launcher-processes.json'), 'utf8')); } catch {}
    const state = { ...(previous.workspace_id === expectedWorkspace ? previous : {}), workspace_id: expectedWorkspace, started_at: new Date().toISOString() };
    await ensureService({ label: 'backend', url: `${BACKEND_URL}/api/health`, port: 8000, expectedWorkspace,
      pending: state.backend ? { ...state.backend, workspace_id: state.workspace_id } : undefined,
      start: () => launchDetached('backend', python, ['-u', '-m', 'uvicorn', 'main:app', '--host', '127.0.0.1', '--port', '8000'], path.join(PROJECT_ROOT, 'backend'), logs, state),
    });
    await ensureService({ label: 'frontend', url: `${FRONTEND_URL}/__galaxai/instance`, port: 3000, expectedWorkspace,
      pending: state.frontend ? { ...state.frontend, workspace_id: state.workspace_id } : undefined,
      start: () => launchDetached('frontend', process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', '3000', '--strictPort', '--configLoader', 'runner'], PROJECT_ROOT, logs, state),
    });
    await waitForReady(`${FRONTEND_URL}/api/health`, expectedWorkspace, { timeoutMs: 20000 });
    const graph = await readJSON(`${FRONTEND_URL}/api/papers`, 15000);
    if (!graph || !Array.isArray(graph.papers) || !Array.isArray(graph.edges)) throw new Error('The frontend is running but its paper API proxy did not return a valid library.');
    console.log(`[ready] Backend connected through the frontend. ${graph.papers.length} real papers loaded.`);
    console.log(`[ready] ${FRONTEND_URL}/`);
    console.log('[ready] Services run in the background. Running the launcher again reuses them.');
    if (!args.includes('--no-browser')) openBrowser(`${FRONTEND_URL}/`);
  } finally { releaseLock(); }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => {
    console.error(`[error] ${error.message}`);
    console.error(`[logs] ${path.join(PROJECT_ROOT, 'logs')}`);
    process.exitCode = 1;
  });
}
