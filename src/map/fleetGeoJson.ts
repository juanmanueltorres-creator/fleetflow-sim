import type { Feature, FeatureCollection, Point } from 'geojson'
import type { FleetSnapshot } from '../domain/types'

export interface FleetPointProperties {
  truckId: string
  bearing: number
  status: string
  currentStopId: string | null
  nextStopId: string | null
  routeProgress: number
}

export function fleetSnapshotToGeoJson(
  snapshot: FleetSnapshot,
): FeatureCollection<Point, FleetPointProperties> {
  const features: Array<Feature<Point, FleetPointProperties>> = snapshot.trucks.map((truck) => ({
    type: 'Feature',
    id: truck.truckId,
    properties: {
      truckId: truck.truckId,
      bearing: truck.bearing,
      status: truck.status,
      currentStopId: truck.currentStopId,
      nextStopId: truck.nextStopId,
      routeProgress: truck.routeProgress,
    },
    geometry: {
      type: 'Point',
      coordinates: truck.position,
    },
  }))

  return {
    type: 'FeatureCollection',
    features,
  }
}
