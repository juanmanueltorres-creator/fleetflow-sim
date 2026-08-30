import { getWeeklyOperationalProfile } from '../scenario/operationalRuns/weeklyProfile'

interface OperationalExplainerProps {
  targetDate: string
}

export function OperationalExplainer({ targetDate }: OperationalExplainerProps) {
  const profile = getWeeklyOperationalProfile(targetDate)

  return (
    <section className="operational-explainer" aria-labelledby="operational-explainer-title">
      <h2 id="operational-explainer-title">Qué estás viendo</h2>
      <p>
        Acá la base del mapa no cambia: cambian las condiciones de la jornada. Por eso podés ver cómo se reparte el trabajo entre vehículos, cuánto tarda cada circuito y cómo se mueve la flota según la carga de ese día.
      </p>
      <p className="operational-explainer-day">
        <strong>{profile.dayLabel} · {profile.intensityLabel}</strong>
        <span>{profile.summary}</span>
      </p>
    </section>
  )
}
