import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '#/components/ui/tooltip'

/**
 * Names an icon-only control on hover or keyboard focus. The control keeps its
 * own aria-label; the tip only shows that name to mouse users.
 */
export function Tip({
  label,
  side = 'bottom',
  children,
}: {
  label: string
  side?: 'top' | 'bottom' | 'left' | 'right'
  children: React.ReactElement
}) {
  return (
    <Tooltip>
      <TooltipTrigger render={children} />
      <TooltipContent side={side}>{label}</TooltipContent>
    </Tooltip>
  )
}
