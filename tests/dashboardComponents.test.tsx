import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { FleetPanel } from '../src/components/FleetPanel'
import { KpiPanel } from '../src/components/KpiPanel'
import { ScenarioProvenance } from '../src/components/ScenarioProvenance'
import { SimulationClock } from '../src/components/SimulationClock'
import { SimulationControls } from '../src/components/SimulationControls'
import type { FleetSnapshot } from '../src/domain/types'
import { cocaCoquiScenario } from '../src/scenario/cocaCoquiScenario'
import { getScenarioDefinition } from '../src/scenario/scenarioRegistry'
import type { FleetMetrics } from '../src/simulation/metrics'

afterEach(cleanup)

const snapshot: FleetSnapshot = {
  simulationMinute: 30,
  trucks: cocaCoquiScenario.trucks.map((truck, index) => ({
    truckId: truck.id,
    position: cocaCoquiScenario.depot.position,
    bearing: 0,
    status: index === 0 ? 'EN_ROUTE' : 'AT_DEPOT',
    currentStopId: null,
    nextStopId: index === 0 ? 'store-03' : `store-${String(index * 3 + 1).padStart(2, '0')}`,
    routeProgress: index === 0 ? 0.5 : 0,
    remainingCargo: {
      kind: 'MASS',
      quantityKg: 1000,
      utilizationPct: (1000 / 2400) * 100,
    },
    completedDeliveries: index === 0 ? 2 : 0,
    distanceTravelledKm: index === 0 ? 5 : 0,
    estimatedFuelUsedL: index === 0 ? 0.9 : 0,
  })),
}

const metrics: FleetMetrics = {
  completedDeliveries: 7,
  totalDeliveries: 15,
  activeTrucks: 5,
  totalVehicles: 5,
  plannedDistanceKm: 71,
  estimatedFuelUsedL: 4.25,
}

describe('simulation dashboard components', () => {
  it('shows the accelerated clock and running state', () => {
    render(<SimulationClock minute={27} isPlaying />)
    expect(screen.getByText('06:27')).toBeInTheDocument()
    expect(screen.getByText('Running')).toBeInTheDocument()
  })

  it('emits play, reset and speed actions', () => {
    const onPlayPause = vi.fn()
    const onReset = vi.fn()
    const onSpeedChange = vi.fn()

    render(
      <SimulationControls
        isPlaying={false}
        speed={60}
        onPlayPause={onPlayPause}
        onReset={onReset}
        onSpeedChange={onSpeedChange}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Play simulation' }))
    fireEvent.click(screen.getByRole('button', { name: 'Reset simulation' }))
    fireEvent.change(screen.getByLabelText('Simulation speed'), { target: { value: '30' } })

    expect(onPlayPause).toHaveBeenCalledOnce()
    expect(onReset).toHaveBeenCalledOnce()
    expect(onSpeedChange).toHaveBeenCalledWith(30)
  })

  it('turns reset into the primary repeat action when the trip is complete', () => {
    const onPlayPause = vi.fn()
    const onReset = vi.fn()
    const onSpeedChange = vi.fn()

    render(
      <>
        <SimulationClock minute={65} isPlaying={false} isComplete />
        <SimulationControls
          isPlaying={false}
          isComplete
          speed={60}
          onPlayPause={onPlayPause}
          onReset={onReset}
          onSpeedChange={onSpeedChange}
        />
      </>,
    )

    expect(screen.getByText('Completado')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Play simulation' })).toBeDisabled()
    const repeatButton = screen.getByRole('button', { name: 'Repeat trip' })
    expect(repeatButton).toHaveTextContent('Repetir viaje')
    expect(repeatButton).toHaveClass('is-complete')

    fireEvent.click(repeatButton)
    expect(onReset).toHaveBeenCalledOnce()
    expect(onPlayPause).not.toHaveBeenCalled()
  })

  it('shows concise KPIs in plain Spanish with estimated fuel wording', () => {
    render(<KpiPanel metrics={metrics} />)
    expect(screen.getByText('7 / 15')).toBeInTheDocument()
    expect(screen.getByText('5 / 5')).toBeInTheDocument()
    expect(screen.getByText('71.0 km')).toBeInTheDocument()
    expect(screen.getByText('4.3 L')).toBeInTheDocument()
    expect(screen.getByText('Entregas')).toBeInTheDocument()
    expect(screen.getByText('Vehículos activos')).toBeInTheDocument()
    expect(screen.getByText('Distancia prevista')).toBeInTheDocument()
    expect(screen.getByText('Combustible estimado')).toBeInTheDocument()
  })

  it('shows truck status and next stop in plain Spanish', () => {
    render(<FleetPanel scenario={cocaCoquiScenario} snapshot={snapshot} />)
    expect(screen.getByText('Truck 01')).toBeInTheDocument()
    expect(screen.getByText('En camino')).toBeInTheDocument()
    expect(screen.getByText('Sigue · Local 03')).toBeInTheDocument()
    expect(screen.getByText('2 / 3 entregas')).toBeInTheDocument()
    expect(screen.getByText('Flota')).toBeInTheDocument()
    expect(screen.getByText('5 vehículos')).toBeInTheDocument()
  })

  it('discloses forecast provenance without implying real Cordoba delivery routes', () => {
    const provenance = getScenarioDefinition('cordoba-calibrated').provenance
    render(<ScenarioProvenance provenance={provenance} runMode="FORECAST" />)

    expect(screen.getByText('FORECAST · ESCENARIO CALIBRADO')).toBeInTheDocument()
    expect(screen.getByText(/Operación sintética reproducible/i)).toBeInTheDocument()
    expect(screen.getByText(/No representa demanda ni telemetría real de Córdoba/i)).toBeInTheDocument()
    expect(screen.getByText(/Comportamiento derivado de datos operacionales públicos/)).toBeInTheDocument()
    expect(screen.getByText('Fuente y método')).toBeInTheDocument()
    expect(screen.getByText('Fuente: Amazon Last Mile Routing Research Challenge')).toBeInTheDocument()
    expect(screen.getByText('Licencia fuente: CC BY-NC 4.0')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Ver fuente oficial' })).toHaveAttribute(
      'href',
      'https://registry.opendata.aws/amazon-last-mile-challenges/',
    )
    expect(document.body.textContent).not.toMatch(/Amazon Córdoba|Mercado Libre Córdoba|rutas reales de Amazon/i)
  })

  it('discloses simulated runs as synthetic and not observed', () => {
    const provenance = getScenarioDefinition('cordoba-calibrated').provenance
    render(<ScenarioProvenance provenance={provenance} runMode="SIMULATED" />)

    expect(screen.getByText('SIMULATED · ESCENARIO CALIBRADO')).toBeInTheDocument()
    expect(screen.getByText('Jornada sintética reproducible. No representa una operación real observada.')).toBeInTheDocument()
  })

  it('labels the legacy scenario explicitly as synthetic', () => {
    const provenance = getScenarioDefinition('coca-coqui-legacy').provenance
    render(<ScenarioProvenance provenance={provenance} />)
    expect(screen.getByText('ESCENARIO SINTÉTICO · LEGACY V0')).toBeInTheDocument()
  })
})
