# FleetFlow V0.6 PR1 — Operational Bundle Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add manifest V2 support and atomically load a validated operational run + matching route geometry while preserving V0.5 manifest V1 behavior and the last valid rendered operation on failed date switches.

**Architecture:** Keep `FleetScenario` and the simulation engine unchanged. Extend the operational catalog into a discriminated V1/V2 manifest reader, add a focused `OperationalBundle` loader that validates run/route identity before returning, and refactor `App.tsx` so timeline scenarios commit one complete bundle instead of independently committing run and route state. V1 runs continue to resolve the scenario-level `routeAsset`; V2 runs resolve their own `routeArtifact` and may load an optional non-fatal context envelope.

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

- `src/scenario/operationalRuns/types.ts` — discriminated manifest V1/V2 types and the minimal optional-context envelope/load-state contracts.
- `src/scenario/operationalRuns/catalog.ts` — safe V1/V2 manifest validation, safe artifact URL resolution, run loading, and manifest/run identity checks.
- `src/map/routeAssets.ts` — route collection binding metadata and V2 run-binding assertion; existing topology validation remains strict and unchanged.
- `src/App.tsx` — timeline state moves from separately committed `activeRun` + `routes` to one committed `OperationalBundle`; static scenarios retain the existing route path.
- `tests/operationalRunCatalog.test.ts` — V1 regression plus V2 manifest/path validation.
- `tests/routeAssets.test.ts` — V2 route binding tests.
- `tests/operationalRunSwitching.test.tsx` — atomic switching, previous-valid-bundle retention, and stale-load coverage.

### Files created

- `src/scenario/operationalRuns/bundle.ts` — load and validate the required run/route pair, degrade optional context independently, and return `OperationalBundle`.
- `tests/operationalBundle.test.ts` — focused bundle loading and failure-semantics tests.

### Files intentionally untouched in PR1

- `scripts/generate-operational-runs.mjs` — remains V0.5/V1 until PR2 creates actual V0.6 runs.
- `scripts/lib/calibrated-scenario-generator.mjs` — fixed stop counts remain historical V0.5 behavior until PR2.
- `public/data/operational-runs/manifest.json` — remains schema V1 in PR1.
- `public/data/operational-runs/generated/*` — no generated artifact rewrites.
- `src/simulation/*` — no engine changes.

---

### Task 1: Add discriminated manifest V1/V2 contracts

**Files:**
- Modify: `src/scenario/operationalRuns/types.ts`
- Modify: `tests/operationalRunCatalog.test.ts`

**Interfaces:**
- Consumes: existing `OperationalRun`, `OperationalRunMode`, and `ScenarioId`.
- Produces: `OperationalRunManifestEntryV1`, `OperationalRunManifestEntryV2`, `OperationalRunManifest`, `OperationalContextEnvelope`, and `OperationalContextLoadState`.

- [ ] **Step 1: Write the failing schema-V2 test**

Add to `tests/operationalRunCatalog.test.ts`:

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

it('accepts manifest V2 entries with a required route artifact', () => {
  expect(validateOperationalRunManifest(manifestV2())).toEqual([])
  expect(requireValidOperationalRunManifest(manifestV2()).schemaVersion).toBe(2)
})
```

- [ ] **Step 2: Run RED**

```bash
npm test -- tests/operationalRunCatalog.test.ts
```

Expected: compile/test failure because V2 types do not exist and schema version 2 is rejected.

- [ ] **Step 3: Replace the single V1 manifest type with a discriminated V1/V2 union**

Keep the current run/provenance types. Replace only the manifest section in `src/scenario/operationalRuns/types.ts` with:

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
```

- [ ] **Step 4: Run TypeScript and the focused test**

```bash
npx tsc -b --pretty false
npm test -- tests/operationalRunCatalog.test.ts
```

Expected: V1 code remains type-compatible; the remaining failure is catalog validation rejecting V2.

- [ ] **Step 5: Commit**

```bash
git add src/scenario/operationalRuns/types.ts tests/operationalRunCatalog.test.ts
git commit -m "feat: add operational manifest v2 contracts"
```

---

### Task 2: Make manifest validation and artifact resolution schema-aware

**Files:**
- Modify: `src/scenario/operationalRuns/catalog.ts`
- Modify: `tests/operationalRunCatalog.test.ts`

**Interfaces:**
- Consumes: manifest union from Task 1.
- Produces:

```ts
export function resolveOperationalArtifactUrl(
  manifestUrl: string,
  artifact: string,
  kind: 'run' | 'route' | 'context',
): string
```

Existing public APIs `validateOperationalRunManifest`, `requireValidOperationalRunManifest`, `selectDefaultRunEntry`, `loadOperationalRunManifest`, and `loadOperationalRun` remain available.

- [ ] **Step 1: Add RED validation/security tests**

Add to `tests/operationalRunCatalog.test.ts`:

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

it('accepts V2 when optional contextArtifact is omitted', () => {
  const { contextArtifact: _removed, ...withoutContext } = entryV2()
  expect(validateOperationalRunManifest({
    schemaVersion: 2,
    runs: [withoutContext],
  })).toEqual([])
})

it('rejects V1 entries containing V2-only routeArtifact', () => {
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

Change the existing unsupported-version assertion from schema `2` to schema `3`.

- [ ] **Step 2: Run RED**

```bash
npm test -- tests/operationalRunCatalog.test.ts
```

Expected: V2 validation cases fail.

- [ ] **Step 3: Add distinct safe-path patterns**

Replace the single artifact regex in `catalog.ts` with:

```ts
const RUN_ARTIFACT_PATH = /^\.\/generated\/[a-z0-9]+(?:-[a-z0-9]+)*\.json$/i
const ROUTE_ARTIFACT_PATH = /^\.\/generated\/[a-z0-9]+(?:-[a-z0-9]+)*\.routes\.geojson$/i
const CONTEXT_ARTIFACT_PATH = /^\.\/generated\/[a-z0-9]+(?:-[a-z0-9]+)*\.context\.json$/i

function matchesArtifactPath(value: unknown, pattern: RegExp): value is string {
  return typeof value === 'string' && pattern.test(value)
}
```

- [ ] **Step 4: Validate common metadata once and V1/V2 fields explicitly**

Change the private entry validator signature to:

```ts
function validateManifestEntry(
  value: unknown,
  index: number,
  schemaVersion: 1 | 2,
): string[]
```

Keep all current ID/date/timestamp/mode/scenario/model checks. Add:

```ts
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
```

At manifest level accept only `1 | 2`:

```ts
if (value.schemaVersion !== 1 && value.schemaVersion !== 2) {
  errors.push('Operational run manifest schemaVersion must be 1 or 2')
  return errors
}
```

Also reject duplicate run artifacts, duplicate V2 route artifacts, and duplicate non-undefined V2 context artifacts.

- [ ] **Step 5: Add one exact safe URL resolver**

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

export function resolveOperationalRunArtifactUrl(
  manifestUrl: string,
  artifact: string,
): string {
  return resolveOperationalArtifactUrl(manifestUrl, artifact, 'run')
}
```

Update `loadOperationalRun()` to use the run wrapper as it does today.

- [ ] **Step 6: Normalize `selectDefaultRunEntry()` across the union**

At the start of `selectDefaultRunEntry()` use:

```ts
const entries: OperationalRunManifestEntry[] = [...manifest.runs]
```

Then keep the existing scenario filter/date sort/exact-past-future selection algorithm unchanged.

- [ ] **Step 7: Run GREEN**

```bash
npm test -- tests/operationalRunCatalog.test.ts tests/operationalRunCatalogSecurity.test.ts
```

Expected: existing V1 security tests and all new V2 tests pass.

- [ ] **Step 8: Commit**

```bash
git add src/scenario/operationalRuns/catalog.ts tests/operationalRunCatalog.test.ts
git commit -m "feat: validate operational manifest v2"
```

---

### Task 3: Bind V2 route GeoJSON to the selected run

**Files:**
- Modify: `src/map/routeAssets.ts`
- Modify: `tests/routeAssets.test.ts`

**Interfaces:**
- Consumes: existing `RouteGeometryCollection` and `OperationalRun`.
- Produces:

```ts
export interface RouteGeometryBinding {
  runId: string
  targetDate: string
  modelVersion: string
}

export function assertRouteCollectionMatchesRun(
  collection: RouteGeometryCollection,
  run: OperationalRun,
): void
```

- [ ] **Step 1: Add RED binding tests**

In `tests/routeAssets.test.ts`, use the file’s existing valid scenario/route fixture construction. Add:

```ts
it('accepts V2 route metadata matching the selected run', () => {
  const run = operationalRunFixture()
  const routes = routeCollectionFixture(run.scenario)
  routes.metadata = {
    runId: run.id,
    targetDate: run.targetDate,
    modelVersion: run.modelVersion,
  }

  expect(() => assertRouteCollectionMatchesRun(routes, run)).not.toThrow()
})

it.each([
  ['runId', 'cordoba-2026-08-30-v3'],
  ['targetDate', '2026-08-30'],
  ['modelVersion', 'fleetflow-v9'],
] as const)('rejects V2 route metadata mismatch for %s', (field, wrongValue) => {
  const run = operationalRunFixture()
  const routes = routeCollectionFixture(run.scenario)
  routes.metadata = {
    runId: run.id,
    targetDate: run.targetDate,
    modelVersion: run.modelVersion,
    [field]: wrongValue,
  }

  expect(() => assertRouteCollectionMatchesRun(routes, run)).toThrow(
    new RegExp(`route.*${field}.*mismatch`, 'i'),
  )
})

it('rejects missing V2 route binding metadata', () => {
  const run = operationalRunFixture()
  const routes = routeCollectionFixture(run.scenario)
  expect(() => assertRouteCollectionMatchesRun(routes, run)).toThrow(/metadata.*required/i)
})
```

If `tests/routeAssets.test.ts` does not already expose helpers with those names, define them in that test file as:

```ts
function operationalRunFixture(): OperationalRun {
  return {
    id: 'cordoba-2026-08-31-v3',
    targetDate: '2026-08-31',
    issuedAt: '2026-08-30T21:00:00-03:00',
    dataAsOf: '2026-08-30T21:00:00-03:00',
    mode: 'FORECAST',
    scenarioId: 'cordoba-calibrated',
    modelVersion: 'fleetflow-v0.6',
    provenance: {
      generator: 'daily-spatial-v1',
      seed: 'fleetflow:v0.6:cordoba:2026-08-31',
      notes: ['Synthetic test run.'],
    },
    scenario: structuredClone(getScenarioDefinition('cordoba-calibrated').scenario),
  }
}
```

Construct `routeCollectionFixture(scenario)` using the same valid-feature builder already used by the current route-assets tests so waypoint counts remain realistic; do not bypass `routeCollectionToIndex()`.

- [ ] **Step 2: Run RED**

```bash
npm test -- tests/routeAssets.test.ts
```

Expected: metadata type/assertion are missing.

- [ ] **Step 3: Extend the route collection type and add binding validation**

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
  if (!metadata) throw new Error('Route collection metadata is required')

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

Do not loosen `routeCollectionToIndex()`: feature ID, truck ID, `stops + 2`, finite/non-decreasing waypoint distances, and positive route distance remain mandatory.

- [ ] **Step 4: Run GREEN**

```bash
npm test -- tests/routeAssets.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/map/routeAssets.ts tests/routeAssets.test.ts
git commit -m "feat: bind route artifacts to operational runs"
```

---

### Task 4: Implement `loadOperationalBundle()`

**Files:**
- Create: `src/scenario/operationalRuns/bundle.ts`
- Create: `tests/operationalBundle.test.ts`

**Interfaces:**
- Consumes: `loadOperationalRun`, `resolveOperationalArtifactUrl`, `routeCollectionToIndex`, `assertRouteCollectionMatchesRun`, `OperationalContextLoadState`.
- Produces:

```ts
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

export async function loadOperationalBundle(
  options: LoadOperationalBundleOptions,
): Promise<OperationalBundle>
```

- [ ] **Step 1: Create RED bundle tests with concrete fixtures**

Create `tests/operationalBundle.test.ts`. Reuse the real calibrated scenario via `getScenarioDefinition('cordoba-calibrated').scenario`. Build a minimal valid route collection from that scenario with one `LineString` feature per route and `waypointDistancesKm` of length `route.stops.length + 2`.

Use:

```ts
function routeCollectionForScenario(
  scenario: FleetScenario,
  metadata?: RouteGeometryBinding,
): RouteGeometryCollection {
  return {
    type: 'FeatureCollection',
    ...(metadata ? { metadata } : {}),
    features: scenario.routes.map((route, routeIndex) => ({
      type: 'Feature',
      id: route.geometryId,
      properties: {
        truckId: route.truckId,
        waypointDistancesKm: Array.from(
          { length: route.stops.length + 2 },
          (_, index) => index,
        ),
      },
      geometry: {
        type: 'LineString',
        coordinates: [
          [-64.1888 - routeIndex * 0.0001, -31.4201],
          [-64.1788 - routeIndex * 0.0001, -31.4101],
        ],
      },
    })),
  }
}
```

The last waypoint distance is positive because every current route has stops.

Add these four tests:

```ts
it('loads V1 using the supplied legacy scenario route asset', async () => {
  const run = runFixture('fleetflow-v0.5', 'cordoba-2026-08-31-v2')
  const entry = entryV1Fixture(run)
  const routes = routeCollectionForScenario(run.scenario)
  const fetcher = fetchMap({
    './data/operational-runs/generated/cordoba-2026-08-31-v2.json': run,
    './data/cordoba-calibrated-routes.geojson': routes,
  })

  const bundle = await loadOperationalBundle({
    entry,
    manifestUrl: './data/operational-runs/manifest.json',
    legacyRouteAsset: './data/cordoba-calibrated-routes.geojson',
    fetcher,
  })

  expect(bundle.run).toEqual(run)
  expect(bundle.routes).toEqual(routes)
  expect(bundle.context).toEqual({ status: 'omitted' })
})

it('loads V2 run and matching per-run routes', async () => {
  const run = runFixture('fleetflow-v0.6', 'cordoba-2026-08-31-v3')
  const entry = entryV2Fixture(run)
  const routes = routeCollectionForScenario(run.scenario, {
    runId: run.id,
    targetDate: run.targetDate,
    modelVersion: run.modelVersion,
  })
  const fetcher = fetchMap({
    './data/operational-runs/generated/cordoba-2026-08-31-v3.json': run,
    './data/operational-runs/generated/cordoba-2026-08-31-v3.routes.geojson': routes,
  })

  await expect(loadOperationalBundle({
    entry,
    manifestUrl: './data/operational-runs/manifest.json',
    fetcher,
  })).resolves.toMatchObject({ run, routes, context: { status: 'omitted' } })
})

it('rejects V2 routes bound to another run', async () => {
  const run = runFixture('fleetflow-v0.6', 'cordoba-2026-08-31-v3')
  const entry = entryV2Fixture(run)
  const routes = routeCollectionForScenario(run.scenario, {
    runId: 'cordoba-2026-08-30-v3',
    targetDate: run.targetDate,
    modelVersion: run.modelVersion,
  })
  const fetcher = fetchMap({
    './data/operational-runs/generated/cordoba-2026-08-31-v3.json': run,
    './data/operational-runs/generated/cordoba-2026-08-31-v3.routes.geojson': routes,
  })

  await expect(loadOperationalBundle({
    entry,
    manifestUrl: './data/operational-runs/manifest.json',
    fetcher,
  })).rejects.toThrow(/route.*runId.*mismatch/i)
})

it('keeps valid run/routes when optional context is unavailable', async () => {
  const run = runFixture('fleetflow-v0.6', 'cordoba-2026-08-31-v3')
  const entry = entryV2Fixture(run, true)
  const routes = routeCollectionForScenario(run.scenario, {
    runId: run.id,
    targetDate: run.targetDate,
    modelVersion: run.modelVersion,
  })
  const fetcher = fetchMap({
    './data/operational-runs/generated/cordoba-2026-08-31-v3.json': run,
    './data/operational-runs/generated/cordoba-2026-08-31-v3.routes.geojson': routes,
  })

  const bundle = await loadOperationalBundle({
    entry,
    manifestUrl: './data/operational-runs/manifest.json',
    fetcher,
  })

  expect(bundle.context.status).toBe('unavailable')
  expect(bundle.run).toEqual(run)
  expect(bundle.routes).toEqual(routes)
})
```

Define the helpers in the same file:

```ts
function runFixture(modelVersion: string, id: string): OperationalRun {
  return {
    id,
    targetDate: '2026-08-31',
    issuedAt: '2026-08-30T21:00:00-03:00',
    dataAsOf: '2026-08-30T21:00:00-03:00',
    mode: 'FORECAST',
    scenarioId: 'cordoba-calibrated',
    modelVersion,
    provenance: {
      generator: 'test-generator',
      seed: `test:${id}`,
      notes: ['Synthetic test run.'],
    },
    scenario: structuredClone(getScenarioDefinition('cordoba-calibrated').scenario),
  }
}

function entryV1Fixture(run: OperationalRun): OperationalRunManifestEntryV1 {
  return {
    id: run.id,
    targetDate: run.targetDate,
    issuedAt: run.issuedAt,
    dataAsOf: run.dataAsOf,
    mode: run.mode,
    scenarioId: run.scenarioId,
    modelVersion: run.modelVersion,
    artifact: `./generated/${run.id}.json`,
  }
}

function entryV2Fixture(
  run: OperationalRun,
  withContext = false,
): OperationalRunManifestEntryV2 {
  return {
    ...entryV1Fixture(run),
    routeArtifact: `./generated/${run.id}.routes.geojson`,
    ...(withContext ? { contextArtifact: `./generated/${run.id}.context.json` } : {}),
  }
}

function jsonResponse(payload: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload,
  } as Response
}

function fetchMap(responses: Record<string, unknown>): FetchLike {
  return async (input) => {
    const url = String(input)
    return Object.prototype.hasOwnProperty.call(responses, url)
      ? jsonResponse(responses[url])
      : jsonResponse({}, 404)
  }
}
```

- [ ] **Step 2: Run RED**

```bash
npm test -- tests/operationalBundle.test.ts
```

Expected: module not found for `bundle.ts`.

- [ ] **Step 3: Implement strict route loading and V1/V2 resolution**

Create `src/scenario/operationalRuns/bundle.ts` with imports from `catalog.ts`, `types.ts`, and `routeAssets.ts`.

Use:

```ts
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
```

Inside `loadOperationalBundle()`:

```ts
const fetcher = options.fetcher ?? fetch
const run = await loadOperationalRun(options.entry, options.manifestUrl, fetcher)

const routeUrl = isV2Entry(options.entry)
  ? resolveOperationalArtifactUrl(options.manifestUrl, options.entry.routeArtifact, 'route')
  : options.legacyRouteAsset

if (!routeUrl) {
  throw new Error('Legacy operational run requires a scenario route asset')
}

const routes = await loadRouteCollection(routeUrl, fetcher)
routeCollectionToIndex(routes, run.scenario)

if (isV2Entry(options.entry)) {
  assertRouteCollectionMatchesRun(routes, run)
}
```

- [ ] **Step 4: Implement optional context envelope parsing**

Use:

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

Then compute context state:

```ts
let context: OperationalContextLoadState = { status: 'omitted' }

if (isV2Entry(options.entry) && options.entry.contextArtifact) {
  try {
    const contextUrl = resolveOperationalArtifactUrl(
      options.manifestUrl,
      options.entry.contextArtifact,
      'context',
    )
    const response = await fetcher(contextUrl)
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
```

Only this optional context branch is caught. Required run/route failures must reject the promise.

- [ ] **Step 5: Return the bundle**

```ts
return {
  manifestEntry: options.entry,
  run,
  routes,
  context,
}
```

- [ ] **Step 6: Run GREEN**

```bash
npm test -- tests/operationalBundle.test.ts tests/routeAssets.test.ts tests/operationalRunCatalog.test.ts
```

- [ ] **Step 7: Commit**

```bash
git add src/scenario/operationalRuns/bundle.ts tests/operationalBundle.test.ts
git commit -m "feat: load validated operational bundles"
```

---

### Task 5: Refactor `App.tsx` to keep the previous valid bundle until the next one validates

**Files:**
- Modify: `src/App.tsx`
- Modify: `tests/operationalRunSwitching.test.tsx`

**Interfaces:**
- Consumes: `loadOperationalBundle()` from Task 4.
- Produces timeline state:

```ts
const [activeBundle, setActiveBundle] = useState<OperationalBundle | null>(null)
const [selectedRunId, setSelectedRunId] = useState<string | null>(null)
const [pendingRunId, setPendingRunId] = useState<string | null>(null)
```

Static scenarios continue using a separate `staticRoutes` state.

- [ ] **Step 1: Change the existing pending-switch test to assert the old map remains**

The current test already exposes the map as:

```tsx
<div data-testid="fleet-map">
  return-total:{scenario.routes.reduce((sum, route) => sum + route.returnMinute, 0)}
</div>
```

In the existing `loads the Córdoba default run after the manifest and switches dates atomically` test, after clicking 31 August and before resolving `run31Response`, replace:

```ts
expect(screen.queryByTestId('fleet-map')).not.toBeInTheDocument()
```

with:

```ts
expect(screen.getByTestId('fleet-map')).toHaveTextContent(
  `return-total:${returnTotal(run30.scenario)}`,
)
expect(screen.getByText('Loading operational run…')).toBeInTheDocument()
```

Do not expect the simulation clock to reset yet. The clock resets only when the new bundle commits successfully.

- [ ] **Step 2: Change the existing failure test to assert run30 remains rendered**

After the 31-August run returns HTTP 404, replace the current expectations that remove the map/panel with:

```ts
expect(await screen.findByRole('alert')).toHaveTextContent('Operational run unavailable.')
expect(screen.getByTestId('fleet-map')).toHaveTextContent(
  `return-total:${returnTotal(run30.scenario)}`,
)
expect(screen.getByRole('region', { name: 'Resumen de la flota' })).toBeInTheDocument()
expect(
  screen.getByRole('button', { name: /30 DE AGO DE 2026, SIMULATED/i }),
).toHaveAttribute('aria-current', 'date')
```

- [ ] **Step 3: Run RED**

```bash
npm test -- tests/operationalRunSwitching.test.tsx
```

Expected: current `changeOperationalRun()` clears `activeRun` and routes immediately, so both new assertions fail.

- [ ] **Step 4: Replace timeline run/route state with `activeBundle`**

In `src/App.tsx` import:

```ts
import { loadOperationalBundle, type OperationalBundle } from './scenario/operationalRuns/bundle'
```

Replace timeline `activeRun` state with:

```ts
const [activeBundle, setActiveBundle] = useState<OperationalBundle | null>(null)
const [selectedRunId, setSelectedRunId] = useState<string | null>(null)
const [pendingRunId, setPendingRunId] = useState<string | null>(null)
```

Rename the existing route state to:

```ts
const [staticRoutes, setStaticRoutes] = useState<RouteGeometryCollection | null>(null)
```

Derive:

```ts
const activeRun = timeline ? activeBundle?.run ?? null : null
const activeScenario = timeline ? activeRun?.scenario ?? null : activeDefinition.scenario
const routes = timeline ? activeBundle?.routes ?? null : staticRoutes
```

- [ ] **Step 5: Make the shared route fetch static-only**

In the route-loading effect, if `timeline` is present:

```ts
setStaticRoutes(null)
setRouteError(false)
return
```

For non-timeline scenarios, preserve the current `activeDefinition.routeAsset` fetch + `routeCollectionToIndex()` behavior.

- [ ] **Step 6: Make manifest load request a pending default entry**

After `selectDefaultRunEntry()` succeeds:

```ts
setRunManifest(manifest)
setPendingRunId(defaultEntry.id)
```

Do not set `selectedRunId` until the full bundle commits.

- [ ] **Step 7: Replace the selected-run effect with a pending-bundle effect**

Use this state transition:

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

The catch branch must not call `setActiveBundle(null)`.

- [ ] **Step 8: Make date clicks non-destructive**

Replace `changeOperationalRun()` with:

```ts
const changeOperationalRun = (nextId: string) => {
  if (nextId === selectedRunId || nextId === pendingRunId) return
  setRunError(false)
  setPendingRunId(nextId)
}
```

Do not stop/reset the current operation on click. Successful bundle commit performs the reset.

- [ ] **Step 9: Clear bundle state only when changing scenario family**

In `changeScenario()` clear:

```ts
setActiveBundle(null)
setSelectedRunId(null)
setPendingRunId(null)
setRunManifest(null)
setStaticRoutes(null)
```

Preserve the existing simulation reset and error reset for a scenario-family change.

- [ ] **Step 10: Keep timeline rendering keyed to the committed bundle**

Use:

```tsx
<FleetMap
  key={`${scenarioId}:${activeBundle?.run.id ?? 'static'}`}
  scenario={activeScenario}
  routes={routes}
  snapshot={snapshot}
/>
```

`OperationalDateRail` continues receiving `selectedRunId`, so `aria-current` represents the committed operation, not an unvalidated pending request.

- [ ] **Step 11: Run GREEN**

```bash
npm test -- tests/operationalRunSwitching.test.tsx tests/appSmoke.test.tsx tests/scenarioSwitching.test.tsx
```

Expected: run30 remains visible during/following a failed run31 load; run31 replaces it only after full required bundle validation.

- [ ] **Step 12: Commit**

```bash
git add src/App.tsx tests/operationalRunSwitching.test.tsx
git commit -m "feat: switch operational bundles atomically"
```

---

### Task 6: Prove stale slower loads cannot overwrite a newer request

**Files:**
- Modify: `tests/operationalRunSwitching.test.tsx`
- Modify: `src/App.tsx` only if the RED test exposes a race not already prevented by effect cleanup.

**Interfaces:**
- Consumes: `pendingRunId` effect from Task 5.
- Produces: latest request wins; stale promises never commit.

- [ ] **Step 1: Add a concrete third run fixture**

Near existing `run30`/`run31` fixtures:

```ts
const RUN_01_URL = './data/operational-runs/generated/cordoba-2026-09-01-v-race.json'

const run01: OperationalRun = structuredClone(run31)
run01.id = 'cordoba-2026-09-01-v-race'
run01.targetDate = '2026-09-01'
run01.provenance = {
  generator: 'race-test',
  seed: 'race-test:2026-09-01',
  notes: ['Synthetic race fixture.'],
}
run01.scenario.routes[0].returnMinute += 17

const raceManifest: OperationalRunManifest = {
  schemaVersion: 1,
  runs: [
    ...manifest.runs,
    {
      id: run01.id,
      targetDate: run01.targetDate,
      issuedAt: run01.issuedAt,
      dataAsOf: run01.dataAsOf,
      mode: run01.mode,
      scenarioId: run01.scenarioId,
      modelVersion: run01.modelVersion,
      artifact: './generated/cordoba-2026-09-01-v-race.json',
    },
  ],
}
```

Because `operationalProfile` is replaced by a provenance object without that optional field, run validation does not inherit the original Sunday day-index constraint from run31.

- [ ] **Step 2: Add the race RED test using existing `deferred()`**

```ts
it('ignores a stale slower bundle after a newer date succeeds', async () => {
  const run31Response = deferred<Response>()
  const run01Response = deferred<Response>()

  const fetchMock = vi.fn((input: RequestInfo | URL) => {
    const url = String(input)
    if (url === MANIFEST_URL) return Promise.resolve(jsonResponse(raceManifest))
    if (url === RUN_30_URL) return Promise.resolve(jsonResponse(run30))
    if (url === RUN_31_URL) return run31Response.promise
    if (url === RUN_01_URL) return run01Response.promise
    if (url === ROUTES_URL) return Promise.resolve(jsonResponse(calibratedRoutes))
    return Promise.resolve(jsonResponse({}, 404))
  })
  vi.stubGlobal('fetch', fetchMock)

  render(<App />)
  expect(await screen.findByTestId('fleet-map')).toHaveTextContent(
    `return-total:${returnTotal(run30.scenario)}`,
  )

  fireEvent.click(screen.getByRole('button', { name: /31 DE AGO DE 2026, FORECAST/i }))
  fireEvent.click(screen.getByRole('button', { name: /1 DE SEPT DE 2026, FORECAST/i }))

  run01Response.resolve(jsonResponse(run01))
  expect(await screen.findByTestId('fleet-map')).toHaveTextContent(
    `return-total:${returnTotal(run01.scenario)}`,
  )

  run31Response.resolve(jsonResponse(run31))
  await waitFor(() => {
    expect(screen.getByTestId('fleet-map')).toHaveTextContent(
      `return-total:${returnTotal(run01.scenario)}`,
    )
  })
})
```

If the exact accessible month abbreviation emitted by `OperationalDateRail` is `SEP` rather than `SEPT`, use the actual label from that component’s existing tests; keep the target date 2026-09-01 and do not use a broad `/1.*2026/` matcher that could hit another control.

- [ ] **Step 3: Run RED/GREEN check**

```bash
npm test -- tests/operationalRunSwitching.test.tsx
```

If the test already passes, React effect cleanup is sufficient; do not change production code and do not create a commit for `src/App.tsx`.

If it fails because the stale 31-August promise commits after 1 September, continue to Step 4.

- [ ] **Step 4: Add an explicit request sequence guard only if required by the failing test**

Import `useRef` and add:

```ts
const bundleRequestId = useRef(0)
```

At the start of each pending-bundle load:

```ts
const requestId = ++bundleRequestId.current
```

Before all success/failure commits:

```ts
if (cancelled || requestId !== bundleRequestId.current) return
```

Increment `bundleRequestId.current` in `changeScenario()` before clearing bundle state.

- [ ] **Step 5: Run GREEN**

```bash
npm test -- tests/operationalRunSwitching.test.tsx
```

- [ ] **Step 6: Commit the test and only the production guard actually needed**

If only the test changed:

```bash
git add tests/operationalRunSwitching.test.tsx
git commit -m "test: prevent stale operational bundle commits"
```

If the request guard was required:

```bash
git add src/App.tsx tests/operationalRunSwitching.test.tsx
git commit -m "fix: ignore stale operational bundle loads"
```

---

### Task 7: Lock V0.5 compatibility and run the completion gate

**Files:**
- Modify: `tests/operationalRunCatalog.test.ts`
- Modify: `tests/operationalBundle.test.ts`
- No production changes expected.

**Interfaces:**
- Consumes: complete PR1 runtime.
- Produces: regression evidence that checked-in V0.5 schema V1 remains valid and does not require V2 metadata.

- [ ] **Step 1: Add checked-in V1 manifest regression**

At the top of `tests/operationalRunCatalog.test.ts` import Node file helpers:

```ts
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
```

Add:

```ts
it('keeps the checked-in V0.5 manifest valid as schema V1', () => {
  const checkedIn = JSON.parse(
    readFileSync(
      resolve(process.cwd(), 'public/data/operational-runs/manifest.json'),
      'utf8',
    ),
  )

  expect(checkedIn.schemaVersion).toBe(1)
  expect(validateOperationalRunManifest(checkedIn)).toEqual([])
  expect(checkedIn.runs.every((run: Record<string, unknown>) => !('routeArtifact' in run))).toBe(true)
})
```

- [ ] **Step 2: Add explicit V1 route-metadata regression**

In `tests/operationalBundle.test.ts`:

```ts
it('does not require V2 binding metadata for a legacy V1 shared route asset', async () => {
  const run = runFixture('fleetflow-v0.5', 'cordoba-2026-08-31-v2')
  const entry = entryV1Fixture(run)
  const routes = routeCollectionForScenario(run.scenario)
  delete routes.metadata

  const fetcher = fetchMap({
    './data/operational-runs/generated/cordoba-2026-08-31-v2.json': run,
    './data/cordoba-calibrated-routes.geojson': routes,
  })

  await expect(loadOperationalBundle({
    entry,
    manifestUrl: './data/operational-runs/manifest.json',
    legacyRouteAsset: './data/cordoba-calibrated-routes.geojson',
    fetcher,
  })).resolves.toMatchObject({ run, routes })
})
```

- [ ] **Step 3: Run the focused operational regression set**

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

Expected: all pass.

- [ ] **Step 4: Commit compatibility tests**

```bash
git add tests/operationalRunCatalog.test.ts tests/operationalBundle.test.ts
git commit -m "test: preserve v0.5 operational run compatibility"
```

- [ ] **Step 5: Run the full suite**

```bash
npm test
```

Expected: every pre-existing V0.5 test and every new PR1 test passes.

- [ ] **Step 6: Run production build**

```bash
npm run build
```

Expected: `tsc -b` and Vite production build both succeed.

- [ ] **Step 7: Inspect scope before completion**

```bash
git diff main...HEAD --name-only
```

The changed production surface must be limited to:

```text
src/scenario/operationalRuns/types.ts
src/scenario/operationalRuns/catalog.ts
src/scenario/operationalRuns/bundle.ts
src/map/routeAssets.ts
src/App.tsx
```

plus the planned test files. The diff must not include V0.6 demand generation, generated data, or `src/simulation/*` changes.

- [ ] **Step 8: Inspect task-sized commits**

```bash
git log --oneline main..HEAD
```

Expected logical commit sequence:

```text
test: preserve v0.5 operational run compatibility
test: prevent stale operational bundle commits
feat: switch operational bundles atomically
feat: load validated operational bundles
feat: bind route artifacts to operational runs
feat: validate operational manifest v2
feat: add operational manifest v2 contracts
```

If the race test required a production fix, the stale-load commit message is `fix: ignore stale operational bundle loads` instead of the test-only message.

Do not create an empty completion commit.

---

## PR1 Acceptance Criteria

PR1 is ready for review only when all of these are true:

1. Manifest schema V1 still parses and loads current V0.5 runs with the scenario-level route asset.
2. Manifest schema V2 requires a safe per-run `routeArtifact` and accepts an optional safe `contextArtifact`.
3. V1 rejects V2-only artifact fields instead of silently reinterpreting them.
4. V2 run artifacts retain all existing manifest/run identity checks.
5. V2 route GeoJSON passes both existing topology validation and `runId` / `targetDate` / `modelVersion` binding validation.
6. Missing/invalid required run or route rejects the requested V2 bundle.
7. Optional context failure becomes `context.status === 'unavailable'` without invalidating a valid run/routes pair.
8. Timeline runtime commits `run + routes + context-state` as one `OperationalBundle`.
9. While a new date is loading, the previous valid operation remains rendered.
10. If the new required bundle fails, the previous valid operation remains rendered and an unavailable alert is shown.
11. A stale slower request cannot overwrite a newer successful date selection.
12. Static scenarios continue to use their existing scenario-level route assets.
13. No V0.5 generated artifact or manifest is rewritten in PR1.
14. `npm test` passes.
15. `npm run build` passes.

## Explicit Handoff to PR2

PR1 stops before producing V0.6 geography. PR2 — **Daily Spatial Demand** — begins from the bundle boundary and will create/version the Córdoba synthetic candidate pool, choose 45–65 active destinations per day, assign them to the fixed eight trucks, prepare per-run route GeoJSON with the binding metadata defined here, and publish the first real manifest V2 operational bundles.

Do not pull PR2 generation logic into PR1.