// Voci del menu dell'immobile: definite qui una volta sola, così la barra
// laterale e i riquadri della Scheda Immobile restano sempre allineati.

import type { NomeIcona } from '../components/Icone'

export type VoceMenu = {
  id: string
  etichetta: string
  icona: NomeIcona
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
        icona: 'scheda',
        percorso: '/immobile',
        descrizione: "Riepilogo dell'immobile e accesso a tutte le sue sezioni.",
      },
      {
        id: 'bm',
        etichetta: 'Building Manager',
        icona: 'building-manager',
        percorso: '/bm',
        descrizione: 'Incarico annuale, report mensili e fatturazione a bimestri.',
      },
      { id: 'dd', etichetta: 'Due Diligence', icona: 'due-diligence', descrizione: 'Verifiche tecniche e documentali.' },
      { id: 'lavori', etichetta: 'Lavori', icona: 'lavori', descrizione: 'Imprese, interventi, importi e ordini.' },
      { id: 'prof-sia', etichetta: 'Prof SIA', icona: 'professionisti', descrizione: 'Incarichi professionali e fasi.' },
      { id: 'verde', etichetta: 'Verde', icona: 'verde', descrizione: 'Manutenzione del verde e antincendio.' },
      { id: 'prof-sia-amb', etichetta: 'Prof SIA Ambiente', icona: 'ambiente', descrizione: 'Professionisti per la parte ambientale.' },
      { id: 'lavori-amb', etichetta: 'Lavori Ambiente', icona: 'lavori-ambiente', descrizione: 'Bonifiche e interventi ambientali.' },
      { id: 'ra', etichetta: 'Resp. Amianto', icona: 'amianto', descrizione: 'Nomine e periodi di incarico.' },
      { id: 'vigilanze', etichetta: 'Vigilanze', icona: 'vigilanze', descrizione: 'Contratti di vigilanza e canoni.' },
      { id: 'duvri', etichetta: 'DUVRI', icona: 'duvri', descrizione: 'Documenti di valutazione dei rischi.' },
    ],
  },
  {
    titolo: 'Output',
    voci: [
      {
        id: 'report',
        etichetta: 'Report e certificati',
        icona: 'report',
        descrizione: 'Documenti generati dai dati inseriti.',
      },
    ],
  },
]
