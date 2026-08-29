import {
  getScenarioDefinition,
  SCENARIO_IDS,
  type ScenarioId,
} from '../scenario/scenarioRegistry'

interface ScenarioSwitcherProps {
  value: ScenarioId
  onChange: (id: ScenarioId) => void
}

export function ScenarioSwitcher({ value, onChange }: ScenarioSwitcherProps) {
  return (
    <fieldset className="scenario-switcher">
      <legend>Escenario</legend>
      <div>
        {SCENARIO_IDS.map((id) => {
          const definition = getScenarioDefinition(id)
          return (
            <label key={id}>
              <input
                type="radio"
                name="fleetflow-scenario"
                value={id}
                checked={value === id}
                onChange={() => onChange(id)}
              />
              <span>{definition.label}</span>
              <small>{definition.badge}</small>
            </label>
          )
        })}
      </div>
    </fieldset>
  )
}
