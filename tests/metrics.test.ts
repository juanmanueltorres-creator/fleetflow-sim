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
const routeIndex = routeCollectionToIndex(routeAsset)

describe('fleet metrics', () => {
  it('reports completed deliveries and active trucks from the current snapshot', () => {
    const metrics = deriveFleetMetrics(
      cocaCoquiScenario,
      getFleetSnapshot(cocaCoquiScenario, routeIndex, 30),
    )

    expect(metrics.completedDeliveries).toBe(7)
    expect(metrics.totalDeliveries).toBe(15)
    expect(metrics.activeTrucks).toBe(5)
    expect(metrics.plannedDistanceKm).toBe(71)
  })

  it('reports the full estimated fuel use when the run is complete', () => {
    const metrics = deriveFleetMetrics(
      cocaCoquiScenario,
      getFleetSnapshot(cocaCoquiScenario, routeIndex, 65),
    )

    expect(metrics.completedDeliveries).toBe(15)
    expect(metrics.activeTrucks).toBe(0)
    expect(metrics.estimatedFuelUsedL).toBeCloseTo(12.78, 2)
  })
})
