import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from '../src/App'

vi.mock('../src/map/FleetMap', () => ({
  FleetMap: () => <div data-testid="fleet-map" />,
}))

const manifest = JSON.parse(
  readFileSync(resolve(process.cwd(), 'public/data/operational-runs/manifest.json'), 'utf8'),
)
const run30 = JSON.parse(
  readFileSync(resolve(process.cwd(), 'public/data/operational-runs/generated/cordoba-2026-08-30-v1.json'), 'utf8'),
)
const run31 = JSON.parse(
  readFileSync(resolve(process.cwd(), 'public/data/operational-runs/generated/cordoba-2026-08-31-v1.json'), 'utf8'),
)
const calibratedRoutes = JSON.parse(
  readFileSync(resolve(process.cwd(), 'public/data/cordoba-calibrated-routes.geojson'), 'utf8'),
)

function response(payload: unknown): Promise<Response> {
  return Promise.resolve({ ok: true, status: 200, json: async () => payload } as Response)
}

describe('operational day comparison', () => {
  beforeEach(() => {
    vi.setSystemTime(new Date('2026-08-30T15:00:00Z'))
    vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL) => {
      const url = String(input)
      if (url === './data/operational-runs/manifest.json') return response(manifest)
      if (url === './data/operational-runs/generated/cordoba-2026-08-30-v1.json') return response(run30)
      if (url === './data/operational-runs/generated/cordoba-2026-08-31-v1.json') return response(run31)
      if (url === './data/cordoba-calibrated-routes.geojson') return response(calibratedRoutes)
      return Promise.resolve({ ok: false, status: 404, json: async () => ({}) } as Response)
    }))
  })

  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  it('shows package load and a plain-language explanation that change with the selected day', async () => {
    render(<App />)

    const sundayKpis = await screen.findByRole('region', { name: 'Resumen de la flota' })
    const sundayExplainer = screen.getByRole('region', { name: 'Qué estás viendo' })

    expect(within(sundayKpis).getByText('Paquetes del día')).toBeInTheDocument()
    expect(within(sundayKpis).getByText('74')).toBeInTheDocument()
    expect(sundayExplainer).toHaveTextContent('Domingo · jornada muy liviana')
    expect(sundayExplainer).toHaveTextContent(
      'Hoy hay menos carga para repartir y los recorridos usan un ritmo más fluido que una jornada base.',
    )

    fireEvent.click(screen.getByRole('button', { name: /31 DE AGO DE 2026, FORECAST/i }))

    expect(await screen.findByText('Lunes · jornada exigente')).toBeInTheDocument()
    const mondayKpis = screen.getByRole('region', { name: 'Resumen de la flota' })
    const mondayExplainer = screen.getByRole('region', { name: 'Qué estás viendo' })

    expect(within(mondayKpis).getByText('116')).toBeInTheDocument()
    expect(mondayExplainer).toHaveTextContent('Lunes · jornada exigente')
    expect(mondayExplainer).toHaveTextContent(
      'Hoy entra más carga y los recorridos usan un ritmo algo más lento que una jornada base.',
    )
  })
})
