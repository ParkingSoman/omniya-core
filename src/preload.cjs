const { contextBridge, ipcRenderer } = require('electron');

// Build identity, handed in via webPreferences.additionalArguments (see
// createWindow). A tester who cannot say which build they are running turns
// every bug report into a round trip, and the version already carries the
// commit: 0.1.0-alpha.<run>+<sha7>.
const VERSION_FLAG = '--omniya-app-version=';
const appVersion = (process.argv.find((arg) => arg.startsWith(VERSION_FLAG)) ?? '')
  .slice(VERSION_FLAG.length) || null;

contextBridge.exposeInMainWorld('omniya', {
  appInfo: {
    version: appVersion,
    platform: process.platform,
    arch: process.arch,
    devTools: process.argv.includes('--omniya-dev-tools')
  },
  loadState: () => ipcRenderer.invoke('state:load'),
  saveState: (state) => ipcRenderer.invoke('state:save', state),
  loadSettings: () => ipcRenderer.invoke('settings:load'),
  saveSettings: (settings) => ipcRenderer.invoke('settings:save', settings),
  latexToMathML: (source) => ipcRenderer.invoke('math:convert', source)
  ,importMath: (source) => ipcRenderer.invoke('math:import', source)
  ,exportMathLatex: (document) => ipcRenderer.invoke('math:export', document),
  translateUeb: (text, grade) => ipcRenderer.invoke('ueb:translate', { text, grade }),
  backTranslateUeb: (braille, grade) => ipcRenderer.invoke('ueb:backTranslate', { braille, grade }),
  onMenuCommand: (cb) => {
    ipcRenderer.on('menu:command', (_e, payload) => cb(payload));
  },
  onUpdateNotice: (cb) => {
    ipcRenderer.on('update:notice', (_e, payload) => cb(payload));
  },
  openReleasePage: () => ipcRenderer.invoke('update:openReleasePage')
});
