const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('omniya', {
  loadState: () => ipcRenderer.invoke('state:load'),
  saveState: (state) => ipcRenderer.invoke('state:save', state),
  latexToMathML: (source) => ipcRenderer.invoke('math:convert', source)
  ,importMath: (source) => ipcRenderer.invoke('math:import', source)
  ,exportMathLatex: (document) => ipcRenderer.invoke('math:export', document),
  translateUeb: (text, grade) => ipcRenderer.invoke('ueb:translate', { text, grade }),
  backTranslateUeb: (braille, grade) => ipcRenderer.invoke('ueb:backTranslate', { braille, grade }),
  onMenuCommand: (cb) => {
    ipcRenderer.on('menu:command', (_e, payload) => cb(payload));
  }
});
