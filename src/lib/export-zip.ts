import { strToU8, zipSync } from 'fflate'

const BOM = String.fromCharCode(0xfeff)

/** One CSV per table: the union of all keys as columns, nested values as JSON. */
export function toCsv(rows: Array<Record<string, unknown>>): string {
  const columns = [...new Set(rows.flatMap((row) => Object.keys(row)))]
  const cell = (value: unknown) => {
    if (value === undefined || value === null) return ''
    let text = typeof value === 'object' ? JSON.stringify(value) : String(value)
    // Text that a spreadsheet would run as a formula is kept as text.
    if (typeof value === 'string' && /^[=+\-@\t\r]/.test(text))
      text = `'${text}`
    return /[",\n\r;]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
  }
  const lines = [
    columns.join(','),
    ...rows.map((row) => columns.map((column) => cell(row[column])).join(',')),
  ]
  // A BOM so Excel reads the Cyrillic as UTF-8.
  return `${BOM}${lines.join('\r\n')}\r\n`
}

/** data.json plus one CSV per table, zipped. */
export function buildExportZip(data: {
  exportedAt: number
  business: unknown
  tables: Record<string, Array<Record<string, unknown>>>
}): Uint8Array {
  const files: Record<string, Uint8Array> = {
    'data.json': strToU8(JSON.stringify(data, null, 2)),
  }
  for (const [table, rows] of Object.entries(data.tables)) {
    files[`${table}.csv`] = strToU8(toCsv(rows))
  }
  return zipSync(files, { level: 6 })
}
