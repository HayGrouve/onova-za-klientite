# ADR 0002: Convex in the EU (Ireland) region

**Status:** Proposed. The project is created only after the owner's OK.

## Context

The design doc wants client data hosted in the EU. Convex picks a region per **deployment**, when the deployment is created, and it can never be changed. Moving later means exporting into a new deployment. EU hosting works on every plan, and usage outside the US is billed at 1.3×. The sibling app has no region setting to copy.

`npx convex dev` has no `--region` flag. A deployment created without one takes the team's default region, and the default can only be set in the dashboard. The CLI's auto-provisioning paths may fall back to US when the team has no default (unconfirmed).

## Decision

- Every deployment (production, each developer's dev, previews) is in `aws-eu-west-1` (Ireland).
- Deployments are created explicitly, with the region on the command line ([source](https://docs.convex.dev/production/regions), flags read from the `convex@1.46.0` CLI source):
  ```bash
  npx convex project create onova-za-klientite --team <team>
  npx convex deployment create <team>:onova-za-klientite:production --type prod --region eu
  npx convex deployment create <team>:onova-za-klientite:dev/<name> --type dev --region eu --select
  ```
- As a safety net, the team's default region is set to Europe (Ireland) once, in the dashboard (Team settings). There is no CLI for it.
- The region is verified, not assumed, in two ways:
  - every deployment URL must contain `.eu-west-1.`;
  - an internal `system:whereAmI` query returns `ctx.meta.getDeploymentMetadata().region`, which must be `aws-eu-west-1`.

## Consequences

- The first preview deployment's region must be checked in the Vercel build log, because the docs don't say which region previews use.
- The data in the EU is the Convex database and files. Sign-in data sits with Clerk, and push messages pass through Google's, Apple's and Mozilla's push services. Vercel functions run in `dub1` (Dublin), next to the database.
- Free-plan included allowances may not apply to EU deployments (the Feb 2026 launch post and the pricing page disagree). Check the team usage page after the first deploy.
