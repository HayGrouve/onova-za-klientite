import { cn } from 'cn'
import { initials } from '#/lib/initials'

// Soft colours, none of them red or green, so an avatar never reads as a status.
const PALETTE = [
  'bg-blue-100 text-blue-800',
  'bg-violet-100 text-violet-800',
  'bg-teal-100 text-teal-800',
  'bg-amber-100 text-amber-900',
  'bg-pink-100 text-pink-800',
  'bg-sky-100 text-sky-800',
]

function colourFor(name: string) {
  let hash = 0
  for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) | 0
  return PALETTE[Math.abs(hash) % PALETTE.length]
}

/** A round badge with a person's initials. Decorative: the name is shown next to it. */
export function InitialsAvatar({
  name,
  className,
}: {
  name: string
  className?: string
}) {
  return (
    <span
      aria-hidden
      className={cn(
        'flex size-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold',
        colourFor(name),
        className,
      )}
    >
      {initials(name)}
    </span>
  )
}
