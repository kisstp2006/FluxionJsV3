// ============================================================
// FluxionJS V2 — Electron Main Process
// ============================================================

import { app, BrowserWindow, ipcMain, dialog, shell } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import * as crypto from 'crypto';
import { spawn, ChildProcess } from 'child_process';

let mainWindow: BrowserWindow | null = null;
let vmeWindow: BrowserWindow | null = null;
let fuiWindow: BrowserWindow | null = null;
let scriptWindow: BrowserWindow | null = null;

/** Maps panelId → detached panel BrowserWindow */
const panelWindows = new Map<string, BrowserWindow>();

// Persisted script editor window bounds (restored on next open)
let scriptWindowBounds = { width: 1000, height: 700, x: undefined as number | undefined, y: undefined as number | undefined };
// Cached scripting settings for the script window (updated by main renderer)
let cachedScriptSettings: object = {};

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1600,
    height: 900,
    minWidth: 1024,
    minHeight: 600,
    title: 'FluxionJS V2 Editor',
    backgroundColor: '#0d1117',
    frame: false,
    titleBarStyle: 'hidden',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webgl: true,
    },
    icon: path.join(__dirname, '../../Data/icon.png'),
  });

  mainWindow.loadFile(path.join(__dirname, '../editor/index.html'));

  // Only open DevTools in development mode
  if (!app.isPackaged) {
    mainWindow.webContents.openDevTools();
  }

  mainWindow.on('closed', () => {
    // Close child windows when the main editor window closes
    if (vmeWindow && !vmeWindow.isDestroyed()) vmeWindow.close();
    vmeWindow = null;
    if (fuiWindow && !fuiWindow.isDestroyed()) fuiWindow.close();
    fuiWindow = null;
    if (scriptWindow && !scriptWindow.isDestroyed()) scriptWindow.close();
    scriptWindow = null;
    mainWindow = null;
  });
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// ── IPC Handlers ──

ipcMain.handle('dialog:openFile', async (_, filters) => {
  const result = await dialog.showOpenDialog(mainWindow!, {
    properties: ['openFile'],
    filters: filters ?? [
      { name: 'Scene Files', extensions: ['fluxion', 'json'] },
      { name: 'All Files', extensions: ['*'] },
    ],
  });
  if (result.canceled) return null;
  return result.filePaths[0];
});

ipcMain.handle('dialog:saveFile', async (_, filters) => {
  const result = await dialog.showSaveDialog(mainWindow!, {
    filters: filters ?? [
      { name: 'Scene Files', extensions: ['fluxion', 'json'] },
    ],
  });
  if (result.canceled) return null;
  return result.filePath;
});

ipcMain.handle('fs:readFile', async (_, filePath: string) => {
  return fs.readFileSync(filePath, 'utf-8');
});

ipcMain.handle('fs:writeFile', async (_, filePath: string, data: string) => {
  fs.writeFileSync(filePath, data, 'utf-8');
  return true;
});

ipcMain.handle('fs:mkdir', async (_, dirPath: string) => {
  fs.mkdirSync(dirPath, { recursive: true });
  return true;
});

ipcMain.handle('fs:exists', async (_, targetPath: string) => {
  return fs.existsSync(targetPath);
});

ipcMain.handle('fs:deleteFile', async (_, targetPath: string) => {
  if (fs.existsSync(targetPath)) {
    const stat = fs.statSync(targetPath);
    if (stat.isDirectory()) {
      fs.rmSync(targetPath, { recursive: true });
    } else {
      fs.unlinkSync(targetPath);
    }
  }
  return true;
});

ipcMain.handle('fs:readDir', async (_, dirPath: string) => {
  if (!fs.existsSync(dirPath)) return [];
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  return entries.map(e => ({
    name: e.name,
    isDirectory: e.isDirectory(),
    path: path.join(dirPath, e.name),
  }));
});

ipcMain.handle('dialog:openDir', async () => {
  const result = await dialog.showOpenDialog(mainWindow!, {
    properties: ['openDirectory', 'createDirectory'],
  });
  if (result.canceled) return null;
  return result.filePaths[0];
});

ipcMain.handle('app:getAppDataPath', async () => {
  return app.getPath('appData');
});

ipcMain.handle('app:getPath', async (_, name: string) => {
  return app.getPath(name as any);
});

// Window controls (sender-aware so they work for any window)
ipcMain.handle('window:minimize', (event) => {
  BrowserWindow.fromWebContents(event.sender)?.minimize();
});

ipcMain.handle('window:maximize', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win?.isMaximized()) {
    win.unmaximize();
  } else {
    win?.maximize();
  }
});

ipcMain.handle('window:close', (event) => {
  BrowserWindow.fromWebContents(event.sender)?.close();
});

// ── Visual Material Editor Window ──

ipcMain.handle('vme:open', async (_, filePath: string) => {
  // If a VME window already exists, send the new file as a tab
  if (vmeWindow && !vmeWindow.isDestroyed()) {
    vmeWindow.webContents.send('vme:open-tab', filePath);
    vmeWindow.focus();
    return;
  }

  vmeWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 500,
    title: 'Visual Material Editor',
    backgroundColor: '#1e1e2e',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    icon: path.join(__dirname, '../../Data/icon.png'),
  });

  vmeWindow.setMenuBarVisibility(false);

  vmeWindow.loadFile(path.join(__dirname, '../editor/vme-window.html'), {
    query: { filePath },
  });

  vmeWindow.on('closed', () => {
    vmeWindow = null;
  });
});

// ── FUI Editor Window ──

ipcMain.handle('fui:open', async (_, filePath: string) => {
  // If a FUI window already exists, send the new file as a tab
  if (fuiWindow && !fuiWindow.isDestroyed()) {
    fuiWindow.webContents.send('fui:open-tab', filePath);
    fuiWindow.focus();
    return;
  }

  fuiWindow = new BrowserWindow({
    width: 1100,
    height: 750,
    minWidth: 780,
    minHeight: 500,
    title: 'FUI Editor',
    backgroundColor: '#0d1117',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    icon: path.join(__dirname, '../../Data/icon.png'),
  });

  fuiWindow.setMenuBarVisibility(false);

  fuiWindow.loadFile(path.join(__dirname, '../editor/fui-window.html'), {
    query: { filePath },
  });

  fuiWindow.on('closed', () => {
    fuiWindow = null;
  });
});

// ── Script Editor Window ──

ipcMain.handle('script:open', async (_, filePath: string) => {
  if (scriptWindow && !scriptWindow.isDestroyed()) {
    scriptWindow.webContents.send('script:open-tab', filePath);
    scriptWindow.focus();
    return;
  }

  scriptWindow = new BrowserWindow({
    width: scriptWindowBounds.width,
    height: scriptWindowBounds.height,
    x: scriptWindowBounds.x,
    y: scriptWindowBounds.y,
    minWidth: 600,
    minHeight: 400,
    title: 'Script Editor',
    backgroundColor: '#0d1117',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    icon: path.join(__dirname, '../../Data/icon.png'),
  });

  scriptWindow.setMenuBarVisibility(false);
  scriptWindow.loadFile(path.join(__dirname, '../editor/script-window.html'), {
    query: { filePath },
  });

  const saveBounds = () => {
    if (!scriptWindow || scriptWindow.isDestroyed()) return;
    const b = scriptWindow.getBounds();
    scriptWindowBounds = { width: b.width, height: b.height, x: b.x, y: b.y };
  };
  scriptWindow.on('resize', saveBounds);
  scriptWindow.on('move', saveBounds);
  scriptWindow.on('closed', () => { scriptWindow = null; });
});

ipcMain.on('script:settings-update', (_, settings: object) => {
  cachedScriptSettings = settings;
  if (scriptWindow && !scriptWindow.isDestroyed()) {
    scriptWindow.webContents.send('script:settings-update', settings);
  }
});

ipcMain.handle('script:get-settings', async () => {
  return cachedScriptSettings;
});

ipcMain.handle('vme:materialChanged', async (_event, filePath: string) => {
  // Relay material-changed to the main editor window
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('vme:material-changed-relay', filePath);
  }
});

ipcMain.handle('fs:listDir', async (_, dirPath: string) => {
  if (!fs.existsSync(dirPath)) return [];
  return fs.readdirSync(dirPath, { withFileTypes: true }).map(d => ({
    name: d.name,
    isDirectory: d.isDirectory(),
    path: path.join(dirPath, d.name),
  }));
});

// ── Binary I/O (Base64) ──

ipcMain.handle('fs:readBinary', async (_, filePath: string) => {
  const buf = fs.readFileSync(filePath);
  return buf.toString('base64');
});

ipcMain.handle('fs:writeBinary', async (_, filePath: string, base64: string) => {
  const buf = Buffer.from(base64, 'base64');
  fs.writeFileSync(filePath, buf);
  return true;
});

// ── Stat ──

ipcMain.handle('fs:stat', async (_, targetPath: string) => {
  const stat = fs.statSync(targetPath);
  return {
    size: stat.size,
    isDirectory: stat.isDirectory(),
    modifiedAt: stat.mtimeMs,
  };
});

// ── Rename / Copy ──

ipcMain.handle('fs:rename', async (_, oldPath: string, newPath: string) => {
  fs.renameSync(oldPath, newPath);
  return true;
});

ipcMain.handle('fs:copy', async (_, srcPath: string, destPath: string) => {
  const stat = fs.statSync(srcPath);
  if (stat.isDirectory()) {
    fs.cpSync(srcPath, destPath, { recursive: true });
  } else {
    fs.copyFileSync(srcPath, destPath);
  }
  return true;
});

// ── File Hashing (SHA-256) ──

ipcMain.handle('fs:hashFile', async (_, filePath: string) => {
  return new Promise<string>((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', reject);
  });
});

// ── Multi-file Open Dialog ──

ipcMain.handle('dialog:openFiles', async (_, filters) => {
  const result = await dialog.showOpenDialog(mainWindow!, {
    properties: ['openFile', 'multiSelections'],
    filters: filters ?? [
      { name: 'All Files', extensions: ['*'] },
    ],
  });
  if (result.canceled) return null;
  return result.filePaths;
});

// ── File Watching ──

const activeWatchers = new Map<string, fs.FSWatcher>();
let watchIdCounter = 0;

ipcMain.handle('fs:watch', async (_, watchPath: string) => {
  const id = `watch_${++watchIdCounter}`;
  const watcher = fs.watch(watchPath, { recursive: true }, (eventType, filename) => {
    if (!filename || !mainWindow) return;
    const fullPath = path.join(watchPath, filename);
    const type = eventType === 'rename'
      ? (fs.existsSync(fullPath) ? 'create' : 'delete')
      : 'change';
    mainWindow.webContents.send('fs:watch-event', { type, path: fullPath });
  });
  activeWatchers.set(id, watcher);
  return id;
});

ipcMain.handle('fs:unwatch', async (_, watchId: string) => {
  const watcher = activeWatchers.get(watchId);
  if (watcher) {
    watcher.close();
    activeWatchers.delete(watchId);
  }
  return true;
});

// ── Shell Utilities ──

ipcMain.handle('shell:showItemInFolder', async (_, itemPath: string) => {
  shell.showItemInFolder(itemPath);
  return true;
});

ipcMain.handle('shell:openPath', async (_, targetPath: string) => {
  await shell.openPath(targetPath);
  return true;
});

// ── Engine root path ──

ipcMain.handle('app:getEngineRoot', async () => {
  if (app.isPackaged) {
    // electron-builder is configured with asar:false, so all files (src/,
    // node_modules/, tsconfig.json) are real files accessible to child
    // processes. app.getAppPath() points to the directory that contains them.
    return app.getAppPath();
  }
  // Development: compiled output is at dist/electron/, project root is two
  // levels up from __dirname.
  return path.resolve(__dirname, '..', '..');
});

// ── Build System ──

/** Active webpack child processes, keyed by jobId */
const buildJobs = new Map<string, ChildProcess>();
let buildJobCounter = 0;

/**
 * build:run — spawns webpack in a child process.
 * Streams stdout/stderr back to the renderer via 'build:event'.
 * Returns the jobId so the renderer can cancel it.
 */
ipcMain.handle('build:run', async (event, engineRoot: string, configPath: string) => {
  const jobId = `build_${++buildJobCounter}`;
  const sender = event.sender;

  // Resolve the webpack binary from the engine's own node_modules
  const webpackBin = path.join(engineRoot, 'node_modules', 'webpack', 'bin', 'webpack.js');

  // Use 'node' instead of process.execPath — inside Electron, process.execPath
  // points to the Electron binary, which would try to launch webpack.js as an
  // Electron app rather than running it with Node.
  const child = spawn('node', [webpackBin, '--config', configPath], {
    cwd: engineRoot,
    env: { ...process.env, FORCE_COLOR: '0' },
    shell: true,
  });

  buildJobs.set(jobId, child);

  const send = (type: string, data: string) => {
    if (!sender.isDestroyed()) {
      sender.send('build:event', { jobId, type, data });
    }
  };

  child.stdout?.on('data', (chunk: Buffer) => send('stdout', chunk.toString()));
  child.stderr?.on('data', (chunk: Buffer) => send('stderr', chunk.toString()));

  child.on('close', (code) => {
    buildJobs.delete(jobId);
    if (code === 0) {
      send('done', `Build finished successfully (exit 0).`);
    } else {
      send('error', `Build process exited with code ${code}.`);
    }
  });

  child.on('error', (err) => {
    buildJobs.delete(jobId);
    send('error', `Failed to start build process: ${err.message}`);
  });

  return jobId;
});

/** build:cancel — kills a running webpack job by jobId. */
ipcMain.handle('build:cancel', async (_, jobId: string) => {
  const child = buildJobs.get(jobId);
  if (child) {
    child.kill('SIGTERM');
    buildJobs.delete(jobId);
  }
  return true;
});

// ── npm commands ──

/** Active npm child processes, keyed by jobId */
const npmJobs = new Map<string, ChildProcess>();
let npmJobCounter = 0;

/**
 * npm:run — runs an npm command (e.g. ['install', 'fluxion-plugin-foo'])
 * inside the given projectDir. Streams output via 'npm:event'.
 */
ipcMain.handle('npm:run', async (event, projectDir: string, args: string[]) => {
  const jobId = `npm_${++npmJobCounter}`;
  const sender = event.sender;

  const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';

  const child = spawn(npmCmd, args, {
    cwd: projectDir,
    env: { ...process.env },
    shell: true,
  });

  npmJobs.set(jobId, child);

  const send = (type: string, data: string) => {
    if (!sender.isDestroyed()) {
      sender.send('npm:event', { jobId, type, data });
    }
  };

  child.stdout?.on('data', (chunk: Buffer) => send('stdout', chunk.toString()));
  child.stderr?.on('data', (chunk: Buffer) => send('stderr', chunk.toString()));

  child.on('close', (code) => {
    npmJobs.delete(jobId);
    send(code === 0 ? 'done' : 'error', `npm exited with code ${code}.`);
  });

  child.on('error', (err) => {
    npmJobs.delete(jobId);
    send('error', `Failed to start npm: ${err.message}`);
  });

  return jobId;
});

/** npm:cancel — kills a running npm job. */
ipcMain.handle('npm:cancel', async (_, jobId: string) => {
  const child = npmJobs.get(jobId);
  if (child) {
    child.kill('SIGTERM');
    npmJobs.delete(jobId);
  }
  return true;
});

// ── Detached Panel Windows ──

ipcMain.handle('panel:detach', async (_, panelId: string) => {
  // If a window for this panel already exists, focus it
  const existing = panelWindows.get(panelId);
  if (existing && !existing.isDestroyed()) {
    existing.focus();
    return;
  }

  const win = new BrowserWindow({
    width: 600,
    height: 400,
    minWidth: 300,
    minHeight: 200,
    title: `Panel — ${panelId}`,
    backgroundColor: '#0d1117',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    icon: path.join(__dirname, '../../Data/icon.png'),
  });

  win.setMenuBarVisibility(false);
  panelWindows.set(panelId, win);

  win.loadFile(path.join(__dirname, '../editor/panel-window.html'), {
    query: { panelId },
  });

  win.on('closed', () => {
    panelWindows.delete(panelId);
    // Notify the main window so it can reattach the panel
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('panel:window-closed', panelId);
    }
  });
});

ipcMain.handle('panel:close', async (_, panelId: string) => {
  const win = panelWindows.get(panelId);
  if (win && !win.isDestroyed()) {
    win.close();
  }
  panelWindows.delete(panelId);
  return true;
});

/** Main window pushes EditorState to a specific panel window */
ipcMain.on('panel:state-push', (_, panelId: string, state: unknown) => {
  const win = panelWindows.get(panelId);
  if (win && !win.isDestroyed()) {
    win.webContents.send('panel:state', state);
  }
});

/** Panel window dispatches an action back to the main window */
ipcMain.on('panel:action', (event, action: unknown) => {
  // Find the panelId for this sender
  let panelId: string | undefined;
  for (const [id, win] of panelWindows) {
    if (!win.isDestroyed() && win.webContents === event.sender) {
      panelId = id;
      break;
    }
  }
  if (panelId && mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('panel:action-relay', panelId, action);
  }
});

/** Panel window asks for its own panelId */
ipcMain.handle('panel:getWindowId', (event) => {
  for (const [id, win] of panelWindows) {
    if (!win.isDestroyed() && win.webContents === event.sender) {
      return id;
    }
  }
  return null;
});
