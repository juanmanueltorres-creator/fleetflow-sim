import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import App from '../src/App'

describe('FleetFlow app shell', () => {
  it('renders the V0.4 identity, calibrated default and simulation controls', () => {
    render(<App />)

    expect(screen.getByRole('heading', { name: 'FleetFlow Sim' })).toBeInTheDocument()
    expect(screen.getByText('Córdoba Last-Mile Calibrado')).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: /Córdoba calibrado/i })).toBeChecked()
    expect(screen.getByRole('radio', { name: /Coca Coqui/i })).not.toBeChecked()
    expect(screen.getByText('06:00')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Play simulation' })).toBeInTheDocument()
  })
})
