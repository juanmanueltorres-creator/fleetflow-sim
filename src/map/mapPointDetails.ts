import type {
  FleetScenario,
  FleetSnapshot,
  RemainingCargo,
  RoutePlan,
  StopCargo,
  Store,
  Truck,
} from '../domain/types'
import { formatSimulationTime } from '../simulation/clock'

export interface MapPointDetails {
  title: string
  headline: string
  lines: string[]
  note: string
}

interface StoreAssignment {
  store: Store
  route: RoutePlan
  truck: Truck
  stopIndex: number
}

function findStoreAssignment(scenario: FleetScenario, storeId: string): StoreAssignment {
  const store = scenario.stores.find((candidate) => candidate.id === storeId)
  if (!store) throw new Error(`Unknown store ${storeId}`)

  for (const route of scenario.routes) {
    const stopIndex = route.stops.findIndex((stop) => stop.storeId === storeId)
    if (stopIndex === -1) continue

    const truck = scenario.trucks.find((candidate) => candidate.id === route.truckId)
    if (!truck) throw new Error(`Unknown truck ${route.truckId}`)

    return { store, route, truck, stopIndex }
  }

  throw new Error(`Store ${storeId} has no route assignment`)
}

function formatStopCargo(cargo: StopCargo): string {
  if (cargo.kind === 'MASS') return `${Math.round(cargo.quantityKg)} kg`
  return `${cargo.packageCount} ${cargo.packageCount === 1 ? 'paquete' : 'paquetes'}`
}

function formatRemainingCargo(cargo: RemainingCargo): string[] {
  if (cargo.kind === 'MASS') {
    return [`${Math.round(cargo.quantityKg)} kg en carga`]
  }

  return [
    `${cargo.packageCount} ${cargo.packageCount === 1 ? 'paquete' : 'paquetes'}`,
    `${Math.round(cargo.utilizationPct)}% de capacidad ocupada`,
  ]
}

function vehicleCountLabel(count: number): string {
  return `${count} ${count === 1 ? 'vehículo' : 'vehículos'}`
}

function scenarioNote(scenario: FleetScenario): string {
  return scenario.id === 'cordoba-calibrated-v1'
    ? 'Escenario calibrado · ubicación adaptada'
    : 'Escenario simulado'
}

function timeWindowLine(store: Store): string | null {
  if (!store.timeWindow) return null
  return `Ventana ${formatSimulationTime(store.timeWindow.startMinute)}–${formatSimulationTime(store.timeWindow.endMinute)}`
}

function withTimeWindow(lines: string[], store: Store): string[] {
  const windowLine = timeWindowLine(store)
  return windowLine ? [...lines, windowLine] : lines
}

export function getStorePointDetails(
  scenario: FleetScenario,
  snapshot: FleetSnapshot,
  storeId: string,
): MapPointDetails {
  const { store, route, truck, stopIndex } = findStoreAssignment(scenario, storeId)
  const stop = route.stops[stopIndex]
  const minute = snapshot.simulationMinute
  const cargoLabel = formatStopCargo(stop.cargo)
  const serviceLabel = stop.cargo.kind === 'MASS' ? 'Descarga' : 'Entrega'
  const note = scenarioNote(scenario)

  if (minute < stop.plannedArrivalMinute) {
    return {
      title: store.name,
      headline: `Faltan ${cargoLabel}`,
      lines: withTimeWindow([
        `${truck.label} · llega ${formatSimulationTime(stop.plannedArrivalMinute)}`,
        `${serviceLabel} ~${store.serviceMinutes} min`,
      ], store),
      note,
    }
  }

  if (minute < stop.plannedDepartureMinute) {
    return {
      title: store.name,
      headline: `${stop.cargo.kind === 'MASS' ? 'Descargando' : 'Entregando'} ${cargoLabel}`,
      lines: withTimeWindow([
        `${truck.label} · hasta ${formatSimulationTime(stop.plannedDepartureMinute)}`,
        `Parada ${stopIndex + 1} de ${route.stops.length}`,
      ], store),
      note,
    }
  }

  const nextStop = route.stops[stopIndex + 1]
  const nextStore = nextStop
    ? scenario.stores.find((candidate) => candidate.id === nextStop.storeId)
    : null

  return {
    title: store.name,
    headline: `Entrega hecha · ${cargoLabel}`,
    lines: withTimeWindow([
      nextStore ? `${truck.label} siguió a ${nextStore.name}` : `${truck.label} vuelve al depósito`,
      `Salió ${formatSimulationTime(stop.plannedDepartureMinute)}`,
    ], store),
    note,
  }
}

export function getTruckPointDetails(
  scenario: FleetScenario,
  snapshot: FleetSnapshot,
  truckId: string,
): MapPointDetails {
  const truck = scenario.trucks.find((candidate) => candidate.id === truckId)
  const route = scenario.routes.find((candidate) => candidate.truckId === truckId)
  const truckSnapshot = snapshot.trucks.find((candidate) => candidate.truckId === truckId)

  if (!truck || !route || !truckSnapshot) throw new Error(`Unknown truck ${truckId}`)

  const nextStore = truckSnapshot.nextStopId
    ? scenario.stores.find((candidate) => candidate.id === truckSnapshot.nextStopId)
    : null
  const currentStore = truckSnapshot.currentStopId
    ? scenario.stores.find((candidate) => candidate.id === truckSnapshot.currentStopId)
    : null
  const currentStop = truckSnapshot.currentStopId
    ? route.stops.find((stop) => stop.storeId === truckSnapshot.currentStopId)
    : null

  let headline: string
  switch (truckSnapshot.status) {
    case 'AT_DEPOT':
      headline = `Sale ${formatSimulationTime(route.departureMinute)}`
      break
    case 'EN_ROUTE':
      headline = nextStore ? `Va a ${nextStore.name}` : 'En camino'
      break
    case 'UNLOADING':
      headline = currentStore
        ? `${currentStop?.cargo.kind === 'PARCELS' ? 'Entregando' : 'Descargando'} en ${currentStore.name}`
        : currentStop?.cargo.kind === 'PARCELS' ? 'Entregando' : 'Descargando'
      break
    case 'RETURNING':
      headline = 'Vuelve al depósito'
      break
    case 'DONE':
      headline = 'Ruta terminada'
      break
  }

  return {
    title: truck.label,
    headline,
    lines: [
      `${truckSnapshot.completedDeliveries} / ${route.stops.length} entregas`,
      ...formatRemainingCargo(truckSnapshot.remainingCargo),
      `${truckSnapshot.estimatedFuelUsedL.toFixed(1)} L estimados`,
    ],
    note: scenarioNote(scenario),
  }
}

export function getDepotPointDetails(scenario: FleetScenario): MapPointDetails {
  const firstDeparture = Math.min(...scenario.routes.map((route) => route.departureMinute))
  const lastReturn = Math.max(...scenario.routes.map((route) => route.returnMinute))
  const totalDeliveries = scenario.routes.reduce((sum, route) => sum + route.stops.length, 0)

  return {
    title: scenario.depot.name,
    headline: `${vehicleCountLabel(scenario.trucks.length)} · ${totalDeliveries} entregas`,
    lines: [
      `Primera salida ${formatSimulationTime(firstDeparture)} · último regreso ${formatSimulationTime(lastReturn)}`,
    ],
    note: scenarioNote(scenario),
  }
}
