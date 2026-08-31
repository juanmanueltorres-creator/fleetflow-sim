import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import baseRunJson from '../public/data/operational-runs/generated/cordoba-2026-08-27-v3.json'
import type { OperationalBundle } from '../src/scenario/operationalRuns/bundle'
import {
  deriveScenarioDelta,
  deriveScenarioOutcome,
  type ScenarioOutcome,
} from '../src/scenario/whatIf/outcomes'
import { deriveEarlyStart } from '../scripts/lib/what-if-derivation.mjs'

const ISSUED_AT = '2026-08-30T21:05:00-03:00'

function routes() {
  return JSON.parse(readFileSync(resolve(
    'public/data/operational-runs/generated/cordoba-2026-08-27-v3.routes.geojson',
  ), 'utf8'))
}

function entryFor(run: any) {
  return {
    id: run.id,
    targetDate: run.targetDate,
    issuedAt: run.issuedAt,
    dataAsOf: run.dataAsOf,
    mode: run.mode,
    scenarioId: run.scenarioId,
    modelVersion: run.modelVersion,
    artifact: `./generated/${run.id}.json`,
    routeArtifact: `./generated/${run.id}.routes.geojson`,
  }
}

function baseBundle(): OperationalBundle {
  const run: any = structuredClone(baseRunJson)
  return {
    manifestEntry: entryFor(run),
    run,
    routes: routes(),
    context: { status: 'omitted' },
  }
}

function earlyBundle(): OperationalBundle {
  const base = baseBundle()
  const actionSet = {
    schemaVersion: 1,
    id: `${base.run.id}-early-start-v1`,
    label: 'Early start',
    baseRunId: base.run.id,
    actions: [{ type: 'SHIFT_DEPARTURE', minutes: -60 }],
  }
  const derived = deriveEarlyStart({
    baseRun: base.run,
    baseRoutes: base.routes,
    actionSet,
    issuedAt: ISSUED_AT,
  })
  return {
    manifestEntry: entryFor(derived.run),
    run: derived.run,
    routes: derived.routeCollection,
    context: { status: 'omitted' },
  }
}

describe('ScenarioOutcome', () => {
  it('evaluates Base and Early at each operation complete point', () => {
    const base = deriveScenarioOutcome(baseBundle())
    const early = deriveScenarioOutcome(earlyBundle())

    expect(early.operationStartMinute).toBe(base.operationStartMinute - 60)
    expect(early.operationEndMinute).toBe(base.operationEndMinute - 60)
    expect(early.operationSpanMinutes).toBe(base.operationSpanMinutes)
    expect(early.plannedDistanceKm).toBeCloseTo(base.plannedDistanceKm, 10)
    expect(early.estimatedFuelUsedL).toBeCloseTo(base.estimatedFuelUsedL ?? Number.NaN, 10)
    expect(early.packageLoadSpread).toBe(base.packageLoadSpread)
    expect(early.meanVehicleUtilizationPct).toBeCloseTo(
      base.meanVehicleUtilizationPct ?? Number.NaN,
      10,
    )
    expect(early.maxVehicleUtilizationPct).toBeCloseTo(
      base.maxVehicleUtilizationPct ?? Number.NaN,
      10,
    )
    expect(early.completedDeliveries).toBe(early.totalDeliveries)
    expect(base.completedDeliveries).toBe(base.totalDeliveries)
    expect(early.totalPackages).toBe(base.totalPackages)
  })
})

describe('ScenarioDelta', () => {
  it('always computes alternative minus Base', () => {
    const base = deriveScenarioOutcome(baseBundle())
    const early = deriveScenarioOutcome(earlyBundle())
    const delta = deriveScenarioDelta(base, early)

    expect(delta.baseRunId).toBe(base.runId)
    expect(delta.alternativeRunId).toBe(early.runId)
    expect(delta.operationEndDeltaMinutes).toBe(-60)
    expect(delta.operationSpanDeltaMinutes).toBe(0)
    expect(delta.distanceDeltaKm).toBeCloseTo(0, 10)
    expect(delta.estimatedFuelDeltaL).toBeCloseTo(0, 10)
    expect(delta.meanUtilizationDeltaPct).toBeCloseTo(0, 10)
    expect(delta.maxUtilizationDeltaPct).toBeCloseTo(0, 10)
    expect(delta.packageLoadSpreadDelta).toBe(0)
  })

  it('propagates unavailable optional metrics instead of inventing zero', () => {
    const base: ScenarioOutcome = {
      runId: 'base-run',
      mode: 'SIMULATED',
      operationStartMinute: 0,
      operationEndMinute: 120,
      operationSpanMinutes: 120,
      totalPackages: null,
      totalDeliveries: 5,
      completedDeliveries: 5,
      plannedDistanceKm: 20,
      estimatedFuelUsedL: null,
      meanVehicleUtilizationPct: null,
      maxVehicleUtilizationPct: 80,
      packageLoadSpread: null,
    }
    const alternative: ScenarioOutcome = {
      ...base,
      runId: 'alternative-run',
      operationEndMinute: 110,
      operationSpanMinutes: 110,
      plannedDistanceKm: 18,
      estimatedFuelUsedL: 4,
      meanVehicleUtilizationPct: 60,
      maxVehicleUtilizationPct: null,
      packageLoadSpread: 2,
    }

    const delta = deriveScenarioDelta(base, alternative)
    expect(delta.operationEndDeltaMinutes).toBe(-10)
    expect(delta.operationSpanDeltaMinutes).toBe(-10)
    expect(delta.distanceDeltaKm).toBe(-2)
    expect(delta.estimatedFuelDeltaL).toBeNull()
    expect(delta.meanUtilizationDeltaPct).toBeNull()
    expect(delta.maxUtilizationDeltaPct).toBeNull()
    expect(delta.packageLoadSpreadDelta).toBeNull()
  })
})
