import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { validateScenario } from '../src/domain/scenarioValidation'
import type { FleetScenario } from '../src/domain/types'
import { routeCollectionToIndex, type RouteGeometryCollection } from '../src/map/routeAssets'

const generatorPath = 'scripts/generate-calibrated-scenario.mjs'
const sharedGeneratorPath = 'scripts/lib/calibrated-scenario-generator.mjs'
const profilePath = 'src/scenario/calibration/amazon-last-mile-v1.json'
const checkedInPath = 'src/scenario/generated/cordoba-calibrated-v1.json'
const routeAssetPath = 'public/data/cordoba-calibrated-routes.geojson'
const canonicalSeed = 'fleetflow-cordoba-v0.4'
const MAX_TRAVEL_SPEED_KMH = 60
const tempDirs: string[] = []

afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

function totalPackages(scenario: FleetScenario): number {
  return scenario.routes.reduce(
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

function runGenerator(profile: string, output: string): void {
  execFileSync(process.execPath, [
    generatorPath,
    '--profile', profile,
    '--routes', routeAssetPath,
    '--output', output,
    '--seed', canonicalSeed,
  ])
}

describe('calibrated Cordoba scenario generator', () => {
  it('ships the canonical 8-vehicle, 60-stop, 100-package scenario', () => {
    expect(existsSync(generatorPath)).toBe(true)
    expect(existsSync(checkedInPath)).toBe(true)
    if (!existsSync(generatorPath) || !existsSync(checkedInPath)) return

    const scenario = JSON.parse(readFileSync(checkedInPath, 'utf8')) as FleetScenario

    expect(scenario.trucks).toHaveLength(8)
    expect(scenario.stores).toHaveLength(60)
    expect(scenario.routes).toHaveLength(8)
    expect(scenario.routes.reduce((count, route) => count + route.stops.length, 0)).toBe(60)
    expect(totalPackages(scenario)).toBe(100)
    expect(scenario.trucks.every((truck) => truck.capacity.kind === 'PARCELS')).toBe(true)
    expect(scenario.routes.every((route) => route.stops.every((stop) => stop.cargo.kind === 'PARCELS')).toBe(true)
    expect(validateScenario(scenario)).toEqual([])
  })

  it('keeps every travel leg within a 60 km/h upper bound on prepared Cordoba roads', () => {
    const scenario = JSON.parse(readFileSync(checkedInPath, 'utf8')) as FleetScenario
    const routeCollection = JSON.parse(readFileSync(routeAssetPath, 'utf8')) as RouteGeometryCollection
    const routeIndex = routeCollectionToIndex(routeCollection, scenario)

    for (const route of scenario.routes) {
      const distances = routeIndex[route.geometryId].properties.waypointDistancesKm
      let previousMinute = route.departureMinute

      route.stops.forEach((stop, stopIndex) => {
        const distanceKm = distances[stopIndex + 1] - distances[stopIndex]
        const durationMinutes = stop.plannedArrivalMinute - previousMinute
        const speedKmh = legSpeedKmh(distanceKm, durationMinutes)
        expect(
          speedKmh,
          `${route.id} leg ${stopIndex + 1}: ${distanceKm.toFixed(2)} km in ${durationMinutes} min`,
        ).toBeLessThanOrEqual(MAX_TRAVEL_SPEED_KMH)
        previousMinute = stop.plannedDepartureMinute
      })

      const returnDistanceKm = distances[distances.length - 1] - distances[distances.length - 2]
      const returnDurationMinutes = route.returnMinute - previousMinute
      expect(
        legSpeedKmh(returnDistanceKm, returnDurationMinutes),
        `${route.id} return: ${returnDistanceKm.toFixed(2)} km in ${returnDurationMinutes} min`,
      ).toBeLessThanOrEqual(MAX_TRAVEL_SPEED_KMH)
    }
  })

  it('fails closed when prepared route distances are not finite numbers', () => {
    const dir = mkdtempSync(join(tmpdir(), 'fleetflow-malformed-routes-'))
    tempDirs.push(dir)
    const malformedRoutesPath = join(dir, 'routes.geojson')
    const generatedPath = join(dir, 'scenario.json')
    const malformed = JSON.parse(readFileSync(routeAssetPath, 'utf8'))
    malformed.features[0].properties.waypointDistancesKm[1] = '1.2'
    writeFileSync(malformedRoutesPath, JSON.stringify(malformed), 'utf8')

    expect(() => execFileSync(process.execPath, [
      generatorPath,
      '--profile', profilePath,
      '--routes', malformedRoutesPath,
      '--output', generatedPath,
      '--seed', canonicalSeed,
    ], { stdio: 'pipe' })).toThrow(/finite numbers/i)
  })

  it('keeps store coordinates stable when operational profile sampling changes', () => {
    const dir = mkdtempSync(join(tmpdir(), 'fleetflow-geography-rng-'))
    tempDirs.push(dir)
    const baselinePath = join(dir, 'baseline.json')
    const modifiedPath = join(dir, 'modified.json')
    const modifiedProfilePath = join(dir, 'profile.json')
    const modifiedProfile = JSON.parse(readFileSync(profilePath, 'utf8'))
    modifiedProfile.distributions.timeWindowProbability = 0
    writeFileSync(modifiedProfilePath, JSON.stringify(modifiedProfile), 'utf8')

    runGenerator(profilePath, baselinePath)
    runGenerator(modifiedProfilePath, modifiedPath)

    const baseline = JSON.parse(readFileSync(baselinePath, 'utf8')) as FleetScenario
    const modified = JSON.parse(readFileSync(modifiedPath, 'utf8')) as FleetScenario

    expect(modified.stores.map((store) => store.position)).toEqual(
      baseline.stores.map((store) => store.position),
    )
  })

  it('supports independent operational and geography seeds in the shared generation core', async () => {
    expect(existsSync(sharedGeneratorPath)).toBe(true)
    if (!existsSync(sharedGeneratorPath)) return

    const moduleUrl = pathToFileURL(join(process.cwd(), sharedGeneratorPath)).href
    const { generateCalibratedScenario, loadRouteGeometryIndex } = await import(moduleUrl)
    const profile = JSON.parse(readFileSync(profilePath, 'utf8'))
    const routeGeometryIndex = loadRouteGeometryIndex(routeAssetPath)

    const runA = generateCalibratedScenario({
      profile,
      routeGeometryIndex,
      operationsSeed: 'fleetflow-ops-a',
      geographySeed: canonicalSeed,
      packageTarget: 100,
    }) as FleetScenario
    const runB = generateCalibratedScenario({
      profile,
      routeGeometryIndex,
      operationsSeed: 'fleetflow-ops-b',
      geographySeed: canonicalSeed,
      packageTarget: 100,
    }) as FleetScenario

    expect(runB.stores.map((store) => store.position)).toEqual(
      runA.stores.map((store) => store.position),
    )
    expect(runB.routes.map((route) => route.returnMinute)).not.toEqual(
      runA.routes.map((route) => route.returnMinute),
    )
  })

  it('reproduces the checked-in scenario byte-for-byte from the official profile, Cordoba routes and canonical seed', () => {
    expect(existsSync(generatorPath)).toBe(true)
    expect(existsSync(checkedInPath)).toBe(true)
    expect(existsSync(routeAssetPath)).toBe(true)
    if (!existsSync(generatorPath) || !existsSync(checkedInPath) || !existsSync(routeAssetPath)) return

    const dir = mkdtempSync(join(tmpdir(), 'fleetflow-calibrated-'))
    tempDirs.push(dir)
    const generatedPath = join(dir, 'cordoba-calibrated-v1.json')

    runGenerator(profilePath, generatedPath)

    expect(readFileSync(generatedPath, 'utf8')).toBe(readFileSync(checkedInPath, 'utf8'))
  })
})
