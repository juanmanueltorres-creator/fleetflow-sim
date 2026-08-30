import { describe, expect, it } from 'vitest'
import type { FleetScenario } from '../src/domain/types'
import type {
  RouteGeometryBinding,
  RouteGeometryCollection,
} from '../src/map/routeAssets'
import { getScenarioDefinition } from '../src/scenario/scenarioRegistry'
import { loadOperationalBundle } from '../src/scenario/operationalRuns/bundle'
import type {
  OperationalRun,
  OperationalRunManifestEntryV1,
  OperationalRunManifestEntryV2,
} from '../src/scenario/operationalRuns/types'
import type { FetchLike } from '../src/scenario/operationalRuns/catalog'

function runFixture(modelVersion: string, id: string): OperationalRun {
  return {
    id,
    targetDate: '2026-08-31',
    issuedAt: '2026-08-30T21:00:00-03:00',
    dataAsOf: '2026-08-30T21:00:00-03:00',
    mode: 'FORECAST',
    scenarioId: 'cordoba-calibrated',
    modelVersion,
    provenance: {
      generator: 'bundle-test',
      seed: `bundle-test:${id}`,
      notes: ['Synthetic test run.'],
    },
    scenario: structuredClone(getScenarioDefinition('cordoba-calibrated').scenario),
  }
}

function v1Entry(run: OperationalRun): OperationalRunManifestEntryV1 {
  return {
    id: run.id,
    targetDate: run.targetDate,
    issuedAt: run.issuedAt,
    dataAsOf: run.dataAsOf,
    mode: run.mode,
    scenarioId: run.scenarioId,
    modelVersion: run.modelVersion,
    artifact: `./generated/${run.id}.json`,
  }
}

function v2Entry(run: OperationalRun, withContext = false): OperationalRunManifestEntryV2 {
  return {
    id: run.id,
    targetDate: run.targetDate,
    issuedAt: run.issuedAt,
    dataAsOf: run.dataAsOf,
    mode: run.mode,
    scenarioId: run.scenarioId,
    modelVersion: run.modelVersion,
    artifact: `./generated/${run.id}.json`,
    routeArtifact: `./generated/${run.id}.routes.geojson`,
    ...(withContext ? { contextArtifact: `./generated/${run.id}.context.json` } : {}),
  }
}

function routesFor(
  scenario: FleetScenario,
  metadata?: RouteGeometryBinding,
): RouteGeometryCollection {
  return {
    type: 'FeatureCollection',
    ...(metadata ? { metadata } : {}),
    features: scenario.routes.map((route, routeIndex) => ({
      type: 'Feature',
      id: route.geometryId,
      properties: {
        truckId: route.truckId,
        waypointDistancesKm: Array.from(
          { length: route.stops.length + 2 },
          (_, index) => index,
        ),
      },
      geometry: {
        type: 'LineString',
        coordinates: [
          [-64.1888 - routeIndex * 0.0001, -31.4201],
          [-64.1788 - routeIndex * 0.0001, -31.4101],
        ],
      },
    })),
  }
}

function jsonResponse(payload: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload,
  } as Response
}

function fetchMap(responses: Record<string, unknown>): FetchLike {
  return async (input) => {
    const url = String(input)
    return Object.prototype.hasOwnProperty.call(responses, url)
      ? jsonResponse(responses[url])
      : jsonResponse({}, 404)
  }
}

describe('operational bundle loading', () => {
  it('loads V1 with the supplied legacy route asset', async () => {
    const run = runFixture('fleetflow-v0.5', 'cordoba-2026-08-31-v2')
    const routes = routesFor(run.scenario)
    const bundle = await loadOperationalBundle({
      entry: v1Entry(run),
      manifestUrl: './data/operational-runs/manifest.json',
      legacyRouteAsset: './data/cordoba-calibrated-routes.geojson',
      fetcher: fetchMap({
        './data/operational-runs/generated/cordoba-2026-08-31-v2.json': run,
        './data/cordoba-calibrated-routes.geojson': routes,
      }),
    })

    expect(bundle.run).toEqual(run)
    expect(bundle.routes).toEqual(routes)
    expect(bundle.context).toEqual({ status: 'omitted' })
  })

  it('loads V2 with matching per-run routes', async () => {
    const run = runFixture('fleetflow-v0.6', 'cordoba-2026-08-31-v3')
    const routes = routesFor(run.scenario, {
      runId: run.id,
      targetDate: run.targetDate,
      modelVersion: run.modelVersion,
    })

    await expect(loadOperationalBundle({
      entry: v2Entry(run),
      manifestUrl: './data/operational-runs/manifest.json',
      fetcher: fetchMap({
        './data/operational-runs/generated/cordoba-2026-08-31-v3.json': run,
        './data/operational-runs/generated/cordoba-2026-08-31-v3.routes.geojson': routes,
      }),
    })).resolves.toMatchObject({ run, routes, context: { status: 'omitted' } })
  })

  it('rejects V2 routes bound to another run', async () => {
    const run = runFixture('fleetflow-v0.6', 'cordoba-2026-08-31-v3')
    const routes = routesFor(run.scenario, {
      runId: 'cordoba-2026-08-30-v3',
      targetDate: run.targetDate,
      modelVersion: run.modelVersion,
    })

    await expect(loadOperationalBundle({
      entry: v2Entry(run),
      manifestUrl: './data/operational-runs/manifest.json',
      fetcher: fetchMap({
        './data/operational-runs/generated/cordoba-2026-08-31-v3.json': run,
        './data/operational-runs/generated/cordoba-2026-08-31-v3.routes.geojson': routes,
      }),
    })).rejects.toThrow(/route.*runId.*mismatch/i)
  })

  it('degrades unavailable optional context without rejecting the operation', async () => {
    const run = runFixture('fleetflow-v0.6', 'cordoba-2026-08-31-v3')
    const routes = routesFor(run.scenario, {
      runId: run.id,
      targetDate: run.targetDate,
      modelVersion: run.modelVersion,
    })

    const bundle = await loadOperationalBundle({
      entry: v2Entry(run, true),
      manifestUrl: './data/operational-runs/manifest.json',
      fetcher: fetchMap({
        './data/operational-runs/generated/cordoba-2026-08-31-v3.json': run,
        './data/operational-runs/generated/cordoba-2026-08-31-v3.routes.geojson': routes,
      }),
    })

    expect(bundle.context.status).toBe('unavailable')
    expect(bundle.run).toEqual(run)
    expect(bundle.routes).toEqual(routes)
  })

  it('degrades mismatched optional context without rejecting the operation', async () => {
    const run = runFixture('fleetflow-v0.6', 'cordoba-2026-08-31-v3')
    const routes = routesFor(run.scenario, {
      runId: run.id,
      targetDate: run.targetDate,
      modelVersion: run.modelVersion,
    })

    const bundle = await loadOperationalBundle({
      entry: v2Entry(run, true),
      manifestUrl: './data/operational-runs/manifest.json',
      fetcher: fetchMap({
        './data/operational-runs/generated/cordoba-2026-08-31-v3.json': run,
        './data/operational-runs/generated/cordoba-2026-08-31-v3.routes.geojson': routes,
        './data/operational-runs/generated/cordoba-2026-08-31-v3.context.json': {
          runId: 'cordoba-2026-08-30-v3',
          targetDate: run.targetDate,
          modelVersion: run.modelVersion,
        },
      }),
    })

    expect(bundle.context.status).toBe('unavailable')
    expect(bundle.run).toEqual(run)
  })
})
