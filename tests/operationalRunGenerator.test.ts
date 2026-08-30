import { execFileSync } from 'node:child_process'
import {
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type {
  OperationalRun,
  OperationalRunManifest,
} from '../src/scenario/operationalRuns/types'

const generatorPath = 'scripts/generate-operational-runs.mjs'
const profilePath = 'src/scenario/calibration/amazon-last-mile-v1.json'
const routeAssetPath = 'public/data/cordoba-calibrated-routes.geojson'
const issuedAt = '2026-08-30T21:00:00-03:00'
const dataAsOf = '2026-08-30T21:00:00-03:00'
const tempDirs: string[] = []

afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

function tempOutputDir(label: string): string {
  const dir = mkdtempSync(join(tmpdir(), `fleetflow-${label}-`))
  tempDirs.push(dir)
  return dir
}

function runGenerator({
  outputDir,
  from = '2026-08-30',
  to = '2026-08-31',
  suffix = 'v1',
  issuedAtValue = issuedAt,
  dataAsOfValue = dataAsOf,
}: {
  outputDir: string
  from?: string
  to?: string
  suffix?: string
  issuedAtValue?: string
  dataAsOfValue?: string
}): void {
  execFileSync(process.execPath, [
    generatorPath,
    '--profile', profilePath,
    '--routes', routeAssetPath,
    '--from', from,
    '--to', to,
    '--issued-at', issuedAtValue,
    '--data-as-of', dataAsOfValue,
    '--output-dir', outputDir,
    '--run-suffix', suffix,
  ], { stdio: 'pipe' })
}

function readManifest(outputDir: string): OperationalRunManifest {
  return JSON.parse(readFileSync(join(outputDir, 'manifest.json'), 'utf8')) as OperationalRunManifest
}

function readRun(outputDir: string, targetDate: string, suffix = 'v1'): OperationalRun {
  return JSON.parse(
    readFileSync(join(outputDir, 'generated', `cordoba-${targetDate}-${suffix}.json`), 'utf8'),
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

describe('operational run generator', () => {
  it('reproduces identical bytes for identical explicit inputs', () => {
    const outputA = tempOutputDir('operational-a')
    const outputB = tempOutputDir('operational-b')

    runGenerator({ outputDir: outputA })
    runGenerator({ outputDir: outputB })

    expect(readFileSync(join(outputA, 'manifest.json'), 'utf8')).toBe(
      readFileSync(join(outputB, 'manifest.json'), 'utf8'),
    )

    const filesA = readdirSync(join(outputA, 'generated')).sort()
    const filesB = readdirSync(join(outputB, 'generated')).sort()
    expect(filesB).toEqual(filesA)

    for (const file of filesA) {
      expect(readFileSync(join(outputA, 'generated', file), 'utf8')).toBe(
        readFileSync(join(outputB, 'generated', file), 'utf8'),
      )
    }
  })

  it('changes operational values across dates while preserving geography', () => {
    const outputDir = tempOutputDir('operational-geography')
    runGenerator({ outputDir })

    const runA = readRun(outputDir, '2026-08-30')
    const runB = readRun(outputDir, '2026-08-31')

    expect(runB.scenario.stores.map((store) => store.position)).toEqual(
      runA.scenario.stores.map((store) => store.position),
    )
    expect(runB.scenario.routes.map((route) => route.returnMinute)).not.toEqual(
      runA.scenario.routes.map((route) => route.returnMinute),
    )
  })

  it('classifies target dates after the issued Cordoba date as FORECAST', () => {
    const outputDir = tempOutputDir('operational-modes')
    runGenerator({ outputDir })

    expect(readRun(outputDir, '2026-08-30').mode).toBe('SIMULATED')
    expect(readRun(outputDir, '2026-08-31').mode).toBe('FORECAST')
  })

  it('keeps package totals between 90 and 118 with at least one package per stop', () => {
    const outputDir = tempOutputDir('operational-demand')
    runGenerator({ outputDir, from: '2026-08-27', to: '2026-09-03' })

    const manifest = readManifest(outputDir)
    expect(manifest.runs).toHaveLength(8)

    for (const entry of manifest.runs) {
      const run = readRun(outputDir, entry.targetDate)
      expect(totalPackages(run)).toBeGreaterThanOrEqual(90)
      expect(totalPackages(run)).toBeLessThanOrEqual(118)
      expect(
        run.scenario.routes.every((route) =>
          route.stops.every((stop) => stop.cargo.kind === 'PARCELS' && stop.cargo.packageCount >= 1),
        ),
      ).toBe(true)
    }
  })

  it('refuses to overwrite an existing artifact', () => {
    const outputDir = tempOutputDir('operational-immutable-artifact')
    runGenerator({ outputDir, from: '2026-08-30', to: '2026-08-30' })

    const artifactPath = join(outputDir, 'generated', 'cordoba-2026-08-30-v1.json')
    const artifactBefore = readFileSync(artifactPath, 'utf8')
    rmSync(join(outputDir, 'manifest.json'))

    expect(() => runGenerator({ outputDir, from: '2026-08-30', to: '2026-08-30' })).toThrow(/exist|overwrite/i)
    expect(readFileSync(artifactPath, 'utf8')).toBe(artifactBefore)
  })

  it.each([
    ['2026-2-30', '2026-08-31'],
    ['2026-08-30', '2026-02-30'],
    ['not-a-date', '2026-08-31'],
    ['2026-09-01', '2026-08-31'],
  ])('rejects malformed or reversed date range %s to %s', (from, to) => {
    const outputDir = tempOutputDir('operational-invalid-range')
    expect(() => runGenerator({ outputDir, from, to })).toThrow(/Invalid operational date range/)
  })

  it.each([
    {
      label: 'issued-at',
      issuedAtValue: '2026-02-30T21:00:00-03:00',
      dataAsOfValue: '2026-02-28T21:00:00-03:00',
    },
    {
      label: 'data-as-of',
      issuedAtValue: '2026-03-03T21:00:00-03:00',
      dataAsOfValue: '2026-02-30T21:00:00-03:00',
    },
  ])('rejects calendar-invalid $label timestamps', ({ label, issuedAtValue, dataAsOfValue }) => {
    const outputDir = tempOutputDir(`operational-invalid-${label}`)
    expect(() => runGenerator({ outputDir, issuedAtValue, dataAsOfValue })).toThrow(
      new RegExp(`Invalid ${label}`),
    )
  })

  it.each(['v1.1', 'v1_1'])('rejects run suffix %s that cannot form a valid runtime run id', (suffix) => {
    const outputDir = tempOutputDir('operational-invalid-suffix')
    expect(() => runGenerator({ outputDir, suffix })).toThrow(/Invalid run-suffix/)
  })
})
