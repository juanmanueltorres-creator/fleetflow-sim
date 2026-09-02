# FleetFlow V0.7 — Operational Cartography Visual System

## Status

Approved design direction after visual/product review on 2026-08-30. This is the canonical design proposal for FleetFlow V0.7. Final user review of this written spec is required before implementation planning begins.

## Purpose

FleetFlow V0.7 does not add a new simulation model. It changes how the existing V0.6 + What-If V0 system is perceived and understood.

> Make FleetFlow feel like an operational instrument for understanding a logistics system and comparing explicit decisions, not like a generic dark dashboard or a technical demo.

The map remains the main working surface. Operational state, decision alternatives, model provenance, deltas, and limitations must be visible around it with strong visual hierarchy and without forcing the user to discover the product through hidden menus.

## Baseline

V0.7 starts from `main` after merged PR #12:

```text
merge commit: 1887c3215b3786f5e2a6339e87fe28e01e5fab88
feature: FleetFlow What-If Comparison V0
```

The baseline already contains:

- immutable Córdoba Daily Spatial Demand Base runs,
- eight fixed vehicles,
- 45–65 active synthetic destinations per day,
- per-run road-following route artifacts,
- `OperationalBundle`,
- TIME selection through the operational timeline,
- DECISION selection through Base / Early Start / Balanced Load,
- deterministic WHAT_IF artifacts,
- scenario outcomes and Base-relative deltas,
- explicit provenance and epistemic disclosure,
- one selected map/runtime at a time.

V0.7 preserves those contracts.

## Non-goals

V0.7 must not introduce:

- a new simulation engine,
- new What-If actions,
- live traffic, weather, GPS or IoT,
- a backend or database,
- AI/ML/RL,
- a winner, recommendation, risk score, or opaque optimization score,
- a new route-generation model,
- a new operational manifest model,
- a second comparison contract,
- a generic digital-twin framework,
- Web3/NFT functionality,
- decorative animation dependencies without a demonstrated interaction need.

NFT/Web3 projects are visual and interaction references only.

## External visual manifesto

The cross-project visual source of truth lives in the private GeoPlatform knowledge vault:

```text
08 - Ideas/Manifiesto visual - Operational Cartography y motion system.md
```

V0.7 translates that manifesto into FleetFlow-specific rules.

## Visual north star — Operational Cartography

The selected direction is:

- map-first,
- dark editorial base,
- technical instrumentation,
- high information density with clear hierarchy,
- thin structural borders,
- compact telemetry,
- restrained honeycomb/geometric language,
- serif identity + monospace operational data,
- bronze/gold identity,
- cyan for model/active technical signals,
- crimson only for restrictions/errors,
- no generic SaaS-card aesthetic,
- no gratuitous neon or gaming-HUD treatment.

The product should look designed around a spatial operating model rather than assembled from independent cards.

## Identity to preserve

FleetFlow already uses the Decision Technologies family palette:

```text
ink           #070706
panel         #0d0b08
panel raised  #11100d
border        #2f261c
border strong #5f4226
gold          #d2b173
gold deep     #8b6238
bone          #efe4d0
bone bright   #fff3dc
muted         #8f8171
cyan          #72c7e8
crimson       #8f2d2d
```

Typography remains conceptually:

```text
Editorial / identity     Palatino / Book Antiqua / Georgia family
Operational / metadata  monospace family
```

V0.7 may refine sizing, spacing and weight but does not replace the identity with another design system.

## Product presentation

The repository and technical product remain **FleetFlow Sim**.

The Córdoba experience presents:

```text
FleetFlow Sim
Córdoba · Last-Mile Twin
```

`Córdoba · Last-Mile Twin` is a bounded presentation descriptor. It must not imply live telemetry or a complete digital replica of Córdoba.

## First-entry opening card

A new visitor should understand the system before interacting with it. The opening card is one compact overlay, not a multi-step onboarding flow.

### Required semantics

It must explain in simple direct Spanish that:

1. this is a simulated delivery operation in Córdoba,
2. the user can change the operating day and compare explicit decisions,
3. the map shows the operation,
4. the metrics show what changed,
5. outputs are model results rather than a real observed fleet.

Canonical content direction:

```text
¿Qué pasa si cambiás la operación?

Acá estás viendo una jornada de reparto simulada en Córdoba.
Podés cambiar el día, adelantar la salida o repartir la carga de otra manera y comparar qué cambia en horarios, distancia, combustible y uso de los vehículos.

Los recorridos y resultados son modelos reproducibles, no una operación real.

[ Ver operación → ]

8 vehículos · Córdoba · escenarios reproducibles · supuestos visibles
```

Exact wording may be polished during implementation while preserving these semantics.

### Behavior

- Appears after the first valid Córdoba Base bundle is available.
- The valid map remains visibly present behind a controlled darkening/vignette.
- One primary action dismisses it.
- Escape and an explicit close control also dismiss it.
- Dismissal persists locally under the versioned key `fleetflow:intro:v0.7:dismissed`.
- A persistent compact help/info affordance can reopen it.
- No backend persistence.
- Legacy/static scenarios do not independently trigger this Córdoba product intro.

## Information architecture

The interface exposes five concepts explicitly:

```text
TIME      which operating day is selected
OPERATION what the selected plan contains and is doing
DECISION  which Base/What-If alternative is selected
OUTCOME   what the model produces and how it differs from Base
EVIDENCE  source/provenance/context semantics and limitations
```

The user should not need to infer these concepts from placement alone.

## Map-first shell

The map remains full-viewport under one connected interface frame.

Desktop structure:

```text
┌──────────────────────────────────────────────────────────────────────┐
│ FLEETFLOW / CÓRDOBA       TIME / CLOCK / PLAYBACK       MODEL STATE │
├───────────────────────────────────────────────────┬──────────────────┤
│                                                   │ OPERATION        │
│                                                   │ KPIs             │
│                      MAP                          │ fleet            │
│                                                   │ context/source   │
│                                                   │ provenance       │
├───────────────────────────────────────────────────┴──────────────────┤
│ DECISION · BASE / EARLY / BALANCED · microcharts · deltas           │
└──────────────────────────────────────────────────────────────────────┘
```

Panels should read as attached parts of one instrument, not floating independent cards.

### Desktop constraints

At 1366×768 and 1440×900:

- the map remains the largest single surface,
- the right operational rail stays compact,
- the bottom decision region is shallow by default,
- critical labels and values are not clipped,
- no primary decision information requires a modal after the intro is dismissed.

The current What-If dock behavior allowing roughly 47vh is too large as the normal V0.7 state.

## Top rail — TIME

The top rail owns TIME and playback and should expose:

- FleetFlow identity,
- `Córdoba · Last-Mile Twin`,
- operational date selector,
- simulation clock,
- playback state/speed,
- selected run mode (`SIMULATED`, `FORECAST`, `WHAT_IF`) where relevant.

The product title stays editorial; operational state is compact monospace.

## Right rail — OPERATION + EVIDENCE

The rail answers:

> What is true in the currently selected plan, and what is the status of the inputs behind it?

Priority:

1. compact KPIs,
2. active fleet state,
3. context/provenance state,
4. short explanatory copy.

Long prose must not push live operational information below the fold at common desktop sizes.

The existing `OperationalExplainer` semantics remain, but its footprint may be compressed or incorporated into a context/provenance summary.

## DECISION is always discoverable

The current `Compare scenarios` launcher hides the product's key decision capability behind a button. V0.7 removes that launcher as the primary discovery mechanism.

When the selected Base has a comparison definition:

- a compact DECISION region appears immediately,
- Base / Early Start / Balanced Load are visibly named,
- alternatives begin loading automatically only after the Base map/operation is usable,
- Base rendering never waits for alternative loading,
- comparison validation remains atomic,
- loading/failure state stays inside DECISION,
- Base remains fully usable if comparison loading fails.

V0.7 does not add outcome metrics to `what-if-comparisons.json`; outcomes continue to be derived through the current runtime/domain functions.

### Required loading sequence

```text
load valid Base bundle
        ↓
render map + operation
        ↓
discover comparison definition
        ↓
show DECISION · loading
        ↓
automatically load + validate both alternatives
        ↓
commit ScenarioComparisonSet atomically
        ↓
render decision selector + outcome graphics
```

Failure renders concise local state such as:

```text
DECISION
Comparison unavailable · Base remains active
```

No partial comparison is shown.

## Decision selector

When comparison is valid:

```text
[ BASE ] [ EARLY START ] [ BALANCED LOAD ]
```

Selection still switches one validated bundle into the existing single map/simulation engine. No three-map view is introduced.

Gold identifies current selection. Cyan identifies `WHAT_IF · MODEL OUTPUT`; cyan must not imply a recommended result.

## OUTCOME visualization

The current comparison table is semantically correct but too spreadsheet-like to be the primary decision surface.

V0.7 promotes compact comparative graphics while retaining an audit-friendly detailed view.

### Primary outcome set

Prioritize:

- completion clock,
- operation span,
- planned distance,
- estimated fuel when available,
- mean/max utilization when available,
- package-load spread.

Packages, deliveries, fleet size and frozen inputs remain visible as invariant/context information rather than receiving equal visual weight.

### Microchart grammar

Use deterministic CSS/inline SVG, not a charting dependency.

Allowed forms:

- short horizontal comparison bars,
- three-scenario columns,
- baseline markers,
- delta labels,
- thin utilization/load bars,
- tiny start/finish timeline marks.

Conceptual treatment:

```text
FIN
BASE      15:03  ━━━━━━━━━━
EARLY     14:03  ━━━━━━━━      Δ -60 min
BALANCED  14:58  ━━━━━━━━━     Δ -5 min

DISTANCE
BASE      94 km  ━━━━━━━━━
EARLY     94 km  ━━━━━━━━━     Δ 0
BALANCED 101 km  ━━━━━━━━━━    Δ +7 km

LOAD SPREAD
BASE       18    ━━━━━━━━━
EARLY      18    ━━━━━━━━━     Δ 0
BALANCED    5    ━━           Δ -13
```

Bar length conveys magnitude only. Color does not encode winner/loser semantics.

### No hidden recommendation

Never introduce:

- green = best,
- red = worst,
- medals,
- winner badges,
- `recommended`,
- automatic ranking.

A scenario may improve one modeled outcome while worsening another.

## Detailed comparison / audit

The full numerical comparison and machine-readable provenance remain accessible in a compact detail region adjacent to or below the summary.

The existing table can remain as an audit view, but is no longer the first object in the decision experience.

Required WHAT_IF audit information remains:

- Base run ID,
- action-set ID/version,
- action description,
- derivation model,
- Base context state,
- frozen-input semantics,
- model-output disclaimer.

## Honeycomb language

The honeycomb/panal reference is a restrained structural motif.

Use it for:

- low-opacity DECISION/model backgrounds,
- separators/edge ornament,
- a small Base → alternatives systems motif,
- intro/loading states.

Rules:

- never cover the central map with a high-contrast honeycomb,
- keep opacity low,
- do not turn every KPI into a hexagon,
- the motif communicates system/model structure, not crypto branding,
- prefer CSS gradients or lightweight inline SVG.

## Globe / territory motif

A secondary line-art globe/territory symbol may appear in:

- opening card,
- provenance/context region,
- identity mark.

It stays subordinate to the real map. No second WebGL globe is added.

## Borders and surfaces

- thin 1px borders,
- dark translucent surfaces,
- minimal radius,
- backdrop blur only where map readability needs it,
- no heavy shadow around every region,
- stronger border/metallic treatment communicates hierarchy before larger card size.

## Motion budget

V0.7 is not an animation showcase.

Initial implementation preference:

1. CSS transitions,
2. browser-native behavior,
3. inline SVG where justified.

Anime.js, Motion, AutoAnimate or another animation dependency is not added in the first V0.7 implementation unless an approved interaction cannot meet its requirement with existing primitives.

Motion may communicate:

- intro dismissal,
- DECISION loading → available,
- Base → alternative selection,
- metric delta changes,
- compact disclosure expansion,
- loading → validated state.

Map/vehicle movement remains owned by the existing simulation/map logic.

## Upstream references

Study as interaction references:

- Radix/shadcn: collapsible, tooltip, scroll-area semantics,
- `react-resizable-panels`: possible future user-controlled dock,
- FormKit AutoAnimate: possible future low-cost reflow animation,
- Anime.js v4: future SVG/motion-path work,
- `motion/mini`: future minimal DOM/SVG animation.

Study visually only:

- kepler.gl: map/tool separation, filters, progressive disclosure, dense geo UI,
- deck.gl / vis.gl: layer/time visualization and moving spatial-data patterns.

V0.7 embeds neither kepler.gl nor deck.gl.

## Epistemic visual semantics

FleetFlow must visually distinguish:

```text
BASE operational model
WHAT_IF model output
source/provenance
context available/unavailable/omitted
observed data (only if it actually exists in a future version)
```

Current FleetFlow must not imply observed live Córdoba operations.

Compact labels may include:

```text
SYNTHETIC DEMAND
GTFS spatial proxy
OSM-derived route geometry
WHAT_IF · deterministic model output
BASE CONTEXT · unavailable
```

These semantics belong in the visible instrument, not a hidden footer.

## Responsive behavior

### Desktop >= 1180px

- connected frame,
- top TIME/playback rail,
- right OPERATION/EVIDENCE rail,
- shallow bottom DECISION/OUTCOME rail,
- map remains dominant.

### Tablet 700–1179px

- top rail may wrap to two rows,
- right rail stays bounded,
- DECISION becomes a shallower horizontally scrollable dock,
- audit content may collapse under one `Detalles del modelo` disclosure,
- primary microcharts remain visible.

### Mobile < 700px

Priority becomes:

1. map,
2. selected date/state,
3. selected decision,
4. 3–4 core KPIs/deltas,
5. fleet/audit content through vertical scroll/disclosures.

The intro must fit and remain usable at approximately 390×844.

## Accessibility

V0.7 preserves or improves:

- keyboard access for intro controls,
- visible focus states,
- semantic buttons for decision selection,
- `aria-pressed` for selected decisions,
- textual equivalents for visual bars,
- table/detail values independent of chart shape,
- sufficient contrast for muted labels,
- `prefers-reduced-motion` behavior.

No meaning is encoded only by color or animation.

## Component direction

Likely units:

```text
IntroCard
ProductIdentity
DecisionDock
DecisionSummary
OutcomeMetricRow / OutcomeMicroChart
ModelStateBadge
ContextProvenanceSummary
ScenarioComparisonDetails
```

Reuse existing responsibilities where valid:

```text
OperationalDateRail
SimulationClock
SimulationControls
KpiPanel
FleetPanel
ScenarioDecisionRail
ScenarioComparisonPanel
ScenarioProvenance
```

`ScenarioComparisonPanel` may be split so summary and audit detail are independently understandable/testable. Outcome derivation must remain in domain logic rather than being duplicated in presentation components.

## Data-flow constraint

Preserve:

```text
OperationalBundle
    ↓
existing simulation engine
    ↓
FleetSnapshot / FleetMetrics
```

and:

```text
ScenarioComparisonSet
    ↓
deriveScenarioOutcome
    ↓
deriveScenarioDelta
    ↓
visual comparison components
```

The UI does not invent a parallel metric model.

## Failure semantics

### Base/run failure

May block the operational experience as today.

### Comparison failure

Never removes a valid Base map. It stays local to DECISION.

### Missing optional metric

Render `—` / unavailable. Never render a missing value as a zero-length bar that implies zero.

## Performance constraints

- no chart library for first microcharts,
- no new mapping stack,
- no animation framework by default,
- no alternative loading that blocks Base,
- automatic alternative loading starts only after Base is usable,
- honeycomb/globe decoration remains CSS/SVG-scale rather than image/WebGL heavy.

## Testing strategy

Implementation follows TDD for behavior changes.

### Intro

- intro renders under the correct first-entry condition,
- primary/close/Escape dismissal works,
- `fleetflow:intro:v0.7:dismissed` persists dismissal,
- reopen affordance works,
- Legacy does not independently retrigger the Córdoba intro.

### DECISION discoverability/loading

- comparison-capable Base shows DECISION without `Compare scenarios`,
- Base remains rendered while alternatives auto-load,
- validated comparison becomes selectable atomically,
- failure leaves Base usable,
- date changes reset comparison selection correctly.

### Outcome visualization

- summary consumes existing `ScenarioOutcome` / `ScenarioDelta`,
- unavailable metrics remain unavailable rather than zero,
- Early Start is never labelled `faster`,
- no winner/recommendation wording is introduced,
- audit/provenance remains present.

### Accessibility/structure

- structural regions and labels render,
- decision buttons retain semantic pressed state,
- visual charts expose textual values,
- reduced-motion path exists.

### Regression

- full existing suite passes,
- production build passes,
- V0.6 and What-If published artifacts remain unchanged,
- simulation engine and clock semantics remain unchanged.

## Visual acceptance review

Review at least:

```text
1440 × 900
1366 × 768
1024 × 768
390 × 844
```

Require:

- no clipped important text,
- no overlapping rails,
- no panel swallowing the map,
- desktop intro readable without scrolling,
- mobile intro usable,
- primary decision deltas visible on desktop without another modal,
- map remains visually dominant after onboarding,
- honeycomb/globe remains subordinate to data.

## Implementation sequence boundary

Likely incremental sequence:

```text
1. Intro + tokens / shell hierarchy
2. Always-visible DECISION + automatic background comparison loading
3. Outcome microcharts + compact deltas
4. Audit/provenance re-layout
5. Honeycomb/globe ornament + restrained motion
6. Responsive/accessibility polish
```

This is a design sequence only. The implementation plan is written after final approval of this spec.

## Acceptance criteria

V0.7 is successful when:

1. A first-time visitor can explain FleetFlow after one short intro card.
2. After dismissal, the map is immediately the dominant surface.
3. TIME, OPERATION, DECISION, OUTCOME and EVIDENCE are visually distinct.
4. A comparison-capable Base exposes What-If without a hidden comparison launcher.
5. Base remains usable while alternatives auto-load or if comparison fails.
6. Base / Early Start / Balanced Load trade-offs are understandable from compact graphics and deltas before reading a large table.
7. Full audit/provenance remains accessible.
8. No visual treatment implies a winner, prediction certainty, live telemetry or observed Córdoba operation.
9. Honeycomb/globe/NFT-inspired language adds identity without competing with the map.
10. Existing V0.6 + What-If domain contracts and the simulation engine remain intact.
11. The defined desktop/tablet/mobile review sizes are usable without clipping/overlap.
12. Full tests and production build pass after implementation.
