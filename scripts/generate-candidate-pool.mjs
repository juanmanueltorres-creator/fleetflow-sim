import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { buildCandidatePool, parseGtfsStops } from './lib/candidate-pool.mjs'

const DEPOT_POSITION = [-64.1888, -31.4201]
const CANDIDATES_PER_ZONE = 30
const SEED = 'fleetflow:v0.6:cordoba:candidate-pool-v1'
const VERSION = 'cordoba-delivery-pool-v1'
const GTFS_REFERENCE = 'https://gobiernoabierto.cordoba.gob.ar/data/datos-abiertos/categoria/transporte-urbano/gtfs-de-la-ciudada-de-cordoba/3319'

function parseArgs(argv) {
  const args = new Map()
  const allowed = new Set(['--stops', '--output'])

  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index]
    const value = argv[index + 1]
    if (!allowed.has(flag)) throw new Error(`Unknown argument: ${flag ?? '<end>'}`)
    if (!value || allowed.has(value)) throw new Error(`Missing value for ${flag}`)
    args.set(flag, value)
  }

  const stopsPath = args.get('--stops')
  const outputPath = args.get('--output')
  if (!stopsPath || !outputPath) {
    throw new Error('Usage: node scripts/generate-candidate-pool.mjs --stops <stops.txt> --output <candidate-pool.json>')
  }

  return {
    stopsPath: resolve(stopsPath),
    outputPath: resolve(outputPath),
  }
}

async function main() {
  const { stopsPath, outputPath } = parseArgs(process.argv.slice(2))
  if (existsSync(outputPath)) {
    throw new Error(`Candidate pool artifact already exists: ${outputPath}`)
  }

  const gtfsStops = parseGtfsStops(await readFile(stopsPath, 'utf8'))
  const pool = buildCandidatePool({
    gtfsStops,
    depotPosition: DEPOT_POSITION,
    seed: SEED,
    version: VERSION,
    gtfsReference: GTFS_REFERENCE,
    candidatesPerZone: CANDIDATES_PER_ZONE,
  })

  await mkdir(dirname(outputPath), { recursive: true })
  await writeFile(outputPath, `${JSON.stringify(pool, null, 2)}\n`, 'utf8')
  console.log(`Generated ${pool.candidates.length} synthetic Córdoba delivery candidates at ${outputPath}`)
}

await main()
