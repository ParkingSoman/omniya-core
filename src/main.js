import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { convertLatexToMathML } from './main/mathml.js';
import { exportLatex, importLatex, replaceMathTargetInDocument } from './main/math-service.js';
import { parseNemeth } from './domain/nemeth/index.js';
import { createStorage } from './main/storage.js';

const sourceDirectory = path.dirname(fileURLToPath(import.meta.url));
const rendererFile = path.join(sourceDirectory, 'renderer', 'index.html');
const rendererUrl = pathToFileURL(rendererFile).href;

if (process.env.OMNIYA_TEST_USER_DATA_DIR) {
  app.setPath('userData', process.env.OMNIYA_TEST_USER_DATA_DIR);
}
app.enableSandbox();

function assertTrustedSender(event) {
  if (event.senderFrame?.url !== rendererUrl) {
    throw new Error('Untrusted renderer');
  }
}

function registerIpc(storage) {
  ipcMain.handle('state:load', async (event) => {
    assertTrustedSender(event);
    return storage.load();
  });
  ipcMain.handle('state:save', async (event, state) => {
    assertTrustedSender(event);
    return storage.save(state);
  });
  ipcMain.handle('math:convert', async (event, source) => {
    assertTrustedSender(event);
    return { mathml: await convertLatexToMathML(source) };
  });
  ipcMain.handle('math:import', async (event, source) => { assertTrustedSender(event); return importLatex(source); });
  ipcMain.handle('math:replace', async (event, payload) => { assertTrustedSender(event); return replaceMathTargetInDocument(payload); });
  ipcMain.handle('math:export', async (event, document) => { assertTrustedSender(event); return exportLatex(document); });
  ipcMain.handle('nemeth:parse', async (event, cells, options) => { assertTrustedSender(event); return parseNemeth(cells, options); });
}

function createWindow() {
  const window = new BrowserWindow({
    width: 900,
    height: 700,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: path.join(sourceDirectory, 'preload.cjs')
    }
  });

  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event, url) => {
    if (url !== rendererUrl) event.preventDefault();
  });
  void window.loadFile(rendererFile);
}

app.whenReady().then(() => {
  const externalFile = process.env.OMNIYA_NAPKIN_FILE
    ? path.resolve(process.env.OMNIYA_NAPKIN_FILE)
    : null;
  const storage = externalFile
    ? createStorage(path.dirname(externalFile), { fileName: path.basename(externalFile) })
    : createStorage(app.getPath('userData'));
  registerIpc(storage);
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  app.quit();
});
