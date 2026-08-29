import type { FleetScenario, FleetSnapshot, TruckStatus } from '../domain/types'

interface FleetPanelProps {
  scenario: FleetScenario
  snapshot: FleetSnapshot
}

const STATUS_LABELS: Record<TruckStatus, string> = {
  AT_DEPOT: 'At depot',
  EN_ROUTE: 'En route',
  UNLOADING: 'Unloading',
  RETURNING: 'Returning',
  DONE: 'Done',
}

export function FleetPanel({ scenario, snapshot }: FleetPanelProps) {
  const storesById = new Map(scenario.stores.map((store) => [store.id, store]))
  const routesByTruck = new Map(scenario.routes.map((route) => [route.truckId, route]))
  const snapshotsByTruck = new Map(snapshot.trucks.map((truck) => [truck.truckId, truck]))

  return (
    <section className="fleet-panel" aria-label="Fleet status">
      <div className="panel-heading">
        <span className="panel-label">Fleet</span>
        <strong>{scenario.trucks.length} vehicles</strong>
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
              <p>{nextStore ? `Next · ${nextStore.name}` : 'Route complete'}</p>
              <span>{truckSnapshot.completedDeliveries} / {route.stops.length} delivered</span>
            </article>
          )
        })}
      </div>
    </section>
  )
}
