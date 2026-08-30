import type { OperationalRun } from '../scenario/operationalRuns/types'

interface OperationalExplainerProps {
  run: OperationalRun
}

const DAY_LABELS = [
  'Domingo',
  'Lunes',
  'Martes',
  'Miércoles',
  'Jueves',
  'Viernes',
  'Sábado',
] as const

function fallbackDayLabel(targetDate: string): string {
  const day = new Date(`${targetDate}T00:00:00Z`).getUTCDay()
  return DAY_LABELS[day] ?? 'Jornada'
}

export function OperationalExplainer({ run }: OperationalExplainerProps) {
  const profile = run.provenance.operationalProfile
  const dayLabel = profile?.dayLabel ?? fallbackDayLabel(run.targetDate)
  const intensityLabel = profile?.intensityLabel ?? 'jornada guardada'
  const summary = profile?.summary
    ?? 'Este run conserva la carga y los tiempos operativos generados para esa fecha.'

  return (
    <section className="operational-explainer" aria-labelledby="operational-explainer-title">
      <h2 id="operational-explainer-title">Qué estás viendo</h2>
      <p>
        Acá la base del mapa no cambia: cambian las condiciones de la jornada. Por eso podés ver cómo se reparte el trabajo entre vehículos, cuánto tarda cada circuito y cómo se mueve la flota según la carga de ese día.
      </p>
      <p className="operational-explainer-day">
        <strong>{dayLabel} · {intensityLabel}</strong>
        <span>{summary}</span>
      </p>
    </section>
  )
}
