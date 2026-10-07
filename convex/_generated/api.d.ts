/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as clients from "../clients.js";
import type * as costs from "../costs.js";
import type * as fields from "../fields.js";
import type * as items from "../items.js";
import type * as jobs from "../jobs.js";
import type * as lib_activity from "../lib/activity.js";
import type * as lib_auth from "../lib/auth.js";
import type * as lib_createBusiness from "../lib/createBusiness.js";
import type * as lib_errors from "../lib/errors.js";
import type * as lib_extra from "../lib/extra.js";
import type * as lib_moveJob from "../lib/moveJob.js";
import type * as lib_recompute from "../lib/recompute.js";
import type * as lib_search from "../lib/search.js";
import type * as lib_seedAccess from "../lib/seedAccess.js";
import type * as lib_validate from "../lib/validate.js";
import type * as payments from "../payments.js";
import type * as seed from "../seed.js";
import type * as seedData from "../seedData.js";
import type * as stages from "../stages.js";
import type * as system from "../system.js";
import type * as users from "../users.js";
import type * as validators from "../validators.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  clients: typeof clients;
  costs: typeof costs;
  fields: typeof fields;
  items: typeof items;
  jobs: typeof jobs;
  "lib/activity": typeof lib_activity;
  "lib/auth": typeof lib_auth;
  "lib/createBusiness": typeof lib_createBusiness;
  "lib/errors": typeof lib_errors;
  "lib/extra": typeof lib_extra;
  "lib/moveJob": typeof lib_moveJob;
  "lib/recompute": typeof lib_recompute;
  "lib/search": typeof lib_search;
  "lib/seedAccess": typeof lib_seedAccess;
  "lib/validate": typeof lib_validate;
  payments: typeof payments;
  seed: typeof seed;
  seedData: typeof seedData;
  stages: typeof stages;
  system: typeof system;
  users: typeof users;
  validators: typeof validators;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
