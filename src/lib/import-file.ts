import { parseCsv, tableFromRows } from '../../shared/import'
import type { Table } from '../../shared/import'

export type ImportFileResult =
  | { ok: true; table: Table }
  | { ok: false; reason: 'xls' | 'type' | 'empty' | 'unreadable' | 'big' }

/** A real client list is far smaller; a bigger file is refused before it is read. */
export const MAX_IMPORT_BYTES = 5 * 1024 * 1024

const OLE_MAGIC = [0xd0, 0xcf, 0x11, 0xe0]

/**
 * A chosen file as a table. `.xlsx` goes through read-excel-file and CSV
 * through papaparse, both loaded only now. An old `.xls` (by name, or by what
 * the file starts with) is refused, so the screen can ask for `.xlsx` or CSV (D20).
 */
export async function readImportFile(file: File): Promise<ImportFileResult> {
  if (file.size > MAX_IMPORT_BYTES) return { ok: false, reason: 'big' }
  const name = file.name.toLowerCase()
  const bytes = new Uint8Array(await file.arrayBuffer())
  if (
    name.endsWith('.xls') ||
    OLE_MAGIC.every((byte, i) => bytes[i] === byte)
  ) {
    return { ok: false, reason: 'xls' }
  }
  const isXlsx = name.endsWith('.xlsx')
  if (!isXlsx && !/\.(csv|txt|tsv)$/.test(name)) {
    return { ok: false, reason: 'type' }
  }
  try {
    let table: Table
    if (isXlsx) {
      const { readSheet } = await import('read-excel-file/browser')
      table = tableFromRows(await readSheet(file))
    } else {
      table = await parseCsv(bytes)
    }
    return table.rows.length === 0
      ? { ok: false, reason: 'empty' }
      : { ok: true, table }
  } catch {
    return { ok: false, reason: 'unreadable' }
  }
}
