// Ponte sicuro tra la finestra (React) e il processo principale (database).
const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('travi', {
  auth: {
    stato: () => ipcRenderer.invoke('auth:stato'),
    setup: (r) => ipcRenderer.invoke('auth:setup', r),
    login: (email, password) => ipcRenderer.invoke('auth:login', { email, password }),
    logout: () => ipcRenderer.invoke('auth:logout'),
    cambiaPassword: (vecchia, nuova) => ipcRenderer.invoke('auth:cambia-password', { vecchia, nuova }),
  },
  utenti: {
    list: () => ipcRenderer.invoke('utenti:list'),
    insert: (r) => ipcRenderer.invoke('utenti:insert', r),
    update: (id, campi) => ipcRenderer.invoke('utenti:update', { id, campi }),
    resetPassword: (id, nuova) => ipcRenderer.invoke('utenti:reset-password', { id, nuova }),
    remove: (id) => ipcRenderer.invoke('utenti:delete', id),
  },
  preferenze: {
    tutte: () => ipcRenderer.invoke('pref:tutte'),
    imposta: (chiave, valore) => ipcRenderer.invoke('pref:imposta', { chiave, valore }),
  },
  immobili: {
    list: () => ipcRenderer.invoke('immobili:list'),
    insert: (r) => ipcRenderer.invoke('immobili:insert', r),
    update: (id, campi) => ipcRenderer.invoke('immobili:update', { id, campi }),
    remove: (id) => ipcRenderer.invoke('immobili:delete', id),
  },
  mappa: {
    apri: (query, modo) => ipcRenderer.invoke('mappa:apri', { query, modo }),
  },
  versione: () => ipcRenderer.invoke('app:versione'),
})
