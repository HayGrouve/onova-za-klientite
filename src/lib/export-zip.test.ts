import { strFromU8, unzipSync } from 'fflate'
import { describe, expect, it } from 'vitest'
import { buildExportZip, toCsv } from './export-zip'

describe('export zip', () => {
  it('quotes values that need it and keeps every column', () => {
    const csv = toCsv([
      { name: 'Иван, Петров', phones: [{ e164: '+359888' }] },
      { email: 'a@b.bg' },
    ])
    expect(csv).toContain('name,phones,email')
    expect(csv).toContain('"Иван, Петров"')
    expect(csv).toContain('"[{""e164"":""+359888""}]"')
  })

  it('re-reading the zip finds every record', () => {
    const data = {
      exportedAt: 1,
      business: { name: 'x' },
      tables: { clients: [{ _id: 'a' }, { _id: 'b' }], jobs: [{ _id: 'c' }] },
    }
    const files = unzipSync(buildExportZip(data))
    expect(Object.keys(files).sort()).toEqual([
      'clients.csv',
      'data.json',
      'jobs.csv',
    ])
    const parsed = JSON.parse(strFromU8(files['data.json'])) as typeof data
    expect(parsed.tables.clients).toHaveLength(2)
    expect(strFromU8(files['clients.csv']).trim().split('\r\n')).toHaveLength(3)
  })
})
