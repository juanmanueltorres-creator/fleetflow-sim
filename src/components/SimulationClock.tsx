import { formatSimulationTime } from '../simulation/clock'

interface SimulationClockProps {
  minute: number
  isPlaying: boolean
  isComplete?: boolean
}

export function SimulationClock({ minute, isPlaying, isComplete = false }: SimulationClockProps) {
  const stateLabel = isComplete ? 'Completado' : isPlaying ? 'Running' : 'Paused'
  const stateClass = isComplete ? 'is-complete' : isPlaying ? 'is-running' : ''

  return (
    <section className="simulation-clock" aria-label="Simulation clock">
      <span className="panel-label">Simulation time</span>
      <strong>{formatSimulationTime(minute)}</strong>
      <span className={`run-state ${stateClass}`}>{stateLabel}</span>
    </section>
  )
}
