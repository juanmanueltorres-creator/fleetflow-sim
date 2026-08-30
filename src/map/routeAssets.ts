import type { Feature, FeatureCollection, LineString } from 'geojson'
import type { FleetScenario } from '../domain/types'

export interface RouteGeometryProperties {
  truckId: string
  waypointDistancesKm: number[]
}

export type RouteGeometryFeature = Feature<LineString, RouteGeometryProperties>
export type RouteGeometryCollection = FeatureCollection<LineString, RouteGeometryProperties>
export type RouteGeometryIndex = Record<string, RouteGeometryFeature>

export function routeDistanceKm(feature: RouteGeometryFeature): number {
  const distances = feature.properties.waypointDistancesKm
  const distance = distances[distances.length - 1]
  if (distance === undefined || distance <= 0) {
    throw new Error(`Route ${String(feature.id)} has no positive distance`)
  }
  return distance
}

export function routeCollectionToIndex(
  collection: RouteGeometryCollection,
  scenario: FleetScenario,
): RouteGeometryIndex {
  const expected = new Map(scenario.routes.map((route) => [route.geometryId, route]))

  if (expected.size !== scenario.routes.length) {
    throw new Error('Active scenario contains duplicate route geometry ids')
  }

  if (collection.type !== 'FeatureCollection' || collection.features.length !== expected.size) {
    throw new Error('Route geometry ids must match the active scenario')
  }

  const seen = new Set<string>()
  const entries = collection.features.map((feature) => {
    if (feature.geometry.type !== 'LineString' || typeof feature.id !== 'string') {
      throw new Error('Every route geometry requires a string id and LineString')
    }

    const route = expected.get(feature.id)
    if (!route || seen.has(feature.id)) {
      throw new Error(`Unexpected or duplicate route geometry ${feature.id}`)
    }
    seen.add(feature.id)

    if (feature.properties.truckId !== route.truckId) {
      throw new Error(`Route ${route.id} truck id mismatch`)
    }

    const distances = feature.properties.waypointDistancesKm
    if (distances.length !== route.stops.length + 2) {
      throw new Error(`Route ${route.id} waypoint count must equal stops + 2`)
    }
    if (distances[0] !== 0) {
      throw new Error(`Route ${route.id} must start at distance 0`)
    }
    if (distances.some((value, index) => index > 0 && value < distances[index - 1])) {
      throw new Error(`Route ${route.id} waypoint distances must be non-decreasing`)
    }
    routeDistanceKm(feature)

    return [feature.id, feature] as const
  })

  return Object.fromEntries(entries)
}
