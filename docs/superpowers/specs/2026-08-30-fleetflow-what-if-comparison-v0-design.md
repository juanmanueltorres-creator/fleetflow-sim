# FleetFlow Scenario / What-If Comparison V0 — Design

## Status

Approved architecture after design review on 2026-08-30. This document is the canonical design for the first FleetFlow what-if comparison slice. It must receive final user approval before implementation planning begins.

## Purpose

FleetFlow evolves toward an operational simulation engine that evaluates explicit operational decisions against a frozen baseline state without becoming a generic digital twin, prediction oracle, risk-score engine, or autonomous optimizer.

The conceptual model is:

```text
S(t) + A(t) -> S'(t+1)
```

For FleetFlow:

- `S(t)` is the validated baseline `OperationalBundle`,
- `A(t)` is a versioned, explicit `WhatIfActionSet`,
- `S'(t+1)` is an immutable derived `OperationalRun` with `mode: WHAT_IF` plus its bound route artifact,
- the existing simulation engine consumes the resulting `FleetScenario`,
- a separate comparison layer derives outcomes and Base-relative deltas.

`S'(t+1)` means an alternative operational trajectory under FleetFlow assumptions. It is not a guaranteed future state.

## Product boundary

FleetFlow answers:

> What happens under a different operational decision?

It does not attempt to represent every territorial fact or become a generic state model.

The intended separation is:

```text
Territorial Score -> represents / explains S(t)
FleetFlow         -> applies A(t) to S(t) and simulates consequences
```

FleetFlow must not absorb Territorial Score. A future adapter may provide external context/state inputs, but the products remain independent.

## Epistemic contract

The feature preserves these distinctions:

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

Current FleetFlow runtime:

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

The simulation engine remains date-, provider-, provenance-, and action-agnostic. It must not become a data-ingestion, scenario-generation, routing, or comparison component.

What-If V0 adds layers around the engine:

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

## Dependency on FleetFlow V0.6 Daily Spatial Demand

What-If V0 is implemented after Daily Spatial Demand produces the first suitable V0.6 baseline with:

- 45–65 active synthetic destinations,
- variable package demand,
- fixed eight-vehicle fleet,
- variable packages/stops per vehicle,
- per-run road-following route geometry,
- manifest V2,
- immutable `OperationalBundle` semantics.

Implementation sequence:

```text
PR1  Operational Bundle Foundation               DONE
PR2  Daily Spatial Demand                        BASELINE DEPENDENCY
V0   Scenario / What-If Comparison               THIS DESIGN
PR3  Richer Córdoba Operational Context + UI     LATER
```

The comparison target is the earliest published PR2 V0.6 Base run that satisfies the V0 eligibility checks in this spec. Its concrete date/run ID is frozen in `what-if-comparisons.json` when the experiment artifacts are generated. Tests read the published catalog rather than assuming a hard-coded date.

Rich context is not required. When Base context exists, comparison semantics inherit it; when it is omitted or unavailable, that state remains explicit.

## Scope

### In scope

- exactly one published V0 comparison experiment,
- one immutable V0.6 Base `OperationalRun`,
- exactly two immutable WHAT_IF alternatives,
- `SHIFT_DEPARTURE`,
- `REBALANCE_STOPS` with `BALANCE_PACKAGES`,
- explicit Base -> Derived lineage,
- deterministic offline derivation,
- immutable per-run route artifacts,
- a separate comparison catalog outside the timeline manifest,
- differential Base/Derived invariant validation,
- runtime `ScenarioOutcome` derivation,
- Base-relative deltas,
- one selected map/bundle at a time,
- compact Base/A/B comparison UI,
- lazy comparison loading,
- comparison failure isolated from the Base operation,
- TDD for contracts, determinism, conservation, lineage, routes, outcomes, loading, and UI.

### Out of scope

- live GPS/IoT,
- live traffic/weather browser calls,
- user-authored actions,
- runtime scenario generation/routing,
- changing fleet size,
- vehicle availability modelling,
- autonomous agents,
- reinforcement learning,
- Monte Carlo/uncertainty distributions,
- machine learning,
- opaque optimization,
- OR-Tools/full VRP,
- generic digital-twin abstractions,
- new backend/database/jobs,
- recommendation engine,
- global risk/scenario score,
- automatic “best scenario”,
- Territorial Score integration,
- driver shifts/identities,
- real SLA/late-delivery claims,
- observed-road-condition claims.

## `OperationalRun` remains the run abstraction

A What-If is not a parallel `ScenarioRun` type. It remains an `OperationalRun` with:

```text
mode = WHAT_IF
```

This reuses existing run validation, bundle loading, route binding, simulation, and switching semantics.

`FleetScenario` stays the operational payload consumed by the engine. Experiment lineage belongs to `OperationalRun.provenance`, not to `FleetScenario`.

## WhatIfActionSet

V0 introduces a small closed decision contract:

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

Unknown action types fail validation. V0 does not use an open-ended params object.

The published experiment contains exactly:

```text
A: SHIFT_DEPARTURE -60 minutes
B: REBALANCE_STOPS / BALANCE_PACKAGES
```

## Lineage and provenance

`OperationalRun.provenance` is extended for WHAT_IF runs with a machine-readable `whatIf` block.

Conceptual contract:

```ts
interface WhatIfProvenance {
  baseRunId: string
  actionSet: WhatIfActionSet
  actionSetVersion: 1
  derivationModel: 'fleetflow-what-if-v0'
  inputFingerprint?: string
}
```

The deterministic seed remains the existing top-level `OperationalRun.provenance.seed`; it is not duplicated inside `whatIf`.

For V0:

```text
whatIf.actionSetVersion == whatIf.actionSet.schemaVersion == 1
```

Required lineage fields:

- Base run ID,
- embedded action set,
- action-set version,
- derivation-model identifier,
- top-level deterministic provenance seed.

`inputFingerprint` is optional in V0.

Example:

```json
{
  "generator": "what-if-derivation-v1",
  "seed": "fleetflow:what-if:v0:base=cordoba-...:action=balanced-load-v1",
  "notes": [
    "Deterministic WHAT_IF simulation derived from an immutable baseline; not observed operation."
  ],
  "whatIf": {
    "baseRunId": "cordoba-...-v0-6",
    "actionSet": {
      "schemaVersion": 1,
      "id": "balanced-load-v1",
      "label": "Balanced load",
      "baseRunId": "cordoba-...-v0-6",
      "actions": [
        {
          "type": "REBALANCE_STOPS",
          "strategy": "BALANCE_PACKAGES"
        }
      ]
    },
    "actionSetVersion": 1,
    "derivationModel": "fleetflow-what-if-v0"
  }
}
```

The ellipses above are illustrative identifier abbreviations only; published artifacts contain complete IDs.

## Baseline/Derived invariants

The three scenarios represent alternatives for one operational date.

Invariant across Base, Early Start, and Balanced Load:

```text
targetDate
dataAsOf
base demand / total package count
destination ID set
cargo per destination
depot
fleet size = 8
truck identities
vehicle capacities
fuel coefficients
effective context assumptions/factors used to generate the Base
```

A derived run keeps Base `targetDate` and `dataAsOf`. It is an alternative for the same day, not another timeline day.

## Action A — SHIFT_DEPARTURE

For `minutes = -60`, shift exactly:

- `departureMinute`,
- every `plannedArrivalMinute`,
- every `plannedDepartureMinute`,
- `returnMinute`.

Preserve:

- packages,
- destinations,
- cargo by destination,
- truck assignment,
- stop order,
- fleet,
- route coordinates,
- waypoint distances,
- effective Base context assumptions.

V0 does not recompute traffic/weather when the clock changes.

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

Deterministic algorithm:

1. Build `(destination, packageLoad)` records from Base stops.
2. Sort by package load descending.
3. Tie-break equal load by `storeId` ascending.
4. Assign the next stop to the truck with the lowest accumulated package count.
5. Tie-break equal truck load by `truckId` ascending.
6. Order each truck’s assigned stops with deterministic nearest-neighbour ordering from the depot.
7. Tie-break equal nearest-neighbour distance by `storeId` ascending.
8. Route the resulting waypoint sequence offline.
9. Derive final timings using the same route/timing contract established by PR2 for V0.6 per-run scenario generation.

What-If V0 must not introduce a second timing model. If PR2 changes the internal route/timing mechanism while preserving its public contracts, What-If reuses that mechanism.

V0 does not add 2-opt, OR-Tools, or an opaque optimizer.

Allowed claim:

> Deterministic package-balancing strategy.

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

For the one published V0 fixture, `BALANCE_PACKAGES` must reduce package-count spread across trucks. It is not required to improve distance, fuel, or operation span.

## Offline derivation pipeline

The browser does not apply actions or route scenarios.

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

Action derivation and routing remain separate responsibilities.

### SHIFT_DEPARTURE route artifact

No external routing request is made. A separate route artifact is still published so V2 binding remains strong:

```text
route metadata.runId == derived run.id
```

Coordinates and waypoint distances are equal to Base; binding metadata is rebound to the derived run.

### BALANCE_PACKAGES route artifact

Assignment/order changes require a new road-following route artifact. Route/timing generation reuses the PR2 V0.6 generator contract; the simulation engine is not modified to do this work.

## Determinism

Required contract:

```text
same Base
+ same ActionSet
+ same derivationModel
= same semantic derived result
```

Seed:

```text
fleetflow:what-if:v0:base=<baseRunId>:action=<actionSetId>
```

Published route artifacts freeze external router output. Reproducing an already published experiment never requires a future live routing request.

Artifacts are append-only. Changed semantics create a new version rather than rewriting prior WHAT_IF artifacts.

## Validation layers

### 1. Run validity

Derived runs pass existing run/scenario validation plus WHAT_IF provenance validation.

### 2. Bundle validity

Run and route artifact pass existing OperationalBundle topology/binding checks.

### 3. Experiment validity

Base/Derived comparison validates permitted differences.

For `SHIFT_DEPARTURE`:

```text
same package/cargo manifest
same destination set
same assignment
same stop order
same fleet
same effective Base assumptions
same route coordinates/distances
schedule fields shift by exactly the requested minutes
```

For `BALANCE_PACKAGES`:

```text
same package/cargo manifest
same destination set
same fleet
same effective Base assumptions
assignment may change
stop order may change
geometry may change
schedule may change
```

Every destination is assigned exactly once. The V0 fixture keeps at least one stop per truck and must remain within existing capacity validation.

## TIME and DECISION are separate dimensions

WHAT_IF alternatives do not become peer entries in the primary operational timeline.

```text
Operational manifest -> TIME
Comparison catalog   -> DECISION
```

This prevents same-date alternatives from contaminating default date selection or `OperationalDateRail` semantics.

## What-If comparison catalog

V0 publishes:

```text
public/data/operational-runs/what-if-comparisons.json
```

Because alternatives do not live in `manifest.json`, the comparison catalog must contain enough V2 metadata to load them directly.

Conceptual contract:

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

For every alternative entry:

```text
entry.mode == WHAT_IF
entry.scenarioId == Base.scenarioId
entry.targetDate == Base.targetDate
entry.dataAsOf == Base.dataAsOf
```

`artifact`, `routeArtifact`, and optional `contextArtifact` use the same safe relative path rules as operational manifest V2 entries.

The catalog stores identity/loading metadata only. It never stores outcome metrics or deltas.

## Loading alternatives without polluting the timeline manifest

`loadOperationalBundle()` already accepts a manifest-relative URL plus an entry. The comparison loader therefore treats the comparison catalog URL as the relative artifact base for WHAT_IF entries.

Conceptually:

```text
active Base OperationalBundle
        +
comparison definition whose baseRunId matches Base.run.id
        ↓
load alternative.entry using comparisonCatalogUrl
        ↓
existing OperationalBundle validation
```

The Base is not duplicated or refetched merely to open Compare; the already validated active Base bundle is the authority for the experiment.

This closes the loading boundary without adding WHAT_IF entries to `manifest.json`.

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

Base artifacts come from PR2. What-If V0 adds two run artifacts, two route artifacts, and one comparison catalog definition.

## Comparison loading is atomic

Conceptual flow:

```text
active validated Base bundle
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

If either required alternative fails, the comparison set is unavailable. The Base operation remains usable.

## Context semantics

The optional PR1 context artifact is run-bound by `runId`, so V0 does not attempt to share one Base `contextArtifact` across derived run entries.

Instead:

1. Effective timing/context factors already used to generate Base are frozen in the Base/run-generation provenance established by V0.6.
2. WHAT_IF derivation uses those same effective assumptions and does not recompute them.
3. The comparison UI treats the active Base bundle’s `context` state as the experiment context for Base/A/B.
4. Derived V0 entries may omit `contextArtifact`; omission does not mean the experiment silently lost the Base assumptions.
5. If Base context is `omitted` or `unavailable`, the comparison displays that exact Base state and does not synthesize replacement context.

This avoids duplicate explanatory context artifacts whose only difference would be run binding while preserving the actual modelling assumptions.

## ScenarioOutcome

Outcomes are runtime-derived from validated bundles; they are not persisted in the catalog.

Conceptual contract:

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

The implementation may reuse existing metric helpers, but these semantics are required. A value that cannot be derived is `null`/unavailable, never zero-filled.

## Evaluation point

Each scenario is evaluated at its own complete-operation point:

```text
max(route.returnMinute)
```

Time metrics distinguish:

- completion clock,
- operation span.

Example:

```text
BASE   07:00 -> 15:00   span 8h
EARLY  06:00 -> 14:00   span 8h
```

Early finishes one hour earlier; it is not one hour faster.

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
- package-count spread across vehicles when parcel cargo is available.

V0 does not add real-delay, SLA, risk, probability, or observed-road-condition metrics.

## ScenarioDelta

Fixed direction:

```text
delta = alternative - Base
```

Conceptual contract:

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

V0 does not produce a scenario score, risk score, winner, “best scenario,” or automatic recommendation. It exposes explicit trade-offs and metric deltas only.

## Runtime UX

FleetFlow keeps time-first navigation.

### Level 1 — TIME

`OperationalDateRail` selects the Base operational day/run.

### Level 2 — DECISION

When the active Base has a catalog comparison:

```text
[ BASE ] [ EARLY START ] [ BALANCED LOAD ]
```

TIME and DECISION remain distinct.

## Map/runtime behavior

Only one bundle is rendered/simulated at a time. Selecting Base/A/B changes the selected validated bundle atomically and reuses existing:

- `FleetMap`,
- simulation clock,
- `FleetPanel`,
- current-scenario KPIs.

No three-map or three-engine layout is introduced.

## Comparison panel

Existing KPIs answer:

> What is true in the currently selected simulated plan?

Comparison UI answers:

> How does this plan differ from Base?

The panel contains:

- compact Base/A/B metric table,
- selected alternative vs Base deltas,
- explicit action description,
- frozen-input summary,
- compact provenance disclosure.

Illustrative layout values are not contractual. The UI must display actual derived outcomes.

No column receives a winner badge.

## Visible epistemic/provenance information

For WHAT_IF alternatives the UI identifies:

- `WHAT_IF`,
- simulated/model output status,
- action type/parameters,
- Base run ID,
- action-set ID/version,
- derivation model,
- frozen package/destination/fleet inputs,
- Base context state.

Copy must state that results are deterministic model outputs under frozen baseline assumptions, not observed operations or guaranteed predictions.

## Date changes

Changing date exits the current experiment:

```text
change date
→ clear selected alternative/comparison state
→ load new Base bundle
→ discover comparison availability for new Base
```

An alternative from one Base can never remain selected against another date.

## Lazy loading

Normal FleetFlow does not eagerly load all alternatives.

```text
load FleetFlow normally
→ select/load Base normally
→ discover comparison definition by baseRunId
→ user opens Compare
→ load A + B
→ validate complete set
→ show comparison
```

A date without a comparison behaves exactly like normal FleetFlow and shows no comparison controls.

## Failure semantics

### Base failure

Existing operational failure behavior applies. No comparison can open.

### Comparison failure

Invalid/missing alternative run, route binding, lineage, or experiment invariants produce:

```text
Scenario comparison unavailable
```

The Base remains usable. Partial comparisons are not shown.

### Optional metric failure

A missing optional metric renders unavailable (`—`) but does not invalidate an otherwise valid experiment.

```text
invalid experiment != unavailable optional metric
```

## TDD requirements

Implementation is test-first.

### SHIFT_DEPARTURE tests

Prove:

- exact requested minute shift,
- identical destination set,
- identical cargo by destination,
- identical assignment/order,
- identical route coordinates/distances,
- identical package total,
- identical fleet/effective Base assumptions.

### BALANCE_PACKAGES tests

Prove:

- identical destination set,
- identical cargo by destination,
- identical total packages,
- identical fleet/effective Base assumptions,
- each destination exactly once,
- capacity validity,
- at least one stop per truck for the published fixture,
- deterministic assignment/order,
- lower package-count spread than the published Base fixture.

Do not require universally better distance/fuel/span.

### Determinism tests

For both actions:

```text
derive(base, action) == derive(base, action)
```

IDs, assignments, ordering, schedules, and semantic derived output are stable for identical inputs/model version.

### Lineage tests

Reject:

- alternative referencing the wrong Base,
- alternative entry/run with mode other than `WHAT_IF`,
- different `targetDate`,
- different `dataAsOf`,
- action-set `baseRunId` mismatch,
- invalid/missing derivation metadata,
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

Require existing route/run/date/model binding and topology checks for each alternative.

Early route coordinates/distances equal Base; Balanced geometry may differ.

### Outcome tests

Pure -60 Early fixture:

```text
operationEndDeltaMinutes    = -60
operationSpanDeltaMinutes   = 0
distanceDeltaKm             = 0
estimatedFuelDeltaL         = 0 when derivable
packageLoadSpreadDelta      = 0
```

Balanced fixture requires lower package-count spread only; distance/fuel/span remain observed model outputs.

### Comparison catalog/loading tests

Require:

- catalog alternative contains a valid V2 entry,
- unsafe artifact/route paths reject,
- valid Base+A+B -> comparison available,
- wrong Base ID -> reject,
- invalid A route binding -> comparison unavailable while Base remains usable,
- invalid B lineage -> comparison unavailable while Base remains usable,
- optional metric unavailable -> comparison remains available.

### UI tests

Prove:

```text
select comparison-enabled Base date
→ Base map visible
→ open Compare
→ Base / Early / Balanced visible
→ select Early
→ Early bundle displayed
→ select Balanced
→ Balanced bundle displayed
→ table remains Base/A/B
→ change date
→ comparison closes/resets
→ new Base loads
```

Also:

```text
date without comparison
→ no comparison controls
```

## Compatibility

Must preserve:

- V0.5 artifacts and manifest V1,
- V0.6 timeline behavior,
- static scenarios,
- existing simulation-engine contracts,
- OperationalBundle fail-closed validation,
- normal date switching outside comparison mode.

No historical artifact is rewritten to support What-If V0.

## Definition of Done

```text
✓ one eligible V0.6 Base run has one published comparison
✓ exactly two immutable WHAT_IF runs derive from that Base
✓ action sets are machine-readable/versioned
✓ Base -> Derived lineage validates
✓ package, destination, cargo, and fleet conservation validate
✓ SHIFT_DEPARTURE is deterministic and schedule-only
✓ BALANCE_PACKAGES is deterministic and rebalances complete stops
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
✓ changing date exits the experiment
✓ days without comparison remain normal FleetFlow days
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
