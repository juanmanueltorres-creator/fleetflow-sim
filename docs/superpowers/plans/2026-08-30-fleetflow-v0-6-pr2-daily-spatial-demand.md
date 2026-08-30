# FleetFlow V0.6 PR2 — Daily Spatial Demand Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish FleetFlow V0.6 daily operational runs with 45–65 deterministic synthetic Córdoba destinations, variable per-truck package load, per-run road-following geometry, and schema-V2 bundle loading while preserving V0.5 artifacts and the existing simulation engine.

**Architecture:** Build the new behavior entirely in the offline generation path. A versioned candidate pool derived from Córdoba GTFS structure feeds deterministic daily selection, parcel generation, eight-truck assignment, stop ordering, road routing, and one reusable V0.6 timing function. The browser continues to consume `OperationalBundle`; `src/simulation/*` is not changed.

**Tech Stack:** Node.js ESM scripts, TypeScript, React 19, Vitest 3, GeoJSON, existing Turf dependencies, MapLibre, OSRM route preparation.

**Spec:** `docs/superpowers/specs/2026-08-30-fleetflow-v0-6-cordoba-operational-context-design.md`

## Global Constraints

- Exactly 8 vehicles per V0.6 run.
- `45 <= deliveryCount <= 65`.
- Daily package target remains authoritative; package cargo is conserved exactly.
- GTFS is a spatial proxy only. No candidate may be represented as a real customer/business/address.
- Candidate labels are neutral: `Entrega 001`, `Entrega 002`, etc.
- `modelVersion = fleetflow-v0.6`.
- `generator = daily-spatial-demand-v1`.
- `candidatePoolVersion = cordoba-delivery-pool-v1`.
- Seeds use `fleetflow:v0.6:cordoba:<date>:demand|spatial|operations|assignment`; the candidate pool uses `fleetflow:v0.6:cordoba:candidate-pool-v1`.
- Historical `public/data/operational-runs/manifest.json` and all V0.5 artifacts remain unchanged.
- Active V0.6 manifest is a new file: `public/data/operational-runs/manifest-v0-6.json`.
- PR2 has no traffic/weather timing factors and no context UI; context remains omitted.
- No backend, DB, browser routing, OR-Tools, ML, risk score, variable fleet size, or runtime optimizer.
- `src/simulation/engine.ts` and `src/simulation/clock.ts` remain untouched.
- Route artifacts are immutable and carry `runId`, `targetDate`, `modelVersion` binding metadata.
- Official GTFS source page: `https://gobiernoabierto.cordoba.gob.ar/data/datos-abiertos/categoria/transporte-urbano/gtfs-de-la-ciudada-de-cordoba/3319`.

---

## File Map

Create:

```text
scripts/lib/route-preparation.mjs
scripts/lib/candidate-pool.mjs
scripts/generate-candidate-pool.mjs
scripts/lib/daily-spatial-demand.mjs
scripts/lib/daily-route-plan.mjs
scripts/lib/v0-6-route-timing.mjs
scripts/lib/v0-6-operational-run-generator.mjs
scripts/generate-v0-6-operational-runs.mjs
src/scenario/operationalRuns/candidate-pool-v1.json
public/data/operational-runs/manifest-v0-6.json
tests/fixtures/gtfs-stops-small.csv
tests/routePreparationLib.test.ts
tests/candidatePool.test.ts
tests/dailySpatialDemand.test.ts
tests/dailyRoutePlan.test.ts
tests/v06RouteTiming.test.ts
tests/v06OperationalRunGenerator.test.ts
tests/v06PublishedArtifacts.test.ts
```

Modify:

```text
scripts/prepare-routes.mjs
scripts/lib/calibrated-scenario-generator.mjs
src/scenario/operationalRuns/types.ts
src/scenario/operationalRuns/validation.ts
src/scenario/scenarioRegistry.ts
src/components/FleetPanel.tsx
package.json
README.md
DATA_LICENSES.md
```

---

### Task 1: Extract reusable route preparation

**Files:**
- Create: `scripts/lib/route-preparation.mjs`
- Modify: `scripts/prepare-routes.mjs`
- Test: `tests/routePreparationLib.test.ts`

**Interfaces:**

```js
routeDefinitionsFromScenario(scenario)
prepareRouteCollection({ scenario, fetcher, baseUrl, metadata })
```

`metadata` is either absent or exactly `{ runId, targetDate, modelVersion }`.

- [ ] **Step 1: Write the failing library test**

Create a minimal scenario with one truck/two stops and a fake OSRM response containing three legs. Assert:

```ts
const routes = await prepareRouteCollection({
  scenario,
  fetcher,
  baseUrl: 'https://router.test',
  metadata: {
    runId: 'cordoba-2026-08-31-v3',
    targetDate: '2026-08-31',
    modelVersion: 'fleetflow-v0.6',
  },
})

expect(routes.metadata).toEqual({
  runId: 'cordoba-2026-08-31-v3',
  targetDate: '2026-08-31',
  modelVersion: 'fleetflow-v0.6',
})
expect(routes.features[0].properties.waypointDistancesKm).toHaveLength(4)
```

Also test legacy metadata omission and rejection of missing step geometry.

- [ ] **Step 2: Run RED**

```bash
npm test -- tests/routePreparationLib.test.ts
```

Expected: module-not-found failure.

- [ ] **Step 3: Move the existing route logic into the library**

Implement `routeDefinitionsFromScenario` exactly as:

```js
export function routeDefinitionsFromScenario(scenario) {
  const storeById = new Map(scenario.stores.map((store) => [store.id, store]))

  return scenario.routes.map((routePlan) => ({
    truckId: routePlan.truckId,
    geometryId: routePlan.geometryId,
    coordinates: [
      scenario.depot.position,
      ...routePlan.stops.map((stop) => {
        const store = storeById.get(stop.storeId)
        if (!store) throw new Error(`Missing store ${stop.storeId}`)
        return store.position
      }),
      scenario.depot.position,
    ],
  }))
}
```

Move `appendCoordinates`, `geometryLengthKm`, `buildGeometryFromLegs`, and `prepareRoute` from the current CLI without semantic changes. Implement collection assembly as:

```js
export async function prepareRouteCollection({
  scenario,
  fetcher = fetch,
  baseUrl = 'https://router.project-osrm.org',
  metadata,
}) {
  const features = []
  for (const definition of routeDefinitionsFromScenario(scenario)) {
    features.push(await prepareRoute(definition, { fetcher, baseUrl }))
  }
  return {
    type: 'FeatureCollection',
    ...(metadata ? { metadata } : {}),
    features,
  }
}
```

- [ ] **Step 4: Make `scripts/prepare-routes.mjs` a thin wrapper**

Keep existing legacy/scenario arguments. Add `--run-id`, `--target-date`, `--model-version`; require either all three or none. Use `prepareRouteCollection()` and preserve existing output behavior.

- [ ] **Step 5: Run GREEN**

```bash
npm test -- tests/routePreparationLib.test.ts tests/routeAssets.test.ts
npm run build
```

- [ ] **Step 6: Commit**

```bash
git add scripts/lib/route-preparation.mjs scripts/prepare-routes.mjs tests/routePreparationLib.test.ts
git commit -m "refactor: expose reusable route preparation"
```

---

### Task 2: Generate the 240-point versioned candidate pool

**Files:**
- Create: `scripts/lib/candidate-pool.mjs`
- Create: `scripts/generate-candidate-pool.mjs`
- Create: `tests/fixtures/gtfs-stops-small.csv`
- Create: `tests/candidatePool.test.ts`
- Create after generation: `src/scenario/operationalRuns/candidate-pool-v1.json`
- Modify: `DATA_LICENSES.md`

**Interfaces:**

```js
parseGtfsStops(csvText)
buildCandidatePool({ gtfsStops, depotPosition, seed, version, gtfsReference, candidatesPerZone })
```

Published candidate shape:

```ts
interface DeliveryCandidate {
  id: string
  label: string
  position: [number, number]
  zoneId: string
  spatialWeight: number
  provenance: {
    generator: 'cordoba-gtfs-candidate-pool-v1'
    candidatePoolVersion: 'cordoba-delivery-pool-v1'
    gtfsReference: string
  }
}
```

- [ ] **Step 1: Write RED parsing/pool tests**

Use a fixture with at least two stops in each octant around `[-64.1888, -31.4201]`. With `candidatesPerZone: 2`, assert 16 unique synthetic candidates, two per zone, positive finite weights, and no source `stop_id`/`stop_name` leakage into `id` or `label`.

- [ ] **Step 2: Run RED**

```bash
npm test -- tests/candidatePool.test.ts
```

- [ ] **Step 3: Implement exact pool algorithm**

1. Parse finite `stop_lat`/`stop_lon`.
2. Keep stops within 15 km of the depot using an internal haversine helper.
3. Compute bearing from depot and assign eight 45° octants `zone-0` through `zone-7`.
4. Set raw density weight to `1 + number of other eligible stops within 600 m`.
5. Within each zone, sample without replacement using deterministic seeded weighted roulette.
6. For each selected proxy, use the same RNG stream to choose radius `80 + random()*140` metres and angle `random()*2π`; convert that offset to lon/lat and store the resulting synthetic point.
7. Candidate IDs are `delivery-candidate-001` through `delivery-candidate-240`; labels are `Entrega 001` through `Entrega 240`.
8. `spatialWeight = rawDensity / maxRawDensityInZone`; require `0 < spatialWeight <= 1`.
9. Fail if any zone has fewer than the requested source proxies.

- [ ] **Step 4: Implement CLI with fixed production constants**

Exact invocation after extracting the official feed to the stated temporary path:

```bash
node scripts/generate-candidate-pool.mjs \
  --stops /tmp/fleetflow-cordoba-gtfs/stops.txt \
  --output src/scenario/operationalRuns/candidate-pool-v1.json
```

Production constants inside the CLI:

```text
candidatesPerZone = 30
seed = fleetflow:v0.6:cordoba:candidate-pool-v1
version = cordoba-delivery-pool-v1
depot = [-64.1888, -31.4201]
```

Refuse overwrite.

- [ ] **Step 5: Generate the production pool from the official static GTFS**

Download the static feed from the official source page in Global Constraints, extract it so `stops.txt` exists at `/tmp/fleetflow-cordoba-gtfs/stops.txt`, run the command above, then add a test over the checked-in artifact asserting exactly 240 candidates and exactly 30 per zone.

- [ ] **Step 6: Document data provenance**

Add the official page and note that the pool is a derived synthetic artifact. Record `CC-BY-SA-4.0` as the feed license reported for Transitland feed `f-cordoba~ar`; do not claim that GTFS measures parcel demand.

- [ ] **Step 7: Run GREEN and commit**

```bash
npm test -- tests/candidatePool.test.ts
git add scripts/lib/candidate-pool.mjs scripts/generate-candidate-pool.mjs tests/fixtures/gtfs-stops-small.csv tests/candidatePool.test.ts src/scenario/operationalRuns/candidate-pool-v1.json DATA_LICENSES.md
git commit -m "feat: add versioned Cordoba delivery candidate pool"
```

---

### Task 3: Generate deterministic daily destinations, packages, volumes, and service times

**Files:**
- Create: `scripts/lib/daily-spatial-demand.mjs`
- Modify: `scripts/lib/calibrated-scenario-generator.mjs`
- Test: `tests/dailySpatialDemand.test.ts`

**Interfaces:**

```js
deliveryCountForDemandMultiplier(multiplier)
dailyPackageTarget(targetDate, demandMultiplier)
selectDailyCandidates({ pool, targetDate, count })
materializeDailyDeliveries({ candidates, targetDate, packageTarget, profile })
```

`materializeDailyDeliveries` returns:

```ts
interface DailyDelivery {
  store: Store
  cargo: { kind: 'PARCELS'; packageCount: number; volumeCm3: number }
  zoneId: string
}
```

- [ ] **Step 1: Write RED delivery-count tests**

Assert exact mapping:

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
Math.min(65, Math.max(45,
  Math.round(45 + ((multiplier - 0.72) / 0.46) * 20),
))
```

- [ ] **Step 2: Write RED spatial-selection tests**

Zone quotas:

```js
const baseQuota = Math.floor(count / 8)
const remainder = count % 8
const startZone = hashSeed(`fleetflow:v0.6:cordoba:${targetDate}:spatial`) % 8
```

Every zone gets `baseQuota`; the next `remainder` zones cyclically from `startZone` get one extra. Within a zone use deterministic weighted sampling without replacement by `spatialWeight`. Assert same date is identical, different dates normally differ, no duplicate IDs, and no zone count differs from another by more than one.

- [ ] **Step 3: Write RED cargo/service tests**

Assert package sum equals target, every stop has at least one package, volume is positive finite, and service minutes are at least one. `packageTarget < selectedCandidates.length` must throw.

- [ ] **Step 4: Run RED**

```bash
npm test -- tests/dailySpatialDemand.test.ts
```

- [ ] **Step 5: Export existing calibration helpers only**

Add `export` to the existing `sampleDistribution`, `normalizePackageCounts`, `minimumTravelMinutes`, and `scaledTravelMinutes` functions in `calibrated-scenario-generator.mjs`; do not alter their bodies.

- [ ] **Step 6: Implement separated V0.6 streams**

Package target:

```js
const random = mulberry32(hashSeed(`fleetflow:v0.6:cordoba:${targetDate}:demand`))
const dailyJitter = 0.97 + random() * 0.06
return Math.round(100 * demandMultiplier * dailyJitter)
```

Sample package counts/volumes from the existing calibration distributions. Service time for each candidate uses its own stable seed:

```text
fleetflow:v0.6:cordoba:<date>:operations:service:<candidateId>
```

Do not generate time windows in PR2.

- [ ] **Step 7: Run GREEN + historical regression**

```bash
npm test -- tests/dailySpatialDemand.test.ts tests/calibratedScenario.test.ts tests/operationalRunGenerator.test.ts
```

- [ ] **Step 8: Commit**

```bash
git add scripts/lib/daily-spatial-demand.mjs scripts/lib/calibrated-scenario-generator.mjs tests/dailySpatialDemand.test.ts
git commit -m "feat: generate deterministic daily spatial demand"
```

---

### Task 4: Assign demand to the fixed fleet and order stops

**Files:**
- Create: `scripts/lib/daily-route-plan.mjs`
- Test: `tests/dailyRoutePlan.test.ts`

**Interfaces:**

```js
assignDeliveriesToFleet({ deliveries, trucks, assignmentSeed })
orderStopsNearestNeighbour({ depotPosition, deliveries })
buildLogicalScenario({ runId, depot, trucks, assignments })
```

- [ ] **Step 1: Write RED assignment tests**

With eight parcel trucks and at least 45 deliveries assert: eight non-empty buckets, every destination exactly once, all package cargo preserved, and each assigned volume `<= capacityCm3`. An impossible capacity set must throw.

- [ ] **Step 2: Write RED deterministic-scoring tests**

Sort trucks by ID. Map truck index `i` to preferred zone:

```js
const zoneOffset = hashSeed(assignmentSeed) % 8
const preferredZone = (i + zoneOffset) % 8
```

Sort deliveries by `packageCount` descending then `store.id` ascending. For each delivery, filter trucks that remain within parcel volume capacity; choose the minimum lexicographic tuple:

```text
circular zone distance
current stop count
current package count
current assigned volume
truckId
```

This consumes the dedicated assignment seed without adding randomness.

- [ ] **Step 3: Write RED nearest-neighbour tests**

Start at depot, repeatedly choose minimum haversine distance among unvisited assigned stores; exact distance ties use `store.id` ascending. Same inputs must produce identical order.

- [ ] **Step 4: Run RED**

```bash
npm test -- tests/dailyRoutePlan.test.ts
```

- [ ] **Step 5: Implement logical scenario creation**

Reuse depot and the eight trucks from `src/scenario/generated/cordoba-calibrated-v1.json`; capacities/fuel coefficients do not vary by date. Geometry IDs are created with:

```js
const routeNumber = String(index + 1).padStart(2, '0')
const geometryId = `route-${runId}-${routeNumber}`
```

Set pre-routing schedule fields to `0`; this object is only an offline route-preparation input and must not be published until Task 5 finalizes timing.

- [ ] **Step 6: Run GREEN and commit**

```bash
npm test -- tests/dailyRoutePlan.test.ts
git add scripts/lib/daily-route-plan.mjs tests/dailyRoutePlan.test.ts
git commit -m "feat: assign daily demand to fixed fleet"
```

---

### Task 5: Establish the reusable V0.6 route/timing contract

**Files:**
- Create: `scripts/lib/v0-6-route-timing.mjs`
- Test: `tests/v06RouteTiming.test.ts`

**Interface:**

```js
scheduleScenarioFromRoutes({ scenario, routeCollection, profile, targetDate, travelTimeMultiplier })
```

This is the timing contract the approved What-If design must reuse after PR2.

- [ ] **Step 1: Write RED departure tests**

Seed departures with:

```text
fleetflow:v0.6:cordoba:<date>:operations:departure
```

Sample eight existing `departureMinuteOfDayUtc` values, sort them, then normalize to integer offsets from 0 to 18 exactly like V0.5. Assert determinism.

- [ ] **Step 2: Write RED leg-timing tests**

Each road leg uses seed:

```text
fleetflow:v0.6:cordoba:<date>:operations:travel:<truckId>:<fromId>:<toId>
```

Use `depot-cordoba-calibrated` as depot ID. Travel minutes are:

```js
Math.max(
  scaledTravelMinutes(sampleDistribution(profile.distributions.travelSecondsBetweenStops, random), travelTimeMultiplier),
  minimumTravelMinutes(legDistanceKm),
)
```

`plannedDepartureMinute = plannedArrivalMinute + store.serviceMinutes`. The return leg uses the same formula. Assert `returnMinute` occurs after the last service interval.

- [ ] **Step 3: Write RED structural-purity test**

The scheduler may modify only route schedule fields. It must preserve stores, positions, cargo, assignment, order, trucks, capacities, and geometry IDs.

- [ ] **Step 4: Run RED**

```bash
npm test -- tests/v06RouteTiming.test.ts
```

- [ ] **Step 5: Implement schedule finalization**

Validate route feature truck ID and `waypointDistancesKm.length === stops.length + 2`. Deep-clone the logical scenario, fill departure/arrival/departure/return times, and return the publishable scenario.

- [ ] **Step 6: Run GREEN and commit**

```bash
npm test -- tests/v06RouteTiming.test.ts tests/routeAssets.test.ts
git add scripts/lib/v0-6-route-timing.mjs tests/v06RouteTiming.test.ts
git commit -m "feat: add reusable v0.6 route timing contract"
```

---

### Task 6: Build the testable V0.6 run generator and provenance contract

**Files:**
- Create: `scripts/lib/v0-6-operational-run-generator.mjs`
- Create: `scripts/generate-v0-6-operational-runs.mjs`
- Create: `tests/v06OperationalRunGenerator.test.ts`
- Modify: `src/scenario/operationalRuns/types.ts`
- Modify: `src/scenario/operationalRuns/validation.ts`
- Modify: `package.json`

**Interfaces:**

```js
generateV06OperationalRuns({
  profile,
  candidatePool,
  fleetTemplate,
  from,
  to,
  issuedAt,
  dataAsOf,
  runSuffix,
  routePreparer,
})
```

The core returns `{ manifest, artifacts }`; the CLI is responsible only for file IO and uses `prepareRouteCollection` as `routePreparer`.

Add:

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

and optional `spatialDemand` on `OperationalRunProvenance`.

- [ ] **Step 1: Write RED validation tests**

Accept a complete block. Reject delivery count outside 45–65 and blank pool/source/seed strings. Existing V0.5 runs without the block remain valid.

- [ ] **Step 2: Write RED core-generator tests with fake routing**

Inject a deterministic `routePreparer` that returns valid geometries for the logical scenario. Assert schema V2, `fleetflow-v0.6`, required `routeArtifact`, run/route binding metadata, 8 trucks, 45–65 destinations, exact package conservation, one assignment per destination, and non-empty routes.

- [ ] **Step 3: Write RED determinism/variation tests**

Two invocations with identical inputs/fake routing must deep-equal. Adjacent dates must normally have different candidate-ID sets; over 2026-08-27 through 2026-09-03 require at least four distinct destination sets.

- [ ] **Step 4: Run RED**

```bash
npm test -- tests/v06OperationalRunGenerator.test.ts
```

- [ ] **Step 5: Implement generator core**

For each date:

```text
weekly profile
→ dailyPackageTarget
→ deliveryCountForDemandMultiplier
→ selectDailyCandidates
→ materializeDailyDeliveries
→ assignDeliveriesToFleet using fleetflow:v0.6:cordoba:<date>:assignment
→ nearest-neighbour ordering
→ buildLogicalScenario
→ routePreparer with V2 metadata
→ scheduleScenarioFromRoutes
→ OperationalRun validation
```

Run ID is `cordoba-<date>-<runSuffix>`; publication uses `runSuffix = v3`.

Provenance seeds are exact:

```text
demandSeed     fleetflow:v0.6:cordoba:<date>:demand
spatialSeed    fleetflow:v0.6:cordoba:<date>:spatial
operationsSeed fleetflow:v0.6:cordoba:<date>:operations
assignmentSeed fleetflow:v0.6:cordoba:<date>:assignment
```

Manifest entries include `artifact` and `routeArtifact`; `contextArtifact` is omitted.

- [ ] **Step 6: Implement CLI/file immutability**

Exact publication command:

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

Refuse to overwrite manifest, run JSON, or route GeoJSON.

- [ ] **Step 7: Add package command**

```json
"generate:operational-runs:v0.6": "node scripts/generate-v0-6-operational-runs.mjs"
```

Keep the V0.5 command unchanged.

- [ ] **Step 8: Run GREEN and commit code**

```bash
npm test -- tests/v06OperationalRunGenerator.test.ts tests/operationalRunValidation.test.ts tests/operationalRunGenerator.test.ts
npm run build
git add scripts/lib/v0-6-operational-run-generator.mjs scripts/generate-v0-6-operational-runs.mjs tests/v06OperationalRunGenerator.test.ts src/scenario/operationalRuns/types.ts src/scenario/operationalRuns/validation.ts package.json
git commit -m "feat: add v0.6 operational run generator"
```

---

### Task 7: Publish V0.6 bundles and activate the timeline

**Files:**
- Create: `public/data/operational-runs/manifest-v0-6.json`
- Create: eight `public/data/operational-runs/generated/cordoba-2026-08-27-v3.json` through `cordoba-2026-09-03-v3.json`
- Create: eight matching `.routes.geojson` files
- Modify: `src/scenario/scenarioRegistry.ts`
- Modify: `src/components/FleetPanel.tsx`
- Test: `tests/operationalRunCatalog.test.ts`
- Test: `tests/operationalRunSwitching.test.tsx`
- Test: `tests/cargoSemantics.test.tsx`

- [ ] **Step 1: Generate real route artifacts with network access**

Run the exact Task 6 publication command with OSRM access. The generator must validate every run before writing it.

- [ ] **Step 2: Write RED published-catalog test**

Assert `manifest-v0-6.json` is schema V2, has eight entries, every entry has a `.routes.geojson`, and historical `manifest.json` remains schema V1.

- [ ] **Step 3: Write RED switching test**

Use two V0.6 dates. Assert the active bundle changes destination IDs/coordinates and at least one per-truck stop or package total while truck count stays 8. Retain atomic loading and stale-request tests from PR1.

- [ ] **Step 4: Write RED per-truck load UI test**

For parcel routes require both:

```text
Plan · N paquetes
Restan · M paquetes
```

plus the existing capacity-utilization line.

- [ ] **Step 5: Run RED**

```bash
npm test -- tests/operationalRunCatalog.test.ts tests/operationalRunSwitching.test.tsx tests/cargoSemantics.test.tsx
```

- [ ] **Step 6: Activate V0.6 manifest**

In `src/scenario/scenarioRegistry.ts` set:

```ts
manifestUrl: './data/operational-runs/manifest-v0-6.json'
```

Do not change the old manifest.

- [ ] **Step 7: Update `FleetPanel`**

For each parcel route calculate planned packages:

```ts
const plannedPackages = route.stops.reduce(
  (sum, stop) => sum + (stop.cargo.kind === 'PARCELS' ? stop.cargo.packageCount : 0),
  0,
)
```

Render the plan count and the snapshot’s remaining package count separately.

- [ ] **Step 8: Run GREEN and commit**

```bash
npm test -- tests/operationalRunCatalog.test.ts tests/operationalRunSwitching.test.tsx tests/cargoSemantics.test.tsx tests/dashboardComponents.test.tsx
npm run build
git add public/data/operational-runs/manifest-v0-6.json public/data/operational-runs/generated/*-v3.json public/data/operational-runs/generated/*-v3.routes.geojson src/scenario/scenarioRegistry.ts src/components/FleetPanel.tsx tests/operationalRunCatalog.test.ts tests/operationalRunSwitching.test.tsx tests/cargoSemantics.test.tsx tests/dashboardComponents.test.tsx
git commit -m "feat: activate v0.6 spatial timeline"
```

---

### Task 8: Acceptance tests, docs, and What-If handoff

**Files:**
- Create: `tests/v06PublishedArtifacts.test.ts`
- Modify: `README.md`
- Modify if needed: `DATA_LICENSES.md`

- [ ] **Step 1: Write published-artifact acceptance tests**

For every V0.6 entry assert:

```text
manifest validates as V2
run validates
route metadata matches run
destination count is 45–65
truck count is 8
every truck has at least one stop
every destination appears exactly once
all cargo is PARCELS
all route volumes fit truck capacities
```

Across the eight dates require:

```text
>= 4 distinct destination-ID sets
>= 3 distinct delivery counts
>= 3 distinct per-truck stop-count vectors
>= 3 distinct per-truck package-total vectors
```

Do not assert that every adjacent day differs in every dimension.

- [ ] **Step 2: Test historical compatibility**

Read historical `manifest.json`; assert schema V1, `fleetflow-v0.5`, and absence of `routeArtifact`. Byte preservation is verified by the final git diff, not by a runtime test.

- [ ] **Step 3: Document semantics and generation**

README must explicitly state:

```text
GTFS structure informs synthetic spatial weighting; it is not parcel-demand truth.
V0.6 runs are deterministic model outputs, not observed Córdoba operations.
V0.6 uses per-run route artifacts and manifest-v0-6.json.
```

Document the exact candidate-pool and V0.6 run commands from this plan.

- [ ] **Step 4: Document the stable What-If handoff**

Record:

```text
Base modelVersion: fleetflow-v0.6
Base artifact: OperationalRun
Route artifact: V2-bound GeoJSON
Timing interface: scripts/lib/v0-6-route-timing.mjs#scheduleScenarioFromRoutes
Candidate IDs/cargo: frozen inside each published Base run
```

Do not implement What-If in PR2.

- [ ] **Step 5: Run full verification from clean dependency state**

```bash
npm install --no-audit --no-fund
npm test
npm run build
```

Expected: all test files pass and production build succeeds. Existing Vite chunk-size warning is non-blocking unless PR2 materially worsens it.

- [ ] **Step 6: Scope review**

Confirm the diff does not touch:

```text
src/simulation/engine.ts
src/simulation/clock.ts
public/data/operational-runs/manifest.json
existing V0.5 generated artifacts
```

Confirm no PR3 context modelling or What-If implementation slipped into PR2.

- [ ] **Step 7: Commit**

```bash
git add tests/v06PublishedArtifacts.test.ts README.md DATA_LICENSES.md
git commit -m "docs: document v0.6 daily spatial demand"
```

---

## PR2 Acceptance Criteria

1. Historical V0.5 manifest/artifacts remain unchanged and valid.
2. Active Córdoba timeline uses `manifest-v0-6.json` schema V2.
3. Every V0.6 run has exactly 8 trucks and 45–65 unique synthetic destinations.
4. Delivery-count formula is the exact Task 3 formula and follows weekly demand intensity.
5. Package totals are exactly conserved; every active destination has at least one package.
6. Candidate pool is exactly 240 derived synthetic points, 30 per octant, with GTFS-proxy provenance.
7. Daily candidate selection is deterministic and spatially balanced.
8. Assignment is deterministic, consumes `assignmentSeed`, assigns every destination exactly once, and respects parcel volume capacity.
9. Stop ordering is deterministic nearest-neighbour with `store.id` tie-break.
10. Every V0.6 run has a bound per-run road GeoJSON artifact.
11. All V0.6 timing flows through `scheduleScenarioFromRoutes`; weekly travel multiplier is applied exactly once.
12. Published dates materially vary in destinations, stops, package distribution, routes, distance, or timing.
13. FleetPanel exposes planned and remaining packages per truck.
14. PR1 OperationalBundle atomic switching/stale-response behavior remains green.
15. `src/simulation/*` semantics are unchanged.
16. No browser routing, backend, optimizer, ML, context scoring, or What-If implementation is added.
17. Full tests and production build pass.

## Post-PR2 Gate

After PR2 merges, inspect its actual exported interfaces and generated V0.6 Base artifacts. Then create the implementation plan for the already-approved design:

`docs/superpowers/specs/2026-08-30-fleetflow-what-if-comparison-v0-design.md`

That later plan must use `scheduleScenarioFromRoutes` rather than inventing a second timing model.