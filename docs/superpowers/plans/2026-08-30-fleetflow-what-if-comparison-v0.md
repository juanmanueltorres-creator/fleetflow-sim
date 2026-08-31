# FleetFlow Scenario / What-If Comparison V0 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish one reproducible FleetFlow V0 experiment that compares one immutable V0.6 Base operational run against exactly two deterministic WHAT_IF alternatives — Early Start and Balanced Load — and exposes their modelled trade-offs without polluting the operational timeline.

**Architecture:** Keep `OperationalRun`/`OperationalBundle` as the only run/bundle abstraction. Derive WHAT_IF runs offline, publish each with its own V2-bound route artifact, load alternatives through a separate comparison catalog, validate differential invariants atomically, derive outcomes/deltas at runtime, and render one selected bundle on the existing map/engine. PR2's `scheduleScenarioFromRoutes()` remains the sole V0.6 timing model for route-changing alternatives.

**Tech Stack:** Node.js 22 ESM generation scripts, TypeScript, React 19, Vitest 3, existing OperationalBundle loader/validators, existing Turf/MapLibre simulation stack, OSRM only during offline route preparation.

**Spec:** `docs/superpowers/specs/2026-08-30-fleetflow-what-if-comparison-v0-design.md`

## Global Constraints

- Exactly one published comparison experiment.
- Exactly one immutable V0.6 Base run selected deterministically from `manifest-v0-6.json`.
- Exactly two WHAT_IF alternatives: `SHIFT_DEPARTURE -60` and `REBALANCE_STOPS / BALANCE_PACKAGES`.
- WHAT_IF alternatives never appear in `manifest-v0-6.json` or historical `manifest.json`.
- Alternative loading metadata lives only in `public/data/operational-runs/what-if-comparisons.json`.
- `mode = WHAT_IF` for every derived run.
- `modelVersion` remains the Base run's `fleetflow-v0.6`.
- `dataAsOf` remains exactly equal to Base `dataAsOf`.
- Derived `issuedAt` for the first published experiment is `2026-08-30T21:05:00-03:00`.
- Derivation model ID is exactly `fleetflow-what-if-v0`.
- Derivation generator ID is exactly `what-if-derivation-v1`.
- Seed format is exactly `fleetflow:what-if:v0:base=<baseRunId>:action=<actionSetId>`.
- Base, Early, and Balanced preserve total packages, destination IDs, cargo per destination, depot, truck identities, capacities, fuel coefficients, and Base modelling assumptions.
- `SHIFT_DEPARTURE` changes schedule fields only and publishes a separate rebound route artifact without an OSRM request.
- `BALANCE_PACKAGES` reassigns complete stops only, respects parcel-volume capacity, orders stops by deterministic nearest neighbour, prepares new road geometry offline, then calls PR2 `scheduleScenarioFromRoutes()` exactly once.
- Balanced is required to reduce package-count spread for the one published fixture; distance/fuel/span are not required to improve.
- No global score, winner, recommendation, optimizer, OR-Tools, ML, Monte Carlo, live GPS, browser routing, live traffic/weather, backend, database, or Territorial Score integration.
- Derived entries omit `contextArtifact`; the comparison UI reuses the active Base bundle's context state.
- `src/simulation/engine.ts` and `src/simulation/clock.ts` remain unchanged.
- Because PR2 departures are normalized to offsets `0..18`, Early Start produces negative route minutes. Runtime simulation start is therefore `min(0, earliest departureMinute)` so the complete Early trajectory is visible from 05:00 without changing the engine or clock formatter.
- Historical V0.5 artifacts, V0.6 Base artifacts, and both operational manifests are immutable inputs and must not be rewritten.

---

## File Map

Create:

```text
src/scenario/whatIf/contracts.ts
src/scenario/whatIf/validation.ts
src/scenario/whatIf/types.ts
src/scenario/whatIf/catalog.ts
src/scenario/whatIf/invariants.ts
src/scenario/whatIf/loader.ts
src/scenario/whatIf/outcomes.ts
src/simulation/window.ts
scripts/lib/what-if-derivation.mjs
scripts/lib/what-if-generator.mjs
scripts/generate-what-if-comparison.mjs
src/components/ScenarioDecisionRail.tsx
src/components/ScenarioComparisonPanel.tsx
public/data/operational-runs/what-if-comparisons.json
generator-created Early Start run + route artifacts under public/data/operational-runs/generated/
generator-created Balanced Load run + route artifacts under public/data/operational-runs/generated/
tests/whatIfContracts.test.ts
tests/whatIfDerivation.test.ts
tests/whatIfGenerator.test.ts
tests/whatIfCli.test.ts
tests/whatIfComparisonCatalog.test.ts
tests/whatIfComparisonLoader.test.ts
tests/whatIfOutcomes.test.ts
tests/whatIfPublishedArtifacts.test.ts
tests/simulationWindow.test.ts
tests/whatIfUi.test.tsx
```

Task 3 defines the exact deterministic artifact IDs from the selected Base `run.id`; no manual filename/date input is allowed.

Modify:

```text
src/scenario/operationalRuns/types.ts
src/scenario/operationalRuns/validation.ts
src/scenario/scenarioRegistry.ts
src/App.tsx
src/index.css
package.json
README.md
DATA_LICENSES.md
```

Must remain byte-untouched:

```text
src/simulation/engine.ts
src/simulation/clock.ts
public/data/operational-runs/manifest.json
public/data/operational-runs/manifest-v0-6.json
public/data/operational-runs/generated/*-v2.json
public/data/operational-runs/generated/*-v3.json
public/data/operational-runs/generated/*-v3.routes.geojson
```

---

### Task 1: Add WHAT_IF action and provenance contracts

**Files:**
- Create: `src/scenario/whatIf/contracts.ts`
- Create: `src/scenario/whatIf/validation.ts`
- Modify: `src/scenario/operationalRuns/types.ts`
- Modify: `src/scenario/operationalRuns/validation.ts`
- Test: `tests/whatIfContracts.test.ts`

**Interfaces:**
- Produces: `WhatIfAction`, `WhatIfActionSet`, `WhatIfProvenance`
- Produces: `validateWhatIfProvenance(value: unknown): string[]`
- Extends: `OperationalRunProvenance.whatIf?: WhatIfProvenance`

- [ ] **Step 1: Write RED contract tests**

Create `tests/whatIfContracts.test.ts` from a valid checked-in V0.6 run fixture and assert:

```ts
const early = structuredClone(baseRun)
early.id = `${baseRun.id}-what-if-early-start-v1`
early.mode = 'WHAT_IF'
early.provenance.whatIf = {
  baseRunId: baseRun.id,
  actionSet: {
    schemaVersion: 1,
    id: `${baseRun.id}-early-start-v1`,
    label: 'Early start',
    baseRunId: baseRun.id,
    actions: [{ type: 'SHIFT_DEPARTURE', minutes: -60 }],
  },
  actionSetVersion: 1,
  derivationModel: 'fleetflow-what-if-v0',
}

expect(validateOperationalRun(early)).toEqual([])
```

Also assert rejection for:

```text
WHAT_IF without provenance.whatIf
unknown action type
actionSet schemaVersion != 1
actionSetVersion != actionSet.schemaVersion
whatIf.baseRunId != actionSet.baseRunId
blank action-set id/label/baseRunId
SHIFT_DEPARTURE with non-finite minutes
REBALANCE_STOPS with strategy != BALANCE_PACKAGES
non-WHAT_IF run carrying provenance.whatIf
```

Keep one assertion proving the untouched V0.6 Base fixture still validates.

- [ ] **Step 2: Run RED**

```bash
npm test -- tests/whatIfContracts.test.ts tests/operationalRunValidation.test.ts
```

Expected: the new WHAT_IF-specific rejection cases fail because no runtime WHAT_IF provenance validation exists yet.

- [ ] **Step 3: Define the pure contracts**

Create `src/scenario/whatIf/contracts.ts` exactly around these shapes:

```ts
export type WhatIfAction =
  | {
      type: 'SHIFT_DEPARTURE'
      minutes: number
    }
  | {
      type: 'REBALANCE_STOPS'
      strategy: 'BALANCE_PACKAGES'
    }

export interface WhatIfActionSet {
  schemaVersion: 1
  id: string
  label: string
  baseRunId: string
  actions: WhatIfAction[]
}

export interface WhatIfProvenance {
  baseRunId: string
  actionSet: WhatIfActionSet
  actionSetVersion: 1
  derivationModel: 'fleetflow-what-if-v0'
  inputFingerprint?: string
}
```

- [ ] **Step 4: Implement runtime WHAT_IF provenance validation**

Create `src/scenario/whatIf/validation.ts` with:

```ts
export function validateWhatIfProvenance(value: unknown): string[]
```

Validation rules are explicit:

```text
object required
baseRunId non-empty
actionSet object required
actionSet.schemaVersion === 1
actionSet.id / label / baseRunId non-empty
actionSet.actions is non-empty array
only SHIFT_DEPARTURE finite-number minutes
only REBALANCE_STOPS strategy BALANCE_PACKAGES
actionSetVersion === 1
actionSetVersion === actionSet.schemaVersion
whatIf.baseRunId === actionSet.baseRunId
derivationModel === fleetflow-what-if-v0
inputFingerprint absent or non-empty string
```

- [ ] **Step 5: Wire the provenance type into OperationalRun**

In `src/scenario/operationalRuns/types.ts` add a type-only import and field:

```ts
import type { WhatIfProvenance } from '../whatIf/contracts'

export interface OperationalRunProvenance {
  generator: string
  seed: string
  notes: string[]
  operationalProfile?: OperationalProfileProvenance
  spatialDemand?: OperationalSpatialDemandProvenance
  whatIf?: WhatIfProvenance
}
```

- [ ] **Step 6: Enforce mode/provenance coupling**

In `validateOperationalRun()` after the existing provenance blocks:

```ts
const whatIf = value.provenance.whatIf
if (value.mode === 'WHAT_IF') {
  if (whatIf === undefined) {
    errors.push('Operational run WHAT_IF provenance is required')
  } else {
    errors.push(...validateWhatIfProvenance(whatIf))
  }
} else if (whatIf !== undefined) {
  errors.push('Operational run WHAT_IF provenance is only allowed for WHAT_IF mode')
}
```

- [ ] **Step 7: Run GREEN**

```bash
npm test -- tests/whatIfContracts.test.ts tests/operationalRunValidation.test.ts tests/v06OperationalRunValidation.test.ts
npm run build
```

- [ ] **Step 8: Commit**

```bash
git add src/scenario/whatIf/contracts.ts src/scenario/whatIf/validation.ts src/scenario/operationalRuns/types.ts src/scenario/operationalRuns/validation.ts tests/whatIfContracts.test.ts
git commit -m "feat: add what-if run contracts"
```

---

### Task 2: Implement deterministic offline action derivation

**Files:**
- Create: `scripts/lib/what-if-derivation.mjs`
- Test: `tests/whatIfDerivation.test.ts`

**Interfaces:**
- Consumes: PR2 `scripts/lib/v0-6-route-timing.mjs#scheduleScenarioFromRoutes`
- Produces: `packageLoadSpread(scenario)`
- Produces: `previewBalancedAssignment(baseRun)`
- Produces: `deriveEarlyStart({ baseRun, baseRoutes, actionSet, issuedAt })`
- Produces: `deriveBalancedLoad({ baseRun, actionSet, issuedAt, profile, routePreparer })`
- Produces: `assertDerivedWhatIfArtifact({ baseRun, baseRoutes, derivedRun, derivedRoutes, actionSet })`

- [ ] **Step 1: Write RED Early Start tests**

Load `cordoba-2026-08-27-v3.json` and its route artifact as immutable fixtures. Build the Early action set with `minutes: -60`, then assert:

```text
derived.mode == WHAT_IF
derived.targetDate == Base.targetDate
derived.dataAsOf == Base.dataAsOf
derived.scenario stores/trucks/cargo/assignment/order unchanged
all departure/arrival/departure/return minutes == Base - 60
route feature ids/coordinates/waypointDistancesKm unchanged
route metadata.runId == derived.id
route metadata targetDate/modelVersion match derived run
total package count unchanged
provenance seed uses the exact approved format
```

Run twice and require deep semantic equality.

- [ ] **Step 2: Write RED Balanced tests with fake routing**

Use the same Base plus the checked-in calibration profile. Inject:

```js
async function fakeRoutePreparer({ scenario, metadata }) {
  return {
    type: 'FeatureCollection',
    metadata,
    features: scenario.routes.map((route) => ({
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
        coordinates: [scenario.depot.position, scenario.depot.position],
      },
    })),
  }
}
```

Assert:

```text
same destination set
same cargo-by-destination map
same total packages
same eight trucks/capacities/fuel coefficients
every destination assigned exactly once
no route volume exceeds truck parcel capacity
every truck has >= 1 stop
package-count spread is lower than Base for this fixture
assignment/order deterministic across two derivations
schedule is finalized through PR2 timing and returnMinute > final service
```

Do not assert distance/fuel/span improvement with fake routing.

- [ ] **Step 3: Write RED infeasible-capacity test**

Clone Base, set one complete stop's `volumeCm3` above every truck capacity, and assert:

```ts
expect(() => previewBalancedAssignment(infeasibleBase)).toThrow(
  /cannot fit delivery/i,
)
```

The stop must not be split or cargo-mutated.

- [ ] **Step 4: Run RED**

```bash
npm test -- tests/whatIfDerivation.test.ts
```

Expected: module-not-found failure for `scripts/lib/what-if-derivation.mjs`.

- [ ] **Step 5: Implement package spread and balance assignment**

In `scripts/lib/what-if-derivation.mjs`, `packageLoadSpread(scenario)` sums parcel package counts by route and returns `max - min`.

`previewBalancedAssignment(baseRun)` must:

```text
flatten complete Base stops with their Base Store
sort packageCount descending, storeId ascending
maintain each truck accumulated packageCount and volumeCm3
filter eligible trucks by volume capacity
choose lowest packageCount, then truckId ascending
assign the complete stop
fail if no eligible truck exists
```

The returned assignment record is:

```js
{
  truck,
  stops: Array<{ store, cargo }>,
  packageCount,
  volumeCm3,
}
```

- [ ] **Step 6: Implement deterministic nearest-neighbour ordering for Balanced**

Inside the same module use a local haversine helper independent of PR2 candidate zones. For each truck:

```text
start at depot
choose nearest remaining assigned store
tie-break by store.id ascending
repeat until empty
```

Do not import `assignDeliveriesToFleet()` because that function intentionally contains PR2 zone-weighting semantics that do not belong to `BALANCE_PACKAGES`.

- [ ] **Step 7: Implement Early derivation**

Use deterministic IDs:

```js
const derivedId = `${baseRun.id}-what-if-early-start-v1`
```

Clone the Base run, set:

```js
mode: 'WHAT_IF'
issuedAt
provenance.generator: 'what-if-derivation-v1'
provenance.seed: `fleetflow:what-if:v0:base=${baseRun.id}:action=${actionSet.id}`
provenance.whatIf: {
  baseRunId: baseRun.id,
  actionSet,
  actionSetVersion: 1,
  derivationModel: 'fleetflow-what-if-v0',
}
```

Preserve Base `operationalProfile` and `spatialDemand` blocks. Shift only schedule fields by `action.minutes`.

Clone the Base route collection feature-for-feature and replace only collection metadata with:

```js
{
  runId: derivedId,
  targetDate: baseRun.targetDate,
  modelVersion: baseRun.modelVersion,
}
```

No `routePreparer` call is allowed for Early.

- [ ] **Step 8: Implement Balanced derivation**

Use deterministic ID:

```js
const derivedId = `${baseRun.id}-what-if-balanced-load-v1`
```

Build a logical scenario that preserves Base scenario metadata/depot/trucks/stores but replaces routes using sorted truck IDs and geometry IDs:

```js
const geometryId = `route-${derivedId}-${String(index + 1).padStart(2, '0')}`
```

Schedule fields are `0` before routing. Then call exactly:

```js
const routeCollection = await routePreparer({
  scenario: logicalScenario,
  metadata: {
    runId: derivedId,
    targetDate: baseRun.targetDate,
    modelVersion: baseRun.modelVersion,
  },
})

const scenario = scheduleScenarioFromRoutes({
  scenario: logicalScenario,
  routeCollection,
  profile,
  targetDate: baseRun.targetDate,
  travelTimeMultiplier: baseRun.provenance.operationalProfile.travelTimeMultiplier,
})
```

Reject Base runs without a positive finite `operationalProfile.travelTimeMultiplier`.

- [ ] **Step 9: Implement offline derived-artifact assertions**

`assertDerivedWhatIfArtifact()` must fail before publication when:

```text
derived mode is not WHAT_IF
targetDate/dataAsOf/scenarioId/modelVersion differ from Base
whatIf lineage/action set differs from the supplied actionSet
run/route metadata binding differs
destination or cargo conservation fails
truck/depot/capacity/fuel signatures differ
operationalProfile or spatialDemand differs from Base
Early changes assignment/order/route feature geometry/properties or shifts any schedule field by the wrong amount
Balanced assigns a destination zero/multiple times, leaves a truck empty, exceeds volume capacity, or fails to reduce package spread
```

Task 4 adds the independent TypeScript runtime validation layer; this JS assertion protects the offline writer before bytes are published.

- [ ] **Step 10: Run GREEN**

```bash
npm test -- tests/whatIfDerivation.test.ts tests/v06RouteTiming.test.ts
npm run build
```

- [ ] **Step 11: Commit**

```bash
git add scripts/lib/what-if-derivation.mjs tests/whatIfDerivation.test.ts
git commit -m "feat: derive deterministic what-if scenarios"
```

---

### Task 3: Select the eligible Base and build the immutable publication generator

**Files:**
- Create: `scripts/lib/what-if-generator.mjs`
- Create: `scripts/generate-what-if-comparison.mjs`
- Modify: `package.json`
- Test: `tests/whatIfGenerator.test.ts`
- Test: `tests/whatIfCli.test.ts`

**Interfaces:**
- Consumes: Task 2 derivation/assertion functions
- Consumes: PR2 `prepareRouteCollection()` for Balanced only
- Produces: `selectEligibleBaseBundle(bundles)`
- Produces: `generateWhatIfComparison({ manifest, bundles, profile, issuedAt, routePreparer })`

The offline bundle input is:

```js
{
  entry,
  run,
  routeCollection,
}
```

- [ ] **Step 1: Write RED deterministic Base-selection tests**

Load all eight published V0.6 entries/runs/routes and assert:

```text
result is independent of input bundle order
eligible candidates are ordered targetDate ascending, then run.id ascending
selected run is the first candidate satisfying every approved eligibility rule
non-PARCELS run is rejected
8-truck requirement is enforced
empty Base route is rejected
zero package spread is rejected
invalid route metadata/topology is rejected
duplicate destinations/assignments are rejected
non-monotonic Base route schedule is rejected
capacity-infeasible balancing is rejected
Balanced preview with an empty truck is rejected
Balanced preview that does not lower spread is rejected
```

Do not hard-code a calendar date in the test; compute the result from the published inputs and then verify stability across reversed/shuffled input arrays.

- [ ] **Step 2: Write RED generated-catalog tests**

With fake routing call `generateWhatIfComparison()` and assert:

```text
one catalog definition
baseRunId == selected Base
exactly two alternatives
alternative A label Early start
alternative B label Balanced load
both entries mode WHAT_IF
both targetDate/dataAsOf/scenarioId/modelVersion match Base
no contextArtifact
artifact/routeArtifact paths are ./generated/<derived-id>...
Early and Balanced run ids are deterministic
Early action-set id == <base-id>-early-start-v1
Balanced action-set id == <base-id>-balanced-load-v1
comparison id == <base-id>-comparison-v1
```

The angle-bracket forms in these assertions are contract notation for values computed from `base.run.id`; tests construct the expected strings programmatically and do not substitute human-supplied values.

- [ ] **Step 3: Write RED CLI immutability tests**

In a temporary output directory, create `what-if-comparisons.json` before invoking the CLI and assert the process exits non-zero with `refusing to overwrite` before any routing request can occur.

Also assert `package.json` contains:

```json
"generate:what-if:v0": "node scripts/generate-what-if-comparison.mjs"
```

- [ ] **Step 4: Run RED**

```bash
npm test -- tests/whatIfGenerator.test.ts tests/whatIfCli.test.ts
```

- [ ] **Step 5: Implement Base eligibility**

`selectEligibleBaseBundle()` must check all of these before considering a candidate:

```text
entry/run are V0.6 and agree on id/date/model/mode
mode is SIMULATED or FORECAST
scenario destination IDs are unique
exactly 8 trucks and exactly one non-empty route per truck
all destinations are assigned exactly once
all route schedules are finite and monotonic
all truck capacities are PARCELS with positive finite capacityCm3
all route stops are PARCELS with positive finite packageCount/volumeCm3
all route parcel volumes fit Base truck capacity
route collection metadata binds runId/targetDate/modelVersion
route feature ids/truck ids/waypoint count match scenario
Base package spread > 0
previewBalancedAssignment succeeds
Balanced preview assigns every destination once
Balanced preview leaves every truck non-empty
Balanced preview respects volume capacity
Balanced preview package spread < Base spread
```

Sort eligible candidates by:

```js
left.run.targetDate.localeCompare(right.run.targetDate)
  || left.run.id.localeCompare(right.run.id)
```

- [ ] **Step 6: Implement exact action sets and generator output**

Build action sets:

```js
const earlyActionSet = {
  schemaVersion: 1,
  id: `${base.run.id}-early-start-v1`,
  label: 'Early start',
  baseRunId: base.run.id,
  actions: [{ type: 'SHIFT_DEPARTURE', minutes: -60 }],
}

const balancedActionSet = {
  schemaVersion: 1,
  id: `${base.run.id}-balanced-load-v1`,
  label: 'Balanced load',
  baseRunId: base.run.id,
  actions: [{ type: 'REBALANCE_STOPS', strategy: 'BALANCE_PACKAGES' }],
}
```

After deriving each alternative, call Task 2 `assertDerivedWhatIfArtifact()` before constructing its manifest entry.

Return:

```js
{
  catalog: {
    schemaVersion: 1,
    comparisons: [{
      id: `${base.run.id}-comparison-v1`,
      label: `Córdoba ${base.run.targetDate} · What-If V0`,
      baseRunId: base.run.id,
      alternatives: [
        { label: 'Early start', entry: earlyEntry },
        { label: 'Balanced load', entry: balancedEntry },
      ],
    }],
  },
  base,
  alternatives: [
    { label: 'Early start', run: early.run, routeCollection: early.routeCollection, entry: earlyEntry },
    { label: 'Balanced load', run: balanced.run, routeCollection: balanced.routeCollection, entry: balancedEntry },
  ],
}
```

- [ ] **Step 7: Implement the publication CLI**

Supported flags are exactly:

```text
--manifest
--profile
--issued-at
--output-dir
--catalog-name
```

The CLI:

```text
reads the V2 manifest
reads every referenced Base run/route artifact locally
selects the Base before any network routing
computes the two derived output filenames
refuses existing catalog/run/route outputs before OSRM work
calls generateWhatIfComparison with prepareRouteCollection as routePreparer
writes both run JSONs, both route GeoJSONs, then catalog using fs flag wx
```

Require safe catalog filename exactly `what-if-comparisons.json` for V0 publication.

- [ ] **Step 8: Add the package command**

Keep every existing command and add:

```json
"generate:what-if:v0": "node scripts/generate-what-if-comparison.mjs"
```

- [ ] **Step 9: Run GREEN**

```bash
npm test -- tests/whatIfGenerator.test.ts tests/whatIfCli.test.ts tests/whatIfDerivation.test.ts
npm run build
```

- [ ] **Step 10: Commit**

```bash
git add scripts/lib/what-if-generator.mjs scripts/generate-what-if-comparison.mjs tests/whatIfGenerator.test.ts tests/whatIfCli.test.ts package.json
git commit -m "feat: add what-if publication generator"
```

---

### Task 4: Add comparison catalog validation and atomic loading

**Files:**
- Create: `src/scenario/whatIf/types.ts`
- Create: `src/scenario/whatIf/catalog.ts`
- Create: `src/scenario/whatIf/invariants.ts`
- Create: `src/scenario/whatIf/loader.ts`
- Test: `tests/whatIfComparisonCatalog.test.ts`
- Test: `tests/whatIfComparisonLoader.test.ts`

**Interfaces:**
- Produces: `WhatIfComparisonCatalog`, `WhatIfComparisonDefinition`, `WhatIfAlternative`, `ScenarioComparisonSet`
- Produces: `validateWhatIfComparisonCatalog(value: unknown): string[]`
- Produces: `loadWhatIfComparisonCatalog(url, fetcher?)`
- Produces: `findWhatIfComparisonForBase(catalog, baseRunId)`
- Produces: `requireValidScenarioComparisonSet(...)`
- Produces: `loadScenarioComparison(...)`

- [ ] **Step 1: Define RED catalog tests**

Valid shape:

```ts
interface WhatIfComparisonCatalog {
  schemaVersion: 1
  comparisons: WhatIfComparisonDefinition[]
}

interface WhatIfComparisonDefinition {
  id: string
  label: string
  baseRunId: string
  alternatives: [WhatIfAlternative, WhatIfAlternative]
}

interface WhatIfAlternative {
  label: string
  entry: OperationalRunManifestEntryV2
}
```

Assert rejection of:

```text
schemaVersion != 1
blank comparison id/label/baseRunId
not exactly two alternatives
duplicate alternative run IDs
duplicate comparison baseRunId definitions
entry.mode != WHAT_IF
unsafe run artifact path
unsafe route artifact path
schema-V1-style entry without routeArtifact
```

Use the existing `validateOperationalRunManifest({ schemaVersion: 2, runs: [entry] })` to enforce the exact existing safe-path rules instead of duplicating path regexes.

- [ ] **Step 2: Run catalog RED**

```bash
npm test -- tests/whatIfComparisonCatalog.test.ts
```

Expected: module-not-found failure.

- [ ] **Step 3: Implement catalog loading/discovery**

`loadWhatIfComparisonCatalog(url, fetcher = fetch)` fetches JSON and calls a `requireValid...` wrapper.

`findWhatIfComparisonForBase()` returns the unique matching definition or `null`:

```ts
export function findWhatIfComparisonForBase(
  catalog: WhatIfComparisonCatalog,
  baseRunId: string,
): WhatIfComparisonDefinition | null {
  return catalog.comparisons.find((item) => item.baseRunId === baseRunId) ?? null
}
```

- [ ] **Step 4: Write RED atomic-loader tests**

Construct a valid Base `OperationalBundle` and fetch mocks for both alternatives. Assert:

```text
valid Base+A+B -> ScenarioComparisonSet
active Base is reused and never refetched
alternative run/route URLs resolve relative to what-if-comparisons.json
wrong lineage baseRunId -> reject
alternative mode != WHAT_IF -> reject
alternative targetDate != Base -> reject
alternative dataAsOf != Base -> reject
invalid route binding -> reject
one failed alternative -> whole comparison rejects
Base bundle object remains usable after rejection
```

Also require exactly one Early action and exactly one Balanced action in the loaded pair.

- [ ] **Step 5: Implement differential invariant helpers**

In `src/scenario/whatIf/invariants.ts` create plain-data helpers for:

```text
destination ID set
cargo-by-destination map
truck identity/capacity/fuel signature
depot signature
per-truck assignment/order
per-route package count/volume
package-load spread
operationalProfile + spatialDemand equality
```

`requireValidScenarioComparisonSet()` first enforces all shared invariants, then action-specific invariants.

For Early:

```text
exactly one SHIFT_DEPARTURE action
same assignment/order
same geometry feature ids/coordinates/waypointDistancesKm
for every schedule field: alternative == Base + action.minutes
```

Route collection metadata is intentionally different only by derived binding.

For Balanced:

```text
exactly one REBALANCE_STOPS/BALANCE_PACKAGES action
all destinations assigned once
all eight trucks non-empty
all route parcel volumes <= matching truck capacity
package-load spread < Base spread
```

Both require Base `operationalProfile` and `spatialDemand` blocks to deep-equal the derived run's copied blocks.

- [ ] **Step 6: Implement atomic loader**

`loadScenarioComparison()` signature:

```ts
export async function loadScenarioComparison(options: {
  definition: WhatIfComparisonDefinition
  base: OperationalBundle
  catalogUrl: string
  fetcher?: FetchLike
}): Promise<ScenarioComparisonSet>
```

Implementation loads both alternative entries with:

```ts
loadOperationalBundle({
  entry: alternative.entry,
  manifestUrl: options.catalogUrl,
  fetcher,
})
```

Use `Promise.all`; do not return a partial set. After both bundles load, call `requireValidScenarioComparisonSet()` and only then return.

- [ ] **Step 7: Run GREEN**

```bash
npm test -- tests/whatIfComparisonCatalog.test.ts tests/whatIfComparisonLoader.test.ts tests/operationalBundle.test.ts tests/operationalRunCatalogSecurity.test.ts
npm run build
```

- [ ] **Step 8: Commit**

```bash
git add src/scenario/whatIf/types.ts src/scenario/whatIf/catalog.ts src/scenario/whatIf/invariants.ts src/scenario/whatIf/loader.ts tests/whatIfComparisonCatalog.test.ts tests/whatIfComparisonLoader.test.ts
git commit -m "feat: load validated what-if comparisons"
```

---

### Task 5: Derive ScenarioOutcome and Base-relative deltas

**Files:**
- Create: `src/scenario/whatIf/outcomes.ts`
- Test: `tests/whatIfOutcomes.test.ts`

**Interfaces:**
- Consumes: validated `OperationalBundle`
- Produces: `ScenarioOutcome`, `ScenarioDelta`
- Produces: `deriveScenarioOutcome(bundle)`
- Produces: `deriveScenarioDelta(base, alternative)`

- [ ] **Step 1: Write RED outcome tests**

Required outcome fields:

```ts
interface ScenarioOutcome {
  runId: string
  mode: 'SIMULATED' | 'FORECAST' | 'WHAT_IF'
  operationStartMinute: number
  operationEndMinute: number
  operationSpanMinutes: number
  totalPackages: number | null
  totalDeliveries: number
  completedDeliveries: number
  plannedDistanceKm: number
  estimatedFuelUsedL: number | null
  meanVehicleUtilizationPct: number | null
  maxVehicleUtilizationPct: number | null
  packageLoadSpread: number | null
}
```

For the Base/Early fixture assert:

```text
Early operationStart == Base - 60
Early operationEnd == Base - 60
Early operationSpan == Base
Early plannedDistance == Base
Early estimatedFuel == Base
Early packageLoadSpread == Base
Early completedDeliveries == totalDeliveries
```

- [ ] **Step 2: Write RED delta tests**

```ts
interface ScenarioDelta {
  alternativeRunId: string
  baseRunId: string
  operationEndDeltaMinutes: number
  operationSpanDeltaMinutes: number
  distanceDeltaKm: number
  estimatedFuelDeltaL: number | null
  meanUtilizationDeltaPct: number | null
  maxUtilizationDeltaPct: number | null
  packageLoadSpreadDelta: number | null
}
```

Require `alternative - Base` exactly. Early `-60` must yield:

```text
operationEndDeltaMinutes = -60
operationSpanDeltaMinutes = 0
distanceDeltaKm = 0
estimatedFuelDeltaL = 0
packageLoadSpreadDelta = 0
```

Also test null propagation for optional metrics.

- [ ] **Step 3: Run RED**

```bash
npm test -- tests/whatIfOutcomes.test.ts
```

- [ ] **Step 4: Implement outcome derivation through the existing engine**

For each bundle:

```ts
const scenario = bundle.run.scenario
const routeIndex = routeCollectionToIndex(bundle.routes, scenario)
const operationStartMinute = Math.min(...scenario.routes.map((route) => route.departureMinute))
const operationEndMinute = Math.max(...scenario.routes.map((route) => route.returnMinute))
const snapshot = getFleetSnapshot(scenario, routeIndex, operationEndMinute)
const metrics = deriveFleetMetrics(scenario, snapshot, routeIndex)
```

Set `operationSpanMinutes = operationEndMinute - operationStartMinute`.

Initial vehicle utilization is derived directly from planned route parcel volume divided by matching truck `capacityCm3`. If any truck/cargo is not PARCELS, mean/max utilization and package spread are `null` rather than invented.

Use `metrics.estimatedFuelUsedL` as the current model estimate and expose it through the nullable contract.

- [ ] **Step 5: Implement delta null propagation**

Helper:

```ts
function optionalDelta(left: number | null, right: number | null): number | null {
  return left === null || right === null ? null : right - left
}
```

Call with `(baseMetric, alternativeMetric)` so every delta remains `alternative - Base`.

- [ ] **Step 6: Run GREEN**

```bash
npm test -- tests/whatIfOutcomes.test.ts tests/metrics.test.ts tests/simulationEngine.test.ts
npm run build
```

- [ ] **Step 7: Commit**

```bash
git add src/scenario/whatIf/outcomes.ts tests/whatIfOutcomes.test.ts
git commit -m "feat: derive what-if outcomes and deltas"
```

---

### Task 6: Publish one real immutable What-If experiment

**Files:**
- Create by generator: `public/data/operational-runs/what-if-comparisons.json`
- Create by generator: two WHAT_IF run JSON artifacts under `public/data/operational-runs/generated/`
- Create by generator: two matching `.routes.geojson` artifacts under `public/data/operational-runs/generated/`
- Create: `tests/whatIfPublishedArtifacts.test.ts`

**Interfaces:**
- Consumes: Tasks 1–5 contracts/generator/validators
- Produces: the one checked-in comparison fixture used by runtime/UI

- [ ] **Step 1: Write the published-artifact RED test before generation**

The test reads `what-if-comparisons.json`; before publication it fails because the catalog does not exist.

Once present, it must assert:

```text
catalog schemaVersion == 1
exactly one comparison
baseRunId exists in manifest-v0-6.json
baseRunId equals selectEligibleBaseBundle() result for the published eight V0.6 bundles
exactly two alternatives
no alternative run ID exists in manifest-v0-6.json
both alternative entries validate as complete V2 entries
both run artifacts pass validateOperationalRun
both route artifacts bind runId/targetDate/modelVersion and topology
requireValidScenarioComparisonSet accepts Base+A+B
Early route feature geometry/properties equal Base route feature geometry/properties
Early action.minutes == -60
Balanced action.strategy == BALANCE_PACKAGES
Balanced package spread < Base package spread
all Base/derived cargo-by-destination maps equal
```

- [ ] **Step 2: Run RED**

```bash
npm test -- tests/whatIfPublishedArtifacts.test.ts
```

Expected: missing `what-if-comparisons.json`.

- [ ] **Step 3: Run the exact immutable publication command with OSRM access**

```bash
npm run generate:what-if:v0 -- \
  --manifest public/data/operational-runs/manifest-v0-6.json \
  --profile src/scenario/calibration/amazon-last-mile-v1.json \
  --issued-at 2026-08-30T21:05:00-03:00 \
  --output-dir public/data/operational-runs \
  --catalog-name what-if-comparisons.json
```

The command must make OSRM requests only for Balanced. Early is copied/rebound from Base locally.

- [ ] **Step 4: Inspect the generator summary**

Require output to name:

```text
selected Base run id
Early derived run id
Balanced derived run id
comparison catalog path
```

The selected Base is whatever the deterministic eligibility algorithm returns; do not manually override it.

- [ ] **Step 5: Run GREEN against the real artifacts**

```bash
npm test -- tests/whatIfPublishedArtifacts.test.ts tests/whatIfComparisonLoader.test.ts tests/whatIfOutcomes.test.ts
npm run build
```

- [ ] **Step 6: Verify immutability fail-closed**

Run the same publication command a second time. Expected: non-zero exit with `refusing to overwrite` before any new route preparation.

- [ ] **Step 7: Commit published artifacts**

```bash
git add public/data/operational-runs/what-if-comparisons.json public/data/operational-runs/generated/*-what-if-early-start-v1.json public/data/operational-runs/generated/*-what-if-early-start-v1.routes.geojson public/data/operational-runs/generated/*-what-if-balanced-load-v1.json public/data/operational-runs/generated/*-what-if-balanced-load-v1.routes.geojson tests/whatIfPublishedArtifacts.test.ts
git commit -m "feat: publish first FleetFlow what-if experiment"
```

---

### Task 7: Integrate TIME → DECISION runtime UX with one selected map

**Files:**
- Create: `src/simulation/window.ts`
- Create: `src/components/ScenarioDecisionRail.tsx`
- Create: `src/components/ScenarioComparisonPanel.tsx`
- Modify: `src/scenario/scenarioRegistry.ts`
- Modify: `src/App.tsx`
- Modify: `src/index.css`
- Test: `tests/simulationWindow.test.ts`
- Test: `tests/whatIfUi.test.tsx`
- Modify tests if required: `tests/appSmoke.test.tsx`, `tests/operationalRunSwitching.test.tsx`, `tests/scenarioSwitching.test.tsx`

**Interfaces:**
- Consumes: Task 4 catalog/loader and Task 5 outcomes
- Produces: lazy Compare flow, Base/A/B decision selection, independent failure handling

- [ ] **Step 1: Write RED simulation-window tests for Early negative minutes**

Create:

```ts
export function getSimulationStartMinute(scenario: FleetScenario): number
```

Tests:

```ts
expect(getSimulationStartMinute(baseScenario)).toBe(0)
expect(getSimulationStartMinute(earlyScenario)).toBe(-60)
```

where Early has earliest `departureMinute = -60`.

- [ ] **Step 2: Implement simulation-window helper without touching clock/engine**

```ts
export function getSimulationStartMinute(scenario: FleetScenario): number {
  return Math.min(0, ...scenario.routes.map((route) => route.departureMinute))
}
```

Run:

```bash
npm test -- tests/simulationWindow.test.ts tests/clockAdvance.test.ts
```

- [ ] **Step 3: Extend the scenario registry with the comparison catalog URL**

Change the optional timeline contract to:

```ts
operationalRuns?: {
  manifestUrl: string
  comparisonCatalogUrl?: string
}
```

For Córdoba:

```ts
operationalRuns: {
  manifestUrl: './data/operational-runs/manifest-v0-6.json',
  comparisonCatalogUrl: './data/operational-runs/what-if-comparisons.json',
},
```

Legacy static scenario remains unchanged.

- [ ] **Step 4: Write RED end-to-end UI tests**

Mock the V0.6 manifest, Base bundle, comparison catalog, Early bundle, and Balanced bundle. Assert this exact flow:

```text
load comparison-enabled Base
Base map is visible
Compare scenarios control is visible
alternatives are not fetched before user opens Compare
click Compare scenarios
A+B are fetched and validated
BASE / EARLY START / BALANCED LOAD controls appear
select EARLY START
map receives Early scenario/routes
clock resets to 05:00
comparison table remains visible
copy says finalizes 60 min earlier, not 60 min faster
select BALANCED LOAD
map receives Balanced scenario/routes
comparison table remains Base/A/B
change operational date
selected alternative clears
comparison closes
new Base loads normally
```

Also assert:

```text
date without a comparison -> no Compare control
one broken alternative -> Scenario comparison unavailable, Base map still rendered
comparison catalog failure -> Base remains usable
optional metric null -> table renders —
WHAT_IF view does not render the old OperationalExplainer sentence claiming the map base does not change
```

- [ ] **Step 5: Create the decision rail**

`ScenarioDecisionRail` renders neutral buttons:

```text
BASE
EARLY START
BALANCED LOAD
```

Props:

```ts
interface ScenarioDecisionRailProps {
  alternatives: Array<{ runId: string; label: string }>
  selectedRunId: string | null
  onSelectBase: () => void
  onSelectAlternative: (runId: string) => void
}
```

`selectedRunId === null` means Base.

- [ ] **Step 6: Create the comparison panel**

`ScenarioComparisonPanel` receives the validated set, derived outcomes/deltas, selected alternative ID, and Base context state.

Render a compact table with rows exactly:

```text
Packages
Deliveries
Vehicles
Start
Finish
Operation span
Distance
Fuel est.
Mean utilization
Max utilization
Package spread
```

For the selected alternative render Base-relative deltas without winner colors/badges. Use `—` for null metrics.

Render a visible state label:

```text
WHAT_IF · MODEL OUTPUT
```

Render action copy from `provenance.whatIf.actionSet`:

```text
SHIFT_DEPARTURE -60 min
REBALANCE_STOPS · BALANCE_PACKAGES
```

Render provenance rows for:

```text
Base run ID
action-set ID
action-set version
derivation model
```

Render frozen-input summary and the disclosure:

```text
Deterministic model output under frozen Base assumptions. Not an observed operation or guaranteed prediction.
```

Base context status comes only from `comparisonSet.base.context`.

- [ ] **Step 7: Refactor App state so active Base and displayed bundle are distinct**

Keep existing `activeBundle` as the timeline-selected Base. Add:

```ts
const [comparisonCatalog, setComparisonCatalog] = useState<WhatIfComparisonCatalog | null>(null)
const [comparisonDefinition, setComparisonDefinition] = useState<WhatIfComparisonDefinition | null>(null)
const [comparisonSet, setComparisonSet] = useState<ScenarioComparisonSet | null>(null)
const [comparisonOpen, setComparisonOpen] = useState(false)
const [comparisonLoading, setComparisonLoading] = useState(false)
const [comparisonError, setComparisonError] = useState(false)
const [selectedAlternativeRunId, setSelectedAlternativeRunId] = useState<string | null>(null)
```

Derive:

```ts
const displayedBundle = selectedAlternativeRunId && comparisonSet
  ? comparisonSet.alternatives.find(({ bundle }) => bundle.run.id === selectedAlternativeRunId)?.bundle
    ?? activeBundle
  : activeBundle
```

Use `displayedBundle` for `activeRun`, `activeScenario`, routes, map, snapshot, current KPIs, FleetPanel, and ScenarioProvenance run mode. Keep `selectedRunId`/date rail tied to Base.

Render `OperationalExplainer` only for non-WHAT_IF runs; the comparison panel is the authoritative explanation for WHAT_IF alternatives.

- [ ] **Step 8: Add lazy catalog discovery and comparison loading**

After a Base bundle becomes active:

```text
fetch the small comparison catalog if comparisonCatalogUrl exists
find definition by activeBundle.run.id
store definition only
```

Do not fetch alternatives yet.

When user clicks `Compare scenarios`, call `loadScenarioComparison()` with the current Base. Use effect cancellation so changing date/scenario ignores stale A/B responses. Commit `comparisonSet` only after the complete loader resolves.

- [ ] **Step 9: Reset comparison state on TIME/scenario changes**

Before setting a new `pendingRunId` or `scenarioId` clear:

```text
selectedAlternativeRunId
comparisonSet
comparisonDefinition
comparisonOpen
comparisonLoading
comparisonError
```

The old Base remains rendered during the existing atomic pending-run load exactly as today.

- [ ] **Step 10: Start/reset each displayed scenario at its real simulation window**

Whenever a Base or alternative bundle becomes displayed:

```ts
setIsPlaying(false)
setSimulationMinute(getSimulationStartMinute(displayedBundle.run.scenario))
```

`resetSimulation()` uses the same helper. Base/Balanced remain at minute `0`; Early starts at `-60`, which the existing formatter displays as `05:00`.

Do not edit `src/simulation/clock.ts` or `src/simulation/engine.ts`.

- [ ] **Step 11: Keep comparison failure independent from Base failure**

Render:

```text
Scenario comparison unavailable
```

inside/near comparison controls for comparison failures. Do not set the existing `runError`; Base operation remains visible and usable.

- [ ] **Step 12: Add neutral CSS and update the shell version copy**

Add classes for the decision rail, comparison table, action/provenance disclosure, and loading/error states without green/red winner semantics.

Change the eyebrow from:

```text
Operational timeline simulation · V0.5
```

to:

```text
Operational timeline + decision simulation · V0.6
```

- [ ] **Step 13: Run GREEN**

```bash
npm test -- tests/whatIfUi.test.tsx tests/simulationWindow.test.ts tests/appSmoke.test.tsx tests/operationalRunSwitching.test.tsx tests/scenarioSwitching.test.tsx tests/dashboardComponents.test.tsx
npm run build
```

- [ ] **Step 14: Commit**

```bash
git add src/simulation/window.ts src/components/ScenarioDecisionRail.tsx src/components/ScenarioComparisonPanel.tsx src/scenario/scenarioRegistry.ts src/App.tsx src/index.css tests/simulationWindow.test.ts tests/whatIfUi.test.tsx tests/appSmoke.test.tsx tests/operationalRunSwitching.test.tsx tests/scenarioSwitching.test.tsx
git commit -m "feat: add FleetFlow what-if comparison UI"
```

---

### Task 8: Acceptance, docs, scope audit, and final verification

**Files:**
- Modify: `README.md`
- Modify: `DATA_LICENSES.md`
- Test: all What-If and existing suites

**Interfaces:**
- Produces: documented reproducibility/audit trail and merge-ready V0 slice

- [ ] **Step 1: Add README What-If V0 semantics**

Document:

```text
TIME selects one immutable Base operational run.
DECISION selects Base, Early Start, or Balanced Load for that Base.
WHAT_IF outputs are deterministic model outputs, not observed operations or guaranteed predictions.
Early Start shifts the schedule by -60 minutes while freezing geometry/demand/assignment/context assumptions.
Balanced Load reassigns complete stops by package-count balance subject to parcel-volume capacity, then re-routes offline.
No scenario score or automatic winner exists.
```

Document the exact generation command from Task 6 and state that reruns refuse to overwrite published artifacts.

- [ ] **Step 2: Document route/data licensing boundary**

In `DATA_LICENSES.md` state:

```text
Early Start route geometry is a rebound copy of its Base OSM-derived route artifact.
Balanced Load route geometry is newly prepared offline through OSRM over OSM-derived road data.
Both remain simulation artifacts, not observed vehicle tracks.
No new parcel-demand source is introduced by What-If V0.
```

- [ ] **Step 3: Run the complete verification from a clean dependency install**

```bash
npm install --no-audit --no-fund
npm test
npm run build
```

Expected: all test files pass and production build succeeds. The existing Vite chunk-size warning is non-blocking unless this change materially increases the production JS chunk beyond the pre-What-If baseline.

- [ ] **Step 4: Run the immutable-artifact acceptance subset again**

```bash
npm test -- \
  tests/whatIfPublishedArtifacts.test.ts \
  tests/whatIfComparisonLoader.test.ts \
  tests/whatIfOutcomes.test.ts \
  tests/whatIfUi.test.tsx \
  tests/operationalRunSwitching.test.tsx \
  tests/v06PublishedArtifacts.test.ts
```

- [ ] **Step 5: Scope audit against the implementation base**

Confirm the final diff contains no modifications to:

```text
src/simulation/engine.ts
src/simulation/clock.ts
public/data/operational-runs/manifest.json
public/data/operational-runs/manifest-v0-6.json
existing V0.5 generated artifacts
existing V0.6 *-v3.json Base artifacts
existing V0.6 *-v3.routes.geojson Base artifacts
```

Confirm there is no:

```text
runtime/browser routing
backend/database/job system
traffic/weather recomputation
optimizer/OR-Tools/ML
risk/scenario score
winner/recommendation
Territorial Score integration
user-authored scenario editor
```

- [ ] **Step 6: Verify artifact lineage manually from the checked-in catalog**

For both alternatives confirm:

```text
catalog baseRunId == run.provenance.whatIf.baseRunId
run.provenance.whatIf.baseRunId == actionSet.baseRunId
actionSetVersion == actionSet.schemaVersion == 1
route metadata.runId == derived run.id
targetDate/dataAsOf/modelVersion match Base
```

- [ ] **Step 7: Commit docs**

```bash
git add README.md DATA_LICENSES.md
git commit -m "docs: document FleetFlow what-if comparison v0"
```

---

## Acceptance Criteria

1. One deterministic V0.6 Base is selected by the approved eligibility rules without a hard-coded date override.
2. The published comparison catalog contains exactly one comparison and exactly two complete V2 alternative entries.
3. Neither WHAT_IF alternative appears in either operational timeline manifest.
4. Both derived runs have `mode: WHAT_IF`, valid machine-readable lineage, and `fleetflow-what-if-v0` derivation metadata.
5. Early Start shifts all schedule fields exactly `-60` minutes and changes no demand, assignment, order, route coordinates, route distances, fleet, or Base modelling assumptions.
6. Early publishes its own V2-bound route artifact without OSRM work.
7. Balanced reassigns complete stops deterministically by package count, respects parcel-volume capacity, leaves every truck non-empty, and reduces package-count spread for the published fixture.
8. Balanced new stop order is deterministic nearest neighbour with `storeId` tie-break.
9. Balanced road routing is prepared offline and final timing flows through PR2 `scheduleScenarioFromRoutes()` exactly once.
10. Base, Early, and Balanced preserve destination set, cargo-by-destination, total packages, depot, fleet identities, capacities, fuel coefficients, `operationalProfile`, and `spatialDemand` Base provenance.
11. Alternative bundles pass existing route topology/run binding validation.
12. Comparison catalog validation reuses existing V2 safe artifact-path validation.
13. Comparison loading is atomic: any invalid/missing alternative makes comparison unavailable while Base remains usable.
14. Runtime outcomes evaluate each scenario at its own `max(returnMinute)` and distinguish completion clock from operation span.
15. Early's required deltas are `-60` completion minutes, `0` span minutes, `0` distance, `0` fuel when derivable, and `0` package spread.
16. Deltas are always `alternative - Base`; null optional metrics remain unavailable.
17. UI exposes TIME and DECISION as separate dimensions and renders one selected map/bundle at a time.
18. Alternatives are lazy-loaded only after the user opens Compare.
19. Early simulation starts at minute `-60` / 05:00 so the complete shifted operation is visible; Base/Balanced continue to start at minute `0` / 06:00.
20. Changing date or scenario clears comparison/alternative selection before loading the next Base.
21. Dates without a comparison show normal FleetFlow behavior and no comparison controls.
22. WHAT_IF UI shows action details, Base run ID, action-set ID/version, derivation model, frozen inputs, Base context state, and explicit model-output disclosure.
23. No global score, winner, recommendation, optimizer, risk metric, or prediction claim is introduced.
24. Historical V0.5 and published V0.6 Base artifacts remain byte-untouched.
25. `src/simulation/engine.ts` and `src/simulation/clock.ts` remain untouched.
26. Full automated tests and production build pass.

## Execution Gate

Implementation must begin from current `main` after PR #11 merge commit `c267ec2eaeb21841a5568547043153d447278612` or a descendant that has not changed the contracts listed in this plan. At execution start, compare the current `main` SHA and re-read these exact interfaces before creating the feature branch:

```text
src/scenario/operationalRuns/types.ts
src/scenario/operationalRuns/bundle.ts
src/scenario/operationalRuns/catalog.ts
scripts/lib/route-preparation.mjs
scripts/lib/v0-6-route-timing.mjs
src/App.tsx
```

If any of those contracts changed after this plan commit, update the plan before implementation rather than coding against stale signatures.
