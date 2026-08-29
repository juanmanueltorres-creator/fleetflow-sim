import type { Feature, FeatureCollection, LineString } from 'geojson'

export interface RouteGeometryProperties {
  truckId: string
  waypointDistancesKm: [number, number, number, number, number]
}

export type RouteGeometryFeature = Feature<LineString, RouteGeometryProperties>
export type RouteGeometryCollection = FeatureCollection<LineString, RouteGeometryProperties>
export type RouteGeometryIndex = Record<string, RouteGeometryFeature>

export function routeCollectionToIndex(collection: RouteGeometryCollection): RouteGeometryIndex {
  if (collection.type !== 'FeatureCollection' || collection.features.length !== 5) {
    throw new Error('Coca Coqui V0 requires exactly five route features')
  }

  return Object.fromEntries(
    collection.features.map((feature) => {
      if (feature.geometry.type !== 'LineString' || typeof feature.id !== 'string') {
        throw new Error('Every route feature requires a string id and LineString geometry')
      }

      if (
        feature.properties.waypointDistancesKm.length !== 5 ||
        feature.properties.waypointDistancesKm[0] !== 0
      ) {
        throw new Error(`Route ${feature.id} has invalid waypoint distances`)
      }

      return [feature.id, feature]
    }),
  )
}
