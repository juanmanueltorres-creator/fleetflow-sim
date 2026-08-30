import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from '../src/App'
import type { FleetScenario } from '../src/domain/types'
import type { RouteGeometryCollection } from '../src/map/routeAssets'
import type {
  OperationalRun,
  OperationalRunManifest,
  OperationalRunManifestV2,
} from '../src/scenario/operationalRuns/types'

vi.mock('../src/map/FleetMap', () => ({
  FleetMap: ({ scenario }: { scenario: FleetScenario }) => (
    <div data-testid="fleet-map">
      return-total:{scenario.routes.reduce((sum, route) => sum + route.returnMinute, 0)}
    </div>
  ),
}))

const MANIFEST_URL = './data/operational-runs/manifest-v0-6.json'
const RUN_30_URL = './data/operational-runs/generated/cordoba-2026-08-30-v3.json'
const ROUTES_30_URL = './data/operational-runs/generated/cordoba-2026-08-30-v3.routes.geojson'
const RUN_31_URL = './data/operational-runs/generated/cordoba-2026-08-31-v3.json'
const ROUTES_31_URL = './data/operational-runs/generated/cordoba-2026-08-31-v3.routes.geojson'
const RUN_04_URL = './data/operational-runs/generated/cordoba-2026-09-04-v-race.json'
const ROUTES_04_URL = './data/operational-runs/generated/cordoba-2026-09-04-v-race.routes.geojson'

const manifest = JSON.parse(
  readFileSync(resolve(process.cwd(), 'public/data/operational-runs/manifest-v0-6.json'), 'utf8'),
) as OperationalRunManifest
const run30 = JSON.parse(
  readFileSync(resolve(process.cwd(), 'public/data/operational-runs/generated/cordoba-2026-08-30-v3.json'), 'utf8'),
) as OperationalRun
const routes30 = JSON.parse(
  readFileSync(resolve(process.cwd(), 'public/data/operational-runs/generated/cordoba-2026-08-30-v3.routes.geojson'), 'utf8'),
) as RouteGeometryCollection
const run31 = JSON.parse(
  readFileSync(resolve(process.cwd(), 'public/data/operational-runs/generated/cordoba-2026-08-31-v3.json'), 'utf8'),
) as OperationalRun
const routes31 = JSON.parse(
  readFileSync(resolve(process.cwd(), 'public/data/operational-runs/generated/cordoba-2026-08-31-v3.routes.geojson'), 'utf8'),
) as RouteGeometryCollection

const run04: OperationalRun = structuredClone(run31)
run04.id = 'cordoba-2026-09-04-v-race'
run04.targetDate = '2026-09-04'
run04.provenance = {
  generator: 'race-test',
  seed: 'race-test:2026-09-04',
  notes: ['Synthetic race fixture.'],
}
run04.scenario.routes[0].returnMinute += 17

const routes04: RouteGeometryCollection = structuredClone(routes31)
routes04.metadata = {
  runId: run04.id,
  targetDate: run04.targetDate,
  modelVersion: run04.modelVersion,
}

const manifestV2 = manifest as OperationalRunManifestV2
const raceManifest: OperationalRunManifestV2 = {
  schemaVersion: 2,
  runs: [
    ...manifestV2.runs,
    {
      id: run04.id,
      targetDate: run04.targetDate,
      issuedAt: run04.issuedAt,
      dataAsOf: run04.dataAsOf,
      mode: run04.mode,
      scenarioId: run04.scenarioId,
      modelVersion: run04.modelVersion,
      artifact: './generated/cordoba-2026-09-04-v-race.json',
      routeArtifact: './generated/cordoba-2026-09-04-v-race.routes.geojson',
    },
  ],
}

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
  it('loads the Córdoba default V0.6 bundle and switches dates atomically', async () => {
    const run31Response = deferred<Response>()
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input)
      if (url === MANIFEST_URL) return Promise.resolve(jsonResponse(manifest))
      if (url === RUN_30_URL) return Promise.resolve(jsonResponse(run30))
      if (url === ROUTES_30_URL) return Promise.resolve(jsonResponse(routes30))
      if (url === RUN_31_URL) return run31Response.promise
      if (url === ROUTES_31_URL) return Promise.resolve(jsonResponse(routes31))
      return Promise.resolve(jsonResponse({}, 404))
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<App />)

    expect(await screen.findByTestId('fleet-map')).toHaveTextContent(`return-total:${returnTotal(run30.scenario)}`)
    expect(fetchMock.mock.calls[0]?.[0]).toBe(MANIFEST_URL)
    expect(fetchMock.mock.calls[1]?.[0]).toBe(RUN_30_URL)
    expect(fetchMock.mock.calls[2]?.[0]).toBe(ROUTES_30_URL)
    expect(screen.getByRole('button', { name: /30 DE AGO DE 2026, SIMULATED/i })).toHaveAttribute('aria-current', 'date')

    fireEvent.click(screen.getByRole('button', { name: 'Play simulation' }))
    fireEvent.click(screen.getByRole('button', { name: /31 DE AGO DE 2026, FORECAST/i }))

    expect(screen.getByTestId('fleet-map')).toHaveTextContent(
      `return-total:${returnTotal(run30.scenario)}`,
    )
    expect(screen.getByText('Running')).toBeInTheDocument()
    expect(screen.getByText('Loading operational run…')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /30 DE AGO DE 2026, SIMULATED/i })).toHaveAttribute('aria-current', 'date')

    run31Response.resolve(jsonResponse(run31))

    await waitFor(() => {
      expect(screen.getByTestId('fleet-map')).toHaveTextContent(
        `return-total:${returnTotal(run31.scenario)}`,
      )
    })
    expect(fetchMock.mock.calls.some(([url]) => String(url) === ROUTES_31_URL)).toBe(true)
    expect(screen.getByText('06:00')).toBeInTheDocument()
    expect(screen.getByText('Paused')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /31 DE AGO DE 2026, FORECAST/i })).toHaveAttribute('aria-current', 'date')
    expect(screen.getByRole('region', { name: 'Resumen de la flota' })).toBeInTheDocument()

    const differingRouteIndex = run31.scenario.routes.findIndex(
      (_, index) => routePackageTotal(run31.scenario, index) !== routePackageTotal(run30.scenario, index),
    )
    expect(differingRouteIndex).toBeGreaterThanOrEqual(0)
    const differingRoute = run31.scenario.routes[differingRouteIndex]
    const truck = run31.scenario.trucks.find((candidate) => candidate.id === differingRoute.truckId)
    expect(truck).toBeDefined()
    const truckCard = screen.getByText(truck?.label ?? '').closest('article')
    expect(truckCard).not.toBeNull()
    const packageCount = routePackageTotal(run31.scenario, differingRouteIndex)
    expect(within(truckCard as HTMLElement).getByText(`${packageCount} ${packageCount === 1 ? 'paquete' : 'paquetes'}`)).toBeInTheDocument()
  })

  it('fails closed when a selected V0.6 bundle is unavailable', async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input)
      if (url === MANIFEST_URL) return Promise.resolve(jsonResponse(manifest))
      if (url === RUN_30_URL) return Promise.resolve(jsonResponse(run30))
      if (url === ROUTES_30_URL) return Promise.resolve(jsonResponse(routes30))
      if (url === RUN_31_URL) return Promise.resolve(jsonResponse({}, 404))
      return Promise.resolve(jsonResponse({}, 404))
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<App />)
    expect(await screen.findByTestId('fleet-map')).toHaveTextContent(
      `return-total:${returnTotal(run30.scenario)}`,
    )

    fireEvent.click(screen.getByRole('button', { name: /31 DE AGO DE 2026, FORECAST/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Operational run unavailable.')
    expect(screen.getByTestId('fleet-map')).toHaveTextContent(
      `return-total:${returnTotal(run30.scenario)}`,
    )
    expect(screen.getByRole('region', { name: 'Resumen de la flota' })).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /30 DE AGO DE 2026, SIMULATED/i }),
    ).toHaveAttribute('aria-current', 'date')

    await waitFor(() => {
      expect(fetchMock.mock.calls.filter(([url]) => String(url) === RUN_31_URL)).toHaveLength(1)
    })
  })

  it('ignores a stale slower V0.6 bundle after a newer date succeeds', async () => {
    const run31Response = deferred<Response>()
    const run04Response = deferred<Response>()

    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input)
      if (url === MANIFEST_URL) return Promise.resolve(jsonResponse(raceManifest))
      if (url === RUN_30_URL) return Promise.resolve(jsonResponse(run30))
      if (url === ROUTES_30_URL) return Promise.resolve(jsonResponse(routes30))
      if (url === RUN_31_URL) return run31Response.promise
      if (url === ROUTES_31_URL) return Promise.resolve(jsonResponse(routes31))
      if (url === RUN_04_URL) return run04Response.promise
      if (url === ROUTES_04_URL) return Promise.resolve(jsonResponse(routes04))
      return Promise.resolve(jsonResponse({}, 404))
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<App />)
    expect(await screen.findByTestId('fleet-map')).toHaveTextContent(
      `return-total:${returnTotal(run30.scenario)}`,
    )

    fireEvent.click(screen.getByRole('button', { name: /31 DE AGO DE 2026, FORECAST/i }))
    fireEvent.click(screen.getByRole('button', { name: /04 DE SEPT DE 2026, FORECAST/i }))

    run04Response.resolve(jsonResponse(run04))
    await waitFor(() => {
      expect(screen.getByTestId('fleet-map')).toHaveTextContent(
        `return-total:${returnTotal(run04.scenario)}`,
      )
    })

    run31Response.resolve(jsonResponse(run31))
    await waitFor(() => {
      expect(screen.getByTestId('fleet-map')).toHaveTextContent(
        `return-total:${returnTotal(run04.scenario)}`,
      )
    })
  })
})
