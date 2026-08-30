import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

const tempDirs: string[] = []

afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

describe('Amazon calibration script', () => {
  it('derives compact statistics only from High-quality routes', () => {
    const dir = mkdtempSync(join(tmpdir(), 'fleetflow-calibration-'))
    tempDirs.push(dir)
    const outputPath = join(dir, 'profile.json')

    execFileSync(process.execPath, [
      'scripts/calibrate-amazon.mjs',
      '--input-dir', 'scripts/fixtures/amazon-mini',
      '--output', outputPath,
    ])

    const profile = JSON.parse(readFileSync(outputPath, 'utf8'))

    expect(profile.source).toMatchObject({
      dataset: 'Amazon Last Mile Routing Research Challenge',
      license: 'CC BY-NC 4.0',
      sample: 'High',
      methodVersion: '1',
    })
    expect(profile.summary).toEqual({
      routesAnalyzed: 1,
      stopsAnalyzed: 3,
      packagesAnalyzed: 4,
    })
    expect(profile.distributions.stopsPerRoute).toMatchObject({ min: 3, p50: 3, max: 3 })
    expect(profile.distributions.vehicleCapacityCm3).toMatchObject({ min: 100000, p50: 100000, max: 100000 })
    expect(profile.distributions.serviceSecondsPerStop.p50).toBe(90)
    expect(profile.distributions.travelSecondsBetweenStops.p50).toBe(180)
    expect(profile.distributions.timeWindowProbability).toBeCloseTo(1 / 3)
    expect(profile.distributions.timeWindowWidthMinutes).toMatchObject({ min: 60, p50: 60, max: 60 })
    expect(profile.distributions.departureMinuteOfDayUtc.p50).toBe(375)

    expect(JSON.stringify(profile)).not.toContain('RouteID_HIGH_TEST')
    expect(JSON.stringify(profile)).not.toContain('RouteID_LOW_TEST')
    expect(JSON.stringify(profile)).not.toContain('999999999')
  })
})
