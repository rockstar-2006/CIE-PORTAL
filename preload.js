const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  quit: () => ipcRenderer.send('app:quit'),
  onScreenshotBlocked: (callback) => ipcRenderer.on('screenshot-blocked', callback),
  onSecurityViolation: (callback) => ipcRenderer.on('security-violation', (event, message) => callback(message)),
  isNativeApp: true
});
