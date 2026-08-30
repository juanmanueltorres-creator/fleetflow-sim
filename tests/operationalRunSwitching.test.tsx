import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from '../src/App'
import type { FleetScenario } from '../src/domain/types'
import type { OperationalRun, OperationalRunManifest } from '../src/scenario/operationalRuns/types'

vi.mock('../src/map/FleetMap', () => ({
  FleetMap: ({ scenario }: { scenario: FleetScenario }) => (
    <div data-testid="fleet-map">
      return-total:{scenario.routes.reduce((sum, route) => sum + route.returnMinute, 0)}
    </div>
  ),
}))

const MANIFEST_URL = './data/operational-runs/manifest.json'
const RUN_30_URL = './data/operational-runs/generated/cordoba-2026-08-30-v1.json'
const RUN_31_URL = './data/operational-runs/generated/cordoba-2026-08-31-v1.json'
const ROUTES_URL = './data/cordoba-calibrated-routes.geojson'

const manifest = JSON.parse(
  readFileSync(resolve(process.cwd(), 'public/data/operational-runs/manifest.json'), 'utf8'),
) as OperationalRunManifest
const run30 = JSON.parse(
  readFileSync(resolve(process.cwd(), 'public/data/operational-runs/generated/cordoba-2026-08-30-v1.json'), 'utf8'),
) as OperationalRun
const run31 = JSON.parse(
  readFileSync(resolve(process.cwd(), 'public/data/operational-runs/generated/cordoba-2026-08-31-v1.json'), 'utf8'),
) as OperationalRun
const calibratedRoutes = JSON.parse(
  readFileSync(resolve(process.cwd(), 'public/data/cordoba-calibrated-routes.geojson'), 'utf8'),
)

function jsonResponse(payload: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload,
  } as Response
}

function deferred<T>() {
  let resolvePromise!: (value: T | PromiseLike<T>) => void
  const promise = new Promise<T>((resolveValue) => {
    resolvePromise = resolveValue
  })
  return { promise, resolve: resolvePromise }
}

function routePackageTotal(scenario: FleetScenario, routeIndex: number): number {
  return scenario.routes[routeIndex].stops.reduce(
    (sum, stop) => sum + (stop.cargo.kind === 'PARCELS' ? stop.cargo.packageCount : 0),
    0,
  )
}

function returnTotal(scenario: FleetScenario): number {
  return scenario.routes.reduce((sum, route) => sum + route.returnMinute, 0)
}

beforeEach(() => {
  vi.setSystemTime(new Date('2026-08-30T15:00:00Z'))
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('operational run switching', () => {
  it('loads the Córdoba default run after the manifest and switches dates atomically', async () => {
    const run31Response = deferred<Response>()
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input)
      if (url === MANIFEST_URL) return Promise.resolve(jsonResponse(manifest))
      if (url === RUN_30_URL) return Promise.resolve(jsonResponse(run30))
      if (url === RUN_31_URL) return run31Response.promise
      if (url === ROUTES_URL) return Promise.resolve(jsonResponse(calibratedRoutes))
      return Promise.resolve(jsonResponse({}, 404))
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<App />)

    expect(await screen.findByTestId('fleet-map')).toHaveTextContent(`return-total:${returnTotal(run30.scenario)}`)
    expect(fetchMock.mock.calls[0]?.[0]).toBe(MANIFEST_URL)
    expect(fetchMock.mock.calls[1]?.[0]).toBe(RUN_30_URL)
    expect(screen.getByRole('button', { name: /30 AGO 2026, SIMULATED/i })).toHaveAttribute('aria-current', 'date')

    fireEvent.click(screen.getByRole('button', { name: 'Play simulation' }))
    fireEvent.click(screen.getByRole('button', { name: /31 AGO 2026, FORECAST/i }))

    expect(screen.getByText('06:00')).toBeInTheDocument()
    expect(screen.getByText('Paused')).toBeInTheDocument()
    expect(screen.queryByTestId('fleet-map')).not.toBeInTheDocument()
    expect(screen.getByText('Loading operational run…')).toBeInTheDocument()

    run31Response.resolve(jsonResponse(run31))

    expect(await screen.findByTestId('fleet-map')).toHaveTextContent(`return-total:${returnTotal(run31.scenario)}`)
    expect(screen.getByRole('button', { name: /31 AGO 2026, FORECAST/i })).toHaveAttribute('aria-current', 'date')
    expect(screen.getByRole('region', { name: 'Resumen de la flota' })).toBeInTheDocument()

    const differingRouteIndex = run31.scenario.routes.findIndex(
      (_, index) => routePackageTotal(run31.scenario, index) !== routePackageTotal(run30.scenario, index),
    )
    expect(differingRouteIndex).toBeGreaterThanOrEqual(0)
    const truckLabel = run31.scenario.trucks[differingRouteIndex].label
    const truckCard = screen.getByText(truckLabel).closest('article')
    expect(truckCard).not.toBeNull()
    const packageCount = routePackageTotal(run31.scenario, differingRouteIndex)
    expect(within(truckCard as HTMLElement).getByText(`${packageCount} ${packageCount === 1 ? 'paquete' : 'paquetes'}`)).toBeInTheDocument()
  })

  it('fails closed when a selected run is unavailable', async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input)
      if (url === MANIFEST_URL) return Promise.resolve(jsonResponse(manifest))
      if (url === RUN_30_URL) return Promise.resolve(jsonResponse(run30))
      if (url === RUN_31_URL) return Promise.resolve(jsonResponse({}, 404))
      if (url === ROUTES_URL) return Promise.resolve(jsonResponse(calibratedRoutes))
      return Promise.resolve(jsonResponse({}, 404))
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<App />)
    expect(await screen.findByTestId('fleet-map')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /31 AGO 2026, FORECAST/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Operational run unavailable.')
    expect(screen.queryByTestId('fleet-map')).not.toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Resumen de la flota' })).not.toBeInTheDocument()

    await waitFor(() => {
      expect(fetchMock.mock.calls.filter(([url]) => String(url) === RUN_31_URL)).toHaveLength(1)
    })
  })
})
