import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import 'maplibre-gl/dist/maplibre-gl.css'
import App from './App'
import './app.css'
import './ui-polish.css'
import { configureMapLibreWorker } from './map/mapWorker'

configureMapLibreWorker()

const root = document.getElementById('root')

if (!root) {
  throw new Error('Root element #root was not found')
}

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
