import { cn } from 'cn'
import { ScrollFade } from '#/components/scroll-fade'
import { Badge } from '#/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '#/components/ui/table'
import { m } from '#/paraglide/messages.js'
import { previewColumns, willImport } from '../../../shared/import'
import type {
  ImportRow,
  PreviewColumn,
  RowStatus,
} from '../../../shared/import'
import { formatPhone } from '../../../shared/phone-format'

export type PreviewRow = {
  row: ImportRow
  /** Known once the duplicates are checked. */
  status?: RowStatus
}

const HEADING: Record<Exclude<PreviewColumn['kind'], 'extra'>, () => string> = {
  name: m.import_target_name,
  phone: m.import_target_phone,
  email: m.import_target_email,
  address: m.import_target_address,
  note: m.import_target_note,
}

const heading = (column: PreviewColumn) =>
  column.kind === 'extra' ? column.header : HEADING[column.kind]()

function cellText(row: ImportRow, column: PreviewColumn) {
  switch (column.kind) {
    case 'name':
      return row.name
    case 'phone':
      return row.phones.map((phone) => formatPhone(phone)).join(', ')
    case 'email':
      return row.email
    case 'address':
      return row.address
    case 'note':
      return row.note.replace(/\s*\n\s*/g, ' · ')
    case 'extra':
      return row.extra[column.header] ?? ''
  }
}

/** What a row's mark says: what it is, and that it will be left out. */
function markText(status: RowStatus, skipDuplicates: boolean) {
  if (status === 'noName') return m.import_skip_noName()
  if (skipDuplicates) {
    return status === 'existing'
      ? m.import_skip_existing()
      : m.import_skip_inFile()
  }
  return status === 'existing' ? m.import_row_existing() : m.import_row_inFile()
}

/**
 * The first rows of the import with every column that has something in it, as
 * they would be saved. A row that will be left out as a duplicate says so and
 * is dimmed. A table on a wide screen, a list on a phone.
 */
export function PreviewTable({
  rows,
  skipDuplicates = true,
}: {
  rows: PreviewRow[]
  skipDuplicates?: boolean
}) {
  const columns = previewColumns(rows.map((item) => item.row))
  const marked = (status: RowStatus | undefined) =>
    status !== undefined && status !== 'ok'
  const dim = (status: RowStatus | undefined) =>
    status !== undefined && !willImport(status, skipDuplicates)

  return (
    <>
      <ul className="flex flex-col lg:hidden">
        {rows.map(({ row, status }, index) => (
          <li
            key={index}
            className={cn(
              'flex min-h-14 items-center justify-between gap-3 px-4 py-2',
              dim(status) && 'opacity-60',
            )}
          >
            <span className="flex min-w-0 flex-col">
              <span className="truncate font-medium">{row.name}</span>
              {columns
                .filter((column) => column.kind !== 'name')
                .map((column) => ({
                  column,
                  text: cellText(row, column),
                }))
                .filter(({ text }) => text)
                .map(({ column, text }) => (
                  <span
                    key={column.kind === 'extra' ? column.header : column.kind}
                    className="truncate text-sm text-muted-foreground"
                  >
                    {column.kind === 'extra' ? `${column.header}: ` : ''}
                    {text}
                  </span>
                ))}
            </span>
            {status && marked(status) && (
              <Badge variant="outline" className="shrink-0">
                {markText(status, skipDuplicates)}
              </Badge>
            )}
          </li>
        ))}
      </ul>
      <ScrollFade className="hidden overflow-hidden surface lg:block">
        <Table>
          <TableHeader className="bg-foreground/3">
            <TableRow className="hover:bg-transparent">
              {columns.map((column) => (
                <TableHead
                  key={column.kind === 'extra' ? column.header : column.kind}
                  className="h-11 px-4 font-semibold text-muted-foreground"
                >
                  {heading(column)}
                </TableHead>
              ))}
              <TableHead className="h-11 px-4">
                <span className="sr-only">{m.import_col_note()}</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map(({ row, status }, index) => (
              <TableRow key={index} className={cn(dim(status) && 'opacity-60')}>
                {columns.map((column, position) => (
                  <TableCell
                    key={column.kind === 'extra' ? column.header : column.kind}
                    title={cellText(row, column)}
                    className={cn(
                      'max-w-56 truncate px-4 py-2.5',
                      position === 0 ? 'font-medium' : 'text-muted-foreground',
                    )}
                  >
                    {cellText(row, column)}
                  </TableCell>
                ))}
                <TableCell className="px-4 text-right">
                  {status && marked(status) && (
                    <Badge variant="outline">
                      {markText(status, skipDuplicates)}
                    </Badge>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </ScrollFade>
    </>
  )
}
