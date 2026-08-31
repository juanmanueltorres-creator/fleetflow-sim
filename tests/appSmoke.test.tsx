import { cleanup, render, screen } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from '../src/App'

vi.mock('../src/map/FleetMap', () => ({
  FleetMap: () => <div data-testid="fleet-map" />,
}))

const MANIFEST_URL = './data/operational-runs/manifest-v0-6.json'
const RUN_30_URL = './data/operational-runs/generated/cordoba-2026-08-30-v3.json'
const ROUTES_30_URL = './data/operational-runs/generated/cordoba-2026-08-30-v3.routes.geojson'

const manifest = JSON.parse(
  readFileSync(resolve(process.cwd(), 'public/data/operational-runs/manifest-v0-6.json'), 'utf8'),
)
const run30 = JSON.parse(
  readFileSync(resolve(process.cwd(), 'public/data/operational-runs/generated/cordoba-2026-08-30-v3.json'), 'utf8'),
)
const routes30 = JSON.parse(
  readFileSync(resolve(process.cwd(), 'public/data/operational-runs/generated/cordoba-2026-08-30-v3.routes.geojson'), 'utf8'),
)

function response(payload: unknown): Promise<Response> {
  return Promise.resolve({ ok: true, status: 200, json: async () => payload } as Response)
}

describe('FleetFlow app shell', () => {
  beforeEach(() => {
    vi.setSystemTime(new Date('2026-08-30T15:00:00Z'))
    vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL) => {
      const url = String(input)
      if (url === MANIFEST_URL) return response(manifest)
      if (url === RUN_30_URL) return response(run30)
      if (url === ROUTES_30_URL) return response(routes30)
      return Promise.resolve({ ok: false, status: 404, json: async () => ({}) } as Response)
    }))
  })

  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  it('renders the existing identity, active V0.6 operational default and simulation controls', async () => {
    render(<App />)

    expect(screen.getByRole('heading', { name: 'FleetFlow Sim' })).toBeInTheDocument()
    expect(screen.getByText('Operational timeline simulation · V0.5')).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: /Córdoba calibrado/i })).toBeChecked()
    expect(screen.getByRole('radio', { name: /Coca Coqui/i })).not.toBeChecked()
    expect(screen.getByText('06:00')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Play simulation' })).toBeInTheDocument()

    expect(await screen.findByText('Córdoba Last-Mile Calibrado')).toBeInTheDocument()
    expect(screen.getByRole('navigation', { name: 'Operational dates' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /30 DE AGO DE 2026, SIMULATED/i })).toHaveAttribute('aria-current', 'date')
    expect(await screen.findByText('SIMULATED · ESCENARIO CALIBRADO')).toBeInTheDocument()
    expect(await screen.findByTestId('fleet-map')).toBeInTheDocument()

    const hud = document.querySelector('.simulation-hud')
    expect(hud).not.toBeNull()
    expect(Array.from(hud?.children ?? []).map((child) => child.className)).toEqual([
      'operational-date-rail',
      'simulation-clock',
      'simulation-controls',
    ])

    const kpis = screen.getByRole('region', { name: 'Resumen de la flota' })
    const explainer = screen.getByRole('region', { name: 'Qué estás viendo' })
    const fleet = screen.getByRole('region', { name: 'Estado de la flota' })

    expect(explainer).toHaveTextContent(
      'Acá la base del mapa no cambia: cambian las condiciones de la jornada. Por eso podés ver cómo se reparte el trabajo entre vehículos, cuánto tarda cada circuito y cómo se mueve la flota según la carga de ese día.',
    )
    expect(kpis.compareDocumentPosition(explainer) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(explainer.compareDocumentPosition(fleet) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })
})