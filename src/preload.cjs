const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('omniya', {
  loadState: () => ipcRenderer.invoke('state:load'),
  saveState: (state) => ipcRenderer.invoke('state:save', state),
  latexToMathML: (source) => ipcRenderer.invoke('math:convert', source),
  loadTestSnapshot: () => ipcRenderer.invoke('test:snapshot')
});
