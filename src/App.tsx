import { useEffect, useMemo, useState } from 'react'
import type { RouteGeometryCollection } from './map/routeAssets'
import { routeCollectionToIndex } from './map/routeAssets'
import { FleetMap } from './map/FleetMap'
import { cocaCoquiScenario } from './scenario/cocaCoquiScenario'
import { getFleetSnapshot } from './simulation/engine'

export default function App() {
  const [routes, setRoutes] = useState<RouteGeometryCollection | null>(null)
  const [routeError, setRouteError] = useState(false)

  useEffect(() => {
    let cancelled = false

    async function loadRoutes() {
      try {
        const response = await fetch('./data/coca-coqui-routes.geojson')
        if (!response.ok) throw new Error(`Route asset HTTP ${response.status}`)
        const collection = (await response.json()) as RouteGeometryCollection
        routeCollectionToIndex(collection)
        if (!cancelled) setRoutes(collection)
      } catch {
        if (!cancelled) setRouteError(true)
      }
    }

    void loadRoutes()
    return () => {
      cancelled = true
    }
  }, [])

  const snapshot = useMemo(() => {
    if (!routes) return null
    return getFleetSnapshot(cocaCoquiScenario, routeCollectionToIndex(routes), 0)
  }, [routes])

  return (
    <main className="app-shell">
      <header className="brand-card">
        <p className="eyebrow">Visual fleet simulation · V0</p>
        <h1>FleetFlow Sim</h1>
        <p>Coca Coqui — Córdoba Distribution Run</p>
        <span>Fictional operational scenario</span>
      </header>

      {routeError ? (
        <div className="route-error" role="alert">
          Unable to load simulation route data.
        </div>
      ) : null}

      {!routes || !snapshot ? (
        routeError ? null : <p className="loading-state">Loading simulation…</p>
      ) : (
        <FleetMap scenario={cocaCoquiScenario} routes={routes} snapshot={snapshot} />
      )}
    </main>
  )
}
