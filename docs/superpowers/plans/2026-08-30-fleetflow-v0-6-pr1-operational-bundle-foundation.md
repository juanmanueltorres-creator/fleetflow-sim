# FleetFlow V0.6 PR1 — Operational Bundle Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add manifest V2 support and atomically load a validated operational run plus matching route geometry while preserving V0.5 manifest V1 behavior and the last valid rendered operation on failed date switches.

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

### Modify

- `src/scenario/operationalRuns/types.ts` — discriminated manifest V1/V2 contracts and minimal optional-context load state.
- `src/scenario/operationalRuns/catalog.ts` — V1/V2 validation, safe artifact resolution, manifest/run identity checks.
- `src/map/routeAssets.ts` — optional route collection binding metadata plus V2 run-binding assertion.
- `src/App.tsx` — atomic committed bundle state for timeline scenarios; static scenarios keep their current route path.
- `tests/operationalRunCatalog.test.ts` — V1 regression and V2 catalog/security coverage.
- `tests/routeAssets.test.ts` — V2 route binding coverage using existing `variableScenario` and `makeVariableCollection()` fixtures.
- `tests/operationalRunSwitching.test.tsx` — pending/failure retention and stale-request coverage.

### Create

- `src/scenario/operationalRuns/bundle.ts` — required run/route loading plus optional-context degradation.
- `tests/operationalBundle.test.ts` — unit tests for V1 fallback, V2 binding, required failures, and optional context.

### Intentionally untouched

- `scripts/generate-operational-runs.mjs`
- `scripts/lib/calibrated-scenario-generator.mjs`
- `public/data/operational-runs/manifest.json`
- `public/data/operational-runs/generated/*`
- `src/simulation/*`

---

### Task 1: Add discriminated manifest V1/V2 contracts

**Files:**
- Modify: `src/scenario/operationalRuns/types.ts`
- Modify: `tests/operationalRunCatalog.test.ts`

**Interfaces:**
- Produces `OperationalRunManifestEntryBase`, `OperationalRunManifestEntryV1`, `OperationalRunManifestEntryV2`, `OperationalRunManifestEntry`, `OperationalRunManifestV1`, `OperationalRunManifestV2`, `OperationalRunManifest`, `OperationalContextEnvelope`, `OperationalContextLoadState`.

- [ ] **Step 1: Add the failing V2 type/validation test**

In `tests/operationalRunCatalog.test.ts` add imports and helpers:

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

Expected: compile/test failure because V2 types do not exist and schema 2 is rejected.

- [ ] **Step 3: Replace the current single manifest contract**

In `src/scenario/operationalRuns/types.ts`, keep existing run/provenance types and replace the manifest section with:

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

- [ ] **Step 4: Run the type check and focused test**

```bash
npx tsc -b --pretty false
npm test -- tests/operationalRunCatalog.test.ts
```

Expected: V1 remains type-compatible; V2 still fails only because catalog validation is not implemented yet.

- [ ] **Step 5: Commit**

```bash
git add src/scenario/operationalRuns/types.ts tests/operationalRunCatalog.test.ts
git commit -m "feat: add operational manifest v2 contracts"
```

---

### Task 2: Make catalog validation and artifact resolution schema-aware

**Files:**
- Modify: `src/scenario/operationalRuns/catalog.ts`
- Modify: `tests/operationalRunCatalog.test.ts`

**Interfaces:**
- Produces:

```ts
export function resolveOperationalArtifactUrl(
  manifestUrl: string,
  artifact: string,
  kind: 'run' | 'route' | 'context',
): string
```

Existing `validateOperationalRunManifest`, `requireValidOperationalRunManifest`, `selectDefaultRunEntry`, `loadOperationalRunManifest`, `resolveOperationalRunArtifactUrl`, and `loadOperationalRun` remain public.

- [ ] **Step 1: Add failing V2 validation/security cases**

Add:

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

it.each([
  '../escape.json',
  './generated/../escape.context.json',
  'https://example.com/context.json',
  './other/context.json',
])('rejects unsafe V2 context artifact path %s', (contextArtifact) => {
  expect(validateOperationalRunManifest(manifestV2([
    entryV2({ contextArtifact }),
  ]))).toContainEqual(expect.stringMatching(/contextArtifact/i))
})

it('accepts V2 when optional contextArtifact is omitted', () => {
  const { contextArtifact: _removed, ...withoutContext } = entryV2()
  expect(validateOperationalRunManifest({ schemaVersion: 2, runs: [withoutContext] })).toEqual([])
})

it('rejects V1 entries containing V2-only fields', () => {
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

Change the existing unsupported-schema test from `schemaVersion: 2` to `schemaVersion: 3`.

- [ ] **Step 2: Run RED**

```bash
npm test -- tests/operationalRunCatalog.test.ts
```

Expected: V2 cases fail.

- [ ] **Step 3: Add exact safe-path patterns**

Replace the single `ARTIFACT_PATH` with:

```ts
const RUN_ARTIFACT_PATH = /^\.\/generated\/[a-z0-9]+(?:-[a-z0-9]+)*\.json$/i
const ROUTE_ARTIFACT_PATH = /^\.\/generated\/[a-z0-9]+(?:-[a-z0-9]+)*\.routes\.geojson$/i
const CONTEXT_ARTIFACT_PATH = /^\.\/generated\/[a-z0-9]+(?:-[a-z0-9]+)*\.context\.json$/i

function matchesArtifactPath(value: unknown, pattern: RegExp): value is string {
  return typeof value === 'string' && pattern.test(value)
}
```

- [ ] **Step 4: Make entry validation receive `schemaVersion: 1 | 2`**

Keep all current common metadata checks. Add schema-specific checks:

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

At manifest level:

```ts
if (value.schemaVersion !== 1 && value.schemaVersion !== 2) {
  errors.push('Operational run manifest schemaVersion must be 1 or 2')
  return errors
}
```

Reject duplicate run artifacts, duplicate V2 route artifacts, and duplicate non-undefined V2 context artifacts.

- [ ] **Step 5: Add the safe resolver and preserve the existing run wrapper**

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

export function resolveOperationalRunArtifactUrl(manifestUrl: string, artifact: string): string {
  return resolveOperationalArtifactUrl(manifestUrl, artifact, 'run')
}
```

- [ ] **Step 6: Normalize selection across the union**

At the start of `selectDefaultRunEntry()`:

```ts
const entries: OperationalRunManifestEntry[] = [...manifest.runs]
```

Keep the existing filter/sort/exact/latest-past/earliest-future behavior unchanged.

- [ ] **Step 7: Run GREEN**

```bash
npm test -- tests/operationalRunCatalog.test.ts tests/operationalRunCatalogSecurity.test.ts
```

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
- Produces `RouteGeometryBinding` and `assertRouteCollectionMatchesRun(collection, run)`.

- [ ] **Step 1: Add failing tests using the existing route-assets fixtures**

Add imports:

```ts
import type { OperationalRun } from '../src/scenario/operationalRuns/types'
```

Add one local run fixture using the existing `variableScenario`:

```ts
function variableOperationalRun(): OperationalRun {
  return {
    id: 'cordoba-2026-08-31-v3',
    targetDate: '2026-08-31',
    issuedAt: '2026-08-30T21:00:00-03:00',
    dataAsOf: '2026-08-30T21:00:00-03:00',
    mode: 'FORECAST',
    scenarioId: 'cordoba-calibrated',
    modelVersion: 'fleetflow-v0.6',
    provenance: {
      generator: 'route-binding-test',
      seed: 'route-binding-test:2026-08-31',
      notes: ['Synthetic test run.'],
    },
    scenario: structuredClone(variableScenario),
  }
}
```

Add tests directly against existing `makeVariableCollection()`:

```ts
it('accepts route binding metadata matching the selected run', () => {
  const run = variableOperationalRun()
  const collection = makeVariableCollection()
  collection.metadata = {
    runId: run.id,
    targetDate: run.targetDate,
    modelVersion: run.modelVersion,
  }

  expect(() => routeAssets.assertRouteCollectionMatchesRun(collection, run)).not.toThrow()
})

it.each([
  ['runId', 'cordoba-2026-08-30-v3'],
  ['targetDate', '2026-08-30'],
  ['modelVersion', 'fleetflow-v9'],
] as const)('rejects route binding mismatch for %s', (field, wrongValue) => {
  const run = variableOperationalRun()
  const collection = makeVariableCollection()
  collection.metadata = {
    runId: run.id,
    targetDate: run.targetDate,
    modelVersion: run.modelVersion,
    [field]: wrongValue,
  }

  expect(() => routeAssets.assertRouteCollectionMatchesRun(collection, run)).toThrow(
    new RegExp(`route.*${field}.*mismatch`, 'i'),
  )
})

it('rejects missing route binding metadata when binding is required', () => {
  const run = variableOperationalRun()
  expect(() => routeAssets.assertRouteCollectionMatchesRun(makeVariableCollection(), run))
    .toThrow(/metadata.*required/i)
})
```

- [ ] **Step 2: Run RED**

```bash
npm test -- tests/routeAssets.test.ts
```

Expected: `metadata` and `assertRouteCollectionMatchesRun` do not exist.

- [ ] **Step 3: Extend the collection contract without weakening topology checks**

In `src/map/routeAssets.ts` add:

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

Leave all current `routeCollectionToIndex()` validation untouched.

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

### Task 4: Implement `loadOperationalBundle()` with optional-context degradation

**Files:**
- Create: `src/scenario/operationalRuns/bundle.ts`
- Create: `tests/operationalBundle.test.ts`

**Interfaces:**

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

- [ ] **Step 1: Create exact test fixtures**

Create `tests/operationalBundle.test.ts` with these helpers:

```ts
import { describe, expect, it } from 'vitest'
import type { FleetScenario } from '../src/domain/types'
import type {
  RouteGeometryBinding,
  RouteGeometryCollection,
} from '../src/map/routeAssets'
import { getScenarioDefinition } from '../src/scenario/scenarioRegistry'
import { loadOperationalBundle } from '../src/scenario/operationalRuns/bundle'
import type {
  OperationalRun,
  OperationalRunManifestEntryV1,
  OperationalRunManifestEntryV2,
} from '../src/scenario/operationalRuns/types'
import type { FetchLike } from '../src/scenario/operationalRuns/catalog'

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
      generator: 'bundle-test',
      seed: `bundle-test:${id}`,
      notes: ['Synthetic test run.'],
    },
    scenario: structuredClone(getScenarioDefinition('cordoba-calibrated').scenario),
  }
}

function v1Entry(run: OperationalRun): OperationalRunManifestEntryV1 {
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

function v2Entry(run: OperationalRun, withContext = false): OperationalRunManifestEntryV2 {
  return {
    id: run.id,
    targetDate: run.targetDate,
    issuedAt: run.issuedAt,
    dataAsOf: run.dataAsOf,
    mode: run.mode,
    scenarioId: run.scenarioId,
    modelVersion: run.modelVersion,
    artifact: `./generated/${run.id}.json`,
    routeArtifact: `./generated/${run.id}.routes.geojson`,
    ...(withContext ? { contextArtifact: `./generated/${run.id}.context.json` } : {}),
  }
}

function routesFor(
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

- [ ] **Step 2: Add RED tests for V1, V2, required mismatch, and optional context**

```ts
it('loads V1 with the supplied legacy route asset', async () => {
  const run = runFixture('fleetflow-v0.5', 'cordoba-2026-08-31-v2')
  const routes = routesFor(run.scenario)
  const bundle = await loadOperationalBundle({
    entry: v1Entry(run),
    manifestUrl: './data/operational-runs/manifest.json',
    legacyRouteAsset: './data/cordoba-calibrated-routes.geojson',
    fetcher: fetchMap({
      './data/operational-runs/generated/cordoba-2026-08-31-v2.json': run,
      './data/cordoba-calibrated-routes.geojson': routes,
    }),
  })

  expect(bundle.run).toEqual(run)
  expect(bundle.routes).toEqual(routes)
  expect(bundle.context).toEqual({ status: 'omitted' })
})

it('loads V2 with matching per-run routes', async () => {
  const run = runFixture('fleetflow-v0.6', 'cordoba-2026-08-31-v3')
  const routes = routesFor(run.scenario, {
    runId: run.id,
    targetDate: run.targetDate,
    modelVersion: run.modelVersion,
  })

  await expect(loadOperationalBundle({
    entry: v2Entry(run),
    manifestUrl: './data/operational-runs/manifest.json',
    fetcher: fetchMap({
      './data/operational-runs/generated/cordoba-2026-08-31-v3.json': run,
      './data/operational-runs/generated/cordoba-2026-08-31-v3.routes.geojson': routes,
    }),
  })).resolves.toMatchObject({ run, routes, context: { status: 'omitted' } })
})

it('rejects V2 routes bound to another run', async () => {
  const run = runFixture('fleetflow-v0.6', 'cordoba-2026-08-31-v3')
  const routes = routesFor(run.scenario, {
    runId: 'cordoba-2026-08-30-v3',
    targetDate: run.targetDate,
    modelVersion: run.modelVersion,
  })

  await expect(loadOperationalBundle({
    entry: v2Entry(run),
    manifestUrl: './data/operational-runs/manifest.json',
    fetcher: fetchMap({
      './data/operational-runs/generated/cordoba-2026-08-31-v3.json': run,
      './data/operational-runs/generated/cordoba-2026-08-31-v3.routes.geojson': routes,
    }),
  })).rejects.toThrow(/route.*runId.*mismatch/i)
})

it('degrades unavailable optional context without rejecting the operation', async () => {
  const run = runFixture('fleetflow-v0.6', 'cordoba-2026-08-31-v3')
  const routes = routesFor(run.scenario, {
    runId: run.id,
    targetDate: run.targetDate,
    modelVersion: run.modelVersion,
  })

  const bundle = await loadOperationalBundle({
    entry: v2Entry(run, true),
    manifestUrl: './data/operational-runs/manifest.json',
    fetcher: fetchMap({
      './data/operational-runs/generated/cordoba-2026-08-31-v3.json': run,
      './data/operational-runs/generated/cordoba-2026-08-31-v3.routes.geojson': routes,
    }),
  })

  expect(bundle.context.status).toBe('unavailable')
  expect(bundle.run).toEqual(run)
  expect(bundle.routes).toEqual(routes)
})

it('degrades mismatched optional context without rejecting the operation', async () => {
  const run = runFixture('fleetflow-v0.6', 'cordoba-2026-08-31-v3')
  const routes = routesFor(run.scenario, {
    runId: run.id,
    targetDate: run.targetDate,
    modelVersion: run.modelVersion,
  })

  const bundle = await loadOperationalBundle({
    entry: v2Entry(run, true),
    manifestUrl: './data/operational-runs/manifest.json',
    fetcher: fetchMap({
      './data/operational-runs/generated/cordoba-2026-08-31-v3.json': run,
      './data/operational-runs/generated/cordoba-2026-08-31-v3.routes.geojson': routes,
      './data/operational-runs/generated/cordoba-2026-08-31-v3.context.json': {
        runId: 'cordoba-2026-08-30-v3',
        targetDate: run.targetDate,
        modelVersion: run.modelVersion,
      },
    }),
  })

  expect(bundle.context.status).toBe('unavailable')
  expect(bundle.run).toEqual(run)
})
```

- [ ] **Step 3: Run RED**

```bash
npm test -- tests/operationalBundle.test.ts
```

Expected: module-not-found failure for `bundle.ts`.

- [ ] **Step 4: Implement strict required route loading**

Create `src/scenario/operationalRuns/bundle.ts` and import the exact interfaces/functions named above. Add:

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

- [ ] **Step 5: Implement optional context envelope validation**

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

- [ ] **Step 6: Implement `loadOperationalBundle()`**

```ts
export async function loadOperationalBundle(
  options: LoadOperationalBundleOptions,
): Promise<OperationalBundle> {
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

  let context: OperationalContextLoadState = { status: 'omitted' }
  if (isV2Entry(options.entry) && options.entry.contextArtifact) {
    try {
      const url = resolveOperationalArtifactUrl(
        options.manifestUrl,
        options.entry.contextArtifact,
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
```

Only optional context is caught. Required run/route errors reject the bundle.

- [ ] **Step 7: Run GREEN**

```bash
npm test -- tests/operationalBundle.test.ts tests/routeAssets.test.ts tests/operationalRunCatalog.test.ts
```

- [ ] **Step 8: Commit**

```bash
git add src/scenario/operationalRuns/bundle.ts tests/operationalBundle.test.ts
git commit -m "feat: load validated operational bundles"
```

---

### Task 5: Commit timeline state atomically in `App.tsx`

**Files:**
- Modify: `src/App.tsx`
- Modify: `tests/operationalRunSwitching.test.tsx`

**Interfaces:**
- Consumes `loadOperationalBundle()`.
- Produces committed `activeBundle`, committed `selectedRunId`, requested `pendingRunId`, and separate `staticRoutes` for non-timeline scenarios.

- [ ] **Step 1: Make current pending/failure tests assert retention instead of disappearance**

In the existing success-switch test, after clicking 31 August and before resolving `run31Response`, replace the current map-removal assertion with:

```ts
expect(screen.getByTestId('fleet-map')).toHaveTextContent(
  `return-total:${returnTotal(run30.scenario)}`,
)
expect(screen.getByText('Loading operational run…')).toBeInTheDocument()
```

In the existing unavailable-run test, replace map/panel-removal assertions with:

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

- [ ] **Step 2: Run RED**

```bash
npm test -- tests/operationalRunSwitching.test.tsx
```

Expected: current code clears run/routes immediately, so the old map disappears.

- [ ] **Step 3: Replace timeline state with a committed bundle and pending selection**

Import:

```ts
import {
  loadOperationalBundle,
  type OperationalBundle,
} from './scenario/operationalRuns/bundle'
```

Use:

```ts
const [activeBundle, setActiveBundle] = useState<OperationalBundle | null>(null)
const [selectedRunId, setSelectedRunId] = useState<string | null>(null)
const [pendingRunId, setPendingRunId] = useState<string | null>(null)
const [staticRoutes, setStaticRoutes] = useState<RouteGeometryCollection | null>(null)
```

Derive:

```ts
const activeRun = timeline ? activeBundle?.run ?? null : null
const activeScenario = timeline ? activeRun?.scenario ?? null : activeDefinition.scenario
const routes = timeline ? activeBundle?.routes ?? null : staticRoutes
```

- [ ] **Step 4: Make the shared route effect static-only**

At the top of the current route-loading effect:

```ts
if (timeline) {
  setStaticRoutes(null)
  setRouteError(false)
  return
}
```

For static scenarios, preserve the current `activeDefinition.routeAsset` fetch and `routeCollectionToIndex()` validation, replacing only `setRoutes()` with `setStaticRoutes()`.

- [ ] **Step 5: Make manifest load set `pendingRunId`, not committed selection**

After finding `defaultEntry`:

```ts
setRunManifest(manifest)
setPendingRunId(defaultEntry.id)
```

- [ ] **Step 6: Replace the selected-run effect with the exact bundle transition**

```ts
useEffect(() => {
  if (!timeline || !runManifest || !pendingRunId) return

  const entry = runManifest.runs.find((candidate) => candidate.id === pendingRunId)
  if (!entry || entry.scenarioId !== scenarioId) {
    setPendingRunId(null)
    setRunError(true)
    setRunLoading(false)
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

The failure path never clears `activeBundle`.

- [ ] **Step 7: Make date clicks non-destructive**

```ts
const changeOperationalRun = (nextId: string) => {
  if (nextId === selectedRunId || nextId === pendingRunId) return
  setRunError(false)
  setPendingRunId(nextId)
}
```

Reset playback/clock only on successful bundle commit.

- [ ] **Step 8: Clear bundle state on scenario-family changes**

Inside `changeScenario()` clear:

```ts
setActiveBundle(null)
setSelectedRunId(null)
setPendingRunId(null)
setRunManifest(null)
setStaticRoutes(null)
```

Keep the existing simulation/error reset behavior.

- [ ] **Step 9: Key the map to the committed bundle**

```tsx
<FleetMap
  key={`${scenarioId}:${activeBundle?.run.id ?? 'static'}`}
  scenario={activeScenario}
  routes={routes}
  snapshot={snapshot}
/>
```

`OperationalDateRail` continues receiving committed `selectedRunId`; pending requests do not become `aria-current` before validation.

- [ ] **Step 10: Run GREEN**

```bash
npm test -- tests/operationalRunSwitching.test.tsx tests/appSmoke.test.tsx tests/scenarioSwitching.test.tsx
```

- [ ] **Step 11: Commit**

```bash
git add src/App.tsx tests/operationalRunSwitching.test.tsx
git commit -m "feat: switch operational bundles atomically"
```

---

### Task 6: Prove stale slower requests cannot overwrite newer selections

**Files:**
- Modify: `tests/operationalRunSwitching.test.tsx`
- Modify: `src/App.tsx` only if the test exposes a race.

**Interfaces:**
- Latest pending request wins. Effect cleanup is preferred; an explicit sequence ref is added only if the RED test proves it necessary.

- [ ] **Step 1: Add a third concrete V1 run to the switching test**

Extend imports:

```ts
import type {
  OperationalRun,
  OperationalRunManifest,
  OperationalRunManifestV1,
} from '../src/scenario/operationalRuns/types'
```

Add:

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

const manifestV1 = manifest as OperationalRunManifestV1
const raceManifest: OperationalRunManifestV1 = {
  schemaVersion: 1,
  runs: [
    ...manifestV1.runs,
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

- [ ] **Step 2: Add the exact race test**

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
  fireEvent.click(screen.getByRole('button', { name: /01 DE SEPT DE 2026, FORECAST/i }))

  run01Response.resolve(jsonResponse(run01))
  await waitFor(() => {
    expect(screen.getByTestId('fleet-map')).toHaveTextContent(
      `return-total:${returnTotal(run01.scenario)}`,
    )
  })

  run31Response.resolve(jsonResponse(run31))
  await waitFor(() => {
    expect(screen.getByTestId('fleet-map')).toHaveTextContent(
      `return-total:${returnTotal(run01.scenario)}`,
    )
  })
})
```

`formatOperationalDate()` uses `es-AR` short month formatting and uppercases it, so the expected accessible label for `2026-09-01` is `01 DE SEPT DE 2026, FORECAST`, consistent with the existing `30 DE AGO...` test pattern.

- [ ] **Step 3: Run the test**

```bash
npm test -- tests/operationalRunSwitching.test.tsx
```

If it already passes, effect cleanup is sufficient and production code does not change.

If it fails because 31 August overwrites 1 September, continue.

- [ ] **Step 4: Add a request sequence guard only after that failure**

Import `useRef` and add:

```ts
const bundleRequestId = useRef(0)
```

At each pending load:

```ts
const requestId = ++bundleRequestId.current
```

Before success/failure commits:

```ts
if (cancelled || requestId !== bundleRequestId.current) return
```

At the beginning of `changeScenario()`:

```ts
bundleRequestId.current += 1
```

- [ ] **Step 5: Run GREEN and commit**

```bash
npm test -- tests/operationalRunSwitching.test.tsx
```

If only the test changed:

```bash
git add tests/operationalRunSwitching.test.tsx
git commit -m "test: prevent stale operational bundle commits"
```

If the guard was required:

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

- [ ] **Step 1: Add checked-in V1 manifest regression**

Add imports:

```ts
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
```

Add test:

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
  expect(
    checkedIn.runs.every((run: Record<string, unknown>) => !('routeArtifact' in run)),
  ).toBe(true)
})
```

- [ ] **Step 2: Add explicit legacy-route regression**

In `tests/operationalBundle.test.ts`:

```ts
it('does not require V2 binding metadata for a V1 shared route asset', async () => {
  const run = runFixture('fleetflow-v0.5', 'cordoba-2026-08-31-v2')
  const routes = routesFor(run.scenario)

  await expect(loadOperationalBundle({
    entry: v1Entry(run),
    manifestUrl: './data/operational-runs/manifest.json',
    legacyRouteAsset: './data/cordoba-calibrated-routes.geojson',
    fetcher: fetchMap({
      './data/operational-runs/generated/cordoba-2026-08-31-v2.json': run,
      './data/cordoba-calibrated-routes.geojson': routes,
    }),
  })).resolves.toMatchObject({ run, routes })
})
```

- [ ] **Step 3: Run the focused regression set**

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

- [ ] **Step 4: Commit compatibility coverage**

```bash
git add tests/operationalRunCatalog.test.ts tests/operationalBundle.test.ts
git commit -m "test: preserve v0.5 operational run compatibility"
```

- [ ] **Step 5: Run all tests**

```bash
npm test
```

Expected: every existing and new test passes.

- [ ] **Step 6: Run the production build**

```bash
npm run build
```

Expected: `tsc -b` and Vite build succeed.

- [ ] **Step 7: Inspect scope**

```bash
git diff main...HEAD --name-only
```

Allowed production files:

```text
src/scenario/operationalRuns/types.ts
src/scenario/operationalRuns/catalog.ts
src/scenario/operationalRuns/bundle.ts
src/map/routeAssets.ts
src/App.tsx
```

Plus the planned test files only. No generated data, generator, or `src/simulation/*` changes belong in PR1.

- [ ] **Step 8: Inspect task-sized history**

```bash
git log --oneline main..HEAD
```

Expected logical sequence:

```text
test: preserve v0.5 operational run compatibility
test: prevent stale operational bundle commits
feat: switch operational bundles atomically
feat: load validated operational bundles
feat: bind route artifacts to operational runs
feat: validate operational manifest v2
feat: add operational manifest v2 contracts
```

If Task 6 required production protection, use `fix: ignore stale operational bundle loads` instead of the test-only stale-load commit. Do not create an empty completion commit.

---

## PR1 Acceptance Criteria

1. Manifest schema V1 still parses and loads current V0.5 runs with the scenario-level route asset.
2. Manifest schema V2 requires a safe per-run `routeArtifact` and accepts an optional safe `contextArtifact`.
3. V1 rejects V2-only artifact fields instead of silently reinterpreting them.
4. V2 run artifacts retain existing manifest/run identity checks.
5. V2 route GeoJSON passes existing topology validation plus `runId` / `targetDate` / `modelVersion` binding validation.
6. Missing/invalid required run or route rejects the requested V2 bundle.
7. Missing or identity-mismatched optional context becomes `context.status === 'unavailable'` without rejecting valid run/routes.
8. Timeline runtime commits run/routes/context-state as one `OperationalBundle`.
9. While a new date loads, the previous valid operation remains rendered.
10. A failed requested bundle leaves the previous operation rendered and exposes an unavailable alert.
11. A stale slower request cannot overwrite a newer successful date.
12. Static scenarios continue using their existing route assets.
13. No V0.5 generated artifact or manifest is rewritten.
14. `npm test` passes.
15. `npm run build` passes.

## Explicit Handoff to PR2

PR1 stops before producing V0.6 geography. PR2 — **Daily Spatial Demand** — begins from this bundle boundary and will create/version the Córdoba candidate pool, select 45–65 active destinations per date, assign them to the fixed eight trucks, prepare per-run road-following GeoJSON carrying the binding metadata defined here, and publish the first real manifest V2 bundles.

Do not pull PR2 generation logic into PR1.