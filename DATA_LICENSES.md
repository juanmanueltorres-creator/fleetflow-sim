# Data and third-party licensing

FleetFlow's application source code is licensed under the repository's MIT License. External data and source-derived artifacts keep their own attribution and licensing requirements; the MIT License does not relicense those materials.

## Amazon Last Mile Routing Research Challenge

**Official source:** https://registry.opendata.aws/amazon-last-mile-challenges/

**Source license:** Creative Commons Attribution-NonCommercial 4.0 International (`CC BY-NC 4.0`).

FleetFlow uses the public training data only as an **offline calibration input**. The raw Amazon files are not committed to this repository and are not shipped to the browser.

The offline calibration reads:

```text
route_data.json
package_data.json
actual_sequences.json
travel_times.json
```

It keeps only aggregate distributions from routes whose source `route_score` is `High`. The checked-in artifact is:

```text
src/scenario/calibration/amazon-last-mile-v1.json
```

That compact profile contains counts and distribution summaries rather than source route IDs, package IDs, customer locations, or raw travel matrices.

The generated Córdoba scenario then samples from those aggregate distributions using a deterministic seed. Its Córdoba delivery coordinates, assignments, vehicle identities, schedules, and road routes are synthetic/adapted FleetFlow content. They do **not** represent an Amazon operation in Córdoba.

This repository does not attempt to relicense the Amazon source data. Reuse of source-derived artifacts should respect the source dataset's `CC BY-NC 4.0` terms and attribution requirements.

The V0 What-If comparison introduces **no new parcel-demand source**. Early Start and Balanced Load both inherit the same synthetic Base destination cargo; they transform declared operational decisions rather than importing new observed package data.

## Córdoba municipal GTFS

**Official dataset:** https://gobiernoabierto.cordoba.gob.ar/data/datos-abiertos/categoria/transporte-urbano/gtfs-de-la-ciudada-de-cordoba/3319

**Municipal dataset identifiers used for candidate-pool v1:** dataset `3319`, version `6122` (`GTFS Transporte Publico 03/2023`), resource `18772`.

**Source license reported by the Córdoba Open Data API:** `CC-BY-SA-AR (CBA)`.

FleetFlow uses the static Córdoba GTFS only as an **offline spatial reference/proxy** when constructing the synthetic delivery-candidate universe. It does not treat public-transport stops, routes, passenger activity, or proximity to transit as observed parcel demand.

The raw GTFS archive and its real stop IDs/names are not required by the deployed application and are not committed merely to run FleetFlow. The checked-in derived artifact is:

```text
src/scenario/operationalRuns/candidate-pool-v1.json
```

Candidate-pool v1 contains 240 neutral synthetic locations (`Entrega 001` ... `Entrega 240`) generated deterministically from the spatial structure of the GTFS source. Candidate coordinates are offset synthetic points; they are not represented as real customers, businesses, residences, or exact transit stops. The artifact records the candidate-pool generator/version, GTFS reference URL, spatial zone, relative spatial weight, and deterministic seed.

Reuse of the GTFS-derived candidate artifact should preserve the Córdoba source attribution and applicable `CC-BY-SA-AR (CBA)` requirements. The source license applies independently from FleetFlow's MIT-licensed application code.

## OpenStreetMap

**Official copyright/license page:** https://www.openstreetmap.org/copyright

OpenStreetMap map data is licensed under the **Open Data Commons Open Database License (ODbL)**. Uses of OSM data require credit to OpenStreetMap and its contributors and must make the ODbL status clear.

FleetFlow uses OSM-based road context for its prepared static route geometries. Attribution is therefore retained for map/route data:

```text
© OpenStreetMap contributors
```

Checked-in route assets include the historical shared routes:

```text
public/data/coca-coqui-routes.geojson
public/data/cordoba-calibrated-routes.geojson
```

and the V0.6 immutable per-run route artifacts referenced by `manifest-v0-6.json`:

```text
public/data/operational-runs/generated/cordoba-*-v3.routes.geojson
```

These route files are generated during development using an OSRM routing service and are not evidence of measured or observed vehicle tracks. V0.6 route metadata binds each artifact to its synthetic `OperationalRun`; that binding does not change the underlying OSM attribution boundary.

### What-If route artifacts

The checked-in What-If V0 experiment publishes two additional run-bound route artifacts:

```text
public/data/operational-runs/generated/*-what-if-early-start-v1.routes.geojson
public/data/operational-runs/generated/*-what-if-balanced-load-v1.routes.geojson
```

**Early Start** is a schedule-only intervention. Its route geometry and route properties are an exact rebound copy of the selected Base run's OSM-derived road artifact; only the route binding metadata points to the immutable derived WHAT_IF run.

**Balanced Load** changes complete-stop assignment/order and therefore receives newly prepared road geometry through the same offline OSRM/OSM-derived routing workflow used by FleetFlow's generated route artifacts.

Both route artifacts are **simulation inputs**, not observed vehicle tracks, GPS traces, measured traffic paths, or evidence that a real operator drove those roads in the modeled sequence. The What-If comparison does not add a new road-data source or change the OSM/ODbL attribution boundary.

## OpenFreeMap

**Project:** https://openfreemap.org/

**Terms:** https://openfreemap.org/tos/

FleetFlow uses the OpenFreeMap public basemap style through MapLibre. OpenFreeMap states that attribution is required and that MapLibre automatically displays the relevant attribution for its styles. OpenFreeMap's map data comes from OpenStreetMap.

The public service is external infrastructure and is provided under OpenFreeMap's current terms; FleetFlow does not bundle or redistribute the OpenFreeMap tile dataset.

## OSRM

FleetFlow calls OSRM only during **offline route preparation**. The deployed browser does not make runtime OSRM requests.

OSRM computes routes over OSM-derived road data. The resulting static route assets remain subject to the applicable OpenStreetMap data attribution/licensing requirements described above.

For What-If V0, Early Start requires no new OSRM routing because it preserves Base geometry. Balanced Load uses OSRM offline after deterministic stop reassignment/order. The resulting checked-in geometry is frozen for the published comparison; FleetFlow does not represent OSRM output as live traffic, observed road condition, or measured travel behavior.

## Application dependencies

JavaScript dependencies such as React, MapLibre GL JS, Turf, Vite, Vitest, and their transitive dependencies retain their respective upstream licenses. Their presence in the project does not change the MIT license applied to FleetFlow's own application source code.

## Practical boundary

In short:

```text
FleetFlow source code                -> MIT
Amazon source calibration input      -> CC BY-NC 4.0
Amazon-derived aggregate profile     -> respect source terms / attribution
Córdoba municipal GTFS               -> CC-BY-SA-AR (CBA) + attribution
GTFS-derived candidate pool          -> synthetic derived artifact; preserve source terms
OpenStreetMap map + road data        -> ODbL + attribution
V0.6 per-run road GeoJSON            -> generated from OSM routing; retain OSM attribution
What-If Early route GeoJSON          -> rebound Base OSM-derived geometry; retain OSM attribution
What-If Balanced route GeoJSON       -> newly prepared OSM/OSRM-derived geometry; retain OSM attribution
What-If parcel demand                -> same synthetic Base demand; no new source introduced
OpenFreeMap public basemap service   -> OpenFreeMap terms + required attribution
Synthetic Córdoba scenario content   -> generated FleetFlow scenario, with provenance disclosed
```

If this project is reused commercially, verify the external-data terms independently rather than assuming FleetFlow's MIT code license covers the Amazon-, GTFS-, or OSM-derived artifacts.
