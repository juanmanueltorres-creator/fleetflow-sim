import { useEffect, useMemo, useState } from 'react'
import { FleetPanel } from './components/FleetPanel'
import { KpiPanel } from './components/KpiPanel'
import { ScenarioProvenance } from './components/ScenarioProvenance'
import { ScenarioSwitcher } from './components/ScenarioSwitcher'
import { SimulationClock } from './components/SimulationClock'
import { SimulationControls } from './components/SimulationControls'
import { FleetMap } from './map/FleetMap'
import type { RouteGeometryCollection } from './map/routeAssets'
import { routeCollectionToIndex } from './map/routeAssets'
import {
  DEFAULT_SCENARIO_ID,
  getScenarioDefinition,
  type ScenarioId,
} from './scenario/scenarioRegistry'
import { advanceSimulationMinute } from './simulation/clock'
import { getFleetSnapshot } from './simulation/engine'
import { deriveFleetMetrics } from './simulation/metrics'

export default function App() {
  const [scenarioId, setScenarioId] = useState<ScenarioId>(DEFAULT_SCENARIO_ID)
  const [routes, setRoutes] = useState<RouteGeometryCollection | null>(null)
  const [routeError, setRouteError] = useState(false)
  const [simulationMinute, setSimulationMinute] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const [speed, setSpeed] = useState(60)

  const activeDefinition = getScenarioDefinition(scenarioId)
  const activeScenario = activeDefinition.scenario
  const simulationEndMinute = Math.max(
    ...activeScenario.routes.map((route) => route.returnMinute),
  )

  useEffect(() => {
    let cancelled = false

    async function loadRoutes() {
      try {
        const response = await fetch(activeDefinition.routeAsset)
        if (!response.ok) throw new Error(`Route asset HTTP ${response.status}`)
        const collection = (await response.json()) as RouteGeometryCollection
        routeCollectionToIndex(collection, activeScenario)
        if (!cancelled) {
          setRoutes(collection)
          setRouteError(false)
        }
      } catch {
        if (!cancelled) {
          setRoutes(null)
          setRouteError(true)
        }
      }
    }

    void loadRoutes()
    return () => {
      cancelled = true
    }
  }, [activeDefinition.routeAsset, activeScenario])

  const routeIndex = useMemo(
    () => (routes ? routeCollectionToIndex(routes, activeScenario) : null),
    [routes, activeScenario],
  )

  const snapshot = useMemo(() => {
    if (!routeIndex) return null
    return getFleetSnapshot(activeScenario, routeIndex, simulationMinute)
  }, [activeScenario, routeIndex, simulationMinute])

  const metrics = useMemo(
    () => (snapshot && routeIndex ? deriveFleetMetrics(activeScenario, snapshot, routeIndex) : null),
    [activeScenario, snapshot, routeIndex],
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
            simulationEndMinute,
          ),
        )
      }

      previousTimestamp = timestamp
      frameId = requestAnimationFrame(tick)
    }

    frameId = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frameId)
  }, [isPlaying, routeIndex, speed, simulationEndMinute])

  useEffect(() => {
    if (isPlaying && simulationMinute >= simulationEndMinute) {
      setIsPlaying(false)
    }
  }, [isPlaying, simulationMinute, simulationEndMinute])

  const isComplete = simulationMinute >= simulationEndMinute

  const resetSimulation = () => {
    setIsPlaying(false)
    setSimulationMinute(0)
  }

  const changeScenario = (nextId: ScenarioId) => {
    if (nextId === scenarioId) return
    setIsPlaying(false)
    setSimulationMinute(0)
    setRoutes(null)
    setRouteError(false)
    setScenarioId(nextId)
  }

  return (
    <main className="app-shell">
      {routeError ? (
        <div className="route-error" role="alert">
          Unable to load simulation route data.
        </div>
      ) : null}

      {!routes || !snapshot || !metrics ? (
        routeError ? null : <p className="loading-state">Loading simulation…</p>
      ) : (
        <FleetMap
          key={scenarioId}
          scenario={activeScenario}
          routes={routes}
          snapshot={snapshot}
        />
      )}

      <div className="interface-frame">
        <div className="top-rail">
          <header className="brand-card">
            <p className="eyebrow">Visual fleet simulation · V0.4</p>
            <h1>FleetFlow Sim</h1>
            <p>{activeScenario.label}</p>
            <ScenarioSwitcher value={scenarioId} onChange={changeScenario} />
          </header>

          <div className="simulation-hud">
            <SimulationClock minute={simulationMinute} isPlaying={isPlaying} isComplete={isComplete} />
            <SimulationControls
              isPlaying={isPlaying}
              isComplete={isComplete}
              speed={speed}
              onPlayPause={() => setIsPlaying((current) => !current)}
              onReset={resetSimulation}
              onSpeedChange={setSpeed}
            />
          </div>
        </div>

        {snapshot && metrics ? (
          <aside className="operations-panel">
            <KpiPanel metrics={metrics} />
            <FleetPanel scenario={activeScenario} snapshot={snapshot} />
            <ScenarioProvenance provenance={activeDefinition.provenance} />
          </aside>
        ) : null}
      </div>
    </main>
  )
}
