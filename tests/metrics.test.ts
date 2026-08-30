import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { RouteGeometryCollection } from '../src/map/routeAssets'
import { routeCollectionToIndex } from '../src/map/routeAssets'
import { cocaCoquiScenario } from '../src/scenario/cocaCoquiScenario'
import { getFleetSnapshot } from '../src/simulation/engine'
import { deriveFleetMetrics } from '../src/simulation/metrics'

const routeAsset = JSON.parse(
  readFileSync(resolve(process.cwd(), 'public/data/coca-coqui-routes.geojson'), 'utf8'),
) as RouteGeometryCollection
const routeIndex = routeCollectionToIndex(routeAsset, cocaCoquiScenario)

function finalDistanceKm(geometryId: string): number {
  const distances = routeIndex[geometryId].properties.waypointDistancesKm
  return distances.at(-1) ?? 0
}

const expectedPlannedDistanceKm = cocaCoquiScenario.routes.reduce(
  (total, route) => total + finalDistanceKm(route.geometryId),
  0,
)

const trucksById = new Map(cocaCoquiScenario.trucks.map((truck) => [truck.id, truck]))
const expectedFullFuelL = cocaCoquiScenario.routes.reduce((total, route) => {
  const truck = trucksById.get(route.truckId)
  if (!truck) throw new Error(`Missing test truck ${route.truckId}`)
  return total + finalDistanceKm(route.geometryId) * truck.fuelConsumptionLPer100Km / 100
}, 0)

describe('fleet metrics', () => {
  it('reports completed deliveries, active trucks and geometry-backed planned distance', () => {
    const metrics = deriveFleetMetrics(
      cocaCoquiScenario,
      getFleetSnapshot(cocaCoquiScenario, routeIndex, 30),
      routeIndex,
    )

    expect(metrics.completedDeliveries).toBe(7)
    expect(metrics.totalDeliveries).toBe(15)
    expect(metrics.activeTrucks).toBe(5)
    expect(metrics.plannedDistanceKm).toBeCloseTo(expectedPlannedDistanceKm, 9)
  })

  it('reports the full geometry-backed estimated fuel use when the run is complete', () => {
    const metrics = deriveFleetMetrics(
      cocaCoquiScenario,
      getFleetSnapshot(cocaCoquiScenario, routeIndex, 65),
      routeIndex,
    )

    expect(metrics.completedDeliveries).toBe(15)
    expect(metrics.activeTrucks).toBe(0)
    expect(metrics.estimatedFuelUsedL).toBeCloseTo(expectedFullFuelL, 9)
  })
})
