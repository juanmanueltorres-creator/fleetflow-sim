import { access, readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

const workflowPath = '.github/workflows/prepare-routes.yml'
const standaloneWorkflowPath = '.github/workflows/generate-calibrated-scenario.yml'

describe('prepare-routes workflow', () => {
  it('reconciles generated coordinates with calibrated routes before final scenario generation', async () => {
    const workflow = await readFile(workflowPath, 'utf8')

    const provisionalGeneration = workflow.indexOf('npm run generate:calibrated -- --mode provisional --output /tmp/cordoba-provisional.json')
    const calibratedRoutePreparation = workflow.indexOf('--scenario /tmp/cordoba-provisional.json')
    const finalGeneration = workflow.lastIndexOf('npm run generate:calibrated')

    expect(provisionalGeneration).toBeGreaterThan(-1)
    expect(calibratedRoutePreparation).toBeGreaterThan(provisionalGeneration)
    expect(finalGeneration).toBeGreaterThan(calibratedRoutePreparation)
    expect(workflow).toContain('contents: read')
  })

  it('reruns reconciliation when any canonical calibrated generation input changes', async () => {
    const workflow = await readFile(workflowPath, 'utf8')

    expect(workflow).toContain('- scripts/generate-calibrated-scenario.mjs')
    expect(workflow).toContain('- scripts/lib/calibrated-scenario-generator.mjs')
    expect(workflow).toContain('- src/scenario/calibration/amazon-last-mile-v1.json')
    expect(workflow).toContain('- public/data/cordoba-calibrated-routes.geojson')
    expect(workflow).toContain('- package.json')
  })

  it('has no standalone one-pass calibrated scenario workflow', async () => {
    await expect(access(standaloneWorkflowPath)).rejects.toMatchObject({ code: 'ENOENT' })
  })
})
