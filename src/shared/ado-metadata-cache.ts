// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

// azure-devops-node-api resolves two kinds of service metadata before the first
// real request of a client: the organization's resource areas (which host
// serves which area) and each area's resource locations (the OPTIONS response
// that maps a route id to a URL template and api-versions). It caches both, but
// on the WebApi and client instances — and the server builds a fresh WebApi for
// every tool call, so every call paid three extra round trips (measured on a
// real organization: 4 requests and ~1s instead of 1 request).
//
// Neither is user data: both describe the organization's service layout and are
// the same for every caller, so one process-wide cache is safe in the stateless
// HTTP transport too. Only a usable result is kept: a non-empty array of
// resource areas (cloud), or the on-prem `{count: 0, value: null}` shape that
// _getResourceAreaUrl documents. Anything else — `null`, `undefined`, an empty
// array, another shape, or a rejection — is forgotten, so the next caller
// retries instead of being stuck for the life of the process with a result
// _getResourceAreaUrl would treat as "route everything to the org URL".

import { WebApi } from "azure-devops-node-api";

import { logger } from "../logger.js";

type AreaLocations = Record<string, Promise<unknown>>;

interface WebApiInternals {
  _getResourceAreas?: () => Promise<unknown>;
}

interface ClientInternals {
  vsoClient?: { baseUrl?: unknown; _locationsByAreaPromises?: unknown };
}

const resourceAreasByOrganization = new Map<string, Promise<unknown>>();
const locationsByBaseUrl = new Map<string, AreaLocations>();

// getCoreApi, getGitApi, … — every factory that hands out a REST client.
const API_FACTORIES = Object.getOwnPropertyNames(WebApi.prototype).filter((name) => /^get\w+Api$/.test(name));

let warnedAboutInternals = false;

/**
 * Mirrors the shape check in azure-devops-node-api's own `_getResourceAreaUrl`
 * (`!resourceAreas || resourceAreas.length === 0 || resourceAreas.count === 0`):
 * that function treats anything else as "route everything to the org URL",
 * which is only correct for a real on-prem `{count: 0, value: null}` response.
 * A cloud response is a non-empty array; anything else (null, undefined, an
 * empty array, or some other shape) is not a result worth caching forever.
 */
function isUsableResourceAreas(value: unknown): boolean {
  if (Array.isArray(value)) {
    return value.length > 0;
  }
  return typeof value === "object" && value !== null && (value as { count?: unknown }).count === 0;
}

/** Make `connection` use the process-wide metadata cache. Returns the same object. */
export function shareAdoMetadata(connection: WebApi): WebApi {
  const internals = connection as unknown as WebApiInternals & Record<string, unknown>;
  if (typeof internals._getResourceAreas !== "function") {
    if (!warnedAboutInternals) {
      warnedAboutInternals = true;
      logger.warn("azure-devops-node-api internals changed; Azure DevOps metadata is no longer shared between tool calls");
    }
    return connection;
  }

  const loadResourceAreas = internals._getResourceAreas.bind(connection);
  const organization = connection.serverUrl.toLowerCase();
  internals._getResourceAreas = () => {
    const shared = resourceAreasByOrganization.get(organization);
    if (shared) {
      // This caller did not start the in-flight lookup. If it rejects (e.g.
      // the initiating caller's token was invalid), fall back to this
      // connection's own credentials instead of failing on someone else's
      // error. The initiator itself gets the rejection below, unwrapped.
      return shared.catch(() => loadResourceAreas());
    }

    const areas = loadResourceAreas();
    resourceAreasByOrganization.set(organization, areas);
    const forget = () => resourceAreasByOrganization.delete(organization);
    areas.then((value) => {
      if (!isUsableResourceAreas(value)) forget();
    }, forget);
    return areas;
  };

  for (const factory of API_FACTORIES) {
    const original = internals[factory];
    if (typeof original === "function") {
      internals[factory] = async (...args: unknown[]) => shareLocations(await original.apply(connection, args));
    }
  }
  return connection;
}

function shareLocations<T>(client: T): T {
  const vsoClient = (client as ClientInternals | undefined)?.vsoClient;
  if (vsoClient && typeof vsoClient.baseUrl === "string" && typeof vsoClient._locationsByAreaPromises === "object" && vsoClient._locationsByAreaPromises !== null) {
    const key = vsoClient.baseUrl.toLowerCase();
    let shared = locationsByBaseUrl.get(key);
    if (!shared) {
      shared = vsoClient._locationsByAreaPromises as AreaLocations;
      locationsByBaseUrl.set(key, shared);
    }
    vsoClient._locationsByAreaPromises = shared;
  }
  return client;
}

/** Test seam: forget everything cached. */
export function clearAdoMetadataCache(): void {
  resourceAreasByOrganization.clear();
  locationsByBaseUrl.clear();
}
