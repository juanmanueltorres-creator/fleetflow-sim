import along from '@turf/along'
import bearing from '@turf/bearing'
import { point } from '@turf/helpers'
import type {
  FleetScenario,
  FleetSnapshot,
  Position,
  RoutePlan,
  Truck,
  TruckSnapshot,
  TruckStatus,
} from '../domain/types'
import type { RouteGeometryFeature, RouteGeometryIndex } from '../map/routeAssets'
import { routeDistanceKm } from '../map/routeAssets'

interface TravelLeg {
  startMinute: number
  endMinute: number
  startDistanceKm: number
  endDistanceKm: number
  nextStopId: string | null
  status: TruckStatus
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function positionAtDistance(feature: RouteGeometryFeature, distanceKm: number): Position {
  const coordinate = along(feature, Math.max(0, distanceKm), { units: 'kilometers' }).geometry.coordinates
  return [coordinate[0], coordinate[1]]
}

function bearingAtDistance(
  feature: RouteGeometryFeature,
  distanceKm: number,
  totalDistanceKm: number,
): number {
  const nextDistanceKm = Math.min(totalDistanceKm, distanceKm + 0.01)
  if (nextDistanceKm <= distanceKm) return 0

  const start = positionAtDistance(feature, distanceKm)
  const end = positionAtDistance(feature, nextDistanceKm)

  if (start[0] === end[0] && start[1] === end[1]) return 0
  return bearing(point(start), point(end))
}

function buildTravelLegs(route: RoutePlan, distances: number[]): TravelLeg[] {
  if (route.stops.length === 0) {
    throw new Error(`Route ${route.id} requires at least one stop`)
  }

  const outbound: TravelLeg[] = route.stops.map((stop, index) => ({
    startMinute:
      index === 0
        ? route.departureMinute
        : route.stops[index - 1].plannedDepartureMinute,
    endMinute: stop.plannedArrivalMinute,
    startDistanceKm: distances[index],
    endDistanceKm: distances[index + 1],
    nextStopId: stop.storeId,
    status: 'EN_ROUTE',
  }))
  const lastStop = route.stops[route.stops.length - 1]

  return [
    ...outbound,
    {
      startMinute: lastStop.plannedDepartureMinute,
      endMinute: route.returnMinute,
      startDistanceKm: distances[route.stops.length],
      endDistanceKm: distances[route.stops.length + 1],
      nextStopId: null,
      status: 'RETURNING',
    },
  ]
}

function snapshotForTruck(
  scenario: FleetScenario,
  truck: Truck,
  route: RoutePlan,
  geometry: RouteGeometryFeature,
  simulationMinute: number,
): TruckSnapshot {
  const assignedDemandKg = route.stops.reduce((sum, stop) => sum + stop.demandKg, 0)
  const completedStops = route.stops.filter(
    (stop) => simulationMinute >= stop.plannedDepartureMinute,
  )
  const completedDeliveries = completedStops.length
  const cargoKg = Math.max(
    0,
    assignedDemandKg - completedStops.reduce((sum, stop) => sum + stop.demandKg, 0),
  )
  const waypointDistances = geometry.properties.waypointDistancesKm
  const totalGeometryDistanceKm = routeDistanceKm(geometry)

  let position: Position = scenario.depot.position
  let bearingDegrees = 0
  let status: TruckStatus = 'AT_DEPOT'
  let currentStopId: string | null = null
  let nextStopId: string | null = route.stops[0]?.storeId ?? null
  let routeProgress = 0

  if (simulationMinute >= route.returnMinute) {
    status = 'DONE'
    nextStopId = null
    routeProgress = 1
  } else if (simulationMinute >= route.departureMinute) {
    const unloadingStopIndex = route.stops.findIndex(
      (stop) =>
        simulationMinute >= stop.plannedArrivalMinute &&
        simulationMinute < stop.plannedDepartureMinute,
    )

    if (unloadingStopIndex >= 0) {
      const stop = route.stops[unloadingStopIndex]
      const store = scenario.stores.find((candidate) => candidate.id === stop.storeId)
      if (!store) throw new Error(`Missing store ${stop.storeId}`)

      position = store.position
      status = 'UNLOADING'
      currentStopId = stop.storeId
      nextStopId = route.stops[unloadingStopIndex + 1]?.storeId ?? null
      routeProgress = clamp(waypointDistances[unloadingStopIndex + 1] / totalGeometryDistanceKm, 0, 1)
    } else {
      const leg = buildTravelLegs(route, waypointDistances).find(
        (candidate) =>
          simulationMinute >= candidate.startMinute && simulationMinute < candidate.endMinute,
      )

      if (!leg) {
        throw new Error(`No simulation leg for ${truck.id} at minute ${simulationMinute}`)
      }

      const legDuration = leg.endMinute - leg.startMinute
      const legProgress = legDuration <= 0
        ? 1
        : clamp((simulationMinute - leg.startMinute) / legDuration, 0, 1)
      const distanceKm =
        leg.startDistanceKm + (leg.endDistanceKm - leg.startDistanceKm) * legProgress

      position = positionAtDistance(geometry, distanceKm)
      bearingDegrees = bearingAtDistance(geometry, distanceKm, totalGeometryDistanceKm)
      status = leg.status
      nextStopId = leg.nextStopId
      routeProgress = clamp(distanceKm / totalGeometryDistanceKm, 0, 1)
    }
  }

  const distanceTravelledKm = totalGeometryDistanceKm * routeProgress
  const estimatedFuelUsedL =
    (distanceTravelledKm * truck.fuelConsumptionLPer100Km) / 100

  return {
    truckId: truck.id,
    position,
    bearing: bearingDegrees,
    status,
    currentStopId,
    nextStopId,
    routeProgress,
    cargoKg,
    completedDeliveries,
    distanceTravelledKm,
    estimatedFuelUsedL,
  }
}

export function getFleetSnapshot(
  scenario: FleetScenario,
  geometries: RouteGeometryIndex,
  simulationMinute: number,
): FleetSnapshot {
  return {
    simulationMinute,
    trucks: scenario.trucks.map((truck) => {
      const route = scenario.routes.find((candidate) => candidate.truckId === truck.id)
      if (!route) throw new Error(`Missing route for truck ${truck.id}`)

      const geometry = geometries[route.geometryId]
      if (!geometry) throw new Error(`Missing geometry ${route.geometryId}`)

      return snapshotForTruck(scenario, truck, route, geometry, simulationMinute)
    }),
  }
}
