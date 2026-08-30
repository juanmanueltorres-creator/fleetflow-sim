import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('README operational run regeneration', () => {
  it('documents the active v2 artifact vintage', () => {
    const readme = readFileSync(resolve(process.cwd(), 'README.md'), 'utf8')
    const command = readme.match(/npm run generate:operational-runs --[\s\S]*?```/)?.[0]

    expect(command).toBeDefined()
    expect(command).toContain('--run-suffix v2')
  })
})
