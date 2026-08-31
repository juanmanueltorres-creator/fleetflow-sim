import { describe, expect, it } from 'vitest'
import baseRunJson from '../public/data/operational-runs/generated/cordoba-2026-08-27-v3.json'
import earlyRunJson from '../public/data/operational-runs/generated/cordoba-2026-08-27-v3-what-if-early-start-v1.json'
import type { OperationalRun } from '../src/scenario/operationalRuns/types'
import { getSimulationStartMinute } from '../src/simulation/window'

const baseRun = baseRunJson as unknown as OperationalRun
const earlyRun = earlyRunJson as unknown as OperationalRun

describe('simulation window', () => {
  it('starts ordinary Base scenarios at minute zero', () => {
    expect(getSimulationStartMinute(baseRun.scenario)).toBe(0)
  })

  it('preserves Early Start negative schedule minutes', () => {
    expect(Math.min(...earlyRun.scenario.routes.map((route) => route.departureMinute))).toBe(-60)
    expect(getSimulationStartMinute(earlyRun.scenario)).toBe(-60)
  })
})
