import './ScenarioProvenance.css'
import type { ScenarioProvenance as ScenarioProvenanceValue } from '../scenario/scenarioRegistry'

interface ScenarioProvenanceProps {
  provenance: ScenarioProvenanceValue
}

export function ScenarioProvenance({ provenance }: ScenarioProvenanceProps) {
  return (
    <section className="scenario-provenance" aria-label="Procedencia del escenario">
      <strong>{provenance.shortLabel}</strong>
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
