export type Position = [longitude: number, latitude: number]
export type TruckStatus = 'AT_DEPOT' | 'EN_ROUTE' | 'UNLOADING' | 'RETURNING' | 'DONE'

export interface Depot {
  id: string
  name: string
  position: Position
}

export interface Store {
  id: string
  name: string
  position: Position
  demandKg: number
  serviceMinutes: number
}

export interface Truck {
  id: string
  label: string
  capacityKg: number
  fuelConsumptionLPer100Km: number
}

export interface PlannedStop {
  storeId: string
  plannedArrivalMinute: number
  plannedDepartureMinute: number
  demandKg: number
}

export interface RoutePlan {
  id: string
  truckId: string
  departureMinute: number
  returnMinute: number
  stops: PlannedStop[]
  distanceKm: number
  geometryId: string
}

export interface FleetScenario {
  id: string
  label: string
  simulationStartLabel: string
  depot: Depot
  stores: Store[]
  trucks: Truck[]
  routes: RoutePlan[]
}

export interface TruckSnapshot {
  truckId: string
  position: Position
  bearing: number
  status: TruckStatus
  currentStopId: string | null
  nextStopId: string | null
  routeProgress: number
  cargoKg: number
  completedDeliveries: number
  distanceTravelledKm: number
  estimatedFuelUsedL: number
}

export interface FleetSnapshot {
  simulationMinute: number
  trucks: TruckSnapshot[]
}
