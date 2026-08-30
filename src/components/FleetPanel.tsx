import type { FleetScenario, FleetSnapshot, RemainingCargo, TruckStatus } from '../domain/types'

interface FleetPanelProps {
  scenario: FleetScenario
  snapshot: FleetSnapshot
}

const STATUS_LABELS: Record<TruckStatus, string> = {
  AT_DEPOT: 'En depósito',
  EN_ROUTE: 'En camino',
  UNLOADING: 'Descargando',
  RETURNING: 'Volviendo',
  DONE: 'Listo',
}

function vehicleCountLabel(count: number): string {
  return `${count} ${count === 1 ? 'vehículo' : 'vehículos'}`
}

function statusLabel(status: TruckStatus, cargo: RemainingCargo): string {
  if (status === 'UNLOADING' && cargo.kind === 'PARCELS') {
    return 'Entregando'
  }

  return STATUS_LABELS[status]
}

function cargoLines(cargo: RemainingCargo): string[] {
  if (cargo.kind === 'MASS') {
    return [`${Math.round(cargo.quantityKg)} kg en carga`]
  }

  return [
    `${cargo.packageCount} ${cargo.packageCount === 1 ? 'paquete' : 'paquetes'}`,
    `${Math.round(cargo.utilizationPct)}% de capacidad ocupada`,
  ]
}

export function FleetPanel({ scenario, snapshot }: FleetPanelProps) {
  const storesById = new Map(scenario.stores.map((store) => [store.id, store]))
  const routesByTruck = new Map(scenario.routes.map((route) => [route.truckId, route]))
  const snapshotsByTruck = new Map(snapshot.trucks.map((truck) => [truck.truckId, truck]))

  return (
    <section className="fleet-panel" aria-label="Estado de la flota">
      <div className="panel-heading">
        <span className="panel-label">Flota</span>
        <strong>{vehicleCountLabel(scenario.trucks.length)}</strong>
      </div>

      <div className="fleet-list">
        {scenario.trucks.map((truck) => {
          const truckSnapshot = snapshotsByTruck.get(truck.id)
          const route = routesByTruck.get(truck.id)
          if (!truckSnapshot || !route) return null

          const nextStore = truckSnapshot.nextStopId
            ? storesById.get(truckSnapshot.nextStopId)
            : null

          return (
            <article className="truck-card" key={truck.id}>
              <div>
                <strong>{truck.label}</strong>
                <span className={`status-pill status-${truckSnapshot.status.toLowerCase()}`}>
                  {statusLabel(truckSnapshot.status, truckSnapshot.remainingCargo)}
                </span>
              </div>
              <p>{nextStore ? `Sigue · ${nextStore.name}` : 'Ruta completa'}</p>
              <span>{truckSnapshot.completedDeliveries} / {route.stops.length} entregas</span>
              {cargoLines(truckSnapshot.remainingCargo).map((line) => (
                <span key={line}>{line}</span>
              ))}
            </article>
          )
        })}
      </div>
    </section>
  )
}
