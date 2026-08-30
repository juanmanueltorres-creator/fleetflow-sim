import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import {
  generateCalibratedScenario,
  hashSeed,
  loadRouteGeometryIndex,
  mulberry32,
} from './lib/calibrated-scenario-generator.mjs'

const OPERATIONAL_TIME_ZONE = 'America/Argentina/Cordoba'
const GEOGRAPHY_SEED = 'fleetflow-cordoba-v0.4'
const SCENARIO_ID = 'cordoba-calibrated'
const MODEL_VERSION = 'fleetflow-v0.5'
const GENERATOR = 'daily-calibrated-v1'
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/
const ISO_TIMESTAMP_WITH_ZONE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(Z|[+-]\d{2}:\d{2})$/
const RUN_SUFFIX = /^[A-Za-z0-9]+(?:-[A-Za-z0-9]+)*$/
const WEEKLY_PROFILES = new Map(
  JSON.parse(
    readFileSync(new URL('../src/scenario/operationalRuns/weekly-profile.json', import.meta.url), 'utf8'),
  ).map((profile) => [profile.day, profile]),
)

function parseArgs(argv) {
  const args = {}
  const knownFlags = new Set([
    '--profile',
    '--routes',
    '--from',
    '--to',
    '--issued-at',
    '--data-as-of',
    '--output-dir',
    '--run-suffix',
  ])

  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index]
    if (!knownFlags.has(flag)) throw new Error(`Unknown argument: ${flag}`)
    const value = argv[index + 1]
    if (value === undefined || knownFlags.has(value)) throw new Error(`Missing value for ${flag}`)
    args[flag] = value
    index += 1
  }

  for (const flag of knownFlags) {
    if (typeof args[flag] !== 'string' || args[flag].trim() === '') {
      throw new Error(`Missing required argument: ${flag}`)
    }
  }

  return args
}

function isRealIsoDate(value) {
  if (typeof value !== 'string' || !ISO_DATE.test(value)) return false
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

function requireIsoTimestampWithZone(value, label) {
  const match = ISO_TIMESTAMP_WITH_ZONE.exec(value)
  if (!match) {
    throw new Error(`Invalid ${label}: expected ISO timestamp with explicit zone`)
  }

  const [, yearText, monthText, dayText, hourText, minuteText, secondText, zone] = match
  const hour = Number(hourText)
  const minute = Number(minuteText)
  const second = Number(secondText)

  if (!isRealIsoDate(`${yearText}-${monthText}-${dayText}`)
    || hour > 23
    || minute > 59
    || second > 59) {
    throw new Error(`Invalid ${label}: expected ISO timestamp with explicit zone`)
  }

  if (zone !== 'Z') {
    const offsetHour = Number(zone.slice(1, 3))
    const offsetMinute = Number(zone.slice(4, 6))
    if (offsetHour > 23 || offsetMinute > 59) {
      throw new Error(`Invalid ${label}: expected ISO timestamp with explicit zone`)
    }
  }

  if (!Number.isFinite(Date.parse(value))) {
    throw new Error(`Invalid ${label}: expected ISO timestamp with explicit zone`)
  }

  return value
}

function getCordobaDate(timestamp) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: OPERATIONAL_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(timestamp))
  const byType = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return `${byType.year}-${byType.month}-${byType.day}`
}

function weeklyProfileForDate(targetDate) {
  const day = new Date(`${targetDate}T00:00:00Z`).getUTCDay()
  const profile = WEEKLY_PROFILES.get(day)
  if (!profile) throw new Error(`Missing weekly operational profile for day ${day}`)
  return profile
}

function dailyPackageTarget(targetDate, demandMultiplier) {
  const random = mulberry32(hashSeed(`fleetflow:v0.5:cordoba:${targetDate}:demand`))
  const dailyJitter = 0.97 + random() * 0.06
  return Math.round(100 * demandMultiplier * dailyJitter)
}

function main() {
  const args = parseArgs(process.argv.slice(2))
  const from = args['--from']
  const to = args['--to']
  const issuedAt = requireIsoTimestampWithZone(args['--issued-at'], 'issued-at')
  const dataAsOf = requireIsoTimestampWithZone(args['--data-as-of'], 'data-as-of')
  const runSuffix = args['--run-suffix']
  const dates = operationalDates(from, to)

  if (Date.parse(dataAsOf) > Date.parse(issuedAt)) {
    throw new Error('Invalid data-as-of: cannot be later than issued-at')
  }
  if (!RUN_SUFFIX.test(runSuffix)) {
    throw new Error('Invalid run-suffix')
  }

  const profilePath = resolve(args['--profile'])
  const routesPath = resolve(args['--routes'])
  const outputDir = resolve(args['--output-dir'])
  const generatedDir = join(outputDir, 'generated')
  const manifestPath = join(outputDir, 'manifest.json')

  if (existsSync(manifestPath)) {
    throw new Error(`Operational run manifest already exists: ${manifestPath}`)
  }

  const plannedArtifacts = dates.map((targetDate) => {
    const id = `cordoba-${targetDate}-${runSuffix}`
    return {
      id,
      targetDate,
      artifactPath: join(generatedDir, `${id}.json`),
      artifact: `./generated/${id}.json`,
    }
  })

  for (const artifact of plannedArtifacts) {
    if (existsSync(artifact.artifactPath)) {
      throw new Error(`Operational run artifact already exists: ${artifact.artifactPath}`)
    }
  }

  const profile = JSON.parse(readFileSync(profilePath, 'utf8'))
  const routeGeometryIndex = loadRouteGeometryIndex(routesPath)
  const issuedOperationalDate = getCordobaDate(issuedAt)

  const generated = plannedArtifacts.map(({ id, targetDate, artifactPath, artifact }) => {
    const operationsSeed = `fleetflow:v0.5:cordoba:${targetDate}`
    const mode = targetDate > issuedOperationalDate ? 'FORECAST' : 'SIMULATED'
    const weeklyProfile = weeklyProfileForDate(targetDate)
    const scenario = generateCalibratedScenario({
      profile,
      routeGeometryIndex,
      operationsSeed,
      geographySeed: GEOGRAPHY_SEED,
      packageTarget: dailyPackageTarget(targetDate, weeklyProfile.demandMultiplier),
      travelTimeMultiplier: weeklyProfile.travelTimeMultiplier,
    })

    const run = {
      id,
      targetDate,
      issuedAt,
      dataAsOf,
      mode,
      modelVersion: MODEL_VERSION,
      scenarioId: SCENARIO_ID,
      provenance: {
        generator: GENERATOR,
        seed: operationsSeed,
        notes: [
          mode === 'FORECAST'
            ? 'Synthetic/calibrated operational forecast; not observed Córdoba delivery data.'
            : 'Synthetic/calibrated replay; not observed Córdoba delivery data.',
          `${weeklyProfile.dayLabel}: ${weeklyProfile.intensityLabel}; weekly demand and travel cadence profile.`,
        ],
      },
      scenario,
    }

    return {
      artifactPath,
      run,
      manifestEntry: {
        id,
        targetDate,
        issuedAt,
        dataAsOf,
        mode,
        scenarioId: SCENARIO_ID,
        modelVersion: MODEL_VERSION,
        artifact,
      },
    }
  })

  mkdirSync(generatedDir, { recursive: true })
  for (const { artifactPath, run } of generated) {
    writeFileSync(artifactPath, `${JSON.stringify(run, null, 2)}\n`, 'utf8')
  }

  const manifest = {
    schemaVersion: 1,
    runs: generated.map(({ manifestEntry }) => manifestEntry),
  }
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
}

main()
