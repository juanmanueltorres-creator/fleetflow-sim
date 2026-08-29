import { describe, expect, it } from 'vitest'
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

const geometries = makeGeometries()

describe('simulation clock', () => {
  it('formats minutes relative to a 06:00 start', () => {
    expect(formatSimulationTime(0)).toBe('06:00')
    expect(formatSimulationTime(65)).toBe('07:05')
  })
})

describe('fleet simulation engine', () => {
  it('keeps every truck at the depot before departure', () => {
    expect(
      getFleetSnapshot(cocaCoquiScenario, geometries, -1).trucks.every(
        (truck) => truck.status === 'AT_DEPOT',
      ),
    ).toBe(true)
  })

  it('finishes every truck at the depot after the scenario ends', () => {
    const snapshot = getFleetSnapshot(cocaCoquiScenario, geometries, 300)
    expect(snapshot.trucks.every((truck) => truck.status === 'DONE')).toBe(true)
    expect(snapshot.trucks.every((truck) => truck.position === cocaCoquiScenario.depot.position)).toBe(false)
    expect(snapshot.trucks.every((truck) => truck.position[0] === cocaCoquiScenario.depot.position[0] && truck.position[1] === cocaCoquiScenario.depot.position[1])).toBe(true)
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
