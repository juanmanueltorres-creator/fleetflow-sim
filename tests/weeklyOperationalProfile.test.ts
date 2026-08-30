import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import type { FleetScenario } from '../src/domain/types'
import type { OperationalRun } from '../src/scenario/operationalRuns/types'

const generatorPath = 'scripts/generate-operational-runs.mjs'
const sharedGeneratorPath = 'scripts/lib/calibrated-scenario-generator.mjs'
const profilePath = 'src/scenario/calibration/amazon-last-mile-v1.json'
const routeAssetPath = 'public/data/cordoba-calibrated-routes.geojson'
const geographySeed = 'fleetflow-cordoba-v0.4'
const issuedAt = '2026-08-30T21:00:00-03:00'
const tempDirs: string[] = []

afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

function outputDir(label: string): string {
  const dir = mkdtempSync(join(tmpdir(), `fleetflow-${label}-`))
  tempDirs.push(dir)
  return dir
}

function generateWindow(dir: string): void {
  execFileSync(process.execPath, [
    generatorPath,
    '--profile', profilePath,
    '--routes', routeAssetPath,
    '--from', '2026-08-27',
    '--to', '2026-09-03',
    '--issued-at', issuedAt,
    '--data-as-of', issuedAt,
    '--output-dir', dir,
    '--run-suffix', 'v1',
  ], { stdio: 'pipe' })
}

function readRun(dir: string, targetDate: string): OperationalRun {
  return JSON.parse(
    readFileSync(join(dir, 'generated', `cordoba-${targetDate}-v1.json`), 'utf8'),
  ) as OperationalRun
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

function travelDurations(scenario: FleetScenario): number[] {
  const durations: number[] = []

  for (const route of scenario.routes) {
    let previousMinute = route.departureMinute
    for (const stop of route.stops) {
      durations.push(stop.plannedArrivalMinute - previousMinute)
      previousMinute = stop.plannedDepartureMinute
    }
    durations.push(route.returnMinute - previousMinute)
  }

  return durations
}

describe('weekly operational profile', () => {
  it('makes weekday demand visibly distinct while keeping deterministic daily jitter', () => {
    const dir = outputDir('weekly-demand')
    generateWindow(dir)

    const expectedPackages = new Map([
      ['2026-08-27', 108], // Thursday
      ['2026-08-28', 118], // Friday
      ['2026-08-29', 87],  // Saturday
      ['2026-08-30', 74],  // Sunday
      ['2026-08-31', 116], // Monday
      ['2026-09-01', 108], // Tuesday
      ['2026-09-02', 102], // Wednesday
      ['2026-09-03', 105], // Thursday
    ])

    for (const [targetDate, expected] of expectedPackages) {
      expect(totalPackages(readRun(dir, targetDate)), targetDate).toBe(expected)
    }
  })

  it('can slow travel cadence without changing geography or package allocation', async () => {
    const moduleUrl = pathToFileURL(join(process.cwd(), sharedGeneratorPath)).href
    const { generateCalibratedScenario, loadRouteGeometryIndex } = await import(moduleUrl)
    const profile = JSON.parse(readFileSync(profilePath, 'utf8'))
    const routeGeometryIndex = loadRouteGeometryIndex(routeAssetPath)
    const common = {
      profile,
      routeGeometryIndex,
      operationsSeed: 'fleetflow-weekly-travel-test',
      geographySeed,
      packageTarget: 100,
    }

    const baseline = generateCalibratedScenario({
      ...common,
      travelTimeMultiplier: 1,
    }) as FleetScenario
    const slower = generateCalibratedScenario({
      ...common,
      travelTimeMultiplier: 1.2,
    }) as FleetScenario

    expect(slower.stores.map((store) => store.position)).toEqual(
      baseline.stores.map((store) => store.position),
    )
    expect(
      slower.routes.flatMap((route) => route.stops.map((stop) => stop.cargo)),
    ).toEqual(
      baseline.routes.flatMap((route) => route.stops.map((stop) => stop.cargo)),
    )

    const baselineTravel = travelDurations(baseline)
    const slowerTravel = travelDurations(slower)
    expect(slowerTravel).not.toEqual(baselineTravel)
    expect(slowerTravel.every((minutes, index) => minutes >= baselineTravel[index])).toBe(true)
    expect(slowerTravel.some((minutes, index) => minutes > baselineTravel[index])).toBe(true)
  })
})
