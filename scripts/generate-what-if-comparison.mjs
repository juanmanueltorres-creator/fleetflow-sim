import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'
import { prepareRouteCollection } from './lib/route-preparation.mjs'
import {
  generateWhatIfComparison,
  selectEligibleBaseBundle,
} from './lib/what-if-generator.mjs'

const REQUIRED_FLAGS = [
  'manifest',
  'profile',
  'issued-at',
  'output-dir',
  'catalog-name',
]
const ALLOWED_FLAGS = new Set(REQUIRED_FLAGS)
const CATALOG_NAME = 'what-if-comparisons.json'

function parseArgs(argv) {
  const args = {}
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index]
    if (!token.startsWith('--')) throw new Error(`Unexpected argument ${token}`)
    const key = token.slice(2)
    if (!ALLOWED_FLAGS.has(key)) throw new Error(`Unknown option --${key}`)
    if (Object.hasOwn(args, key)) throw new Error(`Duplicate option --${key}`)
    const value = argv[index + 1]
    if (value === undefined || value.startsWith('--')) {
      throw new Error(`Missing value for --${key}`)
    }
    args[key] = value
    index += 1
  }

  for (const key of REQUIRED_FLAGS) {
    if (typeof args[key] !== 'string' || args[key].trim() === '') {
      throw new Error(`Missing required option --${key}`)
    }
  }
  if (args['catalog-name'] !== CATALOG_NAME || basename(args['catalog-name']) !== CATALOG_NAME) {
    throw new Error(`--catalog-name must be exactly ${CATALOG_NAME}`)
  }
  if (!Number.isFinite(Date.parse(args['issued-at']))) {
    throw new Error('--issued-at must be a valid timestamp')
  }
  return args
}

function readJson(path, label) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'))
  } catch (error) {
    throw new Error(`Could not read ${label} JSON at ${path}: ${error instanceof Error ? error.message : String(error)}`)
  }
}

function artifactPathFromManifest(manifestPath, artifact) {
  if (typeof artifact !== 'string' || !artifact.startsWith('./generated/')) {
    throw new Error(`Unsafe local artifact path ${String(artifact)}`)
  }
  return resolve(dirname(manifestPath), artifact.replace(/^\.\//, ''))
}

function loadBaseBundles(manifestPath, manifest) {
  if (manifest?.schemaVersion !== 2 || !Array.isArray(manifest.runs)) {
    throw new Error('WHAT_IF publication requires a schema V2 manifest')
  }
  return manifest.runs.map((entry) => {
    if (typeof entry.routeArtifact !== 'string') {
      throw new Error(`V0.6 entry ${entry.id ?? '<unknown>'} requires routeArtifact`)
    }
    return {
      entry,
      run: readJson(artifactPathFromManifest(manifestPath, entry.artifact), `run ${entry.id}`),
      routeCollection: readJson(
        artifactPathFromManifest(manifestPath, entry.routeArtifact),
        `routes ${entry.id}`,
      ),
    }
  })
}

function plannedOutputs(outputDir, baseRunId, catalogName) {
  const generatedDir = join(outputDir, 'generated')
  const earlyId = `${baseRunId}-what-if-early-start-v1`
  const balancedId = `${baseRunId}-what-if-balanced-load-v1`
  return {
    generatedDir,
    catalogPath: join(outputDir, catalogName),
    alternatives: [earlyId, balancedId].map((id) => ({
      id,
      runPath: join(generatedDir, `${id}.json`),
      routePath: join(generatedDir, `${id}.routes.geojson`),
    })),
  }
}

function refuseExistingOutputs(paths) {
  const candidates = [
    paths.catalogPath,
    ...paths.alternatives.flatMap((item) => [item.runPath, item.routePath]),
  ]
  for (const path of candidates) {
    if (existsSync(path)) {
      throw new Error(`${path} already exists; refusing to overwrite`)
    }
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
  const manifestPath = resolve(args.manifest)
  const outputDir = resolve(args['output-dir'])
  const manifest = readJson(manifestPath, 'V0.6 manifest')
  const profile = readJson(resolve(args.profile), 'calibration profile')
  const bundles = loadBaseBundles(manifestPath, manifest)

  // Deterministically identify filenames before any OSRM request, then fail
  // closed if immutable publication would overwrite any existing output.
  const selectedBase = selectEligibleBaseBundle(bundles)
  const paths = plannedOutputs(outputDir, selectedBase.run.id, args['catalog-name'])
  refuseExistingOutputs(paths)

  const generated = await generateWhatIfComparison({
    manifest,
    bundles,
    profile,
    issuedAt: args['issued-at'],
    routePreparer: ({ scenario, metadata }) => prepareRouteCollection({
      scenario,
      metadata,
    }),
  })

  if (generated.base.run.id !== selectedBase.run.id || generated.alternatives.length !== 2) {
    throw new Error('Generated WHAT_IF publication does not match preflight Base selection')
  }

  mkdirSync(paths.generatedDir, { recursive: true })
  for (const alternative of generated.alternatives) {
    const planned = paths.alternatives.find((item) => item.id === alternative.run.id)
    if (!planned) throw new Error(`Unexpected generated alternative ${alternative.run.id}`)
    writeJsonExclusive(planned.runPath, alternative.run)
    writeJsonExclusive(planned.routePath, alternative.routeCollection)
  }
  writeJsonExclusive(paths.catalogPath, generated.catalog)

  console.log(`Published WHAT_IF V0 comparison for Base ${generated.base.run.id}`)
  console.log(`Catalog: ${paths.catalogPath}`)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
