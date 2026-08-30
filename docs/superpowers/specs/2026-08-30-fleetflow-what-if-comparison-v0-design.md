# FleetFlow Scenario / What-If Comparison V0 — Design

## Status

Approved architecture after design review on 2026-08-30. This is the canonical design for FleetFlow Scenario / What-If Comparison V0. Final user approval of this file is required before implementation planning begins.

## Purpose

FleetFlow evolves toward an operational simulation engine that evaluates explicit decisions against a frozen baseline state without becoming a generic digital twin, prediction oracle, global risk-score engine, or autonomous optimizer.

The conceptual model is:

```text
S(t) + A(t) -> S'(t+1)
```

For FleetFlow:

- `S(t)` is a validated Base `OperationalBundle`,
- `A(t)` is a versioned `WhatIfActionSet`,
- `S'(t+1)` is an immutable derived `OperationalRun` with `mode: WHAT_IF` plus its bound route artifact,
- the existing simulation engine consumes the derived `FleetScenario`,
- a comparison layer derives explicit outcomes and Base-relative deltas.

`S'(t+1)` is an alternative operational trajectory under FleetFlow assumptions. It is not a guaranteed future state.

## Product boundary

FleetFlow answers:

> What happens under a different operational decision?

It does not attempt to represent every territorial fact.

The intended separation is:

```text
Territorial Score -> represents / explains S(t)
FleetFlow         -> applies A(t) to S(t) and simulates consequences
```

FleetFlow must not absorb Territorial Score. Future adapters may provide external context/state inputs while keeping both products independent.

## Epistemic contract

```text
simulation != operation
estimated traffic != live traffic
modelled weather != observed road condition
scenario outcome != guaranteed prediction
```

Rules:

1. A WHAT_IF result is model output, not observed operational evidence.
2. Missing data remains missing/unavailable; it is never silently replaced with zero.
3. No global risk score is introduced.
4. No universal scenario score, winner, or automatic recommendation is introduced.
5. Actions and outcomes remain separate: an action describes what changed; an outcome describes what the model produced.
6. Every WHAT_IF run retains machine-readable lineage to one immutable Base run and one explicit action set.
7. A derived run may change only fields permitted by its action set.

## Relationship to the existing architecture

Current runtime:

```text
OperationalRun catalog
        ↓
OperationalBundle
├── run
├── routes
└── context state
        ↓
FleetScenario + route geometry
        ↓
existing simulation engine
        ↓
FleetSnapshot + FleetMetrics
```

The simulation engine remains date-, provider-, provenance-, action-, and comparison-agnostic. It must not become a data-ingestion, scenario-generation, or routing component.

What-If V0 adds layers around it:

```text
Base OperationalBundle
        +
WhatIfActionSet
        ↓
offline deterministic derivation
        ↓
WHAT_IF OperationalRun + bound route artifact
        ↓
existing simulation engine
        ↓
ScenarioOutcome
        ↓
Base-relative ScenarioDelta
```

## Dependency on V0.6 Daily Spatial Demand

What-If V0 is implemented after PR2 Daily Spatial Demand produces V0.6 Base runs with:

- 45–65 active synthetic destinations,
- variable package demand,
- fixed eight-vehicle fleet,
- variable packages/stops per vehicle,
- per-run road-following route geometry,
- manifest V2,
- immutable `OperationalBundle` semantics.

Sequence:

```text
PR1  Operational Bundle Foundation               DONE
PR2  Daily Spatial Demand                        BASELINE DEPENDENCY
V0   Scenario / What-If Comparison               THIS DESIGN
PR3  Richer Córdoba Operational Context + UI     LATER
```

What-If V0 reuses the route/timing contract established by PR2. It does not create a second V0.6 timing model.

## Baseline eligibility and deterministic selection

The published V0 experiment uses exactly one Base run. Selection is deterministic.

A PR2 Base run is eligible only when all of the following are true:

```text
mode is SIMULATED or FORECAST
model version is the active V0.6 Daily Spatial Demand version
OperationalBundle is valid
exactly 8 trucks
all active delivery cargo used by this experiment is PARCELS
all parcel volumes are finite and non-negative
all truck parcel capacities are finite and positive
all trucks have at least one Base stop
Base package-count spread is greater than zero
BALANCE_PACKAGES derivation can assign every stop exactly once without exceeding parcel volume capacity
the derived Balanced fixture has at least one stop per truck
the derived Balanced fixture has lower package-count spread than Base
```

Among eligible runs, choose the smallest `targetDate`; break a same-date tie by `run.id` ascending. The selected Base ID is frozen in `what-if-comparisons.json`. Runtime and UI tests discover it from the catalog instead of hard-coding a date.

## Scope

### In scope

- one published comparison experiment,
- one immutable V0.6 Base run,
- exactly two immutable WHAT_IF alternatives,
- `SHIFT_DEPARTURE`,
- `REBALANCE_STOPS / BALANCE_PACKAGES`,
- Base -> Derived lineage,
- deterministic offline derivation,
- immutable bound route artifacts,
- comparison catalog separate from the timeline manifest,
- differential invariant validation,
- runtime outcomes and Base-relative deltas,
- one selected map/bundle at a time,
- compact Base/A/B UI,
- lazy comparison loading,
- independent comparison failure,
- TDD across contracts, generation, validation, outcomes, loading, and UI.

### Out of scope

- live GPS/IoT,
- live traffic/weather browser calls,
- user-authored actions,
- runtime scenario generation/routing,
- changing fleet size,
- vehicle availability modelling,
- agents/RL,
- Monte Carlo/uncertainty distributions,
- ML,
- opaque optimization,
- OR-Tools/full VRP,
- generic digital-twin abstractions,
- new backend/database/jobs,
- recommendation engine,
- global risk/scenario score,
- automatic “best scenario”,
- Territorial Score integration,
- driver identities/shifts,
- real SLA/late-delivery claims,
- observed-road-condition claims.

## `OperationalRun` remains the run abstraction

A What-If is not a parallel `ScenarioRun`. It remains an `OperationalRun` with:

```text
mode = WHAT_IF
```

This reuses existing run validation, bundle loading, route binding, simulation, and switching semantics.

`FleetScenario` remains the operational payload consumed by the engine. Experiment lineage belongs to `OperationalRun.provenance`.

## WhatIfActionSet

```ts
interface WhatIfActionSet {
  schemaVersion: 1
  id: string
  label: string
  baseRunId: string
  actions: WhatIfAction[]
}

type WhatIfAction =
  | {
      type: 'SHIFT_DEPARTURE'
      minutes: number
    }
  | {
      type: 'REBALANCE_STOPS'
      strategy: 'BALANCE_PACKAGES'
    }
```

Unknown action types fail validation. The first published experiment contains exactly:

```text
A: SHIFT_DEPARTURE -60 minutes
B: REBALANCE_STOPS / BALANCE_PACKAGES
```

## WHAT_IF lineage and provenance

`OperationalRun.provenance` gains a machine-readable `whatIf` block for WHAT_IF runs.

```ts
interface WhatIfProvenance {
  baseRunId: string
  actionSet: WhatIfActionSet
  actionSetVersion: 1
  derivationModel: 'fleetflow-what-if-v0'
  inputFingerprint?: string
}
```

The deterministic seed remains the existing top-level `OperationalRun.provenance.seed`.

Required equality:

```text
whatIf.actionSetVersion == whatIf.actionSet.schemaVersion == 1
whatIf.baseRunId == whatIf.actionSet.baseRunId
```

Example identifiers are descriptive only; the published IDs are generated from the selected Base and frozen in artifacts.

Required lineage fields:

- Base run ID,
- embedded action set,
- action-set version,
- derivation-model ID,
- top-level deterministic provenance seed.

`inputFingerprint` is optional in V0.

## Baseline/Derived invariants

All three scenarios represent alternatives for one operational date.

Invariant across Base, Early Start, and Balanced Load:

```text
targetDate
dataAsOf
base demand / total packages
destination ID set
cargo per destination
depot
fleet size = 8
truck identities
vehicle capacities
fuel coefficients
effective context assumptions/factors used to generate Base
```

`issuedAt` is not required to equal Base because the WHAT_IF artifact may be generated later. `dataAsOf` remains Base `dataAsOf` because no newer operational evidence enters the experiment.

## Action A — SHIFT_DEPARTURE

For `minutes = -60`, shift exactly:

- every route `departureMinute`,
- every `plannedArrivalMinute`,
- every `plannedDepartureMinute`,
- every route `returnMinute`.

Preserve:

- package/cargo manifest,
- destination set,
- truck assignment,
- stop order,
- fleet,
- route coordinates,
- waypoint distances,
- effective Base context assumptions.

V0 does not recompute traffic/weather because the departure clock changes.

Expected pure-shift deltas:

```text
completion clock delta     -60 min
operation span delta         0 min
planned distance delta       0 km
estimated fuel delta         0 L when derivable
package-load spread delta    0
```

The UI must not describe this as “60 minutes faster.”

## Action B — REBALANCE_STOPS / BALANCE_PACKAGES

The reassignment unit is the complete delivery stop. Cargo never moves between destination records.

### Capacity-aware deterministic assignment

1. Build stop records containing `storeId`, `packageCount`, and `volumeCm3`.
2. Sort stops by `packageCount` descending; tie-break by `storeId` ascending.
3. Maintain per-truck accumulated package count and parcel volume.
4. For the next stop, build the eligible truck set where assigning that stop keeps total volume `<= truck.capacity.capacityCm3`.
5. If the eligible set is empty, derivation fails closed; it does not overfill a vehicle or alter cargo.
6. From eligible trucks choose the one with the lowest accumulated package count; tie-break by `truckId` ascending.
7. Assign the complete stop and update accumulated package count and volume.

The optimization target is package-count balance, while volume capacity is a hard feasibility constraint.

### Deterministic stop order

After assignment:

1. Start from the depot.
2. Select the nearest unvisited assigned store.
3. Tie-break equal distance by `storeId` ascending.
4. Repeat until all assigned stores are ordered.

No 2-opt, OR-Tools, or opaque optimizer is introduced.

### Routing and timing

Route each ordered sequence offline. Final timings reuse the route/timing contract established by PR2 for V0.6 run generation. What-If V0 must not independently reinterpret traffic, weather, travel multipliers, or service timing.

Allowed claim:

> Deterministic package-balancing strategy subject to existing parcel-volume capacity.

Disallowed claim:

> Globally optimal route or assignment.

Conservation:

```text
sum(packages BASE) == sum(packages BALANCED)
Map<destinationId, cargo>(BASE) == Map<destinationId, cargo>(BALANCED)
Set<destinationId>(BASE) == Set<destinationId>(BALANCED)
Set<truckId>(BASE) == Set<truckId>(BALANCED)
```

Assignment, stop order, geometry, distance, and schedule may change.

For the one published fixture, Balanced must reduce package-count spread. It is not required to improve distance, fuel, or operation span.

## Offline derivation pipeline

The browser never applies actions or routes scenarios.

```text
Base OperationalRun
        +
WhatIfActionSet
        ↓
derive candidate assignment/schedule
        ↓
validate action-specific invariants
        ↓
copy or prepare bound route artifact
        ↓
for route-changing action: reuse PR2 route/timing derivation
        ↓
validate final FleetScenario
        ↓
validate final OperationalRun
        ↓
publish immutable WHAT_IF artifacts
```

### SHIFT_DEPARTURE route artifact

No external routing request is made. A separate route artifact is published to preserve V2 binding:

```text
route metadata.runId == derived run.id
```

Coordinates and waypoint distances equal Base; binding metadata is rebound to the derived run.

### BALANCE_PACKAGES route artifact

Assignment/order changes require a new road-following route artifact. Route/timing generation reuses PR2; the simulation engine remains unchanged.

## Determinism

```text
same Base
+ same ActionSet
+ same derivationModel
= same semantic derived result
```

Seed format:

```text
fleetflow:what-if:v0:base=<baseRunId>:action=<actionSetId>
```

Published route artifacts freeze external router output. Reproducing an already published experiment never requires a future live routing request.

Artifacts are append-only. Changed semantics create a new version instead of rewriting previous WHAT_IF artifacts.

## Validation layers

### 1. Run validity

Derived runs pass existing run/scenario validation plus WHAT_IF provenance validation.

### 2. Bundle validity

Run and route artifact pass existing OperationalBundle topology/binding checks.

### 3. Experiment validity

For `SHIFT_DEPARTURE` require:

```text
same package/cargo manifest
same destination set
same assignment
same stop order
same fleet
same effective Base assumptions
same route coordinates/distances
all schedule fields shifted exactly by action.minutes
```

For `BALANCE_PACKAGES` require:

```text
same package/cargo manifest
same destination set
same fleet
same effective Base assumptions
all parcel volume capacities respected
assignment may change
stop order may change
geometry may change
schedule may change
```

Every destination is assigned exactly once. The published Balanced fixture has at least one stop per truck.

## TIME and DECISION are separate dimensions

WHAT_IF alternatives do not become peer entries in the primary timeline.

```text
Operational manifest -> TIME
Comparison catalog   -> DECISION
```

This protects default date selection and `OperationalDateRail` semantics.

## What-If comparison catalog

Publish:

```text
public/data/operational-runs/what-if-comparisons.json
```

Alternatives are not in `manifest.json`, so the comparison catalog contains complete V2 loading entries.

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

Each alternative entry must satisfy:

```text
entry.mode == WHAT_IF
entry.scenarioId == Base.scenarioId
entry.targetDate == Base.targetDate
entry.dataAsOf == Base.dataAsOf
```

`artifact`, `routeArtifact`, and optional `contextArtifact` use the same safe relative path rules as operational manifest V2.

The catalog stores loading metadata only; it never stores outcome metrics/deltas.

## Loading alternatives without timeline pollution

`loadOperationalBundle()` accepts an entry plus a URL used as the artifact-relative base. The comparison loader therefore uses `what-if-comparisons.json` as the relative base URL for alternative entries.

```text
active validated Base bundle
        +
comparison definition whose baseRunId == Base.run.id
        ↓
load A entry relative to comparisonCatalogUrl
load B entry relative to comparisonCatalogUrl
        ↓
existing OperationalBundle validation
```

The active Base is not duplicated or refetched merely to open Compare.

## Artifact layout

```text
public/data/operational-runs/
├── manifest.json
├── what-if-comparisons.json
└── generated/
    ├── <BASE>.json
    ├── <BASE>.routes.geojson
    ├── <EARLY>.json
    ├── <EARLY>.routes.geojson
    ├── <BALANCED>.json
    └── <BALANCED>.routes.geojson
```

PR2 supplies Base artifacts. What-If V0 adds two runs, two route artifacts, and one comparison definition.

## Atomic comparison loading

```text
active Base bundle
        ↓
find comparison by baseRunId
        ↓
load A bundle
        ↓
load B bundle
        ↓
validate lineage + differential invariants
        ↓
commit ScenarioComparisonSet
```

```ts
interface ScenarioComparisonSet {
  definition: WhatIfComparisonDefinition
  base: OperationalBundle
  alternatives: Array<{
    label: string
    bundle: OperationalBundle
  }>
}
```

If either required alternative fails, the comparison is unavailable. Base remains usable. Partial comparisons are not shown.

## Context semantics

PR1 context artifacts are bound to `runId`, so V0 does not share one Base `contextArtifact` across derived entries.

Instead:

1. Effective context/timing factors used to generate Base are frozen in V0.6 run provenance/model inputs.
2. WHAT_IF derivation uses the same effective assumptions and does not recompute them.
3. The comparison UI treats the active Base bundle’s `context` state as the experiment context for Base/A/B.
4. Derived V0 entries may omit `contextArtifact`; this does not change the effective frozen modelling assumptions.
5. If Base context is omitted/unavailable, that exact state is displayed and no replacement context is invented.

## ScenarioOutcome

Runtime-derived, never stored in the comparison catalog:

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

Values that cannot be derived remain `null`/unavailable.

## Evaluation point

Each scenario is evaluated at its own complete-operation point:

```text
max(route.returnMinute)
```

Completion clock and operation span are distinct.

```text
BASE   07:00 -> 15:00   span 8h
EARLY  06:00 -> 14:00   span 8h
```

Early finishes one hour earlier but is not one hour faster.

## V0 comparison metrics

Required:

- operation start,
- operation completion,
- operation span,
- planned distance,
- estimated fuel when derivable,
- total packages,
- total deliveries,
- completed deliveries,
- mean initial vehicle utilization when derivable,
- maximum initial vehicle utilization when derivable,
- package-count spread across vehicles.

No real-delay, SLA, risk, probability, or observed-road-condition metrics are added.

## ScenarioDelta

Always:

```text
delta = alternative - Base
```

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

Missing optional metrics propagate to unavailable deltas.

## No score and no winner

No scenario score, risk score, winner, “best scenario,” or recommendation. The UI exposes trade-offs and explicit deltas only.

## Runtime UX

### Level 1 — TIME

`OperationalDateRail` selects the Base operational date/run.

### Level 2 — DECISION

When the active Base has a published comparison:

```text
[ BASE ] [ EARLY START ] [ BALANCED LOAD ]
```

TIME and DECISION remain distinct.

## Map/runtime behavior

Only one validated bundle is rendered/simulated at a time. Selecting Base/A/B atomically changes the selected bundle and reuses existing:

- `FleetMap`,
- simulation clock,
- `FleetPanel`,
- current-scenario KPIs.

No three-map or three-engine UI is introduced.

## Comparison panel

Existing KPIs answer:

> What is true in the selected simulated plan?

Comparison UI answers:

> How does this plan differ from Base?

It contains:

- compact Base/A/B metrics,
- selected alternative vs Base deltas,
- explicit action description,
- frozen-input summary,
- compact provenance disclosure.

No winner badge is shown.

## Visible epistemic/provenance information

For WHAT_IF alternatives show:

- `WHAT_IF`,
- simulated/model-output status,
- action type/parameters,
- Base run ID,
- action-set ID/version,
- derivation model,
- frozen package/destination/fleet inputs,
- Base context state.

Copy must state that results are deterministic model outputs under frozen assumptions, not observed operations or guaranteed predictions.

## Date changes

```text
change date
→ clear selected alternative/comparison state
→ load new Base bundle
→ discover comparison availability for new Base
```

An alternative can never remain selected against a different Base.

## Lazy loading

```text
load FleetFlow normally
→ select/load Base normally
→ discover comparison by baseRunId
→ user opens Compare
→ load A + B
→ validate complete set
→ show comparison
```

Dates without comparisons remain normal FleetFlow dates and show no comparison controls.

## Failure semantics

### Base failure

Existing operational failure behavior applies; comparison cannot open.

### Comparison failure

Invalid/missing alternative run, route binding, lineage, capacity, or experiment invariants produce:

```text
Scenario comparison unavailable
```

Base remains usable.

### Optional metric failure

Missing optional metrics render `—` but do not invalidate a valid experiment.

```text
invalid experiment != unavailable optional metric
```

## TDD requirements

Implementation is test-first.

### Baseline selection tests

Prove deterministic earliest-date/run-ID selection and rejection of ineligible Base runs, including non-PARCELS cargo and capacity-infeasible balancing.

### SHIFT_DEPARTURE tests

Prove:

- exact requested shift,
- identical destinations/cargo,
- identical assignment/order,
- identical route coordinates/distances,
- identical total packages,
- identical fleet/effective Base assumptions.

### BALANCE_PACKAGES tests

Prove:

- identical destination/cargo manifest,
- identical total packages,
- identical fleet/effective Base assumptions,
- every destination exactly once,
- no parcel volume capacity exceeded,
- derivation fails when no eligible truck can fit a stop,
- at least one stop per truck for the published fixture,
- deterministic assignment/order,
- lower package-count spread than Base fixture.

Do not require universally improved distance/fuel/span.

### Determinism tests

```text
derive(base, action) == derive(base, action)
```

IDs, assignment, ordering, schedule, and semantic output are stable.

### Lineage tests

Reject:

- wrong Base,
- non-WHAT_IF alternative,
- different `targetDate`,
- different `dataAsOf`,
- action-set/Base mismatch,
- invalid derivation metadata,
- actionSetVersion/schemaVersion mismatch.

### Conservation tests

Require equality across Base/A/B for:

```text
sum packages
cargo-by-destination map
destination set
truck identity set
```

### Route tests

Require existing run/date/model binding and topology checks.

Early coordinates/distances equal Base; Balanced geometry may differ.

### Outcome tests

For Early -60:

```text
operationEndDeltaMinutes    = -60
operationSpanDeltaMinutes   = 0
distanceDeltaKm             = 0
estimatedFuelDeltaL         = 0 when derivable
packageLoadSpreadDelta      = 0
```

Balanced requires lower package-count spread only.

### Catalog/loading tests

Require:

- valid complete V2 alternative entry,
- unsafe artifact/route path rejection,
- valid Base+A+B -> comparison available,
- wrong Base -> reject,
- invalid route binding -> comparison unavailable while Base stays usable,
- invalid lineage -> comparison unavailable while Base stays usable,
- optional metric unavailable -> comparison remains available.

### UI tests

```text
select comparison-enabled Base
→ Base map visible
→ open Compare
→ Base / Early / Balanced visible
→ select Early
→ Early bundle displayed
→ select Balanced
→ Balanced bundle displayed
→ comparison table remains Base/A/B
→ change date
→ comparison resets
→ new Base loads
```

Also:

```text
date without comparison
→ no comparison controls
```

## Compatibility

Must preserve:

- V0.5 artifacts/manifest V1,
- V0.6 timeline behavior,
- static scenarios,
- simulation-engine contracts,
- OperationalBundle fail-closed validation,
- normal date switching outside comparison mode.

No historical artifact is rewritten to support What-If V0.

## Definition of Done

```text
✓ one deterministically selected eligible V0.6 Base has a published comparison
✓ exactly two immutable WHAT_IF runs derive from Base
✓ action sets are machine-readable/versioned
✓ Base -> Derived lineage validates
✓ package/destination/cargo/fleet conservation validates
✓ parcel-volume capacity is never exceeded
✓ SHIFT_DEPARTURE is deterministic and schedule-only
✓ BALANCE_PACKAGES is deterministic and capacity-aware
✓ Balanced timing reuses PR2 timing semantics
✓ alternative V2 entries live in comparison catalog, not timeline manifest
✓ derived route artifacts bind to their runs
✓ comparison loading is atomic
✓ Base remains usable when comparison fails
✓ ScenarioOutcome derives from validated bundles
✓ deltas use alternative - Base
✓ missing optional metrics remain unavailable
✓ no global score/winner/recommendation exists
✓ one selected map/bundle at a time
✓ changing date exits experiment
✓ dates without comparison remain normal FleetFlow dates
✓ V0.5/V0.6 historical behavior remains compatible
✓ full automated tests pass
✓ production build passes
```

## Architectural result

```text
Operational State S(t)
        ↓
Explicit Action A(t)
        ↓
Deterministic Derivation
        ↓
Operational Simulation
        ↓
Scenario Outcome
        ↓
Explicit Comparison
```

This is the intended FleetFlow direction: a reproducible operational decision simulator, not a generic digital twin and not an automated decision authority.
