import { ArrowRightIcon, WalletIcon } from '@phosphor-icons/react'
import { cn } from 'cn'
import { Tip } from '#/components/tip'
import { Button } from '#/components/ui/button'
import { m } from '#/paraglide/messages.js'

/**
 * The job page's main action and the payment beside it (D116). The main one
 * is solid: "Next: <stage>", or the payment itself once there is no next
 * stage and money is owed. Beside "Next" the payment is an outline button,
 * only a wallet on a phone, where both must fit under a thumb. With nothing
 * left to do there is no solid button, only the quiet payment.
 *
 * `pinned` holds the pair above the phone's bottom nav, in thumb reach;
 * otherwise it sits where it is placed, under the money.
 */
export function JobActions({
  main,
  nextName,
  onNext,
  onPay,
  pinned,
  compact,
}: {
  main: 'next' | 'pay' | null
  /** The next stage's name, when `main` is "next". */
  nextName?: string
  onNext: () => void
  onPay: () => void
  pinned: boolean
  /** A phone: the payment beside "Next" is only its icon. */
  compact: boolean
}) {
  const payLabel = m.pay_add()
  const buttons =
    main === 'next' ? (
      <>
        <Button
          size="xl"
          className="min-w-0 flex-1 whitespace-normal lg:max-w-80 @max-sm:flex-none"
          onClick={onNext}
        >
          <span className="min-w-0 truncate">
            {m.stage_next({ stage: nextName ?? '' })}
          </span>
          <ArrowRightIcon data-icon="inline-end" />
        </Button>
        {compact ? (
          <Tip label={payLabel} side="top">
            <Button
              size="icon-xl"
              variant="outline"
              aria-label={payLabel}
              onClick={onPay}
            >
              <WalletIcon />
            </Button>
          </Tip>
        ) : (
          <Button size="xl" variant="outline" onClick={onPay}>
            <WalletIcon data-icon="inline-start" />
            {payLabel}
          </Button>
        )}
      </>
    ) : (
      <Button
        size="xl"
        variant={main === 'pay' ? 'default' : 'outline'}
        className={cn(main === 'pay' && 'flex-1 lg:max-w-80 lg:flex-none')}
        onClick={onPay}
      >
        <WalletIcon data-icon="inline-start" />
        {payLabel}
      </Button>
    )

  if (!pinned) {
    return (
      // A narrow column (1024 px, beside the side rail) stacks the two.
      <div className="@container">
        <div
          className={cn('flex gap-2', main === 'next' && '@max-sm:flex-col')}
        >
          {buttons}
        </div>
      </div>
    )
  }
  return (
    <>
      {/* Keeps the end of the page clear of the pinned bar. */}
      <div aria-hidden className="h-16 shrink-0" />
      <div className="fixed inset-x-0 bottom-(--job-bar-bottom) z-30 bg-linear-to-t from-canvas from-60% to-transparent pt-3 pb-2">
        <div className="mx-auto flex max-w-lg gap-2 px-4">{buttons}</div>
      </div>
    </>
  )
}
