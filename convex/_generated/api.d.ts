/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as account from "../account.js";
import type * as appointments from "../appointments.js";
import type * as businesses from "../businesses.js";
import type * as calendar from "../calendar.js";
import type * as clients from "../clients.js";
import type * as clientsAdmin from "../clientsAdmin.js";
import type * as costs from "../costs.js";
import type * as counts from "../counts.js";
import type * as crons from "../crons.js";
import type * as dataExport from "../dataExport.js";
import type * as fields from "../fields.js";
import type * as files from "../files.js";
import type * as import_ from "../import.js";
import type * as items from "../items.js";
import type * as jobs from "../jobs.js";
import type * as lib_activity from "../lib/activity.js";
import type * as lib_auth from "../lib/auth.js";
import type * as lib_businessTables from "../lib/businessTables.js";
import type * as lib_clientWrite from "../lib/clientWrite.js";
import type * as lib_clock from "../lib/clock.js";
import type * as lib_createBusiness from "../lib/createBusiness.js";
import type * as lib_errors from "../lib/errors.js";
import type * as lib_extra from "../lib/extra.js";
import type * as lib_insertStage from "../lib/insertStage.js";
import type * as lib_jobCounts from "../lib/jobCounts.js";
import type * as lib_jobIndex from "../lib/jobIndex.js";
import type * as lib_jobWrite from "../lib/jobWrite.js";
import type * as lib_ledger from "../lib/ledger.js";
import type * as lib_listFields from "../lib/listFields.js";
import type * as lib_moveJob from "../lib/moveJob.js";
import type * as lib_pushText from "../lib/pushText.js";
import type * as lib_rateLimit from "../lib/rateLimit.js";
import type * as lib_recompute from "../lib/recompute.js";
import type * as lib_repeat from "../lib/repeat.js";
import type * as lib_scope from "../lib/scope.js";
import type * as lib_search from "../lib/search.js";
import type * as lib_seedAccess from "../lib/seedAccess.js";
import type * as lib_summary from "../lib/summary.js";
import type * as lib_todayData from "../lib/todayData.js";
import type * as lib_validate from "../lib/validate.js";
import type * as lib_views from "../lib/views.js";
import type * as money from "../money.js";
import type * as newJob from "../newJob.js";
import type * as offline from "../offline.js";
import type * as payments from "../payments.js";
import type * as push from "../push.js";
import type * as pushNode from "../pushNode.js";
import type * as reminders from "../reminders.js";
import type * as repeat from "../repeat.js";
import type * as search from "../search.js";
import type * as seed from "../seed.js";
import type * as seedData from "../seedData.js";
import type * as services from "../services.js";
import type * as setup from "../setup.js";
import type * as stages from "../stages.js";
import type * as system from "../system.js";
import type * as today from "../today.js";
import type * as users from "../users.js";
import type * as validators from "../validators.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  account: typeof account;
  appointments: typeof appointments;
  businesses: typeof businesses;
  calendar: typeof calendar;
  clients: typeof clients;
  clientsAdmin: typeof clientsAdmin;
  costs: typeof costs;
  counts: typeof counts;
  crons: typeof crons;
  dataExport: typeof dataExport;
  fields: typeof fields;
  files: typeof files;
  import: typeof import_;
  items: typeof items;
  jobs: typeof jobs;
  "lib/activity": typeof lib_activity;
  "lib/auth": typeof lib_auth;
  "lib/businessTables": typeof lib_businessTables;
  "lib/clientWrite": typeof lib_clientWrite;
  "lib/clock": typeof lib_clock;
  "lib/createBusiness": typeof lib_createBusiness;
  "lib/errors": typeof lib_errors;
  "lib/extra": typeof lib_extra;
  "lib/insertStage": typeof lib_insertStage;
  "lib/jobCounts": typeof lib_jobCounts;
  "lib/jobIndex": typeof lib_jobIndex;
  "lib/jobWrite": typeof lib_jobWrite;
  "lib/ledger": typeof lib_ledger;
  "lib/listFields": typeof lib_listFields;
  "lib/moveJob": typeof lib_moveJob;
  "lib/pushText": typeof lib_pushText;
  "lib/rateLimit": typeof lib_rateLimit;
  "lib/recompute": typeof lib_recompute;
  "lib/repeat": typeof lib_repeat;
  "lib/scope": typeof lib_scope;
  "lib/search": typeof lib_search;
  "lib/seedAccess": typeof lib_seedAccess;
  "lib/summary": typeof lib_summary;
  "lib/todayData": typeof lib_todayData;
  "lib/validate": typeof lib_validate;
  "lib/views": typeof lib_views;
  money: typeof money;
  newJob: typeof newJob;
  offline: typeof offline;
  payments: typeof payments;
  push: typeof push;
  pushNode: typeof pushNode;
  reminders: typeof reminders;
  repeat: typeof repeat;
  search: typeof search;
  seed: typeof seed;
  seedData: typeof seedData;
  services: typeof services;
  setup: typeof setup;
  stages: typeof stages;
  system: typeof system;
  today: typeof today;
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

export declare const components: {
  pushPool: import("@convex-dev/workpool/_generated/component.js").ComponentApi<"pushPool">;
  rateLimiter: import("@convex-dev/rate-limiter/_generated/component.js").ComponentApi<"rateLimiter">;
};
