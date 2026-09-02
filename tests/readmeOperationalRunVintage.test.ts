import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('README reproducibility documentation', () => {
  it('keeps detailed generation commands in docs instead of the front-page README', () => {
    const readme = readFileSync(resolve(process.cwd(), 'README.md'), 'utf8')

    expect(readme).toContain('Detailed generation commands')
    expect(readme).toContain('[`docs/superpowers`](docs/superpowers)')
    expect(readme).not.toContain('npm run generate:operational-runs --')
  })
})
