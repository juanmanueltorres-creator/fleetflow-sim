import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { FleetScenario } from '../src/domain/types'
import App from '../src/App'

vi.mock('../src/map/FleetMap', () => ({
  FleetMap: ({ scenario }: { scenario: FleetScenario }) => (
    <div data-testid="fleet-map">{scenario.label}</div>
  ),
}))

const calibratedRoutes = JSON.parse(
  readFileSync(resolve(process.cwd(), 'public/data/cordoba-calibrated-routes.geojson'), 'utf8'),
)
const legacyRoutes = JSON.parse(
  readFileSync(resolve(process.cwd(), 'public/data/coca-coqui-routes.geojson'), 'utf8'),
)

function responseFor(url: string) {
  const payload = url.includes('cordoba-calibrated-routes') ? calibratedRoutes : legacyRoutes
  return Promise.resolve({ ok: true, json: async () => payload } as Response)
}

describe('scenario switching', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('loads calibrated by default and switches scenarios atomically', async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL) => responseFor(String(input)))
    vi.stubGlobal('fetch', fetchMock)

    render(<App />)

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith('./data/cordoba-calibrated-routes.geojson')
    })
    expect(await screen.findByTestId('fleet-map')).toHaveTextContent('Córdoba Last-Mile Calibrado')
    expect(screen.getByRole('radio', { name: /Córdoba calibrado/i })).toBeChecked()

    fireEvent.click(screen.getByRole('button', { name: 'Play simulation' }))
    fireEvent.click(screen.getByRole('radio', { name: /Coca Coqui/i }))

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith('./data/coca-coqui-routes.geojson')
    })
    expect(screen.getByText('06:00')).toBeInTheDocument()
    expect(screen.getByText('Paused')).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: /Coca Coqui/i })).toBeChecked()
    expect(await screen.findByTestId('fleet-map')).toHaveTextContent('Coca Coqui — Córdoba Distribution Run')

    fireEvent.click(screen.getByRole('radio', { name: /Córdoba calibrado/i }))

    await waitFor(() => {
      const calibratedCalls = fetchMock.mock.calls.filter(
        ([url]) => String(url) === './data/cordoba-calibrated-routes.geojson',
      )
      expect(calibratedCalls).toHaveLength(2)
    })
    expect(screen.getByRole('radio', { name: /Córdoba calibrado/i })).toBeChecked()
    expect(await screen.findByTestId('fleet-map')).toHaveTextContent('Córdoba Last-Mile Calibrado')
  })
})
