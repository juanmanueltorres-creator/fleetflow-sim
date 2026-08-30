import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type { FleetScenario } from '../src/domain/types'
import {
  routeCollectionToIndex,
  type RouteGeometryCollection,
} from '../src/map/routeAssets'
import { validateOperationalRunManifest } from '../src/scenario/operationalRuns/catalog'
import type {
  OperationalRun,
  OperationalRunManifest,
} from '../src/scenario/operationalRuns/types'
import { validateOperationalRun } from '../src/scenario/operationalRuns/validation'

const manifestPath = 'public/data/operational-runs/manifest.json'
const generatorPath = 'scripts/generate-operational-runs.mjs'
const profilePath = 'src/scenario/calibration/amazon-last-mile-v1.json'
const routeAssetPath = 'public/data/cordoba-calibrated-routes.geojson'
const issuedAt = '2026-08-30T21:00:00-03:00'
const dataAsOf = '2026-08-30T21:00:00-03:00'
const ACTIVE_VINTAGE = 'v2'
const MAX_TRAVEL_SPEED_KMH = 60
const expectedDatesAndModes = [
  ['2026-08-27', 'SIMULATED'],
  ['2026-08-28', 'SIMULATED'],
  ['2026-08-29', 'SIMULATED'],
  ['2026-08-30', 'SIMULATED'],
  ['2026-08-31', 'FORECAST'],
  ['2026-09-01', 'FORECAST'],
  ['2026-09-02', 'FORECAST'],
  ['2026-09-03', 'FORECAST'],
] as const
const publishedV1BlobShas: Record<string, string> = {
  '2026-08-27': '3b9657e0b64671cb79ba2a2e4b66f33c90eb905b',
  '2026-08-28': '0e7f6d35aec7230e9b04104ec96a8aaebd888738',
  '2026-08-29': '40824409c158318198eb91377b5873e39ce2510a',
  '2026-08-30': '4f9823df8b4be585323a3c69cfa1b2bf1b990549',
  '2026-08-31': '644a885ad0314d663340d988524f8f91abcde93f',
  '2026-09-01': '01c8335f4e663c0fcb21de48e37fd2805d9a5ada',
  '2026-09-02': 'e0d14bff4eb672e2c28966771daccc5995ee588e',
  '2026-09-03': '5103c81806267877ee62189e0d5ebf371757cf90',
}
const tempDirs: string[] = []

afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

function readManifest(): OperationalRunManifest {
  return JSON.parse(readFileSync(manifestPath, 'utf8')) as OperationalRunManifest
}

function artifactPath(targetDate: string, vintage = ACTIVE_VINTAGE): string {
  return `public/data/operational-runs/generated/cordoba-${targetDate}-${vintage}.json`
}

function readRun(targetDate: string, vintage = ACTIVE_VINTAGE): OperationalRun {
  return JSON.parse(readFileSync(artifactPath(targetDate, vintage), 'utf8')) as OperationalRun
}

function gitBlobSha(path: string): string {
  const content = readFileSync(path)
  return createHash('sha1')
    .update(`blob ${content.byteLength}\0`)
    .update(content)
    .digest('hex')
}

function totalPackages(run: OperationalRun): number {
  return run.scenario.routes.reduce(
    (routeTotal, route) => routeTotal + route.stops.reduce(
      (stopTotal, stop) => stopTotal + (stop.cargo.kind === 'PARCELS' ? stop.cargo.packageCount : 0),
      0,
    ),
    0,
  )
}

function legSpeedKmh(distanceKm: number, durationMinutes: number): number {
  if (distanceKm === 0) return 0
  if (durationMinutes <= 0) return Number.POSITIVE_INFINITY
  return distanceKm / (durationMinutes / 60)
}

function expectTravelGuard(
  scenario: FleetScenario,
  routeCollection: RouteGeometryCollection,
): void {
  const routeIndex = routeCollectionToIndex(routeCollection, scenario)

  for (const route of scenario.routes) {
    const distances = routeIndex[route.geometryId].properties.waypointDistancesKm
    let previousMinute = route.departureMinute

    route.stops.forEach((stop, stopIndex) => {
      const distanceKm = distances[stopIndex + 1] - distances[stopIndex]
      const durationMinutes = stop.plannedArrivalMinute - previousMinute
      expect(
        legSpeedKmh(distanceKm, durationMinutes),
        `${route.id} leg ${stopIndex + 1}: ${distanceKm.toFixed(2)} km in ${durationMinutes} min`,
      ).toBeLessThanOrEqual(MAX_TRAVEL_SPEED_KMH)
      previousMinute = stop.plannedDepartureMinute
    })

    const returnDistanceKm = distances.at(-1)! - distances.at(-2)!
    const returnDurationMinutes = route.returnMinute - previousMinute
    expect(
      legSpeedKmh(returnDistanceKm, returnDurationMinutes),
      `${route.id} return: ${returnDistanceKm.toFixed(2)} km in ${returnDurationMinutes} min`,
    ).toBeLessThanOrEqual(MAX_TRAVEL_SPEED_KMH)
  }
}

describe('checked-in operational run window', () => {
  it('keeps every previously published v1 artifact byte-for-byte immutable', () => {
    for (const [targetDate] of expectedDatesAndModes) {
      const path = artifactPath(targetDate, 'v1')
      expect(existsSync(path), `${path} must remain published`).toBe(true)
      if (!existsSync(path)) continue
      expect(gitBlobSha(path), `${path} changed after publication`).toBe(publishedV1BlobShas[targetDate])
    }
  })

  it('ships exactly eight valid v2 envelopes with manifest identity', () => {
    expect(existsSync(manifestPath)).toBe(true)
    if (!existsSync(manifestPath)) return

    const manifest = readManifest()
    expect(validateOperationalRunManifest(manifest)).toEqual([])
    expect(manifest.runs.map((entry) => [entry.targetDate, entry.mode])).toEqual(expectedDatesAndModes)

    for (const entry of manifest.runs) {
      expect(entry.id).toBe(`cordoba-${entry.targetDate}-${ACTIVE_VINTAGE}`)
      expect(entry.artifact).toBe(`./generated/cordoba-${entry.targetDate}-${ACTIVE_VINTAGE}.json`)
      expect(existsSync(artifactPath(entry.targetDate))).toBe(true)
      const run = readRun(entry.targetDate)
      expect(validateOperationalRun(run)).toEqual([])
      expect({
        id: run.id,
        targetDate: run.targetDate,
        issuedAt: run.issuedAt,
        dataAsOf: run.dataAsOf,
        mode: run.mode,
        scenarioId: run.scenarioId,
        modelVersion: run.modelVersion,
      }).toEqual({
        id: entry.id,
        targetDate: entry.targetDate,
        issuedAt: entry.issuedAt,
        dataAsOf: entry.dataAsOf,
        mode: entry.mode,
        scenarioId: entry.scenarioId,
        modelVersion: entry.modelVersion,
      })
      expect(run.scenario.trucks).toHaveLength(8)
      expect(run.scenario.stores).toHaveLength(60)
    }
  })

  it('keeps geography fixed while operational values vary by date', () => {
    const runs = expectedDatesAndModes.map(([targetDate]) => readRun(targetDate))
    const baseline = runs[0]
    const baselineStores = baseline.scenario.stores.map(({ id, position }) => ({ id, position }))
    const baselineGeometryIds = baseline.scenario.routes.map((route) => route.geometryId)

    for (const run of runs.slice(1)) {
      expect(run.scenario.stores.map(({ id, position }) => ({ id, position }))).toEqual(baselineStores)
      expect(run.scenario.routes.map((route) => route.geometryId)).toEqual(baselineGeometryIds)
    }

    const operationalSignatures = new Set(
      runs.map((run) => JSON.stringify({
        packages: totalPackages(run),
        returnMinutes: run.scenario.routes.map((route) => route.returnMinute),
      })),
    )
    expect(operationalSignatures.size).toBeGreaterThan(1)
  })

  it('matches every checked-in v2 run to the prepared route asset and 60 km/h guard', () => {
    const routeCollection = JSON.parse(
      readFileSync(routeAssetPath, 'utf8'),
    ) as RouteGeometryCollection

    for (const [targetDate] of expectedDatesAndModes) {
      const run = readRun(targetDate)
      expect(() => routeCollectionToIndex(routeCollection, run.scenario)).not.toThrow()
      expectTravelGuard(run.scenario, routeCollection)
    }
  })

  it('reproduces the 2026-08-31 v2 golden artifact byte-for-byte', () => {
    const outputDir = mkdtempSync(join(tmpdir(), 'fleetflow-operational-golden-'))
    tempDirs.push(outputDir)

    execFileSync(process.execPath, [
      generatorPath,
      '--profile', profilePath,
      '--routes', routeAssetPath,
      '--from', '2026-08-31',
      '--to', '2026-08-31',
      '--issued-at', issuedAt,
      '--data-as-of', dataAsOf,
      '--output-dir', outputDir,
      '--run-suffix', ACTIVE_VINTAGE,
    ], { stdio: 'pipe' })

    const regeneratedPath = join(outputDir, 'generated', `cordoba-2026-08-31-${ACTIVE_VINTAGE}.json`)
    expect(readFileSync(regeneratedPath, 'utf8')).toBe(
      readFileSync(artifactPath('2026-08-31'), 'utf8'),
    )
  })
})
