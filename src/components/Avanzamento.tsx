/**
 * Barra di avanzamento con il nome di quello che sta succedendo. Si usa dove
 * un'attesa è inevitabile (lettura di un file, impaginazione di un Word) e
 * sparisce da sola non appena arriva l'esito.
 */
export default function Avanzamento({
  testo,
  percentuale,
}: {
  testo: string
  /** da 0 a 100; se manca si mostra solo il girello */
  percentuale?: number
}) {
  return (
    <div className="flex w-64 flex-col items-center gap-3 rounded-2xl border border-cielo-200 bg-panna p-5 shadow-lg">
      <Girello />
      <p className="text-center text-sm text-cielo-700">{testo}…</p>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-cielo-200">
        <div
          className="h-full rounded-full bg-cielo-500 transition-all duration-300"
          style={{ width: `${Math.min(100, Math.max(3, percentuale ?? 0))}%` }}
        />
      </div>
    </div>
  )
}

function Girello() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" className="animate-spin text-cielo-500">
      <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="3" opacity="0.2" />
      <path
        d="M21 12a9 9 0 0 0-9-9"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  )
}
