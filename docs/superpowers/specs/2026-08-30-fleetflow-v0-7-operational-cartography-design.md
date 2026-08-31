# FleetFlow V0.7 — Operational Cartography Visual System

## Status

Approved design direction after visual/product review on 2026-08-30. This file is the canonical design proposal for FleetFlow V0.7. Final user review of this written spec is required before implementation planning begins.

## Purpose

FleetFlow V0.7 does not add a new simulation model. It changes how the existing V0.6 + What-If V0 system is perceived and understood.

The product goal is:

> Make FleetFlow feel like an operational instrument for understanding a logistics system and comparing explicit decisions, not like a generic dark dashboard or a technical demo.

The map remains the main working surface. Operational state, decision alternatives, model provenance, deltas, and limitations must be visible around it with strong visual hierarchy and without forcing the user to discover the product through hidden menus.

## Baseline

V0.7 starts from `main` after merged PR #12:

```text
merge commit: 1887c3215b3786f5e2a6339e87fe28e01e5fab88
feature: FleetFlow What-If Comparison V0
```

The baseline already contains:

- V0.6 immutable Córdoba Daily Spatial Demand runs,
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
- decorative animation libraries without a demonstrated interaction need.

The NFT/Web3 references are visual and interaction references only.

## External visual manifesto

The cross-project visual source of truth lives in the private GeoPlatform knowledge vault:

```text
08 - Ideas/Manifiesto visual - Operational Cartography y motion system.md
```

V0.7 translates that manifesto into FleetFlow-specific product rules.

## Visual north star

### Operational Cartography

The selected direction is **Operational Cartography**:

- map-first,
- dark editorial base,
- technical instrumentation,
- high information density with clear hierarchy,
- thin structural borders,
- compact telemetry,
- subtle geometric/honeycomb language,
- serif identity + monospace operational data,
- bronze/gold identity,
- cyan for model/active technical signals,
- crimson only for restrictions/errors,
- no generic SaaS-card aesthetic,
- no gratuitous neon or gaming HUD treatment.

The product should look designed around a spatial operating model rather than assembled from independent cards.

## Existing identity to preserve

FleetFlow already uses the same family identity as the broader Decision Technologies visual system:

```text
ink          #070706
panel        #0d0b08
panel raised #11100d
border       #2f261c
border strong#5f4226
gold         #d2b173
gold deep    #8b6238
bone         #efe4d0
bone bright  #fff3dc
muted        #8f8171
cyan         #72c7e8
crimson      #8f2d2d
```

Typography remains conceptually:

```text
Editorial / identity     Palatino / Book Antiqua / Georgia family
Operational / metadata  monospace family
```

V0.7 may refine sizing, spacing and weight but does not replace the identity with a new design system.

## Product presentation

The repository and technical product remain **FleetFlow Sim**.

The Córdoba experience may present the product using the descriptive product line:

```text
FleetFlow Sim
Córdoba · Last-Mile Twin
```

`Last-Mile Twin` is a presentation descriptor for the bounded Córdoba operational simulation. It must not imply live telemetry or a complete digital replica of Córdoba.

## First-entry opening card

### Goal

A new visitor should understand the product before interacting with controls.

The opening card is one compact overlay, not a multi-step onboarding flow.

### Required message

The copy should communicate, in simple direct Spanish:

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

- Appears over the map after the first valid Base bundle is available.
- Does not replace the map with a blank onboarding page.
- Background remains visibly spatial, with a controlled darkening/vignette.
- One clear primary action dismisses it.
- Escape and an explicit close control must also work.
- Dismissal may persist locally for the browser using a versioned local-storage key.
- A small persistent help/info affordance must allow reopening it.
- No backend persistence.

## Primary information architecture

V0.7 organizes the application into five immediately understandable concepts:

```text
TIME      which operating day is selected
OPERATION what the selected plan contains and is doing
DECISION  which Base/What-If alternative is selected
OUTCOME   what the model produces and how it differs from Base
EVIDENCE  source/provenance/context semantics and limitations
```

These concepts should be visible in the interface vocabulary. The user should not need to infer them from component placement.

## Map-first shell

The map remains full-viewport under the interface frame.

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
│ DECISION · BASE / EARLY / BALANCED · outcome microcharts · deltas   │
└──────────────────────────────────────────────────────────────────────┘
```

The interface should read as one connected frame around the map, not several floating cards.

### Desktop constraints

At common desktop sizes such as 1366×768 and 1440×900:

- the map remains the largest single visual surface,
- the right operational rail remains compact,
- the bottom decision area must not permanently consume close to half the viewport,
- critical labels and values must not be clipped,
- no primary information requires a modal after the opening card is dismissed.

The current What-If dock maximum height of roughly 47vh is considered too large as a default V0.7 state.

## Top rail

The top rail continues to own TIME and playback.

It should show, without excessive copy:

- FleetFlow identity,
- Córdoba / selected scenario label,
- operational date selector,
- simulation clock,
- playback state/speed,
- selected run mode (`SIMULATED`, `FORECAST`, `WHAT_IF`) when relevant.

The current long product eyebrow should be reduced in visual dominance.

The title should feel editorial and branded, while operational state remains mono and compact.

## Right operational rail

The right rail should answer:

> What is true in the currently selected plan?

Priority order:

1. compact KPIs,
2. active fleet state,
3. context/provenance state,
4. explanatory copy.

Long explanatory prose should not push live operational information below the fold on typical desktop screens.

The existing `OperationalExplainer` semantics are retained but its visual footprint may be compressed or integrated into a provenance/context block.

## DECISION is always discoverable

The current `Compare scenarios` launcher hides the key product capability behind a button.

V0.7 removes that discoverability problem.

When the selected Base run has a published comparison definition:

- a compact DECISION strip is visible immediately,
- it communicates that Base / Early Start / Balanced Load exist,
- comparison loading must remain non-blocking for Base operation,
- alternative bundles may load automatically after the Base interface is usable,
- loading/failure state appears inside the DECISION strip rather than as a detached floating error card,
- Base remains fully usable if comparison loading fails.

This preserves the existing comparison catalog and runtime validation contracts. V0.7 does not store precomputed outcome metrics in the catalog.

## Decision loading behavior

Preferred sequence:

```text
load valid Base bundle
        ↓
render map + operation immediately
        ↓
discover comparison definition
        ↓
show DECISION strip as available/loading
        ↓
load + validate both alternatives in background
        ↓
commit ScenarioComparisonSet atomically
        ↓
render outcome microcharts/deltas
```

The Base experience must never wait for What-If alternatives.

If loading fails:

```text
DECISION
Comparison unavailable · Base remains active
```

No partial alternative set is displayed.

## Decision selector

When comparison is valid:

```text
[ BASE ] [ EARLY START ] [ BALANCED LOAD ]
```

Selection continues to switch one validated bundle into the existing single map/simulation engine.

No three-map view is introduced.

The selected alternative uses the existing gold identity state. `WHAT_IF · MODEL OUTPUT` uses cyan as technical/model semantics, not as a positive recommendation signal.

## Outcome visualization

The current comparison table is semantically correct but visually too spreadsheet-like to carry the main decision experience.

V0.7 promotes compact comparative graphics while retaining an audit-friendly detailed view.

### Primary outcome set

The first visual comparison should prioritize:

- completion clock,
- operation span,
- planned distance,
- estimated fuel when available,
- mean/max utilization when available,
- package-load spread.

Packages, deliveries, fleet size and frozen inputs remain visible as invariant/context information rather than competing equally with decision deltas.

### Microchart grammar

Use small, deterministic SVG/CSS visualizations rather than a charting dependency in V0.7.

Allowed patterns:

- short horizontal comparison bars,
- compact three-scenario columns,
- baseline markers,
- delta labels,
- thin progress/load bars,
- tiny timeline marks for start/finish.

Example conceptual treatment:

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

Bar length conveys magnitude only. Color must not silently encode a winner/loser interpretation.

### No hidden recommendation

The UI must not introduce:

- green = best,
- red = worst,
- medals,
- winner badges,
- “recommended” labels,
- automatic ranking.

A scenario can improve one modeled outcome and worsen another.

## Detailed comparison / audit layer

The complete numerical comparison and machine-readable provenance remain accessible below or adjacent to the microchart summary.

The existing table can be retained in a compact audit/detail region, but it is no longer the first visual object in the decision experience.

Required audit information for WHAT_IF remains:

- Base run ID,
- action-set ID/version,
- action description,
- derivation model,
- Base context state,
- frozen-input semantics,
- model-output disclaimer.

## Honeycomb language

The honeycomb reference is adopted as a restrained structural motif.

Use cases:

- subtle background texture inside DECISION/model regions,
- separators or edge ornament around model-state sections,
- small diagrammatic motif connecting Base / alternatives,
- intro-card or empty/loading states.

Rules:

- never place a high-contrast honeycomb texture across the central map,
- keep opacity low,
- do not use honeycomb cells as arbitrary containers for every KPI,
- the motif must signal model/system structure, not crypto branding.

Implementation should prefer CSS gradients or lightweight inline SVG.

## Globe / world motif

The globe/territory reference may appear as a secondary line-art symbol in:

- opening card,
- provenance/context region,
- product identity mark.

It must remain subordinate to the actual map.

No heavy WebGL globe or second 3D world is added to FleetFlow V0.7.

## Borders and surfaces

Panels should feel attached to the interface frame.

Rules:

- thin 1px borders,
- dark translucent surfaces,
- minimal radius,
- subtle backdrop blur only where map readability requires it,
- no repeated heavy shadows around every panel,
- use stronger border/metallic treatment for hierarchy rather than larger card size.

## Motion system for V0.7

V0.7 uses a motion budget, not an animation showcase.

### Initial implementation

Prefer:

1. CSS transitions,
2. browser-native behavior,
3. inline SVG animation only where needed.

Do not add Anime.js, Motion, AutoAnimate or another animation dependency in the first V0.7 implementation unless an approved component demonstrably cannot meet the interaction requirement with existing primitives.

### Motion purposes

Motion may communicate:

- opening-card dismissal into the instrument frame,
- DECISION comparison becoming available,
- selection changing from Base to an alternative,
- metric delta change,
- compact panel expansion/collapse,
- loading → validated state.

Motion must not animate the map DOM to fake geospatial movement. Map/vehicle motion stays under the existing map/simulation logic.

## Interaction architecture references

The following upstream projects are reference material, not automatic dependencies:

### Study / likely patterns

- Radix primitives / shadcn interaction architecture: collapsible, tooltip, scroll-area semantics.
- `react-resizable-panels`: potential future dock behavior if a later iteration needs user-controlled vertical space.
- FormKit AutoAnimate: potential future low-cost reflow animation.
- Anime.js v4: future expressive SVG/motion-path work.
- `motion/mini`: future minimal DOM/SVG animation.

### Visual study only

- kepler.gl: map/tool separation, filters, progressive disclosure, dense geo UI.
- deck.gl / vis.gl: layer/time visualization patterns and animated spatial data.

V0.7 does not embed kepler.gl or deck.gl into FleetFlow.

## Epistemic visual semantics

FleetFlow must visually reinforce its existing evidence contract.

The interface should distinguish:

```text
BASE operational model
WHAT_IF model output
source/provenance
context available/unavailable/omitted
observed data (only if it actually exists in a future version)
```

Current FleetFlow must not visually imply observed live Córdoba operations.

Examples:

```text
SYNTHETIC DEMAND
GTFS spatial proxy
OSM-derived route geometry
WHAT_IF · deterministic model output
BASE CONTEXT · unavailable
```

These are compact labels, not disclaimers hidden in a footer.

## Responsive behavior

### Desktop >= 1180px

- full connected frame,
- top TIME/playback rail,
- right operation/provenance rail,
- compact bottom DECISION/outcome rail,
- map remains central dominant surface.

### Tablet 700–1179px

- top rail may wrap to two rows,
- right rail stays bounded,
- decision region becomes a shallower horizontally scrollable dock,
- audit details may collapse behind one explicit `Detalles del modelo` disclosure,
- primary outcome microcharts remain visible.

### Mobile < 700px

The requirement to expose maximum information must not make the map unusable.

Priority becomes:

1. map,
2. selected operational date/state,
3. selected decision,
4. 3–4 core KPIs/deltas,
5. fleet/detail content in vertical scroll/disclosures.

The opening card must fit without clipped text at approximately 390×844.

## Accessibility

V0.7 must preserve or improve:

- keyboard access for opening-card controls,
- visible focus states,
- semantic buttons for decision selection,
- `aria-pressed` for selected scenario decisions,
- text equivalents for visual bars,
- table/detail values available independently of chart shape,
- sufficient contrast for muted labels,
- reduced-motion behavior through `prefers-reduced-motion`.

No meaning is encoded only through color or animation.

## Component direction

Likely implementation units:

```text
IntroCard
ProductIdentity / compact brand header
DecisionDock
DecisionSummary
OutcomeMicroChart / OutcomeMetricRow
ModelStateBadge
ContextProvenanceSummary
ScenarioComparisonDetails
```

Existing components should be reused where their responsibilities already fit:

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

The implementation may split `ScenarioComparisonPanel` so visual summary and audit detail are independently understandable/testable. It must not move outcome derivation into visual components in a way that duplicates domain logic.

## State/data-flow constraint

Visual refactoring must preserve:

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

The UI does not invent or recalculate a parallel metric model.

## Failure states

Failures remain local and legible.

### Base/run failure

Base run failure may block the operational experience as it does today.

### Comparison failure

Comparison failure must never remove the valid Base map.

It appears in the DECISION region with concise copy and no modal.

### Missing optional outcome

Use `—` / unavailable and explanatory labels where needed.

Missing values must not render as zero-length bars that imply zero.

## Performance constraints

V0.7 should remain lightweight.

- no general charting library for the first microcharts,
- no new mapping stack,
- no animation framework by default,
- no eager loading that blocks Base rendering,
- What-If alternatives may background-load only after the Base bundle is usable,
- honeycomb/globe decoration must be CSS/SVG-scale rather than image-heavy or WebGL-heavy.

## Testing strategy

Implementation follows TDD for behavior changes.

Required coverage should include:

### Intro

- opening card renders under the correct first-entry condition,
- dismiss action works,
- persisted dismissal is versioned,
- reopen action works,
- keyboard dismissal is supported.

### Decision discoverability/loading

- comparison-capable Base shows DECISION without requiring `Compare scenarios`,
- Base remains rendered while alternatives load,
- validated comparison becomes selectable atomically,
- failure leaves Base usable,
- date change resets comparison selection correctly.

### Comparison visualization

- summary uses existing `ScenarioOutcome` / `ScenarioDelta`,
- unavailable metrics render as unavailable rather than zero,
- Early Start is not labelled “faster”,
- no winner/recommendation language is introduced,
- detailed audit/provenance remains present.

### Layout/accessibility semantic checks

- expected structural regions and labels render,
- decision buttons retain semantic pressed state,
- visual charts expose textual values,
- reduced-motion CSS path exists.

### Build/regression

- full existing test suite passes,
- production build passes,
- V0.6 artifacts and What-If artifacts remain unchanged unless a separately approved implementation task explicitly requires otherwise,
- simulation engine and clock behavior remain unchanged.

## Visual acceptance review

In addition to automated tests, implementation review must inspect at least:

```text
1440 × 900
1366 × 768
1024 × 768
390 × 844
```

Review criteria:

- no clipped important text,
- no overlapping rails,
- no panel visually swallowing the map,
- opening card readable without scrolling at common desktop sizes,
- mobile opening card usable,
- primary decision deltas visible on desktop without opening another modal,
- map remains visually dominant after onboarding,
- decorative honeycomb/globe treatment stays subordinate to data.

## Implementation sequence boundary

The likely implementation sequence is intentionally incremental:

```text
1. Intro + visual tokens / shell hierarchy
2. Always-discoverable DECISION region + background comparison loading
3. Outcome microcharts + compact deltas
4. Audit/provenance re-layout
5. Honeycomb/globe ornament + restrained motion
6. Responsive/accessibility polish
```

This is a design sequence only. The implementation plan is written after final approval of this spec.

## Acceptance criteria

V0.7 is successful when:

1. A first-time visitor can explain what FleetFlow does after reading one short opening card.
2. After dismissal, the map is immediately the dominant surface.
3. TIME, OPERATION and DECISION are visually distinct concepts.
4. A comparison-capable Base exposes What-If availability without a hidden `Compare scenarios` discovery step.
5. Base operation remains usable while alternatives load or if comparison fails.
6. Base / Early Start / Balanced Load trade-offs are understandable from compact graphics and deltas without reading a large table first.
7. Full audit/provenance information remains accessible.
8. No visual treatment implies a winner, prediction certainty, live telemetry, or observed Córdoba operation.
9. Honeycomb/globe/NFT-inspired language adds identity without competing with the map.
10. The existing V0.6 + What-If domain contracts and simulation engine remain intact.
11. The design is usable at the defined desktop/tablet/mobile review sizes.
12. The full test suite and production build pass after implementation.
