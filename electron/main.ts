// ============================================================
// FluxionJS V2 — Electron Main Process
// ============================================================

import { app, BrowserWindow, ipcMain, dialog, shell } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import * as crypto from 'crypto';

let mainWindow: BrowserWindow | null = null;
const vmeWindows = new Map<string, BrowserWindow>();

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

  mainWindow.webContents.openDevTools();

  mainWindow.on('closed', () => {
    // Close all VME child windows when the main editor window closes
    for (const [, win] of vmeWindows) {
      if (!win.isDestroyed()) win.close();
    }
    vmeWindows.clear();
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
  // If already open for this file, focus instead of creating a new window
  const existing = vmeWindows.get(filePath);
  if (existing && !existing.isDestroyed()) {
    existing.focus();
    return;
  }

  const vmeWindow = new BrowserWindow({
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

  vmeWindows.set(filePath, vmeWindow);
  vmeWindow.on('closed', () => {
    vmeWindows.delete(filePath);
  });
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
