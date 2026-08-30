import { useEffect, useMemo, useState } from 'react'
import { FleetPanel } from './components/FleetPanel'
import { KpiPanel } from './components/KpiPanel'
import { OperationalDateRail } from './components/OperationalDateRail'
import { OperationalExplainer } from './components/OperationalExplainer'
import { ScenarioProvenance } from './components/ScenarioProvenance'
import { ScenarioSwitcher } from './components/ScenarioSwitcher'
import { SimulationClock } from './components/SimulationClock'
import { SimulationControls } from './components/SimulationControls'
import { FleetMap } from './map/FleetMap'
import type { RouteGeometryCollection } from './map/routeAssets'
import { routeCollectionToIndex } from './map/routeAssets'
import {
  getCordobaOperationalDate,
} from './scenario/operationalRuns/date'
import {
  loadOperationalRun,
  loadOperationalRunManifest,
  selectDefaultRunEntry,
} from './scenario/operationalRuns/catalog'
import type {
  OperationalRun,
  OperationalRunManifest,
} from './scenario/operationalRuns/types'
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
  const [runManifest, setRunManifest] = useState<OperationalRunManifest | null>(null)
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null)
  const [activeRun, setActiveRun] = useState<OperationalRun | null>(null)
  const [runLoading, setRunLoading] = useState(false)
  const [runError, setRunError] = useState(false)
  const [simulationMinute, setSimulationMinute] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const [speed, setSpeed] = useState(60)

  const activeDefinition = getScenarioDefinition(scenarioId)
  const timeline = activeDefinition.operationalRuns
  const activeScenario = timeline ? activeRun?.scenario ?? null : activeDefinition.scenario
  const simulationEndMinute = activeScenario
    ? Math.max(0, ...activeScenario.routes.map((route) => route.returnMinute))
    : 0

  useEffect(() => {
    let cancelled = false

    if (!timeline) {
      setRunManifest(null)
      setSelectedRunId(null)
      setActiveRun(null)
      setRunLoading(false)
      setRunError(false)
      return () => {
        cancelled = true
      }
    }

    const manifestUrl = timeline.manifestUrl

    setRunManifest(null)
    setSelectedRunId(null)
    setActiveRun(null)
    setRunLoading(true)
    setRunError(false)

    async function loadManifest() {
      try {
        const manifest = await loadOperationalRunManifest(manifestUrl)
        if (cancelled) return

        const defaultEntry = selectDefaultRunEntry(
          manifest,
          scenarioId,
          getCordobaOperationalDate(),
        )
        if (!defaultEntry) throw new Error('No operational run is available for this scenario')

        setRunManifest(manifest)
        setSelectedRunId(defaultEntry.id)
      } catch {
        if (!cancelled) {
          setRunManifest(null)
          setSelectedRunId(null)
          setActiveRun(null)
          setRunError(true)
          setRunLoading(false)
        }
      }
    }

    void loadManifest()
    return () => {
      cancelled = true
    }
  }, [scenarioId, timeline])

  useEffect(() => {
    if (!timeline || !runManifest || !selectedRunId) return

    const manifestUrl = timeline.manifestUrl
    let cancelled = false
    const entry = runManifest.runs.find((candidate) => candidate.id === selectedRunId)

    if (!entry || entry.scenarioId !== scenarioId) {
      setActiveRun(null)
      setRunError(true)
      setRunLoading(false)
      return () => {
        cancelled = true
      }
    }

    const selectedEntry = entry

    setRunLoading(true)
    setRunError(false)
    setActiveRun(null)

    async function loadSelectedRun() {
      try {
        const run = await loadOperationalRun(selectedEntry, manifestUrl)
        if (!cancelled) {
          setActiveRun(run)
          setRunError(false)
        }
      } catch {
        if (!cancelled) {
          setActiveRun(null)
          setRunError(true)
        }
      } finally {
        if (!cancelled) setRunLoading(false)
      }
    }

    void loadSelectedRun()
    return () => {
      cancelled = true
    }
  }, [runManifest, scenarioId, selectedRunId, timeline])

  useEffect(() => {
    if (!activeScenario) {
      setRoutes(null)
      setRouteError(false)
      return
    }

    const scenario = activeScenario
    let cancelled = false

    async function loadRoutes() {
      try {
        const response = await fetch(activeDefinition.routeAsset)
        if (!response.ok) throw new Error(`Route asset HTTP ${response.status}`)
        const collection = (await response.json()) as RouteGeometryCollection
        routeCollectionToIndex(collection, scenario)
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
    () => (routes && activeScenario ? routeCollectionToIndex(routes, activeScenario) : null),
    [routes, activeScenario],
  )

  const snapshot = useMemo(() => {
    if (!activeScenario || !routeIndex) return null
    return getFleetSnapshot(activeScenario, routeIndex, simulationMinute)
  }, [activeScenario, routeIndex, simulationMinute])

  const metrics = useMemo(
    () => (
      activeScenario && snapshot && routeIndex
        ? deriveFleetMetrics(activeScenario, snapshot, routeIndex)
        : null
    ),
    [activeScenario, snapshot, routeIndex],
  )

  useEffect(() => {
    if (!isPlaying || !routeIndex || !activeScenario) return

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
  }, [activeScenario, isPlaying, routeIndex, speed, simulationEndMinute])

  useEffect(() => {
    if (activeScenario && isPlaying && simulationMinute >= simulationEndMinute) {
      setIsPlaying(false)
    }
  }, [activeScenario, isPlaying, simulationMinute, simulationEndMinute])

  const isComplete = Boolean(
    activeScenario && routeIndex && simulationMinute >= simulationEndMinute,
  )

  const resetSimulation = () => {
    setIsPlaying(false)
    setSimulationMinute(0)
  }

  const changeOperationalRun = (nextId: string) => {
    if (nextId === selectedRunId) return
    setIsPlaying(false)
    setSimulationMinute(0)
    setRoutes(null)
    setRouteError(false)
    setActiveRun(null)
    setRunError(false)
    setSelectedRunId(nextId)
  }

  const changeScenario = (nextId: ScenarioId) => {
    if (nextId === scenarioId) return
    setIsPlaying(false)
    setSimulationMinute(0)
    setRoutes(null)
    setRouteError(false)
    setRunManifest(null)
    setSelectedRunId(null)
    setActiveRun(null)
    setRunLoading(false)
    setRunError(false)
    setScenarioId(nextId)
  }

  const timelineEntries = runManifest
    ? runManifest.runs.filter((entry) => entry.scenarioId === scenarioId)
    : []

  const showRunLoading = Boolean(timeline && !runError && (runLoading || !activeScenario))
  const showSimulationLoading = Boolean(
    !runError
      && !routeError
      && !showRunLoading
      && activeScenario
      && (!routes || !snapshot || !metrics),
  )

  return (
    <main className="app-shell">
      {runError ? (
        <div className="route-error" role="alert">
          Operational run unavailable.
        </div>
      ) : null}

      {routeError ? (
        <div className="route-error" role="alert">
          Unable to load simulation route data.
        </div>
      ) : null}

      {showRunLoading ? <p className="loading-state">Loading operational run…</p> : null}
      {showSimulationLoading ? <p className="loading-state">Loading simulation…</p> : null}

      {activeScenario && routes && snapshot && metrics ? (
        <FleetMap
          key={`${scenarioId}:${activeRun?.id ?? 'static'}`}
          scenario={activeScenario}
          routes={routes}
          snapshot={snapshot}
        />
      ) : null}

      <div className="interface-frame">
        <div className="top-rail">
          <header className="brand-card">
            <p className="eyebrow">Operational timeline simulation · V0.5</p>
            <h1>FleetFlow Sim</h1>
            <p>{activeScenario?.label ?? activeDefinition.label}</p>
            <ScenarioSwitcher value={scenarioId} onChange={changeScenario} />
          </header>

          <div className="simulation-hud">
            {timeline && runManifest && selectedRunId ? (
              <OperationalDateRail
                entries={timelineEntries}
                selectedRunId={selectedRunId}
                onSelect={changeOperationalRun}
              />
            ) : null}

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

        {activeScenario && snapshot && metrics ? (
          <aside className="operations-panel">
            <KpiPanel metrics={metrics} />
            {timeline && activeRun ? (
              <OperationalExplainer targetDate={activeRun.targetDate} />
            ) : null}
            <FleetPanel scenario={activeScenario} snapshot={snapshot} />
            <ScenarioProvenance
              provenance={activeDefinition.provenance}
              runMode={activeRun?.mode}
            />
          </aside>
        ) : null}
      </div>
    </main>
  )
}
