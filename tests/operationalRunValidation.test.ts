import { describe, expect, it } from 'vitest'
import type { OperationalRun } from '../src/scenario/operationalRuns/types'
import { getCordobaOperationalDate } from '../src/scenario/operationalRuns/date'
import {
  requireValidOperationalRun,
  validateOperationalRun,
} from '../src/scenario/operationalRuns/validation'
import { getScenarioDefinition } from '../src/scenario/scenarioRegistry'

function validRun(): OperationalRun {
  return {
    id: 'cordoba-2026-08-31-v1',
    targetDate: '2026-08-31',
    issuedAt: '2026-08-30T21:00:00-03:00',
    dataAsOf: '2026-08-30T21:00:00-03:00',
    mode: 'FORECAST',
    modelVersion: 'fleetflow-v0.5',
    scenarioId: 'cordoba-calibrated',
    provenance: {
      generator: 'daily-calibrated-v1',
      seed: 'fleetflow:v0.5:cordoba:2026-08-31',
      notes: ['Synthetic/calibrated operational forecast.'],
    },
    scenario: structuredClone(getScenarioDefinition('cordoba-calibrated').scenario),
  }
}

describe('operational run validation', () => {
  it('accepts valid FORECAST and SIMULATED envelopes', () => {
    const forecast = validRun()
    expect(validateOperationalRun(forecast)).toEqual([])
    expect(requireValidOperationalRun(forecast)).toBe(forecast)

    const simulated = validRun()
    simulated.mode = 'SIMULATED'
    simulated.targetDate = '2026-08-29'
    expect(validateOperationalRun(simulated)).toEqual([])
  })

  it.each(['2026-2-03', '2026-02-30', 'not-a-date'])('rejects invalid targetDate %s', (targetDate) => {
    const run = validRun()
    run.targetDate = targetDate
    expect(validateOperationalRun(run)).toContainEqual(expect.stringMatching(/targetDate/i))
  })

  it.each([
    ['issuedAt', '2026-08-30T21:00:00'],
    ['issuedAt', '2026-02-30T21:00:00-03:00'],
    ['dataAsOf', 'not-a-timestamp'],
    ['dataAsOf', '2026-02-30T20:00:00-03:00'],
  ] as const)('rejects invalid %s timestamp %s', (field, value) => {
    const run = validRun()
    run[field] = value
    expect(validateOperationalRun(run)).toContainEqual(expect.stringMatching(new RegExp(field, 'i')))
  })

  it('rejects dataAsOf after issuedAt', () => {
    const run = validRun()
    run.dataAsOf = '2026-08-30T22:00:00-03:00'
    expect(validateOperationalRun(run)).toContainEqual(expect.stringMatching(/dataAsOf/i))
  })

  it.each(['', 'bad id', '../cordoba-run'])('rejects malformed run id %s', (id) => {
    const run = validRun()
    run.id = id
    expect(validateOperationalRun(run)).toContainEqual(expect.stringMatching(/id/i))
  })

  it('rejects unknown modes and empty provenance seed', () => {
    const run = validRun()
    run.mode = 'LIVE' as OperationalRun['mode']
    run.provenance.seed = ''

    const errors = validateOperationalRun(run)
    expect(errors).toContainEqual(expect.stringMatching(/mode/i))
    expect(errors).toContainEqual(expect.stringMatching(/seed/i))
  })

  it('rejects missing provenance generator and invalid notes', () => {
    const run = validRun()
    run.provenance.generator = ''
    run.provenance.notes = [42] as unknown as string[]

    const errors = validateOperationalRun(run)
    expect(errors).toContainEqual(expect.stringMatching(/generator/i))
    expect(errors).toContainEqual(expect.stringMatching(/notes/i))
  })

  it('rejects empty model version and unknown scenario id', () => {
    const run = validRun()
    run.modelVersion = '   '
    run.scenarioId = 'unknown-scenario' as OperationalRun['scenarioId']

    const errors = validateOperationalRun(run)
    expect(errors).toContainEqual(expect.stringMatching(/modelVersion/i))
    expect(errors).toContainEqual(expect.stringMatching(/scenarioId/i))
  })

  it('rejects a nested invalid FleetScenario', () => {
    const run = validRun()
    run.scenario.trucks[0].id = run.scenario.trucks[1].id
    expect(validateOperationalRun(run)).toContainEqual(expect.stringMatching(/duplicate truck id/i))
    expect(() => requireValidOperationalRun(run)).toThrow(/duplicate truck id/i)
  })

  it.each([
    ['depot longitude', (run: OperationalRun) => {
      run.scenario.depot.position[0] = 'bad' as unknown as number
    }],
    ['store latitude', (run: OperationalRun) => {
      run.scenario.stores[0].position[1] = Number.NaN
    }],
    ['store serviceMinutes', (run: OperationalRun) => {
      run.scenario.stores[0].serviceMinutes = 'bad' as unknown as number
    }],
    ['store timeWindow', (run: OperationalRun) => {
      run.scenario.stores[0].timeWindow = {
        startMinute: 'bad' as unknown as number,
        endMinute: 600,
      }
    }],
    ['truck fuel consumption', (run: OperationalRun) => {
      run.scenario.trucks[0].fuelConsumptionLPer100Km = Number.POSITIVE_INFINITY
    }],
    ['truck capacity', (run: OperationalRun) => {
      const capacity = run.scenario.trucks[0].capacity
      if (capacity.kind === 'MASS') {
        capacity.capacityKg = 'bad' as unknown as number
      } else {
        capacity.capacityCm3 = 'bad' as unknown as number
      }
    }],
    ['route departureMinute', (run: OperationalRun) => {
      run.scenario.routes[0].departureMinute = Number.NaN
    }],
    ['route returnMinute', (run: OperationalRun) => {
      run.scenario.routes[0].returnMinute = 'bad' as unknown as number
    }],
    ['stop plannedArrivalMinute', (run: OperationalRun) => {
      run.scenario.routes[0].stops[0].plannedArrivalMinute = 'bad' as unknown as number
    }],
    ['stop plannedDepartureMinute', (run: OperationalRun) => {
      run.scenario.routes[0].stops[0].plannedDepartureMinute = Number.NaN
    }],
    ['stop cargo quantity', (run: OperationalRun) => {
      const cargo = run.scenario.routes[0].stops[0].cargo
      if (cargo.kind === 'MASS') {
        cargo.quantityKg = 'bad' as unknown as number
      } else {
        cargo.volumeCm3 = 'bad' as unknown as number
      }
    }],
  ] as Array<[string, (run: OperationalRun) => void]>)('rejects nonnumeric nested scenario field %s', (_label, mutate) => {
    const run = validRun()
    mutate(run)

    expect(validateOperationalRun(run)).toContainEqual(expect.stringMatching(/scenario shape/i))
    expect(() => requireValidOperationalRun(run)).toThrow(/scenario shape/i)
  })

  it('derives TODAY in Córdoba instead of viewer timezone', () => {
    expect(getCordobaOperationalDate(new Date('2026-08-31T02:00:00Z'))).toBe('2026-08-30')
  })
})
