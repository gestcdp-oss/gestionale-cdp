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
  database: {
    esporta: () => ipcRenderer.invoke('db:esporta'),
    verificaImport: () => ipcRenderer.invoke('db:verifica-import'),
    applicaImport: (percorso) => ipcRenderer.invoke('db:applica-import', percorso),
  },
  collegamenti: {
    stato: () => ipcRenderer.invoke('collegamenti:stato'),
    crea: (scelte) => ipcRenderer.invoke('collegamenti:crea', scelte),
    rimanda: () => ipcRenderer.invoke('collegamenti:rimanda'),
    mostraCartella: () => ipcRenderer.invoke('collegamenti:mostra-cartella'),
  },
  aggiornamenti: {
    stato: () => ipcRenderer.invoke('agg:stato'),
    controlla: () => ipcRenderer.invoke('agg:controlla'),
    installa: () => ipcRenderer.invoke('agg:installa'),
    // avvisa l'interfaccia a ogni cambio di stato (controllo, download, errore…)
    osserva: (callback) => {
      const gestore = (_ev, stato) => callback(stato)
      ipcRenderer.on('agg:stato', gestore)
      return () => ipcRenderer.removeListener('agg:stato', gestore)
    },
  },
  versione: () => ipcRenderer.invoke('app:versione'),
})
