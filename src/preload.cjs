const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('omniya', {
  loadState: () => ipcRenderer.invoke('state:load'),
  saveState: (state) => ipcRenderer.invoke('state:save', state),
  latexToMathML: (source) => ipcRenderer.invoke('math:convert', source)
  ,importMath: (source) => ipcRenderer.invoke('math:import', source)
  ,replaceMathTarget: (payload) => ipcRenderer.invoke('math:replace', payload)
  ,exportMathLatex: (document) => ipcRenderer.invoke('math:export', document)
  ,parseNemeth: (cells, options) => ipcRenderer.invoke('nemeth:parse', cells, options)
});
