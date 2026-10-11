// Dev-only Electron entry that opens the editor spike page. Not shipped.
const { app, BrowserWindow } = require('electron');
const path = require('node:path');

app.whenReady().then(() => {
  const win = new BrowserWindow({
    width: 900,
    height: 600,
    show: process.env.OMNIYA_HEADLESS === '0',
    webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false },
  });
  win.loadFile(path.join(__dirname, '..', 'spike.html'));
});
app.on('window-all-closed', () => app.quit());
