import { formatSimulationTime } from '../simulation/clock'

interface SimulationClockProps {
  minute: number
  isPlaying: boolean
}

export function SimulationClock({ minute, isPlaying }: SimulationClockProps) {
  return (
    <section className="simulation-clock" aria-label="Simulation clock">
      <span className="panel-label">Simulation time</span>
      <strong>{formatSimulationTime(minute)}</strong>
      <span className={`run-state ${isPlaying ? 'is-running' : ''}`}>
        {isPlaying ? 'Running' : 'Paused'}
      </span>
    </section>
  )
}
