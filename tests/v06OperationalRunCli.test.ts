import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { describe, expect, it } from 'vitest'

const LEGACY_COMMAND = 'node scripts/generate-operational-runs.mjs --profile src/scenario/calibration/amazon-last-mile-v1.json --routes public/data/cordoba-calibrated-routes.geojson'

function runCli(outputDir: string) {
  return spawnSync(process.execPath, [
    'scripts/generate-v0-6-operational-runs.mjs',
    '--profile', 'src/scenario/calibration/amazon-last-mile-v1.json',
    '--candidate-pool', 'src/scenario/operationalRuns/candidate-pool-v1.json',
    '--fleet-template', 'src/scenario/generated/cordoba-calibrated-v1.json',
    '--from', '2026-08-31',
    '--to', '2026-08-31',
    '--issued-at', '2026-08-30T21:00:00-03:00',
    '--data-as-of', '2026-08-30T21:00:00-03:00',
    '--output-dir', outputDir,
    '--manifest-name', 'manifest-v0-6.json',
    '--run-suffix', 'v3',
  ], {
    cwd: process.cwd(),
    encoding: 'utf8',
    timeout: 5_000,
  })
}

function withTempDir(callback: (dir: string) => void) {
  const dir = mkdtempSync(join(tmpdir(), 'fleetflow-v06-cli-'))
  try {
    callback(dir)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

function expectImmutableFailure(result: ReturnType<typeof runCli>) {
  expect(result.status).not.toBe(0)
  expect(`${result.stdout}\n${result.stderr}`).toMatch(/already exists/i)
}

describe('V0.6 publication CLI immutability', () => {
  it('refuses to overwrite the target manifest before routing', () => {
    withTempDir((dir) => {
      writeFileSync(join(dir, 'manifest-v0-6.json'), '{}\n', 'utf8')
      expectImmutableFailure(runCli(dir))
    })
  })

  it('refuses to overwrite a planned run JSON before routing', () => {
    withTempDir((dir) => {
      const generated = join(dir, 'generated')
      mkdirSync(generated, { recursive: true })
      writeFileSync(join(generated, 'cordoba-2026-08-31-v3.json'), '{}\n', 'utf8')
      expectImmutableFailure(runCli(dir))
    })
  })

  it('refuses to overwrite a planned route GeoJSON before routing', () => {
    withTempDir((dir) => {
      const generated = join(dir, 'generated')
      mkdirSync(generated, { recursive: true })
      writeFileSync(join(generated, 'cordoba-2026-08-31-v3.routes.geojson'), '{}\n', 'utf8')
      expectImmutableFailure(runCli(dir))
    })
  })

  it('adds the V0.6 package command without changing the historical V0.5 command', () => {
    const packageJson = JSON.parse(readFileSync('package.json', 'utf8'))
    expect(packageJson.scripts['generate:operational-runs']).toBe(LEGACY_COMMAND)
    expect(packageJson.scripts['generate:operational-runs:v0.6']).toBe(
      'node scripts/generate-v0-6-operational-runs.mjs',
    )
  })
})
