import { formatSimulationTime } from '../simulation/clock'
import {
  deriveScenarioDelta,
  deriveScenarioOutcome,
  type ScenarioDelta,
  type ScenarioOutcome,
} from '../scenario/whatIf/outcomes'
import type { OperationalBundle } from '../scenario/operationalRuns/bundle'
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

function actionLabel(bundle: OperationalBundle): string {
  if (bundle.run.mode !== 'WHAT_IF') return 'Baseline operational run'
  const action = bundle.run.provenance.whatIf?.actionSet.actions[0]
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

function baseContextLabel(comparison: ScenarioComparisonSet): string {
  const context = comparison.base.context
  if (context.status === 'available') return 'available'
  if (context.status === 'unavailable') return 'unavailable'
  return 'omitted · not modeled'
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
    bundle: OperationalBundle
    outcome: ScenarioOutcome
    delta: ScenarioDelta | null
  }> = [
    {
      label: 'BASE',
      bundle: comparison.base,
      outcome: baseOutcome,
      delta: null,
    },
    ...alternatives.map((item) => ({
      label: item.label === 'Early start' ? 'EARLY START' : 'BALANCED LOAD',
      bundle: item.bundle,
      outcome: item.outcome,
      delta: item.delta,
    })),
  ]
  const selectedColumn = columns.find((column) => column.bundle.run.id === selectedRunId) ?? columns[0]
  const selectedWhatIf = selectedColumn.bundle.run.provenance.whatIf

  return (
    <section className="scenario-comparison-panel" aria-label="Scenario comparison">
      <div className="scenario-comparison-heading">
        <div>
          <span className="panel-label">Decision comparison</span>
          <strong>{selectedColumn.label}</strong>
        </div>
        {selectedWhatIf ? (
          <div className="what-if-model-note">
            <strong>WHAT_IF · MODEL OUTPUT</strong>
            <span>Deterministic model output under frozen Base assumptions. Not an observed operation or guaranteed prediction.</span>
          </div>
        ) : null}
      </div>

      <div className="scenario-action-strip">
        {columns.map((column) => (
          <div
            key={column.bundle.run.id}
            data-selected={column.bundle.run.id === selectedRunId ? 'true' : undefined}
          >
            <strong>{column.label}</strong>
            <span>{actionLabel(column.bundle)}</span>
            {earlySemanticNote(column.delta) ? <small>{earlySemanticNote(column.delta)}</small> : null}
          </div>
        ))}
      </div>

      <div className="scenario-comparison-table-wrap">
        <table aria-label="Scenario outcome comparison">
          <thead>
            <tr>
              <th>Outcome</th>
              {columns.map((column) => <th key={column.bundle.run.id}>{column.label}</th>)}
            </tr>
          </thead>
          <tbody>
            <tr>
              <th>Packages</th>
              {columns.map((column) => <td key={column.bundle.run.id}>{formatNumber(column.outcome.totalPackages, 0)}</td>)}
            </tr>
            <tr>
              <th>Deliveries</th>
              {columns.map((column) => (
                <td key={column.bundle.run.id}>
                  {column.outcome.completedDeliveries}/{column.outcome.totalDeliveries}
                </td>
              ))}
            </tr>
            <tr>
              <th>Vehicles</th>
              {columns.map((column) => <td key={column.bundle.run.id}>{column.bundle.run.scenario.trucks.length}</td>)}
            </tr>
            <tr>
              <th>Start</th>
              {columns.map((column) => <td key={column.bundle.run.id}>{formatSimulationTime(column.outcome.operationStartMinute)}</td>)}
            </tr>
            <tr>
              <th>Finish</th>
              {columns.map((column) => <td key={column.bundle.run.id}>{formatSimulationTime(column.outcome.operationEndMinute)}</td>)}
            </tr>
            <tr>
              <th>Operation span</th>
              {columns.map((column) => <td key={column.bundle.run.id}>{column.outcome.operationSpanMinutes.toFixed(0)} min</td>)}
            </tr>
            <tr>
              <th>Distance</th>
              {columns.map((column) => <td key={column.bundle.run.id}>{formatNumber(column.outcome.plannedDistanceKm)} km</td>)}
            </tr>
            <tr>
              <th>Fuel est.</th>
              {columns.map((column) => <td key={column.bundle.run.id}>{formatNumber(column.outcome.estimatedFuelUsedL)} L</td>)}
            </tr>
            <tr>
              <th>Mean utilization</th>
              {columns.map((column) => <td key={column.bundle.run.id}>{formatNumber(column.outcome.meanVehicleUtilizationPct)}%</td>)}
            </tr>
            <tr>
              <th>Max utilization</th>
              {columns.map((column) => <td key={column.bundle.run.id}>{formatNumber(column.outcome.maxVehicleUtilizationPct)}%</td>)}
            </tr>
            <tr>
              <th>Package spread</th>
              {columns.map((column) => <td key={column.bundle.run.id}>{formatNumber(column.outcome.packageLoadSpread, 0)}</td>)}
            </tr>
          </tbody>
        </table>
      </div>

      {selectedColumn.delta ? (
        <div className="scenario-delta-summary" aria-label="Selected scenario deltas versus Base">
          <span>Δ finish {formatDelta(selectedColumn.delta.operationEndDeltaMinutes, ' min')}</span>
          <span>Δ span {formatDelta(selectedColumn.delta.operationSpanDeltaMinutes, ' min')}</span>
          <span>Δ distance {formatDelta(selectedColumn.delta.distanceDeltaKm, ' km')}</span>
          <span>Δ fuel {formatDelta(selectedColumn.delta.estimatedFuelDeltaL, ' L')}</span>
          <span>Δ mean util. {formatDelta(selectedColumn.delta.meanUtilizationDeltaPct, ' pp')}</span>
          <span>Δ max util. {formatDelta(selectedColumn.delta.maxUtilizationDeltaPct, ' pp')}</span>
          <span>Δ package spread {formatDelta(selectedColumn.delta.packageLoadSpreadDelta)}</span>
        </div>
      ) : null}

      {selectedWhatIf ? (
        <div className="scenario-audit-grid" aria-label="What-if provenance and frozen assumptions">
          <div><span>Base run ID</span><strong>{selectedWhatIf.baseRunId}</strong></div>
          <div><span>Action-set ID</span><strong>{selectedWhatIf.actionSet.id}</strong></div>
          <div><span>Action-set version</span><strong>{selectedWhatIf.actionSetVersion}</strong></div>
          <div><span>Derivation model</span><strong>{selectedWhatIf.derivationModel}</strong></div>
          <div><span>Base context</span><strong>{baseContextLabel(comparison)}</strong></div>
          <p>
            Frozen Base assumptions: target date and data vintage, destination demand and cargo,
            depot and fleet identities/capacities, operational profile, spatial-demand provenance,
            and Base context state. The selected action changes only its declared operational inputs.
          </p>
        </div>
      ) : null}
    </section>
  )
}
