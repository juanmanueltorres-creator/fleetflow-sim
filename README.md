# FleetFlow Sim

Open-source visual fleet simulator for testing last-mile operations on an interactive map: vehicles move along road-following routes, execute scheduled stops, carry capacity-constrained loads, and expose the operation through a compact fleet HUD.

**Live demo:** https://juanmanueltorres-creator.github.io/fleetflow-sim/

## V0.6 — Daily Spatial Demand

V0.6 makes the Córdoba operational timeline spatially variable while preserving the fixed eight-vehicle fleet and the existing simulation engine. Each published date is an immutable `OperationalRun` bundle with its own synthetic delivery set, parcel assignment, schedule, and road-following GeoJSON route artifact.

The active timeline is referenced by:

```text
public/data/operational-runs/manifest-v0-6.json
```

For the checked-in 2026-08-27 through 2026-09-03 window, every run has:

- exactly 8 synthetic delivery vehicles and the same Córdoba depot
- 45–65 active synthetic delivery destinations selected from a versioned 240-point candidate pool
- a deterministic package target derived from the calibrated weekly profile
- every active destination assigned exactly once to one vehicle
- parcel-volume capacity constraints enforced per vehicle
- deterministic nearest-neighbour stop ordering
- one immutable, run-bound road GeoJSON artifact carrying `runId`, `targetDate`, and `modelVersion`
- planned and remaining package counts exposed per vehicle in the fleet panel

**GTFS structure informs synthetic spatial weighting; it is not parcel-demand truth.** Córdoba municipal GTFS is used offline only as a spatial proxy for constructing the synthetic candidate universe. Candidate labels are neutral (`Entrega 001`, `Entrega 002`, etc.); they are not represented as real customers, businesses, homes, or transit stops.

**V0.6 runs are deterministic model outputs, not observed Córdoba operations.** They do not represent live parcel demand, telemetry, traffic, weather, a real operator's customer list, or measured delivery routes.

**V0.6 uses per-run route artifacts and `manifest-v0-6.json`.** The historical V0.5 `manifest.json` and its generated artifacts remain checked in and valid for compatibility, but they are no longer the active Córdoba timeline.

### Reproducing the V0.6 spatial artifacts

After extracting the official Córdoba GTFS so that `stops.txt` exists at the stated temporary path, regenerate candidate-pool v1 with the canonical command:

```bash
node scripts/generate-candidate-pool.mjs \
  --stops /tmp/fleetflow-cordoba-gtfs/stops.txt \
  --output src/scenario/operationalRuns/candidate-pool-v1.json
```

The published V0.6 operational window is generated with:

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

The V0.6 generator uses OSRM only during offline route preparation. It validates every run before publication and refuses to overwrite an existing manifest, run JSON, or route GeoJSON.

### Stable What-If handoff

PR2 intentionally stops at the immutable Base-run boundary. A later What-If implementation must consume the existing V0.6 contracts instead of inventing a parallel model:

```text
Base modelVersion: fleetflow-v0.6
Base artifact: OperationalRun
Route artifact: V2-bound GeoJSON
Timing interface: scripts/lib/v0-6-route-timing.mjs#scheduleScenarioFromRoutes
Candidate IDs/cargo: frozen inside each published Base run
```

What-If comparison is **not** implemented in V0.6 PR2.

## V0.5 — Operational Timeline Foundation

V0.5 introduced a date-aware operational layer above the calibrated `FleetScenario` and simulation engine. The browser loads an immutable `OperationalRun` selected from a checked-in manifest, then passes that run's scenario into the same simulation pipeline used by V0.4. That bundle boundary remains the foundation used by V0.6.

Each run carries explicit evidence metadata:

- `targetDate` — operational date represented by the run
- `issuedAt` — timestamp when the artifact was issued
- `dataAsOf` — latest information timestamp represented by the artifact
- `mode` — evidence semantics for the run

The historical V0.5 immutable window contains eight checked-in dates:

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

`SIMULATED` means a reproducible synthetic replay generated from the calibrated model. `FORECAST` means a reproducible synthetic operational forecast for a target date after the issuance date. Neither mode represents observed Córdoba delivery demand, live traffic, real telemetry, or a real operator's routes.

Across those historical V0.5 dates, FleetFlow kept the same **8 vehicles, 60 delivery locations, depot, ownership, and road geometry** while varying operational package demand and timing deterministically by date. Those compatibility artifacts remain referenced by:

```text
public/data/operational-runs/manifest.json
```

To regenerate an equivalent historical V0.5 window into a clean output directory:

```bash
npm run generate:operational-runs -- \
  --from 2026-08-27 \
  --to 2026-09-03 \
  --issued-at 2026-08-30T21:00:00-03:00 \
  --data-as-of 2026-08-30T21:00:00-03:00 \
  --output-dir public/data/operational-runs \
  --run-suffix v2
```

The generator is deterministic, offline, and fail-closed: existing artifacts are not overwritten.

## V0.4 — Calibrated Córdoba scenario

V0.4 introduced the underlying second-generation scenario whose **operational behavior is calibrated from public last-mile data**, while its locations and road routes are deliberately adapted to Córdoba Capital.

The calibrated baseline contains:

- 1 synthetic distribution hub in Córdoba
- 8 synthetic delivery vehicles
- 60 synthetic delivery locations
- a 100-package baseline used by the calibrated generator
- parcel-volume capacity constraints
- deterministic departures, travel times, service times, and optional delivery windows
- 8 checked-in road-following route geometries
- animated states: `AT_DEPOT`, `EN_ROUTE`, `UNLOADING`, `RETURNING`, and `DONE`
- delivery, active-fleet, planned-distance, and estimated-fuel KPIs
- clickable depot, vehicle, and delivery details
- a visible provenance panel explaining source, method, synthetic elements, and limitations

> **Calibrated does not mean real Córdoba operations.** The behavioral distributions come from aggregated public data. Delivery coordinates, vehicle identities, assignments, schedules, and Córdoba road routes are generated/adapted for FleetFlow and do not represent Amazon, Mercado Libre, Rappi, PedidosYa, or any other real operator in Córdoba.

## Two scenarios, one simulation engine

The connected top rail lets you switch atomically between:

| Scenario | Purpose | Vehicles | Stops | Cargo |
| --- | --- | ---: | ---: | --- |
| **Córdoba calibrado** | Public-data-calibrated behavior with the active V0.6 spatial timeline and synthetic Córdoba geography | 8 | 45–65 per day | Parcels / volume |
| **Coca Coqui · Legacy V0** | Original fully synthetic proof of concept | 5 | 15 | Mass / kg |

Switching scenarios resets the clock, pauses playback, loads the matching operational/static route asset, and remounts the map so layers and popups cannot leak between scenarios. Legacy V0 has no operational timeline and remains on its original static scenario path.

## Evidence pipeline

External source datasets are used **offline only**. They are never bundled into the deployed application or committed as raw source files merely to run FleetFlow.

```text
Amazon Last Mile training data (external, offline)
                |
                v
bounded-memory calibration script
                |
                v
compact aggregate profile
                |
                +-------------------------------+
                |                               |
                v                               v
V0.4 calibrated fleet template       Córdoba GTFS spatial proxy
                                                |
                                                v
                                   240-point candidate pool
                                                |
                                                v
                                  daily deterministic demand
                                                |
                                                v
                                  8-truck assignment + ordering
                                                |
                                                v
                                     offline OSRM preparation
                                                |
                                                v
                                  V0.6 OperationalRun + routes
                                                |
                                                v
                                      manifest-v0-6.json
                                                |
                                                v
                                      OperationalRun Catalog
                                                |
                                                v
                                         FleetScenario
                                                |
                                                v
                         existing Simulation Engine -> FleetSnapshot -> map / HUD
```

The checked-in Amazon calibration profile was derived from the `High` route subset and summarizes:

- **2,718 routes**
- **379,444 drop-off stops**
- **651,562 packages**

Only aggregate distributions are retained: stops per route, packages per stop, service time, consecutive-stop travel time, time-window frequency/width, package volume, vehicle capacity, and departure time.

The calibration parser processes the large source JSON objects incrementally instead of loading multi-gigabyte files into memory. It also handles the source dataset's non-standard bare `NaN` values without altering text strings that merely contain `NaN`.

## Deterministic generation

The Córdoba calibrated baseline is reproducible from the checked-in aggregate profile with:

```bash
npm run generate:calibrated
```

Canonical V0.4 geography seed:

```text
fleetflow-cordoba-v0.4
```

Historical V0.5 operational seed:

```text
fleetflow:v0.5:cordoba:${targetDate}
```

V0.6 freezes four per-date random streams plus a versioned candidate-pool seed:

```text
fleetflow:v0.6:cordoba:${targetDate}:demand
fleetflow:v0.6:cordoba:${targetDate}:spatial
fleetflow:v0.6:cordoba:${targetDate}:operations
fleetflow:v0.6:cordoba:${targetDate}:assignment
fleetflow:v0.6:cordoba:candidate-pool-v1
```

Production generation never calls `Math.random()`. Tests regenerate the calibrated scenario and V0.6 logical artifacts with deterministic inputs and validate the checked-in published bundles.

The generated V0.4 calibrated scenario fixes route stop counts to:

```text
[6, 9, 7, 8, 6, 10, 7, 7]
```

V0.5 derived a deterministic daily package target around the 100-package baseline while keeping the 60-point geography stable. V0.6 retains the weekly package target as demand authority but deterministically selects 45–65 active destinations and redistributes them across the fixed eight-vehicle fleet.

## Architecture

```text
React + TypeScript + Vite
        |
        +-- Scenario Registry
        |     +-- Córdoba calibrated
        |     |     `-- OperationalRun Catalog -> OperationalBundle
        |     |                                  +-- run JSON
        |     |                                  `-- bound route GeoJSON
        |     `-- Coca Coqui Legacy V0 -> static FleetScenario
        |
        +-- existing pure time-based simulation engine
        +-- MASS / PARCELS cargo contracts
        +-- Turf route interpolation / bearing
        +-- checked-in GeoJSON road routes
        +-- one GeoJSON vehicle source
        +-- MapLibre GL + OpenFreeMap
        `-- React timeline / clock / controls / KPIs / fleet / provenance
```

Operational runs are loaded lazily from `public/data`; run JSON and route artifacts are not imported into the JavaScript bundle. The deployed browser does **not** call OSRM or any routing API. Road geometry is prepared ahead of time and committed as static GeoJSON.

## Static road routes

Legacy routes:

```text
public/data/coca-coqui-routes.geojson
```

Historical calibrated Córdoba V0.4/V0.5 shared routes:

```text
public/data/cordoba-calibrated-routes.geojson
```

V0.6 active Córdoba routes are bound per run under:

```text
public/data/operational-runs/generated/cordoba-*-v3.routes.geojson
```

To regenerate the legacy/shared route assets during development:

```bash
npm run prepare:routes
npm run prepare:routes:calibrated
```

V0.6 per-run routes are produced by the V0.6 operational-run command shown above. Route preparation uses OpenStreetMap-based OSRM routing outside the browser. The scripts validate route-leg cardinality and strictly increasing cumulative waypoint distances before writing an asset.

## Reproducing the Amazon calibration

The canonical calibration command expects the four public training inputs in an external directory:

```bash
npm run calibrate:amazon -- \
  --input-dir /tmp/fleetflow-amazon-training \
  --output src/scenario/calibration/amazon-last-mile-v1.json
```

Required source files:

```text
route_data.json
package_data.json
actual_sequences.json
travel_times.json
```

The repository also contains a **manual-only GitHub Actions workflow** that downloads the public training inputs to the runner's temporary filesystem and emits only the compact profile as an artifact. Raw source files are not uploaded or committed.

## Fuel metric

Fuel is **estimated, not measured**.

```text
estimated litres = distance travelled km * nominal L/100 km / 100
```

It is a simulation KPI only. FleetFlow does not currently model traffic, elevation, payload-dependent consumption, engine efficiency, driving behaviour, weather, or measured fuel telemetry.

## Development

Requirements: Node.js 22+.

```bash
npm install
npm run dev
```

Verification:

```bash
npm test
npm run build
```

CI runs the full test suite and a production build on pushes and pull requests.

## Scope boundaries

V0.6 PR2 intentionally has no backend, database, authentication, live GPS, IoT, live weather, live traffic, incident feed, browser routing, production dispatch integration, production-grade route optimizer, ML model, context score, or What-If implementation.

The current project demonstrates an immutable operational-bundle boundary above the existing deterministic engine:

```text
OperationalRun Catalog -> OperationalBundle -> FleetScenario -> Simulation Engine -> FleetSnapshot -> map / dashboard
```

Future observed, context, telemetry, or What-If adapters can target those same boundaries without changing the current simulation engine contract.

## Roadmap

High-value next increments:

1. What-If Base-versus-intervention comparison reusing the frozen V0.6 Base run and `scheduleScenarioFromRoutes`
2. external operational context such as weather, traffic, holidays, and calendar demand signals
3. multiple forecast vintages plus explicit observed-data adapters
4. incidents, delays, replanning, and planned-versus-actual comparisons
5. optimization experiments such as baseline versus CVRP/OR-Tools assignments
6. live telemetry adapters through the existing `FleetSnapshot` contract

## Data, attribution and licenses

Application source code is released under the MIT License.

The calibrated workflow uses the **Amazon Last Mile Routing Research Challenge** public dataset under **CC BY-NC 4.0**. Córdoba municipal GTFS is used as an offline spatial proxy for the synthetic candidate pool and carries its source attribution/license terms. OpenStreetMap data used for route/map context is available under **ODbL** and requires attribution. The deployed basemap is served by OpenFreeMap and retains its required attribution.

See [`DATA_LICENSES.md`](DATA_LICENSES.md) for the source URLs, artifact boundaries, and third-party attribution notes.

## Project docs

Design specifications and implementation plans live under [`docs/superpowers/`](docs/superpowers/).
