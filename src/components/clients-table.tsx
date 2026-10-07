import { UserCircleDashedIcon } from '@phosphor-icons/react'
import { Link, useNavigate } from '@tanstack/react-router'
import type { FunctionReturnType } from 'convex/server'
import { cn } from 'cn'
import type { api } from '../../convex/_generated/api'
import { InitialsAvatar } from '#/components/initials-avatar'
import { SortableHead, sortRows, useSort } from '#/components/sortable-head'
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
} from '#/components/ui/table'
import { useViewer } from '#/hooks/use-viewer'
import { m } from '#/paraglide/messages.js'
import { formatMoney } from '../../shared/money'
import { formatPhone } from '../../shared/phone-format'

type ClientRow = FunctionReturnType<typeof api.clients.list>[number]
type SortKey = 'name' | 'open' | 'owed' | 'credit'

const SORT: Record<SortKey, (a: ClientRow, b: ClientRow) => number> = {
  name: (a, b) => a.name.localeCompare(b.name, 'bg'),
  open: (a, b) => a.openJobs - b.openJobs,
  owed: (a, b) => a.owedCents - b.owedCents,
  credit: (a, b) => a.creditCents - b.creditCents,
}

/** The clients as a sortable table on a wide screen: who they are and where the money stands. */
export function ClientsTable({ clients }: { clients: ClientRow[] }) {
  const { words } = useViewer().business
  const navigate = useNavigate()
  const [sort, onSort] = useSort<SortKey>()
  const rows = sortRows(clients, sort, SORT)

  return (
    <div className="mx-4 animate-rise overflow-hidden surface">
      <Table>
        <TableHeader className="bg-foreground/3">
          <TableRow className="hover:bg-transparent">
            <SortableHead
              column="name"
              label={words.client.singular}
              sort={sort}
              onSort={onSort}
            />
            <th className="px-4 text-left font-semibold text-muted-foreground">
              {m.client_phone()}
            </th>
            <SortableHead
              column="open"
              label={m.clients_open_jobs({ jobs: words.job.plural })}
              sort={sort}
              onSort={onSort}
              numeric
            />
            <SortableHead
              column="owed"
              label={m.client_owes_total()}
              sort={sort}
              onSort={onSort}
              numeric
            />
            <SortableHead
              column="credit"
              label={m.client_credit()}
              sort={sort}
              onSort={onSort}
              numeric
            />
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((client) => (
            <TableRow
              key={client._id}
              className="cursor-pointer"
              onClick={(event) => {
                // The name is the real link; the rest of the row follows it.
                if ((event.target as HTMLElement).closest('a')) return
                void navigate({
                  to: '/clients/$clientId',
                  params: { clientId: client._id },
                })
              }}
            >
              <TableCell className="max-w-80 px-4 py-2.5">
                <span className="flex items-center gap-3">
                  {client.isNoClient ? (
                    <span
                      aria-hidden
                      className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground"
                    >
                      <UserCircleDashedIcon className="size-5" />
                    </span>
                  ) : (
                    <InitialsAvatar
                      name={client.name}
                      className="size-8 text-xs"
                    />
                  )}
                  <Link
                    to="/clients/$clientId"
                    params={{ clientId: client._id }}
                    className="truncate font-medium underline-offset-4 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
                  >
                    {client.isNoClient ? m.no_client() : client.name}
                  </Link>
                </span>
              </TableCell>
              <TableCell className="px-4 text-muted-foreground tabular-nums">
                {client.phone ? formatPhone(client.phone) : ''}
              </TableCell>
              <TableCell className="px-4 text-right tabular-nums">
                {client.openJobs || ''}
              </TableCell>
              <TableCell
                className={cn(
                  'px-4 text-right tabular-nums',
                  client.owedCents > 0
                    ? 'font-medium text-primary'
                    : 'text-muted-foreground',
                )}
              >
                {client.owedCents > 0 ? formatMoney(client.owedCents) : '–'}
              </TableCell>
              <TableCell className="px-4 text-right text-muted-foreground tabular-nums">
                {client.creditCents > 0 ? formatMoney(client.creditCents) : '–'}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
