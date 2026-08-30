import type { FleetMetrics } from '../simulation/metrics'

interface KpiPanelProps {
  metrics: FleetMetrics
}

export function KpiPanel({ metrics }: KpiPanelProps) {
  return (
    <section className="kpi-panel" aria-label="Resumen de la flota">
      <article>
        <span>Entregas</span>
        <strong>{metrics.completedDeliveries} / {metrics.totalDeliveries}</strong>
      </article>
      <article>
        <span>Vehículos activos</span>
        <strong>{metrics.activeTrucks} / {metrics.totalVehicles}</strong>
      </article>
      <article>
        <span>Distancia prevista</span>
        <strong>{metrics.plannedDistanceKm.toFixed(1)} km</strong>
      </article>
      <article>
        <span>Combustible estimado</span>
        <strong>{metrics.estimatedFuelUsedL.toFixed(1)} L</strong>
      </article>
    </section>
  )
}
