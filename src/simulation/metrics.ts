import type { FleetScenario, FleetSnapshot, TruckStatus } from '../domain/types'

export interface FleetMetrics {
  completedDeliveries: number
  totalDeliveries: number
  activeTrucks: number
  plannedDistanceKm: number
  estimatedFuelUsedL: number
}

const ACTIVE_STATUSES = new Set<TruckStatus>(['EN_ROUTE', 'UNLOADING', 'RETURNING'])

export function deriveFleetMetrics(
  scenario: FleetScenario,
  snapshot: FleetSnapshot,
): FleetMetrics {
  return {
    completedDeliveries: snapshot.trucks.reduce(
      (total, truck) => total + truck.completedDeliveries,
      0,
    ),
    totalDeliveries: scenario.stores.length,
    activeTrucks: snapshot.trucks.filter((truck) => ACTIVE_STATUSES.has(truck.status)).length,
    plannedDistanceKm: scenario.routes.reduce((total, route) => total + route.distanceKm, 0),
    estimatedFuelUsedL: snapshot.trucks.reduce(
      (total, truck) => total + truck.estimatedFuelUsedL,
      0,
    ),
  }
}
