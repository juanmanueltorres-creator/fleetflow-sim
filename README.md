# FleetFlow Sim

**A visual last-mile operations simulator for exploring daily fleet behavior and explicit What-If alternatives on an interactive map.**

FleetFlow simulates a synthetic Córdoba delivery operation with road-following routes, capacity-constrained vehicles, dated operational runs, and auditable scenario comparisons. It is built to make one thing easy to inspect:

> **How does the modeled operation change when time, demand, or a decision alternative changes?**

**Live demo:** https://juanmanueltorres-creator.github.io/fleetflow-sim/

## What you can explore

- Replay an operational day on the map.
- Follow vehicle state, route progress, scheduled stops, and remaining packages.
- Move across immutable dated runs instead of mutating one shared scenario.
- Compare the Base operation against explicit alternatives such as **Early Start** and **Balanced Load**.
- Inspect Base-relative differences in timing, distance, estimated fuel, utilization, and package-load spread.
- Trace the scenario back to its run, route artifact, model version, and source assumptions.

## Current Córdoba model

The active V0.6 timeline uses:

- **8 synthetic delivery vehicles**;
- **45–65 active delivery destinations per published day**;
- a versioned **240-point synthetic candidate pool**;
- deterministic daily parcel demand;
- parcel-volume capacity constraints;
- deterministic stop assignment and ordering;
- one immutable road-following GeoJSON route artifact per Base run.

The current What-If experiment separates **time** from **decision**:

```text
TIME      -> selects one immutable Base OperationalRun
DECISION  -> selects Base / Early Start / Balanced Load
```

### Early Start

Shifts the operation schedule by **-60 minutes** while keeping demand, assignments, route geometry, vehicle identities, and modeled duration unchanged.

It means **finishing 60 minutes earlier under the same modeled operation**, not driving 60 minutes faster.

### Balanced Load

Reassigns complete delivery stops across the same eight vehicles using a deterministic package-balancing strategy subject to parcel-volume capacity. It does not split cargo, invent demand, or claim mathematical optimality.

## How it works

```text
public calibration data
        +
synthetic Córdoba geography
        ↓
immutable OperationalRun + bound route artifact
        ↓
validated OperationalBundle
        ↓
pure simulation engine
        ↓
FleetSnapshot
        ↓
map + operational HUD

Base OperationalRun
        ↓
explicit What-If action
        ↓
derived immutable alternative
        ↓
same simulation engine
        ↓
Base-relative outcome comparison
```

The browser loads published run and route artifacts from `public/data`. Route preparation happens offline; the deployed application does **not** call OSRM while you use it.

## Evidence boundary

FleetFlow deliberately distinguishes model output from real operations.

```text
simulation != operation
scenario outcome != guaranteed prediction
prepared road route != observed vehicle track
missing context != zero context
```

Important limits:

- Córdoba delivery locations, customers, vehicle identities, assignments, and daily demand are synthetic.
- Córdoba municipal GTFS structure is used only as an **offline spatial proxy** for constructing the candidate universe; it is not parcel-demand evidence.
- Public last-mile data is used for calibration of aggregate behavior, not as a claim that the simulated operation belongs to Amazon or another real operator.
- OSRM is used only to prepare road-following geometry offline.
- There is no live GPS, traffic, weather, customer list, dispatch feed, or production optimizer.
- What-If results expose modeled trade-offs; FleetFlow does not produce a global score, winner, or operational recommendation.

## Stack

- **Frontend:** React + TypeScript + Vite
- **Map:** MapLibre GL + OpenFreeMap
- **Spatial operations:** Turf
- **Route preparation:** OSRM, offline only
- **Testing:** Vitest + deterministic artifact/contract checks
- **Deploy:** GitHub Pages

## Architecture

FleetFlow keeps simulation state, published artifacts, and decision alternatives separate.

```text
Scenario Registry
│
├── Córdoba calibrated
│   ├── OperationalRun Catalog
│   │   └── OperationalBundle
│   │       ├── run JSON
│   │       └── bound route GeoJSON
│   └── What-If Comparison Catalog
│       ├── Base
│       ├── Early Start
│       └── Balanced Load
│
└── Coca Coqui · Legacy V0

OperationalBundle / alternative
        ↓
pure time-based simulation engine
        ↓
FleetSnapshot / ScenarioOutcome
        ↓
MapLibre + operational UI
```

The simulation engine is reused by Base and What-If runs. Decision alternatives do not live inside the operational TIME manifest.

## Run locally

Requirements: Node.js 20+.

```bash
npm install
npm test -- --run
npm run dev
```

Production build:

```bash
npm run build
```

## Reproducibility

Published operational artifacts are deterministic and append-only. Existing run, route, and manifest files are not silently overwritten by the generation pipeline.

The active Córdoba timeline is referenced by:

```text
public/data/operational-runs/manifest-v0-6.json
```

The What-If catalog is separate:

```text
public/data/operational-runs/what-if-comparisons.json
```

Detailed generation commands, seeds, compatibility notes, design specs, and implementation history live under [`docs/superpowers`](docs/superpowers) and in the repository history rather than in the front-page README.

## Data and licensing

Repository-authored software is released under the [MIT License](LICENSE).

External datasets, map sources, routing services, and derived calibration artifacts retain their own terms. See [`DATA_LICENSES.md`](DATA_LICENSES.md) for source and reuse boundaries.

## Project status

FleetFlow is an open-source simulation and decision-support experiment, not a production fleet-management system. The current focus is on transparent operational modeling, deterministic replay, provenance, and explicit comparison of alternatives without overstating what synthetic data can prove.
