import { SCENARIO_IDS, type ScenarioId } from '../scenarioRegistry'
import { requireValidOperationalRun } from './validation'
import {
  OPERATIONAL_RUN_MODES,
  type OperationalRun,
  type OperationalRunManifest,
  type OperationalRunManifestEntry,
} from './types'

const RUN_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/i
const RUN_ARTIFACT_PATH = /^\.\/generated\/[a-z0-9]+(?:-[a-z0-9]+)*\.json$/i
const ROUTE_ARTIFACT_PATH = /^\.\/generated\/[a-z0-9]+(?:-[a-z0-9]+)*\.routes\.geojson$/i
const CONTEXT_ARTIFACT_PATH = /^\.\/generated\/[a-z0-9]+(?:-[a-z0-9]+)*\.context\.json$/i
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/
const ISO_TIMESTAMP_WITH_ZONE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(Z|[+-]\d{2}:\d{2})$/

export type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isRealIsoDate(value: unknown): value is string {
  if (typeof value !== 'string' || !ISO_DATE.test(value)) return false

  const [year, month, day] = value.split('-').map(Number)
  const candidate = new Date(Date.UTC(year, month - 1, day))

  return candidate.getUTCFullYear() === year
    && candidate.getUTCMonth() === month - 1
    && candidate.getUTCDate() === day
}

function isIsoTimestamp(value: unknown): value is string {
  if (typeof value !== 'string') return false

  const match = ISO_TIMESTAMP_WITH_ZONE.exec(value)
  if (!match) return false

  const [, yearText, monthText, dayText, hourText, minuteText, secondText, zone] = match
  if (!isRealIsoDate(`${yearText}-${monthText}-${dayText}`)) return false

  const hour = Number(hourText)
  const minute = Number(minuteText)
  const second = Number(secondText)
  if (hour > 23 || minute > 59 || second > 59) return false

  if (zone !== 'Z') {
    const offsetHour = Number(zone.slice(1, 3))
    const offsetMinute = Number(zone.slice(4, 6))
    if (offsetHour > 23 || offsetMinute > 59) return false
  }

  return Number.isFinite(Date.parse(value))
}

function matchesArtifactPath(value: unknown, pattern: RegExp): value is string {
  return typeof value === 'string' && pattern.test(value)
}

function validateManifestEntry(
  value: unknown,
  index: number,
  schemaVersion: 1 | 2,
): string[] {
  if (!isRecord(value)) return [`Operational run manifest entry ${index} must be an object`]

  const errors: string[] = []
  const prefix = `Operational run manifest entry ${index}`

  if (typeof value.id !== 'string' || !RUN_ID.test(value.id)) {
    errors.push(`${prefix} id is invalid`)
  }

  if (!isRealIsoDate(value.targetDate)) {
    errors.push(`${prefix} targetDate is invalid`)
  }

  if (!isIsoTimestamp(value.issuedAt)) {
    errors.push(`${prefix} issuedAt is invalid`)
  }

  if (!isIsoTimestamp(value.dataAsOf)) {
    errors.push(`${prefix} dataAsOf is invalid`)
  }

  if (
    isIsoTimestamp(value.issuedAt)
    && isIsoTimestamp(value.dataAsOf)
    && Date.parse(value.dataAsOf) > Date.parse(value.issuedAt)
  ) {
    errors.push(`${prefix} dataAsOf cannot be later than issuedAt`)
  }

  if (!OPERATIONAL_RUN_MODES.some((mode) => mode === value.mode)) {
    errors.push(`${prefix} mode is invalid`)
  }

  if (!SCENARIO_IDS.some((scenarioId) => scenarioId === value.scenarioId)) {
    errors.push(`${prefix} scenarioId is invalid`)
  }

  if (typeof value.modelVersion !== 'string' || value.modelVersion.trim() === '') {
    errors.push(`${prefix} modelVersion is required`)
  }

  if (!matchesArtifactPath(value.artifact, RUN_ARTIFACT_PATH)) {
    errors.push(`${prefix} artifact path is invalid`)
  }

  if (schemaVersion === 1) {
    if ('routeArtifact' in value) {
      errors.push(`${prefix} routeArtifact is not allowed for schemaVersion 1`)
    }
    if ('contextArtifact' in value) {
      errors.push(`${prefix} contextArtifact is not allowed for schemaVersion 1`)
    }
  } else {
    if (!matchesArtifactPath(value.routeArtifact, ROUTE_ARTIFACT_PATH)) {
      errors.push(`${prefix} routeArtifact path is invalid`)
    }
    if (
      value.contextArtifact !== undefined
      && !matchesArtifactPath(value.contextArtifact, CONTEXT_ARTIFACT_PATH)
    ) {
      errors.push(`${prefix} contextArtifact path is invalid`)
    }
  }

  return errors
}

export function validateOperationalRunManifest(value: unknown): string[] {
  if (!isRecord(value)) return ['Operational run manifest must be an object']

  const errors: string[] = []

  if (value.schemaVersion !== 1 && value.schemaVersion !== 2) {
    errors.push('Operational run manifest schemaVersion must be 1 or 2')
    return errors
  }
  const schemaVersion = value.schemaVersion

  if (!Array.isArray(value.runs)) {
    errors.push('Operational run manifest runs must be an array')
    return errors
  }

  const seenIds = new Set<string>()
  const seenArtifacts = new Set<string>()
  const seenRouteArtifacts = new Set<string>()
  const seenContextArtifacts = new Set<string>()

  value.runs.forEach((entry, index) => {
    errors.push(...validateManifestEntry(entry, index, schemaVersion))

    if (!isRecord(entry)) return

    if (typeof entry.id === 'string') {
      if (seenIds.has(entry.id)) {
        errors.push(`Duplicate run id: ${entry.id}`)
      } else {
        seenIds.add(entry.id)
      }
    }

    if (typeof entry.artifact === 'string') {
      if (seenArtifacts.has(entry.artifact)) {
        errors.push(`Duplicate artifact path: ${entry.artifact}`)
      } else {
        seenArtifacts.add(entry.artifact)
      }
    }

    if (schemaVersion === 2 && typeof entry.routeArtifact === 'string') {
      if (seenRouteArtifacts.has(entry.routeArtifact)) {
        errors.push(`Duplicate routeArtifact path: ${entry.routeArtifact}`)
      } else {
        seenRouteArtifacts.add(entry.routeArtifact)
      }
    }

    if (schemaVersion === 2 && typeof entry.contextArtifact === 'string') {
      if (seenContextArtifacts.has(entry.contextArtifact)) {
        errors.push(`Duplicate contextArtifact path: ${entry.contextArtifact}`)
      } else {
        seenContextArtifacts.add(entry.contextArtifact)
      }
    }
  })

  return errors
}

export function requireValidOperationalRunManifest(value: unknown): OperationalRunManifest {
  const errors = validateOperationalRunManifest(value)
  if (errors.length > 0) {
    throw new Error(`Operational run manifest is invalid: ${errors.join('; ')}`)
  }
  return value as OperationalRunManifest
}

export function selectDefaultRunEntry(
  manifest: OperationalRunManifest,
  scenarioId: ScenarioId,
  operationalDate: string,
): OperationalRunManifestEntry | null {
  const entries: OperationalRunManifestEntry[] = [...manifest.runs]
  const scenarioEntries = entries
    .filter((run) => run.scenarioId === scenarioId)
    .sort((a, b) => a.targetDate.localeCompare(b.targetDate) || a.id.localeCompare(b.id))

  const exact = scenarioEntries.find((entry) => entry.targetDate === operationalDate)
  if (exact) return exact

  const past = scenarioEntries.filter((entry) => entry.targetDate < operationalDate)
  if (past.length > 0) return past.at(-1) ?? null

  return scenarioEntries[0] ?? null
}

export function resolveOperationalArtifactUrl(
  manifestUrl: string,
  artifact: string,
  kind: 'run' | 'route' | 'context',
): string {
  const pattern = kind === 'run'
    ? RUN_ARTIFACT_PATH
    : kind === 'route'
      ? ROUTE_ARTIFACT_PATH
      : CONTEXT_ARTIFACT_PATH

  if (!matchesArtifactPath(artifact, pattern)) {
    throw new Error(`Unsafe operational ${kind} artifact path: ${artifact}`)
  }

  const slash = manifestUrl.lastIndexOf('/')
  const base = slash >= 0 ? manifestUrl.slice(0, slash + 1) : './'
  return `${base}${artifact.replace(/^\.\//, '')}`
}

export function resolveOperationalRunArtifactUrl(manifestUrl: string, artifact: string): string {
  return resolveOperationalArtifactUrl(manifestUrl, artifact, 'run')
}

export async function loadOperationalRunManifest(
  manifestUrl: string,
  fetcher: FetchLike = fetch,
): Promise<OperationalRunManifest> {
  const response = await fetcher(manifestUrl)
  if (!response.ok) {
    throw new Error(`Operational run manifest fetch failed with HTTP ${response.status}`)
  }

  const payload = await response.json()
  return requireValidOperationalRunManifest(payload)
}

function assertEntryMatchesRun(
  entry: OperationalRunManifestEntry,
  run: OperationalRun,
): void {
  const keys = [
    'id',
    'targetDate',
    'issuedAt',
    'dataAsOf',
    'mode',
    'scenarioId',
    'modelVersion',
  ] as const

  for (const key of keys) {
    if (entry[key] !== run[key]) {
      throw new Error(`Operational run manifest mismatch for ${key}`)
    }
  }
}

export async function loadOperationalRun(
  entry: OperationalRunManifestEntry,
  manifestUrl: string,
  fetcher: FetchLike = fetch,
): Promise<OperationalRun> {
  const artifactUrl = resolveOperationalRunArtifactUrl(manifestUrl, entry.artifact)
  const response = await fetcher(artifactUrl)

  if (!response.ok) {
    throw new Error(`Operational run artifact fetch failed with HTTP ${response.status}`)
  }

  const payload = await response.json()
  const run = requireValidOperationalRun(payload)
  assertEntryMatchesRun(entry, run)
  return run
}
