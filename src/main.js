import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { convertLatexToMathML } from './main/mathml.js';
import { exportLatex, importLatex } from './main/math-service.js';
import { createStorage } from './main/storage.js';

const sourceDirectory = path.dirname(fileURLToPath(import.meta.url));
const rendererFile = path.join(sourceDirectory, 'renderer', 'index.html');
const rendererUrl = pathToFileURL(rendererFile).href;

const isAutomatedTest = Boolean(process.env.OMNIYA_TEST_USER_DATA_DIR);
// E2E / corpus runs should not steal focus or flash windows on the desktop.
// Playwright still drives the hidden BrowserWindow and can capture screenshots.
// Do not append Chromium --headless here: Playwright's Electron launcher needs
// a real BrowserWindow + remote debugging, which that switch breaks.
// OMNIYA_HEADLESS=0 forces a visible window even when a test userData dir is set
// (headed demos). Unset + test userData still defaults to hidden.
const runHeadless = process.env.OMNIYA_HEADLESS === '0'
  ? false
  : process.env.OMNIYA_HEADLESS === '1' || isAutomatedTest;

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
  ipcMain.handle('math:export', async (event, document) => { assertTrustedSender(event); return exportLatex(document); });
}

function createWindow() {
  const window = new BrowserWindow({
    width: 900,
    height: 700,
    show: !runHeadless,
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
  if (runHeadless && app.dock) app.dock.hide();
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
