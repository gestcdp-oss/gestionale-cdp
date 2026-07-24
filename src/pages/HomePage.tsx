import { Link } from 'react-router-dom'

const LOGO = `${import.meta.env.BASE_URL}logo.svg`

export default function HomePage() {
  return (
    <div>
      <div className="mb-8 flex flex-col items-center text-center">
        <img src={LOGO} alt="TR.A.V.I." className="h-24 w-24" />
        <h1 className="mt-3 text-2xl font-bold tracking-tight text-slate-800">TR.A.V.I.</h1>
        <p className="mt-1 text-sm text-slate-500">Tracciamento Attività Verifica Immobili</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Modulo
          to="/immobili"
          titolo="Inserimento Immobile"
          desc="Anagrafica immobili: inserisci, modifica e consulta gli asset."
          attivo
        />
        <Modulo
          titolo="Attività"
          desc="Building Manager, Due Diligence, Lavori, Prof SIA, Verde, Ambiente, Resp Amianto, Vigilanze, DUVRI."
        />
        <Modulo titolo="Report e certificati" desc="Generazione report e certificati per immobile e per attività." />
      </div>
    </div>
  )
}

function Modulo({
  to,
  titolo,
  desc,
  attivo,
}: {
  to?: string
  titolo: string
  desc: string
  attivo?: boolean
}) {
  const contenuto = (
    <div
      className={`h-full rounded-xl border p-5 transition ${
        attivo
          ? 'border-slate-200 bg-white hover:border-amber-300 hover:shadow-sm'
          : 'border-dashed border-slate-200 bg-slate-50'
      }`}
    >
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-slate-800">{titolo}</h2>
        {!attivo && (
          <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[10px] uppercase tracking-wide text-slate-500">
            presto
          </span>
        )}
      </div>
      <p className="mt-2 text-sm text-slate-500">{desc}</p>
    </div>
  )

  return attivo && to ? <Link to={to}>{contenuto}</Link> : contenuto
}
