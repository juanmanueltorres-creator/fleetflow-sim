# FleetFlow V0.5 — Operational Timeline Foundation

## Status

Approved architecture, written after design review on 2026-08-30. Awaiting final user review before implementation planning.

## Goal

FleetFlow V0.5 adds a temporal operating model above the existing V0.4 scenario engine so users can select a target date and replay a reproducible operational run for that day.

The product evolves from a single calibrated Córdoba simulation into a date-aware control-tower foundation with:

- past synthetic runs,
- a current target-date run,
- future forecast runs,
- immutable run artifacts,
- explicit issuance and data-as-of timestamps,
- deterministic generation,
- a compact timeline/date rail integrated into the existing HUD.

V0.5 is intentionally the temporal foundation only. It does not yet add live weather, live traffic, incidents, OR-Tools, GPS telemetry, backend persistence, or real observed operations.

## Product principle

FleetFlow must preserve the distinction between:

1. **when a run is about** (`targetDate`),
2. **when the run was issued** (`issuedAt`),
3. **how fresh the inputs were** (`dataAsOf`), and
4. **what kind of evidence the run represents** (`mode`).

The system must never imply that a synthetic or calibrated run is observed reality.

A published operational run is immutable. If the same target date is recomputed later, FleetFlow creates a new run/vintage rather than overwriting the earlier one.

## V0.4 compatibility

V0.5 must preserve the V0.4 simulation contracts and reuse the current engine.

The current `FleetScenario` remains the payload consumed by:

```text
getFleetSnapshot()
deriveFleetMetrics()
FleetMap
FleetPanel
KpiPanel
```

V0.5 introduces a temporal layer above `FleetScenario`; it does not make the simulation engine itself date-aware.

Conceptually:

```text
Scenario Definition
       ↓
Operational Run Catalog
       ↓
selected OperationalRun
       ↓
OperationalRun.scenario
       ↓
existing V0.4 simulation engine
       ↓
Snapshot + KPIs + Map + Fleet
```

This keeps the core engine isolated and minimizes regression risk.

## Scope

### In scope

- new `OperationalRun` domain contract,
- new operational-run manifest/catalog,
- deterministic date-based run generation,
- immutable generated run artifacts,
- compact date rail / timeline selector,
- switching between available run dates,
- past `SIMULATED` and future `FORECAST` semantics,
- operational timezone fixed to Córdoba,
- runtime validation of run metadata and nested scenario data,
- initial checked-in multi-day run window,
- regression tests for determinism, geography stability, run switching and stale-state prevention.

### Out of scope

- live GPS / IoT telemetry,
- real driver identities,
- backend/database persistence,
- automatic daily GitHub Actions generation,
- weather providers,
- live traffic providers,
- traffic incidents,
- failed deliveries,
- driver absences,
- vehicle breakdowns,
- dynamic reassignment,
- rolling-horizon replanning,
- OR-Tools optimization,
- real observed Córdoba delivery data,
- fake `OBSERVED` records,
- dynamic daily road-network generation,
- changing the number of vehicles or stops by date,
- a full calendar application,
- a large visual redesign of the V0.4 control tower.

## Operational run model

Introduce the following conceptual contract:

```ts
type OperationalRunMode =
  | 'FORECAST'
  | 'SIMULATED'
  | 'OBSERVED'
  | 'WHAT_IF'

interface OperationalRunProvenance {
  generator: string
  seed: string
  notes: string[]
}

interface OperationalRun {
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
```

`OBSERVED` and `WHAT_IF` belong to the long-term contract but V0.5 initial artifacts use only `SIMULATED` and `FORECAST`.

### Field semantics

#### `targetDate`

Operational date represented by the run, formatted as `YYYY-MM-DD`.

#### `issuedAt`

Timestamp at which this specific run/vintage was issued. It must be explicit input to offline generation; the generator must not silently use `Date.now()` for a committed artifact.

#### `dataAsOf`

Timestamp describing the latest information assumed by the run. In V0.5 seeded runs this is metadata, not a claim that live feeds were queried.

#### `mode`

Evidence class of the artifact:

- `SIMULATED`: synthetic/calibrated replay; not observed reality.
- `FORECAST`: future operational projection generated from the current calibrated model.
- `OBSERVED`: reserved for future evidence-backed real observations.
- `WHAT_IF`: reserved for future counterfactual scenarios.

The mode is immutable metadata. A run originally issued as `FORECAST` remains `FORECAST` even after its target date passes.

## Operational timezone

FleetFlow V0.5 uses:

```text
America/Argentina/Cordoba
```

as its operational timezone.

The UI label `TODAY` is derived relative to the current date in this timezone, not the viewer's browser timezone.

This avoids a Córdoba run changing apparent day semantics because the visitor is located in another country.

No additional date library is required for V0.5; browser `Intl` APIs are sufficient.

## Catalog and artifact storage

Runtime operational data should remain outside the main JavaScript bundle.

Recommended structure:

```text
public/data/operational-runs/
├── manifest.json
└── generated/
    ├── cordoba-2026-08-27-v1.json
    ├── cordoba-2026-08-28-v1.json
    ├── cordoba-2026-08-29-v1.json
    ├── cordoba-2026-08-30-v1.json
    ├── cordoba-2026-08-31-d1-v1.json
    ├── cordoba-2026-09-01-v1.json
    ├── cordoba-2026-09-02-v1.json
    └── cordoba-2026-09-03-v1.json
```

Runtime TypeScript for loading and validation should live under a focused application module such as:

```text
src/scenario/operationalRuns/
├── types.ts
├── validation.ts
├── catalog.ts
└── date.ts
```

Exact filenames may vary if implementation reveals a simpler fit, but the data/code boundary must remain clear.

## Manifest contract

The manifest is the single runtime authority for which runs are available.

Conceptual shape:

```ts
interface OperationalRunManifestEntry {
  id: string
  targetDate: string
  issuedAt: string
  dataAsOf: string
  mode: OperationalRunMode
  scenarioId: ScenarioId
  modelVersion: string
  artifact: string
}

interface OperationalRunManifest {
  schemaVersion: 1
  runs: OperationalRunManifestEntry[]
}
```

Example:

```json
{
  "schemaVersion": 1,
  "runs": [
    {
      "id": "cordoba-2026-08-30-v1",
      "targetDate": "2026-08-30",
      "issuedAt": "2026-08-30T00:00:00-03:00",
      "dataAsOf": "2026-08-30T00:00:00-03:00",
      "mode": "SIMULATED",
      "scenarioId": "cordoba-calibrated",
      "modelVersion": "fleetflow-v0.5",
      "artifact": "./generated/cordoba-2026-08-30-v1.json"
    },
    {
      "id": "cordoba-2026-08-31-d1-v1",
      "targetDate": "2026-08-31",
      "issuedAt": "2026-08-30T21:00:00-03:00",
      "dataAsOf": "2026-08-30T21:00:00-03:00",
      "mode": "FORECAST",
      "scenarioId": "cordoba-calibrated",
      "modelVersion": "fleetflow-v0.5",
      "artifact": "./generated/cordoba-2026-08-31-d1-v1.json"
    }
  ]
}
```

The browser must not synthesize a run for a date absent from the manifest.

Missing or invalid runs fail closed with an unavailable state.

## Immutable run artifacts

Each run artifact is a complete self-contained `OperationalRun`, including its nested `FleetScenario`.

V0.5 deliberately does not implement delta compression or patch chains.

The existing calibrated scenario is about 29 KB, so the initial eight-run window is small enough that full snapshots are preferable to a more complex storage format.

Benefits:

- old runs remain auditable,
- generator changes cannot silently mutate historical output,
- individual runs can be reviewed directly in Git,
- runtime loading remains simple,
- no migration/replay dependency is required to open an older artifact.

### Immutability rule

A committed run must never be overwritten to represent a newer forecast.

For example:

```text
cordoba-2026-08-31-d2-v1.json
cordoba-2026-08-31-d1-v1.json
cordoba-2026-08-31-0600-v1.json
```

may all eventually coexist.

V0.5 initially ships one canonical vintage per target date, but run IDs and the manifest contract already support multiple vintages.

## Initial run window

The initial V0.5 demonstration window is:

```text
2026-08-27  SIMULATED
2026-08-28  SIMULATED
2026-08-29  SIMULATED
2026-08-30  SIMULATED
2026-08-31  FORECAST
2026-09-01  FORECAST
2026-09-02  FORECAST
2026-09-03  FORECAST
```

Past entries remain explicitly synthetic/calibrated. They are not backfilled as `OBSERVED`.

Future entries are model forecasts, not claims about a real Córdoba logistics operator.

The initial window is checked in. Automatic daily extension is deferred.

## Default run selection

When the calibrated scenario is active:

1. if the manifest contains the current Córdoba operational date, select its preferred canonical run;
2. otherwise select the latest available run on or before the operational date;
3. if all available runs are future relative to the operational date, select the earliest available run;
4. if no valid run exists, show the unavailable state and do not create a synthetic browser fallback.

If multiple vintages for one date exist in the future, a later milestone may add explicit vintage selection. V0.5 manifest ordering/selection must be deterministic and document one preferred canonical run per date.

## Relationship to scenario registry

The existing scenario registry remains responsible for scenario-level configuration and provenance.

V0.5 initially enables the timeline for:

```text
cordoba-calibrated
```

The legacy Coca Coqui V0 scenario remains static and switchable exactly as today.

Conceptually, `ScenarioDefinition` may gain optional timeline metadata:

```ts
interface ScenarioDefinition {
  // existing fields...
  operationalRuns?: {
    manifestUrl: string
  }
}
```

This is only a conceptual shape; implementation may use an equivalent focused registry.

### Legacy behavior

When `coca-coqui-legacy` is active:

- the date rail is hidden or clearly unavailable,
- the existing legacy `FleetScenario` remains the simulation source,
- V0.4 behavior and semantics remain unchanged.

When switching back to `cordoba-calibrated`, FleetFlow restores the selected/default valid operational run and resets simulation state.

## Date rail UX

The existing connected control-tower frame remains the primary UI.

Add a compact horizontal date rail integrated with the top HUD, for example:

```text
‹  29 AGO    30 AGO    [31 AGO]    01 SEP    02 SEP  ›
 SIMULATED   TODAY      FORECAST    FORECAST    FORECAST
```

The date rail is not a large month calendar.

The selected run should also expose concise metadata near the simulation clock:

```text
31 AGO 2026
FORECAST · issued 30 AGO 21:00
```

### `TODAY` semantics

`TODAY` is a relative UI hint based on `targetDate` versus the current Córdoba date.

It must not replace or mutate the evidence mode.

For example:

```text
FORECAST  ← immutable run mode
TODAY     ← current temporal relation
```

can coexist.

### Accessibility

- date entries must be keyboard reachable,
- selected date uses an accessible state such as `aria-current` or equivalent,
- labels include full date and run mode,
- arrows/buttons have descriptive names,
- mode must not be conveyed only by color.

## Date-switch behavior

Selecting a different operational run must behave atomically from the user's perspective.

Sequence:

```text
select run
   ↓
pause simulation
   ↓
reset simulationMinute = 0
   ↓
clear stale runtime/run state
   ↓
load + validate OperationalRun
   ↓
resolve existing route asset
   ↓
validate geometry against run.scenario
   ↓
create snapshot and metrics
   ↓
render map + KPIs + fleet together
```

No previous-date truck snapshot, popup, KPI, selected marker, or route state may remain visible after the run changes.

Loading state copy may be:

```text
Loading operational run…
```

Invalid/missing run copy may be:

```text
Operational run unavailable.
```

The implementation should preserve the existing route loading error behavior where possible rather than introduce overlapping error systems.

## Daily generation model

V0.5 reuses the V0.4 Amazon-derived calibration profile and the existing calibrated-scenario generator logic.

The implementation should not fork the operational sampling logic into a second unrelated generator.

A targeted extraction/shared generator module is preferred if necessary so both the V0.4 base command and V0.5 run generation call the same core behavior.

Conceptual offline pipeline:

```text
Amazon-derived calibration profile
          +
existing Córdoba route geometry
          +
targetDate
          +
explicit issuedAt/dataAsOf
          +
modelVersion
          ↓
deterministic operational RNG
          ↓
FleetScenario
          ↓
OperationalRun
          ↓
validate
          ↓
write immutable JSON artifact
          ↓
update/validate manifest
```

No raw third-party dataset is required at runtime.

## Seed strategy

A run's operational seed is derived from stable explicit text such as:

```text
fleetflow:v0.5:cordoba:2026-08-31
```

The generator must continue to separate operational randomness from geography randomness.

Conceptually:

```text
fleetflow:v0.5:cordoba:2026-08-31:operations
fleetflow:v0.4:cordoba:stable-geography
```

The exact stable string may differ, but these invariants are required:

- same target date + same model version + same explicit generation inputs => identical run output,
- changing the target date changes operational sampling,
- changing the target date does not move Córdoba delivery coordinates in V0.5.

## Geography stability

V0.5 intentionally freezes spatial topology.

Constant across daily runs:

- depot position,
- 60 delivery locations,
- delivery IDs,
- 8 vehicle IDs,
- route geometry IDs,
- vehicle-to-route topology,
- road-following GeoJSON route assets.

V0.5 does not call OSRM or another router for each target date.

This preserves visual continuity and isolates the temporal milestone from future spatial-demand and optimization work.

## Daily operational variation

Daily runs vary deterministic operational attributes while keeping geography fixed.

### Variable in V0.5

- total package demand,
- packages per stop,
- package volume,
- service duration,
- time-window sampling,
- departure offsets,
- sampled travel-time component,
- return time,
- vehicle capacity/utilization where required to safely carry assigned volume,
- derived journey duration and KPIs.

### Fixed in V0.5

- exactly 8 vehicles,
- exactly 60 delivery locations,
- stop coordinates,
- route geometry,
- route ownership/topology,
- depot,
- road network.

## Daily demand profile

V0.4 currently targets exactly 100 packages.

V0.5 replaces the fixed target with a deterministic bounded daily-demand factor around the calibrated baseline.

The initial model must be explicitly labeled synthetic/calibrated. It must not claim that weekday demand or real Córdoba parcel volume is known.

Recommended behavior:

```text
baselinePackages = 100
bounded seeded multiplier ≈ 0.90–1.18
```

The implementation may use a similarly conservative range if validation/testing reveals a better bounded interval.

The design requirement is that:

- daily totals visibly vary,
- every stop still receives valid positive parcel demand,
- generated routes remain within vehicle capacity,
- variation is plausible rather than extreme,
- same date/seed remains reproducible.

A future demand provider may replace this seeded factor with calendar, historical-demand, weather, promotion, event, or customer-order inputs without changing the `OperationalRun` contract.

## Timing rules

V0.5 continues to use the V0.4 physical timing guard:

```text
planned travel time >= minimum travel time implied by route distance at MAX_TRAVEL_SPEED_KMH
```

A date-specific run may sample a longer travel time than another date, but it must not become physically impossible solely because the sampled operational distribution is shorter than the route geometry requires.

Service times and time windows remain calibrated/synthetic planning values.

## Runtime validation

Introduce `validateOperationalRun()` and manifest validation.

Validation must compose with the existing `validateScenario()` rather than duplicate scenario rules.

At minimum, `validateOperationalRun()` rejects:

- empty or malformed run ID,
- invalid `targetDate`,
- non-existent calendar dates such as `2026-02-30`,
- invalid `issuedAt`,
- invalid `dataAsOf`,
- `dataAsOf` later than `issuedAt`,
- unknown run mode,
- empty model version,
- invalid scenario ID,
- empty generator/seed provenance,
- manifest metadata inconsistent with loaded artifact metadata,
- nested `FleetScenario` failing `validateScenario()`.

Manifest validation rejects at minimum:

- unsupported schema version,
- duplicate run IDs,
- duplicate artifact paths,
- malformed entries,
- entries that resolve outside the expected operational-run data root,
- an artifact that cannot be loaded,
- an artifact whose `id`/date/mode/scenario/model metadata does not match its manifest entry.

All failures are fail-closed.

## Determinism and golden stability

The generator must accept all values needed for a committed run explicitly.

It must not make a committed artifact depend on:

- wall-clock time,
- random system entropy,
- browser locale,
- viewer timezone,
- network responses.

At least one canonical golden run (recommended target date `2026-08-31`) must be protected by a regression fixture/hash or equivalent exact-output assertion.

If future generator work intentionally changes the model, it must bump the relevant model/generator version rather than silently rewriting the old golden output.

## Initial generation command

Implementation should provide one reviewable offline command capable of generating a date or date range.

Conceptually:

```text
npm run generate:operational-runs -- \
  --from 2026-08-27 \
  --to 2026-09-03 \
  --issued-at 2026-08-30T21:00:00-03:00
```

Exact CLI flags may be adjusted in the implementation plan, but committed outputs must be generated deterministically and reproducibly.

The command must not require raw Amazon data; it should consume the already-derived calibration profile and checked-in route asset.

## Browser loading model

The browser should:

1. load the compact manifest,
2. validate and index available entries,
3. select a default entry,
4. fetch only the selected run artifact,
5. validate it,
6. reuse the existing calibrated route GeoJSON,
7. construct the V0.4 snapshot/metrics/map from `run.scenario`.

Do not eagerly import all run JSON files into the Vite main bundle.

This is especially important because V0.4 already has a large JavaScript bundle warning; the temporal feature should not unnecessarily worsen initial bundle size.

## Scenario/run state boundaries in `App`

V0.5 should make the active simulation source explicit.

For calibrated Córdoba:

```text
active ScenarioDefinition
       ↓
active OperationalRun
       ↓
activeScenario = run.scenario
```

For legacy:

```text
active ScenarioDefinition
       ↓
activeScenario = definition.scenario
```

The implementation may extract this orchestration from `App.tsx` if that makes the state transitions easier to test, but unrelated UI refactoring is out of scope.

Run change and scenario change must both:

- pause playback,
- reset simulation time,
- clear stale route/runtime state,
- trigger a complete coherent reload.

## Testing requirements

### Operational-run domain

- valid `SIMULATED` run passes,
- valid `FORECAST` run passes,
- malformed dates fail,
- non-existent calendar dates fail,
- malformed timestamps fail,
- `dataAsOf > issuedAt` fails,
- invalid mode fails,
- missing/empty provenance seed fails,
- nested invalid scenario fails.

### Manifest

- valid manifest passes,
- duplicate run IDs fail,
- duplicate artifact paths fail,
- unsupported schema version fails,
- malformed metadata fails,
- manifest/artifact identity mismatch fails,
- unavailable artifact fails closed.

### Generator determinism

- same date + same explicit inputs => exact same run,
- different target dates => at least one operational field differs,
- geography remains identical across different target dates,
- route geometry IDs remain identical,
- every generated run passes `validateOperationalRun()`,
- every nested scenario passes existing scenario validation,
- package/capacity constraints remain valid,
- physical travel-time guard remains valid.

### Golden regression

- canonical `2026-08-31` run remains byte-equivalent or hash-equivalent for the same model version and inputs.

### Date selection UI

- calibrated timeline loads a default run,
- date rail renders only manifest-backed dates,
- selecting a run pauses simulation,
- selecting a run resets simulation minute to zero,
- selected run updates map, KPIs and fleet consistently,
- stale popup/marker/snapshot state does not survive run change,
- unavailable run shows fail-closed UI,
- `TODAY` is computed in Córdoba timezone,
- run mode is preserved independently from `TODAY`.

### Scenario switching regression

- calibrated remains the default scenario,
- timeline is available in calibrated mode,
- switching to Legacy preserves V0.4 behavior,
- timeline is hidden/unavailable in Legacy,
- switching back to calibrated restores a valid run,
- no previous scenario/run data leaks across the switch.

### Existing regression suite

All existing V0.4 tests remain green.

Before merge:

```text
npm test
npm run build
```

must pass on the feature branch/PR.

After merge, main CI, route preparation checks and GitHub Pages deployment must succeed on the merged SHA.

## Error handling

FleetFlow must prefer a coherent unavailable state over partial mixed-date data.

Examples:

- manifest unavailable -> timeline unavailable; no browser-generated fake run,
- run artifact unavailable -> selected run unavailable; previous run must not masquerade as the newly selected date,
- invalid run -> reject before passing to engine,
- geometry mismatch -> reject before rendering map,
- legacy scenario -> continue to use current static path.

Errors should remain compact in the public UI and detailed in developer diagnostics where appropriate.

## Provenance and visible copy

V0.5 should continue the V0.4 provenance policy.

The calibrated Córdoba run may say:

> **FORECAST · ESCENARIO CALIBRADO**  
> Operación sintética reproducible derivada de distribuciones públicas de última milla. Ubicaciones y recorridos adaptados a Córdoba.

A historical synthetic run may say:

> **SIMULATED · ESCENARIO CALIBRADO**  
> Jornada sintética reproducible. No representa una operación real observada.

The UI must not claim:

- real Amazon operations in Córdoba,
- real Rappi/PedidosYa/Mercado Libre operations,
- real parcel demand for Córdoba,
- actual traffic conditions,
- observed SLA performance,
- actual driver telemetry.

## Future compatibility

The V0.5 contract should enable later milestones without implementing them now.

Expected evolution:

```text
V0.5
Operational timeline + immutable runs
        ↓
V0.6+
weather / traffic / calendar demand context
        ↓
forecast vintages + forecast evolution
        ↓
OBSERVED data adapters + planned vs actual
        ↓
incidents + service exceptions
        ↓
rolling-horizon replanning
        ↓
OR-Tools / optimization comparison
        ↓
live telemetry adapter
        ↓
full last-mile operations control tower
```

A future run may gain context such as:

```ts
context?: {
  demand?: unknown
  weather?: unknown
  traffic?: unknown
  incidents?: unknown
}
```

V0.5 must not create empty provider abstractions solely for this possibility. Future context is a compatibility direction, not current implementation scope.

## Research rationale

The architecture follows established operational concepts explored during V0.5 design research:

- rolling-horizon planning: plan, execute, receive new information, replan;
- forecast vintages: preserve what was known/forecast at different issuance times;
- control-tower architecture: combine current state, history, predictive state and exception handling;
- digital-twin style simulation: replay and compare operational scenarios without claiming the simulation is observed reality.

V0.5 implements only the storage, timing and playback foundation required for those future capabilities.

## Success criteria

FleetFlow V0.5 is successful when:

1. a visitor can select among multiple operational dates in Córdoba calibrated mode;
2. each selected date loads a validated immutable `OperationalRun`;
3. each run reproduces its own package/timing/utilization profile while using stable Córdoba geography;
4. the existing V0.4 engine, map, KPIs and fleet UI continue to operate without date-specific logic inside the engine;
5. past synthetic runs are visibly labeled `SIMULATED`;
6. future runs are visibly labeled `FORECAST`;
7. no run is presented as `OBSERVED` without real evidence;
8. switching dates is atomic and leaves no stale state;
9. the same generator inputs reproduce the same run exactly;
10. the initial eight-day window works entirely from checked-in static assets on GitHub Pages;
11. Legacy V0 remains intact and switchable;
12. all existing and new tests plus production build pass before merge.

## Implementation boundary

This design is complete enough for one implementation plan.

The implementation plan should decompose work into small TDD-safe steps, likely covering:

1. operational-run types and validation,
2. manifest validation/catalog,
3. deterministic shared generation core,
4. date-range run generator,
5. initial immutable run artifacts,
6. runtime loader/default selection,
7. date rail component,
8. `App` state transition integration,
9. provenance/date metadata presentation,
10. regression and final CI/Pages verification.

No implementation should begin until this written spec is reviewed and approved.
