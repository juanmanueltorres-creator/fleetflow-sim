import {
  assertRouteCollectionMatchesRun,
  routeCollectionToIndex,
  type RouteGeometryCollection,
} from '../../map/routeAssets'
import {
  loadOperationalRun,
  resolveOperationalArtifactUrl,
  type FetchLike,
} from './catalog'
import type {
  OperationalContextEnvelope,
  OperationalContextLoadState,
  OperationalRun,
  OperationalRunManifestEntry,
  OperationalRunManifestEntryV2,
} from './types'

export interface OperationalBundle {
  manifestEntry: OperationalRunManifestEntry
  run: OperationalRun
  routes: RouteGeometryCollection
  context: OperationalContextLoadState
}

export interface LoadOperationalBundleOptions {
  entry: OperationalRunManifestEntry
  manifestUrl: string
  legacyRouteAsset?: string
  fetcher?: FetchLike
}

function isV2Entry(
  entry: OperationalRunManifestEntry,
): entry is OperationalRunManifestEntryV2 {
  return typeof (entry as OperationalRunManifestEntryV2).routeArtifact === 'string'
}

async function loadRouteCollection(
  url: string,
  fetcher: FetchLike,
): Promise<RouteGeometryCollection> {
  const response = await fetcher(url)
  if (!response.ok) {
    throw new Error(`Operational route artifact fetch failed with HTTP ${response.status}`)
  }

  const payload = await response.json()
  if (
    typeof payload !== 'object'
    || payload === null
    || Array.isArray(payload)
    || (payload as { type?: unknown }).type !== 'FeatureCollection'
    || !Array.isArray((payload as { features?: unknown }).features)
  ) {
    throw new Error('Operational route artifact must be a GeoJSON FeatureCollection')
  }

  return payload as RouteGeometryCollection
}

function parseContextEnvelope(
  value: unknown,
  run: OperationalRun,
): OperationalContextEnvelope {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('Operational context artifact must be an object')
  }

  const artifact = value as Record<string, unknown>
  const expected = {
    runId: run.id,
    targetDate: run.targetDate,
    modelVersion: run.modelVersion,
  } as const

  for (const key of Object.keys(expected) as Array<keyof typeof expected>) {
    if (artifact[key] !== expected[key]) {
      throw new Error(`Operational context ${key} mismatch`)
    }
  }

  return artifact as OperationalContextEnvelope
}

export async function loadOperationalBundle(
  options: LoadOperationalBundleOptions,
): Promise<OperationalBundle> {
  const fetcher = options.fetcher ?? fetch
  const run = await loadOperationalRun(options.entry, options.manifestUrl, fetcher)
  const v2Entry = isV2Entry(options.entry) ? options.entry : null

  const routeUrl = v2Entry
    ? resolveOperationalArtifactUrl(options.manifestUrl, v2Entry.routeArtifact, 'route')
    : options.legacyRouteAsset

  if (!routeUrl) {
    throw new Error('Legacy operational run requires a scenario route asset')
  }

  const routes = await loadRouteCollection(routeUrl, fetcher)
  routeCollectionToIndex(routes, run.scenario)
  if (v2Entry) {
    assertRouteCollectionMatchesRun(routes, run)
  }

  let context: OperationalContextLoadState = { status: 'omitted' }
  if (v2Entry?.contextArtifact) {
    try {
      const url = resolveOperationalArtifactUrl(
        options.manifestUrl,
        v2Entry.contextArtifact,
        'context',
      )
      const response = await fetcher(url)
      if (!response.ok) {
        throw new Error(`Operational context artifact fetch failed with HTTP ${response.status}`)
      }
      context = {
        status: 'available',
        artifact: parseContextEnvelope(await response.json(), run),
      }
    } catch (error) {
      context = {
        status: 'unavailable',
        reason: error instanceof Error ? error.message : 'Unknown operational context error',
      }
    }
  }

  return {
    manifestEntry: options.entry,
    run,
    routes,
    context,
  }
}
