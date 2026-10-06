# ADR 0002: Convex in the EU (Ireland) region

**Status:** Accepted (6 Oct 2026), amended: development stays on the Free plan, and production is created in EU at launch.

## Context

The design doc wants client data hosted in the EU. Convex picks a region per **deployment**, when the deployment is created, and it can never be changed. Moving later means exporting into a new deployment. EU hosting works on every plan, and usage outside the US is billed at 1.3×. The sibling app has no region setting to copy.

`npx convex dev` has no `--region` flag. A deployment created without one takes the team's default region, and the default can only be set in the dashboard. The CLI's auto-provisioning paths may fall back to US when the team has no default (unconfirmed).

## Decision

- **Production** is in `aws-eu-west-1` (Ireland). It is created fresh when the app is ready to launch, with the owner's OK, so no development data or region choice carries over into it.
- **Development and preview** deployments stay on the team's Free plan and hold only seed data. They use EU (Ireland) if Free offers it, and otherwise the default region. Being disposable, they can be deleted and recreated at any time.
- **Until launch**, Vercel's production deploys (needed from milestone 1, see [ADR 0004](./0004-vercel-with-convex-previews.md)) use the Free project's own production deployment. It is just as disposable. At launch, Vercel's production deploy key is switched to the fresh EU deployment, in a new Convex project if the old one can't hold a second production deployment.
- Deployments are created explicitly, with the region on the command line ([source](https://docs.convex.dev/production/regions), flags read from the `convex@1.46.0` CLI source):
  ```bash
  npx convex project create onova-za-klientite --team <team>
  npx convex deployment create <team>:onova-za-klientite:production --type prod --region eu
  npx convex deployment create <team>:onova-za-klientite:dev/<name> --type dev --region eu --select
  ```
- The production region is verified, not assumed, in two ways:
  - every deployment URL must contain `.eu-west-1.`;
  - an internal `system:whereAmI` query returns `ctx.meta.getDeploymentMetadata().region`, which must be `aws-eu-west-1`.

## Consequences

- Real client data only ever goes into the production deployment, so EU hosting of that data doesn't depend on where development runs.
- Plan, backups and the production deploy key are decided again just before production is created.
- The data in the EU is the Convex database and files. Sign-in data sits with Clerk, and push messages pass through Google's, Apple's and Mozilla's push services. Vercel functions run in `dub1` (Dublin), next to the database.
- Free-plan included allowances may not apply to EU deployments (the Feb 2026 launch post and the pricing page disagree). Check the team usage page after the first deploy.
