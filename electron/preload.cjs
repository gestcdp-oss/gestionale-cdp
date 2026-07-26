// Ponte sicuro tra la finestra (React) e il processo principale (database).
const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('travi', {
  immobili: {
    list: () => ipcRenderer.invoke('immobili:list'),
    insert: (r) => ipcRenderer.invoke('immobili:insert', r),
    update: (id, campi) => ipcRenderer.invoke('immobili:update', { id, campi }),
    remove: (id) => ipcRenderer.invoke('immobili:delete', id),
  },
  versione: () => ipcRenderer.invoke('app:versione'),
})
