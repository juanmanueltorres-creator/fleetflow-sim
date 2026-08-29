import type { Feature, LineString } from 'geojson'

export interface RouteGeometryProperties {
  truckId: string
  waypointDistancesKm: [number, number, number, number, number]
}

export type RouteGeometryFeature = Feature<LineString, RouteGeometryProperties>
export type RouteGeometryIndex = Record<string, RouteGeometryFeature>
