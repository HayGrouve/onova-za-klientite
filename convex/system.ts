import { internalQuery } from './_generated/server'

/** `npx convex run system:whereAmI` prints the deployment's region (ADR 0002). */
export const whereAmI = internalQuery({
  args: {},
  handler: async (ctx) => {
    const { name, region } = await ctx.meta.getDeploymentMetadata()
    return { name, region }
  },
})
