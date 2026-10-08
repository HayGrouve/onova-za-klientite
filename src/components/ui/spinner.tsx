import { cn } from "cn"
import { SpinnerIcon } from "@phosphor-icons/react"
import { m } from "#/paraglide/messages.js"

// Local change (ADR 0009): the label comes from the translation files. Icons
// are hidden from screen readers app-wide (__root.tsx), so a spinner standing
// alone opts back in as a status; one inside a button (data-icon) stays
// hidden, since the button already says what is happening.
function Spinner({ className, ...props }: React.ComponentProps<"svg"> & { "data-icon"?: string }) {
  const inline = props["data-icon"] !== undefined
  return (
    <SpinnerIcon
      data-slot="spinner"
      {...(inline ? {} : { role: "status", "aria-label": m.loading(), "aria-hidden": false })}
      className={cn("size-4 animate-spin", className)}
      {...props}
    />
  )
}

export { Spinner }
