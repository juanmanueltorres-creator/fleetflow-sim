import type { FleetScenario } from '../../domain/types'
import type { RouteGeometryCollection } from '../../map/routeAssets'
import type { OperationalBundle } from '../operationalRuns/bundle'
import type { WhatIfAction } from './contracts'
import type { ScenarioComparisonSet } from './types'

function deepEqual(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right)
}

function sortedDestinationIds(scenario: FleetScenario): string[] {
  return scenario.stores.map((store) => store.id).sort()
}

function cargoByDestination(scenario: FleetScenario): Array<[string, unknown]> {
  return scenario.routes
    .flatMap((route) => route.stops.map((stop) => [stop.storeId, stop.cargo] as [string, unknown]))
    .sort(([left], [right]) => left.localeCompare(right))
}

function truckSignature(scenario: FleetScenario) {
  return scenario.trucks
    .map((truck) => ({
      id: truck.id,
      capacity: truck.capacity,
      fuelConsumptionLPer100Km: truck.fuelConsumptionLPer100Km,
    }))
    .sort((left, right) => left.id.localeCompare(right.id))
}

function assignmentOrder(scenario: FleetScenario) {
  return [...scenario.routes]
    .sort((left, right) => left.truckId.localeCompare(right.truckId))
    .map((route) => ({
      truckId: route.truckId,
      stores: route.stops.map((stop) => stop.storeId),
    }))
}

function routeFeatureSignature(routes: RouteGeometryCollection) {
  return [...routes.features]
    .sort((left, right) => String(left.id).localeCompare(String(right.id)))
    .map((feature) => ({
      id: feature.id,
      truckId: feature.properties.truckId,
      waypointDistancesKm: feature.properties.waypointDistancesKm,
      coordinates: feature.geometry.coordinates,
    }))
}

export function packageLoadSpreadForScenario(scenario: FleetScenario): number | null {
  if (scenario.routes.length === 0) return null
  const loads: number[] = []
  for (const route of scenario.routes) {
    let total = 0
    for (const stop of route.stops) {
      if (stop.cargo.kind !== 'PARCELS') return null
      total += stop.cargo.packageCount
    }
    loads.push(total)
  }
  return Math.max(...loads) - Math.min(...loads)
}

function actionFor(bundle: OperationalBundle): WhatIfAction {
  const whatIf = bundle.run.provenance.whatIf
  if (!whatIf || whatIf.actionSet.actions.length !== 1) {
    throw new Error(`WHAT_IF run ${bundle.run.id} must contain exactly one action`)
  }
  if (whatIf.baseRunId !== whatIf.actionSet.baseRunId) {
    throw new Error(`WHAT_IF run ${bundle.run.id} lineage Base mismatch`)
  }
  return whatIf.actionSet.actions[0]
}

function requireSharedInvariants(base: OperationalBundle, alternative: OperationalBundle) {
  const baseRun = base.run
  const run = alternative.run

  if (run.mode !== 'WHAT_IF') throw new Error(`Alternative ${run.id} mode must be WHAT_IF`)
  if (run.targetDate !== baseRun.targetDate) throw new Error(`Alternative ${run.id} targetDate must match Base`)
  if (run.dataAsOf !== baseRun.dataAsOf) throw new Error(`Alternative ${run.id} dataAsOf must match Base`)
  if (run.scenarioId !== baseRun.scenarioId) throw new Error(`Alternative ${run.id} scenarioId must match Base`)
  if (run.modelVersion !== baseRun.modelVersion) throw new Error(`Alternative ${run.id} modelVersion must match Base`)

  const whatIf = run.provenance.whatIf
  if (!whatIf || whatIf.baseRunId !== baseRun.id || whatIf.actionSet.baseRunId !== baseRun.id) {
    throw new Error(`Alternative ${run.id} lineage must reference active Base ${baseRun.id}`)
  }

  if (!deepEqual(sortedDestinationIds(run.scenario), sortedDestinationIds(baseRun.scenario))) {
    throw new Error(`Alternative ${run.id} destination set must match Base`)
  }
  if (!deepEqual(cargoByDestination(run.scenario), cargoByDestination(baseRun.scenario))) {
    throw new Error(`Alternative ${run.id} cargo-by-destination must match Base`)
  }
  if (!deepEqual(truckSignature(run.scenario), truckSignature(baseRun.scenario))) {
    throw new Error(`Alternative ${run.id} fleet/capacity/fuel signature must match Base`)
  }
  if (!deepEqual(run.scenario.depot, baseRun.scenario.depot)) {
    throw new Error(`Alternative ${run.id} depot must match Base`)
  }
  if (!deepEqual(run.provenance.operationalProfile, baseRun.provenance.operationalProfile)) {
    throw new Error(`Alternative ${run.id} operationalProfile must match Base`)
  }
  if (!deepEqual(run.provenance.spatialDemand, baseRun.provenance.spatialDemand)) {
    throw new Error(`Alternative ${run.id} spatialDemand must match Base`)
  }
}

function requireEarlyInvariants(
  base: OperationalBundle,
  alternative: OperationalBundle,
  action: Extract<WhatIfAction, { type: 'SHIFT_DEPARTURE' }>,
) {
  if (!deepEqual(assignmentOrder(alternative.run.scenario), assignmentOrder(base.run.scenario))) {
    throw new Error('Early Start assignment/order must match Base')
  }
  if (!deepEqual(routeFeatureSignature(alternative.routes), routeFeatureSignature(base.routes))) {
    throw new Error('Early Start route coordinates/distances must match Base')
  }

  const alternativeByTruck = new Map(
    alternative.run.scenario.routes.map((route) => [route.truckId, route]),
  )
  for (const baseRoute of base.run.scenario.routes) {
    const derived = alternativeByTruck.get(baseRoute.truckId)
    if (!derived || derived.stops.length !== baseRoute.stops.length) {
      throw new Error('Early Start route topology must match Base')
    }
    if (derived.departureMinute !== baseRoute.departureMinute + action.minutes
      || derived.returnMinute !== baseRoute.returnMinute + action.minutes) {
      throw new Error('Early Start schedule shift is invalid')
    }
    for (let index = 0; index < baseRoute.stops.length; index += 1) {
      const baseStop = baseRoute.stops[index]
      const derivedStop = derived.stops[index]
      if (derivedStop.plannedArrivalMinute !== baseStop.plannedArrivalMinute + action.minutes
        || derivedStop.plannedDepartureMinute !== baseStop.plannedDepartureMinute + action.minutes) {
        throw new Error('Early Start stop schedule shift is invalid')
      }
    }
  }
}

function requireBalancedInvariants(base: OperationalBundle, alternative: OperationalBundle) {
  const scenario = alternative.run.scenario
  if (scenario.routes.length !== 8) throw new Error('Balanced Load requires exactly 8 routes')
  const truckById = new Map(scenario.trucks.map((truck) => [truck.id, truck]))
  const assigned: string[] = []

  for (const route of scenario.routes) {
    if (route.stops.length === 0) throw new Error(`Balanced Load route ${route.id} must not be empty`)
    const truck = truckById.get(route.truckId)
    if (!truck || truck.capacity.kind !== 'PARCELS') {
      throw new Error(`Balanced Load route ${route.id} must reference a parcel truck`)
    }
    let volumeCm3 = 0
    for (const stop of route.stops) {
      if (stop.cargo.kind !== 'PARCELS') {
        throw new Error(`Balanced Load stop ${stop.storeId} must use PARCELS cargo`)
      }
      assigned.push(stop.storeId)
      volumeCm3 += stop.cargo.volumeCm3
    }
    if (volumeCm3 > truck.capacity.capacityCm3) {
      throw new Error(`Balanced Load route ${route.id} exceeds parcel volume capacity`)
    }
  }

  const expected = sortedDestinationIds(base.run.scenario)
  if (assigned.length !== new Set(assigned).size
    || !deepEqual([...assigned].sort(), expected)) {
    throw new Error('Balanced Load must assign every destination exactly once')
  }

  const baseSpread = packageLoadSpreadForScenario(base.run.scenario)
  const balancedSpread = packageLoadSpreadForScenario(scenario)
  if (baseSpread === null || balancedSpread === null || balancedSpread >= baseSpread) {
    throw new Error('Balanced Load package spread must be lower than Base')
  }
}

export function requireValidScenarioComparisonSet(
  set: ScenarioComparisonSet,
): ScenarioComparisonSet {
  if (set.definition.baseRunId !== set.base.run.id) {
    throw new Error('WHAT_IF comparison definition Base does not match active Base')
  }
  if (set.alternatives.length !== 2) {
    throw new Error('WHAT_IF comparison requires exactly two alternatives')
  }

  const classified = set.alternatives.map((alternative) => {
    requireSharedInvariants(set.base, alternative.bundle)
    return { alternative, action: actionFor(alternative.bundle) }
  })

  const early = classified.filter((item) => item.action.type === 'SHIFT_DEPARTURE')
  const balanced = classified.filter((item) =>
    item.action.type === 'REBALANCE_STOPS'
      && item.action.strategy === 'BALANCE_PACKAGES',
  )

  if (early.length !== 1 || balanced.length !== 1) {
    throw new Error('WHAT_IF comparison requires exactly one Early action and one Balanced action')
  }

  requireEarlyInvariants(
    set.base,
    early[0].alternative.bundle,
    early[0].action as Extract<WhatIfAction, { type: 'SHIFT_DEPARTURE' }>,
  )
  requireBalancedInvariants(set.base, balanced[0].alternative.bundle)

  return set
}
