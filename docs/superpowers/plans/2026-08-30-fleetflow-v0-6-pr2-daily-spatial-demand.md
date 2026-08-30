# FleetFlow V0.6 PR2 — Daily Spatial Demand Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish the first FleetFlow V0.6 daily operational runs with 45–65 deterministic synthetic Córdoba delivery destinations per day, variable per-truck load, per-run road-following routes, and a schema-V2 manifest while preserving V0.5 artifacts and the existing simulation engine.

**Architecture:** Add an offline Daily Spatial Demand pipeline around the existing `FleetScenario` model. A versioned synthetic candidate pool derived from Córdoba GTFS structure feeds deterministic daily selection, cargo generation, eight-truck assignment, logical stop ordering, road routing, and a shared V0.6 timing contract. The browser continues to consume validated `OperationalBundle`s; `src/simulation/*` remains unchanged.

**Tech Stack:** Node.js ESM generation scripts, TypeScript/React runtime, Vitest, GeoJSON, MapLibre, Turf utilities already in the repo, offline OSRM route preparation, GitHub Actions for reproducible artifact generation.

**Spec:** `docs/superpowers/specs/2026-08-30-fleetflow-v0-6-cordoba-operational-context-design.md`

## Global Constraints

- Fleet size is exactly 8 vehicles for every V0.6 run.
- Active delivery destinations are deterministic and bounded to `45 <= deliveryCount <= 65`.
- Daily package target remains the demand authority; package totals must be conserved exactly.
- GTFS is a spatial proxy only; candidate locations are synthetic and use neutral `Entrega NNN` labels.
- V0.6 model version is `fleetflow-v0.6`; generator version is `daily-spatial-demand-v1`; candidate pool version is `cordoba-delivery-pool-v1`.
- Random streams are separated by responsibility: `demand`, `spatial`, `operations`, and `assignment`.
- V0.5 `public/data/operational-runs/manifest.json` and existing V0.5 artifacts remain unchanged.
- PR2 publishes a separate schema-V2 manifest at `public/data/operational-runs/manifest-v0-6.json` and updates the Córdoba timeline registry to use it.
- PR2 does not add traffic/weather context factors; optional context remains omitted until the later context slice.
- No browser-side routing, backend, database, OR-Tools, ML, risk score, changing fleet size, or runtime optimizer.
- `src/simulation/engine.ts`, `src/simulation/clock.ts`, and the core snapshot semantics remain unchanged.
- Public route artifacts are immutable and bound to their run through `runId`, `targetDate`, and `modelVersion` metadata.
- Official GTFS reference for candidate-pool provenance: `https://gobiernoabierto.cordoba.gob.ar/data/datos-abiertos/categoria/transporte-urbano/gtfs-de-la-ciudada-de-cordoba/3319`.

---

## File Structure

New focused generation modules:

- `scripts/lib/route-preparation.mjs` — reusable road-route preparation previously embedded in the CLI.
- `scripts/lib/candidate-pool.mjs` — GTFS stop parsing, octant zoning, density weighting, deterministic candidate-pool creation.
- `scripts/generate-candidate-pool.mjs` — one-shot CLI for the versioned pool.
- `scripts/lib/daily-spatial-demand.mjs` — delivery-count model, weighted daily selection, cargo/service generation.
- `scripts/lib/daily-route-plan.mjs` — capacity-aware deterministic eight-truck assignment and nearest-neighbour stop ordering.
- `scripts/lib/v0-6-route-timing.mjs` — shared V0.6 departure/travel/service timing contract; this is the contract future What-If derivation must reuse.
- `scripts/generate-v0-6-operational-runs.mjs` — orchestration and immutable artifact publication.
- `src/scenario/operationalRuns/candidate-pool-v1.json` — checked-in derived synthetic candidate pool.
- `public/data/operational-runs/manifest-v0-6.json` — active V0.6 timeline manifest.
- `public/data/operational-runs/generated/*-v3.json` and `*.routes.geojson` — immutable V0.6 run bundles.

Existing files changed deliberately:

- `scripts/prepare-routes.mjs` — becomes a thin CLI wrapper over `route-preparation.mjs`.
- `scripts/lib/calibrated-scenario-generator.mjs` — only exports existing sampling helpers required by V0.6; V0.5 behavior must not change.
- `src/scenario/operationalRuns/types.ts` / `validation.ts` — add structured spatial-demand provenance.
- `src/scenario/scenarioRegistry.ts` — point Córdoba operational timeline to `manifest-v0-6.json`.
- `src/components/FleetPanel.tsx` — make planned and remaining package load simultaneously visible per truck.
- `package.json` — add explicit V0.6 generation commands.
- `DATA_LICENSES.md` / `README.md` — document GTFS proxy semantics, generation commands, and immutable vintages.

---

### Task 1: Extract reusable route preparation and V2 binding metadata

**Files:**
- Create: `scripts/lib/route-preparation.mjs`
- Modify: `scripts/prepare-routes.mjs`
- Test: `tests/routePreparationLib.test.ts`
- Regression: `tests/routeAssets.test.ts`

**Interfaces:**
- Consumes: a logical `FleetScenario`, an injectable `fetcher`, an OSRM base URL, and optional `{ runId, targetDate, modelVersion }` metadata.
- Produces: `routeDefinitionsFromScenario(scenario)` and `prepareRouteCollection({ scenario, fetcher, baseUrl, metadata })`.

- [ ] **Step 1: Write the failing route-preparation library tests**

Create `tests/routePreparationLib.test.ts` with a minimal two-stop parcel scenario and a fake OSRM response. Assert:

```ts
const collection = await prepareRouteCollection({
  scenario,
  fetcher,
  baseUrl: 'https://router.test',
  metadata: {
    runId: 'cordoba-2026-08-31-v3',
    targetDate: '2026-08-31',
    modelVersion: 'fleetflow-v0.6',
  },
})

expect(collection.metadata).toEqual({
  runId: 'cordoba-2026-08-31-v3',
  targetDate: '2026-08-31',
  modelVersion: 'fleetflow-v0.6',
})
expect(collection.features[0].properties.waypointDistancesKm).toHaveLength(4)
```

Also assert that omitted metadata produces the legacy collection shape with no `metadata` property and that missing OSRM step geometry rejects.

- [ ] **Step 2: Run RED**

Run:

```bash
npm test -- tests/routePreparationLib.test.ts
```

Expected: FAIL because `scripts/lib/route-preparation.mjs` does not exist.

- [ ] **Step 3: Move route-preparation logic into the focused library**

Implement and export:

```js
export function routeDefinitionsFromScenario(scenario) { /* current CLI logic */ }

export async function prepareRouteCollection({
  scenario,
  fetcher = fetch,
  baseUrl = 'https://router.project-osrm.org',
  metadata,
}) {
  const definitions = routeDefinitionsFromScenario(scenario)
  const features = []
  for (const definition of definitions) {
    features.push(await prepareRoute(definition, { fetcher, baseUrl }))
  }
  return {
    type: 'FeatureCollection',
    ...(metadata ? { metadata } : {}),
    features,
  }
}
```

Move `appendCoordinates`, `geometryLengthKm`, `buildGeometryFromLegs`, route-definition construction, and OSRM response validation without changing their semantics.

- [ ] **Step 4: Reduce `scripts/prepare-routes.mjs` to CLI parsing + library call**

Legacy invocation must still work. Scenario invocation must still write exactly one GeoJSON collection. Add optional CLI flags `--run-id`, `--target-date`, `--model-version`; require all three together or none.

- [ ] **Step 5: Run GREEN + regression**

Run:

```bash
npm test -- tests/routePreparationLib.test.ts tests/routeAssets.test.ts
npm run build
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add scripts/lib/route-preparation.mjs scripts/prepare-routes.mjs tests/routePreparationLib.test.ts tests/routeAssets.test.ts
git commit -m "refactor: expose reusable route preparation"
```

---

### Task 2: Build the versioned synthetic Córdoba candidate pool

**Files:**
- Create: `scripts/lib/candidate-pool.mjs`
- Create: `scripts/generate-candidate-pool.mjs`
- Create: `tests/fixtures/gtfs-stops-small.csv`
- Create: `tests/candidatePool.test.ts`
- Create: `src/scenario/operationalRuns/candidate-pool-v1.json`
- Modify: `DATA_LICENSES.md`

**Interfaces:**
- Produces `buildCandidatePool({ gtfsStops, depotPosition, seed, version, gtfsReference, candidatesPerZone })`.
- Published pool contract:

```ts
interface DeliveryCandidatePool {
  schemaVersion: 1
  version: 'cordoba-delivery-pool-v1'
  generator: 'cordoba-gtfs-candidate-pool-v1'
  gtfsReference: string
  seed: 'fleetflow:v0.6:cordoba:candidate-pool-v1'
  candidates: DeliveryCandidate[]
}
```

- [ ] **Step 1: Write RED tests for GTFS parsing and candidate semantics**

The fixture must contain `stop_id,stop_name,stop_lat,stop_lon` rows distributed around the Córdoba depot. Test:

```ts
const pool = buildCandidatePool({
  gtfsStops: parsedStops,
  depotPosition: [-64.1888, -31.4201],
  seed: 'fleetflow:v0.6:cordoba:candidate-pool-v1',
  version: 'cordoba-delivery-pool-v1',
  gtfsReference: OFFICIAL_GTFS_URL,
  candidatesPerZone: 2,
})

expect(pool.candidates).toHaveLength(16)
expect(new Set(pool.candidates.map((c) => c.id)).size).toBe(16)
expect(new Set(pool.candidates.map((c) => c.zoneId))).toEqual(
  new Set(['zone-0','zone-1','zone-2','zone-3','zone-4','zone-5','zone-6','zone-7']),
)
expect(pool.candidates.every((c) => c.spatialWeight > 0)).toBe(true)
```

Assert generated IDs/labels do not include real GTFS `stop_id` or `stop_name` values.

- [ ] **Step 2: Run RED**

```bash
npm test -- tests/candidatePool.test.ts
```

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement deterministic candidate-pool generation**

Implement:

1. Parse finite GTFS coordinates.
2. Keep source stops within 15 km of `[-64.1888, -31.4201]`.
3. Assign one of eight 45° bearing octants (`zone-0` ... `zone-7`).
4. Compute local stop density as `1 + count(other stops <= 600 m)` using an internal haversine helper.
5. Within each zone, perform deterministic weighted sampling without replacement using the seeded RNG and density as weight.
6. For each selected proxy, create a synthetic point by applying a deterministic 80–220 m radial offset; never expose source stop IDs/names in the candidate contract.
7. Normalize `spatialWeight` to a positive finite relative value.
8. Emit neutral candidate IDs `delivery-candidate-001` ... and no customer/business identity.

Fail closed if any zone has fewer than `candidatesPerZone` eligible source stops.

- [ ] **Step 4: Implement the CLI**

Usage:

```bash
node scripts/generate-candidate-pool.mjs \
  --stops <path-to-official-gtfs-stops.txt> \
  --output src/scenario/operationalRuns/candidate-pool-v1.json
```

The CLI fixes production constants to 30 candidates per zone = exactly 240 candidates, the approved seed/version, Córdoba depot, and the official GTFS reference URL. Refuse to overwrite an existing output file.

- [ ] **Step 5: Generate and validate the production pool from the official static GTFS**

Download the static GTFS from the official Córdoba open-data dataset page referenced in Global Constraints, extract `stops.txt`, and run the CLI once. Then assert in `tests/candidatePool.test.ts` against the checked-in artifact:

```ts
expect(pool.candidates).toHaveLength(240)
for (const zone of zones) {
  expect(pool.candidates.filter((c) => c.zoneId === zone)).toHaveLength(30)
}
```

The raw GTFS feed is not required at runtime and should not be committed merely to run the app.

- [ ] **Step 6: Document source/license and run tests**

Update `DATA_LICENSES.md` with the official dataset page, GTFS role as spatial proxy, derived-candidate semantics, and the source license shown by the official feed/registry. Then run:

```bash
npm test -- tests/candidatePool.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add scripts/lib/candidate-pool.mjs scripts/generate-candidate-pool.mjs tests/fixtures/gtfs-stops-small.csv tests/candidatePool.test.ts src/scenario/operationalRuns/candidate-pool-v1.json DATA_LICENSES.md
git commit -m "feat: add versioned Cordoba delivery candidate pool"
```

---

### Task 3: Add deterministic daily destination and cargo generation

**Files:**
- Create: `scripts/lib/daily-spatial-demand.mjs`
- Modify: `scripts/lib/calibrated-scenario-generator.mjs`
- Test: `tests/dailySpatialDemand.test.ts`
- Regression: `tests/calibratedScenario.test.ts`

**Interfaces:**
- `deliveryCountForDemandMultiplier(multiplier): number`
- `dailyPackageTarget(targetDate, demandMultiplier): number`
- `selectDailyCandidates({ pool, targetDate, count }): DeliveryCandidate[]`
- `materializeDailyDeliveries({ candidates, targetDate, packageTarget, profile }): { stores, cargoByStoreId }`

- [ ] **Step 1: Write RED tests for the delivery-count model**

Use the existing weekly multipliers and assert the exact approved mapping:

```ts
expect(deliveryCountForDemandMultiplier(0.72)).toBe(45)
expect(deliveryCountForDemandMultiplier(0.88)).toBe(52)
expect(deliveryCountForDemandMultiplier(1.00)).toBe(57)
expect(deliveryCountForDemandMultiplier(1.07)).toBe(60)
expect(deliveryCountForDemandMultiplier(1.08)).toBe(61)
expect(deliveryCountForDemandMultiplier(1.16)).toBe(64)
expect(deliveryCountForDemandMultiplier(1.18)).toBe(65)
```

Formula:

```js
clamp(
  Math.round(45 + ((multiplier - 0.72) / (1.18 - 0.72)) * 20),
  45,
  65,
)
```

- [ ] **Step 2: Write RED tests for deterministic spatial selection**

Assert identical date/pool gives identical candidate IDs, different dates normally give different IDs, selection is unique, and each zone quota differs from `count / 8` by at most one.

Zone quota algorithm is fixed:

```text
baseQuota = floor(count / 8)
remainder = count % 8
startZone = hashSeed("fleetflow:v0.6:cordoba:<date>:spatial") % 8
baseQuota to every zone
+1 to `remainder` consecutive zones starting at startZone
```

Within each zone use deterministic weighted sampling without replacement by `spatialWeight`.

- [ ] **Step 3: Write RED tests for package conservation and service semantics**

Assert:

```ts
sumPackageCounts(deliveries) === packageTarget
all packageCount >= 1
all volumeCm3 >= 1
store.serviceMinutes >= 1
```

If `packageTarget < candidates.length`, generation must throw instead of inventing zero-package stops.

- [ ] **Step 4: Run RED**

```bash
npm test -- tests/dailySpatialDemand.test.ts
```

Expected: FAIL because the module does not exist.

- [ ] **Step 5: Export existing calibration helpers without changing behavior**

In `scripts/lib/calibrated-scenario-generator.mjs`, add exports to the existing implementations used by V0.5:

```js
export function sampleDistribution(...) { ... }
export function normalizePackageCounts(...) { ... }
export function minimumTravelMinutes(...) { ... }
export function scaledTravelMinutes(...) { ... }
```

Do not alter function bodies. This avoids duplicating calibration math.

- [ ] **Step 6: Implement V0.6 demand streams**

Use exact seeds:

```text
fleetflow:v0.6:cordoba:<date>:demand
fleetflow:v0.6:cordoba:<date>:spatial
fleetflow:v0.6:cordoba:<date>:operations
```

`dailyPackageTarget` keeps the V0.5 weekly-demand formula but uses the V0.6 demand stream:

```js
const jitter = 0.97 + random() * 0.06
return Math.round(100 * demandMultiplier * jitter)
```

`materializeDailyDeliveries` samples package counts and package volumes from the existing Amazon calibration distributions. Service time is stable per destination/date using:

```text
fleetflow:v0.6:cordoba:<date>:operations:service:<candidateId>
```

and the existing `serviceSecondsPerStop` distribution. Do not generate time windows in PR2; they are optional in the domain and not required by the V0.6 slice.

- [ ] **Step 7: Run GREEN and V0.5 regression**

```bash
npm test -- tests/dailySpatialDemand.test.ts tests/calibratedScenario.test.ts tests/operationalRunGenerator.test.ts
```

Expected: PASS, proving helper exports did not alter V0.5 generation.

- [ ] **Step 8: Commit**

```bash
git add scripts/lib/daily-spatial-demand.mjs scripts/lib/calibrated-scenario-generator.mjs tests/dailySpatialDemand.test.ts
git commit -m "feat: generate deterministic daily spatial demand"
```

---

### Task 4: Assign daily deliveries to the fixed eight-truck fleet and order stops

**Files:**
- Create: `scripts/lib/daily-route-plan.mjs`
- Test: `tests/dailyRoutePlan.test.ts`

**Interfaces:**
- `assignDeliveriesToFleet({ deliveries, trucks }): Map<truckId, delivery[]>`
- `orderStopsNearestNeighbour({ depotPosition, deliveries }): delivery[]`
- `buildLogicalScenario({ targetDate, depot, trucks, deliveries }): FleetScenario-like object`

- [ ] **Step 1: Write RED tests for assignment invariants**

Create eight parcel trucks and 45+ synthetic deliveries. Assert:

```ts
expect(assignments.size).toBe(8)
expect([...assignments.values()].every((stops) => stops.length >= 1)).toBe(true)
expect(allAssignedStoreIds.sort()).toEqual(inputStoreIds.sort())
expect(new Set(allAssignedStoreIds).size).toBe(inputStoreIds.length)
```

Also assert each route volume is `<= truck.capacity.capacityCm3` and that an impossible volume allocation throws.

- [ ] **Step 2: Write RED tests for spatial coherence and deterministic ordering**

Truck preference zones map by sorted truck ID index `0..7`. Assignment eligibility first enforces parcel volume capacity. Among eligible trucks choose lexicographically by:

```text
1. circular zone distance from delivery.zoneId to truck preferred zone
2. current stop count
3. current package count
4. current assigned volume
5. truckId ascending
```

For each assigned bucket, nearest-neighbour order uses haversine distance from depot/current stop, then `storeId` ascending as exact tie-breaker.

- [ ] **Step 3: Run RED**

```bash
npm test -- tests/dailyRoutePlan.test.ts
```

Expected: FAIL because the module does not exist.

- [ ] **Step 4: Implement capacity-aware assignment and ordering**

Use the immutable eight-truck fleet from the checked-in calibrated scenario as the fleet template; do not sample a new fleet per date. Preserve truck IDs, labels, parcel capacities, and fuel coefficients.

`buildLogicalScenario` creates one route per truck with stable geometry IDs:

```text
route-<runId>-01
...
route-<runId>-08
```

At this stage route timing fields may be initialized to zero because the logical scenario is an offline routing input, not yet a publishable `OperationalRun`. Only Task 5 returns publishable timing.

- [ ] **Step 5: Run GREEN**

```bash
npm test -- tests/dailyRoutePlan.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add scripts/lib/daily-route-plan.mjs tests/dailyRoutePlan.test.ts
git commit -m "feat: assign daily demand to fixed fleet"
```

---

### Task 5: Establish the reusable V0.6 route/timing contract

**Files:**
- Create: `scripts/lib/v0-6-route-timing.mjs`
- Test: `tests/v06RouteTiming.test.ts`

**Interfaces:**
- `scheduleScenarioFromRoutes({ scenario, routeCollection, profile, targetDate, travelTimeMultiplier }): FleetScenario`

This function is the canonical PR2 timing interface that the approved Scenario / What-If V0 design will reuse later. It may not ingest traffic/weather; PR3 will layer contextual factors explicitly.

- [ ] **Step 1: Write RED tests for deterministic departure offsets**

For eight sorted truck IDs, use seed:

```text
fleetflow:v0.6:cordoba:<date>:operations:departure
```

Sample eight `departureMinuteOfDayUtc` values from the existing profile, sort them, and normalize to integer offsets `0..18` exactly as the V0.5 generator does. Assert same date/profile gives the same offsets.

- [ ] **Step 2: Write RED tests for route-based timing**

For each leg, use a stable leg seed:

```text
fleetflow:v0.6:cordoba:<date>:operations:travel:<truckId>:<fromId>:<toId>
```

where depot uses literal ID `depot-cordoba-calibrated`.

Travel minutes are:

```js
Math.max(
  scaledTravelMinutes(sampledTravelSeconds, travelTimeMultiplier),
  minimumTravelMinutes(legDistanceKm),
)
```

Service time is the already-frozen `Store.serviceMinutes`; do not resample it while scheduling.

Assert:

```text
plannedArrival > previousDeparture
plannedDeparture = plannedArrival + store.serviceMinutes
returnMinute > last plannedDeparture
same inputs => deep-equal schedule
higher weekly travelTimeMultiplier cannot produce a shorter sampled component
```

- [ ] **Step 3: Write RED test that the scheduler is structurally pure**

Store IDs, positions, cargo, truck assignment, stop order, truck capacities, and route geometry IDs must remain unchanged; only schedule fields are finalized.

- [ ] **Step 4: Run RED**

```bash
npm test -- tests/v06RouteTiming.test.ts
```

Expected: FAIL because the timing module does not exist.

- [ ] **Step 5: Implement the scheduler**

Use the route collection’s `waypointDistancesKm` to compute every leg distance. Validate feature/truck/waypoint cardinality before timing. Return a deep-cloned publishable scenario; never mutate the logical input in place.

- [ ] **Step 6: Run GREEN**

```bash
npm test -- tests/v06RouteTiming.test.ts tests/routeAssets.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add scripts/lib/v0-6-route-timing.mjs tests/v06RouteTiming.test.ts
git commit -m "feat: add reusable v0.6 route timing contract"
```

---

### Task 6: Generate immutable V0.6 OperationalBundles and schema-V2 manifest

**Files:**
- Create: `scripts/generate-v0-6-operational-runs.mjs`
- Create: `tests/v06OperationalRunGenerator.test.ts`
- Modify: `src/scenario/operationalRuns/types.ts`
- Modify: `src/scenario/operationalRuns/validation.ts`
- Modify: `package.json`
- Create during publication: `public/data/operational-runs/manifest-v0-6.json`
- Create during publication: `public/data/operational-runs/generated/cordoba-2026-08-27-v3.json` through `cordoba-2026-09-03-v3.json`
- Create during publication: matching `*.routes.geojson`

**Interfaces:**
- New provenance block:

```ts
interface OperationalSpatialDemandProvenance {
  candidatePoolVersion: string
  deliveryCount: number
  gtfsReference: string
  demandSeed: string
  spatialSeed: string
  operationsSeed: string
  assignmentSeed: string
}
```

`OperationalRunProvenance` gains optional `spatialDemand?: OperationalSpatialDemandProvenance`.

- [ ] **Step 1: Write RED validator tests for spatial-demand provenance**

Extend operational-run validation tests to accept a complete V0.6 block and reject missing/invalid candidate pool version, delivery count outside 45–65, blank GTFS reference, or blank seed fields.

- [ ] **Step 2: Write RED generator integration tests with injected route preparation**

The script/library boundary must allow the generator core to receive a fake route-preparer in tests so CI unit tests do not call public OSRM. Test one and two-day generation for:

```text
schemaVersion == 2
entry.modelVersion == fleetflow-v0.6
entry.routeArtifact ends .routes.geojson
run provenance generator == daily-spatial-demand-v1
45 <= stores.length <= 65
trucks.length == 8
sum(stop packageCount) == dailyPackageTarget
route artifact metadata matches run identity
all destinations assigned exactly once
all trucks have >= 1 stop
```

- [ ] **Step 3: Write RED determinism/variation tests**

Generate the same dates twice with identical injected routing responses and assert byte-identical run/manifest/route outputs. For adjacent dates assert active candidate ID sets are not equal and at least one per-truck stop count differs.

- [ ] **Step 4: Run RED**

```bash
npm test -- tests/v06OperationalRunGenerator.test.ts
```

Expected: FAIL because the generator and provenance contract do not exist.

- [ ] **Step 5: Implement V0.6 provenance types and validation**

Add the exact interface above and enforce it only when present. Existing V0.5 runs without `spatialDemand` remain valid.

- [ ] **Step 6: Implement the V0.6 generator orchestration**

CLI:

```bash
node scripts/generate-v0-6-operational-runs.mjs \
  --profile src/scenario/calibration/amazon-last-mile-v1.json \
  --candidate-pool src/scenario/operationalRuns/candidate-pool-v1.json \
  --fleet-template src/scenario/generated/cordoba-calibrated-v1.json \
  --from 2026-08-27 \
  --to 2026-09-03 \
  --issued-at 2026-08-30T21:00:00-03:00 \
  --data-as-of 2026-08-30T21:00:00-03:00 \
  --output-dir public/data/operational-runs \
  --manifest-name manifest-v0-6.json \
  --run-suffix v3
```

For each date:

1. Resolve weekly profile.
2. Calculate V0.6 package target.
3. Calculate 45–65 delivery count.
4. Select daily candidates.
5. Materialize package/volume/service data.
6. Assign/order stops across the fixed eight-truck fleet.
7. Build the logical scenario.
8. Prepare road geometry with metadata `{ runId, targetDate, modelVersion: 'fleetflow-v0.6' }`.
9. Finalize timings through `scheduleScenarioFromRoutes`.
10. Build `OperationalRun` with `modelVersion: 'fleetflow-v0.6'`, `generator: 'daily-spatial-demand-v1'`, existing weekly-profile provenance, and the new spatial-demand provenance.
11. Validate before writing.
12. Write `<runId>.json`, `<runId>.routes.geojson`, then schema-V2 manifest entry.

Use `assignmentSeed = fleetflow:v0.6:cordoba:<date>:assignment` in provenance even though the first assignment heuristic is deterministic without RNG; future randomness may not be introduced without consuming that dedicated stream.

Refuse to overwrite the manifest or any planned run/route artifact.

- [ ] **Step 7: Add package command**

Add:

```json
"generate:operational-runs:v0.6": "node scripts/generate-v0-6-operational-runs.mjs"
```

Keep `generate:operational-runs` as the historical V0.5 command.

- [ ] **Step 8: Run GREEN**

```bash
npm test -- tests/v06OperationalRunGenerator.test.ts tests/operationalRunValidation.test.ts tests/operationalRunGenerator.test.ts
npm run build
```

Expected: PASS; V0.5 generator tests remain unchanged.

- [ ] **Step 9: Generate the checked-in eight-day V0.6 artifact set with real OSRM**

Run the exact CLI above with network access. Validate generated files with runtime validators before staging them. Do not regenerate or overwrite any V0.5 file.

- [ ] **Step 10: Commit**

```bash
git add scripts/generate-v0-6-operational-runs.mjs tests/v06OperationalRunGenerator.test.ts src/scenario/operationalRuns/types.ts src/scenario/operationalRuns/validation.ts package.json public/data/operational-runs/manifest-v0-6.json public/data/operational-runs/generated/*-v3.json public/data/operational-runs/generated/*-v3.routes.geojson
git commit -m "feat: publish v0.6 daily spatial runs"
```

---

### Task 7: Switch the active Córdoba timeline to V0.6 and expose daily per-truck load

**Files:**
- Modify: `src/scenario/scenarioRegistry.ts`
- Modify: `src/components/FleetPanel.tsx`
- Test: `tests/operationalRunCatalog.test.ts`
- Test: `tests/operationalRunSwitching.test.tsx`
- Test: `tests/cargoSemantics.test.tsx`
- Test: `tests/dashboardComponents.test.tsx`

**Interfaces:**
- Runtime continues to use existing `OperationalBundle`; no new browser generator is added.

- [ ] **Step 1: Write RED regression proving the active registry uses the V0.6 manifest**

Assert:

```ts
expect(getScenarioDefinition('cordoba-calibrated').operationalRuns?.manifestUrl)
  .toBe('./data/operational-runs/manifest-v0-6.json')
```

Also retain the existing regression that `public/data/operational-runs/manifest.json` is schema V1 and has no V2-only fields.

- [ ] **Step 2: Write RED runtime switching test using two real V0.6 entries**

Mock/fetch V0.6 bundles and assert switching dates changes:

```text
store ID set or store coordinates
per-truck stop counts
per-truck package totals
route GeoJSON binding/run ID
```

while truck count remains 8. Retain PR1’s atomic-switch and stale-request protections.

- [ ] **Step 3: Write RED FleetPanel test for planned + remaining packages**

For parcel routes, compute planned package count from the route’s stops and render both values, e.g.:

```text
Plan · 18 paquetes
Restan · 11 paquetes
```

Keep current utilization line. MASS cargo behavior remains unchanged.

- [ ] **Step 4: Run RED**

```bash
npm test -- tests/operationalRunSwitching.test.tsx tests/cargoSemantics.test.tsx tests/dashboardComponents.test.tsx
```

Expected: at least the new registry/UI assertions fail.

- [ ] **Step 5: Point the scenario registry to V0.6**

Change only:

```ts
manifestUrl: './data/operational-runs/manifest-v0-6.json'
```

Do not delete or rewrite the V0.5 manifest.

- [ ] **Step 6: Add planned package visibility in `FleetPanel`**

For each parcel route:

```ts
const plannedPackages = route.stops.reduce(
  (sum, stop) => sum + (stop.cargo.kind === 'PARCELS' ? stop.cargo.packageCount : 0),
  0,
)
```

Render planned and remaining package counts separately so a user can see load per truck at a glance while simulation progresses.

- [ ] **Step 7: Run GREEN**

```bash
npm test -- tests/operationalRunCatalog.test.ts tests/operationalRunSwitching.test.tsx tests/cargoSemantics.test.tsx tests/dashboardComponents.test.tsx
npm run build
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/scenario/scenarioRegistry.ts src/components/FleetPanel.tsx tests/operationalRunCatalog.test.ts tests/operationalRunSwitching.test.tsx tests/cargoSemantics.test.tsx tests/dashboardComponents.test.tsx
git commit -m "feat: activate v0.6 spatial timeline"
```

---

### Task 8: End-to-end acceptance, documentation, and What-If handoff contract

**Files:**
- Modify: `README.md`
- Modify: `DATA_LICENSES.md` if generated artifact provenance needs final wording
- Create: `tests/v06PublishedArtifacts.test.ts`
- Verify: `docs/superpowers/specs/2026-08-30-fleetflow-what-if-comparison-v0-design.md`

**Interfaces:**
- Establishes the published PR2 contract consumed by the already-approved What-If design: V0.6 Base run + bound routes + `scheduleScenarioFromRoutes`.

- [ ] **Step 1: Write acceptance tests over checked-in artifacts**

For every `manifest-v0-6.json` entry:

```text
schema V2 validates
run validates
bundle route metadata matches entry/run
45 <= destination count <= 65
truck count == 8
every truck has >= 1 stop
every destination appears exactly once
package total equals independently recomputed run total
all parcel route volumes fit their truck capacities
```

Across the eight dates assert:

```text
at least 4 distinct active destination-ID sets
at least 3 distinct total delivery counts
at least 3 distinct per-truck stop-count vectors
at least 3 distinct per-truck package-total vectors
```

These thresholds prove visible daily variation without requiring every adjacent day to differ in every dimension.

- [ ] **Step 2: Assert historical compatibility**

Read the old `manifest.json` and one V0.5 artifact. Confirm they still validate under V1 semantics and that their bytes were not changed by PR2.

- [ ] **Step 3: Document V0.6 generation and semantics**

README must state plainly:

```text
GTFS structure informs synthetic candidate spatial weighting; it is not parcel-demand truth.
V0.6 runs are deterministic model outputs, not observed Córdoba delivery operations.
The active V0.6 timeline uses per-run route artifacts.
```

Document both historical and current generation commands, and identify `manifest-v0-6.json` as the active V0.6 catalog.

- [ ] **Step 4: Record the What-If handoff contract**

In README or the V0.6 generation section, document these stable implementation interfaces for the next approved slice:

```text
Base artifact: OperationalRun modelVersion fleetflow-v0.6
Route artifact: V2-bound GeoJSON
Timing function: scripts/lib/v0-6-route-timing.mjs#scheduleScenarioFromRoutes
Candidate identity/cargo: immutable within a published Base run
```

Do not implement What-If in PR2.

- [ ] **Step 5: Run final verification**

Run from a clean checkout:

```bash
npm install --no-audit --no-fund
npm test
npm run build
```

Expected: every test file passes and Vite production build succeeds. Treat the existing >500 kB chunk warning as non-blocking unless this PR materially increases it.

- [ ] **Step 6: Review scope diff**

Confirm no changes under:

```text
src/simulation/engine.ts
src/simulation/clock.ts
```

and no V0.5 run/route artifacts were rewritten. Confirm no traffic/weather/context UI is introduced in PR2.

- [ ] **Step 7: Commit**

```bash
git add README.md DATA_LICENSES.md tests/v06PublishedArtifacts.test.ts
git commit -m "docs: document v0.6 daily spatial demand"
```

---

## PR2 Acceptance Criteria

1. The active Córdoba timeline uses a schema-V2 manifest without rewriting the historical V0.5 schema-V1 manifest.
2. Exactly eight trucks exist in every V0.6 run.
3. Every run has 45–65 unique active synthetic destinations.
4. Daily delivery count follows the explicit weekly-demand formula in Task 3.
5. Package totals are conserved exactly and every stop has at least one package.
6. Candidate selection is deterministic, GTFS-proxy-labelled, and spatially balanced across eight zones.
7. Every destination is assigned to exactly one truck and every truck has at least one stop.
8. Parcel volume capacity remains valid for every route.
9. Stop order is deterministic nearest-neighbour with stable tie-breaking.
10. Every V0.6 run has its own road-following route artifact with correct V2 binding metadata.
11. V0.6 route timing is deterministic and implemented only through `scheduleScenarioFromRoutes`.
12. Adjacent/published dates materially vary in destination sets, per-truck stops, packages, routes, distance, or timing.
13. FleetPanel exposes planned and remaining package counts per truck.
14. Existing V0.5 artifacts/generator remain valid and unchanged.
15. Existing OperationalBundle atomic switching and stale-request protection remain green.
16. No PR3 context modelling, browser-side routing, optimizer, backend, ML, or digital-twin abstraction is introduced.
17. Full `npm test` and `npm run build` pass.

## Post-PR2 Gate

After PR2 is merged, re-read the actual exported interfaces and the checked-in `manifest-v0-6.json`, then write the implementation plan for the already-approved What-If spec:

`docs/superpowers/specs/2026-08-30-fleetflow-what-if-comparison-v0-design.md`

Do not pre-implement What-If in this PR.