import { useAggiornamenti } from '../hooks/useAggiornamenti'

/**
 * Toast/badge arancione mostrato SOLO quando e stato pubblicato un nuovo deploy.
 * Un tocco ricarica la pagina per prendere la versione aggiornata.
 */
export default function BannerAggiornamento() {
  const nuovaVersione = useAggiornamenti()
  if (!nuovaVersione) return null

  return (
    <div className="fixed inset-x-0 bottom-4 z-50 flex justify-center px-4">
      <button
        onClick={() => window.location.reload()}
        className="flex items-center gap-2 rounded-full bg-amber-500 px-5 py-2.5 text-sm font-medium text-white shadow-lg ring-1 ring-black/5 transition hover:bg-amber-600"
      >
        <span className="relative flex h-2.5 w-2.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white opacity-75" />
          <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-white" />
        </span>
        Nuova versione disponibile — tocca per aggiornare
      </button>
    </div>
  )
}
