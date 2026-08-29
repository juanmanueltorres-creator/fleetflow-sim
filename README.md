# FleetFlow Sim

Open-source visual fleet routing simulator with animated vehicles, scheduled stops, and route planning on interactive maps.

## V0 — Coca Coqui

The first scenario is **Coca Coqui — Córdoba Distribution Run**, a fictional logistics simulation used to build and validate the core animation and scheduling engine.

V0 starts intentionally small: five trucks, fifteen synthetic delivery stops, a deterministic schedule, and a static browser application.

> Coca Coqui is fictional. No real company, customer, operational, or telemetry data is used.

## Development

```bash
npm install
npm run dev
npm test
npm run build
```

CI validates the test suite and production build on every push.

Implementation design and plan live under `docs/superpowers/`.
