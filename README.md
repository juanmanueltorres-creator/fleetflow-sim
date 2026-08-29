# FleetFlow Sim

Open-source visual fleet simulator for testing last-mile operations on an interactive map: vehicles move along road-following routes, execute scheduled stops, carry capacity-constrained loads, and expose the operation through a compact fleet HUD.

**Live demo:** https://juanmanueltorres-creator.github.io/fleetflow-sim/

## V0.4 — Calibrated Córdoba scenario

V0.4 adds a second-generation scenario whose **operational behavior is calibrated from public last-mile data**, while its locations and road routes are deliberately adapted to Córdoba Capital.

The default scenario contains:

- 1 synthetic distribution hub in Córdoba
- 8 synthetic delivery vehicles
- 60 synthetic delivery locations
- exactly 100 packages
- parcel-volume capacity constraints
- deterministic departures, travel times, service times, and optional delivery windows
- 8 checked-in road-following route geometries
- animated states: `AT_DEPOT`, `EN_ROUTE`, `UNLOADING`, `RETURNING`, and `DONE`
- delivery, active-fleet, planned-distance, and estimated-fuel KPIs
- clickable depot, vehicle, and delivery details
- a visible provenance panel explaining source, method, synthetic elements, and limitations

> **Calibrated does not mean real Córdoba operations.** The behavioral distributions come from aggregated public data. Delivery coordinates, vehicle identities, assignments, schedules, and Córdoba road routes are generated/adapted for FleetFlow and do not represent Amazon, Mercado Libre, or any other real operator in Córdoba.

## Two scenarios, one simulation engine

The connected top rail lets you switch atomically between:

| Scenario | Purpose | Vehicles | Stops | Cargo |
| --- | --- | ---: | ---: | --- |
| **Córdoba calibrado** | Public-data-calibrated behavior with synthetic Córdoba geography | 8 | 60 | Parcels / volume |
| **Coca Coqui · Legacy V0** | Original fully synthetic proof of concept | 5 | 15 | Mass / kg |

Switching scenarios resets the clock, pauses playback, loads the matching static route asset, and remounts the map so layers and popups cannot leak between scenarios.

## Evidence pipeline

The raw external dataset is used **offline only**. It is never bundled into the deployed application or committed to this repository.

```text
Amazon Last Mile training data (external, offline)
                |
                v
bounded-memory calibration script
                |
                v
compact aggregate profile
                |
                v
seeded Córdoba scenario generator
                |
                v
static road-route preparation
                |
                v
Scenario Registry
                |
                v
pure Simulation Engine -> FleetSnapshot -> map / HUD
```

The checked-in calibration profile was derived from the `High` route subset and summarizes:

- **2,718 routes**
- **379,444 drop-off stops**
- **651,562 packages**

Only aggregate distributions are retained: stops per route, packages per stop, service time, consecutive-stop travel time, time-window frequency/width, package volume, vehicle capacity, and departure time.

The calibration parser processes the large source JSON objects incrementally instead of loading multi-gigabyte files into memory. It also handles the source dataset's non-standard bare `NaN` values without altering text strings that merely contain `NaN`.

## Deterministic generation

The Córdoba calibrated artifact is reproducible from the checked-in aggregate profile with the canonical seed:

```bash
npm run generate:calibrated
```

Canonical seed:

```text
fleetflow-cordoba-v0.4
```

Generation uses a seeded PRNG; production generation never calls `Math.random()`. The test suite regenerates the scenario and requires it to match the checked-in JSON exactly.

The generated scenario currently fixes route stop counts to:

```text
[6, 9, 7, 8, 6, 10, 7, 7]
```

Package counts are normalized deterministically to exactly 100 while keeping at least one package at every delivery.

## Architecture

```text
React + TypeScript + Vite
        |
        +-- Scenario Registry
        |     +-- Córdoba calibrated
        |     `-- Coca Coqui Legacy V0
        |
        +-- pure time-based simulation engine
        +-- MASS / PARCELS cargo contracts
        +-- Turf route interpolation / bearing
        +-- static GeoJSON road routes
        +-- one GeoJSON vehicle source
        +-- MapLibre GL + OpenFreeMap
        `-- React clock / controls / KPIs / fleet / provenance
```

The deployed browser does **not** call OSRM or any routing API. Road geometry is prepared ahead of time and committed as static GeoJSON.

## Static road routes

Legacy routes:

```text
public/data/coca-coqui-routes.geojson
```

Calibrated Córdoba routes:

```text
public/data/cordoba-calibrated-routes.geojson
```

To regenerate them during development:

```bash
npm run prepare:routes
npm run prepare:routes:calibrated
```

Route preparation uses OpenStreetMap-based OSRM routing outside the browser. The script validates route-leg cardinality and strictly increasing cumulative waypoint distances before writing an asset.

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

V0.4 intentionally has no backend, database, authentication, live GPS, IoT, traffic feed, live dispatch integration, or production-grade route optimizer.

The current project demonstrates a deterministic operational model and a clean interface boundary:

```text
planned scenario -> Simulation Engine -> FleetSnapshot -> map / dashboard
```

A later telemetry adapter could provide the same snapshot contract:

```text
GPS / IoT -> API -> FleetSnapshot -> map / dashboard
```

## Roadmap

High-value next increments:

1. baseline versus optimized route assignment
2. OR-Tools CVRP with capacity and time windows
3. planned-versus-actual delays and service exceptions
4. schedule/import adapters
5. real telemetry through the existing `FleetSnapshot` contract

## Data, attribution and licenses

Application source code is released under the MIT License.

The calibrated workflow uses the **Amazon Last Mile Routing Research Challenge** public dataset under **CC BY-NC 4.0**. OpenStreetMap data used for route/map context is available under **ODbL** and requires attribution. The deployed basemap is served by OpenFreeMap and retains its required attribution.

See [`DATA_LICENSES.md`](DATA_LICENSES.md) for the source URLs, artifact boundaries, and third-party attribution notes.

## Project docs

Design specifications and implementation plans live under [`docs/superpowers/`](docs/superpowers/).
