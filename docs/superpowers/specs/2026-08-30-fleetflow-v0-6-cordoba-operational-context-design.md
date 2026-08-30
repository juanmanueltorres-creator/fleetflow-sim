# FleetFlow V0.6 — Córdoba Operational Context + Daily Spatial Demand

## Status

Approved architecture, written after design review on 2026-08-30. Awaiting final user review before implementation planning.

## Goal

FleetFlow V0.6 evolves the V0.5 operational timeline from a sequence of reproducible runs over fixed geography into a reproducible temporal logistics model where each operating day can have a different set of synthetic delivery destinations, a different distribution of packages across a fixed fleet, different road-following route geometry, and bounded operational timing effects derived from public Córdoba context.

The milestone must make date changes materially visible and operationally meaningful:

- eight vehicles remain fixed,
- active delivery destinations vary by day,
- the number of active destinations varies between 45 and 65,
- package load varies by truck,
- route geometry varies with the active destinations,
- traffic and weather can alter travel/service timing through bounded deterministic factors,
- GTFS is used only as a spatial proxy for the candidate delivery pool,
- every published daily run remains immutable, reproducible and provenance-labelled.

The V0.6 product should feel like a small temporal logistics simulation engine rather than the same map replayed at different speeds.

## Product principle

FleetFlow must preserve the distinction between operational simulation and observed reality.

Public and modelled context can inform the simulation, but it must not be presented as direct evidence of a real delivery operation.

The core epistemic rules are:

1. public transport structure is a spatial proxy, not observed parcel demand,
2. traffic reference data can inform a travel-time factor, not prove the exact condition of each street,
3. weather can inform a bounded modelled penalty, not prove causal delay for a specific vehicle,
4. missing context is not equivalent to a zero value,
5. simulation output is not observed operation,
6. a published run/vintage is immutable,
7. every transformation from reference input to simulation parameter must be traceable through provenance.

## Relationship to V0.5

V0.5 established the temporal foundation:

```text
Scenario Definition
       ↓
Operational Run Catalog
       ↓
selected OperationalRun
       ↓
OperationalRun.scenario
       ↓
existing simulation engine
```

V0.6 preserves that separation and adds two layers around the existing `FleetScenario` payload:

```text
reference data + versioned model inputs
              ↓
Daily Spatial Demand + Operational Context
              ↓
OperationalRun.scenario
              ↓
road-following route preparation
              ↓
Operational Bundle
              ↓
existing simulation engine
```

The simulation engine remains date-agnostic. It consumes the selected `FleetScenario` and matching route geometry exactly as before.

V0.6 must not turn `getFleetSnapshot()`, `deriveFleetMetrics()`, `FleetMap`, `FleetPanel` or the core simulation clock into data-ingestion components.

## Current V0.5 constraints being intentionally replaced

The current calibrated generator has a fixed stop-count distribution:

```text
[6, 9, 7, 8, 6, 10, 7, 7]
```

which yields 60 destinations for every day. A stable geography seed also causes the same delivery coordinates to be reused across operational dates.

Those constraints were deliberate in V0.5 and remain valid for historical V0.5 artifacts. V0.6 introduces a new model version instead of mutating the meaning of the old artifacts.

The current V0.5 application also loads the operational run and shared scenario-level route asset independently. V0.6 replaces this for V0.6 runs with a validated `OperationalBundle` so a run cannot silently render with geometry from a different day.

## Scope

### In scope

- a stable synthetic Córdoba delivery candidate pool,
- approximately 240 candidate destinations in the first pool vintage,
- GTFS-derived spatial weighting for candidate generation/selection,
- 45–65 active synthetic delivery destinations per operating day,
- deterministic date-based destination selection,
- eight fixed vehicles every day,
- variable stop count per vehicle,
- variable package count per vehicle,
- deterministic spatial allocation of destinations to vehicles,
- simple deterministic route-stop ordering before road routing,
- one immutable route GeoJSON artifact per V0.6 run,
- offline road-following route preparation using the existing route-preparation workflow,
- independent traffic, weather and public-transit context tracks,
- bounded deterministic traffic and weather timing factors,
- immutable context/provenance for factors actually used by each run,
- optional richer context artifact for UI explanation,
- manifest schema V2,
- run + route operational bundles,
- fail-closed bundle validation,
- atomic date switching,
- compact daily context UI,
- planned and remaining package counts per truck,
- backwards compatibility with V0.5 manifest/artifacts,
- TDD coverage for determinism, variation, bundle integrity, context semantics and UI behaviour.

### Out of scope

- OR-Tools or full vehicle-routing-problem optimization,
- changing fleet size by day,
- live GPS or IoT telemetry,
- real customer identities,
- real business identities as delivery destinations,
- real delivery addresses,
- browser-side OSRM routing,
- live traffic API calls in the browser,
- live weather API calls in the browser,
- backend/database persistence,
- driver shifts,
- driver identities,
- failed deliveries,
- returns/pickups,
- breakdowns,
- dynamic reassignment,
- rolling-horizon replanning,
- machine learning,
- synthetic combined risk scores,
- claiming that GTFS passenger activity directly predicts parcel demand,
- claiming that reference traffic or modelled weather is observed truck-level evidence.

## Approved invariants

### Fixed across V0.6 days

```text
fleet size                  8 vehicles
depot                       Córdoba depot
operational timezone        America/Argentina/Cordoba
simulation engine           existing engine
calibration family          existing Amazon-derived operational profile
published run semantics     immutable vintages
candidate pool vintage      explicit/versioned
```

### Variable by operating day

```text
active destinations         45–65
active candidate IDs        variable
packages                    variable
packages per truck          variable
stops per truck             variable
route geometry              variable
distance                    variable
travel time                 variable
service time                variable
utilization                 variable
return time                 variable
operation span              variable
```

### Context roles

```text
GTFS      → spatial proxy only
traffic   → bounded travel-time input
weather   → bounded travel/service-time input
```

GTFS must not alter the daily package target.

Traffic and weather must not create or remove delivery destinations.

## High-level architecture

```text
PUBLIC / VERSIONED REFERENCE DATA
│
├── Córdoba GTFS reference
├── Córdoba traffic reference/profile
└── weather snapshot/reference
        │
        ▼
OFFLINE CONTEXT ADAPTERS
        │
        ▼
CordobaOperationalContext
        │
        ├──────── existing weekly operational demand profile
        │
        ▼
Daily Spatial Demand Generator
│
├── daily package target
├── 45–65 active destinations
├── weighted candidate selection
├── 8-truck assignment
├── bounded traffic factor
└── bounded weather factors
        │
        ▼
FleetScenario
        │
        ▼
existing offline route preparation / OSRM
        │
   ┌────┴───────────────┐
   ▼                    ▼
run JSON          per-run routes GeoJSON
   │                    │
   └────────┬───────────┘
            │
     optional context JSON
            │
            ▼
       manifest V2
            │
            ▼
     OperationalBundle
            │
            ▼
   existing FleetFlow runtime
```

The browser must not recalculate route geometry, public-data adapters or operational context factors for a published run.

## Stable synthetic delivery candidate pool

V0.6 introduces a versioned pool of synthetic candidate destinations for Córdoba.

Initial target size:

```text
~240 candidates
```

The exact checked-in count may differ slightly if generation/validation reveals a better clean boundary, but the pool must be large enough that 45–65 daily selections can vary substantially while allowing recurring destinations between days.

Conceptual contract:

```ts
interface DeliveryCandidate {
  id: string
  position: [number, number]
  zoneId: string
  corridorId?: string
  spatialWeight: number
  provenance: {
    generator: string
    candidatePoolVersion: string
    gtfsReference: string
  }
}
```

### Candidate identity

Candidates are synthetic logistical locations, not businesses.

UI-facing labels should use neutral names such as:

```text
Entrega 014
Entrega 087
Entrega 203
```

The system must not imply that a candidate is a specific shop, residence or real customer.

### Stable pool, variable active subset

The candidate universe is stable within a pool vintage, while each operational day chooses a deterministic subset.

```text
candidate pool       ~240
Thursday active        57
Friday active          64
Sunday active          45
```

Candidates may recur across days. This represents recurring synthetic delivery locations while retaining stable IDs and provenance.

## GTFS role

GTFS is approved as a spatial proxy, not as a parcel-demand source.

Offline processing may use stops, routes, corridors or derived transit-density measures to create relative spatial weights for synthetic candidate locations.

Conceptually:

```text
GTFS stops/routes
       ↓
normalized corridor / stop density
       ↓
spatial influence
       ↓
candidate spatial weights
```

A higher candidate weight means only that the synthetic location lies in an area with stronger public-transport structural presence according to the chosen reference model.

It must not be interpreted as:

- higher observed parcel demand,
- higher passenger count,
- a real customer location,
- a causal relationship between transit usage and deliveries.

GTFS need not be loaded at runtime after the candidate pool is generated. The run should record the candidate-pool version used.

## Daily delivery-count model

Approved daily active destination range:

```text
45 <= deliveryCount <= 65
```

The count should be influenced by the existing weekly operational demand profile rather than sampled uniformly.

A conceptual mapping is:

```text
low-demand day     → lower part of 45–65
medium-demand day  → middle part of 45–65
high-demand day    → upper part of 45–65
```

The exact deterministic formula belongs in the implementation plan and tests, but it must preserve these properties:

- bounded to 45–65,
- deterministic for the same date/model/input vintage,
- positively related to the weekly demand profile,
- not hardcoded to a fixed stop count per vehicle.

## Package allocation

The existing daily package target remains the demand authority.

After the daily destination count is selected, package cargo is distributed across active stops using the existing calibration family and deterministic RNG.

Required invariant:

```text
Σ packageCount across all planned stops
=
dailyPackageTarget
```

No package may disappear or be duplicated during spatial selection or vehicle assignment.

The model may retain variable packages per stop and existing volume/capacity semantics.

## Deterministic random streams

V0.6 should separate random streams by responsibility so unrelated changes do not unnecessarily reshuffle every layer.

Conceptual seeds:

```text
fleetflow:v0.6:cordoba:<date>:demand
fleetflow:v0.6:cordoba:<date>:spatial
fleetflow:v0.6:cordoba:<date>:operations
fleetflow:v0.6:cordoba:<date>:assignment
```

The candidate pool itself has an explicit stable vintage/seed such as:

```text
fleetflow:v0.6:cordoba:candidate-pool-v1
```

Required reproducibility property:

```text
same date
+ same modelVersion
+ same candidatePoolVersion
+ same context input vintages
+ same generator version
=
same operational result
```

Different dates should normally produce a different active destination set and route bundle.

## Spatial selection constraints

Pure weighted random selection is insufficient because it can create pathological daily concentration.

Selection should combine deterministic weighted sampling with simple spatial balancing constraints.

Conceptually:

```text
candidate pool
      ↓
GTFS-derived relative weights
      ↓
deterministic weighted sampling
      ↓
spatial balance constraints
      ↓
45–65 unique active destinations
```

The implementation may use sectors, zones or a similarly simple geographic partition. It must prevent obviously pathological concentration while avoiding the complexity of an optimization solver.

Required properties:

- no duplicate active candidate IDs,
- every selected candidate has a finite valid position,
- no single spatial partition can consume an unreasonable majority because of an unlucky seed,
- the result remains deterministic.

## Vehicle assignment

Fleet size is fixed at exactly eight vehicles for all V0.6 runs.

The current fixed per-vehicle stop-count array is not used for V0.6 generation.

Active destinations are assigned dynamically and deterministically to eight truck buckets.

The approved objective is deliberately limited to:

1. spatial proximity/coherence,
2. stop-count balance,
3. package/volume balance.

V0.6 does not attempt to solve the globally optimal capacitated vehicle-routing problem.

Conceptual flow:

```text
active destinations
       ↓
spatial grouping / sector affinity
       ↓
8 truck buckets
       ↓
rebalance by stop/package load
       ↓
order stops
       ↓
road-route preparation
```

Required invariants:

```text
truck count = 8
every truck has >= 1 stop
every active destination belongs to exactly 1 truck
no destination appears in multiple routes
all package cargo is assigned
vehicle capacity semantics remain valid
```

## Stop ordering and road routing

V0.6 keeps routing responsibilities separated.

FleetFlow determines a simple deterministic logical visit order for each truck. The existing offline route-preparation workflow then resolves the road-following geometry between those ordered waypoints.

A simple ordering heuristic such as nearest-neighbour, optionally followed by a small deterministic improvement step, is acceptable.

The milestone must not confuse:

```text
routing engine
```

with:

```text
fleet optimizer
```

OSRM or an equivalent road router resolves path geometry between waypoints; it does not become the full operational optimizer.

The existing `scripts/prepare-routes.mjs` workflow should be reused/adapted rather than introducing browser-side routing.

## Operational context model

V0.6 treats context as independent tracks.

Approved tracks:

```text
WEATHER
TRAFFIC
PUBLIC_TRANSIT
```

Each track has its own status, evidence class, timestamps, source metadata and limitations.

Conceptual shared types:

```ts
type EvidenceState =
  | 'OBSERVED'
  | 'MODELLED'
  | 'DERIVED'
  | 'SIMULATED'
  | 'REFERENCE'

type ContextStatus =
  | 'available'
  | 'partial'
  | 'empty'
  | 'unavailable'
  | 'omitted'

interface ContextMetadata {
  status: ContextStatus
  evidenceState: EvidenceState
  sourceId: string
  sourceLabel: string
  dataAsOf: string | null
  generatedAt: string
  limitations: string[]
}
```

Exact production TypeScript may use narrower track-specific types, but the semantic distinctions above are required.

## Traffic context

Traffic is a bounded operational reference input.

Conceptual contract:

```ts
interface TrafficContext {
  metadata: ContextMetadata
  intensity: 'LOW' | 'MODERATE' | 'HIGH'
  travelTimeFactor: number
}
```

Approved V0.6 guardrail:

```text
0.95 <= trafficTravelFactor <= 1.20
```

The model must document how the source/profile maps into the selected factor.

Traffic context must not be labelled as exact live street-level truck telemetry unless a future milestone introduces evidence that supports that claim.

## Weather context

Conceptual contract:

```ts
interface WeatherContext {
  metadata: ContextMetadata
  temperatureC: number | null
  precipitationMm: number | null
  windSpeedKmh: number | null
  travelTimeFactor: number
  serviceTimeFactor: number
}
```

Approved V0.6 guardrails:

```text
1.00 <= weatherTravelFactor <= 1.10
1.00 <= weatherServiceFactor <= 1.08
```

The transformation should remain simple, deterministic, bounded and documented.

The system must describe the result as a modelled timing adjustment, not as proof that a specific amount of precipitation caused a precise delay.

## Combined travel factor

Traffic and weather travel effects can compose multiplicatively, but the result is capped.

Conceptually:

```ts
const effectiveTravelFactor = clamp(
  trafficTravelFactor * weatherTravelFactor,
  0.95,
  1.25,
)
```

Approved combined guardrail:

```text
0.95 <= effectiveTravelFactor <= 1.25
```

The cap and the uncapped component factors must remain available in provenance so the transformation is inspectable.

## Service time remains separate

Travel effects and stop-service effects must not be collapsed into one opaque duration multiplier.

Conceptually:

```text
road travel duration
      ↓
traffic factor × weather travel factor
      ↓
effective travel duration

base service duration
      ↓
weather service factor
      ↓
effective service duration
```

This preserves explainability in metrics and future debugging.

## Context failure semantics

Missing or failed context must never be represented as a fabricated zero observation.

Examples:

```text
weather source unavailable
→ precipitationMm = null
→ status = unavailable
```

not:

```text
weather source unavailable
→ precipitationMm = 0
```

If a generation-time context source is unavailable, the run may use an explicitly documented neutral fallback factor where the implementation plan permits it. The provenance must include a fallback reason.

Example:

```text
status: unavailable
travel factor used: 1.00
fallback reason: source unavailable during generation
```

## Freeze factors used by the run

A published run must preserve the exact operational factors that affected its scenario.

The browser must not need the richer context artifact in order to reproduce the simulation.

Conceptually, the `OperationalRun` provenance/context summary includes at least:

```text
candidatePoolVersion
trafficTravelFactor
weatherTravelFactor
weatherServiceFactor
effectiveTravelFactor
source/input version references
```

This creates the distinction:

```text
OperationalRun
= immutable model execution record

context artifact
= richer explanation/evidence metadata for the UI
```

If the optional context artifact becomes unavailable later, the run remains reproducible.

## Context artifact

V0.6 may publish a richer context artifact per run, for example:

```text
cordoba-2026-08-31-v3.context.json
```

It can contain:

- traffic intensity and source metadata,
- weather variables,
- source/data-as-of timestamps,
- evidence state,
- limitations,
- candidate-pool/GTFS reference metadata,
- human-readable explanation of derived factors.

The context artifact is optional for runtime operation but should be present for normal V0.6 checked-in runs.

## Manifest V2

V0.6 evolves the operational manifest from a run-only pointer into an operational bundle catalog.

Conceptual contract:

```ts
interface OperationalRunManifestEntryV2 {
  id: string
  targetDate: string
  issuedAt: string
  dataAsOf: string
  mode: OperationalRunMode
  scenarioId: ScenarioId
  modelVersion: string
  artifact: string
  routeArtifact: string
  contextArtifact?: string
}

interface OperationalRunManifestV2 {
  schemaVersion: 2
  runs: OperationalRunManifestEntryV2[]
}
```

Example:

```json
{
  "id": "cordoba-2026-08-31-v3",
  "targetDate": "2026-08-31",
  "issuedAt": "2026-08-30T00:00:00-03:00",
  "dataAsOf": "2026-08-30T00:00:00-03:00",
  "mode": "FORECAST",
  "scenarioId": "cordoba-calibrated",
  "modelVersion": "fleetflow-v0.6",
  "artifact": "./generated/cordoba-2026-08-31-v3.json",
  "routeArtifact": "./generated/cordoba-2026-08-31-v3.routes.geojson",
  "contextArtifact": "./generated/cordoba-2026-08-31-v3.context.json"
}
```

Exact vintage naming may differ, but every V0.6 entry must resolve its own route artifact.

## Operational bundle

The runtime unit becomes a validated bundle rather than independent state pieces.

Conceptually:

```ts
interface OperationalBundle {
  manifestEntry: OperationalRunManifestEntryV2
  run: OperationalRun
  routes: RouteGeometryCollection
  context?: OperationalContextArtifact
}
```

The simulation engine still receives:

```text
bundle.run.scenario
```

This keeps bundle/catalog concerns outside the engine.

## Artifact binding

Filenames alone are insufficient proof that artifacts belong together.

Per-run route geometry and context artifacts should carry binding metadata such as:

```text
runId
targetDate
modelVersion
```

For route GeoJSON, this can be collection-level metadata.

Required cross-validation includes:

```text
manifest entry id = run.id
manifest targetDate = run.targetDate
manifest modelVersion = run.modelVersion
route metadata runId = run.id
route metadata targetDate = run.targetDate
route metadata modelVersion = run.modelVersion
```

If context is present, its binding metadata must also match.

A future implementation may add hashes if useful, but V0.6 does not require cryptographic content addressing as long as identity and structural validation are strong.

## Route validation

Existing route validation semantics must remain strict.

For every valid V0.6 bundle:

```text
scenario.routes.length = 8
route GeoJSON features.length = 8
```

and for each vehicle:

```text
route.truckId = geometry feature truckId
waypointDistancesKm.length = route.stops.length + 2
waypoint distances are finite and non-decreasing
total route distance > 0
```

The runtime must not silently adapt mismatched geometry to a scenario.

## Required versus optional artifacts

For V0.6:

```text
run artifact        REQUIRED
route artifact      REQUIRED
context artifact    OPTIONAL
```

If the run or matching route geometry is invalid/unavailable, that operational date is unavailable.

If only the richer context artifact is unavailable, the operational date remains playable because the factors used by the run were frozen in the run.

## Atomic date switching

Changing the operational date must be an atomic transition.

The current valid bundle remains the rendered state until the newly selected bundle has been loaded and validated.

Conceptual sequence:

```text
select next date
      ↓
set pending selection/loading state
      ↓
load run
      ↓
load route artifact
      ↓
load optional context artifact
      ↓
validate cross-artifact bundle
      ↓
construct next OperationalBundle
      ↓
one state commit
      ↓
reset/restart simulation for new bundle
```

The UI must never transiently show Friday package metrics with Thursday route geometry.

### Failure during date switch

If the requested next bundle fails validation:

```text
requested date → unavailable
current valid bundle → remains active
```

The previous map should not be destroyed merely because the next request failed.

This is an intentional improvement over clearing `activeRun` and `routes` as separate pieces before the next run has validated.

## Manifest V1 compatibility

V0.6 must preserve V0.5 historical behavior.

Runtime validation/catalog code should intentionally support:

```text
schemaVersion 1 → V0.5 legacy run resolution
schemaVersion 2 → V0.6 operational bundle resolution
```

Historical V0.5 artifacts must not be rewritten simply to satisfy the new V0.6 contract.

For legacy V0.5 entries, the existing scenario-level route asset remains the source of geometry.

For V0.6 entries, `routeArtifact` on the manifest entry is authoritative.

## Scenario registry boundary

The scenario registry continues to define scenario families/configuration, not individual operating dates.

Do not add every date as a registry scenario.

Conceptually:

```text
Scenario Registry
→ what model/family is this?

Operational Manifest
→ what immutable run bundle represents this date?
```

This boundary is required to keep date proliferation out of static application configuration.

## Recommended artifact layout

Keep the current simple folder structure unless implementation reveals a compelling reason to nest further:

```text
public/data/operational-runs/
├── manifest.json
└── generated/
    ├── cordoba-2026-08-31-v3.json
    ├── cordoba-2026-08-31-v3.routes.geojson
    ├── cordoba-2026-08-31-v3.context.json
    ├── cordoba-2026-09-01-v3.json
    ├── cordoba-2026-09-01-v3.routes.geojson
    └── cordoba-2026-09-01-v3.context.json
```

Candidate-pool/reference artifacts may live under a separate focused directory if that makes provenance clearer, for example:

```text
public/data/reference/
└── cordoba-delivery-pool-v1.json
```

The implementation plan should choose the smallest coherent layout while preserving version boundaries.

## UI design

V0.6 should make daily operational differences immediately visible without turning the map into a dashboard background.

The existing broad hierarchy remains:

```text
map = primary visual surface
right operations panel = compact operational summary
```

No large new floating cards should cover the map.

## Daily KPI hierarchy

The primary daily KPIs should emphasize:

```text
packages
deliveries
distance
operation span
```

A secondary line may show:

```text
8 vehicles · packages per delivery
```

Avoid adding a large KPI wall.

## Daily context UI

Add a compact `Contexto de jornada` block near the existing operational explainer/fleet panel.

Conceptual compact state:

```text
CONTEXTO DE JORNADA

Traffic      HIGH       ×1.16
Weather      Rain       ×1.04
Transit      GTFS       spatial proxy

MODELLED · REFERENCE
```

Expanded details can show source, data-as-of, factor, evidence state and limitations.

Methodology/provenance detail belongs in an expandable or secondary level so the map remains dominant.

## Fleet panel package semantics

The existing fleet panel already has access to route planned stops and snapshot remaining cargo.

V0.6 should show both original planned package load and remaining package load per truck.

Conceptually:

```text
TRUCK 03

9 deliveries
21 planned packages

5 / 9 deliveries completed
12 / 21 packages remaining
```

Do not duplicate planned package totals in the domain model if they can be derived from route stop cargo.

Required derivations:

```text
plannedPackages(truck)
=
Σ packageCount across route.stops

remainingPackages(truck)
=
snapshot.remainingCargo.packageCount
```

The same source-of-truth rule applies to delivery counts.

## Map behaviour

Only the active destinations for the selected run are displayed.

The full candidate pool is model infrastructure and should not be rendered by default.

For example:

```text
candidate pool = 240
active run destinations = 57
map displays = 57 delivery destinations
```

Truck IDs remain stable while route geometry changes by day.

This creates the intended visual semantics:

```text
fleet identity    stable
operational day   variable
```

## Delivery-point details

Delivery point details should remain neutral and synthetic.

A popup may show:

```text
Entrega 087
Truck 05
3 packages
planned time window
current status
Synthetic destination
FleetFlow V0.6
```

Do not imply that a point is a GTFS stop merely because GTFS influenced the candidate-pool weighting.

## Operational explainer

The existing `OperationalExplainer` should evolve to summarize the V0.6 run in plain operational language.

Conceptual content:

```text
FRIDAY · HIGH DEMAND

118 packages
64 synthetic destinations
8 vehicles

Demand
Amazon-derived weekly profile

Spatial distribution
Córdoba GTFS reference proxy

Operational timing
bounded traffic + weather model
```

Epistemic labels such as `SIMULATED`, `MODELLED` and `REFERENCE` should remain visible but compact.

## UI loading and failure semantics

During a date change, the previous valid map may remain visible in a visually pending/dimmed state while the new bundle loads.

If the new bundle validates, all operational surfaces switch together:

```text
points
routes
packages
KPIs
context
fleet cards
clock
```

If the new run/routes fail, show a clear unavailable message and keep the prior valid bundle active.

If only optional context fails, load the operation and show context as unavailable while still exposing the frozen factors used by the run.

## Testing strategy

V0.6 is implemented with TDD.

Every behaviour-changing task begins with a failing test that demonstrates the intended contract before production code is changed.

The existing V0.5 test suite remains a regression net and must stay green.

### Operational bundle tests

Required cases include:

```text
valid V2 run + matching routes → valid bundle
run Friday + routes Thursday → reject
missing required routeArtifact → reject
route waypoint count mismatch → reject
context absent → operation remains valid
context malformed/unavailable → operation remains valid with unavailable context
failed next-date bundle → previous valid bundle remains active
```

### Spatial-demand generator tests

Required cases include:

```text
same date + same inputs → identical result
different dates → active destination sets differ
45 <= active destination count <= 65
active candidate IDs unique
truck count = 8
every truck has at least one stop
each destination assigned exactly once
Σ stop packages = daily package target
vehicle capacity semantics valid
```

### Route artifact tests

Required cases include:

```text
one route feature per truck
route feature IDs/truck IDs match scenario routes
waypointDistancesKm.length = stops + 2
waypoint distances finite and non-decreasing
route artifact binding metadata matches run
```

### Context tests

Required guardrail tests:

```text
0.95 <= trafficTravelFactor <= 1.20
1.00 <= weatherTravelFactor <= 1.10
1.00 <= weatherServiceFactor <= 1.08
0.95 <= effectiveTravelFactor <= 1.25
```

Required semantic tests:

```text
unavailable weather → null observation values, not fake zeros
unavailable traffic → explicit unavailable status
GTFS can affect spatial weight
GTFS cannot alter daily package target
context failure cannot silently mutate unrelated tracks
factors stored in the run reproduce the run without the optional context artifact
```

### Daily-variation tests

The behaviour that motivated V0.6 must have direct regression coverage:

```text
Thursday.activeStoreIds != Friday.activeStoreIds
Thursday route geometry/binding != Friday route geometry/binding
```

while regeneration remains stable:

```text
Thursday generation #1 = Thursday generation #2
```

### UI tests

Required UI coverage includes:

- planned package count per truck,
- remaining package count per truck,
- completed/total deliveries per truck,
- compact context summary,
- evidence labels,
- optional-context unavailable state,
- atomic date switching,
- no stale previous-day geometry after successful switch,
- previous valid bundle retained after failed switch,
- V0.5 legacy timeline remains usable.

## Delivery slicing

V0.6 should be implemented in three incremental PRs rather than one large change.

### PR 1 — Operational Bundle Foundation

Purpose: establish artifact integrity and atomic loading before changing geography.

Expected scope:

- manifest V2 contracts,
- V1/V2 validation,
- per-run `routeArtifact`,
- optional `contextArtifact`,
- `OperationalBundle`,
- cross-artifact binding validation,
- atomic bundle loading/switching,
- retain prior valid bundle on failure,
- legacy V0.5 compatibility.

The initial PR may continue using the current fixed geography so bundle infrastructure can be tested independently.

### PR 2 — Daily Spatial Demand

Purpose: introduce actual daily geographic variation.

Expected scope:

- candidate-pool artifact and validation,
- GTFS-derived spatial weights/provenance,
- deterministic 45–65 active destination selection,
- removal of fixed V0.6 stop counts,
- eight-truck deterministic assignment,
- planned package allocation,
- deterministic stop ordering,
- per-run road-route preparation,
- checked-in daily V0.6 route artifacts,
- generator reproducibility/variation tests.

### PR 3 — Córdoba Operational Context + UI

Purpose: make public/modelled context affect timing transparently and expose the richer operation in the control tower.

Expected scope:

- traffic context adapter/profile,
- weather context adapter/profile,
- GTFS context metadata,
- evidence/status/provenance contracts,
- bounded timing factors,
- context artifacts,
- `Contexto de jornada`,
- planned/remaining packages per truck,
- daily KPI improvements,
- V0.6 operational explainer,
- failure semantics and UI tests.

Each PR must leave `main` functional and maintain existing regression coverage.

## Compatibility requirements

V0.6 must not rewrite or invalidate historical V0.5 artifacts.

Required compatibility properties:

- existing V0.5 JSON artifacts remain immutable,
- manifest V1 parsing remains supported,
- legacy scenario-level route geometry remains supported for V0.5,
- existing static scenarios remain usable,
- existing simulation engine contracts remain valid,
- existing calibrated scenario tests remain green,
- V0.6 code paths do not silently reinterpret V0.5 runs as variable-geography runs.

## Data/source documentation

Any public Córdoba source incorporated into generation must be recorded in the repository data/license/provenance documentation as appropriate.

For every incorporated source/reference, documentation should capture at least:

- source/provider name,
- dataset/reference name,
- access or snapshot date,
- license/usage notes where applicable,
- exactly how FleetFlow uses it,
- exactly what FleetFlow does not claim from it.

In particular, documentation must say explicitly that GTFS is used as a spatial proxy and not as observed parcel demand.

## Machine learning boundary

Machine learning is intentionally deferred from V0.6.

V0.6 first establishes a deterministic, inspectable data-generation and operational-context pipeline. This creates a much stronger future base for ML because later experiments can compare learned predictions against a stable baseline and versioned artifacts.

Adding ML now would make it unnecessarily difficult to attribute a changed result to:

```text
demand
spatial selection
routing
traffic
weather
or a learned model
```

A future milestone can add ML as a separate optional layer without changing the evidentiary meaning of V0.6 historical runs.

## Definition of Done

FleetFlow V0.6 is complete when selecting different operational dates can load immutable, validated and reproducible bundles that exhibit materially different daily logistics while preserving the existing simulation engine.

For each V0.6 day:

- exactly 8 vehicles are present,
- 45–65 synthetic destinations are active,
- active destination locations can differ from other dates,
- package allocation varies by truck,
- all packages reconcile exactly to the daily package target,
- per-run route geometry corresponds to the selected destinations,
- traffic and weather can affect timing only through documented bounded factors,
- GTFS affects only spatial weighting/reference semantics,
- provenance identifies the model/input vintages used,
- optional context failure does not corrupt the simulation,
- run/route mismatch fails closed,
- changing dates is atomic,
- a failed new selection preserves the last valid operation,
- V0.5 historical runs remain compatible,
- all existing and new tests pass,
- production build passes.

The intended causal flow of the product is:

```text
operational date
      ↓
daily demand
      ↓
active synthetic destinations
      ↓
truck allocation
      ↓
road-following route geometry
      ↓
bounded traffic/weather timing context
      ↓
reproducible operational outcome
```

The milestone succeeds when the user can move through the timeline and immediately see that each date represents a different operational plan, while still being able to explain exactly how that plan was produced and what evidence class each input represents.
