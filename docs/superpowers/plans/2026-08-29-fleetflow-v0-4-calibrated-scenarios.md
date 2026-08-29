# FleetFlow V0.4 — Calibrated Scenarios Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `Córdoba Last-Mile · Calibrado` the default FleetFlow experience with 8 vehicles, exactly 60 stops and parcel semantics calibrated from the public Amazon Last Mile Routing Research Challenge dataset, while preserving `Coca Coqui · Legacy V0` as a selectable baseline.

**Architecture:** Generalize the existing domain, route geometry and simulation engine so they no longer assume five routes or three stops. Keep raw third-party data outside the repository; an offline calibration script emits a small versioned profile, a seeded generator emits the Córdoba scenario, and a route-preparation script emits checked-in road geometry. A scenario registry selects one coherent bundle — scenario, route asset and provenance — and the existing map/dashboard consume only the active bundle.

**Tech Stack:** React 19.1.1, TypeScript 5.7.2, Vite 6.1.0, Vitest 3.0.5, MapLibre GL 6.6.0, Turf 7.4.0, Node.js 22 scripts, public OSRM only during offline route preparation.

**Spec:** `docs/superpowers/specs/2026-08-29-fleetflow-v0-4-calibrated-scenarios-design.md`

## Global Constraints

- `cordoba-calibrated` is the default scenario on a fresh page load.
- Calibrated scale is exactly **8 vehicles / 60 stops** and **90–110 packages**; generator target is 100 packages.
- `coca-coqui-legacy` remains fully functional at **5 vehicles / 15 stops**.
- Raw Amazon data is never committed, bundled by Vite, fetched by the browser, or required by CI/Pages.
- Amazon source material is CC BY-NC 4.0; code remains MIT and derived data is explicitly excluded from the MIT grant in `DATA_LICENSES.md`.
- Córdoba coordinates and displayed roads are project-authored/synthetic context; the UI never calls them real Amazon or Mercado Libre routes.
- No runtime routing request. Both scenarios use checked-in GeoJSON route assets.
- No traffic incidents, failed deliveries, driver absence, breakdowns, reassignment, OR-Tools or dynamic replanning in V0.4.
- Keep `Store` as the internal place entity name in V0.4 to avoid an unrelated rename; user-facing copy says parada/entrega where appropriate.
- Route geometry is the single source of truth for route distance; `RoutePlan.distanceKm` is removed to prevent JSON/GeoJSON drift.
- Every task uses RED → GREEN tests and ends with a focused commit.

---

## Planned File Structure

### Domain/runtime

- `src/domain/types.ts` — generic cargo, delivery-window and snapshot contracts.
- `src/domain/cargo.ts` — cargo aggregation/subtraction/format-neutral helpers.
- `src/domain/scenarioValidation.ts` — scenario-level invariants for both cargo modes.
- `src/map/routeAssets.ts` — dynamic route/waypoint geometry validation and distance lookup.
- `src/simulation/engine.ts` — N-stop simulation engine.
- `src/simulation/metrics.ts` — metrics derived from active scenario + route geometry.

### Calibration/scenario

- `src/scenario/calibration/types.ts` — checked-in calibration profile contract.
- `src/scenario/calibration/amazon-last-mile-v1.json` — compact derived profile; no raw routes/packages.
- `src/scenario/generated/cordoba-calibrated-v1.json` — deterministic 8-vehicle/60-stop scenario.
- `src/scenario/cocaCoquiScenario.ts` — Legacy V0 migrated to generic cargo contracts.
- `src/scenario/scenarioRegistry.ts` — scenario definitions, default ID and provenance.

### Offline scripts

- `scripts/calibrate-amazon.mjs` — read official raw JSON outside repo and write compact quantile profile.
- `scripts/generate-calibrated-scenario.mjs` — seeded Córdoba scenario generator.
- `scripts/prepare-routes.mjs` — generic JSON-scenario → OSRM → GeoJSON route preparation.
- `scripts/fixtures/amazon-mini/*` — project-authored synthetic files matching Amazon schema for parser tests only.

### UI

- `src/components/ScenarioSwitcher.tsx` — connected-rail segmented scenario control.
- `src/components/ScenarioProvenance.tsx` — compact provenance + progressive disclosure.
- `src/components/FleetPanel.tsx` — generic vehicle/cargo copy.
- `src/components/KpiPanel.tsx` — generic vehicle wording.
- `src/map/mapPointDetails.ts` — MASS/PARCELS point details and generic depot copy.
- `src/App.tsx` — active scenario state, route loading, reset on switch.
- `src/app.css` — switcher/provenance styling inside the existing connected frame.

### Tests/docs

- Extend existing `tests/routeAssets.test.ts`, `tests/simulationEngine.test.ts`, `tests/scenarioValidation.test.ts`, `tests/dashboardComponents.test.tsx`, `tests/mapPointDetails.test.ts`, `tests/metrics.test.ts`, `tests/appSmoke.test.tsx`.
- Create `tests/calibrationScript.test.ts`, `tests/calibratedScenario.test.ts`, `tests/scenarioRegistry.test.ts`, `tests/scenarioSwitching.test.tsx`.
- Update `README.md`; create `DATA_LICENSES.md`.

---

### Task 1: Make Route Geometry Variable and Authoritative

**Files:**
- Modify: `src/domain/types.ts`
- Modify: `src/map/routeAssets.ts`
- Modify: `src/simulation/engine.ts`
- Modify: `src/simulation/metrics.ts`
- Modify: `src/scenario/cocaCoquiScenario.ts`
- Modify: `src/App.tsx`
- Modify: `tests/routeAssets.test.ts`
- Modify: `tests/metrics.test.ts`
- Modify: `tests/simulationEngine.test.ts`

**Interfaces:**
- Produces: `routeCollectionToIndex(collection: RouteGeometryCollection, scenario: FleetScenario): RouteGeometryIndex`
- Produces: `routeDistanceKm(feature: RouteGeometryFeature): number`
- Changes: `RouteGeometryProperties.waypointDistancesKm` from fixed tuple to `number[]`.
- Changes: remove `RoutePlan.distanceKm`; all runtime distance comes from geometry.
- Changes: `deriveFleetMetrics(scenario, snapshot, geometries)` receives the active geometry index.

- [ ] **Step 1: Write failing route-geometry tests for variable route counts and waypoint counts**

Add tests that build a one-route scenario with two stops and geometry distances `[0, 1.2, 2.4, 3.1]`.

```ts
const index = routeCollectionToIndex(collection, scenario)
expect(index['route-test']).toBeDefined()
expect(routeDistanceKm(index['route-test'])).toBeCloseTo(3.1)
```

Add fail-closed assertions:

```ts
expect(() => routeCollectionToIndex(badCount, scenario)).toThrow(/geometry ids/i)
expect(() => routeCollectionToIndex(badWaypoints, scenario)).toThrow(/stops \+ 2/i)
expect(() => routeCollectionToIndex(nonMonotonic, scenario)).toThrow(/strictly increasing/i)
```

- [ ] **Step 2: Run RED test**

Run:

```bash
npm test -- tests/routeAssets.test.ts
```

Expected: FAIL because the current function requires exactly five features and exactly five waypoint distances.

- [ ] **Step 3: Generalize `routeAssets.ts`**

Use the active scenario to validate geometry IDs and waypoint cardinality:

```ts
export interface RouteGeometryProperties {
  truckId: string
  waypointDistancesKm: number[]
}

export function routeDistanceKm(feature: RouteGeometryFeature): number {
  const distances = feature.properties.waypointDistancesKm
  return distances[distances.length - 1] ?? 0
}

export function routeCollectionToIndex(
  collection: RouteGeometryCollection,
  scenario: FleetScenario,
): RouteGeometryIndex {
  const expected = new Map(scenario.routes.map((route) => [route.geometryId, route]))
  if (collection.type !== 'FeatureCollection' || collection.features.length !== expected.size) {
    throw new Error('Route geometry ids must match the active scenario')
  }

  const entries = collection.features.map((feature) => {
    if (typeof feature.id !== 'string' || feature.geometry.type !== 'LineString') {
      throw new Error('Every route geometry requires a string id and LineString')
    }
    const route = expected.get(feature.id)
    if (!route) throw new Error(`Unexpected route geometry ${feature.id}`)

    const distances = feature.properties.waypointDistancesKm
    if (distances.length !== route.stops.length + 2) {
      throw new Error(`Route ${route.id} waypoint count must equal stops + 2`)
    }
    if (distances[0] !== 0) throw new Error(`Route ${route.id} must start at distance 0`)
    if (distances.some((value, index) => index > 0 && value <= distances[index - 1])) {
      throw new Error(`Route ${route.id} waypoint distances must be strictly increasing`)
    }
    return [feature.id, feature] as const
  })

  return Object.fromEntries(entries)
}
```

- [ ] **Step 4: Remove duplicated `RoutePlan.distanceKm` and switch engine distance to geometry**

In `src/domain/types.ts`, remove `distanceKm` from `RoutePlan` and remove the five values from `cocaCoquiScenario.ts`.

In `engine.ts`:

```ts
const totalGeometryDistanceKm = routeDistanceKm(geometry)
const distanceTravelledKm = totalGeometryDistanceKm * routeProgress
```

- [ ] **Step 5: Make planned-distance metrics geometry-backed**

```ts
export function deriveFleetMetrics(
  scenario: FleetScenario,
  snapshot: FleetSnapshot,
  geometries: RouteGeometryIndex,
): FleetMetrics {
  const plannedDistanceKm = scenario.routes.reduce((total, route) => {
    const geometry = geometries[route.geometryId]
    if (!geometry) throw new Error(`Missing geometry ${route.geometryId}`)
    return total + routeDistanceKm(geometry)
  }, 0)

  return { /* existing fields */, plannedDistanceKm }
}
```

Update `App.tsx` to pass the current route index.

- [ ] **Step 6: Run focused GREEN tests and build**

```bash
npm test -- tests/routeAssets.test.ts tests/metrics.test.ts tests/simulationEngine.test.ts
npm run build
```

Expected: PASS; Legacy still reports approximately its existing planned distance from checked-in geometry.

- [ ] **Step 7: Commit**

```bash
git add src/domain/types.ts src/map/routeAssets.ts src/simulation/engine.ts src/simulation/metrics.ts src/scenario/cocaCoquiScenario.ts src/App.tsx tests/routeAssets.test.ts tests/metrics.test.ts tests/simulationEngine.test.ts
git commit -m "refactor: make route geometry scenario driven"
```

---

### Task 2: Generalize the Simulation Engine to N Stops

**Files:**
- Modify: `src/simulation/engine.ts`
- Modify: `tests/simulationEngine.test.ts`

**Interfaces:**
- Consumes: dynamic `waypointDistancesKm: number[]` from Task 1.
- Produces: unchanged public `getFleetSnapshot(scenario, geometries, simulationMinute)` signature, but supports any non-empty stop count.

- [ ] **Step 1: Add a reusable N-stop test fixture and failing tests**

Create a local test helper that can produce routes with 1, 6 and 10 stops. Assert travel, unloading and return behavior for the 6-stop route:

```ts
const fixture = makeScenarioWithStops(6)
expect(getFleetSnapshot(fixture.scenario, fixture.geometries, 0).trucks[0].status).toBe('EN_ROUTE')
expect(getFleetSnapshot(fixture.scenario, fixture.geometries, fixture.stops[3].plannedArrivalMinute).trucks[0].currentStopId)
  .toBe(fixture.stops[3].storeId)
expect(getFleetSnapshot(fixture.scenario, fixture.geometries, fixture.route.returnMinute).trucks[0].status)
  .toBe('DONE')
```

Also assert 1, 3, 6, 8 and 10 stop routes do not throw when queried through their valid timelines.

- [ ] **Step 2: Run RED test**

```bash
npm test -- tests/simulationEngine.test.ts
```

Expected: FAIL with the current `must contain exactly three stops in V0` error.

- [ ] **Step 3: Replace fixed `first/second/third` travel legs with generated legs**

```ts
function buildTravelLegs(route: RoutePlan, distances: number[]): TravelLeg[] {
  if (route.stops.length === 0) throw new Error(`Route ${route.id} requires at least one stop`)

  const outbound = route.stops.map((stop, index) => ({
    startMinute: index === 0 ? route.departureMinute : route.stops[index - 1].plannedDepartureMinute,
    endMinute: stop.plannedArrivalMinute,
    startDistanceKm: distances[index],
    endDistanceKm: distances[index + 1],
    nextStopId: stop.storeId,
    status: 'EN_ROUTE' as const,
  }))

  const lastStop = route.stops[route.stops.length - 1]
  return [
    ...outbound,
    {
      startMinute: lastStop.plannedDepartureMinute,
      endMinute: route.returnMinute,
      startDistanceKm: distances[route.stops.length],
      endDistanceKm: distances[route.stops.length + 1],
      nextStopId: null,
      status: 'RETURNING' as const,
    },
  ]
}
```

Keep unloading lookup dynamic with `unloadingStopIndex + 1`.

- [ ] **Step 4: Run focused GREEN tests**

```bash
npm test -- tests/simulationEngine.test.ts tests/routeAssets.test.ts
npm run build
```

Expected: PASS for Legacy three-stop routes and all new fixture sizes.

- [ ] **Step 5: Commit**

```bash
git add src/simulation/engine.ts tests/simulationEngine.test.ts
git commit -m "refactor: support arbitrary route stop counts"
```

---

### Task 3: Introduce MASS/PARCELS Cargo Semantics

**Files:**
- Create: `src/domain/cargo.ts`
- Modify: `src/domain/types.ts`
- Modify: `src/domain/scenarioValidation.ts`
- Modify: `src/scenario/cocaCoquiScenario.ts`
- Modify: `src/simulation/engine.ts`
- Modify: `src/components/FleetPanel.tsx`
- Modify: `src/components/KpiPanel.tsx`
- Modify: `src/map/mapPointDetails.ts`
- Modify: `tests/scenarioValidation.test.ts`
- Modify: `tests/simulationEngine.test.ts`
- Modify: `tests/dashboardComponents.test.tsx`
- Modify: `tests/mapPointDetails.test.ts`

**Interfaces:**
- Produces:

```ts
export type StopCargo =
  | { kind: 'MASS'; quantityKg: number }
  | { kind: 'PARCELS'; packageCount: number; volumeCm3: number }

export type VehicleCapacity =
  | { kind: 'MASS'; capacityKg: number }
  | { kind: 'PARCELS'; capacityCm3: number }

export type RemainingCargo =
  | { kind: 'MASS'; quantityKg: number; utilizationPct: number }
  | { kind: 'PARCELS'; packageCount: number; volumeCm3: number; utilizationPct: number }
```

- `Store` keeps `serviceMinutes` and gains optional `timeWindow?: { startMinute: number; endMinute: number }`.
- `PlannedStop` owns `cargo: StopCargo`.
- `Truck` owns `capacity: VehicleCapacity`.
- `TruckSnapshot` replaces `cargoKg` with `remainingCargo`.

- [ ] **Step 1: Write failing cargo validation tests**

Add one valid parcel scenario and invalid mixed-kind/capacity scenarios:

```ts
expect(validateScenario(parcelScenario)).toEqual([])
expect(validateScenario(overCapacityParcelScenario)).toContainEqual(expect.stringMatching(/capacity/i))
expect(validateScenario(massStopWithParcelTruck)).toContainEqual(expect.stringMatching(/cargo mode/i))
```

- [ ] **Step 2: Run RED validation test**

```bash
npm test -- tests/scenarioValidation.test.ts
```

Expected: FAIL because the domain only knows `demandKg` / `capacityKg`.

- [ ] **Step 3: Add cargo helpers**

Implement exhaustive helpers in `src/domain/cargo.ts`:

```ts
export function cargoFitsCapacity(stops: PlannedStop[], capacity: VehicleCapacity): boolean { /* exhaustive by kind */ }
export function initialCargo(stops: PlannedStop[], capacity: VehicleCapacity): RemainingCargo { /* sums kg or parcel count+volume */ }
export function remainingCargoAfter(stops: PlannedStop[], completedCount: number, capacity: VehicleCapacity): RemainingCargo { /* subtracts delivered cargo */ }
```

For `PARCELS`, utilization is `volumeCm3 / capacityCm3 * 100`; for `MASS`, utilization is `quantityKg / capacityKg * 100`. Clamp utilization to `[0, 100]`.

- [ ] **Step 4: Migrate Legacy scenario to MASS without changing its visible quantities**

Example:

```ts
const trucks: Truck[] = Array.from({ length: 5 }, (_, index) => ({
  id: `truck-0${index + 1}`,
  label: `Truck 0${index + 1}`,
  capacity: { kind: 'MASS', capacityKg: 2400 },
  fuelConsumptionLPer100Km: 18,
}))
```

and each stop:

```ts
cargo: { kind: 'MASS', quantityKg: 520 }
```

Remove `demandKg` from `Store`; route stops remain the source of delivered quantity.

- [ ] **Step 5: Update validation and engine**

Validation must still enforce assignment/schedule invariants, plus matching cargo kind and capacity.

Engine:

```ts
const completedDeliveries = completedStops.length
const remainingCargo = remainingCargoAfter(route.stops, completedDeliveries, truck.capacity)
```

Return `remainingCargo` in each `TruckSnapshot`.

- [ ] **Step 6: Write and satisfy UI semantics tests**

Parcel examples must render:

```text
12 paquetes
37% de capacidad ocupada
```

Legacy examples must still render:

```text
520 kg
```

Update `mapPointDetails.ts` to format cargo by discriminator and replace hardcoded `Depósito Coca Coqui` with `scenario.depot.name`. Change generic KPI wording from `Camiones activos` to `Vehículos activos`.

- [ ] **Step 7: Run GREEN regression**

```bash
npm test -- tests/scenarioValidation.test.ts tests/simulationEngine.test.ts tests/dashboardComponents.test.tsx tests/mapPointDetails.test.ts
npm run build
```

Expected: PASS; Legacy user-facing kg values are unchanged except generic vehicle wording.

- [ ] **Step 8: Commit**

```bash
git add src/domain/cargo.ts src/domain/types.ts src/domain/scenarioValidation.ts src/scenario/cocaCoquiScenario.ts src/simulation/engine.ts src/components/FleetPanel.tsx src/components/KpiPanel.tsx src/map/mapPointDetails.ts tests/scenarioValidation.test.ts tests/simulationEngine.test.ts tests/dashboardComponents.test.tsx tests/mapPointDetails.test.ts
git commit -m "feat: add scenario-aware cargo semantics"
```

---

### Task 4: Build the Offline Amazon Calibration Profile

**Files:**
- Create: `src/scenario/calibration/types.ts`
- Create: `scripts/calibrate-amazon.mjs`
- Create: `scripts/fixtures/amazon-mini/route_data.json`
- Create: `scripts/fixtures/amazon-mini/package_data.json`
- Create: `scripts/fixtures/amazon-mini/actual_sequences.json`
- Create: `scripts/fixtures/amazon-mini/travel_times.json`
- Create: `tests/calibrationScript.test.ts`
- Create after real offline run: `src/scenario/calibration/amazon-last-mile-v1.json`
- Modify: `package.json`

**Interfaces:**
- CLI:

```bash
node scripts/calibrate-amazon.mjs --input-dir <external-folder> --output src/scenario/calibration/amazon-last-mile-v1.json
```

- Profile stores quantile summaries, not raw observations:

```ts
export interface QuantileDistribution {
  min: number
  p10: number
  p25: number
  p50: number
  p75: number
  p90: number
  max: number
}

export interface CalibrationProfile {
  source: { dataset: string; license: string; sample: 'High'; methodVersion: '1' }
  summary: { routesAnalyzed: number; stopsAnalyzed: number; packagesAnalyzed: number }
  distributions: {
    stopsPerRoute: QuantileDistribution
    packagesPerStop: QuantileDistribution
    serviceSecondsPerStop: QuantileDistribution
    travelSecondsBetweenStops: QuantileDistribution
    timeWindowProbability: number
    timeWindowWidthMinutes: QuantileDistribution
    packageVolumeCm3: QuantileDistribution
    vehicleCapacityCm3: QuantileDistribution
    departureMinuteOfDayUtc: QuantileDistribution
  }
}
```

- [ ] **Step 1: Create project-authored synthetic Amazon-schema fixtures**

Use fake route/package IDs and synthetic coordinates. Include at least two routes: one `route_score: "High"` and one `"Low"`; only the High route may contribute to the profile.

Fixture fields must match the documented public schema: `route_score`, `executor_capacity_cm3`, stop `type`, package `planned_service_time_seconds`, `dimensions`, optional `time_window`, `actual` sequence and travel-time matrix.

- [ ] **Step 2: Write failing CLI test**

Use `execFileSync` with a temp output path:

```ts
execFileSync(process.execPath, [
  'scripts/calibrate-amazon.mjs',
  '--input-dir', 'scripts/fixtures/amazon-mini',
  '--output', outputPath,
])
const profile = JSON.parse(readFileSync(outputPath, 'utf8'))
expect(profile.source.sample).toBe('High')
expect(profile.summary.routesAnalyzed).toBe(1)
expect(profile.distributions.timeWindowProbability).toBeGreaterThanOrEqual(0)
expect(profile.distributions.timeWindowProbability).toBeLessThanOrEqual(1)
```

- [ ] **Step 3: Run RED**

```bash
npm test -- tests/calibrationScript.test.ts
```

Expected: FAIL because the calibration script does not exist.

- [ ] **Step 4: Implement exact extraction rules**

`calibrate-amazon.mjs` must:

1. parse `route_data.json`, `package_data.json`, `actual_sequences.json`, `travel_times.json`,
2. keep only routes with `route_score === 'High'`,
3. count only `Dropoff` stops for `stopsPerRoute`,
4. count packages at each dropoff for `packagesPerStop`,
5. sum `planned_service_time_seconds` across packages at a stop for stop service time,
6. multiply `depth_cm * height_cm * width_cm` for each package volume,
7. use observed sequence ranks to select only consecutive realized stop pairs for travel-time observations,
8. treat a stop as windowed when at least one package has both start and end timestamps,
9. calculate window width in minutes from valid positive windows,
10. parse `departure_time_utc` into minute-of-day,
11. store vehicle `executor_capacity_cm3`,
12. calculate nearest-rank min/p10/p25/p50/p75/p90/max summaries.

Reject an input set with zero High routes or missing required files.

- [ ] **Step 5: Run fixture GREEN**

```bash
npm test -- tests/calibrationScript.test.ts
```

Expected: PASS and no raw fixture records appear in the output beyond aggregate counts/quantiles.

- [ ] **Step 6: Produce the real profile outside the repository working tree**

Use the public no-account AWS bucket documented by Amazon/MIT. Download the four training files into a temporary external directory, not under the repo. Example workflow:

```bash
mkdir -p /tmp/fleetflow-amazon-training
aws s3 cp --no-sign-request s3://amazon-last-mile-challenges/almrrc2021/almrrc2021-data-training/model_build_inputs/route_data.json /tmp/fleetflow-amazon-training/route_data.json
aws s3 cp --no-sign-request s3://amazon-last-mile-challenges/almrrc2021/almrrc2021-data-training/model_build_inputs/package_data.json /tmp/fleetflow-amazon-training/package_data.json
aws s3 cp --no-sign-request s3://amazon-last-mile-challenges/almrrc2021/almrrc2021-data-training/model_build_inputs/actual_sequences.json /tmp/fleetflow-amazon-training/actual_sequences.json
aws s3 cp --no-sign-request s3://amazon-last-mile-challenges/almrrc2021/almrrc2021-data-training/model_build_inputs/travel_times.json /tmp/fleetflow-amazon-training/travel_times.json
node scripts/calibrate-amazon.mjs --input-dir /tmp/fleetflow-amazon-training --output src/scenario/calibration/amazon-last-mile-v1.json
```

If AWS CLI is absent, use the public S3 HTTPS equivalents; do not add the raw files to Git.

- [ ] **Step 7: Validate the real artifact**

Add assertions to `tests/calibrationScript.test.ts` that import the checked-in profile and require:

```ts
expect(profile.summary.routesAnalyzed).toBeGreaterThan(0)
expect(profile.summary.stopsAnalyzed).toBeGreaterThan(profile.summary.routesAnalyzed)
expect(profile.summary.packagesAnalyzed).toBeGreaterThan(profile.summary.stopsAnalyzed)
expect(profile.distributions.vehicleCapacityCm3.p50).toBeGreaterThan(0)
```

- [ ] **Step 8: Add package script and commit**

```json
"calibrate:amazon": "node scripts/calibrate-amazon.mjs"
```

Then:

```bash
git add scripts/calibrate-amazon.mjs scripts/fixtures/amazon-mini src/scenario/calibration package.json tests/calibrationScript.test.ts
git commit -m "feat: derive compact Amazon calibration profile"
```

---

### Task 5: Generate the Deterministic Córdoba Calibrated Scenario

**Files:**
- Create: `scripts/generate-calibrated-scenario.mjs`
- Create: `src/scenario/generated/cordoba-calibrated-v1.json`
- Create: `tests/calibratedScenario.test.ts`
- Modify: `package.json`

**Interfaces:**
- CLI:

```bash
node scripts/generate-calibrated-scenario.mjs \
  --profile src/scenario/calibration/amazon-last-mile-v1.json \
  --output src/scenario/generated/cordoba-calibrated-v1.json \
  --seed fleetflow-cordoba-v0.4
```

- Fixed V0.4 route stop counts: `[6, 9, 7, 8, 6, 10, 7, 7]` = 60.
- Fixed compressed target: 100 packages.
- Depot: existing Córdoba reference `[-64.1888, -31.4201]`.

- [ ] **Step 1: Write failing generated-scenario tests**

```ts
expect(scenario.trucks).toHaveLength(8)
expect(scenario.stores).toHaveLength(60)
expect(scenario.routes.reduce((n, route) => n + route.stops.length, 0)).toBe(60)
expect(totalPackages(scenario)).toBeGreaterThanOrEqual(90)
expect(totalPackages(scenario)).toBeLessThanOrEqual(110)
expect(validateScenario(scenario)).toEqual([])
```

Also execute the generator into a temp path with the canonical seed and deep-compare to the checked-in JSON to prove reproducibility.

- [ ] **Step 2: Run RED**

```bash
npm test -- tests/calibratedScenario.test.ts
```

Expected: FAIL because generator/output do not exist.

- [ ] **Step 3: Implement seeded random and quantile sampling**

Use a self-contained deterministic `mulberry32` PRNG and piecewise interpolation across quantile anchors. Do not call `Math.random()` anywhere in generation.

- [ ] **Step 4: Generate project-authored Córdoba coordinates**

Use eight stable route anchors around the central depot and small seeded jitter. Keep points within the current FleetFlow Córdoba operating envelope (roughly longitude `-64.25..-64.13`, latitude `-31.47..-31.38`). Coordinates are explicitly synthetic; no Amazon location is consumed.

- [ ] **Step 5: Generate parcel cargo and schedules**

For each stop:

- package count samples `packagesPerStop` but is normalized deterministically across 60 stops to exactly 100 total packages,
- package volume samples `packageVolumeCm3` once per package and sums by stop,
- service duration samples stop service seconds and converts to integer minutes with minimum 1,
- travel duration between stops samples `travelSecondsBetweenStops` and converts to integer minutes with minimum 1,
- time-window inclusion uses calibrated probability,
- window width samples the calibrated width distribution,
- window is centered around the planned arrival and clamped so baseline planned arrival is inside the window.

For each vehicle, sample `vehicleCapacityCm3`; if sampled capacity is below assigned route volume, raise it to `ceil(routeVolume * 1.15)` so generated baseline is valid while retaining the sampled value when already sufficient.

Departure times are rank-normalized from sampled `departureMinuteOfDayUtc` into offsets spanning 0–18 simulated minutes after 06:00.

- [ ] **Step 6: Generate the canonical artifact**

```bash
npm run generate:calibrated
```

with:

```json
"generate:calibrated": "node scripts/generate-calibrated-scenario.mjs --profile src/scenario/calibration/amazon-last-mile-v1.json --output src/scenario/generated/cordoba-calibrated-v1.json --seed fleetflow-cordoba-v0.4"
```

- [ ] **Step 7: Run GREEN and commit**

```bash
npm test -- tests/calibratedScenario.test.ts tests/scenarioValidation.test.ts
npm run build
git add scripts/generate-calibrated-scenario.mjs src/scenario/generated/cordoba-calibrated-v1.json tests/calibratedScenario.test.ts package.json
git commit -m "feat: generate calibrated Cordoba last-mile scenario"
```

---

### Task 6: Generate Eight Static Road Routes for the Calibrated Scenario

**Files:**
- Modify: `scripts/prepare-routes.mjs`
- Create: `public/data/cordoba-calibrated-routes.geojson`
- Modify: `tests/routeAssets.test.ts`
- Modify: `package.json`

**Interfaces:**
- CLI:

```bash
node scripts/prepare-routes.mjs \
  --scenario src/scenario/generated/cordoba-calibrated-v1.json \
  --output public/data/cordoba-calibrated-routes.geojson
```

- [ ] **Step 1: Add RED route-asset tests for calibrated geometry**

Import the generated scenario JSON and the checked-in calibrated GeoJSON. Require 8 features and validate each feature against its route through `routeCollectionToIndex`.

```ts
const index = routeCollectionToIndex(calibratedRoutes, calibratedScenario)
expect(Object.keys(index)).toHaveLength(8)
for (const route of calibratedScenario.routes) {
  expect(index[route.geometryId].properties.waypointDistancesKm).toHaveLength(route.stops.length + 2)
}
```

- [ ] **Step 2: Run RED**

```bash
npm test -- tests/routeAssets.test.ts
```

Expected: FAIL because calibrated route asset is absent.

- [ ] **Step 3: Generalize `prepare-routes.mjs` inputs**

Remove hardcoded five trucks/coordinates. Parse `--scenario` JSON, resolve each route's stop positions, and build:

```js
const coordinates = [
  scenario.depot.position,
  ...route.stops.map((stop) => storeById.get(stop.storeId).position),
  scenario.depot.position,
]
```

For every OSRM response require:

```js
route.legs.length === coordinates.length - 1
waypointDistancesKm.length === routePlan.stops.length + 2
```

Set feature ID to `routePlan.geometryId`, not a generated truck-name convention.

- [ ] **Step 4: Generate the calibrated static asset**

```bash
npm run prepare:routes:calibrated
```

Package script:

```json
"prepare:routes:calibrated": "node scripts/prepare-routes.mjs --scenario src/scenario/generated/cordoba-calibrated-v1.json --output public/data/cordoba-calibrated-routes.geojson"
```

This is the only step in V0.4 allowed to call OSRM.

- [ ] **Step 5: Run GREEN and verify no runtime route URL exists**

```bash
npm test -- tests/routeAssets.test.ts tests/mapPresentation.test.ts
npm run build
grep -R "router.project-osrm.org" src public || true
```

Expected: tests/build PASS; grep finds no runtime source usage.

- [ ] **Step 6: Commit**

```bash
git add scripts/prepare-routes.mjs public/data/cordoba-calibrated-routes.geojson tests/routeAssets.test.ts package.json
git commit -m "feat: add calibrated Cordoba road routes"
```

---

### Task 7: Add Scenario Registry and Atomic Runtime Switching

**Files:**
- Create: `src/scenario/scenarioRegistry.ts`
- Create: `src/components/ScenarioSwitcher.tsx`
- Modify: `src/App.tsx`
- Modify: `src/app.css`
- Create: `tests/scenarioRegistry.test.ts`
- Create: `tests/scenarioSwitching.test.tsx`
- Modify: `tests/appSmoke.test.tsx`

**Interfaces:**

```ts
export type ScenarioId = 'cordoba-calibrated' | 'coca-coqui-legacy'

export interface ScenarioProvenance {
  mode: 'CALIBRATED' | 'SYNTHETIC'
  shortLabel: string
  summary: string
  sourceName?: string
  sourceUrl?: string
  sourceLicense?: string
  methodVersion?: string
  syntheticElements: string[]
  limitations: string[]
}

export interface ScenarioDefinition {
  id: ScenarioId
  label: string
  badge: string
  routeAsset: string
  scenario: FleetScenario
  provenance: ScenarioProvenance
}

export const DEFAULT_SCENARIO_ID: ScenarioId = 'cordoba-calibrated'
export function getScenarioDefinition(id: ScenarioId): ScenarioDefinition
```

- [ ] **Step 1: Write RED registry tests**

```ts
expect(DEFAULT_SCENARIO_ID).toBe('cordoba-calibrated')
expect(getScenarioDefinition('cordoba-calibrated').scenario.trucks).toHaveLength(8)
expect(getScenarioDefinition('coca-coqui-legacy').scenario.trucks).toHaveLength(5)
expect(getScenarioDefinition('cordoba-calibrated').routeAsset).toBe('./data/cordoba-calibrated-routes.geojson')
```

- [ ] **Step 2: Implement registry with explicit provenance**

Calibrated summary:

```text
Comportamiento derivado de datos operacionales públicos. Ubicaciones y recorridos adaptados a Córdoba.
```

Legacy summary:

```text
Cinco camiones y quince entregas creadas para la primera versión de FleetFlow.
```

Do not use Amazon/Mercado Libre branding as scenario labels.

- [ ] **Step 3: Write RED scenario-switching UI test**

Mock `fetch` by URL and render `<App />`. Assert initial calibrated request, then click Legacy:

```ts
expect(fetch).toHaveBeenCalledWith('./data/cordoba-calibrated-routes.geojson', expect.anything())
await user.click(screen.getByRole('radio', { name: /Coca Coqui/i }))
expect(fetch).toHaveBeenCalledWith('./data/coca-coqui-routes.geojson', expect.anything())
expect(screen.getByText('06:00')).toBeInTheDocument()
```

Start the simulation before switching and assert the new scenario is paused/reset.

- [ ] **Step 4: Implement atomic active-scenario state in `App.tsx`**

Replace the module-global Coca Coqui constants with:

```ts
const [scenarioId, setScenarioId] = useState<ScenarioId>(DEFAULT_SCENARIO_ID)
const activeDefinition = getScenarioDefinition(scenarioId)
const activeScenario = activeDefinition.scenario
const simulationEndMinute = Math.max(...activeScenario.routes.map((route) => route.returnMinute))
```

On change:

```ts
function changeScenario(nextId: ScenarioId) {
  setIsPlaying(false)
  setSimulationMinute(0)
  setRoutes(null)
  setRouteError(false)
  setScenarioId(nextId)
}
```

Route-loading effect must depend on `activeDefinition.routeAsset`, validate against `activeScenario`, and ignore stale async responses using the existing cancellation pattern.

Give `FleetMap` a `key={scenarioId}` so any open popup/map layer state is destroyed when scenarios switch.

- [ ] **Step 5: Implement connected-rail segmented switcher**

Use a semantic radio group, not a native gray `<select>`:

```tsx
<fieldset className="scenario-switcher">
  <legend>Escenario</legend>
  {/* two labelled radio inputs */}
</fieldset>
```

Style it inside `.top-rail` without creating a new floating card.

- [ ] **Step 6: Run GREEN**

```bash
npm test -- tests/scenarioRegistry.test.ts tests/scenarioSwitching.test.tsx tests/appSmoke.test.tsx
npm run build
```

- [ ] **Step 7: Commit**

```bash
git add src/scenario/scenarioRegistry.ts src/components/ScenarioSwitcher.tsx src/App.tsx src/app.css tests/scenarioRegistry.test.ts tests/scenarioSwitching.test.tsx tests/appSmoke.test.tsx
git commit -m "feat: switch between calibrated and legacy scenarios"
```

---

### Task 8: Add Provenance Disclosure and Calibrated Operational Copy

**Files:**
- Create: `src/components/ScenarioProvenance.tsx`
- Modify: `src/components/FleetPanel.tsx`
- Modify: `src/components/KpiPanel.tsx`
- Modify: `src/map/mapPointDetails.ts`
- Modify: `src/App.tsx`
- Modify: `src/app.css`
- Modify: `tests/dashboardComponents.test.tsx`
- Modify: `tests/mapPointDetails.test.ts`
- Modify: `tests/mapPresentation.test.ts`

**Interfaces:**
- Consumes `ScenarioProvenance` from registry.
- First-level calibrated disclosure is always visible; details use native `<details>` / `<summary>`.

- [ ] **Step 1: Write RED provenance/copy tests**

Calibrated mode must visibly include:

```text
ESCENARIO CALIBRADO
Comportamiento derivado de datos operacionales públicos.
Fuente y método
```

Legacy mode must include:

```text
ESCENARIO SINTÉTICO · LEGACY V0
```

No rendered text may match `/Amazon Córdoba|Mercado Libre Córdoba|rutas reales de Amazon/i`.

- [ ] **Step 2: Implement `ScenarioProvenance`**

```tsx
<section className="scenario-provenance" aria-label="Procedencia del escenario">
  <strong>{provenance.shortLabel}</strong>
  <span>{provenance.summary}</span>
  <details>
    <summary>Fuente y método</summary>
    {/* source, license, synthetic elements, limitations */}
  </details>
</section>
```

For calibrated mode, link to the official Registry of Open Data/Amazon Science source with normal anchor semantics.

- [ ] **Step 3: Finish generic parcel copy**

Fleet rows and truck popups in calibrated mode should prefer:

```text
Vehículo 03
28 paquetes
5 / 8 entregas
37% de capacidad ocupada
```

Store popup should say `Entrega 037`, package count and service minutes. Legacy keeps kg and Coca Coqui names.

- [ ] **Step 4: Keep provenance visually subordinate to the map**

Place it as a compact footer inside the connected right rail or top rail, with internal divider only — no floating card, no modal, no blocking overlay.

- [ ] **Step 5: Run GREEN**

```bash
npm test -- tests/dashboardComponents.test.tsx tests/mapPointDetails.test.ts tests/mapPresentation.test.ts
npm run build
```

- [ ] **Step 6: Commit**

```bash
git add src/components/ScenarioProvenance.tsx src/components/FleetPanel.tsx src/components/KpiPanel.tsx src/map/mapPointDetails.ts src/App.tsx src/app.css tests/dashboardComponents.test.tsx tests/mapPointDetails.test.ts tests/mapPresentation.test.ts
git commit -m "feat: explain calibrated scenario provenance"
```

---

### Task 9: Documentation, Full Regression, PR and Deployment Verification

**Files:**
- Modify: `README.md`
- Create: `DATA_LICENSES.md`
- Modify only if needed for generated-asset checks: `.github/workflows/ci.yml`
- Test: complete `tests/` suite

**Interfaces:**
- Documents exact commands to regenerate calibration profile, scenario and route asset.
- Establishes licensing boundary between MIT software and CC BY-NC-derived calibration data.

- [ ] **Step 1: Update README architecture and default experience**

Document:

```text
External Amazon training data (offline only)
  → compact calibration profile
  → seeded Córdoba scenario generator
  → static road-route preparation
  → Scenario Registry
  → Simulation Engine
```

State plainly:

- Córdoba geography is synthetic/project-authored,
- operational parameters are calibrated from public data,
- the displayed routes are not Amazon or Mercado Libre operations,
- raw Amazon files are never shipped,
- Legacy V0 is selectable for comparison.

- [ ] **Step 2: Add `DATA_LICENSES.md`**

Explicitly state:

```text
The FleetFlow source code is licensed under MIT.
`src/scenario/calibration/amazon-last-mile-v1.json` is a derived calibration artifact based on material from the 2021 Amazon Last Mile Routing Research Challenge Dataset and is not covered by the repository's MIT license. Source material is provided under CC BY-NC 4.0; see the official dataset registry for terms and attribution.
```

Include the official source/citation and mark `scripts/fixtures/amazon-mini/*` as project-authored synthetic fixtures, not copied Amazon records.

- [ ] **Step 3: Add deterministic artifact regression if CI does not already cover it**

CI must run normal tests/build without downloading raw Amazon data or calling OSRM. The checked-in scenario determinism test and route asset validation are sufficient; do not add network generation to CI.

- [ ] **Step 4: Run complete local/branch verification**

```bash
npm test
npm run build
```

Expected: all tests PASS; Vite may retain the existing non-blocking large-chunk warning but no TypeScript/build error.

- [ ] **Step 5: Inspect branch diff for scope**

Verify no raw third-party data file was accidentally committed and no unrelated GeoPlatform work appears:

```bash
git status --short
git diff main...HEAD --stat
git diff main...HEAD --name-only
```

Expected: only FleetFlow V0.4 domain/scenario/UI/scripts/tests/docs plus the compact calibration profile and calibrated GeoJSON route asset.

- [ ] **Step 6: Open PR**

Title:

```text
feat: ship FleetFlow V0.4 calibrated scenarios
```

PR body must state 8 vehicles / 60 stops / parcel semantics, Legacy preservation, Amazon calibration/license boundary, no runtime routing, and the exact branch test/build results.

- [ ] **Step 7: Wait for PR CI and squash merge only on GREEN**

Squash title:

```text
feat: ship FleetFlow V0.4 calibrated scenarios
```

Do not merge on branch CI alone; require the pull-request-triggered CI run for the exact head SHA.

- [ ] **Step 8: Verify post-merge production**

On the merged `main` SHA, require:

- CI `success`,
- GitHub Pages deployment `success`,
- clean public URL loads calibrated mode by default,
- scenario switcher can move to Legacy and back,
- calibrated map shows 8 vehicles / 60 delivery points,
- no runtime OSRM request appears in browser network behavior.

- [ ] **Step 9: Final commit for docs if Task 9 changes precede PR**

```bash
git add README.md DATA_LICENSES.md .github/workflows/ci.yml
git commit -m "docs: document FleetFlow calibration provenance"
```

Skip `.github/workflows/ci.yml` from `git add` when no workflow change was required.
