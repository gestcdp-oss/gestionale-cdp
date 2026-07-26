// Voci del menu dell'immobile: definite qui una volta sola, così la barra
// laterale e i riquadri della Scheda Immobile restano sempre allineati.

export type VoceMenu = {
  id: string
  etichetta: string
  /** percorso interno; se manca, la voce è ancora da realizzare */
  percorso?: string
  descrizione?: string
}

export type GruppoMenu = {
  titolo: string
  voci: VoceMenu[]
}

export const GRUPPI_IMMOBILE: GruppoMenu[] = [
  {
    titolo: "Attività dell'immobile",
    voci: [
      {
        id: 'scheda',
        etichetta: 'Scheda Immobile',
        percorso: '/immobile',
        descrizione: "Riepilogo dell'immobile e accesso a tutte le sue sezioni.",
      },
      { id: 'bm', etichetta: 'Building Manager', descrizione: 'Incarichi di gestione e report mensili.' },
      { id: 'dd', etichetta: 'Due Diligence', descrizione: 'Verifiche tecniche e documentali.' },
      { id: 'lavori', etichetta: 'Lavori', descrizione: 'Imprese, interventi, importi e ordini.' },
      { id: 'prof-sia', etichetta: 'Prof SIA', descrizione: 'Incarichi professionali e fasi.' },
      { id: 'verde', etichetta: 'Verde', descrizione: 'Manutenzione del verde e antincendio.' },
      { id: 'prof-sia-amb', etichetta: 'Prof SIA Ambiente', descrizione: 'Professionisti per la parte ambientale.' },
      { id: 'lavori-amb', etichetta: 'Lavori Ambiente', descrizione: 'Bonifiche e interventi ambientali.' },
      { id: 'ra', etichetta: 'Resp. Amianto', descrizione: 'Nomine e periodi di incarico.' },
      { id: 'vigilanze', etichetta: 'Vigilanze', descrizione: 'Contratti di vigilanza e canoni.' },
      { id: 'duvri', etichetta: 'DUVRI', descrizione: 'Documenti di valutazione dei rischi.' },
    ],
  },
  {
    titolo: 'Output',
    voci: [
      { id: 'report', etichetta: 'Report e certificati', descrizione: 'Documenti generati dai dati inseriti.' },
    ],
  },
]
