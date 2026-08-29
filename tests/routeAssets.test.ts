import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { FeatureCollection, LineString } from 'geojson'
import type { FleetScenario } from '../src/domain/types'
import * as routeAssets from '../src/map/routeAssets'
import type {
  RouteGeometryCollection,
  RouteGeometryFeature,
  RouteGeometryProperties,
} from '../src/map/routeAssets'

const assetPath = resolve(process.cwd(), 'public/data/coca-coqui-routes.geojson')
const asset = JSON.parse(
  readFileSync(assetPath, 'utf8'),
) as FeatureCollection<LineString, RouteGeometryProperties>

const calibratedAssetPath = resolve(process.cwd(), 'public/data/cordoba-calibrated-routes.geojson')
const calibratedScenarioPath = resolve(process.cwd(), 'src/scenario/generated/cordoba-calibrated-v1.json')

const variableScenario: FleetScenario = {
  id: 'geometry-test',
  label: 'Geometry test',
  simulationStartLabel: '06:00',
  depot: { id: 'depot', name: 'Depot', position: [-64.18, -31.42] },
  stores: [
    { id: 'store-a', name: 'A', position: [-64.17, -31.41], serviceMinutes: 2 },
    { id: 'store-b', name: 'B', position: [-64.16, -31.40], serviceMinutes: 2 },
  ],
  trucks: [
    {
      id: 'truck-a',
      label: 'Truck A',
      capacity: { kind: 'MASS', capacityKg: 500 },
      fuelConsumptionLPer100Km: 18,
    },
  ],
  routes: [
    {
      id: 'route-a',
      truckId: 'truck-a',
      geometryId: 'route-test',
      departureMinute: 0,
      returnMinute: 20,
      stops: [
        {
          storeId: 'store-a',
          plannedArrivalMinute: 5,
          plannedDepartureMinute: 7,
          cargo: { kind: 'MASS', quantityKg: 100 },
        },
        {
          storeId: 'store-b',
          plannedArrivalMinute: 12,
          plannedDepartureMinute: 14,
          cargo: { kind: 'MASS', quantityKg: 100 },
        },
      ],
    },
  ],
}

function makeVariableCollection(distances: number[] = [0, 1.2, 2.4, 3.1]): RouteGeometryCollection {
  return {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        id: 'route-test',
        properties: {
          truckId: 'truck-a',
          waypointDistancesKm: distances,
        },
        geometry: {
          type: 'LineString',
          coordinates: [
            [-64.18, -31.42],
            [-64.17, -31.41],
            [-64.16, -31.40],
            [-64.18, -31.42],
          ],
        },
      },
    ],
  }
}

describe('static Coca Coqui route asset', () => {
  it('contains five valid road-following route features', () => {
    expect(asset.type).toBe('FeatureCollection')
    expect(asset.features).toHaveLength(5)

    asset.features.forEach((feature, index) => {
      expect(feature.id).toBe(`route-truck-0${index + 1}`)
      expect(feature.geometry.type).toBe('LineString')
      expect(feature.geometry.coordinates.length).toBeGreaterThan(2)
      expect(feature.properties.truckId).toBe(`truck-0${index + 1}`)
      expect(feature.properties.waypointDistancesKm).toHaveLength(5)
      expect(feature.properties.waypointDistancesKm[0]).toBe(0)
      expect(feature.properties.waypointDistancesKm[4]).toBeGreaterThan(0)

      for (let i = 1; i < feature.properties.waypointDistancesKm.length; i += 1) {
        expect(feature.properties.waypointDistancesKm[i]).toBeGreaterThan(
          feature.properties.waypointDistancesKm[i - 1],
        )
      }
    })
  })
})

describe('static calibrated Cordoba route asset', () => {
  it('contains one road route per calibrated vehicle with stops plus two waypoints', () => {
    expect(existsSync(calibratedAssetPath)).toBe(true)
    expect(existsSync(calibratedScenarioPath)).toBe(true)
    if (!existsSync(calibratedAssetPath) || !existsSync(calibratedScenarioPath)) return

    const scenario = JSON.parse(readFileSync(calibratedScenarioPath, 'utf8')) as FleetScenario
    const collection = JSON.parse(readFileSync(calibratedAssetPath, 'utf8')) as RouteGeometryCollection
    const index = routeAssets.routeCollectionToIndex(collection, scenario)

    expect(Object.keys(index)).toHaveLength(8)
    for (const route of scenario.routes) {
      expect(index[route.geometryId].properties.truckId).toBe(route.truckId)
      expect(index[route.geometryId].properties.waypointDistancesKm).toHaveLength(route.stops.length + 2)
    }
  })
})

describe('scenario-driven route geometry', () => {
  it('accepts a route collection whose size and waypoint count match the active scenario', () => {
    expect(() => routeAssets.routeCollectionToIndex(makeVariableCollection(), variableScenario)).not.toThrow()
    const index = routeAssets.routeCollectionToIndex(makeVariableCollection(), variableScenario)
    expect(Object.keys(index)).toEqual(['route-test'])
  })

  it('exposes the final waypoint as the authoritative route distance', () => {
    const distanceReader = Reflect.get(routeAssets, 'routeDistanceKm') as
      | undefined
      | ((feature: RouteGeometryFeature) => number)

    expect(distanceReader).toBeTypeOf('function')
    if (!distanceReader) return

    const feature = makeVariableCollection().features[0]
    expect(distanceReader(feature)).toBeCloseTo(3.1)
  })

  it('fails closed when waypoint cardinality does not equal stops plus two', () => {
    expect(() => routeAssets.routeCollectionToIndex(makeVariableCollection([0, 1.2, 3.1]), variableScenario))
      .toThrow(/stops \+ 2/i)
  })

  it('rejects duplicate geometry ids in the active scenario', () => {
    const scenario = structuredClone(variableScenario)
    scenario.trucks.push({
      id: 'truck-b',
      label: 'Truck B',
      capacity: { kind: 'MASS', capacityKg: 500 },
      fuelConsumptionLPer100Km: 18,
    })
    scenario.routes.push({
      ...structuredClone(scenario.routes[0]),
      id: 'route-b',
      truckId: 'truck-b',
      geometryId: 'route-test',
    })

    const collection = makeVariableCollection()
    collection.features[0].properties.truckId = 'truck-b'

    expect(() => routeAssets.routeCollectionToIndex(collection, scenario))
      .toThrow(/duplicate.*geometry|geometry.*duplicate/i)
  })

  it('accepts zero-distance legs between colocated stops', () => {
    expect(() => routeAssets.routeCollectionToIndex(
      makeVariableCollection([0, 1.2, 1.2, 3.1]),
      variableScenario,
    )).not.toThrow()
  })

  it('fails closed when waypoint distances decrease', () => {
    expect(() => routeAssets.routeCollectionToIndex(
      makeVariableCollection([0, 1.2, 1.1, 3.1]),
      variableScenario,
    )).toThrow(/non-decreasing/i)
  })

  it('fails closed when final route distance is not positive', () => {
    expect(() => routeAssets.routeCollectionToIndex(
      makeVariableCollection([0, 0, 0, 0]),
      variableScenario,
    )).toThrow(/positive distance/i)
  })
})
