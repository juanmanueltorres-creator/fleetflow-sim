import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { validateScenario } from '../src/domain/scenarioValidation'
import type { FleetScenario } from '../src/domain/types'

const generatorPath = 'scripts/generate-calibrated-scenario.mjs'
const profilePath = 'src/scenario/calibration/amazon-last-mile-v1.json'
const checkedInPath = 'src/scenario/generated/cordoba-calibrated-v1.json'
const canonicalSeed = 'fleetflow-cordoba-v0.4'
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
    expect(scenario.routes.every((route) => route.stops.every((stop) => stop.cargo.kind === 'PARCELS'))).toBe(true)
    expect(validateScenario(scenario)).toEqual([])
  })

  it('reproduces the checked-in scenario exactly from the official profile and canonical seed', () => {
    expect(existsSync(generatorPath)).toBe(true)
    expect(existsSync(checkedInPath)).toBe(true)
    if (!existsSync(generatorPath) || !existsSync(checkedInPath)) return

    const dir = mkdtempSync(join(tmpdir(), 'fleetflow-calibrated-'))
    tempDirs.push(dir)
    const generatedPath = join(dir, 'cordoba-calibrated-v1.json')

    execFileSync(process.execPath, [
      generatorPath,
      '--profile', profilePath,
      '--output', generatedPath,
      '--seed', canonicalSeed,
    ])

    const generated = JSON.parse(readFileSync(generatedPath, 'utf8'))
    const checkedIn = JSON.parse(readFileSync(checkedInPath, 'utf8'))
    expect(generated).toEqual(checkedIn)
  })
})
