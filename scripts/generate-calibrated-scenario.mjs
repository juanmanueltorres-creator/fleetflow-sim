import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import {
  generateCalibratedScenario,
  loadRouteGeometryIndex,
} from './lib/calibrated-scenario-generator.mjs'

function parseArgs(argv) {
  const args = new Map()
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index]
    const value = argv[index + 1]
    if (!flag?.startsWith('--') || !value) throw new Error(`Invalid argument near ${flag ?? '<end>'}`)
    args.set(flag, value)
  }

  const profile = args.get('--profile')
  const routes = args.get('--routes')
  const output = args.get('--output')
  const seed = args.get('--seed')
  const mode = args.get('--mode') ?? 'final'
  if (!profile || !routes || !output || !seed) {
    throw new Error('Usage: node scripts/generate-calibrated-scenario.mjs --profile <file> --routes <geojson> --output <file> --seed <text> [--mode final|provisional]')
  }
  if (mode !== 'final' && mode !== 'provisional') {
    throw new Error(`Unsupported generation mode ${mode}`)
  }
  return { profile: resolve(profile), routes: resolve(routes), output: resolve(output), seed, mode }
}

function main() {
  const { profile: profilePath, routes: routesPath, output, seed, mode } = parseArgs(process.argv.slice(2))
  const profile = JSON.parse(readFileSync(profilePath, 'utf8'))
  const routeGeometryIndex = mode === 'final' ? loadRouteGeometryIndex(routesPath) : null
  const scenario = generateCalibratedScenario({
    profile,
    routeGeometryIndex,
    operationsSeed: seed,
    geographySeed: seed,
    packageTarget: 100,
  })

  mkdirSync(dirname(output), { recursive: true })
  writeFileSync(output, `${JSON.stringify(scenario, null, 2)}\n`, 'utf8')
  console.log(`Calibrated Cordoba scenario written to ${output}`)
}

main()
