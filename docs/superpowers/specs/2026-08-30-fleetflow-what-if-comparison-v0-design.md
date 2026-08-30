# FleetFlow Scenario / What-If Comparison V0 — Design

## Status

Approved architecture after design review on 2026-08-30. This document is the canonical design for the first FleetFlow what-if comparison slice. It must be reviewed and approved before implementation planning begins.

## Purpose

FleetFlow evolves toward an operational simulation engine that can evaluate explicit operational decisions against a frozen baseline state without becoming a generic digital twin, prediction oracle, risk-score engine, or autonomous optimizer.

The core conceptual model is:

```text
S(t) + A(t) -> S'(t+1)
```

For FleetFlow:

- `S(t)` is the validated operational baseline represented by an `OperationalRun` plus its matching route geometry and optional context state,
- `A(t)` is a versioned, explicit `WhatIfActionSet`,
- `S'(t+1)` is an immutable derived `OperationalRun` with `mode: WHAT_IF`,
- the existing simulation engine consumes the derived `FleetScenario`,
- a comparison layer derives explicit outcomes and Base-relative deltas.

`S'(t+1)` means an alternative operational trajectory under the FleetFlow model. It is not a guaranteed future state.

## Product boundary

FleetFlow answers:

> What happens under a different operational decision?

It does not attempt to answer every question about the territory or system state.

The intended conceptual separation is:

```text
Territorial Score -> represents / explains S(t)
FleetFlow         -> applies A(t) to S(t) and simulates consequences
```

FleetFlow must not absorb Territorial Score or import a generic territorial-state model. Future integrations may adapt external state/context data into FleetFlow inputs, but the products remain independent.

## Epistemic contract

The feature must preserve the following distinctions:

```text
simulation != operation
estimated traffic != live traffic
modelled weather != observed road condition
scenario outcome != guaranteed prediction
```

Additional rules:

1. A what-if result is a model output, not observed operational evidence.
2. Missing data remains missing or unavailable; it is never silently replaced with zero.
3. No synthetic global risk score is introduced.
4. No scenario receives a universal winner or recommendation score.
5. Actions and outcomes are stored/derived separately: an action describes what changed; an outcome describes what the model produced.
6. Every what-if run must retain machine-readable lineage to an immutable baseline run and explicit action set.
7. A derived run may change only fields permitted by its action set.

## Relationship to the existing architecture

FleetFlow already has the right boundaries for this feature.

Current runtime flow:

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

The simulation engine remains date-, provider-, and provenance-agnostic. It must not become a data-ingestion, scenario-generation, action-application, or comparison component.

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

What-If V0 should be implemented after the Daily Spatial Demand slice produces the first useful V0.6 baseline with:

- 45–65 active synthetic destinations,
- variable package demand,
- fixed eight-vehicle fleet,
- variable packages and stops per vehicle,
- per-run road-following route geometry,
- manifest V2,
- immutable `OperationalBundle` semantics.

What-If V0 does not expand or rewrite the Daily Spatial Demand scope.

The intended implementation sequence is:

```text
PR1  Operational Bundle Foundation               DONE
PR2  Daily Spatial Demand                        NEXT BASELINE
V0   Scenario / What-If Comparison               THIS DESIGN
PR3  Richer Córdoba Operational Context + UI     LATER
```

Rich contextual data is not required for What-If V0. When context exists it is frozen from the baseline. When it is omitted or unavailable that status is preserved.

## Scope

### In scope

- one published what-if experiment for one V0.6 operational date,
- one immutable baseline `OperationalRun`,
- exactly two immutable WHAT_IF alternatives,
- `SHIFT_DEPARTURE` action,
- `REBALANCE_STOPS` with `BALANCE_PACKAGES` strategy,
- explicit Base -> Derived lineage,
- deterministic offline derivation,
- immutable per-run route artifacts,
- separate comparison catalog outside the operational timeline,
- differential invariant validation between Base and Derived runs,
- runtime `ScenarioOutcome` derivation,
- Base-relative metric deltas,
- one selected map/bundle at a time,
- compact Base/A/B comparison UI,
- comparison loading under demand,
- independent comparison failure without breaking the base operation,
- TDD coverage for contracts, determinism, conservation, lineage, routes, outcomes, and UI.

### Out of scope

- live GPS or IoT,
- live traffic in the browser,
- live weather in the browser,
- user-authored what-if actions,
- runtime scenario generation,
- runtime routing,
- changing fleet size,
- vehicle availability modelling,
- autonomous agents,
- reinforcement learning,
- Monte Carlo simulation,
- uncertainty distributions,
- machine learning,
- opaque optimization,
- OR-Tools/full VRP optimization,
- generic digital-twin abstractions,
- backend/database additions,
- jobs/queues,
- recommendation engine,
- global risk score,
- global scenario score,
- automatic “best scenario” selection,
- Territorial Score integration,
- driver shifts/identities,
- real SLA/late-delivery claims,
- real observed road-condition claims.

## Architectural principle: `OperationalRun` remains the run abstraction

A What-If is not a new parallel `ScenarioRun` entity.

It remains an `OperationalRun` with:

```text
mode = WHAT_IF
```

This avoids duplicating:

- run validators,
- run loaders,
- manifest semantics,
- route bindings,
- bundle semantics,
- switching behavior.

`FleetScenario` remains the operational payload consumed by the simulation engine. It does not become the lineage or epistemic container for an experiment.

## WhatIfActionSet

V0 introduces one small explicit decision contract:

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

V0 does not use an open-ended `{ type: string, params: Record<string, unknown> }` contract. Unknown action types fail validation.

The first published comparison has exactly two alternatives:

```text
A: SHIFT_DEPARTURE -60 minutes
B: REBALANCE_STOPS / BALANCE_PACKAGES
```

## Lineage and what-if provenance

A derived WHAT_IF run must carry machine-readable lineage inside `OperationalRun.provenance`.

Conceptual contract:

```ts
interface WhatIfProvenance {
  baseRunId: string
  actionSet: WhatIfActionSet
  actionSetVersion: number
  derivationModel: string
  seed: string
  inputFingerprint?: string
}
```

The required V0 fields are:

- `baseRunId`,
- embedded `actionSet`,
- action-set version,
- derivation-model identifier,
- deterministic seed.

`inputFingerprint` is optional in V0. It may be included if it can be generated without introducing unnecessary complexity.

Example provenance shape:

```json
{
  "generator": "what-if-derivation-v1",
  "seed": "fleetflow:what-if:v0:base=...:action=balanced-load-v1",
  "notes": [
    "Deterministic WHAT_IF simulation derived from an immutable baseline; not observed operation."
  ],
  "whatIf": {
    "baseRunId": "cordoba-2026-09-01-v3",
    "actionSet": {
      "schemaVersion": 1,
      "id": "balanced-load-v1",
      "label": "Balanced load",
      "baseRunId": "cordoba-2026-09-01-v3",
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

## Baseline and derived-run invariants

All alternatives in the V0 comparison represent alternatives for the same operational date.

The following are invariant across Base, Early Start, and Balanced Load:

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
context snapshot/status
context/model factors when present
```

The derived run keeps the same `targetDate` as its baseline. It is an alternative decision for the same day, not another timeline entry.

## Action A — SHIFT_DEPARTURE

`SHIFT_DEPARTURE` V0 shifts the operational schedule by an exact minute offset.

For `minutes = -60`, the transformation applies to:

- `departureMinute`,
- every `plannedArrivalMinute`,
- every `plannedDepartureMinute`,
- `returnMinute`.

It must preserve:

- package total,
- destination IDs,
- cargo per destination,
- truck assignment,
- stop order,
- fleet,
- context,
- route geometry coordinates,
- route distances.

V0 explicitly does not recompute traffic or weather because the departure clock changes. Context remains frozen to isolate the schedule decision.

Expected outcome semantics for a pure -60 minute shift:

```text
completion clock delta     -60 min
operation span delta         0 min
planned distance delta       0 km
estimated fuel delta         0 L
package-load spread delta    0
```

The UI must not describe this as “60 minutes faster.” It means the operation finishes 60 minutes earlier on the clock while preserving the same operational span under frozen assumptions.

## Action B — REBALANCE_STOPS / BALANCE_PACKAGES

The unit of reassignment is a complete delivery stop. Cargo is never moved between destination records.

The algorithm is deterministic and transparent:

1. Build `(destination, packageLoad)` records from the baseline stops.
2. Sort stops by package load descending.
3. Use stable destination ID order as the tie-breaker.
4. Repeatedly assign the next stop to the truck with the lowest accumulated package load.
5. Break truck-load ties by `truckId` ascending.
6. After assignment, order each truck’s assigned destinations with deterministic nearest-neighbour ordering from the depot.
7. Break equal-distance ordering ties by `storeId` ascending.
8. Route the resulting waypoint sequence offline.
9. Derive the final schedule from the newly routed route basis and existing deterministic service-time rules.

V0 does not add 2-opt, OR-Tools, or an opaque optimizer.

The feature may claim:

> Deterministic package-balancing strategy.

It must not claim:

> Globally optimal route or assignment.

Required conservation properties:

```text
sum(packages BASE) == sum(packages BALANCED)
Map<destinationId, packageCount>(BASE) == Map<destinationId, packageCount>(BALANCED)
Set<destinationId>(BASE) == Set<destinationId>(BALANCED)
Set<truckId>(BASE) == Set<truckId>(BALANCED)
```

Assignment, stop order, geometry, distance, and schedule may change.

For the published V0 fixture, `BALANCE_PACKAGES` must reduce package-load spread relative to Base. It is not required to improve distance, fuel, or operational span.

## Derivation pipeline

Derivation is offline. The browser does not apply actions or route new scenarios.

Pipeline:

```text
Base OperationalRun
        +
WhatIfActionSet
        ↓
derive candidate scenario
        ↓
validate action-specific differential invariants
        ↓
prepare / copy bound route geometry
        ↓
for route-changing actions: derive route-dependent schedule
        ↓
validate final FleetScenario
        ↓
validate final OperationalRun
        ↓
publish immutable WHAT_IF bundle
```

Action derivation and road routing are separate responsibilities.

### SHIFT_DEPARTURE routing

No external route request is required because no waypoint changes.

A separate route artifact is still published for the WHAT_IF run so the strong V2 `routeArtifact.metadata.runId == OperationalRun.id` binding remains intact.

Its coordinates and waypoint distances are semantically equal to the baseline geometry, while metadata is rebound to the derived run identity.

### BALANCE_PACKAGES routing

The action changes truck waypoint membership and order, so a new road-following route artifact is required.

The ordering is:

```text
assign stops
→ order stops
→ route
→ obtain route basis
→ derive final planned timing
→ publish FleetScenario + route artifact
```

The existing simulation engine is not modified to perform this work.

## Determinism

The required reproducibility contract is:

```text
same Base run
+ same ActionSet
+ same derivation-model version
= same semantic derived result
```

The derivation seed is explicit even when the V0 algorithms do not require random choices:

```text
fleetflow:what-if:v0:base=<baseRunId>:action=<actionSetId>
```

Published route artifacts freeze external routing output. Re-running a third-party routing service in the future is not required to reproduce the already published experiment.

Published artifacts are append-only. A changed algorithm or semantics receives a new action/run/version rather than rewriting a previous WHAT_IF artifact.

## Validation model

Validation occurs at three layers.

### 1. Run validity

The derived `OperationalRun` must pass existing run/scenario validation plus new WHAT_IF provenance validation.

### 2. Bundle validity

The run and route artifact must satisfy existing OperationalBundle route binding and topology checks.

### 3. Experiment validity

A Base/Derived comparison validates allowed differences and conservation rules.

For `SHIFT_DEPARTURE`, required equality includes:

```text
same package manifest
same destination set
same cargo by destination
same truck assignment
same stop ordering
same fleet
same context
same route coordinates/distances
all schedule fields shifted by the requested exact offset
```

For `REBALANCE_STOPS / BALANCE_PACKAGES`:

```text
same package manifest
same destination set
same cargo by destination
same fleet
same context
assignment may change
stop order may change
geometry may change
schedule may change
```

Every destination must be assigned exactly once. Every truck must retain at least one stop for the V0 fixture. Capacity constraints remain valid.

## Operational timeline versus decision dimension

WHAT_IF alternatives must not be inserted into the primary operational timeline as peer date entries.

The current operational manifest remains the time dimension:

```text
OperationalRun manifest
→ which operational date/run?
```

A separate comparison catalog is the decision dimension:

```text
WhatIf comparison catalog
→ which alternative decision for this baseline?
```

This prevents multiple same-date alternatives from contaminating default date selection or the `OperationalDateRail`.

## What-If comparison catalog

V0 adds a small separate artifact:

```text
public/data/operational-runs/what-if-comparisons.json
```

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
  alternatives: WhatIfAlternative[]
}

interface WhatIfAlternative {
  label: string
  runId: string
}
```

The first V0 catalog publishes exactly one comparison with exactly two alternatives.

The catalog references run identities. It does not persist outcome metrics or duplicated result values.

## Artifact layout

Conceptually:

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

The Base artifacts are supplied by the Daily Spatial Demand slice. What-If V0 adds only the two derived runs, two derived route artifacts, and one catalog entry.

The two WHAT_IF alternatives are not required to appear in the operational-run timeline manifest.

## Comparison loading

Comparison loading is fail-closed and atomic.

Conceptual flow:

```text
load comparison definition
        ↓
resolve Base run/bundle
        ↓
load alternative A bundle
        ↓
load alternative B bundle
        ↓
validate WHAT_IF lineage
        ↓
validate Base/Derived invariants
        ↓
commit ScenarioComparisonSet
```

Conceptual runtime type:

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

A comparison set is unavailable if any required alternative fails run loading, route binding, lineage, or experiment validation.

The base operation remains independently usable when comparison loading fails.

## Context semantics

What-If V0 freezes baseline context.

```text
Base context
    ↓ inherited/frozen
Early Start
Balanced Load
```

If the baseline context is:

- `available`, both alternatives inherit the same frozen context semantics/factors,
- `omitted`, both alternatives remain omitted,
- `unavailable`, both alternatives preserve unavailable status.

Changing departure time does not automatically trigger a different traffic profile in V0.

No what-if action can create missing context or silently replace it with neutral values.

## ScenarioOutcome

Comparison results are derived in runtime from validated bundles. They are not stored in the comparison catalog.

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

The exact type may reuse existing metrics where appropriate, but the semantic fields above are required unless the underlying model cannot derive a value, in which case nullable/missing semantics must be preserved.

## Outcome evaluation point

Each scenario is evaluated at its own operation completion point:

```text
max(route.returnMinute)
```

This produces a complete-operation outcome rather than comparing scenarios at the same wall-clock minute.

Time metrics must distinguish:

- operation completion clock,
- operation span/duration.

For example:

```text
BASE        07:00 -> 15:00   span 8h
EARLY       06:00 -> 14:00   span 8h
```

The alternative finishes 60 minutes earlier but is not 60 minutes faster.

## V0 comparison metrics

Required V0 comparison metrics are:

- operation start clock,
- operation completion clock,
- operation span,
- planned distance,
- estimated fuel used when derivable,
- total packages,
- total deliveries,
- completed deliveries,
- mean initial vehicle utilization when derivable,
- maximum initial vehicle utilization when derivable,
- package-load spread across vehicles when parcel cargo is available.

V0 does not introduce real-delay, SLA, real idle-time, risk, probability, or observed-road-condition metrics.

## ScenarioDelta

All deltas use one fixed direction:

```text
delta = alternative - base
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

Missing optional metrics propagate as unavailable deltas rather than zero.

## No global score or winner

V0 must not produce:

```text
Scenario score
Risk score
Winner
Best scenario
Recommended scenario
```

The UI exposes trade-offs and explicit deltas. It does not choose weights for the user.

Positive/negative visual semantics must remain metric-specific and restrained. A lower completion time does not automatically make a scenario globally better.

## Runtime UX

FleetFlow keeps the existing time-first navigation.

### Level 1 — TIME

`OperationalDateRail` selects the operational baseline date/run.

### Level 2 — DECISION

When the selected Base has a published comparison, a separate decision selector becomes available:

```text
[ BASE ] [ EARLY START ] [ BALANCED LOAD ]
```

The two dimensions remain distinct:

```text
TIME
27 -> 28 -> 29 -> 30 -> 01
                         |
                         v
                      DECISION
                   BASE / A / B
```

## Map behavior

Only one bundle is rendered on the map at a time.

The selected scenario drives the existing:

- `FleetMap`,
- simulation clock,
- FleetPanel,
- current-scenario KPIs.

The application does not render three simultaneous maps or three simulation-engine instances.

Switching Base/A/B swaps the selected validated bundle atomically.

## Comparison panel

The comparison panel answers a different question from the existing current-scenario KPIs.

Existing KPIs:

> What is true in the currently selected simulated plan?

Comparison panel:

> How does this scenario differ from the Base under the model?

The panel should include a compact Base/A/B metric table and, for the selected alternative, a Base-relative delta summary.

Example structure:

```text
              BASE       EARLY      BALANCED
Packages       108         108         108
Deliveries      55          55          55
Vehicles         8           8           8
Finish        15:08       14:08       14:51
Span           8h08        8h08        7h51
Distance      231 km      231 km      219 km
Fuel est.      35.4 L      35.4 L      33.5 L
Load spread       16          16           2
```

These numbers are illustrative only; tests and UI must display actual derived results.

No column receives a “winner” badge.

## Action and provenance UI

The selected WHAT_IF alternative visibly identifies:

- `WHAT_IF`,
- `SIMULATED`,
- action type and parameters,
- frozen Base inputs such as packages/destinations/fleet count,
- Base run ID,
- action-set ID/version,
- derivation-model version,
- context inherited from Base.

A compact disclosure can expose technical provenance without showing raw JSON by default.

Required epistemic copy must communicate that results are deterministic FleetFlow model outputs under frozen baseline assumptions, not observed operations or guaranteed predictions.

## Date changes

Changing the operational date exits the currently selected WHAT_IF alternative.

Flow:

```text
change date
→ clear selected alternative/comparison state
→ load new Base bundle
→ discover whether that Base has a published comparison
```

A WHAT_IF alternative from one date must never remain selected against another Base date.

## Comparison availability and lazy loading

FleetFlow starts and loads normal operational dates without eagerly fetching all what-if bundles.

Preferred runtime flow:

```text
load FleetFlow normally
→ select Base date
→ Base operation works normally
→ catalog says comparison available
→ user opens comparison
→ load A + B
→ validate entire comparison
→ show comparison panel
```

Days without a published comparison show no comparison controls and otherwise behave exactly as normal FleetFlow.

## Failure semantics

### Base operation failure

Existing operational-run failure behavior applies. No comparison is available because the state itself is unavailable.

### Comparison failure

If an alternative run, route, lineage, or differential invariant is invalid:

```text
Scenario comparison unavailable
Base operation remains available
```

The application does not display a partially valid Base/A/B comparison.

### Optional metric failure

A missing optional metric does not necessarily invalidate the experiment.

It renders as unavailable:

```text
Fuel estimate   —
Delta           —
```

The distinction is:

```text
invalid experiment != unavailable optional metric
```

## TDD requirements

Implementation must follow TDD. Tests are required before the corresponding production behavior.

### Action contract tests

`SHIFT_DEPARTURE` must prove:

- exact requested minute shift,
- identical destinations,
- identical cargo by destination,
- identical truck assignment,
- identical stop order,
- identical route coordinates/distances,
- identical total packages,
- identical fleet/context.

`BALANCE_PACKAGES` must prove:

- identical destination set,
- identical cargo by destination,
- identical total package count,
- identical fleet/context,
- each destination assigned exactly once,
- capacity validity,
- at least one stop per truck for the V0 fixture,
- deterministic assignment/order,
- lower package-load spread than the published Base fixture.

It must not assert that distance/fuel/span always improve.

### Determinism tests

For both actions:

```text
derive(base, action) == derive(base, action)
```

Semantic derived outputs, IDs, assignments, ordering, and schedules must be stable for identical inputs/model version.

### Lineage tests

Reject:

- alternative lineage referencing the wrong Base,
- alternative with mode other than `WHAT_IF`,
- alternative `targetDate` different from Base,
- V0 alternative `dataAsOf` different from Base,
- action-set `baseRunId` different from lineage/catalog Base,
- missing/invalid derivation-model metadata.

### Conservation tests

Require:

```text
sum packages equal across Base/A/B
cargo-by-destination map equal across Base/A/B
destination set equal across Base/A/B
fleet/truck identity set equal across Base/A/B
```

### Route tests

Require each WHAT_IF route artifact to bind to the corresponding derived run via existing run/date/model metadata and topology checks.

`SHIFT_DEPARTURE` route coordinates/distances must remain semantically equal to Base.

`BALANCE_PACKAGES` route geometry may differ.

### Outcome tests

For the pure -60 minute fixture:

```text
operationEndDeltaMinutes    = -60
operationSpanDeltaMinutes   = 0
distanceDeltaKm             = 0
estimatedFuelDeltaL         = 0 when fuel is derivable
packageLoadSpreadDelta      = 0
```

For Balanced Load, require lower package-load spread. Do not require universally better distance/fuel/span.

### Comparison loading tests

Require:

- valid Base+A+B -> comparison available,
- invalid A route binding -> comparison unavailable while Base remains usable,
- invalid B lineage -> comparison unavailable while Base remains usable,
- unavailable optional metric -> comparison remains available with missing metric.

### UI tests

The full flow must prove:

```text
select comparison-enabled date
→ Base map visible
→ open Compare
→ Base / Early / Balanced visible
→ select Early
→ Early bundle displayed
→ select Balanced
→ Balanced bundle displayed
→ comparison table remains Base/A/B
→ change operational date
→ comparison closes/resets
→ new date Base loads
```

Also require:

```text
date without comparison
→ no comparison controls
```

## Compatibility

The feature must preserve:

- V0.5 OperationalRun artifacts,
- V0.5 manifest V1 behavior,
- V0.6 timeline behavior,
- static scenarios,
- existing simulation-engine contracts,
- existing OperationalBundle fail-closed validation,
- existing date switching behavior outside comparison mode.

No historical artifact is rewritten merely to support What-If V0.

## Definition of Done

What-If V0 is complete when all of the following are true:

```text
✓ one published V0.6 Base OperationalRun supports a comparison
✓ two immutable WHAT_IF OperationalRuns are derived from that Base
✓ action sets are machine-readable and versioned
✓ Base -> Derived lineage is validated
✓ package, destination, cargo, and fleet conservation are validated
✓ SHIFT_DEPARTURE is deterministic and shifts schedule only
✓ BALANCE_PACKAGES is deterministic and rebalances complete stops
✓ derived route artifacts are correctly bound to their runs
✓ comparison catalog is separate from the timeline manifest
✓ full comparison sets load atomically
✓ Base remains usable when comparison loading fails
✓ ScenarioOutcome is derived from validated bundles
✓ Base-relative deltas use alternative - Base semantics
✓ missing optional metrics remain unavailable, never zero-filled
✓ no global score exists
✓ no automatic winner/recommendation exists
✓ only one map/bundle is selected at a time
✓ changing date exits the current experiment
✓ days without comparisons remain normal FleetFlow days
✓ V0.5 and V0.6 historical behavior remains compatible
✓ full automated test suite passes
✓ production build passes
```

## Architectural result

The feature establishes a narrow, auditable decision-simulation loop:

```text
Operational State
      S(t)
       │
       ▼
Explicit Action
      A(t)
       │
       ▼
Deterministic Derivation
       │
       ▼
Operational Simulation
       │
       ▼
Scenario Outcome
       │
       ▼
Explicit Comparison
```

This is the intended FleetFlow direction: a reproducible operational decision simulator, not a generic digital twin and not an automated decision authority.
