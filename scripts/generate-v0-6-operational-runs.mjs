import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs'
import { basename, join } from 'node:path'
import { generateV06OperationalRuns } from './lib/v0-6-operational-run-generator.mjs'
import { prepareRouteCollection } from './lib/route-preparation.mjs'

const REQUIRED_FLAGS = [
  'profile',
  'candidate-pool',
  'fleet-template',
  'from',
  'to',
  'issued-at',
  'data-as-of',
  'output-dir',
  'manifest-name',
  'run-suffix',
]
const ALLOWED_FLAGS = new Set(REQUIRED_FLAGS)
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/
const SAFE_MANIFEST_NAME = /^[A-Za-z0-9._-]+\.json$/
const SAFE_RUN_SUFFIX = /^[A-Za-z0-9]+(?:-[A-Za-z0-9]+)*$/

function parseArgs(argv) {
  const args = {}

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index]
    if (!token.startsWith('--')) {
      throw new Error(`Unexpected argument ${token}`)
    }

    const name = token.slice(2)
    if (!ALLOWED_FLAGS.has(name)) {
      throw new Error(`Unknown option --${name}`)
    }
    if (Object.hasOwn(args, name)) {
      throw new Error(`Duplicate option --${name}`)
    }

    const value = argv[index + 1]
    if (value === undefined || value.startsWith('--')) {
      throw new Error(`Missing value for --${name}`)
    }
    args[name] = value
    index += 1
  }

  for (const flag of REQUIRED_FLAGS) {
    if (typeof args[flag] !== 'string' || args[flag].trim() === '') {
      throw new Error(`Missing required option --${flag}`)
    }
  }

  if (!SAFE_MANIFEST_NAME.test(args['manifest-name'])
    || basename(args['manifest-name']) !== args['manifest-name']) {
    throw new Error('--manifest-name must be a safe JSON filename')
  }
  if (!SAFE_RUN_SUFFIX.test(args['run-suffix'])) {
    throw new Error('--run-suffix is invalid')
  }

  return args
}

function isRealIsoDate(value) {
  if (!ISO_DATE.test(value)) return false
  const [year, month, day] = value.split('-').map(Number)
  const candidate = new Date(Date.UTC(year, month - 1, day))
  return candidate.getUTCFullYear() === year
    && candidate.getUTCMonth() === month - 1
    && candidate.getUTCDate() === day
}

function operationalDates(from, to) {
  if (!isRealIsoDate(from) || !isRealIsoDate(to) || from > to) {
    throw new Error(`Invalid operational date range: ${from} to ${to}`)
  }

  const dates = []
  const cursor = new Date(`${from}T00:00:00Z`)
  const end = new Date(`${to}T00:00:00Z`)
  while (cursor <= end) {
    dates.push(cursor.toISOString().slice(0, 10))
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  }
  return dates
}

function plannedPaths({ outputDir, manifestName, dates, runSuffix }) {
  const generatedDir = join(outputDir, 'generated')
  return {
    generatedDir,
    manifestPath: join(outputDir, manifestName),
    artifacts: dates.map((targetDate) => {
      const id = `cordoba-${targetDate}-${runSuffix}`
      return {
        id,
        runPath: join(generatedDir, `${id}.json`),
        routePath: join(generatedDir, `${id}.routes.geojson`),
      }
    }),
  }
}

function refuseExistingOutputs(paths) {
  const candidates = [
    paths.manifestPath,
    ...paths.artifacts.flatMap((artifact) => [artifact.runPath, artifact.routePath]),
  ]

  for (const path of candidates) {
    if (existsSync(path)) {
      throw new Error(`${path} already exists; refusing to overwrite`)
    }
  }
}

function readJson(path, label) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'))
  } catch (error) {
    throw new Error(`Could not read ${label} JSON at ${path}: ${error instanceof Error ? error.message : String(error)}`)
  }
}

function writeJsonExclusive(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, {
    encoding: 'utf8',
    flag: 'wx',
  })
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const dates = operationalDates(args.from, args.to)
  const paths = plannedPaths({
    outputDir: args['output-dir'],
    manifestName: args['manifest-name'],
    dates,
    runSuffix: args['run-suffix'],
  })

  // Fail before any route preparation/network work if publication would mutate
  // an immutable artifact that already exists.
  refuseExistingOutputs(paths)

  const profile = readJson(args.profile, 'calibration profile')
  const candidatePool = readJson(args['candidate-pool'], 'candidate pool')
  const fleetTemplate = readJson(args['fleet-template'], 'fleet template')

  const generated = await generateV06OperationalRuns({
    profile,
    candidatePool,
    fleetTemplate,
    from: args.from,
    to: args.to,
    issuedAt: args['issued-at'],
    dataAsOf: args['data-as-of'],
    runSuffix: args['run-suffix'],
    routePreparer: ({ scenario, metadata }) => prepareRouteCollection({
      scenario,
      metadata,
    }),
  })

  if (generated.artifacts.length !== paths.artifacts.length) {
    throw new Error('Generated artifact count does not match planned publication count')
  }

  mkdirSync(paths.generatedDir, { recursive: true })

  for (let index = 0; index < generated.artifacts.length; index += 1) {
    const generatedArtifact = generated.artifacts[index]
    const planned = paths.artifacts[index]
    if (generatedArtifact.run.id !== planned.id) {
      throw new Error(`Generated run id ${generatedArtifact.run.id} does not match planned id ${planned.id}`)
    }
    writeJsonExclusive(planned.runPath, generatedArtifact.run)
    writeJsonExclusive(planned.routePath, generatedArtifact.routeCollection)
  }

  writeJsonExclusive(paths.manifestPath, generated.manifest)

  console.log(`Published ${generated.artifacts.length} immutable V0.6 operational bundles`)
  console.log(`Manifest: ${paths.manifestPath}`)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
