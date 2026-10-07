import { useMutation } from 'convex/react'
import { toast } from 'sonner'
import { api } from '../../../convex/_generated/api'
import type { Id } from '../../../convex/_generated/dataModel'
import { patchSettings } from '#/components/settings/optimistic'
import { Button } from '#/components/ui/button'
import { errorMessage } from '#/lib/errors'
import { m } from '#/paraglide/messages.js'
import type { Modules } from '../../../shared/setup'

/**
 * A Settings section whose module is switched off: says so, and turns it on
 * in one tap instead of a trip to Modules.
 */
export function ModuleOff({
  businessId,
  modules,
  module,
  owner,
  children,
}: {
  businessId: Id<'businesses'>
  modules: Modules
  module: keyof Modules
  owner: boolean
  /** What being off means for this section. */
  children: string
}) {
  const setModules = useMutation(
    api.businesses.setModules,
  ).withOptimisticUpdate((store, args) =>
    patchSettings(store, args.businessId, { modules: args.modules }),
  )
  return (
    <div className="flex flex-col gap-3 surface p-4 text-sm">
      <p>{children}</p>
      {owner && (
        <Button
          variant="outline"
          className="h-11 w-fit"
          onClick={() =>
            void setModules({
              businessId,
              modules: { ...modules, [module]: true },
            })
              .then(() => toast.success(m.saved()))
              .catch((error: unknown) => toast.error(errorMessage(error)))
          }
        >
          {m.module_turn_on()}
        </Button>
      )}
    </div>
  )
}
