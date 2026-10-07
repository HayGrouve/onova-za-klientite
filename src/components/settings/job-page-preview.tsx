import {
  BellIcon,
  CalendarBlankIcon,
  FlowArrowIcon,
  ListBulletsIcon,
  PaperclipIcon,
  ReceiptIcon,
  RepeatIcon,
  StackIcon,
  WalletIcon,
} from '@phosphor-icons/react'
import type { Icon } from '@phosphor-icons/react'
import { cn } from 'cn'
import { Flash } from '#/components/settings/settings-preview'
import { m } from '#/paraglide/messages.js'
import type { Modules } from '../../../shared/setup'
import type { Words } from '../../../shared/words'

type Part = {
  key: string
  icon: Icon
  title: string
  /** The module that shows or hides this part; absent means always shown. */
  module?: keyof Modules
  detail?: string
}

/**
 * A job page in miniature: its panels in page order. A part whose module is
 * off stays as a dashed outline marked "hidden", so it's clear what the switch
 * takes away, and that nothing is deleted.
 */
export function JobPagePreview({
  words,
  modules,
}: {
  words: Words
  modules: Modules
}) {
  const parts: Part[] = [
    { key: 'stage', icon: FlowArrowIcon, title: m.job_stage() },
    {
      key: 'appointments',
      icon: CalendarBlankIcon,
      title: words.appointment.plural,
      module: 'appointments',
    },
    {
      key: 'money',
      icon: WalletIcon,
      title: m.job_money(),
      detail: [
        m.job_price(),
        m.job_paid(),
        m.job_balance(),
        ...(modules.costs ? [m.job_costs(), m.job_profit()] : []),
      ].join(' · '),
    },
    { key: 'lines', icon: ListBulletsIcon, title: m.job_lines() },
    {
      key: 'costs',
      icon: ReceiptIcon,
      title: m.job_costs(),
      module: 'costs',
    },
    {
      key: 'items',
      icon: StackIcon,
      title: words.item.plural,
      module: 'items',
    },
    { key: 'repeat', icon: RepeatIcon, title: m.repeat_title() },
    {
      key: 'reminders',
      icon: BellIcon,
      title: m.reminder_list(),
      module: 'reminders',
    },
    { key: 'files', icon: PaperclipIcon, title: m.job_files() },
  ]
  return (
    // Two columns on a phone keep its pinned strip short.
    <div className="grid grid-cols-2 gap-1.5 xl:grid-cols-1">
      <p className="col-span-full pb-1 text-base font-semibold tracking-tight">
        {words.job.singular}
      </p>
      {parts.map(({ key, icon: IconComponent, title, module, detail }) => {
        const shown = module === undefined || modules[module]
        return (
          <Flash
            key={key}
            watch={[shown, detail]}
            className={cn(detail && 'col-span-full')}
          >
            <div
              className={cn(
                'flex min-h-9 items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm',
                shown
                  ? 'bg-muted/60'
                  : 'border border-dashed border-border text-muted-foreground/70',
              )}
            >
              <IconComponent aria-hidden className="size-4 shrink-0" />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className={cn('truncate', shown && 'font-medium')}>
                  {title}
                </span>
                {shown && detail && (
                  <span className="truncate text-xs text-muted-foreground">
                    {detail}
                  </span>
                )}
              </span>
              {!shown && <span className="text-xs">{m.preview_hidden()}</span>}
            </div>
          </Flash>
        )
      })}
    </div>
  )
}
