import { useState } from 'react'
import { testoDaDocumento } from '../lib/documenti'
import { leggiScheda, confrontaConIncarico, simili } from '../lib/schedaIntervento'
import type { DatiScheda, Incoerenza } from '../lib/schedaIntervento'
import { cercaCorrispondenze } from '../lib/letteraAttivazione'
import type { Immobile } from '../lib/tipi'

/**
 * Caricamento degli allegati della Lettera di attivazione (le schede
 * intervento, una per immobile). Si possono scegliere più file insieme: di
 * ognuno si legge la scheda, si controlla che sia lo stesso incarico e si
 * riconosce l'immobile a cui appartiene.
 */
export type FileAnalizzato = {
  file: File
  scheda: DatiScheda | null
  /** immobile riconosciuto, modificabile a mano prima di registrare */
  immobile: Immobile | null
  /** perché il file non si può registrare */
  bloccante: string | null
  /** dati che non corrispondono all'incarico della lettera */
  incoerenze: Incoerenza[]
  /** committente della scheda diverso dal portafoglio dell'immobile */
  avvisoCommittente: string | null
}

/** L'incarico di un immobile per un certo anno, con la sua lettera. */
export type IncaricoDiRiferimento = {
  fornitore: string | null
  dal: string | null
  al: string | null
  categoria: string | null
  accordoNome: string | null
  nomeLettera: string | null
} | null

export default function CaricaAllegati({
  immobili,
  annoCorrente,
  leggiIncarico,
  onFatto,
  onAnnulla,
}: {
  immobili: Immobile[]
  annoCorrente: number
  /** legge la lettera registrata per quell'immobile in quell'anno */
  leggiIncarico: (immobileId: string, anno: number) => Promise<IncaricoDiRiferimento>
  onFatto: (scelti: FileAnalizzato[]) => void
  onAnnulla: () => void
}) {
  const [passo, setPasso] = useState<'scelta' | 'analisi' | 'riepilogo'>('scelta')
  const [analizzati, setAnalizzati] = useState<FileAnalizzato[]>([])
  const [quanti, setQuanti] = useState({ fatti: 0, totale: 0 })

  async function analizza(files: File[]) {
    setPasso('analisi')
    setQuanti({ fatti: 0, totale: files.length })
    const esiti: FileAnalizzato[] = []
    for (const file of files) {
      esiti.push(await analizzaUno(file, immobili, annoCorrente, leggiIncarico))
      setQuanti((q) => ({ ...q, fatti: q.fatti + 1 }))
    }
    setAnalizzati(esiti)
    setPasso('riepilogo')
  }

  async function cambiaImmobile(indice: number, immobile: Immobile | null) {
    const voce = analizzati[indice]
    if (!immobile) {
      setAnalizzati((e) => e.map((x, i) => (i === indice ? { ...x, immobile: null, bloccante: BLOCCO_IMMOBILE } : x)))
      return
    }
    // cambiando immobile cambia anche la lettera con cui confrontare
    const verifica = await verificaControLettera(voce.scheda, immobile, annoCorrente, leggiIncarico)
    setAnalizzati((e) =>
      e.map((x, i) => (i === indice ? { ...x, immobile, ...verifica } : x)),
    )
  }

  const registrabili = analizzati.filter((a) => !a.bloccante && a.immobile)
  const conProblemi = analizzati.filter((a) => a.bloccante || a.incoerenze.length > 0)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-velo p-4">
      <div className="max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-2xl border border-cielo-200 bg-panna p-6 shadow-xl">
        {passo === 'scelta' && (
          <div>
            <h3 className="text-lg font-semibold text-cielo-800">Carica gli allegati della lettera</h3>
            <p className="mt-2 text-sm leading-relaxed text-cielo-700">
              Puoi sceglierne <b>più d'uno insieme</b>. Gli allegati devono essere in <b>formato PDF</b> per
              poter essere letti: da ognuno il programma ricava sito, lotto, committente, classe, appaltatore e
              durata, e controlla che combacino con la <b>Lettera di attivazione di quell'immobile</b>. Un
              allegato senza la sua lettera non si può registrare.
            </p>
            <label className="mt-4 flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-cielo-300 bg-cielo-50 p-8 text-center transition hover:border-cielo-400 hover:bg-cielo-100">
              <span className="text-3xl">📎</span>
              <span className="mt-2 font-medium text-cielo-800">Scegli i file PDF</span>
              <span className="mt-1 text-xs text-cielo-600">tieni premuto Ctrl per sceglierne più d'uno</span>
              <input
                type="file"
                accept="application/pdf,.pdf"
                multiple
                className="hidden"
                onChange={(e) => {
                  const f = Array.from(e.target.files ?? [])
                  if (f.length) void analizza(f)
                }}
              />
            </label>
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

        {passo === 'analisi' && (
          <div className="py-10 text-center">
            <p className="text-3xl">📎</p>
            <p className="mt-3 font-medium text-cielo-800">
              Lettura degli allegati… {quanti.fatti} di {quanti.totale}
            </p>
            <div className="mx-auto mt-4 h-2 w-64 overflow-hidden rounded-full bg-cielo-100">
              <div
                className="h-full bg-cielo-500 transition-all"
                style={{ width: `${quanti.totale ? (quanti.fatti / quanti.totale) * 100 : 0}%` }}
              />
            </div>
          </div>
        )}

        {passo === 'riepilogo' && (
          <div>
            <h3 className="text-lg font-semibold text-cielo-800">Controllo degli allegati</h3>
            <p className="mt-1 text-sm text-cielo-600">
              {registrabili.length} su {analizzati.length} pronti da registrare
              {conProblemi.length > 0 && ` · ${conProblemi.length} da guardare`}
            </p>

            <ul className="mt-4 space-y-3">
              {analizzati.map((a, i) => (
                <li
                  key={a.file.name + i}
                  className={`rounded-xl border p-4 ${
                    a.bloccante
                      ? 'border-red-200 bg-red-50'
                      : a.incoerenze.length
                        ? 'border-amber-200 bg-amber-50'
                        : 'border-cielo-200 bg-panna'
                  }`}
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="font-medium text-cielo-800">{a.file.name}</span>
                    <span className="text-xs text-cielo-500">
                      {a.scheda?.oggetto ?? 'oggetto non riconosciuto'}
                    </span>
                  </div>

                  {a.bloccante ? (
                    <p className="mt-2 text-sm text-red-800">{a.bloccante}</p>
                  ) : (
                    <div className="mt-2 grid gap-2 text-sm sm:grid-cols-2">
                      <Riga etichetta="Sito nella scheda" valore={etichettaSito(a.scheda)} />
                      <label className="flex items-center gap-2">
                        <span className="shrink-0 text-xs font-semibold uppercase tracking-wide text-cielo-500">
                          Immobile
                        </span>
                        <select
                          value={a.immobile?.id ?? ''}
                          onChange={(e) =>
                            void cambiaImmobile(i, immobili.find((im) => im.id === e.target.value) ?? null)
                          }
                          className="min-w-0 flex-1 rounded border border-cielo-300 bg-white px-2 py-1 text-sm text-cielo-800 outline-none focus:border-cielo-400"
                        >
                          <option value="">— nessuno —</option>
                          {immobili.map((im) => (
                            <option key={im.id} value={im.id}>
                              {im.asset} · {im.denominazione}
                            </option>
                          ))}
                        </select>
                      </label>
                      <Riga etichetta="Lotto" valore={a.scheda?.lotto} />
                      <Riga etichetta="Committente" valore={a.scheda?.committente} />
                      <Riga etichetta="Classe" valore={a.scheda?.classe} />
                      <Riga etichetta="Appaltatore" valore={a.scheda?.appaltatore} />
                    </div>
                  )}

                  {a.incoerenze.length > 0 && (
                    <div className="mt-3 rounded-lg border border-amber-300 bg-amber-100 p-3 text-sm text-amber-900">
                      <b>Attenzione: questi dati non corrispondono alla lettera di questo immobile.</b>
                      <ul className="mt-1 list-disc pl-5">
                        {a.incoerenze.map((p) => (
                          <li key={p.campo}>
                            {p.campo}: nell'allegato <b>{p.nellaScheda}</b>, nell'incarico{' '}
                            <b>{p.nellIncarico}</b>
                          </li>
                        ))}
                      </ul>
                      <p className="mt-1 text-xs">
                        Se non è un errore di lettura, questo allegato appartiene a un altro incarico.
                      </p>
                    </div>
                  )}

                  {a.avvisoCommittente && !a.bloccante && (
                    <p className="mt-2 text-xs text-amber-800">⚠️ {a.avvisoCommittente}</p>
                  )}
                </li>
              ))}
            </ul>

            <div className="mt-5 flex flex-wrap justify-end gap-3">
              <button
                onClick={onAnnulla}
                className="rounded-lg px-4 py-2 text-sm text-cielo-600 transition hover:bg-cielo-100"
              >
                Annulla
              </button>
              <button
                onClick={() => onFatto(registrabili)}
                disabled={registrabili.length === 0}
                className="rounded-lg bg-cielo-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-cielo-600 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Registra {registrabili.length} {registrabili.length === 1 ? 'allegato' : 'allegati'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

const BLOCCO_IMMOBILE = "Non si capisce a quale immobile si riferisce: scegli tu l'immobile qui sopra."

/**
 * Un allegato vive solo grazie alla sua lettera: qui si controlla che
 * l'immobile riconosciuto abbia davvero una Lettera di attivazione per quel
 * periodo e che i dati della scheda siano gli stessi di quella lettera.
 */
async function verificaControLettera(
  scheda: DatiScheda | null,
  immobile: Immobile,
  annoCorrente: number,
  leggiIncarico: (immobileId: string, anno: number) => Promise<IncaricoDiRiferimento>,
): Promise<{ bloccante: string | null; incoerenze: Incoerenza[]; avvisoCommittente: string | null }> {
  const anno = Number((scheda?.dal ?? '').slice(0, 4)) || annoCorrente
  const incarico = await leggiIncarico(immobile.id, anno)
  if (!incarico) {
    return {
      bloccante:
        `${immobile.asset} · ${immobile.denominazione} non ha una Lettera di attivazione per il ${anno}: ` +
        'gli allegati vivono solo insieme alla loro lettera, quindi va caricata prima quella.',
      incoerenze: [],
      avvisoCommittente: null,
    }
  }
  return {
    bloccante: null,
    incoerenze: scheda
      ? confrontaConIncarico(scheda, {
          fornitore: incarico.fornitore,
          dal: incarico.dal,
          al: incarico.al,
          categoria: incarico.categoria,
        })
      : [],
    avvisoCommittente: avvisoCommittente(scheda, immobile),
  }
}

async function analizzaUno(
  file: File,
  immobili: Immobile[],
  annoCorrente: number,
  leggiIncarico: (immobileId: string, anno: number) => Promise<IncaricoDiRiferimento>,
): Promise<FileAnalizzato> {
  const vuoto: FileAnalizzato = {
    file,
    scheda: null,
    immobile: null,
    bloccante: null,
    incoerenze: [],
    avvisoCommittente: null,
  }
  if (!/\.pdf$/i.test(file.name)) {
    return { ...vuoto, bloccante: 'Gli allegati vanno caricati in PDF: questo file è di un altro formato.' }
  }
  let scheda: DatiScheda
  try {
    const testo = await testoDaDocumento(file)
    if (testo.replace(/\s/g, '').length < 100) {
      return { ...vuoto, bloccante: 'Da questo PDF non si legge il testo: probabilmente è una scansione.' }
    }
    scheda = leggiScheda(testo)
  } catch (e) {
    return { ...vuoto, bloccante: String((e as Error)?.message ?? e) }
  }

  if (!scheda.eBuildingManager) {
    return {
      ...vuoto,
      scheda,
      bloccante: `Questo allegato non è di un incarico di Building Manager${
        scheda.oggetto ? `: risulta «${scheda.oggetto}»` : ''
      }.`,
    }
  }

  // l'immobile si riconosce dal numero asset, che nella scheda c'è quasi sempre
  let immobile: Immobile | null = null
  if (scheda.asset) {
    const n = (s: string) => s.replace(/^0+/, '')
    immobile = immobili.find((im) => n(im.asset) === n(scheda.asset as string)) ?? null
  }
  if (!immobile && scheda.sito) {
    const candidati = cercaCorrispondenze(scheda.sito, immobili)
    if (candidati.length && candidati[0].punteggio >= 0.5) immobile = candidati[0].immobile
  }

  if (!immobile) {
    return { ...vuoto, scheda, bloccante: BLOCCO_IMMOBILE }
  }
  // il confronto si fa con la lettera di QUELL'immobile, non con quella aperta
  const verifica = await verificaControLettera(scheda, immobile, annoCorrente, leggiIncarico)
  return { file, scheda, immobile, ...verifica }
}

function avvisoCommittente(scheda: DatiScheda | null, immobile: Immobile | null): string | null {
  const committente = scheda?.committente
  const portafoglio = immobile?.portafoglio
  if (!committente || !portafoglio) return null
  if (simili(committente, portafoglio)) return null
  // le diciture non coincidono quasi mai alla lettera: si segnala, non si blocca
  const parole = portafoglio.toLowerCase().split(/\s+/).filter((p) => p.length > 3)
  if (parole.some((p) => committente.toLowerCase().includes(p))) return null
  return `Il committente della scheda («${committente}») non somiglia al portafoglio dell'immobile («${portafoglio}»): controlla che sia lo stesso incarico.`
}

function etichettaSito(scheda: DatiScheda | null): string | null {
  if (!scheda) return null
  return [scheda.asset, scheda.sito].filter(Boolean).join(' · ') || null
}

function Riga({ etichetta, valore }: { etichetta: string; valore: string | null | undefined }) {
  return (
    <p className="flex gap-2">
      <span className="shrink-0 text-xs font-semibold uppercase tracking-wide text-cielo-500">{etichetta}</span>
      <span className={`min-w-0 flex-1 truncate ${valore ? 'text-cielo-800' : 'text-cielo-400'}`}>
        {valore || '—'}
      </span>
    </p>
  )
}
