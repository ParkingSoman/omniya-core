import { app, BrowserWindow, ipcMain } from 'electron';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { convertLatexToMathML } from './main/mathml.js';
import { createStorage } from './main/storage.js';

const sourceDirectory = path.dirname(fileURLToPath(import.meta.url));
const rendererFile = path.join(sourceDirectory, 'renderer', 'index.html');
const inspectorFile = path.join(sourceDirectory, 'renderer', 'inspect.html');
const rendererUrl = pathToFileURL(rendererFile).href;
const inspectorUrl = pathToFileURL(inspectorFile).href;
const inspectMode = process.env.OMNIYA_TEST_INSPECT === '1';
const snapshotDirectory = path.resolve(sourceDirectory, '..', 'test', 'artifacts', 'latest');

if (process.env.OMNIYA_TEST_USER_DATA_DIR) {
  app.setPath('userData', process.env.OMNIYA_TEST_USER_DATA_DIR);
}
app.enableSandbox();

function assertTrustedSender(event, expectedUrl) {
  if (event.senderFrame?.url !== expectedUrl) {
    throw new Error('Untrusted renderer');
  }
}

function registerIpc(storage) {
  ipcMain.handle('state:load', async (event) => {
    assertTrustedSender(event, rendererUrl);
    return storage.load();
  });
  ipcMain.handle('state:save', async (event, state) => {
    assertTrustedSender(event, rendererUrl);
    return storage.save(state);
  });
  ipcMain.handle('math:convert', async (event, source) => {
    assertTrustedSender(event, rendererUrl);
    return { mathml: await convertLatexToMathML(source) };
  });
  ipcMain.handle('test:snapshot', async (event) => {
    assertTrustedSender(event, inspectorUrl);
    if (!inspectMode) throw new Error('Test inspection is disabled');
    const [screenshot, aria, html, metadata] = await Promise.all([
      readFile(path.join(snapshotDirectory, 'electron.png')).then((data) => `data:image/png;base64,${data.toString('base64')}`),
      readFile(path.join(snapshotDirectory, 'aria.txt'), 'utf8'),
      readFile(path.join(snapshotDirectory, 'main.html'), 'utf8'),
      readFile(path.join(snapshotDirectory, 'metadata.json'), 'utf8')
    ]);
    return { screenshot, aria, html, metadata };
  });
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
    const allowedUrl = inspectMode ? inspectorUrl : rendererUrl;
    if (url !== allowedUrl) event.preventDefault();
  });
  void window.loadFile(inspectMode ? inspectorFile : rendererFile);
}

app.whenReady().then(() => {
  registerIpc(createStorage(app.getPath('userData')));
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
