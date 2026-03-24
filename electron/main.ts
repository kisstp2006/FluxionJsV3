// ============================================================
// FluxionJS V2 — Electron Main Process
// ============================================================

import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import * as path from 'path';
import * as fs from 'fs';

let mainWindow: BrowserWindow | null = null;

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

// Window controls
ipcMain.handle('window:minimize', () => {
  mainWindow?.minimize();
});

ipcMain.handle('window:maximize', () => {
  if (mainWindow?.isMaximized()) {
    mainWindow.unmaximize();
  } else {
    mainWindow?.maximize();
  }
});

ipcMain.handle('window:close', () => {
  mainWindow?.close();
});

ipcMain.handle('fs:listDir', async (_, dirPath: string) => {
  if (!fs.existsSync(dirPath)) return [];
  return fs.readdirSync(dirPath, { withFileTypes: true }).map(d => ({
    name: d.name,
    isDirectory: d.isDirectory(),
    path: path.join(dirPath, d.name),
  }));
});
