export type Position = [longitude: number, latitude: number]
export type TruckStatus = 'AT_DEPOT' | 'EN_ROUTE' | 'UNLOADING' | 'RETURNING' | 'DONE'

export type StopCargo =
  | { kind: 'MASS'; quantityKg: number }
  | { kind: 'PARCELS'; packageCount: number; volumeCm3: number }

export type VehicleCapacity =
  | { kind: 'MASS'; capacityKg: number }
  | { kind: 'PARCELS'; capacityCm3: number }

export type RemainingCargo =
  | { kind: 'MASS'; quantityKg: number; utilizationPct: number }
  | { kind: 'PARCELS'; packageCount: number; volumeCm3: number; utilizationPct: number }

export interface TimeWindow {
  startMinute: number
  endMinute: number
}

export interface Depot {
  id: string
  name: string
  position: Position
}

export interface Store {
  id: string
  name: string
  position: Position
  serviceMinutes: number
  timeWindow?: TimeWindow
}

export interface Truck {
  id: string
  label: string
  capacity: VehicleCapacity
  fuelConsumptionLPer100Km: number
}

export interface PlannedStop {
  storeId: string
  plannedArrivalMinute: number
  plannedDepartureMinute: number
  cargo: StopCargo
}

export interface RoutePlan {
  id: string
  truckId: string
  departureMinute: number
  returnMinute: number
  stops: PlannedStop[]
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
  remainingCargo: RemainingCargo
  completedDeliveries: number
  distanceTravelledKm: number
  estimatedFuelUsedL: number
}

export interface FleetSnapshot {
  simulationMinute: number
  trucks: TruckSnapshot[]
}
