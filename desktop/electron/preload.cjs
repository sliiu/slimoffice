const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("desktop", {
  openFile() {
    return ipcRenderer.invoke("open-file-dialog");
  },
  takeLaunchFile() {
    return ipcRenderer.invoke("take-launch");
  },
  recentFiles() {
    return ipcRenderer.invoke("recent-files");
  },
  touchRecent(filePath) {
    return ipcRenderer.invoke("touch-recent", filePath);
  },
  openRecent(filePath) {
    return ipcRenderer.invoke("open-recent", filePath);
  },
  saveBytes(payload) {
    return ipcRenderer.invoke("save-bytes", payload);
  },
  confirmDiscard() {
    return ipcRenderer.invoke("confirm-discard");
  },
  setDirty(dirty) {
    ipcRenderer.send("set-dirty", dirty);
  },
  setTitle(title) {
    ipcRenderer.send("set-title", title);
  },
  onOpenFile(cb) {
    const listener = (_event, file) => cb(file);
    ipcRenderer.on("open-file", listener);
    return () => ipcRenderer.removeListener("open-file", listener);
  },
  onMenu(cb) {
    const listener = (_event, action) => cb(action);
    ipcRenderer.on("menu", listener);
    return () => ipcRenderer.removeListener("menu", listener);
  },
});
