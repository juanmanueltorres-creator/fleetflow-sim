# FleetFlow V0.4 — Calibrated Scenarios Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `Córdoba Last-Mile · Calibrado` the default FleetFlow experience with 8 vehicles, exactly 60 stops and parcel semantics calibrated from the public Amazon Last Mile Routing Research Challenge dataset, while preserving `Coca Coqui · Legacy V0` as a selectable baseline.

**Architecture:** Generalize domain, route geometry and simulation so they no longer assume five routes or three stops. Raw third-party data stays outside the repo; an offline calibration script emits a compact profile, a seeded generator emits the Córdoba scenario, and offline route preparation emits checked-in road GeoJSON. A scenario registry selects one coherent bundle — scenario, route asset and provenance — for the existing map/dashboard.

**Tech Stack:** React 19.1.1, TypeScript 5.7.2, Vite 6.1.0, Vitest 3.0.5, MapLibre GL 6.6.0, Turf 7.4.0, Node.js 22 scripts, public OSRM only during offline route preparation.

**Spec:** `docs/superpowers/specs/2026-08-29-fleetflow-v0-4-calibrated-scenarios-design.md`

## Global Constraints

- `cordoba-calibrated` is the fresh-load default.
- Calibrated scenario is exactly **8 vehicles / 60 stops / 100 packages**. The approved 90–110 range is therefore satisfied deterministically.
- Legacy remains exactly **5 vehicles / 15 stops**.
- Raw Amazon files are never committed, bundled, browser-fetched, required by CI or published by Pages.
- Amazon source material is CC BY-NC 4.0; FleetFlow code remains MIT. `DATA_LICENSES.md` explicitly excludes the derived profile from the MIT grant and preserves source attribution/terms.
- Displayed Córdoba coordinates/roads are project-authored context. The UI never claims they are Amazon or Mercado Libre operations.
- No runtime routing request. Both scenario route assets are checked into `public/data/`.
- V0.4 excludes incidents, failed attempts, absences, breakdowns, reassignment, OR-Tools and dynamic replanning.
- Keep internal entity name `Store` in V0.4; user-facing language may say parada/entrega.
- Route geometry is the single source of route distance; remove `RoutePlan.distanceKm`.
- CI remains network-free: `npm test` + `npm run build` validate checked-in generated artifacts.
- Every task uses RED → GREEN and ends with a focused commit.

---

## Planned File Structure

### Domain/runtime
- `src/domain/types.ts` — generic cargo, delivery-window and snapshot contracts.
- `src/domain/cargo.ts` — cargo aggregation/subtraction/utilization helpers.
- `src/domain/scenarioValidation.ts` — invariants for MASS and PARCELS.
- `src/map/routeAssets.ts` — dynamic route/waypoint validation and distance lookup.
- `src/simulation/engine.ts` — N-stop engine.
- `src/simulation/metrics.ts` — metrics from scenario + geometry.

### Calibration/scenario
- `src/scenario/calibration/types.ts` — calibration profile contract.
- `src/scenario/calibration/amazon-last-mile-v1.json` — compact derived profile only.
- `src/scenario/generated/cordoba-calibrated-v1.json` — deterministic 8/60/100 scenario.
- `src/scenario/cocaCoquiScenario.ts` — Legacy migrated to generic cargo contracts.
- `src/scenario/scenarioRegistry.ts` — definitions, default ID and provenance.

### Offline scripts
- `scripts/calibrate-amazon.mjs` — external official JSON → compact quantiles.
- `scripts/generate-calibrated-scenario.mjs` — seeded profile → Córdoba scenario.
- `scripts/prepare-routes.mjs` — scenario JSON → OSRM → static GeoJSON.
- `scripts/fixtures/amazon-mini/*` — project-authored synthetic schema fixtures only.

### UI/tests/docs
- Create `src/components/ScenarioSwitcher.tsx`, `src/components/ScenarioProvenance.tsx`.
- Modify `src/components/FleetPanel.tsx`, `src/components/KpiPanel.tsx`, `src/map/mapPointDetails.ts`, `src/App.tsx`, `src/app.css`.
- Extend current tests and create `tests/calibrationScript.test.ts`, `tests/calibratedScenario.test.ts`, `tests/scenarioRegistry.test.ts`, `tests/scenarioSwitching.test.tsx`.
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
- Produces `routeCollectionToIndex(collection: RouteGeometryCollection, scenario: FleetScenario): RouteGeometryIndex`.
- Produces `routeDistanceKm(feature: RouteGeometryFeature): number`.
- `RouteGeometryProperties.waypointDistancesKm` becomes `number[]`.
- `RoutePlan.distanceKm` is removed.
- `deriveFleetMetrics(scenario, snapshot, geometries)` receives `RouteGeometryIndex`.

- [ ] **Step 1: Write failing variable-geometry tests**

Build a one-route/two-stop fixture with distances `[0, 1.2, 2.4, 3.1]`:

```ts
const index = routeCollectionToIndex(collection, scenario)
expect(index['route-test']).toBeDefined()
expect(routeDistanceKm(index['route-test'])).toBeCloseTo(3.1)
expect(() => routeCollectionToIndex(badCount, scenario)).toThrow(/geometry ids/i)
expect(() => routeCollectionToIndex(badWaypoints, scenario)).toThrow(/stops \+ 2/i)
expect(() => routeCollectionToIndex(nonMonotonic, scenario)).toThrow(/strictly increasing/i)
```

- [ ] **Step 2: Run RED**

```bash
npm test -- tests/routeAssets.test.ts
```

Expected: FAIL because current code requires exactly five features/five distances.

- [ ] **Step 3: Generalize `routeAssets.ts`**

```ts
export interface RouteGeometryProperties {
  truckId: string
  waypointDistancesKm: number[]
}

export function routeDistanceKm(feature: RouteGeometryFeature): number {
  const distances = feature.properties.waypointDistancesKm
  const distance = distances[distances.length - 1]
  if (distance === undefined || distance <= 0) throw new Error(`Route ${feature.id} has no positive distance`)
  return distance
}

export function routeCollectionToIndex(
  collection: RouteGeometryCollection,
  scenario: FleetScenario,
): RouteGeometryIndex {
  const expected = new Map(scenario.routes.map((route) => [route.geometryId, route]))
  if (collection.type !== 'FeatureCollection' || collection.features.length !== expected.size) {
    throw new Error('Route geometry ids must match the active scenario')
  }

  const seen = new Set<string>()
  const entries = collection.features.map((feature) => {
    if (typeof feature.id !== 'string' || feature.geometry.type !== 'LineString') {
      throw new Error('Every route geometry requires a string id and LineString')
    }
    const route = expected.get(feature.id)
    if (!route || seen.has(feature.id)) throw new Error(`Unexpected or duplicate route geometry ${feature.id}`)
    seen.add(feature.id)
    if (feature.properties.truckId !== route.truckId) throw new Error(`Route ${route.id} truck id mismatch`)

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

- [ ] **Step 4: Remove duplicated scenario distance and use geometry in engine**

Remove `distanceKm` from `RoutePlan` and from every Legacy route. In `engine.ts`:

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

  return {
    completedDeliveries: snapshot.trucks.reduce((total, truck) => total + truck.completedDeliveries, 0),
    totalDeliveries: scenario.stores.length,
    activeTrucks: snapshot.trucks.filter((truck) => ACTIVE_STATUSES.has(truck.status)).length,
    plannedDistanceKm,
    estimatedFuelUsedL: snapshot.trucks.reduce((total, truck) => total + truck.estimatedFuelUsedL, 0),
  }
}
```

Update `App.tsx` to pass the active route index.

- [ ] **Step 6: Run GREEN and build**

```bash
npm test -- tests/routeAssets.test.ts tests/metrics.test.ts tests/simulationEngine.test.ts
npm run build
```

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
- Consumes dynamic waypoint arrays from Task 1.
- Keeps public `getFleetSnapshot(scenario, geometries, simulationMinute)` signature.

- [ ] **Step 1: Add N-stop fixtures/tests**

Create a test helper for 1, 3, 6, 8 and 10 stops. For six stops:

```ts
const fixture = makeScenarioWithStops(6)
expect(getFleetSnapshot(fixture.scenario, fixture.geometries, 0).trucks[0].status).toBe('EN_ROUTE')
expect(
  getFleetSnapshot(
    fixture.scenario,
    fixture.geometries,
    fixture.stops[3].plannedArrivalMinute,
  ).trucks[0].currentStopId,
).toBe(fixture.stops[3].storeId)
expect(getFleetSnapshot(fixture.scenario, fixture.geometries, fixture.route.returnMinute).trucks[0].status)
  .toBe('DONE')
```

- [ ] **Step 2: Run RED**

```bash
npm test -- tests/simulationEngine.test.ts
```

Expected: current `exactly three stops` failure.

- [ ] **Step 3: Generate travel legs programmatically**

```ts
function buildTravelLegs(route: RoutePlan, distances: number[]): TravelLeg[] {
  if (route.stops.length === 0) throw new Error(`Route ${route.id} requires at least one stop`)

  const outbound: TravelLeg[] = route.stops.map((stop, index) => ({
    startMinute: index === 0 ? route.departureMinute : route.stops[index - 1].plannedDepartureMinute,
    endMinute: stop.plannedArrivalMinute,
    startDistanceKm: distances[index],
    endDistanceKm: distances[index + 1],
    nextStopId: stop.storeId,
    status: 'EN_ROUTE',
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
      status: 'RETURNING',
    },
  ]
}
```

Keep unloading distance at `waypointDistances[unloadingStopIndex + 1]`.

- [ ] **Step 4: Run GREEN/build**

```bash
npm test -- tests/simulationEngine.test.ts tests/routeAssets.test.ts
npm run build
```

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

`Store` removes `demandKg`, keeps `serviceMinutes`, and gains optional `timeWindow?: { startMinute: number; endMinute: number }`. `PlannedStop` owns `cargo`; `Truck` owns `capacity`; `TruckSnapshot` owns `remainingCargo`.

- [ ] **Step 1: Write RED cargo/validation tests**

```ts
expect(validateScenario(parcelScenario)).toEqual([])
expect(validateScenario(overCapacityParcelScenario)).toContainEqual(expect.stringMatching(/capacity/i))
expect(validateScenario(massStopWithParcelTruck)).toContainEqual(expect.stringMatching(/cargo mode/i))
expect(validateScenario(vehicleWithoutRoute)).toContainEqual(expect.stringMatching(/exactly one route/i))
expect(validateScenario(vehicleWithTwoRoutes)).toContainEqual(expect.stringMatching(/exactly one route/i))
expect(validateScenario(emptyRoute)).toContainEqual(expect.stringMatching(/at least one stop/i))
```

- [ ] **Step 2: Run RED**

```bash
npm test -- tests/scenarioValidation.test.ts
```

- [ ] **Step 3: Implement cargo helpers exactly**

```ts
function clampPct(value: number): number {
  return Math.min(100, Math.max(0, value))
}

export function initialCargo(stops: PlannedStop[], capacity: VehicleCapacity): RemainingCargo {
  if (capacity.kind === 'MASS') {
    if (stops.some((stop) => stop.cargo.kind !== 'MASS')) throw new Error('Route cargo mode must match vehicle capacity')
    const quantityKg = stops.reduce((sum, stop) => sum + (stop.cargo.kind === 'MASS' ? stop.cargo.quantityKg : 0), 0)
    return { kind: 'MASS', quantityKg, utilizationPct: clampPct((quantityKg / capacity.capacityKg) * 100) }
  }

  if (stops.some((stop) => stop.cargo.kind !== 'PARCELS')) throw new Error('Route cargo mode must match vehicle capacity')
  const packageCount = stops.reduce((sum, stop) => sum + (stop.cargo.kind === 'PARCELS' ? stop.cargo.packageCount : 0), 0)
  const volumeCm3 = stops.reduce((sum, stop) => sum + (stop.cargo.kind === 'PARCELS' ? stop.cargo.volumeCm3 : 0), 0)
  return { kind: 'PARCELS', packageCount, volumeCm3, utilizationPct: clampPct((volumeCm3 / capacity.capacityCm3) * 100) }
}

export function remainingCargoAfter(
  stops: PlannedStop[],
  completedCount: number,
  capacity: VehicleCapacity,
): RemainingCargo {
  return initialCargo(stops.slice(completedCount), capacity)
}

export function cargoFitsCapacity(stops: PlannedStop[], capacity: VehicleCapacity): boolean {
  if (capacity.kind === 'MASS') {
    if (stops.some((stop) => stop.cargo.kind !== 'MASS')) return false
    const quantityKg = stops.reduce((sum, stop) => sum + (stop.cargo.kind === 'MASS' ? stop.cargo.quantityKg : 0), 0)
    return quantityKg <= capacity.capacityKg
  }

  if (stops.some((stop) => stop.cargo.kind !== 'PARCELS')) return false
  const volumeCm3 = stops.reduce((sum, stop) => sum + (stop.cargo.kind === 'PARCELS' ? stop.cargo.volumeCm3 : 0), 0)
  return volumeCm3 <= capacity.capacityCm3
}
```

- [ ] **Step 4: Migrate Legacy to MASS without changing quantities**

```ts
const trucks: Truck[] = Array.from({ length: 5 }, (_, index) => ({
  id: `truck-0${index + 1}`,
  label: `Truck 0${index + 1}`,
  capacity: { kind: 'MASS', capacityKg: 2400 },
  fuelConsumptionLPer100Km: 18,
}))
```

Each Legacy stop uses e.g. `cargo: { kind: 'MASS', quantityKg: 520 }`.

- [ ] **Step 5: Make scenario validation match the spec**

In addition to existing missing-reference/assignment/schedule checks:
- count routes by `truckId` and require every scenario vehicle to have exactly one route,
- reject routes with zero stops,
- reject non-positive cargo quantities/volumes/capacities,
- emit cargo-mode mismatch before capacity error,
- use `cargoFitsCapacity` for capacity,
- validate optional `Store.timeWindow` with `startMinute >= 0` and `endMinute > startMinute`,
- keep every store assigned exactly once,
- keep arrival/departure/return chronology checks.

Engine uses:

```ts
const completedDeliveries = completedStops.length
const remainingCargo = remainingCargoAfter(route.stops, completedDeliveries, truck.capacity)
```

Return `remainingCargo` in `TruckSnapshot`.

- [ ] **Step 6: Add UI tests and copy**

Parcel fixture must render `12 paquetes` and `37% de capacidad ocupada`; Legacy still renders `520 kg`. Make depot popup title `scenario.depot.name`. Rename KPI label to `Vehículos activos`.

- [ ] **Step 7: Run GREEN/build**

```bash
npm test -- tests/scenarioValidation.test.ts tests/simulationEngine.test.ts tests/dashboardComponents.test.tsx tests/mapPointDetails.test.ts
npm run build
```

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
- Create after the documented offline run: `src/scenario/calibration/amazon-last-mile-v1.json`
- Modify: `package.json`

**Interfaces:**

Canonical command:

```bash
node scripts/calibrate-amazon.mjs --input-dir /tmp/fleetflow-amazon-training --output src/scenario/calibration/amazon-last-mile-v1.json
```

Profile contract:

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

- [ ] **Step 1: Create synthetic schema fixtures**

Use fake IDs/coordinates and exactly two routes: one `High`, one `Low`. High route has station + three dropoffs, four packages, one valid time window and a complete actual sequence/travel matrix. Low route must have data that would change quantiles if accidentally included. These fixtures are authored for FleetFlow and contain no copied Amazon records.

- [ ] **Step 2: Write RED CLI test**

```ts
execFileSync(process.execPath, [
  'scripts/calibrate-amazon.mjs',
  '--input-dir', 'scripts/fixtures/amazon-mini',
  '--output', outputPath,
])
const profile = JSON.parse(readFileSync(outputPath, 'utf8'))
expect(profile.source.sample).toBe('High')
expect(profile.summary.routesAnalyzed).toBe(1)
expect(profile.summary.stopsAnalyzed).toBe(3)
expect(profile.summary.packagesAnalyzed).toBe(4)
expect(profile.distributions.timeWindowProbability).toBeGreaterThanOrEqual(0)
expect(profile.distributions.timeWindowProbability).toBeLessThanOrEqual(1)
```

- [ ] **Step 3: Run RED**

```bash
npm test -- tests/calibrationScript.test.ts
```

- [ ] **Step 4: Implement extraction rules and quantiles**

Rules:
1. Parse `route_data.json`, `package_data.json`, `actual_sequences.json`, `travel_times.json` from the supplied external directory.
2. Keep only `route_score === 'High'`.
3. `stopsPerRoute`: count `Dropoff` stops only.
4. `packagesPerStop`: number of packages at each dropoff.
5. `serviceSecondsPerStop`: sum package `planned_service_time_seconds` per dropoff.
6. `packageVolumeCm3`: `depth_cm * height_cm * width_cm` per package.
7. `travelSecondsBetweenStops`: sort `actual` stop ranks and take travel matrix values only for consecutive observed stops.
8. Windowed stop: at least one package has both start/end; width uses positive `(end-start)` minutes.
9. Departure: parse `departure_time_utc` to minute-of-day.
10. Capacity: collect `executor_capacity_cm3` per selected route.
11. Reject missing files or zero High routes.

Use exact nearest-index summary code:

```js
function quantile(sorted, p) {
  return sorted[Math.round((sorted.length - 1) * p)]
}

function summarize(values) {
  if (values.length === 0) throw new Error('Cannot summarize an empty distribution')
  const sorted = [...values].sort((a, b) => a - b)
  return {
    min: sorted[0],
    p10: quantile(sorted, 0.10),
    p25: quantile(sorted, 0.25),
    p50: quantile(sorted, 0.50),
    p75: quantile(sorted, 0.75),
    p90: quantile(sorted, 0.90),
    max: sorted[sorted.length - 1],
  }
}
```

Read files sequentially and release raw object references after aggregation; if the full package/travel JSON requires more Node heap on the implementation machine, run this offline command with `NODE_OPTIONS=--max-old-space-size=8192`. CI never runs raw calibration.

- [ ] **Step 5: Run fixture GREEN**

```bash
npm test -- tests/calibrationScript.test.ts
```

- [ ] **Step 6: Produce the real profile outside the repo tree**

```bash
mkdir -p /tmp/fleetflow-amazon-training
aws s3 cp --no-sign-request s3://amazon-last-mile-challenges/almrrc2021/almrrc2021-data-training/model_build_inputs/route_data.json /tmp/fleetflow-amazon-training/route_data.json
aws s3 cp --no-sign-request s3://amazon-last-mile-challenges/almrrc2021/almrrc2021-data-training/model_build_inputs/package_data.json /tmp/fleetflow-amazon-training/package_data.json
aws s3 cp --no-sign-request s3://amazon-last-mile-challenges/almrrc2021/almrrc2021-data-training/model_build_inputs/actual_sequences.json /tmp/fleetflow-amazon-training/actual_sequences.json
aws s3 cp --no-sign-request s3://amazon-last-mile-challenges/almrrc2021/almrrc2021-data-training/model_build_inputs/travel_times.json /tmp/fleetflow-amazon-training/travel_times.json
NODE_OPTIONS=--max-old-space-size=8192 node scripts/calibrate-amazon.mjs --input-dir /tmp/fleetflow-amazon-training --output src/scenario/calibration/amazon-last-mile-v1.json
```

The bucket is public/no-account. If AWS CLI is unavailable, use the equivalent public S3 object URLs from the same prefix; raw files must still live outside the repository.

- [ ] **Step 7: Validate checked-in real artifact**

```ts
expect(profile.summary.routesAnalyzed).toBeGreaterThan(0)
expect(profile.summary.stopsAnalyzed).toBeGreaterThan(profile.summary.routesAnalyzed)
expect(profile.summary.packagesAnalyzed).toBeGreaterThan(profile.summary.stopsAnalyzed)
expect(profile.distributions.vehicleCapacityCm3.p50).toBeGreaterThan(0)
```

- [ ] **Step 8: Add script and commit**

`package.json`:

```json
"calibrate:amazon": "node scripts/calibrate-amazon.mjs"
```

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

```bash
node scripts/generate-calibrated-scenario.mjs --profile src/scenario/calibration/amazon-last-mile-v1.json --output src/scenario/generated/cordoba-calibrated-v1.json --seed fleetflow-cordoba-v0.4
```

Fixed route stop counts: `[6, 9, 7, 8, 6, 10, 7, 7]`. Fixed package target: `100`. Depot: `[-64.1888, -31.4201]`.

Exact route anchors:

```js
const ROUTE_ANCHORS = [
  [-64.2220, -31.3970],
  [-64.1880, -31.3920],
  [-64.1540, -31.4010],
  [-64.1450, -31.4250],
  [-64.1580, -31.4520],
  [-64.1890, -31.4580],
  [-64.2210, -31.4470],
  [-64.2360, -31.4190],
]
```

Each stop uses seeded jitter of at most `±0.008` longitude and `±0.007` latitude around its assigned anchor.

- [ ] **Step 1: Write RED scenario tests**

```ts
expect(scenario.trucks).toHaveLength(8)
expect(scenario.stores).toHaveLength(60)
expect(scenario.routes.reduce((n, route) => n + route.stops.length, 0)).toBe(60)
expect(totalPackages(scenario)).toBe(100)
expect(validateScenario(scenario)).toEqual([])
```

Run generator to a temp path with canonical seed and `expect(generated).toEqual(checkedInScenario)`.

- [ ] **Step 2: Run RED**

```bash
npm test -- tests/calibratedScenario.test.ts
```

- [ ] **Step 3: Implement deterministic PRNG/sampling**

```js
function hashSeed(text) {
  let hash = 2166136261
  for (const char of text) {
    hash ^= char.charCodeAt(0)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

function mulberry32(seed) {
  return function next() {
    let t = seed += 0x6D2B79F5
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function sampleDistribution(distribution, random) {
  const knots = [
    [0.00, distribution.min], [0.10, distribution.p10], [0.25, distribution.p25],
    [0.50, distribution.p50], [0.75, distribution.p75], [0.90, distribution.p90],
    [1.00, distribution.max],
  ]
  const p = random()
  const upperIndex = knots.findIndex(([q]) => q >= p)
  if (upperIndex <= 0) return knots[0][1]
  const [q0, v0] = knots[upperIndex - 1]
  const [q1, v1] = knots[upperIndex]
  const ratio = (p - q0) / (q1 - q0)
  return v0 + (v1 - v0) * ratio
}
```

Never call `Math.random()` in generation.

- [ ] **Step 4: Generate geometry-independent operational scenario**

For each stop:
- sample package count then normalize counts deterministically to total 100 by round-robin increment/decrement while keeping each stop at least 1 package,
- sample one package volume per package and sum per stop,
- sample stop service seconds and convert to `Math.max(1, Math.round(seconds / 60))`,
- sample travel seconds for schedule gaps and convert similarly,
- include a time window when `random() < profile.distributions.timeWindowProbability`,
- sample width; center window around planned arrival and clamp start to `>= 0`.

For each vehicle, sample capacity; if below assigned route volume, set `capacityCm3 = Math.ceil(routeVolume * 1.15)`.

Sample eight departure minute-of-day values, sort them, normalize rank/value range into integer offsets `0..18`, and use those offsets from simulated 06:00.

Use labels `Vehículo 01` … `Vehículo 08`, stores `Entrega 001` … `Entrega 060`, and `cargo: { kind: 'PARCELS', packageCount, volumeCm3 }`.

- [ ] **Step 5: Generate canonical artifact**

`package.json`:

```json
"generate:calibrated": "node scripts/generate-calibrated-scenario.mjs --profile src/scenario/calibration/amazon-last-mile-v1.json --output src/scenario/generated/cordoba-calibrated-v1.json --seed fleetflow-cordoba-v0.4"
```

```bash
npm run generate:calibrated
```

- [ ] **Step 6: Run GREEN/build and commit**

```bash
npm test -- tests/calibratedScenario.test.ts tests/scenarioValidation.test.ts
npm run build
git add scripts/generate-calibrated-scenario.mjs src/scenario/generated/cordoba-calibrated-v1.json tests/calibratedScenario.test.ts package.json
git commit -m "feat: generate calibrated Cordoba last-mile scenario"
```

---

### Task 6: Generate Eight Static Road Routes

**Files:**
- Modify: `scripts/prepare-routes.mjs`
- Create: `public/data/cordoba-calibrated-routes.geojson`
- Modify: `tests/routeAssets.test.ts`
- Modify: `package.json`

**Interfaces:**

```bash
node scripts/prepare-routes.mjs --scenario src/scenario/generated/cordoba-calibrated-v1.json --output public/data/cordoba-calibrated-routes.geojson
```

- [ ] **Step 1: Add RED calibrated-asset tests**

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

- [ ] **Step 3: Generalize route-preparation input**

Parse `--scenario`/`--output`. Resolve:

```js
const storeById = new Map(scenario.stores.map((store) => [store.id, store]))
const coordinates = [
  scenario.depot.position,
  ...routePlan.stops.map((stop) => {
    const store = storeById.get(stop.storeId)
    if (!store) throw new Error(`Missing store ${stop.storeId}`)
    return store.position
  }),
  scenario.depot.position,
]
```

For OSRM response require `route.legs.length === coordinates.length - 1`; generated `waypointDistancesKm.length === routePlan.stops.length + 2`; distances strictly increase. Feature ID is exactly `routePlan.geometryId`; property `truckId` is exactly `routePlan.truckId`.

- [ ] **Step 4: Generate checked-in calibrated GeoJSON**

`package.json`:

```json
"prepare:routes:calibrated": "node scripts/prepare-routes.mjs --scenario src/scenario/generated/cordoba-calibrated-v1.json --output public/data/cordoba-calibrated-routes.geojson"
```

```bash
npm run prepare:routes:calibrated
```

- [ ] **Step 5: Run GREEN and runtime-network guard**

```bash
npm test -- tests/routeAssets.test.ts tests/mapPresentation.test.ts
npm run build
grep -R "router.project-osrm.org" src public || true
```

Expected: tests/build PASS; grep has no runtime source hit.

- [ ] **Step 6: Commit**

```bash
git add scripts/prepare-routes.mjs public/data/cordoba-calibrated-routes.geojson tests/routeAssets.test.ts package.json
git commit -m "feat: add calibrated Cordoba road routes"
```

---

### Task 7: Add Scenario Registry and Atomic Switching

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
export const SCENARIO_IDS = ['cordoba-calibrated', 'coca-coqui-legacy'] as const
export type ScenarioId = typeof SCENARIO_IDS[number]

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

- [ ] **Step 2: Implement registry and validate generated JSON at module load**

Cast imported JSON through `unknown` to `FleetScenario`, run `validateScenario`, and throw if errors exist so bad generated data fails build/tests immediately.

Calibrated summary exactly:

```text
Comportamiento derivado de datos operacionales públicos. Ubicaciones y recorridos adaptados a Córdoba.
```

Legacy summary exactly:

```text
Cinco camiones y quince entregas creadas para la primera versión de FleetFlow.
```

- [ ] **Step 3: Implement semantic switcher**

```tsx
interface ScenarioSwitcherProps {
  value: ScenarioId
  onChange: (id: ScenarioId) => void
}

export function ScenarioSwitcher({ value, onChange }: ScenarioSwitcherProps) {
  return (
    <fieldset className="scenario-switcher">
      <legend>Escenario</legend>
      {SCENARIO_IDS.map((id) => {
        const definition = getScenarioDefinition(id)
        return (
          <label key={id}>
            <input
              type="radio"
              name="fleetflow-scenario"
              value={id}
              checked={value === id}
              onChange={() => onChange(id)}
            />
            <span>{definition.label}</span>
            <small>{definition.badge}</small>
          </label>
        )
      })}
    </fieldset>
  )
}
```

Style it inside the connected rail; no new floating card.

- [ ] **Step 4: Write RED switching test**

Mock route `fetch` by URL. Initial render must request calibrated asset. Start simulation, switch to Legacy, then require Legacy asset, 06:00 and paused state. Switch back and require calibrated asset again.

```ts
expect(fetch).toHaveBeenCalledWith('./data/cordoba-calibrated-routes.geojson')
await user.click(screen.getByRole('radio', { name: /Coca Coqui/i }))
expect(fetch).toHaveBeenCalledWith('./data/coca-coqui-routes.geojson')
```

- [ ] **Step 5: Implement atomic active scenario in `App.tsx`**

```ts
const [scenarioId, setScenarioId] = useState<ScenarioId>(DEFAULT_SCENARIO_ID)
const activeDefinition = getScenarioDefinition(scenarioId)
const activeScenario = activeDefinition.scenario
const simulationEndMinute = Math.max(...activeScenario.routes.map((route) => route.returnMinute))

function changeScenario(nextId: ScenarioId) {
  setIsPlaying(false)
  setSimulationMinute(0)
  setRoutes(null)
  setRouteError(false)
  setScenarioId(nextId)
}
```

Route effect depends on `activeDefinition.routeAsset` and `activeScenario`, uses the existing cancellation flag, calls `routeCollectionToIndex(collection, activeScenario)`, and ignores stale completion. Give `<FleetMap key={scenarioId} ... />` so popups/layers cannot survive switching.

- [ ] **Step 6: Run GREEN/build**

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

### Task 8: Add Provenance Disclosure and Operational Copy

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

**Interfaces:** consumes `ScenarioProvenance`; first-level disclosure stays visible and detailed source/method uses native `<details>`.

- [ ] **Step 1: Write RED provenance/copy tests**

Calibrated mode contains:

```text
ESCENARIO CALIBRADO
Comportamiento derivado de datos operacionales públicos.
Fuente y método
```

Legacy contains `ESCENARIO SINTÉTICO · LEGACY V0`. No rendered text may match `/Amazon Córdoba|Mercado Libre Córdoba|rutas reales de Amazon/i`.

- [ ] **Step 2: Implement provenance component**

```tsx
export function ScenarioProvenance({ provenance }: { provenance: ScenarioProvenance }) {
  return (
    <section className="scenario-provenance" aria-label="Procedencia del escenario">
      <strong>{provenance.shortLabel}</strong>
      <span>{provenance.summary}</span>
      <details>
        <summary>Fuente y método</summary>
        {provenance.sourceName ? <p>Fuente: {provenance.sourceName}</p> : null}
        {provenance.sourceLicense ? <p>Licencia fuente: {provenance.sourceLicense}</p> : null}
        {provenance.sourceUrl ? <a href={provenance.sourceUrl}>Ver fuente oficial</a> : null}
        <p>Sintético/adaptado: {provenance.syntheticElements.join(' · ')}</p>
        <p>Limitaciones: {provenance.limitations.join(' · ')}</p>
      </details>
    </section>
  )
}
```

Calibrated `sourceUrl` is the official Registry of Open Data page.

- [ ] **Step 3: Finish parcel/generic copy**

Calibrated fleet/popup examples: `Vehículo 03`, `28 paquetes`, `5 / 8 entregas`, `37% de capacidad ocupada`. Store popup uses `Entrega 037`, package count, planned service time and optional window. Legacy keeps kg and Coca Coqui labels.

- [ ] **Step 4: Integrate provenance into connected frame**

Place it as a compact footer of the right operations rail below FleetPanel with an internal top divider; no modal/card/overlay.

- [ ] **Step 5: Run GREEN/build**

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

### Task 9: Documentation, Full Regression, PR and Deployment

**Files:**
- Modify: `README.md`
- Create: `DATA_LICENSES.md`
- Test: complete `tests/` suite
- No CI workflow change planned; current workflow already runs `npm test` and `npm run build`.

- [ ] **Step 1: Update README**

Document:

```text
External Amazon training data (offline only)
  → compact calibration profile
  → seeded Córdoba scenario generator
  → static road-route preparation
  → Scenario Registry
  → Simulation Engine
```

State plainly: Córdoba geography is synthetic/project-authored; operational parameters are calibrated; displayed routes are not Amazon/Mercado Libre operations; raw Amazon files are never shipped; Legacy is selectable.

- [ ] **Step 2: Add `DATA_LICENSES.md` exact boundary**

Include:

```text
The FleetFlow source code is licensed under MIT.
`src/scenario/calibration/amazon-last-mile-v1.json` is a derived calibration artifact based on material from the 2021 Amazon Last Mile Routing Research Challenge Dataset and is not covered by the repository's MIT license. Source material is provided under CC BY-NC 4.0; see the official dataset registry for terms and attribution.
```

Add official dataset citation and state that `scripts/fixtures/amazon-mini/*` are FleetFlow-authored synthetic schema fixtures.

- [ ] **Step 3: Run complete branch verification**

```bash
npm test
npm run build
git status --short
git diff main...HEAD --stat
git diff main...HEAD --name-only
```

Expected: tests/build PASS; no raw Amazon files; only V0.4 code/scripts/tests/docs, compact profile and calibrated GeoJSON.

- [ ] **Step 4: Commit docs**

```bash
git add README.md DATA_LICENSES.md
git commit -m "docs: document FleetFlow calibration provenance"
```

- [ ] **Step 5: Open PR**

Title `feat: ship FleetFlow V0.4 calibrated scenarios`. Body records 8 vehicles / 60 stops / 100 packages, Legacy preservation, data/license boundary, no runtime routing, and exact test/build results.

- [ ] **Step 6: Require PR-triggered CI GREEN and squash merge**

Do not merge on branch CI alone. Squash title: `feat: ship FleetFlow V0.4 calibrated scenarios`.

- [ ] **Step 7: Verify merged SHA in production**

Require main CI `success` and GitHub Pages `success`. On the public page verify calibrated mode is default, 8 vehicles/60 points appear, selector switches Legacy and back, and browser runtime makes no OSRM request.
