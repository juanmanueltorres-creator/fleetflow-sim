import { describe, expect, it } from 'vitest'
import type { FleetScenario, PlannedStop, RoutePlan, Store } from '../src/domain/types'
import type { RouteGeometryFeature, RouteGeometryIndex } from '../src/map/routeAssets'
import { cocaCoquiScenario } from '../src/scenario/cocaCoquiScenario'
import { formatSimulationTime } from '../src/simulation/clock'
import { getFleetSnapshot } from '../src/simulation/engine'

function makeGeometries(): RouteGeometryIndex {
  const stores = new Map(cocaCoquiScenario.stores.map((store) => [store.id, store]))

  return Object.fromEntries(
    cocaCoquiScenario.routes.map((route) => {
      const stopCoordinates = route.stops.map((stop) => {
        const store = stores.get(stop.storeId)
        if (!store) throw new Error(`Missing fixture store ${stop.storeId}`)
        return store.position
      })

      const feature: RouteGeometryFeature = {
        type: 'Feature',
        id: route.geometryId,
        properties: {
          truckId: route.truckId,
          waypointDistancesKm: [0, 1, 2, 3, 4],
        },
        geometry: {
          type: 'LineString',
          coordinates: [
            cocaCoquiScenario.depot.position,
            ...stopCoordinates,
            cocaCoquiScenario.depot.position,
          ],
        },
      }

      return [route.geometryId, feature]
    }),
  )
}

function makeScenarioWithStops(stopCount: number): {
  scenario: FleetScenario
  geometries: RouteGeometryIndex
  stops: PlannedStop[]
  route: RoutePlan
} {
  const depot: [number, number] = [-64.18, -31.42]
  const stores: Store[] = Array.from({ length: stopCount }, (_, index) => ({
    id: `test-store-${index + 1}`,
    name: `Test Store ${index + 1}`,
    position: [-64.18 + (index + 1) * 0.001, -31.42],
    serviceMinutes: 1,
  }))
  const stops: PlannedStop[] = stores.map((store, index) => {
    const plannedArrivalMinute = 2 + index * 4
    return {
      storeId: store.id,
      plannedArrivalMinute,
      plannedDepartureMinute: plannedArrivalMinute + 1,
      cargo: { kind: 'MASS', quantityKg: 10 },
    }
  })
  const finalDeparture = stops[stops.length - 1]?.plannedDepartureMinute ?? 0
  const route: RoutePlan = {
    id: `test-route-${stopCount}`,
    truckId: 'test-truck',
    geometryId: `test-geometry-${stopCount}`,
    departureMinute: 0,
    returnMinute: finalDeparture + 3,
    stops,
  }
  const scenario: FleetScenario = {
    id: `test-scenario-${stopCount}`,
    label: `${stopCount} stop test`,
    simulationStartLabel: '06:00',
    depot: { id: 'test-depot', name: 'Test Depot', position: depot },
    stores,
    trucks: [
      {
        id: 'test-truck',
        label: 'Test Truck',
        capacity: { kind: 'MASS', capacityKg: 1000 },
        fuelConsumptionLPer100Km: 18,
      },
    ],
    routes: [route],
  }
  const feature: RouteGeometryFeature = {
    type: 'Feature',
    id: route.geometryId,
    properties: {
      truckId: route.truckId,
      waypointDistancesKm: Array.from({ length: stopCount + 2 }, (_, index) => index),
    },
    geometry: {
      type: 'LineString',
      coordinates: [depot, ...stores.map((store) => store.position), depot],
    },
  }

  return {
    scenario,
    stops,
    route,
    geometries: { [route.geometryId]: feature },
  }
}

const geometries = makeGeometries()

describe('simulation clock', () => {
  it('formats minutes relative to a 06:00 start', () => {
    expect(formatSimulationTime(0)).toBe('06:00')
    expect(formatSimulationTime(65)).toBe('07:05')
  })
})

describe('fleet simulation engine', () => {
  it('keeps every truck at the depot before departure', () => {
    const snapshot = getFleetSnapshot(cocaCoquiScenario, geometries, -1)
    expect(snapshot.trucks.every((truck) => truck.status === 'AT_DEPOT')).toBe(true)
  })

  it('finishes every truck at the depot after the scenario ends', () => {
    const snapshot = getFleetSnapshot(cocaCoquiScenario, geometries, 300)
    expect(snapshot.trucks.every((truck) => truck.status === 'DONE')).toBe(true)
    expect(
      snapshot.trucks.every(
        (truck) =>
          truck.position[0] === cocaCoquiScenario.depot.position[0] &&
          truck.position[1] === cocaCoquiScenario.depot.position[1],
      ),
    ).toBe(true)
  })

  it('is deterministic for the same timestamp', () => {
    expect(getFleetSnapshot(cocaCoquiScenario, geometries, 27)).toEqual(
      getFleetSnapshot(cocaCoquiScenario, geometries, 27),
    )
  })

  it('holds truck 01 at Store 01 while unloading', () => {
    const truck = getFleetSnapshot(cocaCoquiScenario, geometries, 9).trucks.find(
      (candidate) => candidate.truckId === 'truck-01',
    )
    const store = cocaCoquiScenario.stores.find((candidate) => candidate.id === 'store-01')

    expect(truck?.status).toBe('UNLOADING')
    expect(truck?.currentStopId).toBe('store-01')
    expect(truck?.position).toEqual(store?.position)
  })

  it('marks truck 01 as returning after its final delivery', () => {
    const truck = getFleetSnapshot(cocaCoquiScenario, geometries, 45).trucks.find(
      (candidate) => candidate.truckId === 'truck-01',
    )

    expect(truck?.status).toBe('RETURNING')
    expect(truck?.nextStopId).toBeNull()
  })
})

describe.each([1, 3, 6, 8, 10])('fleet simulation engine with %i stops', (stopCount) => {
  it('moves through every travel, unload and return leg with the same engine', () => {
    const fixture = makeScenarioWithStops(stopCount)

    const firstTravel = getFleetSnapshot(fixture.scenario, fixture.geometries, 1).trucks[0]
    expect(firstTravel.status).toBe('EN_ROUTE')
    expect(firstTravel.nextStopId).toBe(fixture.stops[0].storeId)

    fixture.stops.forEach((stop, index) => {
      const unloading = getFleetSnapshot(
        fixture.scenario,
        fixture.geometries,
        stop.plannedArrivalMinute,
      ).trucks[0]
      expect(unloading.status).toBe('UNLOADING')
      expect(unloading.currentStopId).toBe(stop.storeId)

      const nextStop = fixture.stops[index + 1]
      if (nextStop) {
        const betweenStops = getFleetSnapshot(
          fixture.scenario,
          fixture.geometries,
          stop.plannedDepartureMinute + 1,
        ).trucks[0]
        expect(betweenStops.status).toBe('EN_ROUTE')
        expect(betweenStops.nextStopId).toBe(nextStop.storeId)
      }
    })

    const lastStop = fixture.stops[fixture.stops.length - 1]
    const returning = getFleetSnapshot(
      fixture.scenario,
      fixture.geometries,
      lastStop.plannedDepartureMinute + 1,
    ).trucks[0]
    expect(returning.status).toBe('RETURNING')
    expect(returning.nextStopId).toBeNull()

    const done = getFleetSnapshot(
      fixture.scenario,
      fixture.geometries,
      fixture.route.returnMinute,
    ).trucks[0]
    expect(done.status).toBe('DONE')
  })
})
