// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

// Azure DevOps pages a long list by answering with an `x-ms-continuationtoken`
// response header; the caller passes it back as `continuationToken` to get the
// next page. azure-devops-node-api never reads that header: every list method
// does `res = await this.rest.get(...)` and returns
// `this.formatResponse(res.result, …)`, dropping `res.headers`. Its
// `PagedList.continuationToken` is declared but never set. So a tool that took a
// continuationToken could never give one back, and nobody got past page one.
//
// This makes every REST client the connection hands out remember the header:
// typed-rest-client's `processResponse` (which does carry the headers) records
// the token against the parsed body, and the client's `formatResponse` carries
// it over to the object it returns — for a wrapped collection that is a new
// array, `body.value`, not the body itself. `continuationTokenOf(result)` then
// reads it back. A WeakMap keyed by the returned object keeps the result itself
// untouched and lets it be collected with it.

import { WebApi } from "azure-devops-node-api";

const CONTINUATION_HEADER = "x-ms-continuationtoken";

const tokens = new WeakMap<object, string>();
const patched = new WeakSet<object>();

interface RestResponse {
  result?: unknown;
  headers?: Record<string, string | string[] | undefined>;
}

interface ClientInternals {
  rest?: { processResponse?: (res: unknown, options: unknown) => Promise<RestResponse> };
  formatResponse?: (data: unknown, ...args: unknown[]) => unknown;
}

// getCoreApi, getBuildApi, … — every factory that hands out a REST client.
const API_FACTORIES = Object.getOwnPropertyNames(WebApi.prototype).filter((name) => /^get\w+Api$/.test(name));

function isObject(value: unknown): value is object {
  return typeof value === "object" && value !== null;
}

function headerToken(headers: RestResponse["headers"]): string | undefined {
  const value = headers?.[CONTINUATION_HEADER];
  const token = Array.isArray(value) ? value[0] : value;
  return typeof token === "string" && token ? token : undefined;
}

/** Remember `token` as the continuation token of `result` (an object). Returns `result`. */
export function rememberContinuationToken<T>(result: T, token: string | undefined): T {
  if (token && isObject(result)) tokens.set(result, token);
  return result;
}

/** The continuation token Azure DevOps sent with the response `result` came from, if any. */
export function continuationTokenOf(result: unknown): string | undefined {
  return isObject(result) ? tokens.get(result) : undefined;
}

function recordContinuation<T>(client: T): T {
  const internals = client as ClientInternals | undefined;
  const rest = internals?.rest;
  const processResponse = rest?.processResponse;
  const formatResponse = internals?.formatResponse;
  if (!internals || !rest || typeof processResponse !== "function" || typeof formatResponse !== "function" || patched.has(internals)) {
    return client;
  }
  patched.add(internals);

  rest.processResponse = async (res: unknown, options: unknown) => {
    const response = await processResponse.call(rest, res, options);
    rememberContinuationToken(response?.result, headerToken(response?.headers));
    return response;
  };

  internals.formatResponse = function (this: unknown, data: unknown, ...args: unknown[]) {
    return rememberContinuationToken(formatResponse.call(this, data, ...args), continuationTokenOf(data));
  };
  return client;
}

/** Make every REST client `connection` hands out remember the continuation token of each response. Returns the same object. */
export function captureContinuationTokens(connection: WebApi): WebApi {
  const factories = connection as unknown as Record<string, unknown>;
  for (const factory of API_FACTORIES) {
    const original = factories[factory];
    if (typeof original === "function") {
      factories[factory] = async (...args: unknown[]) => recordContinuation(await original.apply(connection, args));
    }
  }
  return connection;
}
