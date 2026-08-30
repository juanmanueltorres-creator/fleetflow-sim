import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { dailyPackageTarget } from '../scripts/lib/daily-spatial-demand.mjs'
import { generateV06OperationalRuns } from '../scripts/lib/v0-6-operational-run-generator.mjs'
import { validateOperationalRun } from '../src/scenario/operationalRuns/validation'

const profile = JSON.parse(readFileSync('src/scenario/calibration/amazon-last-mile-v1.json', 'utf8'))
const candidatePool = JSON.parse(readFileSync('src/scenario/operationalRuns/candidate-pool-v1.json', 'utf8'))
const fleetTemplate = JSON.parse(readFileSync('src/scenario/generated/cordoba-calibrated-v1.json', 'utf8'))
const weeklyProfiles = JSON.parse(readFileSync('src/scenario/operationalRuns/weekly-profile.json', 'utf8'))

const ISSUED_AT = '2026-08-30T21:00:00-03:00'
const DATA_AS_OF = '2026-08-30T21:00:00-03:00'

function fakeRoutePreparer({ scenario, metadata }: any) {
  const storeById = new Map(scenario.stores.map((store: any) => [store.id, store]))

  return {
    type: 'FeatureCollection',
    metadata: { ...metadata },
    features: scenario.routes.map((route: any) => {
      const waypointIds = [scenario.depot.id, ...route.stops.map((stop: any) => stop.storeId), scenario.depot.id]
      const waypointDistancesKm = waypointIds.map((_: string, index: number) => index * 2)
      const coordinates = [
        scenario.depot.position,
        ...route.stops.map((stop: any) => (storeById.get(stop.storeId) as any).position),
        scenario.depot.position,
      ]

      return {
        type: 'Feature',
        id: route.geometryId,
        properties: {
          truckId: route.truckId,
          distanceKm: waypointDistancesKm.at(-1),
          waypointDistancesKm,
        },
        geometry: { type: 'LineString', coordinates },
      }
    }),
  }
}

function generate(from: string, to = from) {
  return generateV06OperationalRuns({
    profile,
    candidatePool,
    fleetTemplate,
    from,
    to,
    issuedAt: ISSUED_AT,
    dataAsOf: DATA_AS_OF,
    runSuffix: 'v3',
    routePreparer: fakeRoutePreparer,
  })
}

function packagesInRun(run: any) {
  return run.scenario.routes.reduce((total: number, route: any) => total + route.stops.reduce(
    (routeTotal: number, stop: any) => routeTotal + stop.cargo.packageCount,
    0,
  ), 0)
}

describe('V0.6 operational run generator', () => {
  it('builds a schema V2 bundle with bound per-run routes and a valid deterministic operation', () => {
    const generated = generate('2026-08-31')

    expect(generated.manifest.schemaVersion).toBe(2)
    expect(generated.manifest.runs).toHaveLength(1)
    expect(generated.artifacts).toHaveLength(1)

    const artifact = generated.artifacts[0]
    const entry = generated.manifest.runs[0]
    const run = artifact.run
    const routes = artifact.routeCollection

    expect(entry).toMatchObject({
      id: 'cordoba-2026-08-31-v3',
      targetDate: '2026-08-31',
      issuedAt: ISSUED_AT,
      dataAsOf: DATA_AS_OF,
      mode: 'FORECAST',
      scenarioId: 'cordoba-calibrated',
      modelVersion: 'fleetflow-v0.6',
      artifact: './generated/cordoba-2026-08-31-v3.json',
      routeArtifact: './generated/cordoba-2026-08-31-v3.routes.geojson',
    })
    expect(entry).not.toHaveProperty('contextArtifact')

    expect(run.id).toBe(entry.id)
    expect(run.modelVersion).toBe('fleetflow-v0.6')
    expect(validateOperationalRun(run)).toEqual([])
    expect(run.scenario.trucks).toHaveLength(8)
    expect(run.scenario.stores.length).toBeGreaterThanOrEqual(45)
    expect(run.scenario.stores.length).toBeLessThanOrEqual(65)
    expect(new Set(run.scenario.stores.map((store: any) => store.id)).size).toBe(run.scenario.stores.length)
    expect(run.scenario.routes).toHaveLength(8)
    expect(run.scenario.routes.every((route: any) => route.stops.length > 0)).toBe(true)

    const weeklyProfile = weeklyProfiles.find((item: any) => item.day === 1)
    expect(packagesInRun(run)).toBe(dailyPackageTarget('2026-08-31', weeklyProfile.demandMultiplier))

    const assignedIds = run.scenario.routes.flatMap((route: any) => route.stops.map((stop: any) => stop.storeId))
    expect(assignedIds).toHaveLength(run.scenario.stores.length)
    expect(new Set(assignedIds)).toEqual(new Set(run.scenario.stores.map((store: any) => store.id)))

    expect(routes.metadata).toEqual({
      runId: run.id,
      targetDate: run.targetDate,
      modelVersion: run.modelVersion,
    })
    expect(routes.features).toHaveLength(8)
    expect(routes.features.every((feature: any) => feature.geometry.coordinates.length >= 3)).toBe(true)

    expect(run.provenance.spatialDemand).toEqual({
      candidatePoolVersion: 'cordoba-delivery-pool-v1',
      deliveryCount: run.scenario.stores.length,
      gtfsReference: candidatePool.gtfsReference,
      demandSeed: 'fleetflow:v0.6:cordoba:2026-08-31:demand',
      spatialSeed: 'fleetflow:v0.6:cordoba:2026-08-31:spatial',
      operationsSeed: 'fleetflow:v0.6:cordoba:2026-08-31:operations',
      assignmentSeed: 'fleetflow:v0.6:cordoba:2026-08-31:assignment',
    })
  })

  it('is deep-deterministic for identical inputs including route artifacts and manifest', () => {
    expect(generate('2026-08-29', '2026-09-01')).toEqual(generate('2026-08-29', '2026-09-01'))
  })

  it('varies spatial destination sets materially across the publication window', () => {
    const generated = generate('2026-08-27', '2026-09-03')
    expect(generated.artifacts).toHaveLength(8)

    const destinationSets = generated.artifacts.map((artifact: any) =>
      artifact.run.scenario.stores.map((store: any) => store.id).sort().join('|'),
    )
    expect(new Set(destinationSets).size).toBeGreaterThanOrEqual(4)

    for (let index = 1; index < generated.artifacts.length; index += 1) {
      const previous = new Set(generated.artifacts[index - 1].run.scenario.stores.map((store: any) => store.id))
      const current = new Set(generated.artifacts[index].run.scenario.stores.map((store: any) => store.id))
      expect(current).not.toEqual(previous)
    }
  })

  it('fails closed on invalid ranges, timestamps, candidate provenance, or route binding metadata', () => {
    expect(() => generateV06OperationalRuns({
      profile,
      candidatePool,
      fleetTemplate,
      from: '2026-09-03',
      to: '2026-08-27',
      issuedAt: ISSUED_AT,
      dataAsOf: DATA_AS_OF,
      runSuffix: 'v3',
      routePreparer: fakeRoutePreparer,
    })).toThrow(/range|date/i)

    expect(() => generateV06OperationalRuns({
      profile,
      candidatePool: { ...candidatePool, version: '' },
      fleetTemplate,
      from: '2026-08-31',
      to: '2026-08-31',
      issuedAt: ISSUED_AT,
      dataAsOf: DATA_AS_OF,
      runSuffix: 'v3',
      routePreparer: fakeRoutePreparer,
    })).toThrow(/candidate|pool|version/i)

    expect(() => generateV06OperationalRuns({
      profile,
      candidatePool,
      fleetTemplate,
      from: '2026-08-31',
      to: '2026-08-31',
      issuedAt: '2026-08-30T21:00:00',
      dataAsOf: DATA_AS_OF,
      runSuffix: 'v3',
      routePreparer: fakeRoutePreparer,
    })).toThrow(/issued|timestamp|zone/i)

    expect(() => generateV06OperationalRuns({
      profile,
      candidatePool,
      fleetTemplate,
      from: '2026-08-31',
      to: '2026-08-31',
      issuedAt: ISSUED_AT,
      dataAsOf: DATA_AS_OF,
      runSuffix: 'v3',
      routePreparer: ({ scenario, metadata }: any) => ({
        ...fakeRoutePreparer({ scenario, metadata }),
        metadata: { ...metadata, runId: 'wrong-run' },
      }),
    })).toThrow(/route|metadata|binding|run/i)
  })
})
