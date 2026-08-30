# FleetFlow V0.5 — Operational Timeline Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a date-aware operational timeline to the calibrated Córdoba scenario so FleetFlow can load, validate, replay, and compare immutable daily `OperationalRun` artifacts while preserving the existing V0.4 simulation engine and Legacy V0 behavior.

**Architecture:** Add an `OperationalRun` envelope above `FleetScenario`, backed by a manifest and static JSON artifacts under `public/data/operational-runs/`. Reuse the existing calibrated generator through a shared deterministic generation core with separate operational/geography seeds; the browser loads only the manifest and selected run, then passes `run.scenario` into the unchanged V0.4 engine. Timeline orchestration stays outside the simulation engine and fails closed on invalid/missing data.

**Tech Stack:** React 19, TypeScript 5.7, Vite 6, Vitest 3 + Testing Library, Node.js 22 ESM scripts, MapLibre GL 6.6, Turf 7.4, static JSON/GeoJSON on GitHub Pages.

**Spec:** `docs/superpowers/specs/2026-08-30-fleetflow-v0-5-operational-timeline-design.md`

## Global Constraints

- Keep `FleetScenario`, `getFleetSnapshot()`, `deriveFleetMetrics()`, `FleetMap`, `FleetPanel`, and `KpiPanel` date-agnostic.
- Operational timezone is exactly `America/Argentina/Cordoba`.
- Initial artifacts use only `SIMULATED` and `FORECAST`; never ship fake `OBSERVED` data.
- A committed `OperationalRun` is immutable; generation must fail instead of overwriting an existing run artifact.
- Runtime data lives under `public/data/operational-runs/` and is fetched on demand; do not import all run JSON into the Vite bundle.
- V0.5 keeps exactly 8 calibrated vehicles, 60 calibrated delivery locations, the same depot, delivery coordinates, vehicle IDs, route ownership, geometry IDs, and road GeoJSON across dates.
- Daily variation is limited to package demand/allocation, package volume, service duration, time windows, departure offsets, sampled travel time, return time, safe vehicle capacity/utilization, and derived metrics.
- Preserve the V0.4 physical timing guard: no generated leg may imply speed above 60 km/h.
- Preserve `generate:calibrated`, provisional generation, route reconciliation, Legacy V0, and all existing tests.
- No new date library, backend, database, live weather, live traffic, incidents, GPS, OR-Tools, automatic daily workflow, or dynamic road generation in V0.5.
- All runtime validation is fail-closed; old run state must never masquerade as a newly selected date.
- Before merge: `npm test` and `npm run build` must pass; after merge verify main CI, route preparation checks, and GitHub Pages deployment on the merged SHA.

---

## File Structure

New focused runtime files:

```text
src/scenario/operationalRuns/
├── types.ts        # run/manifest contracts
├── date.ts         # Córdoba operational-date and display helpers
├── validation.ts   # runtime run-envelope validation composed with validateScenario
└── catalog.ts      # manifest validation, default selection, safe fetch/identity matching
```

New generation files:

```text
scripts/lib/calibrated-scenario-generator.mjs  # shared V0.4/V0.5 generation core
scripts/generate-operational-runs.mjs          # deterministic date-range artifact generator
```

New static assets:

```text
public/data/operational-runs/
├── manifest.json
└── generated/
    ├── cordoba-2026-08-27-v1.json
    ├── cordoba-2026-08-28-v1.json
    ├── cordoba-2026-08-29-v1.json
    ├── cordoba-2026-08-30-v1.json
    ├── cordoba-2026-08-31-v1.json
    ├── cordoba-2026-09-01-v1.json
    ├── cordoba-2026-09-02-v1.json
    └── cordoba-2026-09-03-v1.json
```

New UI files:

```text
src/components/OperationalDateRail.tsx
src/components/OperationalDateRail.css
```

New tests:

```text
tests/operationalRunValidation.test.ts
tests/operationalRunCatalog.test.ts
tests/operationalRunGenerator.test.ts
tests/operationalRunArtifacts.test.ts
tests/operationalDateRail.test.tsx
tests/operationalRunSwitching.test.tsx
```

Existing files intentionally modified:

```text
scripts/generate-calibrated-scenario.mjs
.github/workflows/prepare-routes.yml
package.json
src/scenario/scenarioRegistry.ts
src/App.tsx
src/app.css
src/components/ScenarioProvenance.tsx
tests/calibratedScenario.test.ts
tests/prepareRoutesWorkflow.test.ts
tests/scenarioRegistry.test.ts
tests/scenarioSwitching.test.tsx
tests/dashboardComponents.test.tsx
tests/appSmoke.test.tsx
README.md
```

---

### Task 1: OperationalRun contracts, Córdoba date semantics, and runtime envelope validation

**Files:**
- Create: `src/scenario/operationalRuns/types.ts`
- Create: `src/scenario/operationalRuns/date.ts`
- Create: `src/scenario/operationalRuns/validation.ts`
- Create: `tests/operationalRunValidation.test.ts`

**Interfaces:**
- Consumes: `FleetScenario` from `src/domain/types.ts`, `validateScenario(scenario: FleetScenario): string[]`, `ScenarioId` / `SCENARIO_IDS` from `src/scenario/scenarioRegistry.ts`.
- Produces:
  - `OPERATIONAL_RUN_MODES`
  - `OperationalRunMode`
  - `OperationalRunProvenance`
  - `OperationalRun`
  - `OperationalRunManifestEntry`
  - `OperationalRunManifest`
  - `OPERATIONAL_TIME_ZONE`
  - `getCordobaOperationalDate(now?: Date): string`
  - `formatOperationalDate(targetDate: string): string`
  - `formatIssuedAt(issuedAt: string): string`
  - `validateOperationalRun(value: unknown): string[]`
  - `requireValidOperationalRun(value: unknown): OperationalRun`

- [ ] **Step 1: Write failing envelope/date tests**

Create `tests/operationalRunValidation.test.ts` with a valid fixture based on the existing calibrated scenario and explicit assertions for valid `SIMULATED` / `FORECAST`, malformed and impossible dates, malformed timestamps, `dataAsOf > issuedAt`, invalid mode, missing seed, and nested invalid scenario:

```ts
import { describe, expect, it } from 'vitest'
import type { OperationalRun } from '../src/scenario/operationalRuns/types'
import { getCordobaOperationalDate } from '../src/scenario/operationalRuns/date'
import { validateOperationalRun } from '../src/scenario/operationalRuns/validation'
import { getScenarioDefinition } from '../src/scenario/scenarioRegistry'

function validRun(): OperationalRun {
  return {
    id: 'cordoba-2026-08-31-v1',
    targetDate: '2026-08-31',
    issuedAt: '2026-08-30T21:00:00-03:00',
    dataAsOf: '2026-08-30T21:00:00-03:00',
    mode: 'FORECAST',
    modelVersion: 'fleetflow-v0.5',
    scenarioId: 'cordoba-calibrated',
    provenance: {
      generator: 'daily-calibrated-v1',
      seed: 'fleetflow:v0.5:cordoba:2026-08-31',
      notes: ['Synthetic/calibrated operational forecast.'],
    },
    scenario: structuredClone(getScenarioDefinition('cordoba-calibrated').scenario),
  }
}

describe('operational run validation', () => {
  it('accepts valid FORECAST and SIMULATED envelopes', () => {
    expect(validateOperationalRun(validRun())).toEqual([])
    const simulated = validRun()
    simulated.mode = 'SIMULATED'
    simulated.targetDate = '2026-08-29'
    expect(validateOperationalRun(simulated)).toEqual([])
  })

  it.each(['2026-2-03', '2026-02-30', 'not-a-date'])('rejects invalid targetDate %s', (targetDate) => {
    const run = validRun() as OperationalRun & { targetDate: string }
    run.targetDate = targetDate
    expect(validateOperationalRun(run)).toContainEqual(expect.stringMatching(/targetDate/i))
  })

  it('rejects timestamps without an explicit zone', () => {
    const run = validRun()
    run.issuedAt = '2026-08-30T21:00:00'
    expect(validateOperationalRun(run)).toContainEqual(expect.stringMatching(/issuedAt/i))
  })

  it('rejects dataAsOf after issuedAt', () => {
    const run = validRun()
    run.dataAsOf = '2026-08-30T22:00:00-03:00'
    expect(validateOperationalRun(run)).toContainEqual(expect.stringMatching(/dataAsOf/i))
  })

  it('rejects unknown modes and empty provenance seed', () => {
    const run = validRun()
    run.mode = 'LIVE' as OperationalRun['mode']
    run.provenance.seed = ''
    const errors = validateOperationalRun(run)
    expect(errors).toContainEqual(expect.stringMatching(/mode/i))
    expect(errors).toContainEqual(expect.stringMatching(/seed/i))
  })

  it('rejects a nested invalid FleetScenario', () => {
    const run = validRun()
    run.scenario.trucks[0].id = run.scenario.trucks[1].id
    expect(validateOperationalRun(run)).toContainEqual(expect.stringMatching(/duplicate truck id/i))
  })

  it('derives TODAY in Córdoba instead of viewer timezone', () => {
    expect(getCordobaOperationalDate(new Date('2026-08-31T02:00:00Z'))).toBe('2026-08-30')
  })
})
```

- [ ] **Step 2: Run the focused tests and confirm RED**

Run:

```bash
npm test -- --run tests/operationalRunValidation.test.ts
```

Expected: FAIL because `src/scenario/operationalRuns/*` does not exist.

- [ ] **Step 3: Add exact run/manifest contracts**

Create `src/scenario/operationalRuns/types.ts`:

```ts
import type { FleetScenario } from '../../domain/types'
import type { ScenarioId } from '../scenarioRegistry'

export const OPERATIONAL_RUN_MODES = ['FORECAST', 'SIMULATED', 'OBSERVED', 'WHAT_IF'] as const
export type OperationalRunMode = (typeof OPERATIONAL_RUN_MODES)[number]

export interface OperationalRunProvenance {
  generator: string
  seed: string
  notes: string[]
}

export interface OperationalRun {
  id: string
  targetDate: string
  issuedAt: string
  dataAsOf: string
  mode: OperationalRunMode
  modelVersion: string
  scenarioId: ScenarioId
  provenance: OperationalRunProvenance
  scenario: FleetScenario
}

export interface OperationalRunManifestEntry {
  id: string
  targetDate: string
  issuedAt: string
  dataAsOf: string
  mode: OperationalRunMode
  scenarioId: ScenarioId
  modelVersion: string
  artifact: string
}

export interface OperationalRunManifest {
  schemaVersion: 1
  runs: OperationalRunManifestEntry[]
}
```

- [ ] **Step 4: Implement timezone-safe pure-date helpers**

Create `src/scenario/operationalRuns/date.ts` with no third-party dependency:

```ts
export const OPERATIONAL_TIME_ZONE = 'America/Argentina/Cordoba'

export function getCordobaOperationalDate(now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: OPERATIONAL_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now)
  const byType = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return `${byType.year}-${byType.month}-${byType.day}`
}

export function formatOperationalDate(targetDate: string): string {
  const [year, month, day] = targetDate.split('-').map(Number)
  const value = new Date(Date.UTC(year, month - 1, day, 12))
  return new Intl.DateTimeFormat('es-AR', {
    timeZone: 'UTC',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(value).toUpperCase()
}

export function formatIssuedAt(issuedAt: string): string {
  return new Intl.DateTimeFormat('es-AR', {
    timeZone: OPERATIONAL_TIME_ZONE,
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(issuedAt)).toUpperCase()
}
```

- [ ] **Step 5: Implement fail-closed runtime validation composed with `validateScenario()`**

Create `src/scenario/operationalRuns/validation.ts`. Use `unknown` at the boundary, require explicit-zone ISO timestamps, round-trip calendar dates, verify scenario ID against `SCENARIO_IDS`, verify the nested scenario has `trucks/stores/routes` arrays before calling the existing validator, and throw only in `requireValidOperationalRun()`:

```ts
import { validateScenario } from '../../domain/scenarioValidation'
import type { FleetScenario } from '../../domain/types'
import { SCENARIO_IDS } from '../scenarioRegistry'
import { OPERATIONAL_RUN_MODES, type OperationalRun } from './types'

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/
const ISO_TIMESTAMP_WITH_ZONE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/

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
  return typeof value === 'string'
    && ISO_TIMESTAMP_WITH_ZONE.test(value)
    && Number.isFinite(Date.parse(value))
}

function isScenarioShape(value: unknown): value is FleetScenario {
  return isRecord(value)
    && Array.isArray(value.trucks)
    && Array.isArray(value.stores)
    && Array.isArray(value.routes)
    && isRecord(value.depot)
}

export function validateOperationalRun(value: unknown): string[] {
  if (!isRecord(value)) return ['Operational run must be an object']
  const errors: string[] = []

  if (typeof value.id !== 'string' || value.id.trim() === '') errors.push('Operational run id is required')
  if (!isRealIsoDate(value.targetDate)) errors.push('Operational run targetDate is invalid')
  if (!isIsoTimestamp(value.issuedAt)) errors.push('Operational run issuedAt is invalid')
  if (!isIsoTimestamp(value.dataAsOf)) errors.push('Operational run dataAsOf is invalid')
  if (isIsoTimestamp(value.issuedAt) && isIsoTimestamp(value.dataAsOf) && Date.parse(value.dataAsOf) > Date.parse(value.issuedAt)) {
    errors.push('Operational run dataAsOf cannot be later than issuedAt')
  }
  if (!OPERATIONAL_RUN_MODES.includes(value.mode as never)) errors.push('Operational run mode is invalid')
  if (typeof value.modelVersion !== 'string' || value.modelVersion.trim() === '') errors.push('Operational run modelVersion is required')
  if (!SCENARIO_IDS.includes(value.scenarioId as never)) errors.push('Operational run scenarioId is invalid')

  if (!isRecord(value.provenance)) {
    errors.push('Operational run provenance is required')
  } else {
    if (typeof value.provenance.generator !== 'string' || value.provenance.generator.trim() === '') errors.push('Operational run provenance generator is required')
    if (typeof value.provenance.seed !== 'string' || value.provenance.seed.trim() === '') errors.push('Operational run provenance seed is required')
    if (!Array.isArray(value.provenance.notes) || value.provenance.notes.some((note) => typeof note !== 'string')) errors.push('Operational run provenance notes are invalid')
  }

  if (!isScenarioShape(value.scenario)) {
    errors.push('Operational run scenario shape is invalid')
  } else {
    errors.push(...validateScenario(value.scenario))
  }

  return errors
}

export function requireValidOperationalRun(value: unknown): OperationalRun {
  const errors = validateOperationalRun(value)
  if (errors.length > 0) throw new Error(`Operational run is invalid: ${errors.join('; ')}`)
  return value as OperationalRun
}
```

- [ ] **Step 6: Run focused tests and full scenario validation regression**

Run:

```bash
npm test -- --run tests/operationalRunValidation.test.ts tests/scenarioValidation.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit Task 1**

```bash
git add src/scenario/operationalRuns tests/operationalRunValidation.test.ts
git commit -m "feat: add operational run domain contract"
```

---

### Task 2: Manifest validation, safe artifact resolution, loading, and default selection

**Files:**
- Create: `src/scenario/operationalRuns/catalog.ts`
- Create: `tests/operationalRunCatalog.test.ts`

**Interfaces:**
- Consumes: `OperationalRunManifest`, `OperationalRunManifestEntry`, `OperationalRun`, `requireValidOperationalRun()`, `getCordobaOperationalDate()`.
- Produces:
  - `validateOperationalRunManifest(value: unknown): string[]`
  - `requireValidOperationalRunManifest(value: unknown): OperationalRunManifest`
  - `selectDefaultRunEntry(manifest, scenarioId, operationalDate): OperationalRunManifestEntry | null`
  - `resolveOperationalRunArtifactUrl(manifestUrl, artifact): string`
  - `loadOperationalRunManifest(manifestUrl, fetcher?): Promise<OperationalRunManifest>`
  - `loadOperationalRun(entry, manifestUrl, fetcher?): Promise<OperationalRun>`

- [ ] **Step 1: Write RED catalog tests**

Test one valid manifest, duplicate IDs, duplicate artifact paths, unsupported schema version, unsafe `../` artifact path, default-selection rules, HTTP failure, and manifest/artifact metadata mismatch. Use a `fetcher` stub rather than global network:

```ts
const entry = {
  id: 'cordoba-2026-08-31-v1',
  targetDate: '2026-08-31',
  issuedAt: '2026-08-30T21:00:00-03:00',
  dataAsOf: '2026-08-30T21:00:00-03:00',
  mode: 'FORECAST' as const,
  scenarioId: 'cordoba-calibrated' as const,
  modelVersion: 'fleetflow-v0.5',
  artifact: './generated/cordoba-2026-08-31-v1.json',
}

it('selects current date, then latest past, then earliest future', () => {
  const manifest = { schemaVersion: 1 as const, runs: [
    { ...entry, id: 'a', targetDate: '2026-08-29', artifact: './generated/a.json', mode: 'SIMULATED' as const },
    { ...entry, id: 'b', targetDate: '2026-08-30', artifact: './generated/b.json', mode: 'SIMULATED' as const },
    { ...entry, id: 'c', targetDate: '2026-08-31', artifact: './generated/c.json' },
  ] }
  expect(selectDefaultRunEntry(manifest, 'cordoba-calibrated', '2026-08-30')?.id).toBe('b')
  expect(selectDefaultRunEntry(manifest, 'cordoba-calibrated', '2026-09-02')?.id).toBe('c')
  expect(selectDefaultRunEntry(manifest, 'cordoba-calibrated', '2026-08-01')?.id).toBe('a')
})
```

- [ ] **Step 2: Run the focused test and confirm RED**

```bash
npm test -- --run tests/operationalRunCatalog.test.ts
```

Expected: FAIL because `catalog.ts` does not exist.

- [ ] **Step 3: Implement manifest validation and safe path policy**

In `catalog.ts`, accept only `schemaVersion === 1`, require `runs` array, reject duplicate IDs/artifacts, validate every entry's date/timestamps/mode/scenario/model fields, and require artifact strings to match this policy:

```ts
function isSafeArtifactPath(value: unknown): value is string {
  return typeof value === 'string'
    && value.startsWith('./generated/')
    && !value.includes('..')
    && !value.includes('\\')
    && !value.includes('://')
}
```

Resolve relative artifact paths without relying on viewer URL:

```ts
export function resolveOperationalRunArtifactUrl(manifestUrl: string, artifact: string): string {
  if (!isSafeArtifactPath(artifact)) throw new Error(`Unsafe operational run artifact path: ${artifact}`)
  const slash = manifestUrl.lastIndexOf('/')
  const base = slash >= 0 ? manifestUrl.slice(0, slash + 1) : './'
  return `${base}${artifact.replace(/^\.\//, '')}`
}
```

- [ ] **Step 4: Implement deterministic default selection**

Filter by `scenarioId`, sort by `targetDate` then `id`, then choose exact date, latest past, or earliest future:

```ts
export function selectDefaultRunEntry(
  manifest: OperationalRunManifest,
  scenarioId: ScenarioId,
  operationalDate: string,
): OperationalRunManifestEntry | null {
  const entries = manifest.runs
    .filter((run) => run.scenarioId === scenarioId)
    .slice()
    .sort((a, b) => a.targetDate.localeCompare(b.targetDate) || a.id.localeCompare(b.id))

  const exact = entries.find((entry) => entry.targetDate === operationalDate)
  if (exact) return exact
  const past = entries.filter((entry) => entry.targetDate <= operationalDate)
  if (past.length > 0) return past.at(-1) ?? null
  return entries[0] ?? null
}
```

- [ ] **Step 5: Implement fetch + identity verification**

Use an injectable `FetchLike` and reject non-OK responses. `loadOperationalRun()` must call `requireValidOperationalRun()` and compare these seven fields to the manifest entry before returning: `id`, `targetDate`, `issuedAt`, `dataAsOf`, `mode`, `scenarioId`, `modelVersion`.

```ts
export type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>

function assertEntryMatchesRun(entry: OperationalRunManifestEntry, run: OperationalRun): void {
  const keys = ['id', 'targetDate', 'issuedAt', 'dataAsOf', 'mode', 'scenarioId', 'modelVersion'] as const
  for (const key of keys) {
    if (entry[key] !== run[key]) throw new Error(`Operational run manifest mismatch for ${key}`)
  }
}
```

- [ ] **Step 6: Run focused tests**

```bash
npm test -- --run tests/operationalRunCatalog.test.ts tests/operationalRunValidation.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit Task 2**

```bash
git add src/scenario/operationalRuns/catalog.ts tests/operationalRunCatalog.test.ts
git commit -m "feat: add operational run catalog"
```

---

### Task 3: Extract a shared calibrated generator without changing V0.4 output

**Files:**
- Create: `scripts/lib/calibrated-scenario-generator.mjs`
- Modify: `scripts/generate-calibrated-scenario.mjs`
- Modify: `tests/calibratedScenario.test.ts`
- Modify: `tests/prepareRoutesWorkflow.test.ts`
- Modify: `.github/workflows/prepare-routes.yml`

**Interfaces:**
- Produces:
  - `generateCalibratedScenario({ profile, routeGeometryIndex, operationsSeed, geographySeed, packageTarget }): object`
  - `loadRouteGeometryIndex(routesPath): Map<string, object>`
- Existing `generate-calibrated-scenario.mjs` CLI remains unchanged and sets `operationsSeed === geographySeed === --seed`, `packageTarget === 100`.

- [ ] **Step 1: Add RED regression proving independent operation/geography seeds**

Extend `tests/calibratedScenario.test.ts` so two runs using different operational seeds but the same geography seed produce identical delivery positions and different operational values. Test the shared module directly with dynamic import or through a temporary helper invocation; also keep the existing byte-equivalent checked-in V0.4 assertion.

Core assertion:

```ts
expect(runB.stores.map((store) => store.position)).toEqual(runA.stores.map((store) => store.position))
expect(runB.routes.map((route) => route.returnMinute)).not.toEqual(runA.routes.map((route) => route.returnMinute))
```

- [ ] **Step 2: Run calibrated/provisional tests and confirm RED only for the new contract**

```bash
npm test -- --run tests/calibratedScenario.test.ts tests/provisionalGeneration.test.ts tests/prepareRoutesWorkflow.test.ts
```

Expected: existing tests PASS; new shared-core test FAIL because the module/export does not exist.

- [ ] **Step 3: Move deterministic generation logic into the shared module**

Move `STOP_COUNTS`, `MAX_TRAVEL_SPEED_KMH`, `DEPOT_POSITION`, `ROUTE_ANCHORS`, hashing/PRNG, distribution sampling, package normalization, departure offsets, route geometry validation, minimum travel time, and scenario assembly into `scripts/lib/calibrated-scenario-generator.mjs`.

The central entry point must use independent seed roots:

```js
export function generateCalibratedScenario({
  profile,
  routeGeometryIndex = null,
  operationsSeed,
  geographySeed,
  packageTarget = 100,
}) {
  const operationsRandom = mulberry32(hashSeed(`${operationsSeed}:operations`))
  const geographyRandom = mulberry32(hashSeed(`${geographySeed}:geography`))
  // Preserve the existing V0.4 algorithm/order exactly; only replace PACKAGE_TARGET with packageTarget.
  // Return the same FleetScenario-shaped object written by the current script.
}
```

Do not reorder RNG calls. That requirement is what protects the existing canonical V0.4 JSON.

- [ ] **Step 4: Reduce the existing CLI to parsing/filesystem orchestration**

`generate-calibrated-scenario.mjs` keeps the same flags and modes. For final mode load route geometry; for provisional mode pass `routeGeometryIndex: null`; call:

```js
const scenario = generateCalibratedScenario({
  profile,
  routeGeometryIndex,
  operationsSeed: seed,
  geographySeed: seed,
  packageTarget: 100,
})
```

Then write the JSON exactly as before.

- [ ] **Step 5: Keep route-preparation CI sensitive to the new shared core**

Add this path under `.github/workflows/prepare-routes.yml` → `on.push.paths`:

```yaml
- scripts/lib/calibrated-scenario-generator.mjs
```

Extend `tests/prepareRoutesWorkflow.test.ts`:

```ts
expect(workflow).toContain('- scripts/lib/calibrated-scenario-generator.mjs')
```

- [ ] **Step 6: Verify V0.4 byte stability and provisional behavior**

```bash
npm test -- --run tests/calibratedScenario.test.ts tests/provisionalGeneration.test.ts tests/prepareRoutesWorkflow.test.ts
```

Expected: PASS, including exact regeneration of `src/scenario/generated/cordoba-calibrated-v1.json`.

- [ ] **Step 7: Commit Task 3**

```bash
git add scripts/lib/calibrated-scenario-generator.mjs scripts/generate-calibrated-scenario.mjs tests/calibratedScenario.test.ts tests/prepareRoutesWorkflow.test.ts .github/workflows/prepare-routes.yml
git commit -m "refactor: share calibrated scenario generator"
```

---

### Task 4: Deterministic date-range OperationalRun generator

**Files:**
- Create: `scripts/generate-operational-runs.mjs`
- Create: `tests/operationalRunGenerator.test.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: shared `generateCalibratedScenario()`, checked-in calibration profile, checked-in Córdoba route GeoJSON.
- CLI:

```text
npm run generate:operational-runs -- \
  --from YYYY-MM-DD \
  --to YYYY-MM-DD \
  --issued-at ISO_TIMESTAMP_WITH_ZONE \
  --data-as-of ISO_TIMESTAMP_WITH_ZONE \
  --output-dir DIRECTORY \
  --run-suffix STRING
```

- Fixed model metadata for V0.5:
  - `scenarioId = cordoba-calibrated`
  - `modelVersion = fleetflow-v0.5`
  - `generator = daily-calibrated-v1`
  - stable geography seed = `fleetflow-cordoba-v0.4`
  - operational seed root = `fleetflow:v0.5:cordoba:${targetDate}`
  - package baseline = 100
  - multiplier = `0.90 + seededFraction * 0.28`

- [ ] **Step 1: Write RED CLI tests**

Create `tests/operationalRunGenerator.test.ts` using temp directories. Cover:

```ts
it('reproduces identical bytes for identical explicit inputs', () => { /* run same range into two temp dirs and compare files */ })
it('changes operational values across dates while preserving geography', () => { /* compare 2026-08-30 vs 2026-08-31 */ })
it('classifies target dates after the issued Córdoba date as FORECAST', () => { /* 30 => SIMULATED, 31 => FORECAST */ })
it('keeps package totals between 90 and 118 with at least one package per stop', () => { /* inspect every artifact */ })
it('refuses to overwrite an existing artifact', () => { /* run twice into same output dir and expect throw */ })
it('rejects malformed or reversed date ranges', () => { /* invalid from/to */ })
```

- [ ] **Step 2: Run focused test and confirm RED**

```bash
npm test -- --run tests/operationalRunGenerator.test.ts
```

Expected: FAIL because the CLI does not exist.

- [ ] **Step 3: Implement pure date-range iteration and deterministic demand target**

Use UTC only for incrementing `YYYY-MM-DD` values. Do not use wall-clock time. Demand target:

```js
function dailyPackageTarget(targetDate) {
  const random = mulberry32(hashSeed(`fleetflow:v0.5:cordoba:${targetDate}:demand`))
  return Math.round(100 * (0.90 + random() * 0.28))
}
```

Export `hashSeed` / `mulberry32` from the shared generator rather than creating a second incompatible PRNG implementation.

- [ ] **Step 4: Classify mode from explicit issuance time in Córdoba**

Derive `issuedOperationalDate` with `Intl.DateTimeFormat(..., { timeZone: 'America/Argentina/Cordoba' })` and set:

```js
const mode = targetDate > issuedOperationalDate ? 'FORECAST' : 'SIMULATED'
```

This classification is written once and never mutates later.

- [ ] **Step 5: Generate one immutable run envelope per date**

For each date:

```js
const operationsSeed = `fleetflow:v0.5:cordoba:${targetDate}`
const scenario = generateCalibratedScenario({
  profile,
  routeGeometryIndex,
  operationsSeed,
  geographySeed: 'fleetflow-cordoba-v0.4',
  packageTarget: dailyPackageTarget(targetDate),
})

const id = `cordoba-${targetDate}-${runSuffix}`
const run = {
  id,
  targetDate,
  issuedAt,
  dataAsOf,
  mode,
  modelVersion: 'fleetflow-v0.5',
  scenarioId: 'cordoba-calibrated',
  provenance: {
    generator: 'daily-calibrated-v1',
    seed: operationsSeed,
    notes: [
      mode === 'FORECAST'
        ? 'Synthetic/calibrated operational forecast; not observed Córdoba delivery data.'
        : 'Synthetic/calibrated replay; not observed Córdoba delivery data.',
    ],
  },
  scenario,
}
```

Before every write, use `existsSync()` and throw if the artifact path already exists. After all artifacts are assembled, write a schema-version-1 manifest containing the mirrored metadata and `artifact: ./generated/${id}.json`. If `manifest.json` already exists, fail rather than overwrite it.

- [ ] **Step 6: Add the package script with checked-in profile/routes defaults**

Add to `package.json`:

```json
"generate:operational-runs": "node scripts/generate-operational-runs.mjs --profile src/scenario/calibration/amazon-last-mile-v1.json --routes public/data/cordoba-calibrated-routes.geojson"
```

- [ ] **Step 7: Run generator tests plus V0.4 generator regression**

```bash
npm test -- --run tests/operationalRunGenerator.test.ts tests/calibratedScenario.test.ts tests/provisionalGeneration.test.ts
```

Expected: PASS.

- [ ] **Step 8: Commit Task 4**

```bash
git add scripts/generate-operational-runs.mjs tests/operationalRunGenerator.test.ts package.json
git commit -m "feat: generate deterministic operational runs"
```

---

### Task 5: Generate, check in, and golden-test the initial eight immutable run artifacts

**Files:**
- Create: `public/data/operational-runs/manifest.json`
- Create: `public/data/operational-runs/generated/cordoba-2026-08-27-v1.json`
- Create: `public/data/operational-runs/generated/cordoba-2026-08-28-v1.json`
- Create: `public/data/operational-runs/generated/cordoba-2026-08-29-v1.json`
- Create: `public/data/operational-runs/generated/cordoba-2026-08-30-v1.json`
- Create: `public/data/operational-runs/generated/cordoba-2026-08-31-v1.json`
- Create: `public/data/operational-runs/generated/cordoba-2026-09-01-v1.json`
- Create: `public/data/operational-runs/generated/cordoba-2026-09-02-v1.json`
- Create: `public/data/operational-runs/generated/cordoba-2026-09-03-v1.json`
- Create: `tests/operationalRunArtifacts.test.ts`

**Interfaces:**
- Initial generation timestamp: `2026-08-30T21:00:00-03:00` for both `issuedAt` and `dataAsOf`.
- Expected dates/modes:

```text
2026-08-27 SIMULATED
2026-08-28 SIMULATED
2026-08-29 SIMULATED
2026-08-30 SIMULATED
2026-08-31 FORECAST
2026-09-01 FORECAST
2026-09-02 FORECAST
2026-09-03 FORECAST
```

- [ ] **Step 1: Generate the static window once**

Run from a clean branch where `public/data/operational-runs/` does not exist:

```bash
npm run generate:operational-runs -- \
  --from 2026-08-27 \
  --to 2026-09-03 \
  --issued-at 2026-08-30T21:00:00-03:00 \
  --data-as-of 2026-08-30T21:00:00-03:00 \
  --output-dir public/data/operational-runs \
  --run-suffix v1
```

Expected: one manifest + eight run JSON files; no network calls.

- [ ] **Step 2: Write RED/then GREEN artifact integrity tests against the checked-in output**

Create `tests/operationalRunArtifacts.test.ts` that:

1. validates `manifest.json` with `validateOperationalRunManifest()`;
2. requires exactly eight entries and the exact date/mode sequence above;
3. loads each artifact from disk, validates with `validateOperationalRun()`, and asserts manifest identity matches the envelope;
4. asserts every run has 8 trucks and 60 stores;
5. asserts all runs have identical store IDs/positions and route geometry IDs;
6. asserts at least two dates have different package totals or route return times;
7. runs every run through `routeCollectionToIndex()` using `public/data/cordoba-calibrated-routes.geojson`;
8. verifies the 60 km/h travel guard for all run legs;
9. regenerates only `2026-08-31` into a temp directory with the same explicit timestamps/suffix and compares the raw artifact bytes to the checked-in `cordoba-2026-08-31-v1.json`.

Golden assertion:

```ts
expect(readFileSync(regeneratedPath, 'utf8')).toBe(
  readFileSync('public/data/operational-runs/generated/cordoba-2026-08-31-v1.json', 'utf8'),
)
```

- [ ] **Step 3: Run the artifact/generator suite**

```bash
npm test -- --run tests/operationalRunArtifacts.test.ts tests/operationalRunGenerator.test.ts
```

Expected: PASS.

- [ ] **Step 4: Commit Task 5**

```bash
git add public/data/operational-runs tests/operationalRunArtifacts.test.ts
git commit -m "data: add FleetFlow V0.5 operational run window"
```

---

### Task 6: Expose timeline capability through the scenario registry

**Files:**
- Modify: `src/scenario/scenarioRegistry.ts`
- Modify: `tests/scenarioRegistry.test.ts`

**Interfaces:**
- `ScenarioDefinition` gains optional:

```ts
operationalRuns?: {
  manifestUrl: string
}
```

- `cordoba-calibrated.operationalRuns.manifestUrl` is exactly `./data/operational-runs/manifest.json`.
- `coca-coqui-legacy.operationalRuns` is `undefined`.

- [ ] **Step 1: Add failing registry assertions**

```ts
expect(calibrated.operationalRuns).toEqual({
  manifestUrl: './data/operational-runs/manifest.json',
})
expect(legacy.operationalRuns).toBeUndefined()
```

- [ ] **Step 2: Run focused test and confirm RED**

```bash
npm test -- --run tests/scenarioRegistry.test.ts
```

- [ ] **Step 3: Add the optional registry capability and calibrated value**

Keep `scenario` and `routeAsset` unchanged; only add the optional timeline metadata.

- [ ] **Step 4: Run registry + existing scenario-switch tests**

```bash
npm test -- --run tests/scenarioRegistry.test.ts tests/scenarioSwitching.test.tsx
```

Expected: PASS; Legacy behavior unchanged.

- [ ] **Step 5: Commit Task 6**

```bash
git add src/scenario/scenarioRegistry.ts tests/scenarioRegistry.test.ts
git commit -m "feat: register calibrated operational timeline"
```

---

### Task 7: Accessible compact OperationalDateRail

**Files:**
- Create: `src/components/OperationalDateRail.tsx`
- Create: `src/components/OperationalDateRail.css`
- Create: `tests/operationalDateRail.test.tsx`

**Interfaces:**

```ts
interface OperationalDateRailProps {
  entries: OperationalRunManifestEntry[]
  selectedRunId: string
  onSelect: (runId: string) => void
  now?: Date
}
```

The component sorts by date/id, renders only manifest-backed entries, marks the selected item with `aria-current="date"`, shows immutable mode separately from a relative `TODAY` label, and exposes previous/next buttons.

- [ ] **Step 1: Write RED component tests**

Cover:

```ts
it('renders only manifest-backed dates and preserves FORECAST independently from TODAY', () => { /* now in Córdoba 2026-08-31 */ })
it('marks the selected date with aria-current=date', () => { /* selected entry */ })
it('selects entries by direct click and previous/next controls', () => { /* onSelect IDs */ })
it('includes full date and mode in accessible names', () => { /* getByRole button name */ })
```

Use an explicit `now` prop; do not depend on the CI machine clock.

- [ ] **Step 2: Run focused test and confirm RED**

```bash
npm test -- --run tests/operationalDateRail.test.tsx
```

- [ ] **Step 3: Implement the rail with exact operational semantics**

Render a compact `nav` and derive `today` from `getCordobaOperationalDate(now)`. A date button should follow this shape:

```tsx
<button
  type="button"
  aria-current={entry.id === selectedRunId ? 'date' : undefined}
  aria-label={`${formatOperationalDate(entry.targetDate)}, ${entry.mode}`}
  onClick={() => onSelect(entry.id)}
>
  <strong>{shortDateLabel(entry.targetDate)}</strong>
  <span>{entry.targetDate === today ? 'TODAY' : entry.mode}</span>
</button>
```

Do not replace the immutable mode in selected-run metadata: below the rail show both `entry.mode` and `issued ${formatIssuedAt(entry.issuedAt)}` even when the entry is also `TODAY`.

- [ ] **Step 4: Style inside the existing connected top-rail language**

`OperationalDateRail.css` should use current CSS variables, Courier for operational metadata, horizontal overflow for narrow widths, visible `:focus-visible`, gold selected border, and no color-only mode distinction. Do not add a floating card or full calendar.

- [ ] **Step 5: Run focused tests**

```bash
npm test -- --run tests/operationalDateRail.test.tsx
```

Expected: PASS.

- [ ] **Step 6: Commit Task 7**

```bash
git add src/components/OperationalDateRail.tsx src/components/OperationalDateRail.css tests/operationalDateRail.test.tsx
git commit -m "feat: add operational date rail"
```

---

### Task 8: Integrate manifest/run loading and atomic date switching into App

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/app.css`
- Create: `tests/operationalRunSwitching.test.tsx`
- Modify: `tests/scenarioSwitching.test.tsx`
- Modify: `tests/appSmoke.test.tsx`

**Interfaces:**
- Calibrated active source: `activeRun?.scenario`.
- Legacy active source: `activeDefinition.scenario`.
- Date change must pause, reset minute to `0`, clear `routes`, clear current run before fetch, then load/validate the next run.
- `FleetMap` React key must include both scenario and run identity to guarantee popup/layer teardown.

- [ ] **Step 1: Add RED integration tests with real checked-in manifest/run fixtures and a mocked map**

In `tests/operationalRunSwitching.test.tsx`, read manifest, two run JSON files, and calibrated route GeoJSON from disk. Stub `fetch` by exact URL. Mock `FleetMap` to expose a deterministic operational value:

```tsx
vi.mock('../src/map/FleetMap', () => ({
  FleetMap: ({ scenario }: { scenario: FleetScenario }) => (
    <div data-testid="fleet-map">
      {scenario.routes.reduce((sum, route) => sum + route.returnMinute, 0)}
    </div>
  ),
}))
```

Required assertions:

1. manifest is fetched before the selected run;
2. default entry for a supplied/system Córdoba date is loaded;
3. clicking another rail date pauses playback and resets clock to `06:00`;
4. during a deliberately deferred second-run fetch, the old `fleet-map` is removed instead of remaining under the new selected date;
5. after resolution, map/KPIs/fleet are built from the new `run.scenario`;
6. a 404 run produces `Operational run unavailable.` and does not restore the old run under the failed date.

- [ ] **Step 2: Run integration test and confirm RED**

```bash
npm test -- --run tests/operationalRunSwitching.test.tsx
```

- [ ] **Step 3: Add App state for manifest, selection, active run, loading/error**

Add state with explicit nullability:

```ts
const [runManifest, setRunManifest] = useState<OperationalRunManifest | null>(null)
const [selectedRunId, setSelectedRunId] = useState<string | null>(null)
const [activeRun, setActiveRun] = useState<OperationalRun | null>(null)
const [runLoading, setRunLoading] = useState(false)
const [runError, setRunError] = useState(false)
```

Derive:

```ts
const timeline = activeDefinition.operationalRuns
const activeScenario = timeline ? activeRun?.scenario ?? null : activeDefinition.scenario
```

Do not call engine/route indexing when `activeScenario === null`.

- [ ] **Step 4: Add cancel-safe manifest loading**

When `timeline?.manifestUrl` changes, load/validate the manifest, compute `getCordobaOperationalDate()`, call `selectDefaultRunEntry()`, then set `selectedRunId`. On Legacy, clear timeline-only state. Use the same `cancelled` flag pattern already used by route loading so a stale response cannot win after a scenario switch.

- [ ] **Step 5: Add cancel-safe selected-run loading**

When calibrated + manifest + `selectedRunId` are ready:

```text
setRunLoading(true)
setRunError(false)
setActiveRun(null)
loadOperationalRun(...)
  success -> setActiveRun(run)
  failure -> setRunError(true), keep activeRun null
finally -> setRunLoading(false)
```

Clearing `activeRun` before fetch is mandatory for stale-state prevention.

- [ ] **Step 6: Make date switching atomic**

Add:

```ts
const changeOperationalRun = (nextId: string) => {
  if (nextId === selectedRunId) return
  setIsPlaying(false)
  setSimulationMinute(0)
  setRoutes(null)
  setRouteError(false)
  setActiveRun(null)
  setRunError(false)
  setSelectedRunId(nextId)
}
```

Render `OperationalDateRail` only when calibrated manifest + selected ID exist.

- [ ] **Step 7: Harden route loading and map remount identity**

Guard route loading if `activeScenario` is null. Key the map:

```tsx
<FleetMap
  key={`${scenarioId}:${activeRun?.id ?? 'static'}`}
  scenario={activeScenario}
  routes={routes}
  snapshot={snapshot}
/>
```

This forces MapLibre popup/source teardown between operational runs.

- [ ] **Step 8: Keep compact fail-closed states distinct**

Use:

```text
Loading operational run…
Operational run unavailable.
Unable to load simulation route data.
```

Never show the previous run while `runLoading` or `runError` applies to a newly selected run.

- [ ] **Step 9: Update current scenario-switching/app smoke mocks for the new fetch sequence**

`tests/scenarioSwitching.test.tsx` must serve:

```text
./data/operational-runs/manifest.json
./data/operational-runs/generated/<selected>.json
./data/cordoba-calibrated-routes.geojson
./data/coca-coqui-routes.geojson
```

and still verify calibrated → Legacy → calibrated resets state with no leak.

`tests/appSmoke.test.tsx` becomes async and stubs these static responses; rename the identity assertion to V0.5 once Task 9 changes copy.

- [ ] **Step 10: Run all UI/state regressions**

```bash
npm test -- --run tests/operationalRunSwitching.test.tsx tests/scenarioSwitching.test.tsx tests/appSmoke.test.tsx tests/operationalDateRail.test.tsx
```

Expected: PASS.

- [ ] **Step 11: Commit Task 8**

```bash
git add src/App.tsx src/app.css tests/operationalRunSwitching.test.tsx tests/scenarioSwitching.test.tsx tests/appSmoke.test.tsx
git commit -m "feat: integrate operational run timeline"
```

---

### Task 9: Run-mode provenance, V0.5 product copy, and README documentation

**Files:**
- Modify: `src/components/ScenarioProvenance.tsx`
- Modify: `src/components/ScenarioProvenance.css`
- Modify: `tests/dashboardComponents.test.tsx`
- Modify: `src/App.tsx`
- Modify: `tests/appSmoke.test.tsx`
- Modify: `README.md`

**Interfaces:**
- `ScenarioProvenance` gains optional `runMode?: OperationalRunMode`.
- Calibrated run heading becomes `FORECAST · ESCENARIO CALIBRADO` or `SIMULATED · ESCENARIO CALIBRADO`.
- Legacy with no run mode remains `ESCENARIO SINTÉTICO · LEGACY V0`.

- [ ] **Step 1: Add RED provenance tests**

Extend `tests/dashboardComponents.test.tsx`:

```ts
render(<ScenarioProvenance provenance={provenance} runMode="FORECAST" />)
expect(screen.getByText('FORECAST · ESCENARIO CALIBRADO')).toBeInTheDocument()
expect(screen.getByText(/Operación sintética reproducible/i)).toBeInTheDocument()
expect(document.body.textContent).not.toMatch(/operación real|tráfico real|telemetría real/i)
```

Also verify `SIMULATED` copy contains `No representa una operación real observada.` and Legacy remains unchanged without a run mode.

- [ ] **Step 2: Run focused test and confirm RED**

```bash
npm test -- --run tests/dashboardComponents.test.tsx
```

- [ ] **Step 3: Implement mode-aware disclosure without changing scenario provenance data**

Add optional prop:

```ts
interface ScenarioProvenanceProps {
  provenance: ScenarioProvenanceValue
  runMode?: OperationalRunMode
}
```

Heading:

```ts
const heading = runMode ? `${runMode} · ${provenance.shortLabel}` : provenance.shortLabel
```

Run disclosure:

```ts
const runSummary = runMode === 'FORECAST'
  ? 'Operación sintética reproducible derivada de distribuciones públicas de última milla. No representa demanda ni telemetría real de Córdoba.'
  : runMode === 'SIMULATED'
    ? 'Jornada sintética reproducible. No representa una operación real observada.'
    : null
```

Render this as an additional compact span before the existing scenario-level summary.

- [ ] **Step 4: Pass run mode only for calibrated OperationalRuns and bump visible identity to V0.5**

In `App.tsx`:

```tsx
<p className="eyebrow">Operational timeline simulation · V0.5</p>
...
<ScenarioProvenance
  provenance={activeDefinition.provenance}
  runMode={activeRun?.mode}
/>
```

Legacy has `activeRun === null`, so it keeps the old synthetic heading.

- [ ] **Step 5: Update README from single-day V0.4 to V0.5 timeline semantics**

Add a leading `## V0.5 — Operational Timeline Foundation` section documenting:

```text
- targetDate / issuedAt / dataAsOf / mode
- 8 checked-in dates from 2026-08-27 through 2026-09-03
- SIMULATED vs FORECAST semantics
- immutable run artifacts + manifest
- same 8 vehicles / 60 delivery locations / road geometry across dates
- deterministic daily package/timing variation
- generation command
- no observed Córdoba operation claim
```

Update Architecture to include `OperationalRun Catalog -> FleetScenario -> existing simulation engine`. Keep the V0.4 calibration section as the explanation of the underlying model. Update roadmap so the next milestones are external context (weather/traffic/calendar demand), forecast vintages/observed adapters, incidents/replanning, then optimization/telemetry.

- [ ] **Step 6: Run product-copy/UI regressions**

```bash
npm test -- --run tests/dashboardComponents.test.tsx tests/appSmoke.test.tsx tests/operationalRunSwitching.test.tsx
```

Expected: PASS and no copy claiming Amazon/Rappi/PedidosYa/Mercado Libre operate the displayed Córdoba routes.

- [ ] **Step 7: Commit Task 9**

```bash
git add src/components/ScenarioProvenance.tsx src/components/ScenarioProvenance.css src/App.tsx tests/dashboardComponents.test.tsx tests/appSmoke.test.tsx README.md
git commit -m "docs: present FleetFlow V0.5 timeline provenance"
```

---

### Task 10: Full regression, production build, and PR readiness

**Files:**
- Modify only files required by failures discovered in this verification task; do not add scope.

**Interfaces:**
- Acceptance gate is the complete spec success criteria plus all V0.4 regressions.

- [ ] **Step 1: Run the entire test suite**

```bash
npm test
```

Expected: every existing V0.4 test plus all new V0.5 tests PASS.

- [ ] **Step 2: Run a production TypeScript/Vite build**

```bash
npm run build
```

Expected: PASS. The existing Vite large-chunk warning may remain non-failing; V0.5 must not add eager imports of the eight run JSON artifacts.

- [ ] **Step 3: Re-run critical deterministic/offline generation gates independently**

```bash
npm test -- --run \
  tests/calibratedScenario.test.ts \
  tests/provisionalGeneration.test.ts \
  tests/prepareRoutesWorkflow.test.ts \
  tests/operationalRunGenerator.test.ts \
  tests/operationalRunArtifacts.test.ts
```

Expected: PASS, proving V0.4 route preparation and V0.5 generation remain deterministic and offline.

- [ ] **Step 4: Re-run critical runtime/state gates independently**

```bash
npm test -- --run \
  tests/operationalRunValidation.test.ts \
  tests/operationalRunCatalog.test.ts \
  tests/operationalDateRail.test.tsx \
  tests/operationalRunSwitching.test.tsx \
  tests/scenarioSwitching.test.tsx
```

Expected: PASS, including fail-closed missing run and stale-state prevention.

- [ ] **Step 5: Inspect the final diff for scope and immutable assets**

Run:

```bash
git status --short
git diff main...HEAD --stat
git diff main...HEAD -- public/data/operational-runs/manifest.json package.json .github/workflows/prepare-routes.yml
```

Verify:

```text
- no backend/database/provider dependencies
- no raw Amazon data
- no dynamic OSRM runtime call
- exactly eight initial run artifacts
- no OBSERVED artifact
- operational run JSON remains under public/data rather than src imports
- prepare-routes workflow remains contents: read
```

- [ ] **Step 6: Commit any verification-only correction, then require a clean rerun**

If Step 1–5 exposed a defect, fix only that defect through a fresh failing test where practical, commit it, then repeat Steps 1–5. Do not declare completion based on a pre-fix run.

- [ ] **Step 7: Push the feature branch and open/update the PR**

Use branch:

```text
feat/v0.5-operational-timeline
```

PR title:

```text
feat: add FleetFlow V0.5 operational timeline
```

PR body must state:

```text
- immutable multi-day OperationalRun model
- manifest-backed lazy loading
- deterministic daily calibrated generation
- stable Córdoba geography
- SIMULATED/FORECAST evidence semantics
- Legacy V0 preserved
- npm test + npm run build evidence
```

- [ ] **Step 8: Verify PR CI on the exact head SHA before requesting merge**

Required checks:

```text
CI test/build: success
prepare-routes workflow/check: success when triggered
no unresolved review findings
```

Do not merge from an older green SHA after additional commits.

- [ ] **Step 9: After explicit merge approval, merge with expected head SHA and verify deployment**

After merge, verify on the merged SHA:

```text
main points to the merge SHA
main CI succeeds
route preparation checks succeed if triggered
GitHub Pages build succeeds
GitHub Pages deploy succeeds
```

Only then mark FleetFlow V0.5 complete.
