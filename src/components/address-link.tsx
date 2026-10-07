import { cn } from 'cn'
import { m } from '#/paraglide/messages.js'
import { mapsHref } from '../../shared/maps'

/** An address that opens in the maps app (the web map on a computer). */
export function AddressLink({
  address,
  className,
}: {
  address: string
  className?: string
}) {
  return (
    <a
      href={mapsHref(address)}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={m.map_open({ address })}
      // The padding widens the tap area without changing the row's height.
      className={cn(
        '-my-2 inline-block py-2 text-primary underline-offset-4 hover:underline',
        className,
      )}
    >
      {address}
    </a>
  )
}
