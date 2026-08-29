export function formatSimulationTime(minute: number): string {
  const absolute = Math.max(0, Math.round(360 + minute))
  return `${String(Math.floor(absolute / 60) % 24).padStart(2, '0')}:${String(absolute % 60).padStart(2, '0')}`
}

export function advanceSimulationMinute(
  currentMinute: number,
  elapsedRealMs: number,
  simulatedSecondsPerRealSecond: number,
  maxMinute: number,
): number {
  const elapsedSimulatedMinutes =
    (elapsedRealMs / 1000) * (simulatedSecondsPerRealSecond / 60)

  return Math.min(maxMinute, currentMinute + elapsedSimulatedMinutes)
}
