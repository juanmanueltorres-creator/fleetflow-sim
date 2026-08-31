import { formatSimulationTime } from '../simulation/clock'
import {
  deriveScenarioDelta,
  deriveScenarioOutcome,
  type ScenarioDelta,
  type ScenarioOutcome,
} from '../scenario/whatIf/outcomes'
import type { ScenarioComparisonSet } from '../scenario/whatIf/types'

interface ScenarioComparisonPanelProps {
  comparison: ScenarioComparisonSet
  selectedRunId: string
}

function formatNumber(value: number | null, digits = 1): string {
  return value === null ? '—' : value.toFixed(digits)
}

function formatDelta(value: number | null, unit = ''): string {
  if (value === null) return '—'
  const rounded = Math.abs(value) < 0.005 ? 0 : value
  return `${rounded > 0 ? '+' : ''}${rounded.toFixed(1)}${unit}`
}

function actionLabel(runId: string, comparison: ScenarioComparisonSet): string {
  if (runId === comparison.base.run.id) return 'Baseline operational run'
  const bundle = comparison.alternatives.find((item) => item.bundle.run.id === runId)?.bundle
  const action = bundle?.run.provenance.whatIf?.actionSet.actions[0]
  if (!action) return '—'
  if (action.type === 'SHIFT_DEPARTURE') return `SHIFT_DEPARTURE ${action.minutes} min`
  return `REBALANCE_STOPS · ${action.strategy}`
}

function earlySemanticNote(delta: ScenarioDelta | null): string | null {
  if (!delta || delta.operationEndDeltaMinutes >= 0 || delta.operationSpanDeltaMinutes !== 0) {
    return null
  }
  return `finishes ${Math.abs(delta.operationEndDeltaMinutes)} min earlier; operational duration unchanged`
}

export function ScenarioComparisonPanel({
  comparison,
  selectedRunId,
}: ScenarioComparisonPanelProps) {
  const baseOutcome = deriveScenarioOutcome(comparison.base)
  const alternatives = comparison.alternatives.map((item) => {
    const outcome = deriveScenarioOutcome(item.bundle)
    return {
      ...item,
      outcome,
      delta: deriveScenarioDelta(baseOutcome, outcome),
    }
  })
  const columns: Array<{
    label: string
    runId: string
    outcome: ScenarioOutcome
    delta: ScenarioDelta | null
  }> = [
    {
      label: 'BASE',
      runId: comparison.base.run.id,
      outcome: baseOutcome,
      delta: null,
    },
    ...alternatives.map((item) => ({
      label: item.label === 'Early start' ? 'EARLY START' : 'BALANCED LOAD',
      runId: item.bundle.run.id,
      outcome: item.outcome,
      delta: item.delta,
    })),
  ]
  const selectedColumn = columns.find((column) => column.runId === selectedRunId) ?? columns[0]

  return (
    <section className="scenario-comparison-panel" aria-label="Scenario comparison">
      <div className="scenario-comparison-heading">
        <div>
          <span className="panel-label">Decision comparison</span>
          <strong>{selectedColumn.label}</strong>
        </div>
        {selectedRunId !== comparison.base.run.id ? (
          <div className="what-if-model-note">
            <strong>WHAT_IF · MODEL OUTPUT</strong>
            <span>Scenario outcome, not an observed operation or guaranteed prediction.</span>
          </div>
        ) : null}
      </div>

      <div className="scenario-action-strip">
        {columns.map((column) => (
          <div key={column.runId} data-selected={column.runId === selectedRunId ? 'true' : undefined}>
            <strong>{column.label}</strong>
            <span>{actionLabel(column.runId, comparison)}</span>
            {earlySemanticNote(column.delta) ? <small>{earlySemanticNote(column.delta)}</small> : null}
          </div>
        ))}
      </div>

      <div className="scenario-comparison-table-wrap">
        <table aria-label="Scenario outcome comparison">
          <thead>
            <tr>
              <th>Outcome</th>
              {columns.map((column) => <th key={column.runId}>{column.label}</th>)}
            </tr>
          </thead>
          <tbody>
            <tr>
              <th>Finish time</th>
              {columns.map((column) => <td key={column.runId}>{formatSimulationTime(column.outcome.operationEndMinute)}</td>)}
            </tr>
            <tr>
              <th>Operational span</th>
              {columns.map((column) => <td key={column.runId}>{column.outcome.operationSpanMinutes.toFixed(0)} min</td>)}
            </tr>
            <tr>
              <th>Planned distance</th>
              {columns.map((column) => <td key={column.runId}>{formatNumber(column.outcome.plannedDistanceKm)} km</td>)}
            </tr>
            <tr>
              <th>Estimated fuel</th>
              {columns.map((column) => <td key={column.runId}>{formatNumber(column.outcome.estimatedFuelUsedL)} L</td>)}
            </tr>
            <tr>
              <th>Mean utilization</th>
              {columns.map((column) => <td key={column.runId}>{formatNumber(column.outcome.meanVehicleUtilizationPct)}%</td>)}
            </tr>
            <tr>
              <th>Package load spread</th>
              {columns.map((column) => <td key={column.runId}>{formatNumber(column.outcome.packageLoadSpread, 0)}</td>)}
            </tr>
            <tr>
              <th>Δ finish vs Base</th>
              {columns.map((column) => <td key={column.runId}>{column.delta ? formatDelta(column.delta.operationEndDeltaMinutes, ' min') : '—'}</td>)}
            </tr>
            <tr>
              <th>Δ distance vs Base</th>
              {columns.map((column) => <td key={column.runId}>{column.delta ? formatDelta(column.delta.distanceDeltaKm, ' km') : '—'}</td>)}
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  )
}
