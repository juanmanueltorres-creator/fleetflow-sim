import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { OperationalDateRail } from '../src/components/OperationalDateRail'
import { formatOperationalDate } from '../src/scenario/operationalRuns/date'
import type { OperationalRunManifestEntry } from '../src/scenario/operationalRuns/types'

afterEach(cleanup)

const now = new Date('2026-08-31T15:00:00Z')

const entries: OperationalRunManifestEntry[] = [
  {
    id: 'cordoba-2026-09-01-v1',
    targetDate: '2026-09-01',
    issuedAt: '2026-08-30T21:00:00-03:00',
    dataAsOf: '2026-08-30T21:00:00-03:00',
    mode: 'FORECAST',
    scenarioId: 'cordoba-calibrated',
    modelVersion: 'fleetflow-v0.5',
    artifact: './generated/cordoba-2026-09-01-v1.json',
  },
  {
    id: 'cordoba-2026-08-30-v1',
    targetDate: '2026-08-30',
    issuedAt: '2026-08-30T21:00:00-03:00',
    dataAsOf: '2026-08-30T21:00:00-03:00',
    mode: 'SIMULATED',
    scenarioId: 'cordoba-calibrated',
    modelVersion: 'fleetflow-v0.5',
    artifact: './generated/cordoba-2026-08-30-v1.json',
  },
  {
    id: 'cordoba-2026-08-31-v1',
    targetDate: '2026-08-31',
    issuedAt: '2026-08-30T21:00:00-03:00',
    dataAsOf: '2026-08-30T21:00:00-03:00',
    mode: 'FORECAST',
    scenarioId: 'cordoba-calibrated',
    modelVersion: 'fleetflow-v0.5',
    artifact: './generated/cordoba-2026-08-31-v1.json',
  },
]

function renderRail(
  onSelect = vi.fn(),
  selectedRunId = 'cordoba-2026-08-31-v1',
) {
  render(
    <OperationalDateRail
      entries={entries}
      selectedRunId={selectedRunId}
      onSelect={onSelect}
      now={now}
    />,
  )
  return onSelect
}

describe('OperationalDateRail', () => {
  it('renders only manifest-backed dates and preserves FORECAST independently from TODAY', () => {
    renderRail()

    const nav = screen.getByRole('navigation', { name: 'Operational dates' })
    const dateButtons = within(nav).getAllByRole('button').filter((button) =>
      button.getAttribute('aria-label')?.includes(', '),
    )

    expect(dateButtons).toHaveLength(3)
    expect(screen.getByText('TODAY')).toBeInTheDocument()

    const selectedMetadata = screen.getByTestId('operational-run-metadata')
    expect(selectedMetadata).toHaveTextContent('FORECAST')
    expect(selectedMetadata).toHaveTextContent(/issued/i)
    expect(document.body.textContent).not.toContain('02 SEP')
  })

  it('keeps TODAY and the immutable evidence mode visible when another date is selected', () => {
    renderRail(vi.fn(), 'cordoba-2026-09-01-v1')

    const todayButton = screen.getByRole('button', {
      name: `${formatOperationalDate('2026-08-31')}, FORECAST`,
    })
    expect(todayButton).toHaveTextContent('TODAY')
    expect(todayButton).toHaveTextContent('FORECAST')

    const selectedMetadata = screen.getByTestId('operational-run-metadata')
    expect(selectedMetadata).toHaveTextContent(formatOperationalDate('2026-09-01'))
    expect(selectedMetadata).toHaveTextContent('FORECAST')
  })

  it('marks the selected date with aria-current=date', () => {
    renderRail()

    const selected = screen.getByRole('button', {
      name: `${formatOperationalDate('2026-08-31')}, FORECAST`,
    })
    expect(selected).toHaveAttribute('aria-current', 'date')

    const previous = screen.getByRole('button', {
      name: `${formatOperationalDate('2026-08-30')}, SIMULATED`,
    })
    expect(previous).not.toHaveAttribute('aria-current')
  })

  it('selects entries by direct click and previous/next controls', () => {
    const onSelect = renderRail()

    fireEvent.click(screen.getByRole('button', {
      name: `${formatOperationalDate('2026-09-01')}, FORECAST`,
    }))
    fireEvent.click(screen.getByRole('button', { name: 'Previous operational date' }))
    fireEvent.click(screen.getByRole('button', { name: 'Next operational date' }))

    expect(onSelect).toHaveBeenNthCalledWith(1, 'cordoba-2026-09-01-v1')
    expect(onSelect).toHaveBeenNthCalledWith(2, 'cordoba-2026-08-30-v1')
    expect(onSelect).toHaveBeenNthCalledWith(3, 'cordoba-2026-09-01-v1')
  })

  it('includes full date and mode in accessible names', () => {
    renderRail()

    expect(screen.getByRole('button', {
      name: `${formatOperationalDate('2026-08-30')}, SIMULATED`,
    })).toBeInTheDocument()
    expect(screen.getByRole('button', {
      name: `${formatOperationalDate('2026-08-31')}, FORECAST`,
    })).toBeInTheDocument()
    expect(screen.getByRole('button', {
      name: `${formatOperationalDate('2026-09-01')}, FORECAST`,
    })).toBeInTheDocument()
  })
})
