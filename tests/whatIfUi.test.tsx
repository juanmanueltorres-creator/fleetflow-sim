import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from '../src/App'
import type { FleetScenario } from '../src/domain/types'
import type { RouteGeometryCollection } from '../src/map/routeAssets'
import { formatOperationalDate } from '../src/scenario/operationalRuns/date'
import type { OperationalRun, OperationalRunManifestV2 } from '../src/scenario/operationalRuns/types'
import type { WhatIfComparisonCatalog } from '../src/scenario/whatIf/types'

vi.mock('../src/map/FleetMap', () => ({
  FleetMap: ({ scenario, routes }: { scenario: FleetScenario; routes: RouteGeometryCollection }) => (
    <div data-testid="fleet-map">
      start:{Math.min(...scenario.routes.map((route) => route.departureMinute))}
      {'|'}first:{scenario.routes[0]?.stops[0]?.storeId ?? 'none'}
      {'|'}geometry:{String(routes.features[0]?.id ?? 'none')}
    </div>
  ),
}))

const ROOT = resolve(process.cwd(), 'public/data/operational-runs')
const MANIFEST_URL = './data/operational-runs/manifest-v0-6.json'
const CATALOG_URL = './data/operational-runs/what-if-comparisons.json'
const manifest = JSON.parse(readFileSync(resolve(ROOT, 'manifest-v0-6.json'), 'utf8')) as OperationalRunManifestV2
const catalog = JSON.parse(readFileSync(resolve(ROOT, 'what-if-comparisons.json'), 'utf8')) as WhatIfComparisonCatalog
const definition = catalog.comparisons[0]
const baseEntry = manifest.runs.find((entry) => entry.id === definition.baseRunId)!
const earlyEntry = definition.alternatives.find((alternative) => alternative.label === 'Early start')!.entry
const balancedEntry = definition.alternatives.find((alternative) => alternative.label === 'Balanced load')!.entry

function readJson(relativePath: string): any {
  return JSON.parse(readFileSync(resolve(ROOT, relativePath.replace(/^\.\//, '')), 'utf8'))
}

const baseRun = readJson(baseEntry.artifact) as OperationalRun
const baseRoutes = readJson(baseEntry.routeArtifact) as RouteGeometryCollection
const earlyRun = readJson(earlyEntry.artifact) as OperationalRun
const earlyRoutes = readJson(earlyEntry.routeArtifact) as RouteGeometryCollection
const balancedRun = readJson(balancedEntry.artifact) as OperationalRun
const balancedRoutes = readJson(balancedEntry.routeArtifact) as RouteGeometryCollection
const nextEntry = manifest.runs.find((entry) => entry.targetDate > baseRun.targetDate)!
const nextRun = readJson(nextEntry.artifact) as OperationalRun
const nextRoutes = readJson(nextEntry.routeArtifact) as RouteGeometryCollection

function resolveArtifactUrl(artifact: string): string {
  return `./data/operational-runs/${artifact.replace(/^\.\//, '')}`
}

function jsonResponse(payload: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload,
  } as Response
}

function makeFetch(options?: { brokenAlternative?: boolean; brokenCatalog?: boolean }) {
  return vi.fn((input: RequestInfo | URL) => {
    const url = String(input)
    if (url === MANIFEST_URL) return Promise.resolve(jsonResponse(manifest))
    if (url === CATALOG_URL) {
      return Promise.resolve(options?.brokenCatalog ? jsonResponse({}, 503) : jsonResponse(catalog))
    }
    if (url === resolveArtifactUrl(baseEntry.artifact)) return Promise.resolve(jsonResponse(baseRun))
    if (url === resolveArtifactUrl(baseEntry.routeArtifact)) return Promise.resolve(jsonResponse(baseRoutes))
    if (url === resolveArtifactUrl(earlyEntry.artifact)) {
      return Promise.resolve(options?.brokenAlternative ? jsonResponse({}, 503) : jsonResponse(earlyRun))
    }
    if (url === resolveArtifactUrl(earlyEntry.routeArtifact)) return Promise.resolve(jsonResponse(earlyRoutes))
    if (url === resolveArtifactUrl(balancedEntry.artifact)) return Promise.resolve(jsonResponse(balancedRun))
    if (url === resolveArtifactUrl(balancedEntry.routeArtifact)) return Promise.resolve(jsonResponse(balancedRoutes))
    if (url === resolveArtifactUrl(nextEntry.artifact)) return Promise.resolve(jsonResponse(nextRun))
    if (url === resolveArtifactUrl(nextEntry.routeArtifact)) return Promise.resolve(jsonResponse(nextRoutes))
    return Promise.resolve(jsonResponse({}, 404))
  })
}

function mapSignature(run: OperationalRun, routes: RouteGeometryCollection): string {
  return `start:${Math.min(...run.scenario.routes.map((route) => route.departureMinute))}|first:${run.scenario.routes[0]?.stops[0]?.storeId ?? 'none'}|geometry:${String(routes.features[0]?.id ?? 'none')}`
}

beforeEach(() => {
  vi.setSystemTime(new Date(`${baseRun.targetDate}T15:00:00Z`))
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('TIME → DECISION what-if UX', () => {
  it('loads alternatives lazily, switches one map, and resets comparison on TIME change', async () => {
    const fetchMock = makeFetch()
    vi.stubGlobal('fetch', fetchMock)

    render(<App />)

    expect(await screen.findByTestId('fleet-map')).toHaveTextContent(mapSignature(baseRun, baseRoutes))
    expect(await screen.findByRole('button', { name: 'Compare scenarios' })).toBeInTheDocument()
    expect(fetchMock.mock.calls.some(([url]) => String(url) === CATALOG_URL)).toBe(true)
    expect(fetchMock.mock.calls.some(([url]) => String(url) === resolveArtifactUrl(earlyEntry.artifact))).toBe(false)
    expect(fetchMock.mock.calls.some(([url]) => String(url) === resolveArtifactUrl(balancedEntry.artifact))).toBe(false)

    fireEvent.click(screen.getByRole('button', { name: 'Compare scenarios' }))

    expect(await screen.findByRole('button', { name: 'EARLY START' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'BASE' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'BALANCED LOAD' })).toBeInTheDocument()
    expect(fetchMock.mock.calls.some(([url]) => String(url) === resolveArtifactUrl(earlyEntry.artifact))).toBe(true)
    expect(fetchMock.mock.calls.some(([url]) => String(url) === resolveArtifactUrl(balancedEntry.artifact))).toBe(true)
    expect(screen.getByRole('table', { name: 'Scenario outcome comparison' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'EARLY START' }))
    await waitFor(() => expect(screen.getByTestId('fleet-map')).toHaveTextContent(mapSignature(earlyRun, earlyRoutes)))
    expect(screen.getByText('05:00')).toBeInTheDocument()
    expect(screen.getByText('WHAT_IF · MODEL OUTPUT')).toBeInTheDocument()
    expect(screen.getByText('SHIFT_DEPARTURE -60 min')).toBeInTheDocument()
    expect(screen.getByText(/finishes 60 min earlier/i)).toBeInTheDocument()
    expect(screen.queryByText(/60 min faster/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/the map base does not change/i)).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'BALANCED LOAD' }))
    await waitFor(() => expect(screen.getByTestId('fleet-map')).toHaveTextContent(mapSignature(balancedRun, balancedRoutes)))
    expect(screen.getByRole('table', { name: 'Scenario outcome comparison' })).toBeInTheDocument()
    expect(screen.getByText('REBALANCE_STOPS · BALANCE_PACKAGES')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', {
      name: `${formatOperationalDate(nextEntry.targetDate)}, ${nextEntry.mode}`,
    }))
    await waitFor(() => expect(screen.getByTestId('fleet-map')).toHaveTextContent(mapSignature(nextRun, nextRoutes)))
    expect(screen.queryByRole('table', { name: 'Scenario outcome comparison' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'EARLY START' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Compare scenarios' })).not.toBeInTheDocument()
  })

  it('keeps the Base usable when one alternative fails', async () => {
    const fetchMock = makeFetch({ brokenAlternative: true })
    vi.stubGlobal('fetch', fetchMock)

    render(<App />)
    expect(await screen.findByTestId('fleet-map')).toHaveTextContent(mapSignature(baseRun, baseRoutes))
    fireEvent.click(await screen.findByRole('button', { name: 'Compare scenarios' }))

    expect(await screen.findByText('Scenario comparison unavailable')).toBeInTheDocument()
    expect(screen.getByTestId('fleet-map')).toHaveTextContent(mapSignature(baseRun, baseRoutes))
    expect(screen.queryByText('Operational run unavailable.')).not.toBeInTheDocument()
  })

  it('keeps the Base usable when comparison catalog discovery fails', async () => {
    const fetchMock = makeFetch({ brokenCatalog: true })
    vi.stubGlobal('fetch', fetchMock)

    render(<App />)
    expect(await screen.findByTestId('fleet-map')).toHaveTextContent(mapSignature(baseRun, baseRoutes))
    await waitFor(() => expect(fetchMock.mock.calls.some(([url]) => String(url) === CATALOG_URL)).toBe(true))
    expect(screen.queryByRole('button', { name: 'Compare scenarios' })).not.toBeInTheDocument()
    expect(screen.queryByText('Operational run unavailable.')).not.toBeInTheDocument()
  })
})
