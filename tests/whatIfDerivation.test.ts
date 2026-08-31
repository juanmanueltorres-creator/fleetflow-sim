import { describe, expect, it } from 'vitest'
import baseRunJson from '../public/data/operational-runs/generated/cordoba-2026-08-27-v3.json'
import baseRoutesJson from '../public/data/operational-runs/generated/cordoba-2026-08-27-v3.routes.geojson'
import calibrationProfile from '../src/scenario/calibration/amazon-last-mile-v1.json'
import {
  assertDerivedWhatIfArtifact,
  deriveBalancedLoad,
  deriveEarlyStart,
  packageLoadSpread,
  previewBalancedAssignment,
} from '../scripts/lib/what-if-derivation.mjs'

const ISSUED_AT = '2026-08-30T21:05:00-03:00'

function baseRun() {
  return structuredClone(baseRunJson)
}

function baseRoutes() {
  return structuredClone(baseRoutesJson)
}

function earlyActionSet(baseRunId = baseRunJson.id) {
  return {
    schemaVersion: 1,
    id: `${baseRunId}-early-start-v1`,
    label: 'Early start',
    baseRunId,
    actions: [{ type: 'SHIFT_DEPARTURE', minutes: -60 }],
  }
}

function balancedActionSet(baseRunId = baseRunJson.id) {
  return {
    schemaVersion: 1,
    id: `${baseRunId}-balanced-load-v1`,
    label: 'Balanced load',
    baseRunId,
    actions: [{ type: 'REBALANCE_STOPS', strategy: 'BALANCE_PACKAGES' }],
  }
}

function packageTotal(run: any): number {
  return run.scenario.routes.reduce(
    (total: number, route: any) => total + route.stops.reduce(
      (routeTotal: number, stop: any) => routeTotal + stop.cargo.packageCount,
      0,
    ),
    0,
  )
}

function assignmentSignature(run: any) {
  return [...run.scenario.routes]
    .sort((a, b) => a.truckId.localeCompare(b.truckId))
    .map((route) => ({
      truckId: route.truckId,
      stores: route.stops.map((stop: any) => stop.storeId),
    }))
}

function cargoByDestination(run: any) {
  return Object.fromEntries(
    run.scenario.routes.flatMap((route: any) => route.stops.map((stop: any) => [
      stop.storeId,
      structuredClone(stop.cargo),
    ])),
  )
}

function storeIds(run: any): string[] {
  return run.scenario.stores.map((store: any) => store.id).sort()
}

async function fakeRoutePreparer({ scenario, metadata }: any) {
  return {
    type: 'FeatureCollection',
    metadata,
    features: scenario.routes.map((route: any) => ({
      type: 'Feature',
      id: route.geometryId,
      properties: {
        truckId: route.truckId,
        waypointDistancesKm: Array.from(
          { length: route.stops.length + 2 },
          (_, index) => index,
        ),
      },
      geometry: {
        type: 'LineString',
        coordinates: [scenario.depot.position, scenario.depot.position],
      },
    })),
  }
}

describe('deterministic WHAT_IF derivation', () => {
  it('derives Early Start as an exact schedule-only -60 minute shift', () => {
    const base = baseRun()
    const routes = baseRoutes()
    const actionSet = earlyActionSet(base.id)

    const first = deriveEarlyStart({
      baseRun: base,
      baseRoutes: routes,
      actionSet,
      issuedAt: ISSUED_AT,
    })
    const second = deriveEarlyStart({
      baseRun: baseRun(),
      baseRoutes: baseRoutes(),
      actionSet: earlyActionSet(base.id),
      issuedAt: ISSUED_AT,
    })

    expect(first).toEqual(second)
    expect(first.run.id).toBe(`${base.id}-what-if-early-start-v1`)
    expect(first.run.mode).toBe('WHAT_IF')
    expect(first.run.targetDate).toBe(base.targetDate)
    expect(first.run.dataAsOf).toBe(base.dataAsOf)
    expect(first.run.modelVersion).toBe(base.modelVersion)
    expect(first.run.scenario.stores).toEqual(base.scenario.stores)
    expect(first.run.scenario.trucks).toEqual(base.scenario.trucks)
    expect(assignmentSignature(first.run)).toEqual(assignmentSignature(base))
    expect(cargoByDestination(first.run)).toEqual(cargoByDestination(base))
    expect(packageTotal(first.run)).toBe(packageTotal(base))

    base.scenario.routes.forEach((baseRoute: any) => {
      const derivedRoute = first.run.scenario.routes.find(
        (route: any) => route.truckId === baseRoute.truckId,
      )
      expect(derivedRoute.departureMinute).toBe(baseRoute.departureMinute - 60)
      expect(derivedRoute.returnMinute).toBe(baseRoute.returnMinute - 60)
      derivedRoute.stops.forEach((stop: any, index: number) => {
        expect(stop.plannedArrivalMinute).toBe(
          baseRoute.stops[index].plannedArrivalMinute - 60,
        )
        expect(stop.plannedDepartureMinute).toBe(
          baseRoute.stops[index].plannedDepartureMinute - 60,
        )
      })
    })

    expect(first.routeCollection.features).toEqual(routes.features)
    expect(first.routeCollection.metadata).toEqual({
      runId: first.run.id,
      targetDate: base.targetDate,
      modelVersion: base.modelVersion,
    })
    expect(first.run.provenance.seed).toBe(
      `fleetflow:what-if:v0:base=${base.id}:action=${actionSet.id}`,
    )
    expect(first.run.provenance.operationalProfile).toEqual(base.provenance.operationalProfile)
    expect(first.run.provenance.spatialDemand).toEqual(base.provenance.spatialDemand)

    expect(() => assertDerivedWhatIfArtifact({
      baseRun: base,
      baseRoutes: routes,
      derivedRun: first.run,
      derivedRoutes: first.routeCollection,
      actionSet,
    })).not.toThrow()
  })

  it('derives Balanced Load deterministically while conserving demand and capacity', async () => {
    const base = baseRun()
    const actionSet = balancedActionSet(base.id)

    const first = await deriveBalancedLoad({
      baseRun: base,
      actionSet,
      issuedAt: ISSUED_AT,
      profile: calibrationProfile,
      routePreparer: fakeRoutePreparer,
    })
    const second = await deriveBalancedLoad({
      baseRun: baseRun(),
      actionSet: balancedActionSet(base.id),
      issuedAt: ISSUED_AT,
      profile: calibrationProfile,
      routePreparer: fakeRoutePreparer,
    })

    expect(first).toEqual(second)
    expect(first.run.id).toBe(`${base.id}-what-if-balanced-load-v1`)
    expect(first.run.mode).toBe('WHAT_IF')
    expect(storeIds(first.run)).toEqual(storeIds(base))
    expect(cargoByDestination(first.run)).toEqual(cargoByDestination(base))
    expect(packageTotal(first.run)).toBe(packageTotal(base))
    expect(first.run.scenario.trucks).toEqual(base.scenario.trucks)
    expect(first.run.scenario.depot).toEqual(base.scenario.depot)
    expect(first.run.scenario.routes).toHaveLength(8)
    expect(first.run.scenario.routes.every((route: any) => route.stops.length > 0)).toBe(true)

    const assigned = first.run.scenario.routes.flatMap(
      (route: any) => route.stops.map((stop: any) => stop.storeId),
    )
    expect(assigned.sort()).toEqual(storeIds(base))
    expect(new Set(assigned).size).toBe(assigned.length)

    const truckById = new Map(first.run.scenario.trucks.map((truck: any) => [truck.id, truck]))
    first.run.scenario.routes.forEach((route: any) => {
      const truck: any = truckById.get(route.truckId)
      const volume = route.stops.reduce(
        (total: number, stop: any) => total + stop.cargo.volumeCm3,
        0,
      )
      expect(volume).toBeLessThanOrEqual(truck.capacity.capacityCm3)
      expect(route.returnMinute).toBeGreaterThan(
        route.stops.at(-1).plannedDepartureMinute,
      )
    })

    expect(packageLoadSpread(first.run.scenario)).toBeLessThan(
      packageLoadSpread(base.scenario),
    )
    expect(first.run.provenance.operationalProfile).toEqual(base.provenance.operationalProfile)
    expect(first.run.provenance.spatialDemand).toEqual(base.provenance.spatialDemand)

    expect(() => assertDerivedWhatIfArtifact({
      baseRun: base,
      baseRoutes: baseRoutes(),
      derivedRun: first.run,
      derivedRoutes: first.routeCollection,
      actionSet,
    })).not.toThrow()
  })

  it('fails closed when a complete stop cannot fit any parcel truck', () => {
    const infeasible = baseRun()
    const maximumCapacity = Math.max(
      ...infeasible.scenario.trucks.map((truck: any) => truck.capacity.capacityCm3),
    )
    infeasible.scenario.routes[0].stops[0].cargo.volumeCm3 = maximumCapacity + 1

    expect(() => previewBalancedAssignment(infeasible)).toThrow(/cannot fit delivery/i)
  })

  it('offline assertion rejects an Early artifact with an incorrect shift', () => {
    const base = baseRun()
    const routes = baseRoutes()
    const actionSet = earlyActionSet(base.id)
    const derived = deriveEarlyStart({
      baseRun: base,
      baseRoutes: routes,
      actionSet,
      issuedAt: ISSUED_AT,
    })
    derived.run.scenario.routes[0].departureMinute += 1

    expect(() => assertDerivedWhatIfArtifact({
      baseRun: base,
      baseRoutes: routes,
      derivedRun: derived.run,
      derivedRoutes: derived.routeCollection,
      actionSet,
    })).toThrow(/schedule/i)
  })
})
