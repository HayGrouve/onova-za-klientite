// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { MAX_IMPORT_BYTES, readImportFile } from './import-file'

describe('readImportFile size cap', () => {
  it('refuses a file over 5 MB without reading it', async () => {
    const file = new File([new Uint8Array(MAX_IMPORT_BYTES + 1)], 'clients.csv')
    const read = vi.spyOn(file, 'arrayBuffer')
    expect(await readImportFile(file)).toEqual({ ok: false, reason: 'big' })
    expect(read).not.toHaveBeenCalled()
  })

  it('reads a small CSV as before', async () => {
    const file = new File(['name,phone\nIvan,0888123456\n'], 'clients.csv')
    const result = await readImportFile(file)
    expect(result.ok).toBe(true)
  })
})
