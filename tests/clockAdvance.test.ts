import { describe, expect, it } from 'vitest'
import { advanceSimulationMinute } from '../src/simulation/clock'

describe('advanceSimulationMinute', () => {
  it('converts real elapsed milliseconds into simulated minutes', () => {
    expect(advanceSimulationMinute(10, 1000, 60, 65)).toBe(11)
    expect(advanceSimulationMinute(10, 1000, 30, 65)).toBe(10.5)
  })

  it('never advances beyond the scenario end', () => {
    expect(advanceSimulationMinute(64.5, 1000, 60, 65)).toBe(65)
    expect(advanceSimulationMinute(65, 1000, 60, 65)).toBe(65)
  })
})
