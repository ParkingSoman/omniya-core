const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('omniya', {
  loadState: () => ipcRenderer.invoke('state:load'),
  saveState: (state) => ipcRenderer.invoke('state:save', state),
  latexToMathML: (source) => ipcRenderer.invoke('math:convert', source)
  ,importMath: (source) => ipcRenderer.invoke('math:import', source)
  ,exportMathLatex: (document) => ipcRenderer.invoke('math:export', document)
});
