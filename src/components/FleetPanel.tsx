import type { FleetScenario, FleetSnapshot, TruckStatus } from '../domain/types'

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

export function FleetPanel({ scenario, snapshot }: FleetPanelProps) {
  const storesById = new Map(scenario.stores.map((store) => [store.id, store]))
  const routesByTruck = new Map(scenario.routes.map((route) => [route.truckId, route]))
  const snapshotsByTruck = new Map(snapshot.trucks.map((truck) => [truck.truckId, truck]))

  return (
    <section className="fleet-panel" aria-label="Estado de la flota">
      <div className="panel-heading">
        <span className="panel-label">Flota</span>
        <strong>{scenario.trucks.length} camiones</strong>
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
                  {STATUS_LABELS[truckSnapshot.status]}
                </span>
              </div>
              <p>{nextStore ? `Sigue · ${nextStore.name}` : 'Ruta completa'}</p>
              <span>{truckSnapshot.completedDeliveries} / {route.stops.length} entregas</span>
            </article>
          )
        })}
      </div>
    </section>
  )
}
