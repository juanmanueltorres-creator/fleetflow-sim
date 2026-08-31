# FleetFlow V0.7 — Operational Cartography Visual System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the merged FleetFlow V0.6 + What-If V0 application into a map-first operational instrument with a first-entry explainer, always-discoverable decision comparison, compact comparative graphics, visible evidence semantics, and responsive Operational Cartography styling without changing simulation/domain contracts.

**Architecture:** Keep the current `OperationalRun` / `OperationalBundle` / What-If loaders and the single selected map/simulation runtime unchanged. Add small presentation components around `App.tsx`, automatically load the already-published comparison only after Base is usable, derive visual comparison data from the existing `ScenarioOutcome` / `ScenarioDelta` functions, keep the full audit table behind progressive disclosure, and implement all visual motion with CSS/native browser primitives.

**Tech Stack:** React 19.1, TypeScript 5.7, Vite 6.1, Vitest 3 + Testing Library + jsdom, MapLibre GL 6.6, existing Turf 7.4 dependencies, CSS/inline SVG only for new visualization and motion.

**Spec:** `docs/superpowers/specs/2026-08-30-fleetflow-v0-7-operational-cartography-design.md`

## Global Constraints

- Baseline is merged PR #12 / `main` commit `1887c3215b3786f5e2a6339e87fe28e01e5fab88`.
- Repository and technical product remain `FleetFlow Sim`; the Córdoba product line is `Córdoba · Last-Mile Twin`.
- Preserve the existing Decision Technologies palette and serif/monospace identity.
- Keep `TIME`, `OPERATION`, `DECISION`, `OUTCOME`, and `EVIDENCE` explicit in the interface vocabulary.
- The map remains the largest single visual surface at 1366×768 and 1440×900.
- The bottom DECISION region is shallow by default; do not restore the current ~47vh comparison dock.
- The first valid Córdoba Base map must render before the intro card appears.
- Intro dismissal persists only under `fleetflow:intro:v0.7:dismissed`; no backend persistence.
- The intro must be reopenable from a persistent help/info control.
- Legacy V0 does not independently trigger the Córdoba intro.
- Base operation never waits for What-If alternatives.
- Once a comparison definition is discovered for the usable Base, Early Start and Balanced Load load automatically and atomically through the existing `loadScenarioComparison()` path.
- If either alternative fails, show no partial comparison; Base remains usable.
- Remove `Compare scenarios` as the primary discovery mechanism.
- Keep one selected validated bundle/map/simulation at a time.
- Reuse existing `deriveScenarioOutcome()` and `deriveScenarioDelta()`; do not create a second outcome engine.
- No new charting dependency; use CSS/inline SVG microvisualizations with textual equivalents.
- No winner, recommendation, risk score, ranking, medal, green=best, or red=worst semantics.
- Honeycomb/panal is a low-opacity structural motif only; never cover the central map with high-contrast texture.
- No Anime.js, Motion, AutoAnimate, Radix, shadcn, react-resizable-panels, kepler.gl, or deck.gl dependency in V0.7.
- Preserve keyboard access, visible focus, `aria-pressed`, textual chart values, and `prefers-reduced-motion`.
- `src/simulation/**`, `src/scenario/whatIf/**`, published operational JSON/GeoJSON artifacts, manifests, and `package.json` dependencies remain semantically unchanged unless a task below explicitly names a presentation-only import/use.
- Before completion: focused tests, full `npm test`, `npm run build`, and manual visual acceptance at 1440×900, 1366×768, 1024×768, and 390×844.

---

## File Map

Create:

```text
src/components/IntroCard.tsx
src/components/IntroCard.css
src/components/ProductIdentity.tsx
src/components/DecisionDock.tsx
src/components/scenarioComparisonViewModel.ts
src/components/OutcomeMetricRow.tsx
src/components/ScenarioComparisonSummary.tsx
src/components/ScenarioComparisonDetails.tsx
tests/introCard.test.tsx
tests/scenarioComparisonSummary.test.tsx
tests/visualSystem.test.ts
```

Modify:

```text
src/App.tsx
src/components/ScenarioDecisionRail.tsx
src/components/ScenarioComparisonPanel.tsx
src/components/ScenarioProvenance.tsx
src/components/ScenarioProvenance.css
src/components/OperationalExplainer.tsx
src/ui-polish.css
tests/appSmoke.test.tsx
tests/dashboardComponents.test.tsx
tests/whatIfUi.test.tsx
README.md
```

Must remain behaviorally untouched:

```text
src/simulation/engine.ts
src/simulation/clock.ts
src/simulation/metrics.ts
src/scenario/whatIf/catalog.ts
src/scenario/whatIf/loader.ts
src/scenario/whatIf/outcomes.ts
src/scenario/whatIf/invariants.ts
src/scenario/operationalRuns/bundle.ts
public/data/operational-runs/manifest-v0-6.json
public/data/operational-runs/what-if-comparisons.json
public/data/operational-runs/generated/*.json
public/data/operational-runs/generated/*.geojson
```

---

### Task 1: Add the product identity and first-entry explainer

**Files:**
- Create: `src/components/IntroCard.tsx`
- Create: `src/components/IntroCard.css`
- Create: `src/components/ProductIdentity.tsx`
- Create: `tests/introCard.test.tsx`
- Modify: `src/App.tsx`
- Modify: `tests/appSmoke.test.tsx`

**Interfaces:**

```ts
interface IntroCardProps {
  open: boolean
  onDismiss: () => void
}

interface ProductIdentityProps {
  descriptor: string
  scenarioLabel: string
  runMode?: OperationalRunMode
}
```

- [ ] **Step 1: Write RED component tests for the intro**

Create `tests/introCard.test.tsx`:

```tsx
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { IntroCard } from '../src/components/IntroCard'

afterEach(cleanup)

describe('FleetFlow intro card', () => {
  it('explains the simulated Cordoba operation and dismisses from the primary action', () => {
    const onDismiss = vi.fn()
    render(<IntroCard open onDismiss={onDismiss} />)

    expect(screen.getByRole('dialog', { name: '¿Qué pasa si cambiás la operación?' })).toBeInTheDocument()
    expect(screen.getByText(/jornada de reparto simulada en Córdoba/i)).toBeInTheDocument()
    expect(screen.getByText(/modelos reproducibles, no una operación real/i)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Ver operación' }))
    expect(onDismiss).toHaveBeenCalledOnce()
  })

  it('dismisses with Escape and the explicit close control', () => {
    const onDismiss = vi.fn()
    const { rerender } = render(<IntroCard open onDismiss={onDismiss} />)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onDismiss).toHaveBeenCalledOnce()

    onDismiss.mockClear()
    rerender(<IntroCard open onDismiss={onDismiss} />)
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar explicación' }))
    expect(onDismiss).toHaveBeenCalledOnce()
  })

  it('renders nothing when closed', () => {
    render(<IntroCard open={false} onDismiss={() => undefined} />)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run RED**

```bash
npm test -- tests/introCard.test.tsx
```

Expected: module-not-found failure for `IntroCard`.

- [ ] **Step 3: Implement `IntroCard` with exact semantics**

Use a semantic dialog overlay and browser-native Escape handling:

```tsx
import { useEffect } from 'react'
import './IntroCard.css'

export function IntroCard({ open, onDismiss }: IntroCardProps) {
  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onDismiss()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open, onDismiss])

  if (!open) return null

  return (
    <div className="intro-overlay">
      <section
        className="intro-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="fleetflow-intro-title"
      >
        <button type="button" className="intro-close" aria-label="Cerrar explicación" onClick={onDismiss}>×</button>
        <span className="panel-label">FLEETFLOW · CÓRDOBA</span>
        <h2 id="fleetflow-intro-title">¿Qué pasa si cambiás la operación?</h2>
        <p>Acá estás viendo una jornada de reparto simulada en Córdoba.</p>
        <p>Podés cambiar el día, adelantar la salida o repartir la carga de otra manera y comparar qué cambia en horarios, distancia, combustible y uso de los vehículos.</p>
        <p className="intro-model-note">Los recorridos y resultados son modelos reproducibles, no una operación real.</p>
        <button type="button" className="intro-primary" onClick={onDismiss}>Ver operación</button>
        <small>8 vehículos · Córdoba · escenarios reproducibles · supuestos visibles</small>
      </section>
    </div>
  )
}
```

Add a restrained inline/CSS globe or honeycomb mark using pseudo-elements only; do not import an image or animation library.

- [ ] **Step 4: Implement `ProductIdentity`**

The component renders:

```tsx
<header className="product-identity">
  <span className="product-identity-kicker">DECISION TECHNOLOGIES · FLEET OPERATIONS</span>
  <div className="product-identity-title-row">
    <h1>FleetFlow Sim</h1>
    {runMode ? <span className="model-state-badge">{runMode}</span> : null}
  </div>
  <strong className="product-identity-descriptor">{descriptor}</strong>
  <span className="product-identity-scenario">{scenarioLabel}</span>
</header>
```

`descriptor` is `Córdoba · Last-Mile Twin` for `cordoba-calibrated`; Legacy uses `Coca Coqui · Legacy V0`.

- [ ] **Step 5: Wire local intro persistence into `App.tsx`**

Add exactly:

```ts
const INTRO_STORAGE_KEY = 'fleetflow:intro:v0.7:dismissed'

function readIntroDismissed(): boolean {
  try {
    return window.localStorage.getItem(INTRO_STORAGE_KEY) === 'true'
  } catch {
    return false
  }
}
```

Initialize:

```ts
const [introDismissed, setIntroDismissed] = useState(readIntroDismissed)
const [introReopened, setIntroReopened] = useState(false)
```

The intro is open only when:

```ts
const isCordobaBaseReady = Boolean(
  scenarioId === 'cordoba-calibrated'
    && activeBundle
    && activeRun
    && activeRun.mode !== 'WHAT_IF'
    && activeScenario
    && routes
    && snapshot
    && metrics,
)

const introOpen = isCordobaBaseReady && (!introDismissed || introReopened)
```

Dismiss with:

```ts
const dismissIntro = () => {
  setIntroDismissed(true)
  setIntroReopened(false)
  try { window.localStorage.setItem(INTRO_STORAGE_KEY, 'true') } catch { /* local preference only */ }
}
```

Add one persistent button after the intro is dismissed:

```tsx
<button
  type="button"
  className="product-help-button"
  aria-label="Explicar FleetFlow"
  onClick={() => setIntroReopened(true)}
>
  ?
</button>
```

Do not show this Córdoba-specific help affordance in Legacy V0.

- [ ] **Step 6: Update the app smoke test**

In `beforeEach`, add:

```ts
window.localStorage.clear()
```

Replace the old eyebrow expectation with:

```ts
expect(screen.getByRole('heading', { name: 'FleetFlow Sim' })).toBeInTheDocument()
expect(await screen.findByText('Córdoba · Last-Mile Twin')).toBeInTheDocument()
expect(await screen.findByRole('dialog', { name: '¿Qué pasa si cambiás la operación?' })).toBeInTheDocument()
expect(screen.getByTestId('fleet-map')).toBeInTheDocument()
```

Dismiss, remount with the same localStorage, and assert the dialog does not reappear; click `Explicar FleetFlow` and assert it reopens.

- [ ] **Step 7: Run GREEN**

```bash
npm test -- tests/introCard.test.tsx tests/appSmoke.test.tsx
npm run build
```

- [ ] **Step 8: Commit**

```bash
git add src/components/IntroCard.tsx src/components/IntroCard.css src/components/ProductIdentity.tsx src/App.tsx tests/introCard.test.tsx tests/appSmoke.test.tsx
git commit -m "feat: add FleetFlow operational intro and identity"
```

---

### Task 2: Make DECISION visible and auto-load the published comparison

**Files:**
- Create: `src/components/DecisionDock.tsx`
- Modify: `src/components/ScenarioDecisionRail.tsx`
- Modify: `src/App.tsx`
- Modify: `tests/whatIfUi.test.tsx`

**Interfaces:**

```ts
interface ScenarioDecisionOption {
  id: string
  label: 'BASE' | 'EARLY START' | 'BALANCED LOAD'
  disabled?: boolean
}

interface DecisionDockProps {
  definition: WhatIfComparisonDefinition
  comparison: ScenarioComparisonSet | null
  selectedRunId: string
  loading: boolean
  error: boolean
  onSelect: (runId: string) => void
}
```

- [ ] **Step 1: Rewrite the existing What-If UX test to RED**

Remove every click on `Compare scenarios`. After the Base map appears, require automatic fetching:

```tsx
expect(await screen.findByTestId('fleet-map')).toHaveTextContent(mapSignature(baseRun, baseRoutes))
expect(await screen.findByRole('region', { name: 'DECISION' })).toBeInTheDocument()
expect(screen.queryByRole('button', { name: 'Compare scenarios' })).not.toBeInTheDocument()

await waitFor(() => {
  expect(fetchMock.mock.calls.some(([url]) => String(url) === resolveArtifactUrl(earlyEntry.artifact))).toBe(true)
  expect(fetchMock.mock.calls.some(([url]) => String(url) === resolveArtifactUrl(balancedEntry.artifact))).toBe(true)
})

expect(await screen.findByRole('button', { name: 'EARLY START' })).toBeEnabled()
expect(screen.getByRole('button', { name: 'BASE' })).toHaveAttribute('aria-pressed', 'true')
```

For a broken alternative require:

```tsx
expect(await screen.findByText('Comparison unavailable · Base remains active')).toBeInTheDocument()
expect(screen.getByTestId('fleet-map')).toHaveTextContent(mapSignature(baseRun, baseRoutes))
expect(screen.queryByRole('button', { name: 'Compare scenarios' })).not.toBeInTheDocument()
```

Keep date-change assertions proving a decision cannot leak into a different Base.

- [ ] **Step 2: Run RED**

```bash
npm test -- tests/whatIfUi.test.tsx
```

Expected: tests fail because alternatives are still button-triggered.

- [ ] **Step 3: Extend `ScenarioDecisionRail` with disabled options**

Render actual `disabled={option.disabled}` on buttons while preserving `aria-pressed`. Disabled Early/Balanced labels are still visible while the comparison is loading.

- [ ] **Step 4: Implement `DecisionDock` as a presentation boundary**

Construct options from the definition even before alternatives finish loading:

```ts
const options = [
  { id: definition.baseRunId, label: 'BASE' as const, disabled: false },
  ...definition.alternatives.map((alternative) => ({
    id: alternative.entry.id,
    label: alternative.label === 'Early start' ? 'EARLY START' as const : 'BALANCED LOAD' as const,
    disabled: comparison === null,
  })),
]
```

Render:

```tsx
<section className="scenario-decision-dock" aria-label="DECISION">
  <header className="decision-dock-heading">
    <span className="panel-label">DECISION</span>
    {loading ? <span>Loading model alternatives…</span> : null}
    {error ? <span>Comparison unavailable · Base remains active</span> : null}
  </header>
  <ScenarioDecisionRail options={options} selectedId={selectedRunId} onSelect={onSelect} />
  {comparison ? <ScenarioComparisonPanel comparison={comparison} selectedRunId={selectedRunId} /> : null}
</section>
```

No detached floating error card.

- [ ] **Step 5: Replace click-triggered comparison loading in `App.tsx`**

Delete `openComparison()` and `.scenario-compare-launcher` rendering.

After catalog discovery, automatically load only when Base is already renderable:

```ts
const baseReadyForDecision = Boolean(
  timeline?.comparisonCatalogUrl
    && comparisonDefinition
    && activeBundle
    && activeScenario
    && routes
    && snapshot
    && metrics,
)

useEffect(() => {
  const catalogUrl = timeline?.comparisonCatalogUrl
  const definition = comparisonDefinition
  const base = activeBundle
  if (
    !baseReadyForDecision
    || !catalogUrl
    || !definition
    || !base
    || comparisonSet
    || comparisonLoading
    || comparisonError
  ) return

  const requestId = comparisonRequestId.current + 1
  comparisonRequestId.current = requestId
  setComparisonLoading(true)
  setComparisonError(false)

  void loadScenarioComparison({ definition, base, catalogUrl })
    .then((comparison) => {
      if (comparisonRequestId.current !== requestId) return
      setComparisonSet(comparison)
      setSelectedDecisionRunId(comparison.base.run.id)
    })
    .catch(() => {
      if (comparisonRequestId.current !== requestId) return
      setComparisonSet(null)
      setSelectedDecisionRunId(base.run.id)
      setComparisonError(true)
    })
    .finally(() => {
      if (comparisonRequestId.current === requestId) setComparisonLoading(false)
    })
}, [
  activeBundle,
  baseReadyForDecision,
  comparisonDefinition,
  comparisonError,
  comparisonLoading,
  comparisonSet,
  timeline?.comparisonCatalogUrl,
])
```

Do **not** reset simulation time merely because alternatives became available. Loading DECISION must be invisible to Base playback state.

- [ ] **Step 6: Preserve stale-request cancellation**

`clearComparison()` still increments `comparisonRequestId`. Date/scenario changes must clear comparison state before loading the next Base. `changeDecision()` remains the only action that swaps the selected bundle and resets the selected scenario to its start minute.

- [ ] **Step 7: Run GREEN**

```bash
npm test -- tests/whatIfUi.test.tsx tests/appSmoke.test.tsx tests/scenarioSwitching.test.tsx
npm run build
```

- [ ] **Step 8: Commit**

```bash
git add src/components/DecisionDock.tsx src/components/ScenarioDecisionRail.tsx src/App.tsx tests/whatIfUi.test.tsx
git commit -m "feat: make what-if decisions always discoverable"
```

---

### Task 3: Promote OUTCOME microcharts and move the table into audit details

**Files:**
- Create: `src/components/scenarioComparisonViewModel.ts`
- Create: `src/components/OutcomeMetricRow.tsx`
- Create: `src/components/ScenarioComparisonSummary.tsx`
- Create: `src/components/ScenarioComparisonDetails.tsx`
- Create: `tests/scenarioComparisonSummary.test.tsx`
- Modify: `src/components/ScenarioComparisonPanel.tsx`
- Modify: `tests/whatIfUi.test.tsx`

**Interfaces:**

```ts
export type ScenarioComparisonLabel = 'BASE' | 'EARLY START' | 'BALANCED LOAD'

export interface ScenarioComparisonColumn {
  label: ScenarioComparisonLabel
  bundle: OperationalBundle
  outcome: ScenarioOutcome
  delta: ScenarioDelta | null
}

export interface ScenarioComparisonViewModel {
  columns: ScenarioComparisonColumn[]
  selectedColumn: ScenarioComparisonColumn
}

export function buildScenarioComparisonViewModel(
  comparison: ScenarioComparisonSet,
  selectedRunId: string,
): ScenarioComparisonViewModel
```

- [ ] **Step 1: Write RED summary tests**

Create `tests/scenarioComparisonSummary.test.tsx` using the checked-in Base/Early/Balanced fixtures and `loadOperationalBundle`-compatible bundle objects. Assert:

```tsx
render(<ScenarioComparisonPanel comparison={comparison} selectedRunId={earlyRun.id} />)

expect(screen.getByRole('region', { name: 'OUTCOME' })).toBeInTheDocument()
for (const label of ['Fin', 'Duración', 'Distancia', 'Combustible', 'Utilización media', 'Utilización máxima', 'Diferencia de carga']) {
  expect(screen.getByText(label)).toBeInTheDocument()
}
expect(screen.getByText('Δ -60 min')).toBeInTheDocument()
expect(screen.getByText(/duración operativa sin cambios/i)).toBeInTheDocument()
expect(screen.queryByText(/recommended|winner|best scenario/i)).not.toBeInTheDocument()

expect(screen.queryByRole('table', { name: 'Scenario outcome comparison' })).not.toBeInTheDocument()
fireEvent.click(screen.getByText('Detalles del modelo'))
expect(screen.getByRole('table', { name: 'Scenario outcome comparison' })).toBeInTheDocument()
```

Also assert every visual bar has `aria-hidden="true"` and every scenario value remains text in the DOM.

- [ ] **Step 2: Run RED**

```bash
npm test -- tests/scenarioComparisonSummary.test.tsx
```

- [ ] **Step 3: Extract a pure comparison view model**

Move the current outcome/delta derivation out of `ScenarioComparisonPanel` into `scenarioComparisonViewModel.ts`:

```ts
export function buildScenarioComparisonViewModel(comparison, selectedRunId) {
  const baseOutcome = deriveScenarioOutcome(comparison.base)
  const columns: ScenarioComparisonColumn[] = [
    { label: 'BASE', bundle: comparison.base, outcome: baseOutcome, delta: null },
    ...comparison.alternatives.map((item) => {
      const outcome = deriveScenarioOutcome(item.bundle)
      return {
        label: item.label === 'Early start' ? 'EARLY START' : 'BALANCED LOAD',
        bundle: item.bundle,
        outcome,
        delta: deriveScenarioDelta(baseOutcome, outcome),
      }
    }),
  ]
  return {
    columns,
    selectedColumn: columns.find((column) => column.bundle.run.id === selectedRunId) ?? columns[0],
  }
}
```

This is presentation projection only; do not modify `src/scenario/whatIf/outcomes.ts`.

- [ ] **Step 4: Implement `OutcomeMetricRow`**

Props:

```ts
interface OutcomeMetricValue {
  id: string
  label: ScenarioComparisonLabel
  displayValue: string
  deltaText?: string
  magnitude: number | null
  selected: boolean
}

interface OutcomeMetricRowProps {
  label: string
  values: OutcomeMetricValue[]
}
```

Normalize bar width only against the maximum finite non-negative magnitude in that row:

```ts
const max = Math.max(0, ...values.map((value) => value.magnitude ?? 0))
const width = value.magnitude === null || max === 0 ? 0 : (value.magnitude / max) * 100
```

Render the bar `aria-hidden="true"`; render label/value/delta as real text. Color does not depend on delta sign.

- [ ] **Step 5: Implement `ScenarioComparisonSummary`**

Build seven metric rows from the view model:

```text
Fin                  operationEndMinute, formatSimulationTime, delta operationEndDeltaMinutes
Duración             operationSpanMinutes, `N min`, delta operationSpanDeltaMinutes
Distancia            plannedDistanceKm, `N.N km`, delta distanceDeltaKm
Combustible          estimatedFuelUsedL, `N.N L`/—, delta estimatedFuelDeltaL
Utilización media    meanVehicleUtilizationPct, `N.N%`/—, delta meanUtilizationDeltaPct
Utilización máxima   maxVehicleUtilizationPct, `N.N%`/—, delta maxUtilizationDeltaPct
Diferencia de carga  packageLoadSpread, integer/—, delta packageLoadSpreadDelta
```

For Early Start, keep the semantic note in Spanish:

```text
Termina 60 min antes; duración operativa sin cambios.
```

Do not say “60 min más rápido”.

- [ ] **Step 6: Implement `ScenarioComparisonDetails`**

Move the existing complete table and WHAT_IF audit grid into:

```tsx
<details className="scenario-comparison-details">
  <summary>Detalles del modelo</summary>
  ...existing table...
  ...existing audit grid when selected WHAT_IF...
</details>
```

The always-visible header still shows `WHAT_IF · MODEL OUTPUT` and its deterministic-model disclaimer for a selected alternative.

- [ ] **Step 7: Make `ScenarioComparisonPanel` an orchestrator**

It should only:

```tsx
const viewModel = buildScenarioComparisonViewModel(comparison, selectedRunId)
return (
  <section className="scenario-comparison-panel" aria-label="Scenario comparison">
    <ScenarioComparisonSummary viewModel={viewModel} />
    <ScenarioComparisonDetails comparison={comparison} viewModel={viewModel} />
  </section>
)
```

- [ ] **Step 8: Update integration assertions**

In `tests/whatIfUi.test.tsx`, switch an alternative, assert the map changes, assert OUTCOME is visible, then expand `Detalles del modelo` before checking Base run ID/action-set/derivation values.

- [ ] **Step 9: Run GREEN**

```bash
npm test -- tests/scenarioComparisonSummary.test.tsx tests/whatIfUi.test.tsx tests/whatIfOutcomes.test.ts
npm run build
```

- [ ] **Step 10: Commit**

```bash
git add src/components/scenarioComparisonViewModel.ts src/components/OutcomeMetricRow.tsx src/components/ScenarioComparisonSummary.tsx src/components/ScenarioComparisonDetails.tsx src/components/ScenarioComparisonPanel.tsx tests/scenarioComparisonSummary.test.tsx tests/whatIfUi.test.tsx
git commit -m "feat: add compact what-if outcome visualization"
```

---

### Task 4: Compress OPERATION and make EVIDENCE semantics visible

**Files:**
- Modify: `src/components/OperationalExplainer.tsx`
- Modify: `src/components/ScenarioProvenance.tsx`
- Modify: `src/components/ScenarioProvenance.css`
- Modify: `src/App.tsx`
- Modify: `tests/dashboardComponents.test.tsx`
- Modify: `tests/appSmoke.test.tsx`

- [ ] **Step 1: Write RED evidence/rail expectations**

Extend `tests/dashboardComponents.test.tsx`:

```tsx
render(
  <ScenarioProvenance
    provenance={getScenarioDefinition('cordoba-calibrated').provenance}
    runMode="WHAT_IF"
    contextStatus="omitted"
  />,
)

expect(screen.getByText('WHAT_IF · ESCENARIO CALIBRADO')).toBeInTheDocument()
expect(screen.getByText('DEMANDA SINTÉTICA')).toBeInTheDocument()
expect(screen.getByText('GTFS · PROXY ESPACIAL')).toBeInTheDocument()
expect(screen.getByText('RUTAS · OSM-DERIVED')).toBeInTheDocument()
expect(screen.getByText('BASE CONTEXT · OMITTED')).toBeInTheDocument()
expect(screen.getByText(/resultado determinista bajo supuestos congelados/i)).toBeInTheDocument()
```

Update `appSmoke.test.tsx` to require visible `OPERATION` and `EVIDENCE` labels and no long generic “Acá la base del mapa no cambia…” paragraph above the fleet.

- [ ] **Step 2: Run RED**

```bash
npm test -- tests/dashboardComponents.test.tsx tests/appSmoke.test.tsx
```

- [ ] **Step 3: Compress `OperationalExplainer`**

Keep the actual daily profile, remove the repeated generic tutorial paragraph now handled by IntroCard:

```tsx
<section className="operational-explainer" aria-label="Jornada operativa">
  <span className="panel-label">OPERATION</span>
  <strong>{dayLabel} · {intensityLabel}</strong>
  <span>{summary}</span>
</section>
```

- [ ] **Step 4: Extend `ScenarioProvenance` with context status**

Add:

```ts
import type { OperationalContextLoadState } from '../scenario/operationalRuns/types'

interface ScenarioProvenanceProps {
  provenance: ScenarioProvenanceValue
  runMode?: OperationalRunMode
  contextStatus?: OperationalContextLoadState['status']
}
```

For `WHAT_IF`, use:

```text
Resultado determinista bajo supuestos congelados de Base. No es una operación observada ni una predicción garantizada.
```

For calibrated Córdoba render visible compact evidence tags:

```text
DEMANDA SINTÉTICA
GTFS · PROXY ESPACIAL
RUTAS · OSM-DERIVED
BASE CONTEXT · AVAILABLE|UNAVAILABLE|OMITTED
```

Keep the existing `Fuente y método` disclosure and source/license link.

- [ ] **Step 5: Pass Base context semantics correctly from `App.tsx`**

For a selected WHAT_IF, context still comes from `comparisonSet.base.context`; otherwise use `displayBundle?.context`. Compute:

```ts
const visibleContext = activeRun?.mode === 'WHAT_IF' && comparisonSet
  ? comparisonSet.base.context
  : displayBundle?.context
```

Pass `contextStatus={visibleContext?.status}`.

- [ ] **Step 6: Fix mobile provenance behavior**

In `ScenarioProvenance.css`, remove any mobile rule that sets `.scenario-provenance { display: none; }`. On small screens keep the compact evidence tags visible and collapse only the detailed source/method body behind the native `<details>`.

- [ ] **Step 7: Run GREEN**

```bash
npm test -- tests/dashboardComponents.test.tsx tests/appSmoke.test.tsx tests/whatIfUi.test.tsx
npm run build
```

- [ ] **Step 8: Commit**

```bash
git add src/components/OperationalExplainer.tsx src/components/ScenarioProvenance.tsx src/components/ScenarioProvenance.css src/App.tsx tests/dashboardComponents.test.tsx tests/appSmoke.test.tsx
git commit -m "feat: expose compact operation and evidence semantics"
```

---

### Task 5: Build the connected Operational Cartography shell and responsive visual system

**Files:**
- Modify: `src/ui-polish.css`
- Modify: `src/components/IntroCard.css`
- Create: `tests/visualSystem.test.ts`
- Modify: `tests/appSmoke.test.tsx`

- [ ] **Step 1: Write RED structural CSS acceptance tests**

Create `tests/visualSystem.test.ts`:

```ts
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const polish = readFileSync(resolve(process.cwd(), 'src/ui-polish.css'), 'utf8')
const intro = readFileSync(resolve(process.cwd(), 'src/components/IntroCard.css'), 'utf8')

describe('V0.7 Operational Cartography CSS contract', () => {
  it('keeps the decision dock shallow and removes the old 47vh layout', () => {
    expect(polish).not.toContain('47vh')
    expect(polish).toContain('--decision-dock-height')
    expect(polish).toMatch(/scenario-decision-dock[\s\S]*height:\s*var\(--decision-dock-height\)/)
  })

  it('includes restrained honeycomb and reduced-motion rules', () => {
    expect(polish + intro).toMatch(/repeating-linear-gradient|polygon/)
    expect(polish + intro).toContain('@media (prefers-reduced-motion: reduce)')
  })

  it('contains desktop, tablet and mobile breakpoints', () => {
    expect(polish).toContain('@media (max-width: 1179px)')
    expect(polish).toContain('@media (max-width: 700px)')
  })
})
```

- [ ] **Step 2: Run RED**

```bash
npm test -- tests/visualSystem.test.ts
```

- [ ] **Step 3: Replace the floating What-If CSS with a connected bottom rail**

At desktop define:

```css
.interface-frame {
  --operations-width: 292px;
  --top-rail-height: 106px;
  --decision-dock-height: min(210px, 27vh);
}

.scenario-decision-dock {
  position: absolute;
  z-index: 7;
  right: var(--operations-width);
  bottom: 0;
  left: 0;
  height: var(--decision-dock-height);
  display: grid;
  grid-template-columns: minmax(250px, 0.34fr) minmax(0, 1fr);
  border-top: 1px solid var(--color-border-strong);
  background: rgba(13, 11, 8, 0.965);
  backdrop-filter: blur(10px);
  pointer-events: auto;
}
```

Delete `.scenario-compare-launcher` and detached `.scenario-comparison-error` styling.

- [ ] **Step 4: Add the restrained honeycomb motif**

Use a pseudo-element only inside DECISION/model surfaces:

```css
.scenario-decision-dock::before {
  content: "";
  position: absolute;
  inset: 0;
  pointer-events: none;
  opacity: 0.045;
  background:
    repeating-linear-gradient(60deg, transparent 0 19px, rgba(210, 177, 115, 0.5) 20px 21px),
    repeating-linear-gradient(-60deg, transparent 0 19px, rgba(114, 199, 232, 0.28) 20px 21px);
}
```

Do not apply it to `.map-canvas` or `.map-stage`.

- [ ] **Step 5: Style microcharts without semantic winner colors**

Use the same neutral/gold/cyan family for all scenarios; only selection/model-state changes emphasis:

```css
.outcome-metric-bar-track { background: rgba(239, 228, 208, 0.07); }
.outcome-metric-bar-fill { background: linear-gradient(90deg, rgba(210,177,115,.44), rgba(210,177,115,.82)); }
.outcome-metric-value[data-selected="true"] .outcome-metric-bar-fill { box-shadow: 0 0 0 1px rgba(210,177,115,.26); }
```

Do not style negative deltas red or positive deltas green.

- [ ] **Step 6: Compact the top/right rails**

The top identity, timeline, clock and controls must stay within the top rail without clipping at 1366×768. The right rail remains `292px` desktop and gives OPERATION/fleet priority before EVIDENCE details.

Use thin connected borders, minimal radius, no independent heavy shadows around every section.

- [ ] **Step 7: Implement tablet behavior (`700–1179px`)**

At `max-width: 1179px`:

```text
operations width about 260–270px
top rail may wrap to two rows
decision dock remains shallow
decision summary scrolls horizontally if needed
audit details remain collapsed by default
```

No element may force the page wider than viewport.

- [ ] **Step 8: Implement mobile behavior (`<700px`)**

At `max-width: 700px`:

```text
map remains visible behind UI
product identity compresses
TIME/date remains accessible
decision selector remains visible
only the most useful 3–4 outcome rows are immediately visible; remaining rows can scroll within OUTCOME
evidence chips remain visible
fleet and model details use normal vertical disclosure/scroll
intro max width uses viewport minus 24–32px and max-height below viewport
```

Do not hide evidence entirely.

- [ ] **Step 9: Add reduced-motion handling**

```css
@media (prefers-reduced-motion: reduce) {
  .intro-card,
  .scenario-decision-dock,
  .outcome-metric-bar-fill,
  .scenario-decision-rail button {
    transition: none !important;
    animation: none !important;
  }
}
```

- [ ] **Step 10: Run GREEN**

```bash
npm test -- tests/visualSystem.test.ts tests/appSmoke.test.tsx tests/scenarioComparisonSummary.test.tsx
npm run build
```

- [ ] **Step 11: Commit**

```bash
git add src/ui-polish.css src/components/IntroCard.css tests/visualSystem.test.ts tests/appSmoke.test.tsx
git commit -m "feat: apply Operational Cartography visual system"
```

---

### Task 6: Complete integration, documentation, and visual acceptance

**Files:**
- Modify: `README.md`
- Modify as required by final regression only: `tests/appSmoke.test.tsx`
- Modify as required by final regression only: `tests/whatIfUi.test.tsx`

- [ ] **Step 1: Update README product/UX documentation**

Add a V0.7 section stating:

```text
FleetFlow V0.7 — Operational Cartography
- FleetFlow Sim / Córdoba · Last-Mile Twin presentation
- first-entry explainer over the valid map
- TIME / OPERATION / DECISION / OUTCOME / EVIDENCE information architecture
- published What-If alternatives auto-load only after Base is usable
- Base remains usable on comparison failure
- compact outcome microcharts before audit details
- model/provenance semantics remain visible
```

Replace the old sentence saying alternatives load only when the user chooses `Compare scenarios`. State that the comparison catalog is discovered after Base loads and both alternatives are loaded automatically only after Base rendering is usable.

Do not change data/license semantics or claim live Córdoba operations.

- [ ] **Step 2: Run the focused V0.7 acceptance suite**

```bash
npm test -- \
  tests/introCard.test.tsx \
  tests/appSmoke.test.tsx \
  tests/dashboardComponents.test.tsx \
  tests/whatIfUi.test.tsx \
  tests/scenarioComparisonSummary.test.tsx \
  tests/visualSystem.test.ts
```

Expected: all pass.

- [ ] **Step 3: Run What-If/domain regression tests**

```bash
npm test -- \
  tests/whatIfComparisonCatalog.test.ts \
  tests/whatIfComparisonLoader.test.ts \
  tests/whatIfOutcomes.test.ts \
  tests/whatIfPublishedArtifacts.test.ts \
  tests/operationalRunCatalog.test.ts \
  tests/operationalBundle.test.ts
```

Expected: all pass without modifications to domain semantics.

- [ ] **Step 4: Run full automated verification**

```bash
npm test
npm run build
```

Expected: zero failing tests; TypeScript and Vite production build succeed.

- [ ] **Step 5: Verify forbidden-scope diff**

Run:

```bash
git diff --name-only 1887c3215b3786f5e2a6339e87fe28e01e5fab88...HEAD
```

Confirm no unintended modifications under:

```text
src/simulation/
src/scenario/whatIf/ except presentation imports are unnecessary and therefore should be absent
public/data/operational-runs/generated/
public/data/operational-runs/manifest-v0-6.json
public/data/operational-runs/what-if-comparisons.json
package.json dependency sections
```

- [ ] **Step 6: Manual visual acceptance at exact viewports**

Run:

```bash
npm run dev
```

Check **1440×900** and **1366×768**:

```text
intro sits over a visible valid map
map is the largest surface after dismiss
FleetFlow Sim + Córdoba · Last-Mile Twin visible immediately
TIME/date/clock/playback not clipped
OPERATION KPIs/fleet readable on right rail
DECISION visible without clicking Compare
bottom dock is shallow and does not approach half-screen height
Base/Early/Balanced selection works and changes only one map
OUTCOME microcharts are readable without opening model details
WHAT_IF model status is cyan/technical, not positive/recommended
EVIDENCE labels are visible
honeycomb stays subtle and off the central map
```

Check **1024×768**:

```text
top rail wraps cleanly
no horizontal page overflow
right rail remains bounded
DECISION selector and primary outcomes remain visible
Detalles del modelo can be opened without clipping the map completely
```

Check **390×844**:

```text
intro fits inside viewport and all controls are reachable
map remains visible
selected date/state and selected decision remain readable
decision buttons do not overflow the page
core outcome values have text equivalents
EVIDENCE is not hidden
model details/fleet can scroll or disclose normally
```

- [ ] **Step 7: Keyboard/accessibility acceptance**

Verify manually:

```text
Tab reaches intro close + Ver operación
Escape dismisses intro
help button reopens intro
Tab reaches date buttons, play/reset/speed, decision buttons and model details
focus ring remains visible
aria-pressed changes with Base/Early/Balanced
reduced-motion OS/browser preference removes decorative transitions
no decision meaning depends only on color
```

- [ ] **Step 8: Commit final docs/regression adjustments**

```bash
git add README.md tests/appSmoke.test.tsx tests/whatIfUi.test.tsx
git commit -m "docs: document FleetFlow V0.7 operational cartography"
```

If the tests required no final changes, commit only `README.md`.

---

## Final Definition of Done

V0.7 is complete only when all of the following are true:

```text
[ ] valid Córdoba Base renders before intro
[ ] first-entry intro explains system in direct Spanish
[ ] intro persistence key is exactly fleetflow:intro:v0.7:dismissed
[ ] help control reopens intro
[ ] FleetFlow Sim + Córdoba · Last-Mile Twin visible
[ ] TIME / OPERATION / DECISION / OUTCOME / EVIDENCE visible as concepts
[ ] Compare scenarios launcher removed
[ ] published alternatives auto-load after Base is usable
[ ] comparison failure leaves Base operational
[ ] no partial comparison state
[ ] one selected map/runtime only
[ ] primary What-If view uses compact microcharts, not the full table
[ ] complete table/provenance remains under Detalles del modelo
[ ] no score/winner/recommendation semantics
[ ] WHAT_IF disclosure stays explicit
[ ] Base context semantics stay explicit
[ ] honeycomb is restrained and not painted over central map
[ ] no new UI/chart/animation/map dependency
[ ] mobile does not hide evidence
[ ] prefers-reduced-motion covered
[ ] 1440×900 visual acceptance passed
[ ] 1366×768 visual acceptance passed
[ ] 1024×768 visual acceptance passed
[ ] 390×844 visual acceptance passed
[ ] focused V0.7 tests pass
[ ] full npm test passes
[ ] npm run build passes
[ ] simulation/domain/public artifacts remain unchanged
```

## Implementation Sequence

Execute strictly in this order:

```text
Task 1  Intro + product identity
Task 2  Always-visible / auto-loading DECISION
Task 3  OUTCOME microcharts + audit split
Task 4  OPERATION + EVIDENCE compaction
Task 5  Connected shell / honeycomb / responsive styling
Task 6  Docs + full regression + visual acceptance
```

Do not begin Task 5 by styling placeholders for components that Tasks 1–4 have not yet established. Do not add a visual dependency to solve a layout problem that CSS/native React can solve.