import { UserCircleDashedIcon } from '@phosphor-icons/react'
import { Link, useNavigate } from '@tanstack/react-router'
import type { FunctionReturnType } from 'convex/server'
import { cn } from 'cn'
import type { api } from '../../convex/_generated/api'
import { InitialsAvatar } from '#/components/initials-avatar'
import { ListExtras } from '#/components/list-extras'
import { ScrollFade } from '#/components/scroll-fade'
import { SortableHead } from '#/components/sortable-head'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '#/components/ui/table'
import { useViewer } from '#/hooks/use-viewer'
import { m } from '#/paraglide/messages.js'
import { formatMoney } from '../../shared/money'
import { formatPhone } from '../../shared/phone-format'
import { sortRows } from '../../shared/sort'
import type { Sort } from '../../shared/sort'

type ClientRow = FunctionReturnType<typeof api.clients.list>[number]

export const CLIENT_SORT_KEYS = ['name', 'open', 'owed', 'credit'] as const
export type ClientSortKey = (typeof CLIENT_SORT_KEYS)[number]

const SORT: Record<ClientSortKey, (a: ClientRow, b: ClientRow) => number> = {
  name: (a, b) => a.name.localeCompare(b.name, 'bg'),
  open: (a, b) => a.openJobs - b.openJobs,
  owed: (a, b) => a.owedCents - b.owedCents,
  credit: (a, b) => a.creditCents - b.creditCents,
}

// What the books need least goes first on a narrow screen: the phone moves
// under the name, and the count of open jobs goes (xl).
const WIDE_ONLY = 'hidden xl:table-cell'
const CELL = 'px-3 xl:px-4'

/**
 * The clients as a sortable table on a wide screen: who they are and where
 * the money stands, which comes right after the name.
 */
export function ClientsTable({
  clients,
  sort,
  onSort,
}: {
  clients: ClientRow[]
  sort: Sort<ClientSortKey>
  onSort: (key: ClientSortKey, numeric: boolean) => void
}) {
  const { words } = useViewer().business
  const navigate = useNavigate()
  const rows = sortRows(clients, sort, SORT)

  return (
    <ScrollFade className="mx-4 overflow-hidden surface">
      <Table>
        <TableHeader className="bg-foreground/3">
          <TableRow className="hover:bg-transparent">
            <SortableHead
              column="name"
              label={words.client.singular}
              sort={sort}
              onSort={onSort}
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
            <SortableHead
              column="open"
              label={m.clients_open_jobs({ jobs: words.job.plural })}
              sort={sort}
              onSort={onSort}
              numeric
              className={WIDE_ONLY}
            />
            <TableHead
              className={cn(
                WIDE_ONLY,
                'h-11 px-4 text-left font-semibold text-muted-foreground',
              )}
            >
              {m.client_phone()}
            </TableHead>
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
                // Cmd/Ctrl/Shift-clicks mean "somewhere else"; leave them alone.
                if (event.metaKey || event.ctrlKey || event.shiftKey) return
                void navigate({
                  to: '/clients/$clientId',
                  params: { clientId: client._id },
                })
              }}
            >
              <TableCell className={cn(CELL, 'max-w-60 py-2.5 xl:max-w-80')}>
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
                  <span className="flex min-w-0 flex-col">
                    <Link
                      to="/clients/$clientId"
                      params={{ clientId: client._id }}
                      className="truncate font-medium underline-offset-4 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
                    >
                      {client.isNoClient ? m.no_client() : client.name}
                    </Link>
                    {client.phone && (
                      <span className="truncate text-xs text-muted-foreground tabular-nums xl:hidden">
                        {formatPhone(client.phone)}
                      </span>
                    )}
                    <ListExtras
                      target="client"
                      values={client.listExtra}
                      className="text-xs"
                    />
                  </span>
                </span>
              </TableCell>
              <TableCell
                className={cn(
                  CELL,
                  'text-right tabular-nums',
                  client.owedCents > 0
                    ? 'font-medium text-primary'
                    : 'text-muted-foreground',
                )}
              >
                {client.owedCents > 0 ? formatMoney(client.owedCents) : ''}
              </TableCell>
              <TableCell
                className={cn(
                  CELL,
                  'text-right text-muted-foreground tabular-nums',
                )}
              >
                {client.creditCents > 0 ? formatMoney(client.creditCents) : ''}
              </TableCell>
              <TableCell
                className={cn(WIDE_ONLY, 'px-4 text-right tabular-nums')}
              >
                {client.openJobs || ''}
              </TableCell>
              <TableCell
                className={cn(
                  WIDE_ONLY,
                  'px-4 text-muted-foreground tabular-nums',
                )}
              >
                {client.phone ? formatPhone(client.phone) : ''}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </ScrollFade>
  )
}
