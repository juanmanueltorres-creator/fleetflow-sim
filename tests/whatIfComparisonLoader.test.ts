import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import baseRunJson from '../public/data/operational-runs/generated/cordoba-2026-08-27-v3.json'
import calibrationProfile from '../src/scenario/calibration/amazon-last-mile-v1.json'
import type { FetchLike } from '../src/scenario/operationalRuns/catalog'
import type { OperationalBundle } from '../src/scenario/operationalRuns/bundle'
import {
  deriveBalancedLoad,
  deriveEarlyStart,
} from '../scripts/lib/what-if-derivation.mjs'
import { loadScenarioComparison } from '../src/scenario/whatIf/loader'

const CATALOG_URL = './data/operational-runs/what-if-comparisons.json'
const ISSUED_AT = '2026-08-30T21:05:00-03:00'

function readRoutes() {
  return JSON.parse(readFileSync(resolve(
    'public/data/operational-runs/generated/cordoba-2026-08-27-v3.routes.geojson',
  ), 'utf8'))
}

function baseBundle(): OperationalBundle {
  const run: any = structuredClone(baseRunJson)
  return {
    manifestEntry: {
      id: run.id,
      targetDate: run.targetDate,
      issuedAt: run.issuedAt,
      dataAsOf: run.dataAsOf,
      mode: run.mode,
      scenarioId: run.scenarioId,
      modelVersion: run.modelVersion,
      artifact: `./generated/${run.id}.json`,
      routeArtifact: `./generated/${run.id}.routes.geojson`,
    },
    run,
    routes: readRoutes(),
    context: { status: 'omitted' },
  }
}

async function fakeRoutePreparer({ scenario, metadata }: any) {
  return {
    type: 'FeatureCollection',
    metadata,
    features: scenario.routes.map((route: any, routeIndex: number) => ({
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

function entryFor(run: any) {
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
  }
}

async function comparisonFixture() {
  const base = baseBundle()
  const earlyActionSet = {
    schemaVersion: 1,
    id: `${base.run.id}-early-start-v1`,
    label: 'Early start',
    baseRunId: base.run.id,
    actions: [{ type: 'SHIFT_DEPARTURE', minutes: -60 }],
  }
  const balancedActionSet = {
    schemaVersion: 1,
    id: `${base.run.id}-balanced-load-v1`,
    label: 'Balanced load',
    baseRunId: base.run.id,
    actions: [{ type: 'REBALANCE_STOPS', strategy: 'BALANCE_PACKAGES' }],
  }
  const early = deriveEarlyStart({
    baseRun: base.run,
    baseRoutes: base.routes,
    actionSet: earlyActionSet,
    issuedAt: ISSUED_AT,
  })
  const balanced = await deriveBalancedLoad({
    baseRun: base.run,
    actionSet: balancedActionSet,
    issuedAt: ISSUED_AT,
    profile: calibrationProfile,
    routePreparer: fakeRoutePreparer,
  })
  const definition: any = {
    id: `${base.run.id}-comparison-v1`,
    label: 'Córdoba What-If V0',
    baseRunId: base.run.id,
    alternatives: [
      { label: 'Early start', entry: entryFor(early.run) },
      { label: 'Balanced load', entry: entryFor(balanced.run) },
    ],
  }
  return { base, early, balanced, definition }
}

function jsonResponse(payload: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload,
  } as Response
}

function fetcherFor(fixture: any, overrides: Record<string, unknown> = {}) {
  const responses: Record<string, unknown> = {
    [`./data/operational-runs/generated/${fixture.early.run.id}.json`]: fixture.early.run,
    [`./data/operational-runs/generated/${fixture.early.run.id}.routes.geojson`]: fixture.early.routeCollection,
    [`./data/operational-runs/generated/${fixture.balanced.run.id}.json`]: fixture.balanced.run,
    [`./data/operational-runs/generated/${fixture.balanced.run.id}.routes.geojson`]: fixture.balanced.routeCollection,
    ...overrides,
  }
  const calls: string[] = []
  const fetcher: FetchLike = async (input) => {
    const url = String(input)
    calls.push(url)
    return Object.prototype.hasOwnProperty.call(responses, url)
      ? jsonResponse(responses[url])
      : jsonResponse({}, 404)
  }
  return { fetcher, calls }
}

describe('atomic WHAT_IF comparison loading', () => {
  it('loads Base+A+B atomically, reuses Base and resolves alternatives relative to catalog', async () => {
    const fixture = await comparisonFixture()
    const { fetcher, calls } = fetcherFor(fixture)

    const result = await loadScenarioComparison({
      definition: fixture.definition,
      base: fixture.base,
      catalogUrl: CATALOG_URL,
      fetcher,
    })

    expect(result.base).toBe(fixture.base)
    expect(result.alternatives.map((item) => item.label)).toEqual([
      'Early start',
      'Balanced load',
    ])
    expect(calls).toContain(`./data/operational-runs/generated/${fixture.early.run.id}.json`)
    expect(calls).toContain(`./data/operational-runs/generated/${fixture.balanced.run.id}.routes.geojson`)
    expect(calls).not.toContain(
      `./data/operational-runs/generated/${fixture.base.run.id}.json`,
    )
  })

  it('rejects wrong lineage while leaving the Base object usable', async () => {
    const fixture = await comparisonFixture()
    const wrongEarly = structuredClone(fixture.early.run)
    wrongEarly.provenance.whatIf.baseRunId = 'another-base-run'
    wrongEarly.provenance.whatIf.actionSet.baseRunId = 'another-base-run'
    const { fetcher } = fetcherFor(fixture, {
      [`./data/operational-runs/generated/${fixture.early.run.id}.json`]: wrongEarly,
    })

    await expect(loadScenarioComparison({
      definition: fixture.definition,
      base: fixture.base,
      catalogUrl: CATALOG_URL,
      fetcher,
    })).rejects.toThrow(/base|lineage/i)
    expect(fixture.base.run.id).toBe(baseRunJson.id)
  })

  it('rejects invalid route binding and one failed alternative without partial results', async () => {
    const fixture = await comparisonFixture()
    const wrongRoutes = structuredClone(fixture.balanced.routeCollection)
    wrongRoutes.metadata.runId = 'wrong-run'
    const first = fetcherFor(fixture, {
      [`./data/operational-runs/generated/${fixture.balanced.run.id}.routes.geojson`]: wrongRoutes,
    })
    await expect(loadScenarioComparison({
      definition: fixture.definition,
      base: fixture.base,
      catalogUrl: CATALOG_URL,
      fetcher: first.fetcher,
    })).rejects.toThrow(/route.*runId.*mismatch/i)

    const failedUrl = `./data/operational-runs/generated/${fixture.early.run.id}.json`
    const second = fetcherFor(fixture, { [failedUrl]: undefined })
    const failingFetcher: FetchLike = async (input) => {
      if (String(input) === failedUrl) return jsonResponse({}, 503)
      return second.fetcher(input)
    }
    await expect(loadScenarioComparison({
      definition: fixture.definition,
      base: fixture.base,
      catalogUrl: CATALOG_URL,
      fetcher: failingFetcher,
    })).rejects.toThrow(/fetch failed/i)
  })

  it('rejects target/data/mode mismatches and requires one Early plus one Balanced action', async () => {
    const fixture = await comparisonFixture()

    const wrongDateRun = structuredClone(fixture.early.run)
    wrongDateRun.targetDate = '2026-08-28'
    const wrongDateRoutes = structuredClone(fixture.early.routeCollection)
    wrongDateRoutes.metadata.targetDate = '2026-08-28'
    const wrongDateDefinition = structuredClone(fixture.definition)
    wrongDateDefinition.alternatives[0].entry.targetDate = '2026-08-28'
    const dateFetch = fetcherFor(fixture, {
      [`./data/operational-runs/generated/${fixture.early.run.id}.json`]: wrongDateRun,
      [`./data/operational-runs/generated/${fixture.early.run.id}.routes.geojson`]: wrongDateRoutes,
    })
    await expect(loadScenarioComparison({
      definition: wrongDateDefinition,
      base: fixture.base,
      catalogUrl: CATALOG_URL,
      fetcher: dateFetch.fetcher,
    })).rejects.toThrow(/targetDate|date/i)

    const duplicateEarlyDefinition = structuredClone(fixture.definition)
    duplicateEarlyDefinition.alternatives[1] = structuredClone(
      duplicateEarlyDefinition.alternatives[0],
    )
    const duplicateFetch = fetcherFor(fixture)
    await expect(loadScenarioComparison({
      definition: duplicateEarlyDefinition,
      base: fixture.base,
      catalogUrl: CATALOG_URL,
      fetcher: duplicateFetch.fetcher,
    })).rejects.toThrow(/early|balanced|action/i)
  })
})
