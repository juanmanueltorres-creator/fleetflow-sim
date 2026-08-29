# Coca Coqui Visual Fleet Simulation — V1 Design

Date: 2026-08-29
Status: Approved in chat for specification
Repository: `juanmanueltorres-creator/fleetflow-sim`

## 1. Goal

Build a public, lightweight, browser-based fleet simulation that demonstrates scheduled distribution routes in Córdoba Capital without live GPS, IoT sensors, authentication, a database, or paid APIs.

The first version is a visual simulation, not a production fleet-management system. Its purpose is to make route plans understandable at a glance: trucks leave a depot according to a schedule, move along real road geometries, stop at stores for unloading, and return to the depot while a simulation clock advances.

The fictional demo company is **Coca Coqui**. The product remains generic and reusable under the repository name **FleetFlow Sim**.

## 2. V1 Success Criteria

A successful V1 must let a visitor open the app and, without configuration:

1. See one fictional distribution depot in Córdoba Capital.
2. See approximately 15 synthetic delivery locations.
3. See five fictional trucks assigned to scheduled routes.
4. Press Play and watch all active trucks move along mapped road routes.
5. See a simulation clock advance faster than real time.
6. See trucks change state between `AT_DEPOT`, `EN_ROUTE`, `UNLOADING`, `RETURNING`, and `DONE`.
7. See planned arrival times and current simulated state for each truck.
8. Pause, resume, change simulation speed, and replay the scenario.
9. See basic operational metrics: deliveries completed, active trucks, total planned distance, and estimated fuel consumption.
10. Run entirely as a static public frontend after route data is prepared.

## 3. Scope

### Included

- React + TypeScript + Vite frontend.
- MapLibre GL interactive map.
- Turf.js for distance-along-route interpolation and bearing calculations.
- GeoJSON-based route and vehicle visualization.
- Synthetic depot, stores, demand, truck capacity, service duration, and schedules.
- Realistic road-following route geometries derived from OpenStreetMap routing data.
- A GTFS-inspired schedule model: stops, trips, stop times, and planned movement.
- A deterministic simulation engine driven by a synthetic clock.
- Five trucks and roughly 15 stores in the initial scenario.
- Estimated fuel consumption using planned distance and nominal vehicle consumption.
- Vitest tests for simulation invariants and deterministic behavior.
- MIT-licensed application code.

### Explicitly excluded from V1

- Live GPS or IoT telemetry.
- Real company/customer data.
- Real-time traffic.
- Authentication or user accounts.
- Supabase, PostGIS, FastAPI, or any persistent backend.
- Cesium or 3D visualization.
- AI or LLM features.
- Production-grade vehicle-routing optimization.
- Driver shifts, legal constraints, time windows, multi-depot routing, or heterogeneous fleet optimization.
- Claims of measured fuel savings.

## 4. Architecture

The application is a static single-page app with four intentionally isolated layers:

### Scenario Data

A deterministic local dataset defines the depot, stores, vehicles, routes, schedules, capacities, service durations, nominal fuel rates, and route geometries. The frontend can load the scenario without external runtime dependencies.

### Simulation Engine

A pure TypeScript engine owns simulation time and truck state. Given the scenario and a simulation timestamp, it determines each truck's current leg, status, cargo state, progress, and position along its route.

This layer does not know about React or MapLibre.

### Map Projection Layer

A small adapter converts simulation state into GeoJSON collections consumed by MapLibre. All trucks are represented in a single vehicle GeoJSON source rather than independent React marker components. Route and stop layers are likewise GeoJSON-driven.

A single animation loop updates the simulation timestamp and replaces the vehicle source data. Turf.js is used to interpolate a truck's position along a route and calculate heading.

### UI Layer

React renders controls and status panels around the map. UI components read simulation state but do not own routing or simulation logic.

Conceptual flow:

`Scenario JSON -> Simulation Engine -> Fleet Snapshot -> GeoJSON Adapter -> MapLibre`

and simultaneously:

`Fleet Snapshot -> React KPI / Fleet / Clock UI`

## 5. Domain Model

### Depot

- `id`
- `name`
- `position`

### Store

- `id`
- `name`
- `position`
- `demandKg`
- `serviceMinutes`

### Truck

- `id`
- `label`
- `capacityKg`
- `fuelConsumptionLPer100Km`

### Planned Stop

- `storeId`
- `plannedArrival`
- `plannedDeparture`
- `demandKg`

### Route Plan

- `truckId`
- ordered `stops`
- road-following GeoJSON geometry
- `distanceKm`
- `plannedDurationMinutes`

### Fleet Snapshot

For every simulation tick:

- `simulationTime`
- `truckId`
- `position`
- `bearing`
- `status`
- `currentStopId` when applicable
- `routeProgress`
- `cargoKg`
- `distanceTravelledKm`
- `estimatedFuelUsedL`

This snapshot contract is intentionally compatible with a later telemetry source. A future GPS/API adapter can produce the same structure without forcing the map and UI to be rewritten.

## 6. Schedule Model

The scheduling concept is inspired by public-transit data models such as GTFS, but adapted to logistics.

For each truck, the scenario stores a trip containing an ordered sequence of stops and planned times. Travel occurs between planned departure and arrival times. At each store the truck remains stationary for the configured service interval.

Example:

- 06:00 — leave depot
- 06:17 — arrive Store 04
- 06:22 — leave Store 04
- 06:36 — arrive Store 11
- 06:41 — leave Store 11
- 07:03 — return depot

Simulation state is therefore derived from time, not from arbitrary pixel movement. This makes the future comparison between `PLANNED` and `ACTUAL` telemetry straightforward.

## 7. Animation Model

One `requestAnimationFrame` loop advances the synthetic clock.

Default demo speed: **60 simulated seconds per real second**. The UI may expose preset multipliers such as pause, 1x, 10x, 30x, and 60x simulated time.

For a truck currently travelling:

1. Determine elapsed simulated time within its active route leg.
2. Convert elapsed time to a normalized progress value from 0 to 1.
3. Convert progress to distance along the road geometry.
4. Use Turf to calculate the point at that distance.
5. Calculate bearing from nearby route points.
6. Emit the truck position in the fleet GeoJSON snapshot.

For a truck unloading, its map position remains at the store until the planned service interval ends.

## 8. Routing Data Strategy

The deployed V1 must not depend on a public routing service being available at runtime.

A development script will obtain required road geometries from an open routing source based on OpenStreetMap data, then save the resulting route data into the repository as static scenario assets.

This gives the demo:

- reproducibility;
- no API key;
- no paid service;
- no runtime rate-limit dependency;
- predictable GitHub Pages/static-host behavior.

OpenStreetMap attribution must remain visible wherever required by the selected map style/data source. External data retains its own licensing and attribution requirements; the MIT license applies to application code, not third-party datasets.

## 9. UI

The V1 should be intentionally map-first.

### Main map

- Full viewport or near-full viewport MapLibre map centered on Córdoba Capital.
- Depot marker.
- Store markers.
- Planned route lines.
- Animated truck symbols rotated to heading.
- Delivered/undelivered stop state visible without overwhelming the map.

### Simulation controls

- Play.
- Pause.
- Replay/reset.
- Speed selector.
- Prominent simulated time display.

### Fleet panel

For each of five trucks:

- identifier;
- current status;
- next/current stop;
- planned arrival time;
- completed deliveries.

### KPI panel

- deliveries completed / total;
- active trucks;
- planned fleet distance;
- estimated fuel consumption;
- simulated elapsed time.

No dashboard page, login flow, settings screen, analytics suite, or admin UI is required.

## 10. Fuel Metric

Fuel is a transparent estimate, not sensor-derived consumption.

`estimatedFuelLitres = distanceKm * nominalLitresPer100Km / 100`

The UI and README must label it as **estimated fuel**. V1 must not claim real savings or operational validation.

## 11. Error Handling

Because runtime inputs are local and deterministic, failure modes should stay explicit and simple.

- Invalid scenario data: fail fast with a visible scenario-load error.
- Missing geometry for a truck route: do not animate that truck; mark the route invalid in development/tests.
- Impossible schedule ordering: validation fails before simulation begins.
- Truck load exceeding capacity: scenario validation fails.
- Missing map style/network tiles: controls and scenario data can remain loaded, but the map should show a clear map-load failure rather than silently breaking.

No retry framework or global error-management subsystem is needed for V1.

## 12. Testing

The implementation must include focused automated tests for domain behavior.

Required invariants:

1. Every planned store is assigned exactly once in the V1 scenario.
2. Truck assigned demand does not exceed capacity.
3. Every route starts at the depot and eventually returns to the depot.
4. Planned stop times are monotonically increasing.
5. Simulation state is deterministic for a given timestamp.
6. Before departure, a truck is at the depot.
7. During unloading, a truck remains at the target store.
8. At scenario completion, every truck ends in `DONE` at the depot.
9. Distance travelled never decreases as simulation time advances.
10. Estimated fuel usage never decreases as simulation time advances.

Map rendering itself does not need pixel-level visual regression testing in V1.

## 13. Initial Scenario

Working title: **Coca Coqui — Córdoba Distribution Run**.

Initial scale:

- 1 synthetic depot;
- 15 synthetic stores distributed across Córdoba Capital;
- 5 trucks;
- one morning distribution shift beginning around 06:00;
- deterministic demand and service times;
- routes prepared in advance from real road geometries;
- no personally identifiable or real commercial information.

The scenario must be obviously fictional in both UI and README.

## 14. Future-Compatible Boundary

V1 deliberately separates `PLANNED` from the future concept of `ACTUAL`.

Today:

`SimulationEngine -> FleetSnapshot`

Later:

`GPS / IoT / API -> FleetSnapshot`

The map and most UI components should consume `FleetSnapshot` regardless of its source. This is the primary architectural decision that allows the demo to evolve into a real telemetry viewer without rebuilding the frontend.

Possible later phases, outside this spec:

- 30 trucks / 80+ stops;
- browser-side route heuristics;
- FastAPI + OR-Tools CVRP optimization;
- planned-vs-actual delay analysis;
- GPS/IoT telemetry ingestion;
- traffic and time windows;
- mining/logistics scenarios;
- integration into a larger territorial/operational platform.

## 15. Definition of Done

V1 is done when a fresh visitor can open the public static application, press Play, understand that five scheduled delivery trucks are operating across Córdoba, watch them follow their routes and stop at stores according to the simulation clock, inspect current fleet state and basic metrics, replay the run, and understand from the interface/README that all operational data and fuel figures are synthetic estimates.
