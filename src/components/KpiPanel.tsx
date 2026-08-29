import type { FleetMetrics } from '../simulation/metrics'

interface KpiPanelProps {
  metrics: FleetMetrics
}

export function KpiPanel({ metrics }: KpiPanelProps) {
  return (
    <section className="kpi-panel" aria-label="Fleet KPIs">
      <article>
        <span>Deliveries</span>
        <strong>{metrics.completedDeliveries} / {metrics.totalDeliveries}</strong>
      </article>
      <article>
        <span>Active trucks</span>
        <strong>{metrics.activeTrucks} / 5</strong>
      </article>
      <article>
        <span>Planned distance</span>
        <strong>{metrics.plannedDistanceKm.toFixed(1)} km</strong>
      </article>
      <article>
        <span>Estimated fuel used</span>
        <strong>{metrics.estimatedFuelUsedL.toFixed(1)} L</strong>
      </article>
    </section>
  )
}
