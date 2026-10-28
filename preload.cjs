const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('banci', {
  call: (method, value) => ipcRenderer.invoke('app:command', method, value),
  onActivity: callback => { const listener = (_, active) => callback(active); ipcRenderer.on('app:activity', listener); return () => ipcRenderer.removeListener('app:activity', listener); },
  onState: callback => { const listener = (_, state) => callback(state); ipcRenderer.on('app:state', listener); return () => ipcRenderer.removeListener('app:state', listener); },
  onClock: callback => { const listener = (_, state) => callback(state); ipcRenderer.on('app:clock', listener); return () => ipcRenderer.removeListener('app:clock', listener); },
  onBrowser: callback => { const listener = (_, state) => callback(state); ipcRenderer.on('browser:state', listener); return () => ipcRenderer.removeListener('browser:state', listener); }
});
