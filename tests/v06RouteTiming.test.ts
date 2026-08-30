import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  hashSeed,
  minimumTravelMinutes,
  mulberry32,
  sampleDistribution,
  scaledTravelMinutes,
} from '../scripts/lib/calibrated-scenario-generator.mjs'
import { scheduleScenarioFromRoutes } from '../scripts/lib/v0-6-route-timing.mjs'

const profile = JSON.parse(readFileSync('src/scenario/calibration/amazon-last-mile-v1.json', 'utf8'))
const TARGET_DATE = '2026-08-31'
const DEPOT_ID = 'depot-cordoba-calibrated'

function fixtureScenario() {
  const stores = Array.from({ length: 8 }, (_, index) => {
    const number = String(index + 1).padStart(2, '0')
    return {
      id: `delivery-${number}`,
      name: `Entrega ${number}`,
      position: [-64.18 + index * 0.001, -31.42] as [number, number],
      serviceMinutes: 2 + (index % 3),
    }
  })
  const trucks = Array.from({ length: 8 }, (_, index) => {
    const number = String(index + 1).padStart(2, '0')
    return {
      id: `vehicle-${number}`,
      label: `Vehículo ${number}`,
      capacity: { kind: 'PARCELS', capacityCm3: 1_000_000 },
      fuelConsumptionLPer100Km: 18,
    }
  })
  const routes = trucks.map((truck, index) => {
    const number = String(index + 1).padStart(2, '0')
    return {
      id: `route-cordoba-2026-08-31-v3-${number}`,
      truckId: truck.id,
      departureMinute: 0,
      returnMinute: 0,
      stops: [{
        storeId: stores[index].id,
        plannedArrivalMinute: 0,
        plannedDepartureMinute: 0,
        cargo: { kind: 'PARCELS', packageCount: 10 + index, volumeCm3: 100_000 + index * 1_000 },
      }],
      geometryId: `route-cordoba-2026-08-31-v3-${number}`,
    }
  })

  return {
    id: 'cordoba-calibrated-v1',
    label: 'Córdoba Last-Mile Calibrado',
    simulationStartLabel: '06:00',
    depot: {
      id: DEPOT_ID,
      name: 'Centro de distribución Córdoba',
      position: [-64.1888, -31.4201] as [number, number],
    },
    stores,
    trucks,
    routes,
  }
}

function fixtureRouteCollection(scenario = fixtureScenario()) {
  return {
    type: 'FeatureCollection',
    metadata: {
      runId: 'cordoba-2026-08-31-v3',
      targetDate: TARGET_DATE,
      modelVersion: 'fleetflow-v0.6',
    },
    features: scenario.routes.map((route, index) => ({
      type: 'Feature',
      id: route.geometryId,
      properties: {
        truckId: route.truckId,
        distanceKm: 20 + index * 2,
        waypointDistancesKm: [0, 10 + index, 20 + index * 2],
      },
      geometry: {
        type: 'LineString',
        coordinates: [scenario.depot.position, scenario.stores[index].position, scenario.depot.position],
      },
    })),
  }
}

function expectedLegMinutes({ truckId, fromId, toId, distanceKm, multiplier = 1 }: {
  truckId: string
  fromId: string
  toId: string
  distanceKm: number
  multiplier?: number
}) {
  const random = mulberry32(hashSeed(
    `fleetflow:v0.6:cordoba:${TARGET_DATE}:operations:travel:${truckId}:${fromId}:${toId}`,
  ))
  const sampled = sampleDistribution(profile.distributions.travelSecondsBetweenStops, random)
  return Math.max(
    scaledTravelMinutes(sampled, multiplier),
    minimumTravelMinutes(distanceKm),
  )
}

describe('V0.6 route timing contract', () => {
  it('produces deterministic sorted departure offsets normalized from 0 through 18 minutes', () => {
    const scenario = fixtureScenario()
    const routeCollection = fixtureRouteCollection(scenario)

    const scheduled = scheduleScenarioFromRoutes({
      scenario,
      routeCollection,
      profile,
      targetDate: TARGET_DATE,
      travelTimeMultiplier: 1,
    })
    const repeated = scheduleScenarioFromRoutes({
      scenario,
      routeCollection,
      profile,
      targetDate: TARGET_DATE,
      travelTimeMultiplier: 1,
    })

    const departures = scheduled.routes.map((route: { departureMinute: number }) => route.departureMinute)
    expect(departures).toEqual([...departures].sort((a, b) => a - b))
    expect(departures[0]).toBe(0)
    expect(departures.at(-1)).toBe(18)
    expect(departures.every((minute) => Number.isInteger(minute) && minute >= 0 && minute <= 18)).toBe(true)
    expect(repeated).toEqual(scheduled)
  })

  it('uses stable per-leg travel seeds, the road-distance floor, service time, and a timed return leg', () => {
    const scenario = fixtureScenario()
    const routeCollection = fixtureRouteCollection(scenario)
    const multiplier = 1.07
    const scheduled = scheduleScenarioFromRoutes({
      scenario,
      routeCollection,
      profile,
      targetDate: TARGET_DATE,
      travelTimeMultiplier: multiplier,
    })

    const route = scheduled.routes[0]
    const stop = route.stops[0]
    const store = scheduled.stores.find((item: { id: string }) => item.id === stop.storeId)
    const outboundMinutes = expectedLegMinutes({
      truckId: route.truckId,
      fromId: DEPOT_ID,
      toId: stop.storeId,
      distanceKm: 10,
      multiplier,
    })
    const returnMinutes = expectedLegMinutes({
      truckId: route.truckId,
      fromId: stop.storeId,
      toId: DEPOT_ID,
      distanceKm: 10,
      multiplier,
    })

    expect(stop.plannedArrivalMinute).toBe(route.departureMinute + outboundMinutes)
    expect(stop.plannedDepartureMinute).toBe(stop.plannedArrivalMinute + store.serviceMinutes)
    expect(route.returnMinute).toBe(stop.plannedDepartureMinute + returnMinutes)
    expect(route.returnMinute).toBeGreaterThan(stop.plannedDepartureMinute)
  })

  it('fails closed on route/truck mismatch or invalid waypoint count', () => {
    const scenario = fixtureScenario()
    const mismatched = fixtureRouteCollection(scenario)
    mismatched.features[0].properties.truckId = 'vehicle-99'

    expect(() => scheduleScenarioFromRoutes({
      scenario,
      routeCollection: mismatched,
      profile,
      targetDate: TARGET_DATE,
      travelTimeMultiplier: 1,
    })).toThrow(/truck|mismatch/i)

    const wrongWaypoints = fixtureRouteCollection(scenario)
    wrongWaypoints.features[0].properties.waypointDistancesKm = [0, 20]
    expect(() => scheduleScenarioFromRoutes({
      scenario,
      routeCollection: wrongWaypoints,
      profile,
      targetDate: TARGET_DATE,
      travelTimeMultiplier: 1,
    })).toThrow(/waypoint|stops/i)
  })

  it('modifies only schedule fields and preserves the logical operation structure', () => {
    const scenario = fixtureScenario()
    const original = structuredClone(scenario)
    const routeCollection = fixtureRouteCollection(scenario)
    const scheduled = scheduleScenarioFromRoutes({
      scenario,
      routeCollection,
      profile,
      targetDate: TARGET_DATE,
      travelTimeMultiplier: 1,
    })

    expect(scenario).toEqual(original)
    expect(scheduled.depot).toEqual(original.depot)
    expect(scheduled.stores).toEqual(original.stores)
    expect(scheduled.trucks).toEqual(original.trucks)
    expect(scheduled.routes.map((route: { id: string }) => route.id)).toEqual(original.routes.map((route) => route.id))
    expect(scheduled.routes.map((route: { geometryId: string }) => route.geometryId)).toEqual(original.routes.map((route) => route.geometryId))
    expect(scheduled.routes.map((route: { truckId: string }) => route.truckId)).toEqual(original.routes.map((route) => route.truckId))
    expect(scheduled.routes.map((route: { stops: unknown[] }) => route.stops.map((stop: any) => ({
      storeId: stop.storeId,
      cargo: stop.cargo,
    })))).toEqual(original.routes.map((route) => route.stops.map((stop) => ({
      storeId: stop.storeId,
      cargo: stop.cargo,
    }))))
  })
})
