// Nomi dei file conservati nell'archivio.
//
// REGOLA VALIDA PER TUTTA L'APP: sul disco ogni file ha un nome che non può
// ripetersi (data, ora e una parte casuale), mentre all'utente si mostra il nome
// parlante. Così due documenti che si chiamano allo stesso modo non si
// sovrascrivono mai fra loro.

/** "Lettera prot.pdf" → "2026-08-05_1406-22_k3f9x1_Lettera-prot.pdf" */
export function nomeUnivoco(nomeVisibile: string): string {
  const d = new Date()
  const due = (n: number) => String(n).padStart(2, '0')
  const quando =
    `${d.getFullYear()}-${due(d.getMonth() + 1)}-${due(d.getDate())}` +
    `_${due(d.getHours())}${due(d.getMinutes())}-${due(d.getSeconds())}`
  const caso = Math.random().toString(36).slice(2, 8)
  const estensione = (nomeVisibile.match(/\.[A-Za-z0-9]{1,6}$/) ?? [''])[0]
  const base = nomeVisibile
    .slice(0, nomeVisibile.length - estensione.length)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
  return `${quando}_${caso}_${base || 'documento'}${estensione}`
}
