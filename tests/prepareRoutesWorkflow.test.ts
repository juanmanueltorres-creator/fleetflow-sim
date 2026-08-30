import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

const workflowPath = '.github/workflows/prepare-routes.yml'

describe('prepare-routes workflow', () => {
  it('reconciles generated coordinates with calibrated routes before final scenario generation', async () => {
    const workflow = await readFile(workflowPath, 'utf8')

    const provisionalGeneration = workflow.indexOf('--output /tmp/cordoba-provisional.json')
    const calibratedRoutePreparation = workflow.indexOf('--scenario /tmp/cordoba-provisional.json')
    const finalGeneration = workflow.indexOf('npm run generate:calibrated')

    expect(provisionalGeneration).toBeGreaterThan(-1)
    expect(calibratedRoutePreparation).toBeGreaterThan(provisionalGeneration)
    expect(finalGeneration).toBeGreaterThan(calibratedRoutePreparation)
    expect(workflow).toContain('contents: read')
  })

  it('reruns route reconciliation when calibrated geography generation changes', async () => {
    const workflow = await readFile(workflowPath, 'utf8')

    expect(workflow).toContain('- scripts/generate-calibrated-scenario.mjs')
  })
})
