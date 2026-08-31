interface ScenarioDecisionOption {
  id: string
  label: 'BASE' | 'EARLY START' | 'BALANCED LOAD'
}

interface ScenarioDecisionRailProps {
  options: ScenarioDecisionOption[]
  selectedId: string
  onSelect: (id: string) => void
}

export function ScenarioDecisionRail({
  options,
  selectedId,
  onSelect,
}: ScenarioDecisionRailProps) {
  return (
    <nav className="scenario-decision-rail" aria-label="Scenario decisions">
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          aria-pressed={option.id === selectedId}
          onClick={() => onSelect(option.id)}
        >
          {option.label}
        </button>
      ))}
    </nav>
  )
}
