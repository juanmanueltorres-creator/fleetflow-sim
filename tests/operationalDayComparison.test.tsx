import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from '../src/App'
import type { FleetScenario } from '../src/domain/types'

vi.mock('../src/map/FleetMap', () => ({
  FleetMap: () => <div data-testid="fleet-map" />,
}))

const MANIFEST_URL = './data/operational-runs/manifest-v0-6.json'
const RUN_30_URL = './data/operational-runs/generated/cordoba-2026-08-30-v3.json'
const ROUTES_30_URL = './data/operational-runs/generated/cordoba-2026-08-30-v3.routes.geojson'
const RUN_31_URL = './data/operational-runs/generated/cordoba-2026-08-31-v3.json'
const ROUTES_31_URL = './data/operational-runs/generated/cordoba-2026-08-31-v3.routes.geojson'

const manifest = JSON.parse(
  readFileSync(resolve(process.cwd(), 'public/data/operational-runs/manifest-v0-6.json'), 'utf8'),
)
const run30 = JSON.parse(
  readFileSync(resolve(process.cwd(), 'public/data/operational-runs/generated/cordoba-2026-08-30-v3.json'), 'utf8'),
)
const routes30 = JSON.parse(
  readFileSync(resolve(process.cwd(), 'public/data/operational-runs/generated/cordoba-2026-08-30-v3.routes.geojson'), 'utf8'),
)
const run31 = JSON.parse(
  readFileSync(resolve(process.cwd(), 'public/data/operational-runs/generated/cordoba-2026-08-31-v3.json'), 'utf8'),
)
const routes31 = JSON.parse(
  readFileSync(resolve(process.cwd(), 'public/data/operational-runs/generated/cordoba-2026-08-31-v3.routes.geojson'), 'utf8'),
)

const run30WithFrozenProfile = structuredClone(run30)
run30WithFrozenProfile.provenance.operationalProfile = {
  day: 0,
  dayLabel: 'Domingo',
  intensityLabel: 'vintage congelado',
  demandMultiplier: 0.72,
  travelTimeMultiplier: 0.9,
  summary: 'Resumen congelado en el artefacto seleccionado.',
}

function packageTotal(scenario: FleetScenario): number {
  return scenario.routes.reduce(
    (routeTotal, route) => routeTotal + route.stops.reduce(
      (stopTotal, stop) => stopTotal + (stop.cargo.kind === 'PARCELS' ? stop.cargo.packageCount : 0),
      0,
    ),
    0,
  )
}

function response(payload: unknown): Promise<Response> {
  return Promise.resolve({ ok: true, status: 200, json: async () => payload } as Response)
}

describe('operational day comparison', () => {
  beforeEach(() => {
    vi.setSystemTime(new Date('2026-08-30T15:00:00Z'))
    vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL) => {
      const url = String(input)
      if (url === MANIFEST_URL) return response(manifest)
      if (url === RUN_30_URL) return response(run30WithFrozenProfile)
      if (url === ROUTES_30_URL) return response(routes30)
      if (url === RUN_31_URL) return response(run31)
      if (url === ROUTES_31_URL) return response(routes31)
      return Promise.resolve({ ok: false, status: 404, json: async () => ({}) } as Response)
    }))
  })

  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  it('shows package load and explainer copy from the selected immutable run vintage', async () => {
    render(<App />)

    const sundayKpis = await screen.findByRole('region', { name: 'Resumen de la flota' })
    const sundayExplainer = screen.getByRole('region', { name: 'Qué estás viendo' })

    expect(within(sundayKpis).getByText('Paquetes del día')).toBeInTheDocument()
    expect(within(sundayKpis).getByText(String(packageTotal(run30WithFrozenProfile.scenario)))).toBeInTheDocument()
    expect(sundayExplainer).toHaveTextContent('Domingo · vintage congelado')
    expect(sundayExplainer).toHaveTextContent('Resumen congelado en el artefacto seleccionado.')

    fireEvent.click(screen.getByRole('button', { name: /31 DE AGO DE 2026, FORECAST/i }))

    expect(await screen.findByText('Lunes · jornada exigente')).toBeInTheDocument()
    const mondayKpis = screen.getByRole('region', { name: 'Resumen de la flota' })
    const mondayExplainer = screen.getByRole('region', { name: 'Qué estás viendo' })

    expect(within(mondayKpis).getByText(String(packageTotal(run31.scenario)))).toBeInTheDocument()
    expect(mondayExplainer).toHaveTextContent('Lunes · jornada exigente')
    expect(mondayExplainer).toHaveTextContent(
      'Hoy entra más carga y los recorridos usan un ritmo algo más lento que una jornada base.',
    )
  })
})
