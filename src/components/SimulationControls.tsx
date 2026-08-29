interface SimulationControlsProps {
  isPlaying: boolean
  speed: number
  onPlayPause: () => void
  onReset: () => void
  onSpeedChange: (speed: number) => void
}

const SPEEDS = [1, 10, 30, 60]

export function SimulationControls({
  isPlaying,
  speed,
  onPlayPause,
  onReset,
  onSpeedChange,
}: SimulationControlsProps) {
  return (
    <section className="simulation-controls" aria-label="Simulation controls">
      <button type="button" onClick={onPlayPause} aria-label={isPlaying ? 'Pause simulation' : 'Play simulation'}>
        {isPlaying ? 'Pause' : 'Play'}
      </button>
      <button type="button" onClick={onReset} aria-label="Reset simulation">
        Reset
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
