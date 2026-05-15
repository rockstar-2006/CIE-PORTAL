const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  quit: () => ipcRenderer.send('app:quit'),
  compileLocal: (data) => ipcRenderer.invoke('compile:local', data),
  onScreenshotBlocked: (callback) => ipcRenderer.on('screenshot-blocked', callback),
  onSecurityViolation: (callback) => ipcRenderer.on('security-violation', (event, message) => callback(message)),
  isNativeApp: true
});
