import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

const generatorPath = 'scripts/generate-calibrated-scenario.mjs'
const profilePath = 'src/scenario/calibration/amazon-last-mile-v1.json'
const routeAssetPath = 'public/data/cordoba-calibrated-routes.geojson'
const workflowPath = '.github/workflows/prepare-routes.yml'
const canonicalSeed = 'fleetflow-cordoba-v0.4'
const tempDirs: string[] = []

afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

describe('provisional calibrated generation', () => {
  it('does not depend on stale route waypoint cardinality', () => {
    const dir = mkdtempSync(join(tmpdir(), 'fleetflow-provisional-'))
    tempDirs.push(dir)
    const staleRoutesPath = join(dir, 'stale-routes.geojson')
    const outputPath = join(dir, 'provisional.json')
    const staleRoutes = JSON.parse(readFileSync(routeAssetPath, 'utf8'))

    staleRoutes.features[0].properties.waypointDistancesKm = [0, 1]
    writeFileSync(staleRoutesPath, JSON.stringify(staleRoutes), 'utf8')

    expect(() => execFileSync(process.execPath, [
      generatorPath,
      '--profile', profilePath,
      '--routes', staleRoutesPath,
      '--output', outputPath,
      '--seed', canonicalSeed,
      '--mode', 'provisional',
    ], { stdio: 'pipe' })).not.toThrow()

    const scenario = JSON.parse(readFileSync(outputPath, 'utf8'))
    expect(scenario.trucks).toHaveLength(8)
    expect(scenario.stores).toHaveLength(60)
    expect(scenario.routes.reduce((count: number, route: { stops: unknown[] }) => count + route.stops.length, 0)).toBe(60)
  })

  it('uses provisional mode before route reconciliation in CI', () => {
    const workflow = readFileSync(workflowPath, 'utf8')
    const provisional = workflow.indexOf('npm run generate:calibrated -- --mode provisional --output /tmp/cordoba-provisional.json')
    const reconciliation = workflow.indexOf('--scenario /tmp/cordoba-provisional.json')

    expect(provisional).toBeGreaterThan(-1)
    expect(reconciliation).toBeGreaterThan(provisional)
  })
})
