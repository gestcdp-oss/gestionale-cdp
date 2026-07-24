const LOGO = `${import.meta.env.BASE_URL}logo.svg`

export default function HomePage() {
  return (
    <div className="flex min-h-[65vh] flex-col items-center justify-center text-center">
      <img src={LOGO} alt="TR.A.V.I." className="h-44 w-44 drop-shadow-sm" />
      <h1 className="mt-5 text-4xl font-bold tracking-tight text-cielo-800">TR.A.V.I.</h1>
      <p className="mt-2 text-lg text-cielo-600">Tracciamento Attività Verifica Immobili</p>
    </div>
  )
}
