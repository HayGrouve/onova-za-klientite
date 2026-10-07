import { createContext, useContext } from 'react'
import type { FunctionReturnType } from 'convex/server'
import type { api } from '../../convex/_generated/api'

export type Viewer = NonNullable<FunctionReturnType<typeof api.users.viewer>>
export type ActiveBusiness = NonNullable<Viewer['business']>

const ViewerContext = createContext<Viewer | null>(null)

export const ViewerProvider = ViewerContext.Provider

/** The signed-in user and their active business. Only inside the signed-in shell. */
export function useViewer(): Viewer & { business: ActiveBusiness } {
  const viewer = useContext(ViewerContext)
  if (!viewer?.business)
    throw new Error('useViewer outside the signed-in shell')
  return viewer as Viewer & { business: ActiveBusiness }
}
