// Icone del menu: disegnate a tratto, così restano leggibili a ogni dimensione
// e prendono automaticamente il colore del testo.

export type NomeIcona =
  | 'immobili'
  | 'scheda'
  | 'building-manager'
  | 'due-diligence'
  | 'lavori'
  | 'professionisti'
  | 'verde'
  | 'ambiente'
  | 'lavori-ambiente'
  | 'amianto'
  | 'vigilanze'
  | 'duvri'
  | 'report'

const TRATTI: Record<NomeIcona, JSX.Element> = {
  // elenco di edifici
  immobili: (
    <>
      <path d="M3 21h18" />
      <path d="M5 21V7l6-4 6 4v14" />
      <path d="M9 21v-5h4v5" />
      <path d="M9 10h.01M13 10h.01" />
    </>
  ),
  // scheda / documento con dati
  scheda: (
    <>
      <rect x="4" y="3" width="16" height="18" rx="2" />
      <path d="M8 8h8M8 12h8M8 16h5" />
    </>
  ),
  // persona con casco (gestione dell'immobile)
  'building-manager': (
    <>
      <path d="M4 11a8 8 0 0 1 16 0" />
      <path d="M2 11h20" />
      <path d="M12 3v8" />
      <path d="M7 21v-2a5 5 0 0 1 10 0v2" />
    </>
  ),
  // lente di ingrandimento (verifiche)
  'due-diligence': (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="m21 21-4.3-4.3" />
      <path d="M8 11h6M11 8v6" />
    </>
  ),
  // martello (lavori)
  lavori: (
    <>
      <path d="m14 3 7 7-3 3-7-7z" />
      <path d="m11 6-8 8 4 4 8-8" />
      <path d="m5 17-2 4 4-2" />
    </>
  ),
  // squadra e matita (professionisti)
  professionisti: (
    <>
      <path d="M4 4v16h16" />
      <path d="M4 20 20 4" />
      <path d="M14 4h6v6" />
    </>
  ),
  // foglia (verde)
  verde: (
    <>
      <path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.5 19 2c1 2 2 4.2 2 8 0 5.5-4.8 10-10 10Z" />
      <path d="M2 21c0-3 1.85-5.36 5.08-6" />
    </>
  ),
  // goccia/ambiente
  ambiente: (
    <>
      <path d="M12 2.7s6 5.3 6 10.3a6 6 0 0 1-12 0c0-5 6-10.3 6-10.3z" />
      <path d="M9 14a3 3 0 0 0 3 3" />
    </>
  ),
  // riciclo (lavori ambientali)
  'lavori-ambiente': (
    <>
      <path d="M7 19H5a2 2 0 0 1-1.7-3l1.8-3" />
      <path d="M12 3.5 14 7l3.5-.5" />
      <path d="m9 21 2-3-3-2" />
      <path d="M19.5 12.5 21 15a2 2 0 0 1-1.7 3H16" />
      <path d="M6.5 9.5 5 7l3-1.5" />
      <path d="M14 21h3" />
    </>
  ),
  // scudo con avviso (amianto)
  amianto: (
    <>
      <path d="M12 3 5 6v5c0 4.5 3 8 7 10 4-2 7-5.5 7-10V6z" />
      <path d="M12 9v4M12 16h.01" />
    </>
  ),
  // occhio (vigilanze)
  vigilanze: (
    <>
      <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6z" />
      <circle cx="12" cy="12" r="2.5" />
    </>
  ),
  // documento con scudo (DUVRI)
  duvri: (
    <>
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h6" />
      <path d="M14 3v5h5" />
      <path d="M17 12l4 1.5V17c0 2-2 3.4-4 4-2-.6-4-2-4-4v-3.5z" />
    </>
  ),
  // grafico (report)
  report: (
    <>
      <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
    </>
  ),
}

export default function Icona({ nome, size = 17 }: { nome: NomeIcona; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="shrink-0"
    >
      {TRATTI[nome]}
    </svg>
  )
}
