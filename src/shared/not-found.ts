// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

// azure-devops-node-api resolves a 404 to `null` instead of rejecting, and its
// HTTP layer (typed-rest-client's RestClient.processResponse) discards the body
// that says why. So a tool asked about a project, repository or work item that
// does not exist got `null` back, and answered with an empty text, a bare
// "No X found", or a TypeError from reading a property of null — never with
// Azure DevOps' own reason ("TF200016: The following project does not exist").
//
// This makes every REST client the connection hands out reject on a 404 with
// that message instead, so the tools' catch blocks report it like any other
// Azure DevOps error. Two places keep the library's null, because the library
// itself relies on it to discover where each API lives: OPTIONS requests
// (resource locations) and the Location client (resource areas).

import { WebApi } from "azure-devops-node-api";

interface HttpResponse {
  message?: { statusCode?: number };
  readBody?: () => Promise<string>;
}

interface RestClientInternals {
  client?: { options?: (...args: unknown[]) => Promise<HttpResponse> };
  processResponse?: (res: HttpResponse, options: unknown) => Promise<unknown>;
}

// getCoreApi, getGitApi, … — every factory that hands out a REST client, except
// the Location client the library resolves resource areas with.
const API_FACTORIES = Object.getOwnPropertyNames(WebApi.prototype).filter((name) => /^get\w+Api$/.test(name) && name !== "getLocationsApi");

function notFoundError(body: string): Error {
  let message = body.trim();
  try {
    const parsed = JSON.parse(body) as { message?: unknown };
    if (typeof parsed?.message === "string" && parsed.message) {
      message = parsed.message;
    }
  } catch {
    // Not JSON: the raw body is the best explanation there is.
  }
  const error = new Error(message || "Not found (404)") as Error & { statusCode: number };
  error.statusCode = 404;
  return error;
}

function rejectNotFound<T>(client: T): T {
  const rest = (client as { rest?: RestClientInternals } | undefined)?.rest;
  const http = rest?.client;
  const processResponse = rest?.processResponse;
  const httpOptions = http?.options;
  if (!rest || !http || typeof processResponse !== "function" || typeof httpOptions !== "function") {
    return client;
  }

  // Responses to OPTIONS requests, which must keep resolving to null.
  const optionsResponses = new WeakSet<object>();
  http.options = async (...args: unknown[]) => {
    const res = await httpOptions.apply(http, args);
    if (res && typeof res === "object") optionsResponses.add(res);
    return res;
  };

  rest.processResponse = async (res: HttpResponse, options: unknown) => {
    if (res?.message?.statusCode !== 404 || optionsResponses.has(res) || typeof res.readBody !== "function") {
      return processResponse.call(rest, res, options);
    }
    const body = await res.readBody().catch(() => "");
    throw notFoundError(body);
  };
  return client;
}

/** Make every REST client `connection` hands out reject on a 404 with Azure DevOps' message. Returns the same object. */
export function reportNotFound(connection: WebApi): WebApi {
  const factories = connection as unknown as Record<string, unknown>;
  for (const factory of API_FACTORIES) {
    const original = factories[factory];
    if (typeof original === "function") {
      factories[factory] = async (...args: unknown[]) => rejectNotFound(await original.apply(connection, args));
    }
  }
  return connection;
}
