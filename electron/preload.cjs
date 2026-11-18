const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('quizApi', {
  saveQuiz: (filePath, quiz) => ipcRenderer.invoke('quiz:save', filePath, quiz),
  saveQuizAs: (quiz, suggestedName) => ipcRenderer.invoke('quiz:saveAs', quiz, suggestedName),
  openQuiz: () => ipcRenderer.invoke('quiz:open'),
  openQuizPath: (filePath) => ipcRenderer.invoke('quiz:openPath', filePath),
  getRecent: () => ipcRenderer.invoke('quiz:recent'),
  removeRecent: (filePath) => ipcRenderer.invoke('quiz:removeRecent', filePath),
  getPendingOpen: () => ipcRenderer.invoke('app:ready'),
  onOpened: (cb) => {
    const handler = (_e, payload) => cb(payload);
    ipcRenderer.on('quiz:opened', handler);
    return () => ipcRenderer.removeListener('quiz:opened', handler);
  },
  setDirty: (dirty) => ipcRenderer.send('app:setDirty', dirty),
  setTitle: (title) => ipcRenderer.send('app:setTitle', title),
  loadMedia: () => ipcRenderer.invoke('media:load'),
  saveMedia: (items) => ipcRenderer.invoke('media:save', items),
});
