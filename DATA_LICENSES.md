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

## OpenStreetMap

**Official copyright/license page:** https://www.openstreetmap.org/copyright

OpenStreetMap map data is licensed under the **Open Data Commons Open Database License (ODbL)**. Uses of OSM data require credit to OpenStreetMap and its contributors and must make the ODbL status clear.

FleetFlow uses OSM-based road context for its prepared static route geometries. Attribution is therefore retained for map/route data:

```text
© OpenStreetMap contributors
```

The checked-in route assets are:

```text
public/data/coca-coqui-routes.geojson
public/data/cordoba-calibrated-routes.geojson
```

They are generated during development using an OSRM routing service and are not evidence of measured or observed vehicle tracks.

## OpenFreeMap

**Project:** https://openfreemap.org/

**Terms:** https://openfreemap.org/tos/

FleetFlow uses the OpenFreeMap public basemap style through MapLibre. OpenFreeMap states that attribution is required and that MapLibre automatically displays the relevant attribution for its styles. OpenFreeMap's map data comes from OpenStreetMap.

The public service is external infrastructure and is provided under OpenFreeMap's current terms; FleetFlow does not bundle or redistribute the OpenFreeMap tile dataset.

## OSRM

FleetFlow calls OSRM only during **offline route preparation**. The deployed browser does not make runtime OSRM requests.

OSRM computes routes over OSM-derived road data. The resulting static route assets remain subject to the applicable OpenStreetMap data attribution/licensing requirements described above.

## Application dependencies

JavaScript dependencies such as React, MapLibre GL JS, Turf, Vite, Vitest, and their transitive dependencies retain their respective upstream licenses. Their presence in the project does not change the MIT license applied to FleetFlow's own application source code.

## Practical boundary

In short:

```text
FleetFlow source code                -> MIT
Amazon source calibration input      -> CC BY-NC 4.0
Amazon-derived aggregate profile     -> respect source terms / attribution
OpenStreetMap map + road data         -> ODbL + attribution
OpenFreeMap public basemap service    -> OpenFreeMap terms + required attribution
Synthetic Córdoba scenario content    -> generated FleetFlow scenario, with provenance disclosed
```

If this project is reused commercially, verify the external-data terms independently rather than assuming FleetFlow's MIT code license covers the Amazon-derived calibration artifacts.
