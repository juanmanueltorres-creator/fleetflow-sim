import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { streamJsonObjectEntries } from '../scripts/lib/stream-json-object.mjs'

const tempDirs: string[] = []

afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

describe('streamJsonObjectEntries', () => {
  it('parses top-level entries across tiny chunks without confusing NaN inside strings', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'fleetflow-json-stream-'))
    tempDirs.push(dir)
    const path = join(dir, 'source.json')

    writeFileSync(path, `{
      "RouteID_A": {
        "zone_id": NaN,
        "label": "NaN-zone-kept-as-text",
        "quote": "say \\"hi\\"",
        "nested": [1, {"ok": true}]
      },
      "RouteID_B": {"value": 42, "items": ["a", "b"]}
    }`)

    const entries: Array<[string, unknown]> = []
    for await (const entry of streamJsonObjectEntries(path, { highWaterMark: 7 })) {
      entries.push(entry)
    }

    expect(entries).toEqual([
      ['RouteID_A', {
        zone_id: null,
        label: 'NaN-zone-kept-as-text',
        quote: 'say "hi"',
        nested: [1, { ok: true }],
      }],
      ['RouteID_B', { value: 42, items: ['a', 'b'] }],
    ])
  })
})
