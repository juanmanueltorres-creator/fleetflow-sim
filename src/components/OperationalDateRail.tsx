import './OperationalDateRail.css'
import {
  formatIssuedAt,
  formatOperationalDate,
  getCordobaOperationalDate,
} from '../scenario/operationalRuns/date'
import type { OperationalRunManifestEntry } from '../scenario/operationalRuns/types'

interface OperationalDateRailProps {
  entries: OperationalRunManifestEntry[]
  selectedRunId: string
  onSelect: (runId: string) => void
  now?: Date
}

function shortDateLabel(targetDate: string): string {
  return formatOperationalDate(targetDate).replace(/\s+\d{4}$/, '')
}

export function OperationalDateRail({
  entries,
  selectedRunId,
  onSelect,
  now = new Date(),
}: OperationalDateRailProps) {
  const sortedEntries = entries
    .slice()
    .sort((a, b) => a.targetDate.localeCompare(b.targetDate) || a.id.localeCompare(b.id))
  const selectedIndex = sortedEntries.findIndex((entry) => entry.id === selectedRunId)
  const selectedEntry = selectedIndex >= 0 ? sortedEntries[selectedIndex] : null
  const today = getCordobaOperationalDate(now)
  const previousEntry = selectedIndex > 0 ? sortedEntries[selectedIndex - 1] : null
  const nextEntry = selectedIndex >= 0 && selectedIndex < sortedEntries.length - 1
    ? sortedEntries[selectedIndex + 1]
    : null

  return (
    <nav className="operational-date-rail" aria-label="Operational dates">
      <div className="operational-date-rail-track">
        <button
          className="operational-date-rail-nav"
          type="button"
          aria-label="Previous operational date"
          disabled={!previousEntry}
          onClick={() => previousEntry && onSelect(previousEntry.id)}
        >
          ‹
        </button>

        <div className="operational-date-rail-scroll">
          {sortedEntries.map((entry) => (
            <button
              className="operational-date-rail-entry"
              key={entry.id}
              type="button"
              aria-current={entry.id === selectedRunId ? 'date' : undefined}
              aria-label={`${formatOperationalDate(entry.targetDate)}, ${entry.mode}`}
              onClick={() => onSelect(entry.id)}
            >
              <strong>{shortDateLabel(entry.targetDate)}</strong>
              <span>{entry.targetDate === today ? 'TODAY' : entry.mode}</span>
            </button>
          ))}
        </div>

        <button
          className="operational-date-rail-nav"
          type="button"
          aria-label="Next operational date"
          disabled={!nextEntry}
          onClick={() => nextEntry && onSelect(nextEntry.id)}
        >
          ›
        </button>
      </div>

      {selectedEntry ? (
        <div className="operational-run-metadata" data-testid="operational-run-metadata">
          <span>{formatOperationalDate(selectedEntry.targetDate)}</span>
          <strong>{selectedEntry.mode}</strong>
          <span>issued {formatIssuedAt(selectedEntry.issuedAt)}</span>
        </div>
      ) : null}
    </nav>
  )
}
