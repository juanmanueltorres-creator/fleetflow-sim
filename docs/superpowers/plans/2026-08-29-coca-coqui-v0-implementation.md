# Coca Coqui V0 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first public, static Coca Coqui fleet simulation for Córdoba Capital: five trucks, fifteen synthetic stores, scheduled movement on road-following routes, an accelerated clock, fleet states, and lightweight KPIs.

**Architecture:** A React + TypeScript + Vite SPA loads one deterministic scenario and one checked-in GeoJSON route asset. A pure simulation engine derives truck state from synthetic time; a GeoJSON adapter feeds one MapLibre truck source; React renders the clock, controls, fleet list, and KPIs. Route geometry is prepared once from OpenStreetMap-based routing data and is not fetched by the deployed app.

**Tech Stack:** React 19.1.1, React DOM 19.1.1, MapLibre GL 6.6.0, TypeScript 5.7.2, Vite 6.1.0, Vitest 3.0.5, Turf modules 7.4.0, GeoJSON.

**Spec:** `docs/superpowers/specs/2026-08-29-coca-coqui-visual-simulation-design.md`

## Global Constraints

- V0 is a visual simulation, not a production fleet-management system.
- One fictional depot, exactly fifteen fictional stores, exactly five fictional trucks.
- Static public frontend; no Supabase, PostGIS, FastAPI, auth, database, or paid API.
- No live GPS, IoT, traffic, AI, Cesium, or production-grade optimization.
- The deployed app must not call a routing API.
- Operational data is synthetic; fuel is always labeled as estimated.
- The map/UI consume `FleetSnapshot`; future telemetry may replace the simulator without rewriting those consumers.
- MIT applies to application code; third-party map/routing data retains its own attribution and licensing.
- TDD for domain behavior; each implementation task ends with passing tests/build and a commit.

---

## File Map

```text
index.html
package.json
vite.config.ts
vitest.config.ts
tsconfig.json
tsconfig.app.json
tsconfig.node.json
src/
  main.tsx
  App.tsx
  app.css
  domain/types.ts
  domain/scenarioValidation.ts
  scenario/cocaCoquiScenario.ts
  simulation/clock.ts
  simulation/engine.ts
  simulation/metrics.ts
  map/mapConfig.ts
  map/routeAssets.ts
  map/fleetGeoJson.ts
  map/FleetMap.tsx
  components/SimulationClock.tsx
  components/SimulationControls.tsx
  components/FleetPanel.tsx
  components/KpiPanel.tsx
  test/setup.ts
public/data/coca-coqui-routes.geojson
scripts/prepare-routes.mjs
tests/scenarioValidation.test.ts
tests/simulationEngine.test.ts
tests/metrics.test.ts
tests/fleetGeoJson.test.ts
.github/workflows/ci.yml
README.md
```

---

### Task 1: Runnable React/TypeScript baseline

**Files:** create `package.json`, Vite/TS/Vitest config, `index.html`, `src/main.tsx`, `src/App.tsx`, `src/app.css`, `src/test/setup.ts`; modify `README.md`.

**Interfaces:** produces a buildable SPA and test runner; no domain interfaces yet.

- [ ] **Step 1: Add pinned dependencies**

`package.json`:

```json
{
  "name": "fleetflow-sim",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "test": "vitest run",
    "test:watch": "vitest",
    "prepare:routes": "node scripts/prepare-routes.mjs"
  },
  "dependencies": {
    "@turf/along": "^7.4.0",
    "@turf/bearing": "^7.4.0",
    "@turf/helpers": "^7.4.0",
    "@turf/length": "^7.4.0",
    "maplibre-gl": "^6.6.0",
    "react": "^19.1.1",
    "react-dom": "^19.1.1"
  },
  "devDependencies": {
    "@testing-library/jest-dom": "^6.6.3",
    "@testing-library/react": "^16.1.0",
    "@types/geojson": "^7946.0.16",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "@vitejs/plugin-react": "^4.3.4",
    "jsdom": "^26.0.0",
    "typescript": "~5.7.2",
    "vite": "^6.1.0",
    "vitest": "^3.0.5"
  }
}
```

These shared frontend versions intentionally mirror the existing Pulso stack where applicable; Turf is pinned to 7.4.0.

- [ ] **Step 2: Add minimal configs**

`vite.config.ts`:

```ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({ plugins: [react()], base: './' })
```

`vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: { environment: 'jsdom', setupFiles: ['./src/test/setup.ts'] },
})
```

`src/test/setup.ts`:

```ts
import '@testing-library/jest-dom/vitest'
```

- [ ] **Step 3: Add the minimal app shell**

`src/App.tsx`:

```tsx
export default function App() {
  return (
    <main className="app-shell">
      <h1>FleetFlow Sim</h1>
      <p>Coca Coqui — Córdoba Distribution Run</p>
    </main>
  )
}
```

`src/main.tsx` mounts `<App />` into `#root` and imports `app.css`.

- [ ] **Step 4: Install and verify**

```bash
npm install
npm test
npm run build
```

Expected: test command exits 0 and production build succeeds.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json index.html tsconfig*.json vite.config.ts vitest.config.ts src README.md
git commit -m "chore: scaffold FleetFlow V0 frontend"
```

---

### Task 2: Domain contracts + exact Coca Coqui scenario

**Files:** create `src/domain/types.ts`, `src/domain/scenarioValidation.ts`, `src/scenario/cocaCoquiScenario.ts`, `tests/scenarioValidation.test.ts`.

**Interfaces:** produces `FleetScenario`, `RoutePlan`, `FleetSnapshot`, `TruckSnapshot`, `validateScenario()`, and `cocaCoquiScenario`.

- [ ] **Step 1: Write RED scenario tests**

```ts
import { describe, expect, it } from 'vitest'
import { validateScenario } from '../src/domain/scenarioValidation'
import { cocaCoquiScenario } from '../src/scenario/cocaCoquiScenario'

describe('Coca Coqui V0 scenario', () => {
  it('contains exactly one depot, five trucks and fifteen stores', () => {
    expect(cocaCoquiScenario.depot.id).toBe('depot-01')
    expect(cocaCoquiScenario.trucks).toHaveLength(5)
    expect(cocaCoquiScenario.stores).toHaveLength(15)
  })

  it('assigns every store exactly once within capacity and chronological order', () => {
    expect(validateScenario(cocaCoquiScenario)).toEqual([])
  })
})
```

Run `npm test -- tests/scenarioValidation.test.ts`; expected FAIL because modules are absent.

- [ ] **Step 2: Define domain types exactly**

`src/domain/types.ts`:

```ts
export type Position = [longitude: number, latitude: number]
export type TruckStatus = 'AT_DEPOT' | 'EN_ROUTE' | 'UNLOADING' | 'RETURNING' | 'DONE'

export interface Depot { id: string; name: string; position: Position }
export interface Store { id: string; name: string; position: Position; demandKg: number; serviceMinutes: number }
export interface Truck { id: string; label: string; capacityKg: number; fuelConsumptionLPer100Km: number }
export interface PlannedStop { storeId: string; plannedArrivalMinute: number; plannedDepartureMinute: number; demandKg: number }

export interface RoutePlan {
  id: string
  truckId: string
  departureMinute: number
  returnMinute: number
  stops: PlannedStop[]
  distanceKm: number
  geometryId: string
}

export interface FleetScenario {
  id: string
  label: string
  simulationStartLabel: string
  depot: Depot
  stores: Store[]
  trucks: Truck[]
  routes: RoutePlan[]
}

export interface TruckSnapshot {
  truckId: string
  position: Position
  bearing: number
  status: TruckStatus
  currentStopId: string | null
  nextStopId: string | null
  routeProgress: number
  cargoKg: number
  completedDeliveries: number
  distanceTravelledKm: number
  estimatedFuelUsedL: number
}

export interface FleetSnapshot { simulationMinute: number; trucks: TruckSnapshot[] }
```

- [ ] **Step 3: Add exact synthetic places and trucks**

Use depot `[-64.1888, -31.4201]` and these fifteen fictional stores:

```ts
const stores: Store[] = [
  { id: 'store-01', name: 'Local 01', position: [-64.1805, -31.4148], demandKg: 520, serviceMinutes: 5 },
  { id: 'store-02', name: 'Local 02', position: [-64.1679, -31.4057], demandKg: 430, serviceMinutes: 5 },
  { id: 'store-03', name: 'Local 03', position: [-64.1554, -31.4219], demandKg: 610, serviceMinutes: 6 },
  { id: 'store-04', name: 'Local 04', position: [-64.2032, -31.4075], demandKg: 470, serviceMinutes: 5 },
  { id: 'store-05', name: 'Local 05', position: [-64.2197, -31.4140], demandKg: 560, serviceMinutes: 5 },
  { id: 'store-06', name: 'Local 06', position: [-64.2291, -31.4301], demandKg: 480, serviceMinutes: 5 },
  { id: 'store-07', name: 'Local 07', position: [-64.1962, -31.4378], demandKg: 500, serviceMinutes: 5 },
  { id: 'store-08', name: 'Local 08', position: [-64.1813, -31.4480], demandKg: 450, serviceMinutes: 5 },
  { id: 'store-09', name: 'Local 09', position: [-64.1651, -31.4394], demandKg: 630, serviceMinutes: 6 },
  { id: 'store-10', name: 'Local 10', position: [-64.1458, -31.4112], demandKg: 390, serviceMinutes: 5 },
  { id: 'store-11', name: 'Local 11', position: [-64.1372, -31.4300], demandKg: 540, serviceMinutes: 5 },
  { id: 'store-12', name: 'Local 12', position: [-64.1516, -31.4522], demandKg: 460, serviceMinutes: 5 },
  { id: 'store-13', name: 'Local 13', position: [-64.2075, -31.4515], demandKg: 580, serviceMinutes: 5 },
  { id: 'store-14', name: 'Local 14', position: [-64.2220, -31.4460], demandKg: 410, serviceMinutes: 5 },
  { id: 'store-15', name: 'Local 15', position: [-64.2360, -31.4110], demandKg: 520, serviceMinutes: 5 },
]

const trucks: Truck[] = Array.from({ length: 5 }, (_, index) => ({
  id: `truck-0${index + 1}`,
  label: `Truck 0${index + 1}`,
  capacityKg: 2400,
  fuelConsumptionLPer100Km: 18,
}))
```

- [ ] **Step 4: Add the five exact route plans**

Minutes are relative to 06:00. Distances are nominal planning values used only for V0 KPIs; road geometry is prepared separately in Task 4.

```ts
const routes: RoutePlan[] = [
  {
    id: 'route-01', truckId: 'truck-01', geometryId: 'route-truck-01',
    departureMinute: 0, returnMinute: 52, distanceKm: 11.8,
    stops: [
      { storeId: 'store-01', plannedArrivalMinute: 8, plannedDepartureMinute: 13, demandKg: 520 },
      { storeId: 'store-02', plannedArrivalMinute: 20, plannedDepartureMinute: 25, demandKg: 430 },
      { storeId: 'store-03', plannedArrivalMinute: 33, plannedDepartureMinute: 39, demandKg: 610 },
    ],
  },
  {
    id: 'route-02', truckId: 'truck-02', geometryId: 'route-truck-02',
    departureMinute: 3, returnMinute: 55, distanceKm: 14.6,
    stops: [
      { storeId: 'store-04', plannedArrivalMinute: 12, plannedDepartureMinute: 17, demandKg: 470 },
      { storeId: 'store-05', plannedArrivalMinute: 24, plannedDepartureMinute: 29, demandKg: 560 },
      { storeId: 'store-06', plannedArrivalMinute: 38, plannedDepartureMinute: 43, demandKg: 480 },
    ],
  },
  {
    id: 'route-03', truckId: 'truck-03', geometryId: 'route-truck-03',
    departureMinute: 6, returnMinute: 58, distanceKm: 13.2,
    stops: [
      { storeId: 'store-07', plannedArrivalMinute: 15, plannedDepartureMinute: 20, demandKg: 500 },
      { storeId: 'store-08', plannedArrivalMinute: 27, plannedDepartureMinute: 32, demandKg: 450 },
      { storeId: 'store-09', plannedArrivalMinute: 40, plannedDepartureMinute: 46, demandKg: 630 },
    ],
  },
  {
    id: 'route-04', truckId: 'truck-04', geometryId: 'route-truck-04',
    departureMinute: 9, returnMinute: 60, distanceKm: 15.0,
    stops: [
      { storeId: 'store-10', plannedArrivalMinute: 18, plannedDepartureMinute: 23, demandKg: 390 },
      { storeId: 'store-11', plannedArrivalMinute: 30, plannedDepartureMinute: 35, demandKg: 540 },
      { storeId: 'store-12', plannedArrivalMinute: 43, plannedDepartureMinute: 48, demandKg: 460 },
    ],
  },
  {
    id: 'route-05', truckId: 'truck-05', geometryId: 'route-truck-05',
    departureMinute: 12, returnMinute: 65, distanceKm: 16.4,
    stops: [
      { storeId: 'store-13', plannedArrivalMinute: 21, plannedDepartureMinute: 26, demandKg: 580 },
      { storeId: 'store-14', plannedArrivalMinute: 34, plannedDepartureMinute: 39, demandKg: 410 },
      { storeId: 'store-15', plannedArrivalMinute: 47, plannedDepartureMinute: 52, demandKg: 520 },
    ],
  },
]
```

- [ ] **Step 5: Implement `validateScenario()`**

It must return `string[]` and enforce: each store assigned exactly once; every route references an existing truck/store; assigned demand <= truck capacity; stop times are monotonic; return time is after final departure; every route has positive `distanceKm`.

- [ ] **Step 6: GREEN + commit**

```bash
npm test -- tests/scenarioValidation.test.ts
npm test
npm run build
git add src/domain src/scenario tests/scenarioValidation.test.ts
git commit -m "feat: define Coca Coqui fleet scenario"
```

---

### Task 3: Pure clock and simulation engine

**Files:** create `src/simulation/clock.ts`, `src/simulation/engine.ts`, `tests/simulationEngine.test.ts`.

**Interfaces:** consumes `FleetScenario` plus `RouteGeometryIndex`; produces `formatSimulationTime()` and `getFleetSnapshot()`.

Define route asset types inside `src/map/routeAssets.ts` before engine implementation:

```ts
import type { Feature, LineString } from 'geojson'

export interface RouteGeometryProperties {
  truckId: string
  waypointDistancesKm: [number, number, number, number, number]
}

export type RouteGeometryFeature = Feature<LineString, RouteGeometryProperties>
export type RouteGeometryIndex = Record<string, RouteGeometryFeature>
```

The five waypoint distances correspond to `[depot, stop1, stop2, stop3, depot]` and are cumulative along the road geometry.

- [ ] **Step 1: Write RED engine tests**

Tests must prove:

```ts
expect(getFleetSnapshot(scenario, geometries, -1).trucks.every(t => t.status === 'AT_DEPOT')).toBe(true)
expect(getFleetSnapshot(scenario, geometries, 300).trucks.every(t => t.status === 'DONE')).toBe(true)
expect(getFleetSnapshot(scenario, geometries, 27)).toEqual(getFleetSnapshot(scenario, geometries, 27))
```

Also test truck 01 at minute 9 is `UNLOADING` at Store 01 and truck 01 at minute 45 is `RETURNING`.

Use deterministic two/three-segment LineString fixtures with matching cumulative `waypointDistancesKm`.

Run `npm test -- tests/simulationEngine.test.ts`; expected RED.

- [ ] **Step 2: Implement clock helper**

```ts
export function formatSimulationTime(minute: number): string {
  const absolute = Math.max(0, Math.round(360 + minute))
  return `${String(Math.floor(absolute / 60) % 24).padStart(2, '0')}:${String(absolute % 60).padStart(2, '0')}`
}
```

- [ ] **Step 3: Implement `getFleetSnapshot()`**

Exact signature:

```ts
export function getFleetSnapshot(
  scenario: FleetScenario,
  geometries: RouteGeometryIndex,
  simulationMinute: number,
): FleetSnapshot
```

For each truck:

1. Find its route and geometry.
2. Before departure: depot, `AT_DEPOT`, progress 0.
3. During a stop arrival/departure window: exact store coordinate, `UNLOADING`.
4. Between depot/stop waypoints: identify the active leg using schedule times, compute normalized leg time, interpolate cumulative road distance between the two matching values in `waypointDistancesKm`, then use Turf `along()` on the whole LineString.
5. Travelling before stop 3 departure is `EN_ROUTE`; after stop 3 departure is `RETURNING`.
6. At/after return: depot, `DONE`, progress 1.
7. Bearing comes from points at `distanceKm` and `min(distanceKm + 0.01, totalGeometryKm)` via Turf `bearing()`.
8. `distanceTravelledKm = route.distanceKm * routeProgress`.
9. `estimatedFuelUsedL = distanceTravelledKm * truck.fuelConsumptionLPer100Km / 100`.
10. Cargo starts as assigned route demand and decreases only once each stop's departure time has passed.

- [ ] **Step 4: GREEN + commit**

```bash
npm test -- tests/simulationEngine.test.ts
npm test
npm run build
git add src/simulation src/map/routeAssets.ts tests/simulationEngine.test.ts
git commit -m "feat: add deterministic fleet simulation engine"
```

---

### Task 4: Prepare and check in road-following routes + fleet GeoJSON adapter

**Files:** create `scripts/prepare-routes.mjs`, `public/data/coca-coqui-routes.geojson`, `src/map/fleetGeoJson.ts`, `tests/fleetGeoJson.test.ts`.

**Interfaces:** route preparation produces five LineStrings with cumulative leg distances; adapter produces one Point FeatureCollection for all trucks.

- [ ] **Step 1: Write RED adapter test**

```ts
const data = fleetSnapshotToGeoJson({
  simulationMinute: 10,
  trucks: [{
    truckId: 'truck-01', position: [-64.18, -31.42], bearing: 90,
    status: 'EN_ROUTE', currentStopId: null, nextStopId: 'store-01',
    routeProgress: 0.2, cargoKg: 1040, completedDeliveries: 1,
    distanceTravelledKm: 2.36, estimatedFuelUsedL: 0.4248,
  }],
})
expect(data.features).toHaveLength(1)
expect(data.features[0].properties?.truckId).toBe('truck-01')
```

Run focused test; expected RED.

- [ ] **Step 2: Implement `fleetSnapshotToGeoJson()`**

Return a `FeatureCollection<Point>` with one feature per truck and properties:

```ts
{ truckId, bearing, status, currentStopId, nextStopId, routeProgress }
```

- [ ] **Step 3: Implement the development-only route generator**

For each truck, construct coordinates `[depot, stop1, stop2, stop3, depot]`. Request a single driving route with GeoJSON geometry from the configured OpenStreetMap-compatible routing endpoint. Require an HTTP 200 and a response containing one route with four `legs` and a LineString geometry.

For each route, calculate:

```js
const waypointDistancesKm = [
  0,
  legs[0].distance / 1000,
  (legs[0].distance + legs[1].distance) / 1000,
  (legs[0].distance + legs[1].distance + legs[2].distance) / 1000,
  legs.reduce((sum, leg) => sum + leg.distance, 0) / 1000,
]
```

Write `public/data/coca-coqui-routes.geojson` containing exactly five features with IDs `route-truck-01` ... `route-truck-05` and properties `{ truckId, waypointDistancesKm }`.

The script is never imported by `src/` and never runs in production.

- [ ] **Step 4: Run route preparation once and verify asset shape**

```bash
npm run prepare:routes
npm test -- tests/fleetGeoJson.test.ts
npm test
npm run build
```

Acceptance: five LineStrings; every `waypointDistancesKm` array has five ascending numbers; final value > 0.

- [ ] **Step 5: Commit**

```bash
git add scripts public/data src/map/fleetGeoJson.ts tests/fleetGeoJson.test.ts
git commit -m "feat: add static route assets and fleet GeoJSON adapter"
```

---

### Task 5: MapLibre map with one truck source

**Files:** create `src/map/mapConfig.ts`, `src/map/FleetMap.tsx`; modify `src/App.tsx`, `src/app.css`.

**Interfaces:** `<FleetMap scenario routes snapshot />` consumes scenario, route FeatureCollection, and FleetSnapshot.

- [ ] **Step 1: Add map constants**

```ts
export const MAP_CENTER: [number, number] = [-64.1888, -31.4201]
export const MAP_ZOOM = 12
export const MAP_STYLE = 'https://demotiles.maplibre.org/style.json'
export const SOURCE_ROUTES = 'fleet-routes'
export const SOURCE_STORES = 'fleet-stores'
export const SOURCE_TRUCKS = 'fleet-trucks'
export const SOURCE_DEPOT = 'fleet-depot'
```

- [ ] **Step 2: Implement `FleetMap` lifecycle**

The component must create one MapLibre instance on mount, add four GeoJSON sources after `load`, render route/store/depot/truck layers, update only `SOURCE_TRUCKS.setData()` when snapshot changes, keep attribution visible, and call `map.remove()` on unmount.

All five trucks are in the one `SOURCE_TRUCKS` FeatureCollection; do not create five React marker components.

- [ ] **Step 3: Load local route asset in `App`**

Fetch `./data/coca-coqui-routes.geojson` once. Convert features into a `RouteGeometryIndex` keyed by feature `id`. Before data loads, show `Loading simulation…`; on invalid/missing data show `Unable to load simulation route data.`.

Initialize snapshot at minute 0 with `getFleetSnapshot()`.

- [ ] **Step 4: Verify**

```bash
npm test
npm run build
npm run dev
```

Manual smoke: depot + 15 stores + five route lines + five truck points visible.

- [ ] **Step 5: Commit**

```bash
git add src/map src/App.tsx src/app.css
git commit -m "feat: render Coca Coqui fleet map"
```

---

### Task 6: Clock, controls, fleet list, and KPIs

**Files:** create four components plus `src/simulation/metrics.ts`, `tests/metrics.test.ts`; modify `App.tsx`, `app.css`.

**Interfaces:** produces Play/Pause/Reset/speed controls and fleet/KPI UI.

- [ ] **Step 1: Write RED metrics test**

`getFleetMetrics(snapshot, scenario)` returns:

```ts
export interface FleetMetrics {
  completedDeliveries: number
  totalDeliveries: number
  activeTrucks: number
  plannedDistanceKm: number
  estimatedFuelLitres: number
}
```

Test `totalDeliveries === 15`, positive planned distance/fuel, and active count from statuses.

- [ ] **Step 2: Implement metrics exactly**

- completed = sum of `completedDeliveries`.
- total = `scenario.stores.length`.
- active = `EN_ROUTE | UNLOADING | RETURNING`.
- planned distance = sum `route.distanceKm`.
- estimated fuel = sum `route.distanceKm * truck.fuelConsumptionLPer100Km / 100`.

- [ ] **Step 3: Implement controls**

```ts
interface SimulationControlsProps {
  isPlaying: boolean
  speed: number
  onPlayPause(): void
  onReset(): void
  onSpeedChange(speed: number): void
}
```

Expose `1`, `10`, `30`, `60` simulated seconds per real second.

- [ ] **Step 4: Add one `requestAnimationFrame` loop in App**

For each frame while playing:

```ts
const simulatedMinutesDelta = (realDeltaSeconds * speed) / 60
```

Advance `simulationMinute`; derive a new snapshot; clamp at maximum route `returnMinute` (65) and auto-pause there. Reset returns to minute 0 and paused state.

- [ ] **Step 5: Render panels**

Clock: `formatSimulationTime(simulationMinute)`.

Each truck row: label, status, current/next stop, completed deliveries.

KPI panel: deliveries `x/15`, active trucks `x/5`, planned km, and text `Estimated fuel` followed by litres. Do not label fuel as measured or saved.

- [ ] **Step 6: GREEN + manual acceptance + commit**

```bash
npm test
npm run build
npm run dev
```

Manual acceptance: Play moves several trucks; unloading stops freeze at store coordinates; Pause freezes; speed changes rate; Reset restores minute 0; by 07:05 all trucks are `DONE` at depot.

```bash
git add src/components src/simulation src/App.tsx src/app.css tests/metrics.test.ts
git commit -m "feat: add interactive fleet simulation controls"
```

---

### Task 7: Public-release hardening and CI

**Files:** modify `README.md`; create `.github/workflows/ci.yml`; final verification of app.

**Interfaces:** produces a documented, reproducible static V0 ready for GitHub Pages or another static host.

- [ ] **Step 1: README boundary and attribution**

README must explicitly state:

- FleetFlow Sim is an open-source visual fleet simulation.
- Coca Coqui is fictional.
- Depot, stores, demand, schedules, and operational events are synthetic.
- Route/map context uses open mapping/routing data under its own terms/attribution.
- Fuel is estimated with `distanceKm × nominalLitresPer100Km / 100`.
- V0 has no live GPS, IoT, traffic, real customer data, or measured fuel savings.
- Commands: `npm install`, `npm run prepare:routes`, `npm run dev`, `npm test`, `npm run build`.

- [ ] **Step 2: Add CI**

```yaml
name: CI
on: [push, pull_request]

jobs:
  test-build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npm test
      - run: npm run build
```

- [ ] **Step 3: Final verification**

```bash
npm ci
npm test
npm run build
```

Inspect built assets and verify: relative Vite base works; route GeoJSON is present; no token/secret/API key is bundled; deployed app does not need route generation at runtime.

- [ ] **Step 4: Commit**

```bash
git add README.md .github/workflows/ci.yml
git commit -m "docs: prepare FleetFlow V0 for public release"
```

---

## V0 Acceptance Gate

```text
[ ] npm test passes
[ ] npm run build passes
[ ] 1 depot renders
[ ] 15 synthetic stores render
[ ] 5 road-following planned routes render
[ ] 5 trucks live in one MapLibre truck GeoJSON source
[ ] Play advances a synthetic clock and animates active trucks
[ ] UNLOADING visibly holds trucks at stores
[ ] Pause, speed and reset work
[ ] all trucks finish DONE at depot by 07:05
[ ] deliveries, active trucks, planned km and Estimated fuel render
[ ] README makes fictional/synthetic boundaries explicit
[ ] no backend/auth/database/sensor/paid API/runtime router was added
```

Do not start optimization, 30-truck scaling, telemetry, traffic, or OR-Tools until this gate is green.
