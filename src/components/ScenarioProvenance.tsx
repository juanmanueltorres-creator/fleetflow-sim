import './ScenarioProvenance.css'
import type { OperationalRunMode } from '../scenario/operationalRuns/types'
import type { ScenarioProvenance as ScenarioProvenanceValue } from '../scenario/scenarioRegistry'

interface ScenarioProvenanceProps {
  provenance: ScenarioProvenanceValue
  runMode?: OperationalRunMode
}

export function ScenarioProvenance({ provenance, runMode }: ScenarioProvenanceProps) {
  const heading = runMode ? `${runMode} · ${provenance.shortLabel}` : provenance.shortLabel
  const runSummary = runMode === 'FORECAST'
    ? 'Operación sintética reproducible derivada de distribuciones públicas de última milla. No representa demanda ni telemetría real de Córdoba.'
    : runMode === 'SIMULATED'
      ? 'Jornada sintética reproducible. No representa una operación real observada.'
      : null

  return (
    <section className="scenario-provenance" aria-label="Procedencia del escenario">
      <strong>{heading}</strong>
      {runSummary ? <span className="scenario-provenance-run-summary">{runSummary}</span> : null}
      <span>{provenance.summary}</span>

      <details>
        <summary>Fuente y método</summary>
        <div className="scenario-provenance-details">
          {provenance.sourceName ? <p>Fuente: {provenance.sourceName}</p> : null}
          {provenance.sourceLicense ? <p>Licencia fuente: {provenance.sourceLicense}</p> : null}
          {provenance.sourceUrl ? (
            <a href={provenance.sourceUrl} target="_blank" rel="noreferrer">
              Ver fuente oficial
            </a>
          ) : null}
          {provenance.methodVersion ? <p>Método: perfil de calibración v{provenance.methodVersion}</p> : null}
          <p>Sintético/adaptado: {provenance.syntheticElements.join(' · ')}</p>
          <p>Limitaciones: {provenance.limitations.join(' · ')}</p>
        </div>
      </details>
    </section>
  )
}
