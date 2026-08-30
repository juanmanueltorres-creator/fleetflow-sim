import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import {
  prepareRouteCollection,
  prepareRouteDefinitions,
} from './lib/route-preparation.mjs'

const legacyDepot = [-64.1888, -31.4201]
const legacyRoutes = [
  {
    truckId: 'truck-01',
    geometryId: 'route-truck-01',
    coordinates: [legacyDepot, [-64.1805, -31.4148], [-64.1679, -31.4057], [-64.1554, -31.4219], legacyDepot],
  },
  {
    truckId: 'truck-02',
    geometryId: 'route-truck-02',
    coordinates: [legacyDepot, [-64.2032, -31.4075], [-64.2197, -31.4140], [-64.2291, -31.4301], legacyDepot],
  },
  {
    truckId: 'truck-03',
    geometryId: 'route-truck-03',
    coordinates: [legacyDepot, [-64.1962, -31.4378], [-64.1813, -31.4480], [-64.1651, -31.4394], legacyDepot],
  },
  {
    truckId: 'truck-04',
    geometryId: 'route-truck-04',
    coordinates: [legacyDepot, [-64.1458, -31.4112], [-64.1372, -31.4300], [-64.1516, -31.4522], legacyDepot],
  },
  {
    truckId: 'truck-05',
    geometryId: 'route-truck-05',
    coordinates: [legacyDepot, [-64.2075, -31.4515], [-64.2220, -31.4460], [-64.2360, -31.4110], legacyDepot],
  },
]

const baseUrl = process.env.OSRM_BASE_URL ?? 'https://router.project-osrm.org'

function parseArgs(argv) {
  if (argv.length === 0) {
    return {
      scenarioPath: null,
      outputPath: 'public/data/coca-coqui-routes.geojson',
      metadata: undefined,
    }
  }

  const args = new Map()
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index]
    const value = argv[index + 1]
    if (!flag?.startsWith('--') || !value) throw new Error(`Invalid argument near ${flag ?? '<end>'}`)
    args.set(flag, value)
  }

  const scenarioPath = args.get('--scenario')
  const outputPath = args.get('--output')
  if (!scenarioPath || !outputPath) {
    throw new Error(
      'Usage: node scripts/prepare-routes.mjs --scenario <file> --output <file> [--run-id <id> --target-date <date> --model-version <version>]',
    )
  }

  const runId = args.get('--run-id')
  const targetDate = args.get('--target-date')
  const modelVersion = args.get('--model-version')
  const bindingCount = [runId, targetDate, modelVersion].filter(Boolean).length

  if (bindingCount !== 0 && bindingCount !== 3) {
    throw new Error('--run-id, --target-date and --model-version must be provided together')
  }

  return {
    scenarioPath: resolve(scenarioPath),
    outputPath,
    metadata: bindingCount === 3
      ? { runId, targetDate, modelVersion }
      : undefined,
  }
}

async function main() {
  const { scenarioPath, outputPath, metadata } = parseArgs(process.argv.slice(2))

  const collection = scenarioPath
    ? await prepareRouteCollection({
        scenario: JSON.parse(await readFile(scenarioPath, 'utf8')),
        baseUrl,
        metadata,
      })
    : await prepareRouteDefinitions({
        definitions: legacyRoutes,
        baseUrl,
      })

  await mkdir(dirname(outputPath), { recursive: true })
  await writeFile(outputPath, `${JSON.stringify(collection)}\n`, 'utf8')
  console.log(`Prepared ${collection.features.length} static road routes at ${outputPath}`)
}

await main()
