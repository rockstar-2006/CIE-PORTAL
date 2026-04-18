const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  quitApp: () => ipcRenderer.send('app:quit'),
  // Listen for screenshot blocked events from the main process
  onScreenshotBlocked: (callback) => ipcRenderer.on('screenshot-blocked', callback),
  // Report that the app is in exam mode (prevents accidental quit)
  isNativeApp: true
});
