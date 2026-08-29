import { useEffect, useMemo, useState } from 'react'
import { FleetPanel } from './components/FleetPanel'
import { KpiPanel } from './components/KpiPanel'
import { SimulationClock } from './components/SimulationClock'
import { SimulationControls } from './components/SimulationControls'
import { FleetMap } from './map/FleetMap'
import type { RouteGeometryCollection } from './map/routeAssets'
import { routeCollectionToIndex } from './map/routeAssets'
import { cocaCoquiScenario } from './scenario/cocaCoquiScenario'
import { advanceSimulationMinute } from './simulation/clock'
import { getFleetSnapshot } from './simulation/engine'
import { deriveFleetMetrics } from './simulation/metrics'

const SIMULATION_END_MINUTE = Math.max(
  ...cocaCoquiScenario.routes.map((route) => route.returnMinute),
)

export default function App() {
  const [routes, setRoutes] = useState<RouteGeometryCollection | null>(null)
  const [routeError, setRouteError] = useState(false)
  const [simulationMinute, setSimulationMinute] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const [speed, setSpeed] = useState(60)

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

  const routeIndex = useMemo(
    () => (routes ? routeCollectionToIndex(routes) : null),
    [routes],
  )

  const snapshot = useMemo(() => {
    if (!routeIndex) return null
    return getFleetSnapshot(cocaCoquiScenario, routeIndex, simulationMinute)
  }, [routeIndex, simulationMinute])

  const metrics = useMemo(
    () => (snapshot ? deriveFleetMetrics(cocaCoquiScenario, snapshot) : null),
    [snapshot],
  )

  useEffect(() => {
    if (!isPlaying || !routeIndex) return

    let frameId = 0
    let previousTimestamp: number | null = null

    const tick = (timestamp: number) => {
      if (previousTimestamp !== null) {
        const elapsedRealMs = timestamp - previousTimestamp
        setSimulationMinute((currentMinute) =>
          advanceSimulationMinute(
            currentMinute,
            elapsedRealMs,
            speed,
            SIMULATION_END_MINUTE,
          ),
        )
      }

      previousTimestamp = timestamp
      frameId = requestAnimationFrame(tick)
    }

    frameId = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frameId)
  }, [isPlaying, routeIndex, speed])

  useEffect(() => {
    if (isPlaying && simulationMinute >= SIMULATION_END_MINUTE) {
      setIsPlaying(false)
    }
  }, [isPlaying, simulationMinute])

  const resetSimulation = () => {
    setIsPlaying(false)
    setSimulationMinute(0)
  }

  return (
    <main className="app-shell">
      <header className="brand-card">
        <p className="eyebrow">Visual fleet simulation · V0</p>
        <h1>FleetFlow Sim</h1>
        <p>Coca Coqui — Córdoba Distribution Run</p>
        <span>Fictional operational scenario</span>
      </header>

      <div className="simulation-hud">
        <SimulationClock minute={simulationMinute} isPlaying={isPlaying} />
        <SimulationControls
          isPlaying={isPlaying}
          speed={speed}
          onPlayPause={() => setIsPlaying((current) => !current)}
          onReset={resetSimulation}
          onSpeedChange={setSpeed}
        />
      </div>

      {routeError ? (
        <div className="route-error" role="alert">
          Unable to load simulation route data.
        </div>
      ) : null}

      {!routes || !snapshot || !metrics ? (
        routeError ? null : <p className="loading-state">Loading simulation…</p>
      ) : (
        <>
          <FleetMap scenario={cocaCoquiScenario} routes={routes} snapshot={snapshot} />
          <aside className="operations-panel">
            <KpiPanel metrics={metrics} />
            <FleetPanel scenario={cocaCoquiScenario} snapshot={snapshot} />
          </aside>
        </>
      )}
    </main>
  )
}
