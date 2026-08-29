import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { FeatureCollection, LineString } from 'geojson'
import type { RouteGeometryProperties } from '../src/map/routeAssets'

const assetPath = resolve(process.cwd(), 'public/data/coca-coqui-routes.geojson')
const asset = JSON.parse(
  readFileSync(assetPath, 'utf8'),
) as FeatureCollection<LineString, RouteGeometryProperties>

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
