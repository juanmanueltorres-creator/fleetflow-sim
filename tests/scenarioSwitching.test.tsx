import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { FleetScenario } from '../src/domain/types'
import App from '../src/App'

vi.mock('../src/map/FleetMap', () => ({
  FleetMap: ({ scenario }: { scenario: FleetScenario }) => (
    <div data-testid="fleet-map">{scenario.label}</div>
  ),
}))

const MANIFEST_URL = './data/operational-runs/manifest-v0-6.json'
const RUN_30_URL = './data/operational-runs/generated/cordoba-2026-08-30-v3.json'
const ROUTES_30_URL = './data/operational-runs/generated/cordoba-2026-08-30-v3.routes.geojson'
const LEGACY_ROUTES_URL = './data/coca-coqui-routes.geojson'

const manifest = JSON.parse(
  readFileSync(resolve(process.cwd(), 'public/data/operational-runs/manifest-v0-6.json'), 'utf8'),
)
const run30 = JSON.parse(
  readFileSync(resolve(process.cwd(), 'public/data/operational-runs/generated/cordoba-2026-08-30-v3.json'), 'utf8'),
)
const routes30 = JSON.parse(
  readFileSync(resolve(process.cwd(), 'public/data/operational-runs/generated/cordoba-2026-08-30-v3.routes.geojson'), 'utf8'),
)
const legacyRoutes = JSON.parse(
  readFileSync(resolve(process.cwd(), 'public/data/coca-coqui-routes.geojson'), 'utf8'),
)

function response(payload: unknown): Promise<Response> {
  return Promise.resolve({ ok: true, status: 200, json: async () => payload } as Response)
}

describe('scenario switching', () => {
  beforeEach(() => {
    vi.setSystemTime(new Date('2026-08-30T15:00:00Z'))
  })

  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  it('loads calibrated V0.6 by default and switches scenarios atomically', async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input)
      if (url === MANIFEST_URL) return response(manifest)
      if (url === RUN_30_URL) return response(run30)
      if (url === ROUTES_30_URL) return response(routes30)
      if (url === LEGACY_ROUTES_URL) return response(legacyRoutes)
      return Promise.resolve({ ok: false, status: 404, json: async () => ({}) } as Response)
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<App />)

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(MANIFEST_URL)
      expect(fetchMock).toHaveBeenCalledWith(RUN_30_URL)
      expect(fetchMock).toHaveBeenCalledWith(ROUTES_30_URL)
    })
    expect(await screen.findByTestId('fleet-map')).toHaveTextContent('Córdoba Last-Mile Calibrado')
    expect(screen.getByRole('radio', { name: /Córdoba calibrado/i })).toBeChecked()
    expect(screen.getByRole('navigation', { name: 'Operational dates' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Play simulation' }))
    fireEvent.click(screen.getByRole('radio', { name: /Coca Coqui/i }))

    expect(screen.queryByTestId('fleet-map')).not.toBeInTheDocument()
    expect(screen.queryByRole('navigation', { name: 'Operational dates' })).not.toBeInTheDocument()

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(LEGACY_ROUTES_URL)
    })
    expect(screen.getByText('06:00')).toBeInTheDocument()
    expect(screen.getByText('Paused')).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: /Coca Coqui/i })).toBeChecked()
    expect(await screen.findByTestId('fleet-map')).toHaveTextContent('Coca Coqui — Córdoba Distribution Run')

    fireEvent.click(screen.getByRole('radio', { name: /Córdoba calibrado/i }))

    await waitFor(() => {
      expect(fetchMock.mock.calls.filter(([url]) => String(url) === MANIFEST_URL)).toHaveLength(2)
      expect(fetchMock.mock.calls.filter(([url]) => String(url) === RUN_30_URL)).toHaveLength(2)
      expect(fetchMock.mock.calls.filter(([url]) => String(url) === ROUTES_30_URL)).toHaveLength(2)
    })
    expect(screen.getByRole('radio', { name: /Córdoba calibrado/i })).toBeChecked()
    expect(await screen.findByTestId('fleet-map')).toHaveTextContent('Córdoba Last-Mile Calibrado')
    expect(screen.getByRole('navigation', { name: 'Operational dates' })).toBeInTheDocument()
  })
})