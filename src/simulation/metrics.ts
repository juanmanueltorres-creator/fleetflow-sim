import type { FleetScenario, FleetSnapshot, TruckStatus } from '../domain/types'
import type { RouteGeometryIndex } from '../map/routeAssets'
import { routeDistanceKm } from '../map/routeAssets'

export interface FleetMetrics {
  completedDeliveries: number
  totalDeliveries: number
  activeTrucks: number
  totalVehicles: number
  plannedDistanceKm: number
  estimatedFuelUsedL: number
  totalPackages: number | null
}

const ACTIVE_STATUSES = new Set<TruckStatus>(['EN_ROUTE', 'UNLOADING', 'RETURNING'])

function totalPackageLoad(scenario: FleetScenario): number | null {
  let hasParcelCargo = false
  let totalPackages = 0

  for (const route of scenario.routes) {
    for (const stop of route.stops) {
      if (stop.cargo.kind !== 'PARCELS') continue
      hasParcelCargo = true
      totalPackages += stop.cargo.packageCount
    }
  }

  return hasParcelCargo ? totalPackages : null
}

export function deriveFleetMetrics(
  scenario: FleetScenario,
  snapshot: FleetSnapshot,
  geometries: RouteGeometryIndex,
): FleetMetrics {
  const plannedDistanceKm = scenario.routes.reduce((total, route) => {
    const geometry = geometries[route.geometryId]
    if (!geometry) throw new Error(`Missing geometry ${route.geometryId}`)
    return total + routeDistanceKm(geometry)
  }, 0)

  return {
    completedDeliveries: snapshot.trucks.reduce(
      (total, truck) => total + truck.completedDeliveries,
      0,
    ),
    totalDeliveries: scenario.stores.length,
    activeTrucks: snapshot.trucks.filter((truck) => ACTIVE_STATUSES.has(truck.status)).length,
    totalVehicles: scenario.trucks.length,
    plannedDistanceKm,
    estimatedFuelUsedL: snapshot.trucks.reduce(
      (total, truck) => total + truck.estimatedFuelUsedL,
      0,
    ),
    totalPackages: totalPackageLoad(scenario),
  }
}
