interface SimulationControlsProps {
  isPlaying: boolean
  isComplete?: boolean
  speed: number
  onPlayPause: () => void
  onReset: () => void
  onSpeedChange: (speed: number) => void
}

const SPEEDS = [1, 10, 30, 60]

export function SimulationControls({
  isPlaying,
  isComplete = false,
  speed,
  onPlayPause,
  onReset,
  onSpeedChange,
}: SimulationControlsProps) {
  return (
    <section className="simulation-controls" aria-label="Simulation controls">
      <button
        type="button"
        onClick={onPlayPause}
        aria-label={isPlaying ? 'Pause simulation' : 'Play simulation'}
        disabled={isComplete}
      >
        {isPlaying ? 'Pause' : 'Play'}
      </button>
      <button
        type="button"
        className={isComplete ? 'is-complete' : undefined}
        onClick={onReset}
        aria-label={isComplete ? 'Repeat trip' : 'Reset simulation'}
      >
        {isComplete ? '↻ Repetir viaje' : 'Reset'}
      </button>
      <label>
        <span>Simulation speed</span>
        <select
          aria-label="Simulation speed"
          value={speed}
          onChange={(event) => onSpeedChange(Number(event.target.value))}
        >
          {SPEEDS.map((value) => (
            <option key={value} value={value}>
              {value}×
            </option>
          ))}
        </select>
      </label>
    </section>
  )
}
