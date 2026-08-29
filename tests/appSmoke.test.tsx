import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import App from '../src/App'

describe('FleetFlow app shell', () => {
  it('renders the V0 identity and simulation controls', () => {
    render(<App />)

    expect(screen.getByRole('heading', { name: 'FleetFlow Sim' })).toBeInTheDocument()
    expect(screen.getByText('Coca Coqui — Córdoba Distribution Run')).toBeInTheDocument()
    expect(screen.getByText('06:00')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Play simulation' })).toBeInTheDocument()
  })
})
