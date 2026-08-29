# FleetFlow V0.4 — Calibrated Scenarios Design

## Status
Approved design, awaiting final user review before implementation planning.

## Goal

FleetFlow V0.4 turns the current Coca Coqui demo into a reusable scenario-driven last-mile simulation system.

The product will have two selectable scenarios:

1. **Córdoba Last-Mile · Calibrado** — default and primary representation of FleetFlow.
2. **Coca Coqui · Legacy V0** — preserved as the original synthetic baseline for comparison.

The calibrated scenario will use synthetic Córdoba geography and road routes, but its operational behavior will be derived from public last-mile delivery data rather than arbitrary hand-authored timing and cargo values.

## Product principles

- The calibrated scenario is the default system view.
- The Legacy V0 remains available for comparison and historical continuity.
- The UI must never imply that Amazon, Mercado Libre, Cainiao or another real company operated the displayed Córdoba routes.
- Public operational data calibrates behavior; it does not define the displayed geography.
- Source, method, license and limitations are visible through progressive disclosure.
- The browser must not call a routing service during simulation runtime.
- The raw Amazon dataset must not be committed to this repository.
- FleetFlow software remains MIT-licensed. Third-party data provenance and licenses remain separate.

## Source dataset

Initial calibration source:

**Amazon Last Mile Routing Research Challenge Dataset**

Primary references:

- Amazon Science publication: https://www.amazon.science/publications/2021-amazon-last-mile-routing-research-challenge-data-set
- Challenge documentation: https://routingchallenge.mit.edu/
- Registry / license context: https://registry.opendata.aws/amazon-last-mile-challenges/

The dataset contains thousands of historical delivery routes and includes route-, stop- and package-level information such as vehicle capacity, observed stop sequence, package dimensions, service time, time windows and travel times between stops.

For V0.4, calibration should prefer the available **high-quality route subset** as the baseline for healthy operational behavior. Incidents, delays and route recovery are intentionally deferred to a later version.

The source dataset is distributed under terms separate from FleetFlow's MIT license, including CC BY-NC 4.0 materials. The implementation must preserve that boundary and must not copy the raw source dataset into the FleetFlow repository.

## Calibration pipeline

The data flow is:

```text
Amazon raw dataset
        ↓
offline calibration script
        ↓
calibration-profile.json
        ↓
deterministic Córdoba scenario generator
        ↓
FleetScenario
        ↓
Simulation Engine
        ↓
Map + Clock + KPIs + Fleet + Popups
```

### Raw data boundary

The raw dataset is an external input used only during offline calibration.

It must not:

- be bundled into Vite,
- be downloaded by the browser,
- be committed to the repository,
- be required for normal `npm test`, `npm run build` or GitHub Pages execution.

### Calibration artifact

FleetFlow will version a small derived artifact implementing a contract equivalent to:

```ts
interface CalibrationProfile {
  source: {
    dataset: string
    license: string
    sample: string
    methodVersion: string
  }
  summary: {
    routesAnalyzed: number
    stopsAnalyzed: number
    packagesAnalyzed: number
  }
  distributions: {
    stopsPerRoute: number[]
    packagesPerStop: number[]
    serviceSecondsPerStop: number[]
    travelSecondsBetweenStops: number[]
    timeWindowProbability: number
    timeWindowWidthMinutes: number[]
    packageVolumeCm3: number[]
    vehicleCapacityCm3: number[]
    departureMinuteOffset: number[]
  }
}
```

The stored representation may use compact buckets, quantiles or summary distributions. It must be deterministic, small enough to review in Git, and sufficient to regenerate the calibrated scenario without the raw dataset.

## Scenario registry

The application will no longer import `cocaCoquiScenario` as the global system state.

Introduce a registry that owns all scenario-specific configuration:

```ts
type ScenarioId = 'cordoba-calibrated' | 'coca-coqui-legacy'

interface ScenarioDefinition {
  id: ScenarioId
  label: string
  badge: string
  cargoMode: CargoMode
  routeAsset: string
  scenario: FleetScenario
  provenance: ScenarioProvenance
}
```

Conceptually:

```text
Scenario Registry
       │
       ├── Córdoba Last-Mile · Calibrado   ← DEFAULT
       │       ├── FleetScenario
       │       ├── calibrated routes GeoJSON
       │       ├── calibration profile
       │       └── provenance
       │
       └── Coca Coqui · Legacy V0
               ├── FleetScenario
               ├── legacy routes GeoJSON
               └── synthetic provenance
```

The registry must make future scenarios possible without changing the simulation engine contract.

## Scenario selection behavior

The connected top rail gets a compact scenario switcher.

Primary option:

**Córdoba Last-Mile · CALIBRADO**

Secondary option:

**Coca Coqui · LEGACY V0**

The calibrated scenario is selected by default on a fresh page load.

Changing scenarios must:

1. pause the simulation,
2. reset simulation time to the selected scenario start,
3. load the selected route GeoJSON,
4. recompute snapshot and metrics from the selected scenario,
5. refresh map, KPIs, fleet rows and popups together,
6. never retain state from the previously selected scenario.

The scenario switcher is part of the connected HUD and should use the existing FleetFlow visual language rather than a browser-default gray select.

## Calibrated Córdoba scenario

### Scale

V0.4 uses:

- **exactly 8 vehicles**
- **exactly 60 stops total**
- **90–110 packages total**, with the exact package total determined deterministically by the calibration profile and seed

The scenario intentionally compresses real last-mile route scale for visual legibility. It must be described as **calibrated**, not as a literal reproduction of Amazon route scale.

### Stop distribution

Routes should have uneven stop counts so the simulation looks operational rather than artificially balanced.

A representative distribution is:

```text
Vehicle 01     6 stops
Vehicle 02     9 stops
Vehicle 03     7 stops
Vehicle 04     8 stops
Vehicle 05     6 stops
Vehicle 06    10 stops
Vehicle 07     7 stops
Vehicle 08     7 stops
----------------------
TOTAL          60 stops
```

Per-route counts may vary if the deterministic generator produces a different valid uneven allocation, but the total must equal **60** and every stop must be assigned exactly once.

### Geography

- Córdoba stop coordinates are synthetic/project-authored.
- Road-following route geometry is generated ahead of time using a free routing source, following the same checked-in-asset pattern as V0.
- No source-company coordinates are copied into Córdoba.
- No runtime routing request is allowed.

Expected assets:

```text
public/data/cordoba-calibrated-routes.geojson
public/data/coca-coqui-routes.geojson
```

## Generalized simulation engine

V0 currently encodes exactly three stops per route. V0.4 removes that assumption.

### Travel legs

The engine must generate travel legs programmatically for any non-empty route:

```text
DEPOT
  ↓
STOP 1
  ↓
STOP 2
  ↓
...
  ↓
STOP N
  ↓
DEPOT
```

The engine must preserve the existing statuses:

- `AT_DEPOT`
- `EN_ROUTE`
- `UNLOADING`
- `RETURNING`
- `DONE`

The engine must continue to support the Legacy route with three stops while also supporting calibrated routes with variable stop counts.

### Geometry contract

Replace the fixed tuple:

```ts
waypointDistancesKm: [number, number, number, number, number]
```

with:

```ts
waypointDistancesKm: number[]
```

Validation rule:

```text
waypointDistancesKm.length === route.stops.length + 2
```

The first waypoint distance must be `0`. Distances must be monotonically non-decreasing. The last waypoint corresponds to the return to depot.

`routeCollectionToIndex()` must not require exactly five features. It should accept the active scenario (or its expected geometry IDs) and fail closed if any required geometry is missing, duplicated or malformed.

## Cargo model

V0 currently treats cargo as kilograms everywhere. V0.4 introduces a scenario-aware discriminated cargo contract.

```ts
type CargoMode = 'MASS' | 'PARCELS'

type CargoDemand =
  | {
      kind: 'MASS'
      quantityKg: number
    }
  | {
      kind: 'PARCELS'
      packageCount: number
      volumeCm3: number
    }

type CargoCapacity =
  | {
      kind: 'MASS'
      capacityKg: number
    }
  | {
      kind: 'PARCELS'
      capacityVolumeCm3: number
    }

type CargoSnapshot =
  | {
      kind: 'MASS'
      remainingKg: number
      utilizationPct: number
    }
  | {
      kind: 'PARCELS'
      remainingPackages: number
      remainingVolumeCm3: number
      utilizationPct: number
    }
```

A scenario's stops and vehicles must use compatible cargo kinds. Mixed cargo kinds inside one scenario are invalid in V0.4.

### Legacy mass mode

- stop demand is measured in kg,
- truck capacity is measured in kg,
- snapshots expose remaining kg and utilization.

### Calibrated parcel mode

- stops contain package count and package volume,
- vehicles contain volumetric capacity,
- snapshots expose remaining package count, remaining volume and utilization percentage.

The calibrated UI should prefer plain operational language such as:

```text
28 paquetes
5 / 8 paradas hechas
37% de capacidad ocupada
Sigue · Entrega 037
```

It must not display fake kilograms for last-mile parcels.

### Internal naming scope

The current code uses the domain name `Store`. Renaming that entire internal type is not required for V0.4 because it would add migration scope without changing behavior. The calibrated UI, accessibility copy and provenance should use **parada**, **entrega** or another scenario-appropriate public label instead of calling every last-mile destination a store.

A future domain cleanup may rename the internal entity after the scenario architecture is stable.

## Time windows

The calibrated scenario may assign delivery windows to a subset of stops based on the calibration profile.

For V0.4, windows are informational planning constraints. The baseline scenario itself remains healthy and deterministic.

V0.4 does **not** introduce:

- traffic incidents,
- failed delivery attempts,
- driver absence,
- breakdowns,
- route reassignment,
- dynamic ETA recovery.

Those belong to a later incident/replanning milestone.

## Provenance contract

Every scenario definition has provenance metadata sufficient to explain:

- whether the scenario is synthetic or calibrated,
- source dataset name when applicable,
- source URL,
- source license,
- calibration method/version,
- what is derived from the source,
- what remains synthetic,
- limitations.

### Calibrated visible copy

First-level copy should remain compact:

> **ESCENARIO CALIBRADO**  
> Comportamiento derivado de datos operacionales públicos. Ubicaciones y recorridos adaptados a Córdoba.

A secondary **Fuente y método** disclosure may show the detailed provenance.

### Legacy visible copy

> **ESCENARIO SINTÉTICO · LEGACY V0**  
> Cinco camiones y quince entregas creadas para la primera versión de FleetFlow.

The UI must never label the calibrated Córdoba routes as real Amazon or Mercado Libre deliveries.

## UI behavior

The existing connected frame remains the primary visual shell.

The scenario switcher should sit in the top rail near the product identity / simulation controls without reintroducing floating cards.

The map remains the main working surface.

Switching scenarios updates:

- map routes,
- stops / delivery points,
- vehicles,
- clock duration,
- KPIs,
- fleet panel,
- point popups,
- provenance label.

No stale marker or popup information from the previous scenario may remain visible after a switch.

## Metrics

Existing general metrics remain where meaningful:

- completed deliveries,
- active vehicles,
- planned distance,
- estimated fuel.

For the calibrated scenario, cargo-related presentation changes to parcel semantics. The implementation should expose enough data for later metrics such as:

- packages remaining,
- utilization,
- stops with time windows,
- on-time risk.

V0.4 does not need to implement incident-risk metrics yet.

## Determinism

The calibrated Córdoba scenario must be reproducible.

Given:

- the same calibration profile,
- the same generator version,
- the same seed,

FleetFlow must produce the same stop coordinates, package assignments, service durations, time windows and route plans.

The generated scenario may be checked in as TypeScript/JSON output for production stability, while the generator and seed remain documented and tested.

## Validation rules

At minimum:

- every scenario has a depot,
- every vehicle has exactly one route,
- every stop belongs to exactly one route,
- every route has at least one stop,
- all referenced stops and vehicles exist,
- route schedule is chronological,
- planned arrival is before planned departure,
- route return is after the final stop departure,
- stop cargo kind matches vehicle capacity kind,
- assigned cargo never exceeds vehicle capacity,
- geometry waypoint count equals stop count + 2,
- waypoint distances are monotonic,
- every geometry ID is unique and resolvable,
- calibrated scenario has exactly 8 vehicles,
- calibrated scenario has exactly 60 stops,
- calibrated scenario has 90–110 packages,
- legacy scenario remains 5 vehicles / 15 stops.

## Testing requirements

### Domain

- Legacy validation continues to pass.
- Calibrated validation passes with exactly 8 vehicles and 60 stops.
- Calibrated package count is between 90 and 110.
- Every calibrated stop is assigned exactly once.
- No route exceeds its cargo capacity.
- Same seed creates the same calibrated scenario.

### Engine

- routes with 1, 3, 6, 8 and 10 stops can progress through the same engine,
- unloading uses the correct dynamic waypoint,
- travel interpolation works for all generated legs,
- return-to-depot works after arbitrary stop counts,
- completed delivery count and remaining cargo remain correct for both cargo modes.

### Geometry

- variable waypoint arrays are accepted,
- invalid waypoint count fails closed,
- non-monotonic waypoint distances fail closed,
- all scenario geometry IDs resolve,
- no exact-five-route assumption remains.

### Scenario switching

- calibrated is the default,
- switching to Legacy pauses and resets,
- Legacy loads its own route asset,
- switching back restores calibrated data,
- KPIs, map and fleet all reflect the same active scenario,
- no stale popup survives a scenario switch.

### UI / provenance

- calibrated scenario shows parcel semantics,
- Legacy keeps kg semantics,
- calibrated public copy says parada/entrega rather than assuming store semantics,
- provenance labels distinguish calibrated from synthetic,
- no UI string claims that displayed Córdoba routes are real Amazon or Mercado Libre routes.

### CI

Before merge:

```text
npm test
npm run build
```

must pass on the feature branch and pull request.

After merge, both main CI and GitHub Pages deploy must pass on the merged SHA.

## Out of scope for V0.4

- live GPS or IoT,
- backend telemetry,
- authenticated Mercado Libre data,
- live Amazon operations,
- traffic feeds,
- driver absences,
- failed delivery attempts,
- vehicle breakdowns,
- reassignment between drivers,
- dynamic route optimization,
- OR-Tools replanning,
- customer notifications,
- real-time ETA confidence,
- raw third-party dataset hosting,
- full internal `Store` → generic location type rename.

## Follow-up direction

V0.5 should build on this architecture with operational incidents and replanning:

```text
planned route
    ↓
incident
    ↓
delivery at risk
    ↓
candidate reassignment
    ↓
new ETA / route
    ↓
operational recovery metrics
```

That layer should be informed by recurring last-mile problems observed in logistics communities: driver absence, traffic, failed deliveries, incorrect addresses, large ETA windows, proof-of-delivery disputes and manual reassignment.

## Success criteria

FleetFlow V0.4 is successful when:

1. the first thing a visitor sees is the calibrated Córdoba last-mile scenario,
2. it visibly behaves like a richer operation than the original 5-truck demo,
3. the original Coca Coqui scenario is still selectable and fully functional,
4. the engine no longer contains fixed assumptions about 3 stops or 5 routes,
5. parcel cargo is represented honestly rather than as fake kg,
6. calibration is reproducible and traceable without shipping the raw external dataset,
7. the UI clearly separates calibrated behavior from synthetic geography,
8. future scenarios can be registered without rewriting the simulation engine.
