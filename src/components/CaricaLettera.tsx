import { useState } from 'react'
import { testoDaDocumento } from '../lib/documenti'
import { cercaCorrispondenze, leggiLettera } from '../lib/letteraAttivazione'
import type { Candidato, DatiLettera } from '../lib/letteraAttivazione'
import type { Immobile } from '../lib/tipi'

/**
 * Procedura guidata per la Lettera di attivazione: si carica il PDF, si
 * controlla che sia dell'incarico giusto, si abbina riga per riga ogni
 * compendio a un immobile dell'archivio e infine si decide se registrare i dati
 * su tutti gli immobili della lettera o solo su quello aperto.
 */
export type EsitoLettera = {
  dati: DatiLettera
  nomeFile: string
  /** immobili confermati dall'utente, in ordine di comparsa nella lettera */
  immobili: Immobile[]
}

type Passo = 'lettura' | 'controllo' | 'abbina' | 'ambito' | 'errore'

export default function CaricaLettera({
  immobili,
  immobileCorrente,
  onFatto,
  onAnnulla,
}: {
  immobili: Immobile[]
  immobileCorrente: Immobile | null
  onFatto: (esito: EsitoLettera, soloQuesto: boolean) => void
  onAnnulla: () => void
}) {
  const [passo, setPasso] = useState<Passo>('lettura')
  const [errore, setErrore] = useState<string | null>(null)
  const [dati, setDati] = useState<DatiLettera | null>(null)
  const [nomeFile, setNomeFile] = useState('')
  const [indice, setIndice] = useState(0)
  // per ogni riga della lettera: l'immobile scelto (o null = "non è dei nostri")
  const [scelte, setScelte] = useState<(Immobile | null)[]>([])

  async function leggiFile(file: File) {
    setErrore(null)
    setPasso('lettura')
    setNomeFile(file.name)
    try {
      const testo = await testoDaDocumento(file)
      if (testo.replace(/\s/g, '').length < 200) {
        throw new Error(
          "Da questo file non si riesce a leggere il testo: se è un PDF, probabilmente è la scansione di un foglio e serve l'originale.",
        )
      }
      const esito = leggiLettera(testo)
      setDati(esito.dati)
      if (!esito.ok) {
        setErrore(esito.problema ?? 'Documento non valido.')
        setPasso('errore')
        return
      }
      setScelte(esito.dati.compendi.map(() => null))
      setIndice(0)
      setPasso('controllo')
    } catch (e) {
      setErrore(String((e as Error)?.message ?? e))
      setPasso('errore')
    }
  }

  function confermaScelta(scelto: Immobile | null) {
    const nuove = [...scelte]
    nuove[indice] = scelto
    setScelte(nuove)
    if (indice + 1 < (dati?.compendi.length ?? 0)) {
      setIndice(indice + 1)
      return
    }
    // finito l'abbinamento: l'immobile aperto dev'essere fra quelli della lettera
    const confermati = nuove.filter(Boolean) as Immobile[]
    if (confermati.length === 0) {
      setErrore('Nessuna riga della lettera è stata abbinata a un immobile: non c\'è niente da registrare.')
      setPasso('errore')
      return
    }
    if (immobileCorrente && !confermati.some((i) => i.id === immobileCorrente.id)) {
      setErrore(
        `Questa lettera non riguarda ${immobileCorrente.denominazione} (asset ${immobileCorrente.asset}): ` +
          `gli immobili abbinati sono ${confermati.map((i) => i.denominazione).join(', ')}. Procedura annullata.`,
      )
      setPasso('errore')
      return
    }
    setPasso(confermati.length > 1 ? 'ambito' : 'ambito')
  }

  const confermati = scelte.filter(Boolean) as Immobile[]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-velo p-4">
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-cielo-200 bg-panna p-6 shadow-xl">
        {/* ---------- scelta del file ---------- */}
        {passo === 'lettura' && (
          <div>
            <h3 className="text-lg font-semibold text-cielo-800">Carica la Lettera di attivazione</h3>
            <p className="mt-2 text-sm leading-relaxed text-cielo-700">
              Scegli la lettera in <b>PDF</b> o in <b>Word</b>: il programma ne legge fornitore, accordo quadro,
              Building Manager, importo e durata. Il file resta sul tuo computer, non viene inviato da nessuna
              parte.
            </p>
            <label className="mt-4 flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-cielo-300 bg-cielo-50 p-8 text-center transition hover:border-cielo-400 hover:bg-cielo-100">
              <span className="text-3xl">📄</span>
              <span className="mt-2 font-medium text-cielo-800">Scegli il file (PDF o Word)</span>
              <span className="mt-1 text-xs text-cielo-600">
                {nomeFile ? `Lettura di ${nomeFile}…` : 'oppure trascinalo qui'}
              </span>
              <input
                type="file"
                accept="application/pdf,.pdf,.docx"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (f) void leggiFile(f)
                }}
              />
            </label>
            <Pulsanti onAnnulla={onAnnulla} />
          </div>
        )}

        {/* ---------- documento non valido ---------- */}
        {passo === 'errore' && (
          <div>
            <h3 className="text-lg font-semibold text-red-800">Non posso proseguire</h3>
            <p className="mt-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm leading-relaxed text-red-800">
              {errore}
            </p>
            <div className="mt-4 flex justify-end gap-3">
              <button
                onClick={() => {
                  setErrore(null)
                  setDati(null)
                  setNomeFile('')
                  setPasso('lettura')
                }}
                className="rounded-lg border border-cielo-300 px-4 py-2 text-sm text-cielo-700 transition hover:bg-cielo-50"
              >
                Carica un altro file
              </button>
              <button
                onClick={onAnnulla}
                className="rounded-lg px-4 py-2 text-sm text-cielo-600 transition hover:bg-cielo-100"
              >
                Chiudi
              </button>
            </div>
          </div>
        )}

        {/* ---------- riepilogo di quel che ho letto ---------- */}
        {passo === 'controllo' && dati && (
          <div>
            <h3 className="text-lg font-semibold text-cielo-800">Ecco cosa ho letto</h3>
            <p className="mt-1 text-xs text-cielo-500">{nomeFile}</p>
            <dl className="mt-4 grid gap-3 sm:grid-cols-2">
              <Voce etichetta="Fornitore" valore={dati.fornitore} sotto={dati.fornitoreIndirizzo} />
              <Voce
                etichetta="Accordo quadro"
                valore={dati.accordoNome}
                sotto={dati.accordoData ? `del ${italiana(dati.accordoData)}` : null}
              />
              <Voce etichetta="Building Manager" valore={dati.buildingManager} sotto={dati.codiceFiscaleBM} />
              <Voce
                etichetta="Importo delle prestazioni"
                valore={dati.importo === null ? null : euro(dati.importo)}
              />
              <Voce
                etichetta="Durata dell'incarico"
                valore={
                  dati.decorrenza && dati.scadenza
                    ? `dal ${italiana(dati.decorrenza)} al ${italiana(dati.scadenza)}`
                    : null
                }
              />
              <Voce
                etichetta="Protocollo"
                valore={dati.protocollo}
                sotto={dati.protocolloData ? italiana(dati.protocolloData) : null}
              />
            </dl>
            <p className="mt-4 rounded-xl border border-cielo-200 bg-cielo-50 p-3 text-sm text-cielo-700">
              La lettera riguarda <b>{dati.compendi.length} compendi</b>. Adesso li abbiniamo agli immobili
              dell'archivio, uno alla volta.
            </p>
            <div className="mt-4 flex justify-end gap-3">
              <button
                onClick={onAnnulla}
                className="rounded-lg px-4 py-2 text-sm text-cielo-600 transition hover:bg-cielo-100"
              >
                Annulla
              </button>
              <button
                onClick={() => setPasso('abbina')}
                className="rounded-lg bg-cielo-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-cielo-600"
              >
                Avanti
              </button>
            </div>
          </div>
        )}

        {/* ---------- abbinamento riga per riga ---------- */}
        {passo === 'abbina' && dati && (
          <AbbinaCompendio
            riga={dati.compendi[indice]}
            numero={indice + 1}
            totale={dati.compendi.length}
            candidati={cercaCorrispondenze(dati.compendi[indice] ?? '', immobili)}
            immobileCorrente={immobileCorrente}
            onScegli={confermaScelta}
            onAnnulla={onAnnulla}
          />
        )}

        {/* ---------- dove registrare ---------- */}
        {passo === 'ambito' && dati && (
          <div>
            <h3 className="text-lg font-semibold text-cielo-800">Dove registro questi dati?</h3>
            <p className="mt-2 text-sm leading-relaxed text-cielo-700">
              {confermati.length > 1 ? (
                <>
                  Questa lettera comprende <b>{confermati.length} immobili</b>: {confermati.map((i) => i.denominazione).join(', ')}.
                </>
              ) : (
                <>
                  La lettera è stata abbinata a <b>{confermati[0]?.denominazione}</b>.
                </>
              )}
            </p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <button
                onClick={() => onFatto({ dati, nomeFile, immobili: confermati }, false)}
                className="rounded-xl border-2 border-cielo-400 bg-cielo-50 p-4 text-left transition hover:border-cielo-500 hover:bg-cielo-100"
              >
                <span className="block font-semibold text-cielo-800">Su tutti gli immobili della lettera</span>
                <span className="mt-1 block text-xs leading-snug text-cielo-600">
                  I dati dell'incarico vengono scritti su tutti e {confermati.length}. È la scelta normale.
                </span>
              </button>
              <button
                onClick={() =>
                  onFatto(
                    { dati, nomeFile, immobili: immobileCorrente ? [immobileCorrente] : confermati.slice(0, 1) },
                    true,
                  )
                }
                className="rounded-xl border border-cielo-300 bg-panna p-4 text-left transition hover:border-cielo-400 hover:bg-cielo-50"
              >
                <span className="block font-semibold text-cielo-800">Solo su questo immobile</span>
                <span className="mt-1 block text-xs leading-snug text-cielo-600">
                  Gli altri li farai a mano, ripetendo questa procedura dalla loro pagina.
                </span>
              </button>
            </div>
            <div className="mt-4 flex justify-end">
              <button
                onClick={onAnnulla}
                className="rounded-lg px-4 py-2 text-sm text-cielo-600 transition hover:bg-cielo-100"
              >
                Annulla
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

/** Un compendio della lettera e i possibili immobili corrispondenti. */
function AbbinaCompendio({
  riga,
  numero,
  totale,
  candidati,
  immobileCorrente,
  onScegli,
  onAnnulla,
}: {
  riga: string
  numero: number
  totale: number
  candidati: Candidato<Immobile>[]
  immobileCorrente: Immobile | null
  onScegli: (scelto: Immobile | null) => void
  onAnnulla: () => void
}) {
  const migliori = candidati.slice(0, 5)
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-cielo-500">
        Immobile {numero} di {totale}
      </p>
      <h3 className="mt-1 text-lg font-semibold text-cielo-800">Quale immobile è?</h3>
      <p className="mt-2 rounded-xl border border-cielo-200 bg-cielo-50 p-3 font-medium text-cielo-800">{riga}</p>

      {migliori.length === 0 ? (
        <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          Nell'archivio non c'è nessun immobile che somigli a questa riga.
        </p>
      ) : (
        <ul className="mt-4 space-y-2">
          {migliori.map((c) => (
            <li key={c.immobile.id}>
              <button
                onClick={() => onScegli(c.immobile)}
                className={`flex w-full items-center gap-3 rounded-xl border p-3 text-left transition hover:border-cielo-500 hover:bg-cielo-50 ${
                  c.immobile.id === immobileCorrente?.id ? 'border-cielo-400 bg-cielo-50' : 'border-cielo-200 bg-panna'
                }`}
              >
                <span className="rounded-full border border-cielo-300 bg-panna px-2 py-0.5 font-mono text-xs text-cielo-700">
                  {c.immobile.asset}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-medium text-cielo-800">{c.immobile.denominazione}</span>
                  {c.immobile.localizzazione && (
                    <span className="block truncate text-xs text-cielo-500">{c.immobile.localizzazione}</span>
                  )}
                </span>
                {c.immobile.id === immobileCorrente?.id && (
                  <span className="shrink-0 rounded-full bg-cielo-200 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-cielo-800">
                    aperto ora
                  </span>
                )}
                <span className="shrink-0 text-xs text-cielo-500">{Math.round(c.punteggio * 100)}%</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-4 flex flex-wrap justify-between gap-3">
        <button
          onClick={() => onScegli(null)}
          className="rounded-lg border border-cielo-300 px-4 py-2 text-sm text-cielo-700 transition hover:bg-cielo-50"
        >
          Nessuno di questi: salta questa riga
        </button>
        <button
          onClick={onAnnulla}
          className="rounded-lg px-4 py-2 text-sm text-cielo-600 transition hover:bg-cielo-100"
        >
          Annulla tutto
        </button>
      </div>
    </div>
  )
}

function Voce({ etichetta, valore, sotto }: { etichetta: string; valore: string | null; sotto?: string | null }) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wide text-cielo-500">{etichetta}</dt>
      <dd className={`mt-0.5 ${valore ? 'text-cielo-800' : 'text-amber-700'}`}>
        {valore || 'non trovato'}
        {sotto && <span className="block text-xs text-cielo-500">{sotto}</span>}
      </dd>
    </div>
  )
}

function Pulsanti({ onAnnulla }: { onAnnulla: () => void }) {
  return (
    <div className="mt-4 flex justify-end">
      <button onClick={onAnnulla} className="rounded-lg px-4 py-2 text-sm text-cielo-600 transition hover:bg-cielo-100">
        Annulla
      </button>
    </div>
  )
}

export function italiana(iso: string | null | undefined): string {
  if (!iso) return ''
  const [a, m, g] = iso.split('-')
  return g && m && a ? `${g}/${m}/${a}` : iso
}

function euro(n: number): string {
  return n.toLocaleString('it-IT', { style: 'currency', currency: 'EUR' })
}
