# Coca Coqui V0 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first public, static Coca Coqui fleet simulation for Córdoba Capital: five trucks, roughly fifteen synthetic stores, scheduled movement on road-following routes, an accelerated clock, basic fleet states, and lightweight KPIs.

**Architecture:** A React + TypeScript + Vite SPA loads deterministic scenario assets, feeds them into a pure TypeScript simulation engine, converts each fleet snapshot to GeoJSON, and renders routes/stops/trucks with MapLibre GL. Runtime behavior is local and deterministic; routing geometries are prepared ahead of deployment from OpenStreetMap-based routing data so the deployed demo has no paid API or routing-service dependency.

**Tech Stack:** React, TypeScript, Vite, MapLibre GL JS, Turf.js, Vitest, GeoJSON, OpenStreetMap-derived routing data.

**Spec:** `docs/superpowers/specs/2026-08-29-coca-coqui-visual-simulation-design.md`

## Global Constraints

- V0 is a visual simulation, not a production fleet-management system.
- One synthetic depot in Córdoba Capital.
- Approximately 15 synthetic delivery locations.
- Five fictional trucks.
- Static public frontend; no Supabase, PostGIS, FastAPI, authentication, database, or paid APIs.
- No live GPS, IoT, traffic, AI, Cesium, or production-grade route optimization.
- Operational data is fictional; fuel is explicitly an estimate.
- `PLANNED` simulation output must be shaped so a future telemetry adapter can feed the same `FleetSnapshot` boundary.
- External map/routing data keeps its own attribution/licensing; MIT applies to application code.
- Tests are required for scenario validity and deterministic simulation behavior.

---

## File Structure

```text
fleetflow-sim/
├─ index.html
├─ package.json
├─ tsconfig.json
├─ tsconfig.app.json
├─ tsconfig.node.json
├─ vite.config.ts
├─ vitest.config.ts
├─ src/
│  ├─ main.tsx                    # React entrypoint
│  ├─ App.tsx                     # Composes map, controls, fleet panel and KPIs
│  ├─ app.css                     # V0 layout and visual treatment
│  ├─ domain/
│  │  ├─ types.ts                 # Shared domain contracts
│  │  └─ scenarioValidation.ts    # Deterministic scenario invariants
│  ├─ scenario/
│  │  └─ cocaCoquiScenario.ts     # Synthetic V0 scenario metadata and schedule
│  ├─ simulation/
│  │  ├─ engine.ts                # Pure timestamp -> FleetSnapshot logic
│  │  ├─ clock.ts                 # Simulation time helpers
│  │  └─ metrics.ts               # Derived fleet KPIs
│  ├─ map/
│  │  ├─ FleetMap.tsx             # MapLibre lifecycle only
│  │  ├─ fleetGeoJson.ts          # FleetSnapshot -> GeoJSON adapter
│  │  └─ mapConfig.ts             # Map center/style/source/layer IDs
│  ├─ components/
│  │  ├─ SimulationControls.tsx   # Play/pause/reset/speed controls
│  │  ├─ FleetPanel.tsx           # Five-truck status list
│  │  ├─ KpiPanel.tsx             # Deliveries, active trucks, distance, fuel
│  │  └─ SimulationClock.tsx      # Prominent synthetic clock
│  └─ test/
│     └─ setup.ts                  # Vitest DOM setup if needed
├─ public/
│  └─ data/
│     └─ coca-coqui-routes.geojson # Prepared road-following route geometries
├─ scripts/
│  └─ prepare-routes.mjs          # Development-only route asset generator
├─ tests/
│  ├─ scenarioValidation.test.ts
│  ├─ simulationEngine.test.ts
│  ├─ metrics.test.ts
│  └─ fleetGeoJson.test.ts
└─ README.md
```

---

### Task 1: Establish the runnable Vite + React + TypeScript test baseline

**Files:**
- Create: `package.json`
- Create: `index.html`
- Create: `tsconfig.json`
- Create: `tsconfig.app.json`
- Create: `tsconfig.node.json`
- Create: `vite.config.ts`
- Create: `vitest.config.ts`
- Create: `src/main.tsx`
- Create: `src/App.tsx`
- Create: `src/app.css`
- Create: `src/test/setup.ts`
- Modify: `README.md`

**Interfaces:**
- Consumes: none.
- Produces: a buildable/testable SPA baseline used by all later tasks.

- [ ] **Step 1: Create `package.json` with only V0 dependencies**

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
    "@turf/along": "latest",
    "@turf/bearing": "latest",
    "@turf/helpers": "latest",
    "@turf/length": "latest",
    "maplibre-gl": "latest",
    "react": "latest",
    "react-dom": "latest"
  },
  "devDependencies": {
    "@testing-library/jest-dom": "latest",
    "@testing-library/react": "latest",
    "@types/react": "latest",
    "@types/react-dom": "latest",
    "@vitejs/plugin-react": "latest",
    "jsdom": "latest",
    "typescript": "latest",
    "vite": "latest",
    "vitest": "latest"
  }
}
```

- [ ] **Step 2: Add minimal TypeScript/Vite/Vitest config**

`vite.config.ts`:

```ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: './',
})
```

`vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
  },
})
```

`src/test/setup.ts`:

```ts
import '@testing-library/jest-dom/vitest'
```

- [ ] **Step 3: Add a smoke testable app shell**

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

- [ ] **Step 4: Install dependencies and verify the baseline**

Run:

```bash
npm install
npm test
npm run build
```

Expected: no test failures and a successful production build.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json index.html tsconfig*.json vite.config.ts vitest.config.ts src README.md
git commit -m "chore: scaffold FleetFlow V0 frontend"
```

---

### Task 2: Define domain contracts and validate the deterministic Coca Coqui scenario

**Files:**
- Create: `src/domain/types.ts`
- Create: `src/domain/scenarioValidation.ts`
- Create: `src/scenario/cocaCoquiScenario.ts`
- Create: `tests/scenarioValidation.test.ts`

**Interfaces:**
- Consumes: TypeScript baseline from Task 1.
- Produces: `FleetScenario`, `RoutePlan`, `Truck`, `Store`, `FleetSnapshot`, `validateScenario(scenario)` and `cocaCoquiScenario`.

- [ ] **Step 1: Write failing scenario invariant tests**

`tests/scenarioValidation.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { cocaCoquiScenario } from '../src/scenario/cocaCoquiScenario'
import { validateScenario } from '../src/domain/scenarioValidation'

describe('Coca Coqui V0 scenario', () => {
  it('has one depot, five trucks and fifteen stores', () => {
    expect(cocaCoquiScenario.trucks).toHaveLength(5)
    expect(cocaCoquiScenario.stores).toHaveLength(15)
    expect(cocaCoquiScenario.depot.id).toBe('depot-01')
  })

  it('assigns every store exactly once without exceeding capacity', () => {
    expect(validateScenario(cocaCoquiScenario)).toEqual([])
  })
})
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
npm test -- tests/scenarioValidation.test.ts
```

Expected: FAIL because domain/scenario modules do not exist.

- [ ] **Step 3: Define exact domain types**

`src/domain/types.ts`:

```ts
export type Position = [longitude: number, latitude: number]

export type TruckStatus =
  | 'AT_DEPOT'
  | 'EN_ROUTE'
  | 'UNLOADING'
  | 'RETURNING'
  | 'DONE'

export interface Depot {
  id: string
  name: string
  position: Position
}

export interface Store {
  id: string
  name: string
  position: Position
  demandKg: number
  serviceMinutes: number
}

export interface Truck {
  id: string
  label: string
  capacityKg: number
  fuelConsumptionLPer100Km: number
}

export interface PlannedStop {
  storeId: string
  plannedArrivalMinute: number
  plannedDepartureMinute: number
  demandKg: number
}

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

export interface FleetSnapshot {
  simulationMinute: number
  trucks: TruckSnapshot[]
}
```

- [ ] **Step 4: Add scenario validation**

`src/domain/scenarioValidation.ts` must export:

```ts
import type { FleetScenario } from './types'

export function validateScenario(scenario: FleetScenario): string[] {
  const errors: string[] = []
  const assignedStoreIds = scenario.routes.flatMap((route) =>
    route.stops.map((stop) => stop.storeId),
  )

  const unique = new Set(assignedStoreIds)
  if (unique.size !== scenario.stores.length || assignedStoreIds.length !== scenario.stores.length) {
    errors.push('Every store must be assigned exactly once')
  }

  for (const route of scenario.routes) {
    const truck = scenario.trucks.find((candidate) => candidate.id === route.truckId)
    if (!truck) {
      errors.push(`Unknown truck ${route.truckId}`)
      continue
    }

    const assignedDemand = route.stops.reduce((sum, stop) => sum + stop.demandKg, 0)
    if (assignedDemand > truck.capacityKg) {
      errors.push(`Truck ${truck.id} exceeds capacity`)
    }

    let cursor = route.departureMinute
    for (const stop of route.stops) {
      if (stop.plannedArrivalMinute < cursor || stop.plannedDepartureMinute < stop.plannedArrivalMinute) {
        errors.push(`Route ${route.id} has invalid stop ordering`)
      }
      cursor = stop.plannedDepartureMinute
    }
    if (route.returnMinute < cursor) {
      errors.push(`Route ${route.id} returns before its last stop departs`)
    }
  }

  return errors
}
```

- [ ] **Step 5: Add the deterministic scenario**

Use one depot near central Córdoba and 15 fictional stores represented only by IDs/names plus coordinates. Assign three stores per truck. Keep total assigned demand below each truck capacity and give each stop explicit arrival/departure minutes. The scenario must export exactly:

```ts
export const cocaCoquiScenario: FleetScenario = {
  id: 'coca-coqui-cordoba-v0',
  label: 'Coca Coqui — Córdoba Distribution Run',
  simulationStartLabel: '06:00',
  depot: {
    id: 'depot-01',
    name: 'Coca Coqui Distribution Center',
    position: [-64.1888, -31.4201],
  },
  trucks: [
    { id: 'truck-01', label: 'Truck 01', capacityKg: 2400, fuelConsumptionLPer100Km: 18 },
    { id: 'truck-02', label: 'Truck 02', capacityKg: 2400, fuelConsumptionLPer100Km: 18 },
    { id: 'truck-03', label: 'Truck 03', capacityKg: 2400, fuelConsumptionLPer100Km: 18 },
    { id: 'truck-04', label: 'Truck 04', capacityKg: 2400, fuelConsumptionLPer100Km: 18 },
    { id: 'truck-05', label: 'Truck 05', capacityKg: 2400, fuelConsumptionLPer100Km: 18 },
  ],
  stores: [
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
  ],
  routes: [],
}
```

Populate `routes` with five deterministic route objects, three stores each, explicit monotonic planned times, realistic nonzero `distanceKm`, and `geometryId` values `route-truck-01` through `route-truck-05`.

- [ ] **Step 6: Run the focused tests and full build**

```bash
npm test -- tests/scenarioValidation.test.ts
npm test
npm run build
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/domain src/scenario tests/scenarioValidation.test.ts
git commit -m "feat: define Coca Coqui fleet scenario"
```

---

### Task 3: Build the pure deterministic simulation engine

**Files:**
- Create: `src/simulation/clock.ts`
- Create: `src/simulation/engine.ts`
- Create: `tests/simulationEngine.test.ts`

**Interfaces:**
- Consumes: `FleetScenario`, `RoutePlan`, `FleetSnapshot`, `TruckSnapshot`.
- Produces: `formatSimulationTime(minute: number): string` and `getFleetSnapshot(scenario, geometries, simulationMinute): FleetSnapshot`.

- [ ] **Step 1: Write tests for time-derived truck states**

`tests/simulationEngine.test.ts` must cover:

```ts
it('keeps trucks at the depot before departure', () => {
  const snapshot = getFleetSnapshot(cocaCoquiScenario, testGeometries, -1)
  expect(snapshot.trucks.every((truck) => truck.status === 'AT_DEPOT')).toBe(true)
})

it('holds a truck at its store while unloading', () => {
  const route = cocaCoquiScenario.routes[0]
  const stop = route.stops[0]
  const snapshot = getFleetSnapshot(cocaCoquiScenario, testGeometries, stop.plannedArrivalMinute + 1)
  expect(snapshot.trucks[0].status).toBe('UNLOADING')
  expect(snapshot.trucks[0].currentStopId).toBe(stop.storeId)
})

it('ends every truck DONE at the depot after the scenario', () => {
  const snapshot = getFleetSnapshot(cocaCoquiScenario, testGeometries, 300)
  expect(snapshot.trucks.every((truck) => truck.status === 'DONE')).toBe(true)
  expect(snapshot.trucks.every((truck) => truck.routeProgress === 1)).toBe(true)
})

it('is deterministic for the same timestamp', () => {
  const a = getFleetSnapshot(cocaCoquiScenario, testGeometries, 27)
  const b = getFleetSnapshot(cocaCoquiScenario, testGeometries, 27)
  expect(a).toEqual(b)
})
```

Use tiny deterministic LineString fixtures in `testGeometries`; do not mock React or MapLibre.

- [ ] **Step 2: Run RED**

```bash
npm test -- tests/simulationEngine.test.ts
```

Expected: FAIL because the simulation engine does not exist.

- [ ] **Step 3: Implement clock helpers**

`src/simulation/clock.ts`:

```ts
export function formatSimulationTime(minute: number): string {
  const baseMinutes = 6 * 60
  const absolute = Math.max(0, Math.round(baseMinutes + minute))
  const hours = Math.floor(absolute / 60) % 24
  const minutes = absolute % 60
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
}
```

- [ ] **Step 4: Implement the minimal engine as a pure function**

`src/simulation/engine.ts` must:

1. Find the truck's route.
2. Return `AT_DEPOT` before `departureMinute`.
3. Return `UNLOADING` when `simulationMinute` is within a stop arrival/departure interval.
4. Return `EN_ROUTE` before the final store and `RETURNING` after the final store departure.
5. Return `DONE` at the depot at/after `returnMinute`.
6. Use route geometry length and Turf `along` to derive travelling positions.
7. Calculate bearing with Turf from two nearby points.
8. Keep `distanceTravelledKm` and `estimatedFuelUsedL` monotonic because both are derived from total route progress.
9. Decrease cargo only after a delivery is completed.

The exported signature must be:

```ts
export function getFleetSnapshot(
  scenario: FleetScenario,
  geometries: Record<string, Feature<LineString>>,
  simulationMinute: number,
): FleetSnapshot
```

- [ ] **Step 5: Run tests and build**

```bash
npm test -- tests/simulationEngine.test.ts
npm test
npm run build
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/simulation tests/simulationEngine.test.ts
git commit -m "feat: add deterministic fleet simulation engine"
```

---

### Task 4: Prepare static road geometries and the GeoJSON map adapter

**Files:**
- Create: `scripts/prepare-routes.mjs`
- Create: `public/data/coca-coqui-routes.geojson`
- Create: `src/map/fleetGeoJson.ts`
- Create: `tests/fleetGeoJson.test.ts`

**Interfaces:**
- Consumes: scenario route `geometryId`s and `FleetSnapshot`.
- Produces: static route `FeatureCollection<LineString>` plus `fleetSnapshotToGeoJson(snapshot)`.

- [ ] **Step 1: Write the failing GeoJSON adapter test**

```ts
import { describe, expect, it } from 'vitest'
import { fleetSnapshotToGeoJson } from '../src/map/fleetGeoJson'

it('creates one Point feature per truck', () => {
  const data = fleetSnapshotToGeoJson({
    simulationMinute: 0,
    trucks: [
      {
        truckId: 'truck-01',
        position: [-64.18, -31.42],
        bearing: 90,
        status: 'EN_ROUTE',
        currentStopId: null,
        nextStopId: 'store-01',
        routeProgress: 0.2,
        cargoKg: 1400,
        completedDeliveries: 0,
        distanceTravelledKm: 2,
        estimatedFuelUsedL: 0.36,
      },
    ],
  })

  expect(data.features).toHaveLength(1)
  expect(data.features[0].geometry.type).toBe('Point')
  expect(data.features[0].properties?.truckId).toBe('truck-01')
})
```

- [ ] **Step 2: Run RED**

```bash
npm test -- tests/fleetGeoJson.test.ts
```

- [ ] **Step 3: Implement the adapter**

`fleetSnapshotToGeoJson` must return one GeoJSON Point feature per truck with these properties only:

```ts
{
  truckId,
  bearing,
  status,
  currentStopId,
  nextStopId,
  routeProgress,
}
```

- [ ] **Step 4: Add a route preparation script**

`scripts/prepare-routes.mjs` must:

1. Read the depot and route stop coordinates from a small local constant matching `cocaCoquiScenario`.
2. For each of the five planned truck routes, request one road-following route from an OpenStreetMap-compatible routing service during development.
3. Request GeoJSON geometry output.
4. Fail on non-200 HTTP responses or missing LineString geometry.
5. Write one FeatureCollection to `public/data/coca-coqui-routes.geojson` with feature IDs matching `route-truck-01` through `route-truck-05`.
6. Never run in the browser or production runtime.

Expected output shape:

```json
{
  "type": "FeatureCollection",
  "features": [
    {
      "type": "Feature",
      "id": "route-truck-01",
      "properties": { "truckId": "truck-01" },
      "geometry": { "type": "LineString", "coordinates": [] }
    }
  ]
}
```

If the public routing endpoint is temporarily unavailable during implementation, use a checked-in road-following fixture generated once from a valid route response; do not change V0 into a runtime-routing application.

- [ ] **Step 5: Validate assets and tests**

```bash
npm run prepare:routes
npm test -- tests/fleetGeoJson.test.ts
npm test
npm run build
```

Expected: the GeoJSON file contains five route features and all tests pass.

- [ ] **Step 6: Commit**

```bash
git add scripts public/data src/map/fleetGeoJson.ts tests/fleetGeoJson.test.ts
git commit -m "feat: add static route assets and fleet GeoJSON adapter"
```

---

### Task 5: Render the map, routes, stores, depot and five trucks with one MapLibre vehicle source

**Files:**
- Create: `src/map/mapConfig.ts`
- Create: `src/map/FleetMap.tsx`
- Modify: `src/app.css`
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: `FleetScenario`, route FeatureCollection, `FleetSnapshot`.
- Produces: `<FleetMap scenario={...} routes={...} snapshot={...} />`.

- [ ] **Step 1: Implement stable source/layer IDs**

`src/map/mapConfig.ts` must export:

```ts
export const MAP_CENTER: [number, number] = [-64.1888, -31.4201]
export const MAP_ZOOM = 12
export const SOURCE_ROUTES = 'fleet-routes'
export const SOURCE_STORES = 'fleet-stores'
export const SOURCE_TRUCKS = 'fleet-trucks'
export const SOURCE_DEPOT = 'fleet-depot'
```

- [ ] **Step 2: Implement `FleetMap` with MapLibre lifecycle isolated from React state logic**

The component must:

1. Create exactly one MapLibre map instance on mount.
2. Add route, store, depot and truck GeoJSON sources after map load.
3. Add a line layer for all five routes.
4. Add point/circle layers for stores and depot.
5. Add one symbol/circle source for all five trucks rather than five React markers.
6. Update only the truck source data when `snapshot` changes.
7. Remove the map instance on unmount.
8. Keep required OpenStreetMap/map-style attribution visible.

Do not create business logic inside the component.

- [ ] **Step 3: Add the map-first shell**

`src/App.tsx` at this stage should load:

- the local scenario;
- `/data/coca-coqui-routes.geojson` once;
- an initial snapshot at minute `0`;
- `FleetMap` full viewport.

If route assets fail to load, render a visible `Unable to load simulation route data.` message.

- [ ] **Step 4: Build**

```bash
npm test
npm run build
```

Expected: build passes; manual dev smoke shows one depot, 15 stores, five planned routes and five truck points.

- [ ] **Step 5: Commit**

```bash
git add src/map src/App.tsx src/app.css
git commit -m "feat: render Coca Coqui fleet map"
```

---

### Task 6: Add the accelerated simulation loop and operator-facing controls

**Files:**
- Create: `src/components/SimulationControls.tsx`
- Create: `src/components/SimulationClock.tsx`
- Create: `src/components/FleetPanel.tsx`
- Create: `src/components/KpiPanel.tsx`
- Create: `src/simulation/metrics.ts`
- Create: `tests/metrics.test.ts`
- Modify: `src/App.tsx`
- Modify: `src/app.css`

**Interfaces:**
- Consumes: `getFleetSnapshot`, `formatSimulationTime`, `FleetSnapshot`, scenario routes.
- Produces: working Play/Pause/Reset/speed demo and visible KPIs.

- [ ] **Step 1: Write failing KPI tests**

`tests/metrics.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { getFleetMetrics } from '../src/simulation/metrics'

it('derives deliveries and active trucks from a fleet snapshot', () => {
  const metrics = getFleetMetrics(snapshotFixture, scenarioFixture)
  expect(metrics.totalDeliveries).toBe(15)
  expect(metrics.completedDeliveries).toBeGreaterThanOrEqual(0)
  expect(metrics.activeTrucks).toBeGreaterThanOrEqual(0)
  expect(metrics.plannedDistanceKm).toBeGreaterThan(0)
  expect(metrics.estimatedFuelLitres).toBeGreaterThan(0)
})
```

- [ ] **Step 2: Run RED**

```bash
npm test -- tests/metrics.test.ts
```

- [ ] **Step 3: Implement metrics**

`getFleetMetrics(snapshot, scenario)` must return:

```ts
export interface FleetMetrics {
  completedDeliveries: number
  totalDeliveries: number
  activeTrucks: number
  plannedDistanceKm: number
  estimatedFuelLitres: number
}
```

Rules:

- `completedDeliveries`: sum of truck snapshot completed deliveries.
- `totalDeliveries`: `scenario.stores.length`.
- `activeTrucks`: trucks in `EN_ROUTE`, `UNLOADING`, or `RETURNING`.
- `plannedDistanceKm`: sum of route `distanceKm`.
- `estimatedFuelLitres`: sum of each route distance multiplied by its truck nominal L/100 km divided by 100.

- [ ] **Step 4: Implement controls and clock**

`SimulationControls` props:

```ts
interface SimulationControlsProps {
  isPlaying: boolean
  speed: number
  onPlayPause(): void
  onReset(): void
  onSpeedChange(speed: number): void
}
```

Expose speed presets `1`, `10`, `30`, `60` simulated seconds per real second. The prominent clock uses `formatSimulationTime(simulationMinute)`.

- [ ] **Step 5: Implement one animation loop in `App.tsx`**

Use a single `requestAnimationFrame` loop and a ref for the previous frame timestamp. When playing:

```ts
const simulatedMinutesDelta = (realDeltaSeconds * speed) / 60
```

Advance `simulationMinute`, recompute `getFleetSnapshot`, and stop automatically once the maximum route `returnMinute` is reached.

Reset must set the clock to `0`, restore all trucks to their initial snapshot, and pause playback.

- [ ] **Step 6: Render fleet and KPI panels**

Each truck row must show:

- label;
- status;
- current/next stop;
- completed deliveries.

KPI panel must show:

- deliveries completed / 15;
- active trucks / 5;
- planned km;
- **estimated fuel** in litres.

The word `estimated` must remain visible with the fuel metric.

- [ ] **Step 7: Verify automated and manual behavior**

```bash
npm test
npm run build
npm run dev
```

Manual acceptance:

1. Press Play.
2. Clock advances.
3. Multiple trucks move simultaneously.
4. Trucks pause at scheduled stores.
5. Fleet panel state changes with the clock.
6. Pause freezes time and movement.
7. Speed changes alter simulation rate.
8. Reset returns all trucks to the start.
9. All trucks eventually return and become `DONE`.

- [ ] **Step 8: Commit**

```bash
git add src/components src/simulation src/App.tsx src/app.css tests/metrics.test.ts
git commit -m "feat: add interactive fleet simulation controls"
```

---

### Task 7: Harden the public V0, document attribution, and verify static deployment

**Files:**
- Modify: `README.md`
- Modify: `src/App.tsx`
- Modify: `src/app.css`
- Create: `.github/workflows/ci.yml`

**Interfaces:**
- Consumes: complete V0 application.
- Produces: documented and CI-verified public repository ready for static hosting.

- [ ] **Step 1: Update README with the exact product boundary**

README must state:

- FleetFlow Sim is an open-source visual fleet-routing simulation.
- Coca Coqui is fictional.
- All stores, demand, schedules and operational data are synthetic.
- Road geometries/map context derive from open mapping/routing data and keep their own attribution/licensing.
- Fuel is an estimate using `distance × nominal L/100 km / 100`.
- No live GPS, telemetry, traffic, customer data or measured fuel savings exist in V0.
- Local commands: `npm install`, `npm run prepare:routes`, `npm run dev`, `npm test`, `npm run build`.

- [ ] **Step 2: Add CI**

`.github/workflows/ci.yml`:

```yaml
name: CI

on:
  push:
  pull_request:

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

- [ ] **Step 3: Run final local verification**

```bash
npm ci
npm test
npm run build
```

Expected: all commands exit 0.

- [ ] **Step 4: Verify static-path assumptions**

Inspect the production build locally and confirm:

- Vite uses relative `base: './'` paths.
- route GeoJSON resolves from the static build.
- no secret/API key is bundled.
- the deployed simulation does not need the route-preparation service at runtime.

- [ ] **Step 5: Commit**

```bash
git add README.md .github/workflows/ci.yml src/App.tsx src/app.css
git commit -m "docs: prepare FleetFlow V0 for public release"
```

---

## V0 Acceptance Gate

Do not expand scope until all of the following are true:

```text
[ ] npm test passes
[ ] npm run build passes
[ ] one depot renders
[ ] fifteen synthetic stores render
[ ] five planned road-following routes render
[ ] five trucks are represented by one fleet GeoJSON source
[ ] Play animates all active trucks from the synthetic clock
[ ] unloading stops are visible in time and state
[ ] pause / speed / reset work
[ ] all trucks finish DONE at the depot
[ ] deliveries / active trucks / planned km / estimated fuel render
[ ] fictional/synthetic disclaimers are visible in README
[ ] no backend, auth, DB, sensor, paid API, or runtime route service was introduced
```

Only after this gate should V1 consider route optimization, 30 trucks, 80+ stops, planned-vs-actual telemetry, or OR-Tools.
