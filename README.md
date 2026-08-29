# FleetFlow Sim

Open-source visual fleet-routing simulator with animated vehicles, scheduled stops, and road-following routes on an interactive map.

## V0 — Coca Coqui Córdoba

The first scenario is **Coca Coqui — Córdoba Distribution Run**, a fictional last-mile logistics simulation built to validate a lightweight fleet-simulation architecture before adding optimization or real telemetry.

V0 models:

- 1 fictional distribution depot in Córdoba Capital
- 5 fictional delivery trucks
- 15 synthetic delivery stops
- deterministic departure, arrival, unloading, and return times
- accelerated simulation time with Play, Pause, Reset, and speed controls
- animated truck positions derived from the schedule
- road-following route geometry
- live fleet states: `AT_DEPOT`, `EN_ROUTE`, `UNLOADING`, `RETURNING`, and `DONE`
- delivery, active-fleet, planned-distance, and estimated-fuel KPIs

> **Coca Coqui is fictional.** No real company, customer, vehicle, operational, GPS, or telemetry data is used.

## What V0 demonstrates

FleetFlow separates the **planned operation** from the source of vehicle position.

Today:

```text
schedule + route geometry -> simulation engine -> FleetSnapshot -> map / dashboard
```

A future version can replace the simulation engine with GPS or IoT telemetry while preserving the map and dashboard contract:

```text
GPS / IoT -> API -> FleetSnapshot -> map / dashboard
```

This makes V0 useful as an architectural prototype rather than a throwaway animation.

## Architecture

```text
React + TypeScript + Vite
        |
        +-- deterministic Coca Coqui scenario
        +-- pure time-based simulation engine
        +-- Turf route interpolation / bearing
        +-- one GeoJSON truck source
        +-- MapLibre GL map
        +-- React clock / controls / KPIs / fleet panel
```

The deployed browser does **not** call a routing API. Route geometry is prepared offline and committed as a static GeoJSON asset.

## Route data

The five V0 road routes are prepared from OpenStreetMap-based routing through OSRM and stored at:

```text
public/data/coca-coqui-routes.geojson
```

To regenerate the asset during development:

```bash
npm run prepare:routes
```

The preparation script validates that every truck receives a valid road-following `LineString` and the expected route legs before writing the asset.

Map and routing context: © OpenStreetMap contributors. Third-party data remains subject to its respective terms and licenses.

## Fuel metric

Fuel is **estimated**, not measured.

V0 uses a nominal consumption rate per truck and distance travelled:

```text
estimated litres = distance km * nominal L/100 km / 100
```

The value is intended only as a simulation KPI. V0 does not model traffic, elevation, payload-dependent consumption, engine efficiency, driving behaviour, weather, or measured fuel telemetry.

## Development

Requirements: Node.js 22+.

```bash
npm install
npm run dev
```

Run verification:

```bash
npm test
npm run build
```

CI runs tests and a production build on every push and pull request.

## Scope boundaries

V0 intentionally has no backend, database, authentication, Supabase, FastAPI, live GPS, IoT, traffic feed, AI, Cesium, paid API, or production-grade vehicle-routing optimizer.

Those are later stages. The first goal is a small, deterministic, inspectable simulation that proves the visual and temporal model.

## Roadmap

Potential next increments:

1. compare baseline versus optimized route assignment
2. capacity-aware multi-vehicle routing
3. OR-Tools CVRP and time windows
4. imported schedule files / GTFS-inspired planning data
5. synthetic delays and planned-vs-actual comparison
6. real GPS / IoT telemetry through the existing `FleetSnapshot` contract

## Project docs

The design specification and implementation plan live under [`docs/superpowers/`](docs/superpowers/).

## License

Application code is released under the MIT License. External map and routing data retain their own attribution and licensing requirements.
