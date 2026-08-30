import { describe, expect, it } from 'vitest'
import type { OperationalRun } from '../src/scenario/operationalRuns/types'
import { getScenarioDefinition } from '../src/scenario/scenarioRegistry'
import { validateOperationalRun } from '../src/scenario/operationalRuns/validation'

function validRun(): OperationalRun {
  return {
    id: 'cordoba-2026-08-31-v3',
    targetDate: '2026-08-31',
    issuedAt: '2026-08-30T21:00:00-03:00',
    dataAsOf: '2026-08-30T21:00:00-03:00',
    mode: 'FORECAST',
    modelVersion: 'fleetflow-v0.6',
    scenarioId: 'cordoba-calibrated',
    provenance: {
      generator: 'daily-spatial-demand-v1',
      seed: 'fleetflow:v0.6:cordoba:2026-08-31:operations',
      notes: ['Synthetic V0.6 model output.'],
      operationalProfile: {
        day: 1,
        dayLabel: 'Monday',
        intensityLabel: 'Reference',
        demandMultiplier: 1,
        travelTimeMultiplier: 1,
        summary: 'Reference daily profile.',
      },
    },
    scenario: structuredClone(getScenarioDefinition('cordoba-calibrated').scenario),
  }
}

function spatialDemand() {
  return {
    candidatePoolVersion: 'cordoba-delivery-pool-v1',
    deliveryCount: 57,
    gtfsReference: 'https://gobiernoabierto.cordoba.gob.ar/data/datos-abiertos/categoria/transporte-urbano/gtfs-de-la-ciudada-de-cordoba/3319',
    demandSeed: 'fleetflow:v0.6:cordoba:2026-08-31:demand',
    spatialSeed: 'fleetflow:v0.6:cordoba:2026-08-31:spatial',
    operationsSeed: 'fleetflow:v0.6:cordoba:2026-08-31:operations',
    assignmentSeed: 'fleetflow:v0.6:cordoba:2026-08-31:assignment',
  }
}

describe('V0.6 spatial demand provenance validation', () => {
  it('accepts the complete provenance block and preserves V0.5 compatibility when it is absent', () => {
    const v06 = validRun()
    ;(v06.provenance as any).spatialDemand = spatialDemand()
    expect(validateOperationalRun(v06)).toEqual([])

    const legacy = validRun()
    legacy.modelVersion = 'fleetflow-v0.5'
    legacy.provenance.generator = 'daily-calibrated-v1'
    legacy.provenance.seed = 'fleetflow:v0.5:cordoba:2026-08-31'
    expect(validateOperationalRun(legacy)).toEqual([])
  })

  it.each([44, 66])('rejects deliveryCount %s outside the 45–65 contract', (deliveryCount) => {
    const run = validRun()
    ;(run.provenance as any).spatialDemand = { ...spatialDemand(), deliveryCount }
    expect(validateOperationalRun(run)).toContainEqual(expect.stringMatching(/spatial demand/i))
  })

  it.each([
    'candidatePoolVersion',
    'gtfsReference',
    'demandSeed',
    'spatialSeed',
    'operationsSeed',
    'assignmentSeed',
  ])('rejects blank spatial provenance field %s', (field) => {
    const run = validRun()
    ;(run.provenance as any).spatialDemand = { ...spatialDemand(), [field]: '   ' }
    expect(validateOperationalRun(run)).toContainEqual(expect.stringMatching(/spatial demand/i))
  })
})
