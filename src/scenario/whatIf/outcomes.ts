import { routeCollectionToIndex } from '../../map/routeAssets'
import type { OperationalBundle } from '../operationalRuns/bundle'
import { getFleetSnapshot } from '../../simulation/engine'
import { deriveFleetMetrics } from '../../simulation/metrics'

export interface ScenarioOutcome {
  runId: string
  mode: 'SIMULATED' | 'FORECAST' | 'WHAT_IF'
  operationStartMinute: number
  operationEndMinute: number
  operationSpanMinutes: number
  totalPackages: number | null
  totalDeliveries: number
  completedDeliveries: number
  plannedDistanceKm: number
  estimatedFuelUsedL: number | null
  meanVehicleUtilizationPct: number | null
  maxVehicleUtilizationPct: number | null
  packageLoadSpread: number | null
}

export interface ScenarioDelta {
  alternativeRunId: string
  baseRunId: string
  operationEndDeltaMinutes: number
  operationSpanDeltaMinutes: number
  distanceDeltaKm: number
  estimatedFuelDeltaL: number | null
  meanUtilizationDeltaPct: number | null
  maxUtilizationDeltaPct: number | null
  packageLoadSpreadDelta: number | null
}

function parcelLoadMetrics(bundle: OperationalBundle): {
  meanVehicleUtilizationPct: number | null
  maxVehicleUtilizationPct: number | null
  packageLoadSpread: number | null
} {
  const scenario = bundle.run.scenario
  const truckById = new Map(scenario.trucks.map((truck) => [truck.id, truck]))
  const utilization: number[] = []
  const packageLoads: number[] = []

  for (const route of scenario.routes) {
    const truck = truckById.get(route.truckId)
    if (
      !truck
      || truck.capacity.kind !== 'PARCELS'
      || !Number.isFinite(truck.capacity.capacityCm3)
      || truck.capacity.capacityCm3 <= 0
    ) {
      return {
        meanVehicleUtilizationPct: null,
        maxVehicleUtilizationPct: null,
        packageLoadSpread: null,
      }
    }

    let volumeCm3 = 0
    let packageCount = 0
    for (const stop of route.stops) {
      if (
        stop.cargo.kind !== 'PARCELS'
        || !Number.isFinite(stop.cargo.volumeCm3)
        || !Number.isFinite(stop.cargo.packageCount)
      ) {
        return {
          meanVehicleUtilizationPct: null,
          maxVehicleUtilizationPct: null,
          packageLoadSpread: null,
        }
      }
      volumeCm3 += stop.cargo.volumeCm3
      packageCount += stop.cargo.packageCount
    }

    utilization.push((volumeCm3 / truck.capacity.capacityCm3) * 100)
    packageLoads.push(packageCount)
  }

  if (utilization.length === 0 || packageLoads.length === 0) {
    return {
      meanVehicleUtilizationPct: null,
      maxVehicleUtilizationPct: null,
      packageLoadSpread: null,
    }
  }

  return {
    meanVehicleUtilizationPct:
      utilization.reduce((sum, value) => sum + value, 0) / utilization.length,
    maxVehicleUtilizationPct: Math.max(...utilization),
    packageLoadSpread: Math.max(...packageLoads) - Math.min(...packageLoads),
  }
}

export function deriveScenarioOutcome(bundle: OperationalBundle): ScenarioOutcome {
  const scenario = bundle.run.scenario
  if (scenario.routes.length === 0) {
    throw new Error('ScenarioOutcome requires at least one route')
  }
  if (
    bundle.run.mode !== 'SIMULATED'
    && bundle.run.mode !== 'FORECAST'
    && bundle.run.mode !== 'WHAT_IF'
  ) {
    throw new Error(`ScenarioOutcome does not support mode ${bundle.run.mode}`)
  }

  const routeIndex = routeCollectionToIndex(bundle.routes, scenario)
  const operationStartMinute = Math.min(
    ...scenario.routes.map((route) => route.departureMinute),
  )
  const operationEndMinute = Math.max(
    ...scenario.routes.map((route) => route.returnMinute),
  )
  const snapshot = getFleetSnapshot(scenario, routeIndex, operationEndMinute)
  const metrics = deriveFleetMetrics(scenario, snapshot, routeIndex)
  const parcelMetrics = parcelLoadMetrics(bundle)

  return {
    runId: bundle.run.id,
    mode: bundle.run.mode,
    operationStartMinute,
    operationEndMinute,
    operationSpanMinutes: operationEndMinute - operationStartMinute,
    totalPackages: metrics.totalPackages,
    totalDeliveries: metrics.totalDeliveries,
    completedDeliveries: metrics.completedDeliveries,
    plannedDistanceKm: metrics.plannedDistanceKm,
    estimatedFuelUsedL: Number.isFinite(metrics.estimatedFuelUsedL)
      ? metrics.estimatedFuelUsedL
      : null,
    ...parcelMetrics,
  }
}

function optionalDelta(base: number | null, alternative: number | null): number | null {
  return base === null || alternative === null ? null : alternative - base
}

export function deriveScenarioDelta(
  base: ScenarioOutcome,
  alternative: ScenarioOutcome,
): ScenarioDelta {
  return {
    alternativeRunId: alternative.runId,
    baseRunId: base.runId,
    operationEndDeltaMinutes: alternative.operationEndMinute - base.operationEndMinute,
    operationSpanDeltaMinutes: alternative.operationSpanMinutes - base.operationSpanMinutes,
    distanceDeltaKm: alternative.plannedDistanceKm - base.plannedDistanceKm,
    estimatedFuelDeltaL: optionalDelta(base.estimatedFuelUsedL, alternative.estimatedFuelUsedL),
    meanUtilizationDeltaPct: optionalDelta(
      base.meanVehicleUtilizationPct,
      alternative.meanVehicleUtilizationPct,
    ),
    maxUtilizationDeltaPct: optionalDelta(
      base.maxVehicleUtilizationPct,
      alternative.maxVehicleUtilizationPct,
    ),
    packageLoadSpreadDelta: optionalDelta(
      base.packageLoadSpread,
      alternative.packageLoadSpread,
    ),
  }
}
