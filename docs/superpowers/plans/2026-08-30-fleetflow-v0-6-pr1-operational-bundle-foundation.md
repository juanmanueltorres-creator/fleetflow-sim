# FleetFlow V0.6 PR1 — Operational Bundle Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add manifest V2 support and atomically load a validated operational run + matching route geometry bundle while preserving V0.5 manifest V1 behavior and the last valid rendered operation on failed date switches.

**Architecture:** Keep `FleetScenario` and the simulation engine unchanged. Extend the operational catalog into a discriminated V1/V2 manifest reader, add a focused `OperationalBundle` loader that validates run/route identity before returning, and refactor `App.tsx` so timeline scenarios commit one complete bundle instead of independently committing run and route state. V1 runs continue to resolve the scenario-level `routeAsset`; V2 runs resolve their own `routeArtifact` and optionally attempt a non-fatal `contextArtifact` envelope.

**Tech Stack:** React 19.1.1, TypeScript 5.7.2, Vite 6.1.0, Vitest 3.0.5, GeoJSON types, existing MapLibre/Turf runtime.

**Spec:** `docs/superpowers/specs/2026-08-30-fleetflow-v0-6-cordoba-operational-context-design.md`

## Global Constraints

- Preserve exactly **8 vehicles** as the V0.6 fleet invariant; PR1 does not yet change V0.5 fixed geography.
- Preserve the existing date-agnostic `FleetScenario` and simulation engine contracts.
- Preserve historical V0.5 artifacts and manifest V1 semantics; do not rewrite existing generated V0.5 JSON.
- Manifest V1 uses the scenario-level `routeAsset`; manifest V2 requires an entry-level `routeArtifact`.
- Run artifact and matching route artifact are required for a V2 operational bundle.
- `contextArtifact` is optional and must fail independently from the run + route bundle.
- A V2 route artifact must bind to the same `runId`, `targetDate`, and `modelVersion` as the selected run.
- A new date is committed only after the complete required bundle validates.
- Failed date switching must retain the previous valid bundle and simulation surface.
- No browser-side routing, live provider calls, backend, OR-Tools, ML, or V0.6 spatial-demand generation in PR1.
- TDD is mandatory: every behavior change starts RED, then minimal GREEN, then refactor.
- Full completion gate: `npm test` and `npm run build` both pass.

---

## File Structure

### Files modified

- `src/scenario/operationalRuns/types.ts` — discriminated manifest V1/V2 types and bundle/context-envelope types shared by runtime code.
- `src/scenario/operationalRuns/catalog.ts` — safe V1/V2 manifest validation, artifact URL resolution, run loading, and identity checks.
- `src/map/routeAssets.ts` — route collection binding metadata types and run-binding assertion for V2 artifacts; existing topology validation remains unchanged.
- `src/App.tsx` — timeline state moves from separately committed `activeRun` + `routes` to one committed `OperationalBundle`; static scenarios retain the existing scenario-level route path.
- `tests/operationalRunCatalog.test.ts` — V1 regression plus V2 manifest/path validation.
- `tests/routeAssets.test.ts` — V2 route metadata binding tests.
- `tests/operationalRunSwitching.test.tsx` — atomic switch and previous-valid-bundle retention regression coverage.

### Files created

- `src/scenario/operationalRuns/bundle.ts` — sole responsibility: load and validate the required run/route pair, degrade optional context independently, and return `OperationalBundle`.
- `tests/operationalBundle.test.ts` — focused unit tests for bundle loading, V1 fallback route resolution, V2 route binding, and optional-context degradation.

### Files intentionally untouched in PR1

- `scripts/generate-operational-runs.mjs` — remains V0.5/V1 until PR2 creates actual variable-geography V0.6 runs.
- `scripts/lib/calibrated-scenario-generator.mjs` — fixed stop counts stay historical V0.5 behavior until PR2.
- `public/data/operational-runs/manifest.json` — stays schema V1 in PR1; V2 support is introduced safely before any production V2 artifact is published.
- `src/simulation/*` — no engine changes.

---

### Task 1: Add discriminated manifest V1/V2 and operational-bundle contracts

**Files:**
- Modify: `src/scenario/operationalRuns/types.ts`
- Modify: `tests/operationalRunCatalog.test.ts`

**Interfaces:**
- Consumes: existing `OperationalRun`, `OperationalRunMode`, `ScenarioId`, and `FleetScenario`.
- Produces:
  - `OperationalRunManifestEntryBase`
  - `OperationalRunManifestEntryV1`
  - `OperationalRunManifestEntryV2`
  - `OperationalRunManifestEntry`
  - `OperationalRunManifestV1`
  - `OperationalRunManifestV2`
  - `OperationalRunManifest`
  - `OperationalContextEnvelope`
  - `OperationalContextLoadState`
  - `OperationalBundle`

- [ ] **Step 1: Write the failing type/behavior test for schema V2 acceptance**

Add a V2 helper and assertion in `tests/operationalRunCatalog.test.ts`:

```ts
import type {
  OperationalRunManifestEntryV2,
  OperationalRunManifestV2,
} from '../src/scenario/operationalRuns/types'

function entryV2(
  overrides: Partial<OperationalRunManifestEntryV2> = {},
): OperationalRunManifestEntryV2 {
  return {
    id: 'cordoba-2026-08-31-v3',
    targetDate: '2026-08-31',
    issuedAt: '2026-08-30T21:00:00-03:00',
    dataAsOf: '2026-08-30T21:00:00-03:00',
    mode: 'FORECAST',
    scenarioId: 'cordoba-calibrated',
    modelVersion: 'fleetflow-v0.6',
    artifact: './generated/cordoba-2026-08-31-v3.json',
    routeArtifact: './generated/cordoba-2026-08-31-v3.routes.geojson',
    contextArtifact: './generated/cordoba-2026-08-31-v3.context.json',
    ...overrides,
  }
}

function manifestV2(
  runs: OperationalRunManifestEntryV2[] = [entryV2()],
): OperationalRunManifestV2 {
  return { schemaVersion: 2, runs }
}

it('accepts manifest V2 entries with required route artifacts', () => {
  expect(validateOperationalRunManifest(manifestV2())).toEqual([])
  expect(requireValidOperationalRunManifest(manifestV2()).schemaVersion).toBe(2)
})
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
npm test -- tests/operationalRunCatalog.test.ts
```

Expected: TypeScript/test failure because V2 manifest types do not exist and schema version 2 is rejected.

- [ ] **Step 3: Replace the single V1 manifest contract with discriminated V1/V2 types**

In `src/scenario/operationalRuns/types.ts`, keep existing run types and replace the manifest section with:

```ts
export interface OperationalRunManifestEntryBase {
  id: string
  targetDate: string
  issuedAt: string
  dataAsOf: string
  mode: OperationalRunMode
  scenarioId: ScenarioId
  modelVersion: string
  artifact: string
}

export interface OperationalRunManifestEntryV1 extends OperationalRunManifestEntryBase {
  routeArtifact?: never
  contextArtifact?: never
}

export interface OperationalRunManifestEntryV2 extends OperationalRunManifestEntryBase {
  routeArtifact: string
  contextArtifact?: string
}

export type OperationalRunManifestEntry =
  | OperationalRunManifestEntryV1
  | OperationalRunManifestEntryV2

export interface OperationalRunManifestV1 {
  schemaVersion: 1
  runs: OperationalRunManifestEntryV1[]
}

export interface OperationalRunManifestV2 {
  schemaVersion: 2
  runs: OperationalRunManifestEntryV2[]
}

export type OperationalRunManifest = OperationalRunManifestV1 | OperationalRunManifestV2

export interface OperationalContextEnvelope {
  runId: string
  targetDate: string
  modelVersion: string
  [key: string]: unknown
}

export type OperationalContextLoadState =
  | { status: 'omitted' }
  | { status: 'available'; artifact: OperationalContextEnvelope }
  | { status: 'unavailable'; reason: string }

export interface OperationalBundle {
  manifestEntry: OperationalRunManifestEntry
  run: OperationalRun
  routes: import('../../map/routeAssets').RouteGeometryCollection
  context: OperationalContextLoadState
}
```

Use a type-only import instead of the inline `import()` if lint/type style is clearer, but do not introduce runtime circular dependencies.

- [ ] **Step 4: Run TypeScript and focused test**

Run:

```bash
npx tsc -b --pretty false
npm test -- tests/operationalRunCatalog.test.ts
```

Expected: compilation proceeds far enough to expose catalog validation as the remaining V2 failure; V1 tests remain type-compatible.

- [ ] **Step 5: Commit the contract change**

```bash
git add src/scenario/operationalRuns/types.ts tests/operationalRunCatalog.test.ts
git commit -m "feat: add operational manifest v2 contracts"
```

---

### Task 2: Make catalog validation and path resolution schema-aware and fail-closed

**Files:**
- Modify: `src/scenario/operationalRuns/catalog.ts`
- Modify: `tests/operationalRunCatalog.test.ts`

**Interfaces:**
- Consumes: `OperationalRunManifestV1`, `OperationalRunManifestV2`, `OperationalRunManifestEntry` from Task 1.
- Produces:
  - `isOperationalRunManifestEntryV2(entry, manifest): boolean` is not required as public API; narrowing can stay local.
  - `resolveOperationalArtifactUrl(manifestUrl, artifact, kind)` or equivalent focused safe resolver.
  - `validateOperationalRunManifest(value): string[]` accepting only schema 1 or 2 with schema-specific fields.
  - `requireValidOperationalRunManifest(value): OperationalRunManifest`.

- [ ] **Step 1: Add RED tests for V2 required fields and path security**

Add these cases to `tests/operationalRunCatalog.test.ts`:

```ts
it('rejects V2 without routeArtifact', () => {
  const invalid = {
    schemaVersion: 2,
    runs: [{ ...entryV2(), routeArtifact: undefined }],
  }
  expect(validateOperationalRunManifest(invalid)).toContainEqual(
    expect.stringMatching(/routeArtifact/i),
  )
})

it.each([
  '../escape.geojson',
  './generated/../escape.geojson',
  'https://example.com/routes.geojson',
  '.\\generated\\routes.geojson',
  './other/routes.geojson',
])('rejects unsafe V2 route artifact path %s', (routeArtifact) => {
  expect(validateOperationalRunManifest(manifestV2([
    entryV2({ routeArtifact }),
  ]))).toContainEqual(expect.stringMatching(/routeArtifact/i))
})

it('accepts V2 with omitted optional contextArtifact', () => {
  const { contextArtifact: _ignored, ...withoutContext } = entryV2()
  expect(validateOperationalRunManifest({
    schemaVersion: 2,
    runs: [withoutContext],
  })).toEqual([])
})

it('rejects V1 entries that smuggle V2 artifact fields', () => {
  const invalid = {
    schemaVersion: 1,
    runs: [{
      ...entry(),
      routeArtifact: './generated/cordoba-2026-08-31-v3.routes.geojson',
    }],
  }
  expect(validateOperationalRunManifest(invalid)).toContainEqual(
    expect.stringMatching(/routeArtifact.*schemaVersion 1/i),
  )
})
```

Also change the old unsupported-version test to reject `schemaVersion: 3`, not 2.

- [ ] **Step 2: Run RED**

```bash
npm test -- tests/operationalRunCatalog.test.ts
```

Expected: V2 cases fail because `catalog.ts` only accepts schema 1 and only validates `.json` run artifacts.

- [ ] **Step 3: Introduce distinct safe artifact patterns**

In `catalog.ts`, replace the single `ARTIFACT_PATH` with:

```ts
const RUN_ARTIFACT_PATH = /^\.\/generated\/[a-z0-9]+(?:-[a-z0-9]+)*\.json$/i
const ROUTE_ARTIFACT_PATH = /^\.\/generated\/[a-z0-9]+(?:-[a-z0-9]+)*\.routes\.geojson$/i
const CONTEXT_ARTIFACT_PATH = /^\.\/generated\/[a-z0-9]+(?:-[a-z0-9]+)*\.context\.json$/i

function matchesArtifactPath(value: unknown, pattern: RegExp): value is string {
  return typeof value === 'string' && pattern.test(value)
}
```

Keep resolution relative to the manifest directory; never accept absolute URLs, `..`, backslashes, query strings, or alternate directories.

- [ ] **Step 4: Split manifest entry validation by schema**

Refactor the current `validateManifestEntry` so common metadata is validated once and schema-specific fields are explicit:

```ts
function validateManifestEntry(
  value: unknown,
  index: number,
  schemaVersion: 1 | 2,
): string[] {
  // existing common id/date/time/mode/scenario/model checks

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
```

At manifest level:

```ts
if (value.schemaVersion !== 1 && value.schemaVersion !== 2) {
  errors.push('Operational run manifest schemaVersion must be 1 or 2')
  return errors
}
```

Track duplicate `artifact`, `routeArtifact`, and `contextArtifact` paths independently where those fields exist.

- [ ] **Step 5: Generalize safe relative resolution without weakening validation**

Replace/extend `resolveOperationalRunArtifactUrl` with a helper that receives an already schema-validated artifact string:

```ts
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
```

Keep the existing exported `resolveOperationalRunArtifactUrl` as a small compatibility wrapper if current tests/imports need it:

```ts
export function resolveOperationalRunArtifactUrl(manifestUrl: string, artifact: string): string {
  return resolveOperationalArtifactUrl(manifestUrl, artifact, 'run')
}
```

- [ ] **Step 6: Run focused tests GREEN**

```bash
npm test -- tests/operationalRunCatalog.test.ts tests/operationalRunCatalogSecurity.test.ts
```

Expected: all catalog/security tests pass, including existing V1 behavior.

- [ ] **Step 7: Commit catalog V2 support**

```bash
git add src/scenario/operationalRuns/catalog.ts tests/operationalRunCatalog.test.ts
git commit -m "feat: validate operational manifest v2"
```

---

### Task 3: Add route-collection run binding metadata without weakening topology validation

**Files:**
- Modify: `src/map/routeAssets.ts`
- Modify: `tests/routeAssets.test.ts`

**Interfaces:**
- Consumes: `OperationalRun` from operational-run types and existing `RouteGeometryCollection` topology validation.
- Produces:
  - `RouteGeometryBinding`
  - optional `metadata` on `RouteGeometryCollection`
  - `assertRouteCollectionMatchesRun(collection, run): void`

- [ ] **Step 1: Add RED route-binding tests**

In `tests/routeAssets.test.ts`, add:

```ts
import { assertRouteCollectionMatchesRun } from '../src/map/routeAssets'
import type { OperationalRun } from '../src/scenario/operationalRuns/types'

it('accepts route collection metadata matching the run', () => {
  const run = validOperationalRunFixture()
  const routes = validRouteCollectionFixture(run.scenario)
  routes.metadata = {
    runId: run.id,
    targetDate: run.targetDate,
    modelVersion: run.modelVersion,
  }

  expect(() => assertRouteCollectionMatchesRun(routes, run)).not.toThrow()
})

it.each([
  ['runId', 'cordoba-other-run'],
  ['targetDate', '2026-09-01'],
  ['modelVersion', 'fleetflow-v9'],
] as const)('rejects route binding mismatch for %s', (field, value) => {
  const run = validOperationalRunFixture()
  const routes = validRouteCollectionFixture(run.scenario)
  routes.metadata = {
    runId: run.id,
    targetDate: run.targetDate,
    modelVersion: run.modelVersion,
    [field]: value,
  }

  expect(() => assertRouteCollectionMatchesRun(routes, run)).toThrow(
    new RegExp(`route.*${field}.*mismatch`, 'i'),
  )
})

it('rejects V2 route collections without binding metadata', () => {
  const run = validOperationalRunFixture()
  const routes = validRouteCollectionFixture(run.scenario)
  expect(() => assertRouteCollectionMatchesRun(routes, run)).toThrow(/route.*metadata/i)
})
```

Use the existing route/scenario fixture style already present in `tests/routeAssets.test.ts`; do not create a duplicate full fixture module solely for these three assertions unless the current file becomes unwieldy.

- [ ] **Step 2: Run RED**

```bash
npm test -- tests/routeAssets.test.ts
```

Expected: failure because collection metadata and assertion do not exist.

- [ ] **Step 3: Extend the collection type and add the binding assertion**

In `src/map/routeAssets.ts`:

```ts
import type { OperationalRun } from '../scenario/operationalRuns/types'

export interface RouteGeometryBinding {
  runId: string
  targetDate: string
  modelVersion: string
}

export type RouteGeometryCollection = FeatureCollection<LineString, RouteGeometryProperties> & {
  metadata?: RouteGeometryBinding
}

export function assertRouteCollectionMatchesRun(
  collection: RouteGeometryCollection,
  run: OperationalRun,
): void {
  const metadata = collection.metadata
  if (!metadata) {
    throw new Error('Route collection binding metadata is required')
  }

  const expected = {
    runId: run.id,
    targetDate: run.targetDate,
    modelVersion: run.modelVersion,
  } as const

  for (const key of Object.keys(expected) as Array<keyof typeof expected>) {
    if (metadata[key] !== expected[key]) {
      throw new Error(`Route ${key} mismatch`)
    }
  }
}
```

Do **not** change `routeCollectionToIndex`; its existing strict checks for feature IDs, truck IDs, waypoint count, finite/non-decreasing distances, and positive route distance remain mandatory and independent from run-binding metadata.

- [ ] **Step 4: Run route tests GREEN**

```bash
npm test -- tests/routeAssets.test.ts
```

Expected: all existing topology tests and new binding tests pass.

- [ ] **Step 5: Commit route binding**

```bash
git add src/map/routeAssets.ts tests/routeAssets.test.ts
git commit -m "feat: bind route artifacts to operational runs"
```

---

### Task 4: Implement the focused OperationalBundle loader with V1 fallback and optional-context degradation

**Files:**
- Create: `src/scenario/operationalRuns/bundle.ts`
- Create: `tests/operationalBundle.test.ts`

**Interfaces:**
- Consumes:
  - `loadOperationalRun(entry, manifestUrl, fetcher)`
  - `resolveOperationalArtifactUrl(manifestUrl, artifact, kind)`
  - `routeCollectionToIndex(collection, scenario)`
  - `assertRouteCollectionMatchesRun(collection, run)`
  - `OperationalRunManifest`, `OperationalRunManifestEntry`, `OperationalBundle`
- Produces:

```ts
export interface LoadOperationalBundleOptions {
  entry: OperationalRunManifestEntry
  manifest: OperationalRunManifest
  manifestUrl: string
  legacyRouteAsset?: string
  fetcher?: FetchLike
}

export async function loadOperationalBundle(
  options: LoadOperationalBundleOptions,
): Promise<OperationalBundle>
```

- [ ] **Step 1: Create RED tests for V1, V2, mismatch, and optional context**

Create `tests/operationalBundle.test.ts` with focused fixtures and these behaviors:

```ts
import { describe, expect, it, vi } from 'vitest'
import { loadOperationalBundle } from '../src/scenario/operationalRuns/bundle'

it('loads a V1 run using the supplied legacy scenario route asset', async () => {
  const { manifest, entry, run, routes } = v1Fixtures()
  const fetcher = routedFetcher({
    './data/operational-runs/generated/cordoba-2026-08-31-v2.json': run,
    './data/cordoba-calibrated-routes.geojson': routes,
  })

  const bundle = await loadOperationalBundle({
    entry,
    manifest,
    manifestUrl: './data/operational-runs/manifest.json',
    legacyRouteAsset: './data/cordoba-calibrated-routes.geojson',
    fetcher,
  })

  expect(bundle.run).toEqual(run)
  expect(bundle.routes).toEqual(routes)
  expect(bundle.context).toEqual({ status: 'omitted' })
})

it('loads V2 run and matching per-run routes', async () => {
  const { manifest, entry, run, routes } = v2Fixtures()
  const fetcher = routedFetcher({
    './data/operational-runs/generated/cordoba-2026-08-31-v3.json': run,
    './data/operational-runs/generated/cordoba-2026-08-31-v3.routes.geojson': routes,
  })

  await expect(loadOperationalBundle({
    entry,
    manifest,
    manifestUrl: './data/operational-runs/manifest.json',
    fetcher,
  })).resolves.toMatchObject({ run, routes, context: { status: 'omitted' } })
})

it('rejects V2 route geometry bound to another run', async () => {
  const fixture = v2Fixtures()
  fixture.routes.metadata!.runId = 'cordoba-2026-08-30-v3'
  const fetcher = routedFetcher(v2Responses(fixture))

  await expect(loadOperationalBundle({
    entry: fixture.entry,
    manifest: fixture.manifest,
    manifestUrl: './data/operational-runs/manifest.json',
    fetcher,
  })).rejects.toThrow(/route.*runId.*mismatch/i)
})

it('keeps a valid V2 operation when optional context fetch fails', async () => {
  const fixture = v2Fixtures({ withContext: true })
  const fetcher = routedFetcher(v2Responses(fixture), {
    fail: ['./data/operational-runs/generated/cordoba-2026-08-31-v3.context.json'],
  })

  const bundle = await loadOperationalBundle({
    entry: fixture.entry,
    manifest: fixture.manifest,
    manifestUrl: './data/operational-runs/manifest.json',
    fetcher,
  })

  expect(bundle.context.status).toBe('unavailable')
  expect(bundle.run).toEqual(fixture.run)
  expect(bundle.routes).toEqual(fixture.routes)
})
```

Fixture helpers in this file must return actual valid `FleetScenario` and route data. Reuse `getScenarioDefinition('cordoba-calibrated').scenario` and clone the current checked-in route-shaped fixture pattern rather than stubbing route validation away.

- [ ] **Step 2: Run RED**

```bash
npm test -- tests/operationalBundle.test.ts
```

Expected: module-not-found or missing-function failure for `bundle.ts`.

- [ ] **Step 3: Implement route JSON loading as a private strict helper**

In `bundle.ts`:

```ts
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
    || (payload as { type?: unknown }).type !== 'FeatureCollection'
    || !Array.isArray((payload as { features?: unknown }).features)
  ) {
    throw new Error('Operational route artifact must be a GeoJSON FeatureCollection')
  }

  return payload as RouteGeometryCollection
}
```

Do not reimplement detailed topology checks here; call `routeCollectionToIndex` after loading.

- [ ] **Step 4: Implement V1/V2 route resolution and required validation**

Use the manifest discriminator, not model-version string guessing:

```ts
function isV2(
  manifest: OperationalRunManifest,
  entry: OperationalRunManifestEntry,
): entry is OperationalRunManifestEntryV2 {
  return manifest.schemaVersion === 2 && 'routeArtifact' in entry
}
```

Then:

```ts
const run = await loadOperationalRun(entry, manifestUrl, fetcher)
const routeUrl = isV2(manifest, entry)
  ? resolveOperationalArtifactUrl(manifestUrl, entry.routeArtifact, 'route')
  : legacyRouteAsset

if (!routeUrl) {
  throw new Error('Legacy operational run requires a scenario route asset')
}

const routes = await loadRouteCollection(routeUrl, fetcher)
routeCollectionToIndex(routes, run.scenario)
if (isV2(manifest, entry)) {
  assertRouteCollectionMatchesRun(routes, run)
}
```

- [ ] **Step 5: Implement optional context envelope loading without making it a bundle requirement**

Add private validation limited to the PR1 identity envelope:

```ts
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
```

Load it only for V2 entries with `contextArtifact`. Catch **only that optional branch** and convert it to:

```ts
{ status: 'unavailable', reason: error instanceof Error ? error.message : 'Unknown context error' }
```

Do not catch run or route failures.

- [ ] **Step 6: Return the complete bundle only after all required validation passes**

```ts
return {
  manifestEntry: entry,
  run,
  routes,
  context,
}
```

- [ ] **Step 7: Run focused GREEN tests**

```bash
npm test -- tests/operationalBundle.test.ts tests/routeAssets.test.ts tests/operationalRunCatalog.test.ts
```

Expected: all pass.

- [ ] **Step 8: Commit bundle loader**

```bash
git add src/scenario/operationalRuns/bundle.ts tests/operationalBundle.test.ts
git commit -m "feat: load validated operational bundles"
```

---

### Task 5: Refactor timeline runtime to commit one OperationalBundle atomically

**Files:**
- Modify: `src/App.tsx`
- Modify: `tests/operationalRunSwitching.test.tsx`

**Interfaces:**
- Consumes:
  - `loadOperationalBundle(options): Promise<OperationalBundle>` from Task 4.
  - existing `loadOperationalRunManifest()` and `selectDefaultRunEntry()`.
  - scenario definition `routeAsset` only as legacy V1 fallback/static route source.
- Produces application state:

```ts
const [activeBundle, setActiveBundle] = useState<OperationalBundle | null>(null)
const [selectedRunId, setSelectedRunId] = useState<string | null>(null)
const [pendingRunId, setPendingRunId] = useState<string | null>(null)
```

- [ ] **Step 1: Add RED switching tests for retaining the previous valid operation**

In `tests/operationalRunSwitching.test.tsx`, preserve current success-switch coverage and add a deferred second load. The observable contract is:

```ts
it('keeps the previous valid run rendered while the next bundle is loading', async () => {
  // arrange manifest with Thursday and Friday and resolve Thursday fully
  render(<App />)
  expect(await screen.findByText(/Thursday-specific visible value/i)).toBeInTheDocument()

  // click Friday but hold one required Friday bundle fetch pending
  await user.click(screen.getByRole('button', { name: /Fri/i }))

  expect(screen.getByText(/Loading operational run/i)).toBeInTheDocument()
  expect(screen.getByText(/Thursday-specific visible value/i)).toBeInTheDocument()
})

it('retains the previous valid run if the requested bundle fails', async () => {
  // Thursday succeeds; Friday route response returns HTTP 404
  render(<App />)
  expect(await screen.findByText(/Thursday-specific visible value/i)).toBeInTheDocument()

  await user.click(screen.getByRole('button', { name: /Fri/i }))

  expect(await screen.findByRole('alert')).toHaveTextContent(/operational run unavailable/i)
  expect(screen.getByText(/Thursday-specific visible value/i)).toBeInTheDocument()
})
```

Use stable values already rendered by the existing test fixtures (run date/profile/package KPI) instead of adding test-only UI copy.

- [ ] **Step 2: Run RED**

```bash
npm test -- tests/operationalRunSwitching.test.tsx
```

Expected: current `changeOperationalRun()` clears `activeRun` and `routes`, so the previous operation disappears before the next one validates.

- [ ] **Step 3: Replace timeline run/route state with bundle state**

In `App.tsx`:

```ts
const [activeBundle, setActiveBundle] = useState<OperationalBundle | null>(null)
const [selectedRunId, setSelectedRunId] = useState<string | null>(null)
const [pendingRunId, setPendingRunId] = useState<string | null>(null)
```

Derive:

```ts
const activeRun = timeline ? activeBundle?.run ?? null : null
const activeScenario = timeline ? activeRun?.scenario ?? null : activeDefinition.scenario
const routes = timeline ? activeBundle?.routes ?? null : staticRoutes
```

Rename the old generic `routes` state to `staticRoutes` and keep its fetch effect only for `!timeline`.

- [ ] **Step 4: Make manifest selection request a pending bundle rather than committing a run**

After loading/selecting the manifest default entry:

```ts
setRunManifest(manifest)
setPendingRunId(defaultEntry.id)
```

Do not set `selectedRunId` until the bundle is valid.

- [ ] **Step 5: Replace the selected-run effect with pending-bundle loading**

The effect should key off `pendingRunId`:

```ts
useEffect(() => {
  if (!timeline || !runManifest || !pendingRunId) return

  const entry = runManifest.runs.find((candidate) => candidate.id === pendingRunId)
  if (!entry || entry.scenarioId !== scenarioId) {
    setRunError(true)
    setRunLoading(false)
    setPendingRunId(null)
    return
  }

  let cancelled = false
  setRunLoading(true)
  setRunError(false)

  void loadOperationalBundle({
    entry,
    manifest: runManifest,
    manifestUrl: timeline.manifestUrl,
    legacyRouteAsset: activeDefinition.routeAsset,
  }).then((bundle) => {
    if (cancelled) return
    setIsPlaying(false)
    setSimulationMinute(0)
    setActiveBundle(bundle)
    setSelectedRunId(entry.id)
    setPendingRunId(null)
    setRunError(false)
  }).catch(() => {
    if (cancelled) return
    setPendingRunId(null)
    setRunError(true)
  }).finally(() => {
    if (!cancelled) setRunLoading(false)
  })

  return () => {
    cancelled = true
  }
}, [activeDefinition.routeAsset, pendingRunId, runManifest, scenarioId, timeline])
```

Important: the catch path does **not** call `setActiveBundle(null)`.

- [ ] **Step 6: Make date clicks non-destructive**

Replace current clearing behavior:

```ts
const changeOperationalRun = (nextId: string) => {
  if (nextId === selectedRunId || nextId === pendingRunId) return
  setRunError(false)
  setPendingRunId(nextId)
}
```

Do not reset the clock or stop playback merely on click; reset only on successful bundle commit. This ensures a failed request does not mutate the current operation.

- [ ] **Step 7: Reset all bundle state on scenario-family switch**

In `changeScenario()` clear:

```ts
setActiveBundle(null)
setSelectedRunId(null)
setPendingRunId(null)
setRunManifest(null)
```

Static route state can still clear on scenario-family changes.

- [ ] **Step 8: Remove the timeline-specific shared-route fetch path**

The old `useEffect` that always fetched `activeDefinition.routeAsset` must become static-only:

```ts
if (timeline) {
  setStaticRoutes(null)
  setRouteError(false)
  return
}
```

V2 timeline geometry must never fall back to a shared scenario route asset; only V1 bundle loading uses the legacy asset deliberately.

- [ ] **Step 9: Run switching and app smoke tests GREEN**

```bash
npm test -- tests/operationalRunSwitching.test.tsx tests/appSmoke.test.tsx tests/scenarioSwitching.test.tsx
```

Expected: successful switches still reset to the new operation; failed/pending switches keep the old operation visible.

- [ ] **Step 10: Commit atomic runtime state**

```bash
git add src/App.tsx tests/operationalRunSwitching.test.tsx
git commit -m "feat: switch operational bundles atomically"
```

---

### Task 6: Add stale-response protection for rapid date changes

**Files:**
- Modify: `src/App.tsx`
- Modify: `tests/operationalRunSwitching.test.tsx`

**Interfaces:**
- Consumes: pending bundle state from Task 5.
- Produces: only the latest requested `pendingRunId` may commit a bundle.

- [ ] **Step 1: Add RED race test**

Add a test where Friday begins loading, Saturday is selected before Friday resolves, Saturday resolves first, then Friday resolves last:

```ts
it('does not let a stale slower bundle overwrite the latest requested date', async () => {
  render(<App />)
  await waitForInitialThursday()

  await user.click(screen.getByRole('button', { name: /Fri/i }))
  await user.click(screen.getByRole('button', { name: /Sat/i }))

  resolveSaturdayBundle()
  expect(await screen.findByText(/Saturday-specific visible value/i)).toBeInTheDocument()

  resolveFridayBundle()
  await Promise.resolve()

  expect(screen.getByText(/Saturday-specific visible value/i)).toBeInTheDocument()
  expect(screen.queryByText(/Friday-specific visible value/i)).not.toBeInTheDocument()
})
```

Use deferred `Response` promises in the test fetch mock; no fake timers are required.

- [ ] **Step 2: Run RED**

```bash
npm test -- tests/operationalRunSwitching.test.tsx
```

Expected: if the current cancellation cleanup is insufficient in the exact effect/test scheduling, the stale Friday promise can commit after Saturday.

- [ ] **Step 3: Add an explicit request sequence guard if the cancellation flag alone is not sufficient**

Prefer React effect cleanup if it already makes the test pass. If not, add:

```ts
const bundleRequestId = useRef(0)
```

At each bundle request:

```ts
const requestId = ++bundleRequestId.current
```

Before commit:

```ts
if (cancelled || requestId !== bundleRequestId.current) return
```

Increment the ref when scenario changes to invalidate in-flight requests.

Do not add AbortController unless a failing test demonstrates a resource problem; YAGNI.

- [ ] **Step 4: Run switching test GREEN**

```bash
npm test -- tests/operationalRunSwitching.test.tsx
```

Expected: latest requested date wins deterministically.

- [ ] **Step 5: Commit stale-response protection**

```bash
git add src/App.tsx tests/operationalRunSwitching.test.tsx
git commit -m "fix: ignore stale operational bundle loads"
```

---

### Task 7: Strengthen V1 regression guarantees and verify V2 does not alter historical semantics

**Files:**
- Modify: `tests/operationalBundle.test.ts`
- Modify: `tests/operationalRunCatalog.test.ts`
- Modify: `tests/operationalRunCatalogSecurity.test.ts` only if current security assertions need the new generic resolver imported.

**Interfaces:**
- Consumes: all PR1 runtime contracts.
- Produces: regression proof that schema V1 remains supported and V2-only fields do not reinterpret V1.

- [ ] **Step 1: Add a regression test using the real checked-in V1 manifest shape**

In `tests/operationalRunCatalog.test.ts`, load/import or read the checked-in manifest using the repository’s existing test convention and assert:

```ts
it('keeps the checked-in V0.5 manifest valid as schema V1', () => {
  expect(checkedInManifest.schemaVersion).toBe(1)
  expect(validateOperationalRunManifest(checkedInManifest)).toEqual([])
  expect(checkedInManifest.runs.every((run) => !('routeArtifact' in run))).toBe(true)
})
```

If JSON import settings make direct import awkward, use `readFileSync` + `JSON.parse` in the test as existing generator tests do.

- [ ] **Step 2: Add V1 bundle regression that route metadata is not required**

In `tests/operationalBundle.test.ts`:

```ts
it('does not require V2 binding metadata on legacy V1 shared routes', async () => {
  const fixture = v1Fixtures()
  delete fixture.routes.metadata

  await expect(loadOperationalBundle({
    entry: fixture.entry,
    manifest: fixture.manifest,
    manifestUrl: './data/operational-runs/manifest.json',
    legacyRouteAsset: './data/cordoba-calibrated-routes.geojson',
    fetcher: routedFetcher(v1Responses(fixture)),
  })).resolves.toMatchObject({ run: fixture.run })
})
```

- [ ] **Step 3: Run all operational-run and route regression suites**

```bash
npm test -- \
  tests/operationalRunCatalog.test.ts \
  tests/operationalRunCatalogSecurity.test.ts \
  tests/operationalRunValidation.test.ts \
  tests/operationalRunArtifacts.test.ts \
  tests/operationalBundle.test.ts \
  tests/routeAssets.test.ts \
  tests/operationalRunSwitching.test.tsx
```

Expected: all pass; no historical artifact needs modification.

- [ ] **Step 4: Commit regression coverage**

```bash
git add tests/operationalRunCatalog.test.ts tests/operationalBundle.test.ts tests/operationalRunCatalogSecurity.test.ts
git commit -m "test: preserve v0.5 operational run compatibility"
```

Only stage `tests/operationalRunCatalogSecurity.test.ts` if it actually changed.

---

### Task 8: Full verification and PR1 completion checkpoint

**Files:**
- No production changes expected.
- Modify only a test/implementation file if full verification reveals a real regression; if so, reproduce it with a focused failing test before fixing.

**Interfaces:**
- Produces a verified PR1 branch ready for review/PR.

- [ ] **Step 1: Run the full test suite**

```bash
npm test
```

Expected: all test files pass, including all pre-existing V0.5 tests and new PR1 tests.

- [ ] **Step 2: Run the production build**

```bash
npm run build
```

Expected: TypeScript build and Vite production build both succeed.

- [ ] **Step 3: Inspect the final diff against the PR1 scope**

```bash
git diff main...HEAD -- \
  src/scenario/operationalRuns \
  src/map/routeAssets.ts \
  src/App.tsx \
  tests
```

Verify the diff contains no changes to:

```text
scripts/generate-operational-runs.mjs
scripts/lib/calibrated-scenario-generator.mjs
public/data/operational-runs/generated/*
public/data/operational-runs/manifest.json
src/simulation/*
```

PR1 must not accidentally start PR2 spatial-demand work.

- [ ] **Step 4: Verify commit history is task-sized**

```bash
git log --oneline main..HEAD
```

Expected logical sequence similar to:

```text
test: preserve v0.5 operational run compatibility
fix: ignore stale operational bundle loads
feat: switch operational bundles atomically
feat: load validated operational bundles
feat: bind route artifacts to operational runs
feat: validate operational manifest v2
feat: add operational manifest v2 contracts
```

Exact SHAs differ; avoid squashing before review unless the integration workflow later calls for it.

- [ ] **Step 5: Final commit only if verification required a real fix**

If no files changed during verification, do not create an empty commit.

If a regression was fixed with RED/GREEN, commit only those files with a specific message, for example:

```bash
git add src/scenario/operationalRuns/bundle.ts tests/operationalBundle.test.ts
git commit -m "fix: preserve legacy route loading in bundles"
```

---

## PR1 Acceptance Criteria

PR1 is ready for code review when all of the following are true:

1. `schemaVersion: 1` manifests still parse and load existing V0.5 runs with the scenario-level route asset.
2. `schemaVersion: 2` manifests require safe `routeArtifact` paths and accept optional safe `contextArtifact` paths.
3. V2 run artifacts still undergo the existing manifest/run metadata identity checks.
4. V2 route GeoJSON must pass both existing topology validation and `runId` / `targetDate` / `modelVersion` binding checks.
5. Missing or invalid required run/routes reject the requested V2 bundle.
6. Missing, unreachable, malformed, or identity-mismatched optional context degrades to `context.status === 'unavailable'` without invalidating a valid run/routes pair.
7. Timeline runtime commits `run + routes + context-state` as one `OperationalBundle`.
8. While a new date loads, the previous valid operation remains rendered.
9. If a new date fails, the previous valid operation remains rendered and an unavailable alert is shown.
10. A stale slower request cannot overwrite a newer successfully selected date.
11. Static scenarios continue to use their existing route assets.
12. No V0.5 generated artifact or manifest is rewritten in PR1.
13. `npm test` passes.
14. `npm run build` passes.

## Explicit handoff to PR2

PR1 deliberately stops before generating any V0.6 production runs. PR2 (`Daily Spatial Demand`) begins from the new bundle boundary and will:

- create/version the Córdoba synthetic delivery candidate pool,
- select 45–65 destinations deterministically per date,
- assign them to the fixed 8 trucks,
- remove fixed V0.6 stop counts,
- prepare per-run route GeoJSON carrying the binding metadata introduced here,
- publish the first actual manifest V2 run bundles.

Do not pull those changes into PR1.