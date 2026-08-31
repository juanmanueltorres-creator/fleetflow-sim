import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { describe, expect, it } from 'vitest'

const MANIFEST = resolve('public/data/operational-runs/manifest-v0-6.json')
const PROFILE = resolve('src/scenario/calibration/amazon-last-mile-v1.json')

function packageJson() {
  return JSON.parse(readFileSync(resolve('package.json'), 'utf8'))
}

describe('WHAT_IF publication CLI', () => {
  it('refuses existing output before route preparation can run', () => {
    const outputDir = mkdtempSync(join(tmpdir(), 'fleetflow-what-if-'))
    try {
      writeFileSync(join(outputDir, 'what-if-comparisons.json'), '{}\n')

      const result = spawnSync(process.execPath, [
        'scripts/generate-what-if-comparison.mjs',
        '--manifest', MANIFEST,
        '--profile', PROFILE,
        '--issued-at', '2026-08-30T21:05:00-03:00',
        '--output-dir', outputDir,
        '--catalog-name', 'what-if-comparisons.json',
      ], {
        cwd: resolve('.'),
        encoding: 'utf8',
      })

      expect(result.status).not.toBe(0)
      expect(`${result.stdout}\n${result.stderr}`).toMatch(/refusing to overwrite/i)
    } finally {
      rmSync(outputDir, { recursive: true, force: true })
    }
  })

  it('exposes the exact V0 generation command without replacing existing scripts', () => {
    const scripts = packageJson().scripts
    expect(scripts['generate:what-if:v0']).toBe(
      'node scripts/generate-what-if-comparison.mjs',
    )
    expect(scripts['generate:operational-runs']).toBeTruthy()
    expect(scripts['generate:operational-runs:v0.6']).toBeTruthy()
  })
})
