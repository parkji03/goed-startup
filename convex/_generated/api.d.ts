/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as admin from "../admin.js";
import type * as companies from "../companies.js";
import type * as companyDashboard from "../companyDashboard.js";
import type * as companyOnboarding from "../companyOnboarding.js";
import type * as founderProfile from "../founderProfile.js";
import type * as guide from "../guide.js";
import type * as investors from "../investors.js";
import type * as lib_adminAuth from "../lib/adminAuth.js";
import type * as lib_facetTypes from "../lib/facetTypes.js";
import type * as lib_geocode from "../lib/geocode.js";
import type * as lib_guideQuery from "../lib/guideQuery.js";
import type * as lib_matchResources from "../lib/matchResources.js";
import type * as lib_resourceHelpers from "../lib/resourceHelpers.js";
import type * as me from "../me.js";
import type * as resourceEmbeddings from "../resourceEmbeddings.js";
import type * as resourceEmbeddingsNode from "../resourceEmbeddingsNode.js";
import type * as resourceImport from "../resourceImport.js";
import type * as resourceInternal from "../resourceInternal.js";
import type * as resourceMigration from "../resourceMigration.js";
import type * as resourceSubmissions from "../resourceSubmissions.js";
import type * as resourceValidators from "../resourceValidators.js";
import type * as resources from "../resources.js";
import type * as users from "../users.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  admin: typeof admin;
  companies: typeof companies;
  companyDashboard: typeof companyDashboard;
  companyOnboarding: typeof companyOnboarding;
  founderProfile: typeof founderProfile;
  guide: typeof guide;
  investors: typeof investors;
  "lib/adminAuth": typeof lib_adminAuth;
  "lib/facetTypes": typeof lib_facetTypes;
  "lib/geocode": typeof lib_geocode;
  "lib/guideQuery": typeof lib_guideQuery;
  "lib/matchResources": typeof lib_matchResources;
  "lib/resourceHelpers": typeof lib_resourceHelpers;
  me: typeof me;
  resourceEmbeddings: typeof resourceEmbeddings;
  resourceEmbeddingsNode: typeof resourceEmbeddingsNode;
  resourceImport: typeof resourceImport;
  resourceInternal: typeof resourceInternal;
  resourceMigration: typeof resourceMigration;
  resourceSubmissions: typeof resourceSubmissions;
  resourceValidators: typeof resourceValidators;
  resources: typeof resources;
  users: typeof users;
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
  agent: import("@convex-dev/agent/_generated/component.js").ComponentApi<"agent">;
};
