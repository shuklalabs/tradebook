const { contextBridge, ipcRenderer } = require('electron');

// Everything the renderer (index.html) is allowed to call. No direct Node/filesystem access
// is exposed — only these specific, narrow operations, per Electron's security best practice.
contextBridge.exposeInMainWorld('electronAPI', {
  kvGet: (key) => ipcRenderer.invoke('kv-get', key),
  kvSet: (key, value) => ipcRenderer.invoke('kv-set', key, value),
  kvHas: (key) => ipcRenderer.invoke('kv-has', key),
  exportBackup: (jsonString) => ipcRenderer.invoke('export-backup', jsonString),
  importBackup: () => ipcRenderer.invoke('import-backup'),
  getDbPath: () => ipcRenderer.invoke('get-db-path')
});
