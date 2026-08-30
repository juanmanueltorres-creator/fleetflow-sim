# FleetFlow Sim

Open-source visual fleet simulator for testing last-mile operations on an interactive map: vehicles move along road-following routes, execute scheduled stops, carry capacity-constrained loads, and expose the operation through a compact fleet HUD.

**Live demo:** https://juanmanueltorres-creator.github.io/fleetflow-sim/

## V0.5 — Operational Timeline Foundation

V0.5 adds a date-aware operational layer above the existing calibrated `FleetScenario` and simulation engine. The browser loads an immutable `OperationalRun` selected from a checked-in manifest, then passes that run's scenario into the same simulation pipeline used by V0.4.

Each run carries explicit evidence metadata:

- `targetDate` — operational date represented by the run
- `issuedAt` — timestamp when the artifact was issued
- `dataAsOf` — latest information timestamp represented by the artifact
- `mode` — evidence semantics for the run

The initial immutable window contains eight checked-in dates:

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

Across the eight dates, FleetFlow keeps the same **8 vehicles, 60 delivery locations, depot, ownership, and road geometry** while varying operational package demand and timing deterministically by date. Artifacts are immutable JSON files referenced by:

```text
public/data/operational-runs/manifest.json
```

To regenerate an equivalent explicit window into a clean output directory:

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
| **Córdoba calibrado** | Public-data-calibrated behavior with a V0.5 operational timeline and synthetic Córdoba geography | 8 | 60 | Parcels / volume |
| **Coca Coqui · Legacy V0** | Original fully synthetic proof of concept | 5 | 15 | Mass / kg |

Switching scenarios resets the clock, pauses playback, loads the matching static route asset, and remounts the map so layers and popups cannot leak between scenarios. Legacy V0 has no operational timeline and remains on its original static scenario path.

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
deterministic OperationalRun generator
                |
                v
manifest + immutable run artifacts
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

The checked-in calibration profile was derived from the `High` route subset and summarizes:

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

V0.5 keeps that geography seed stable and derives operational seeds from the target date:

```text
fleetflow:v0.5:cordoba:${targetDate}
```

Production generation never calls `Math.random()`. Tests regenerate the calibrated scenario and operational artifacts and require deterministic output, including a byte-for-byte golden run.

The generated calibrated scenario fixes route stop counts to:

```text
[6, 9, 7, 8, 6, 10, 7, 7]
```

V0.5 derives a deterministic daily package target around the 100-package baseline while retaining at least one package per stop.

## Architecture

```text
React + TypeScript + Vite
        |
        +-- Scenario Registry
        |     +-- Córdoba calibrated
        |     |     `-- OperationalRun Catalog -> FleetScenario
        |     `-- Coca Coqui Legacy V0 -> static FleetScenario
        |
        +-- existing pure time-based simulation engine
        +-- MASS / PARCELS cargo contracts
        +-- Turf route interpolation / bearing
        +-- static GeoJSON road routes
        +-- one GeoJSON vehicle source
        +-- MapLibre GL + OpenFreeMap
        `-- React timeline / clock / controls / KPIs / fleet / provenance
```

Operational runs are loaded lazily from `public/data`; the eight JSON artifacts are not imported into the JavaScript bundle. The deployed browser does **not** call OSRM or any routing API. Road geometry is prepared ahead of time and committed as static GeoJSON.

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

V0.5 intentionally has no backend, database, authentication, live GPS, IoT, live weather, live traffic, incident feed, dynamic road generation, production dispatch integration, or production-grade route optimizer.

The current project demonstrates an immutable operational-artifact boundary above the existing deterministic engine:

```text
OperationalRun Catalog -> FleetScenario -> Simulation Engine -> FleetSnapshot -> map / dashboard
```

Future observed or telemetry adapters can target those same boundaries without changing the current simulation engine contract.

## Roadmap

High-value next increments:

1. external operational context such as weather, traffic, holidays, and calendar demand signals
2. multiple forecast vintages plus explicit observed-data adapters
3. incidents, delays, replanning, and planned-versus-actual comparisons
4. optimization experiments such as baseline versus CVRP/OR-Tools assignments
5. live telemetry adapters through the existing `FleetSnapshot` contract

## Data, attribution and licenses

Application source code is released under the MIT License.

The calibrated workflow uses the **Amazon Last Mile Routing Research Challenge** public dataset under **CC BY-NC 4.0**. OpenStreetMap data used for route/map context is available under **ODbL** and requires attribution. The deployed basemap is served by OpenFreeMap and retains its required attribution.

See [`DATA_LICENSES.md`](DATA_LICENSES.md) for the source URLs, artifact boundaries, and third-party attribution notes.

## Project docs

Design specifications and implementation plans live under [`docs/superpowers/`](docs/superpowers/).
