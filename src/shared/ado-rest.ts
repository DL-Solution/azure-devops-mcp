// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

// Several Azure DevOps REST areas are served from a sibling host of the core
// organization URL (e.g. Graph from vssps, Artifacts from feeds, Member
// Entitlement from vsaex). This maps the organization URL to that sibling host.
//
//   Cloud:  https://dev.azure.com/{org}      -> https://{subdomain}.dev.azure.com/{org}
//   Legacy: https://{org}.visualstudio.com   -> https://{org}.{subdomain}.visualstudio.com
//   On-prem Azure DevOps Server: same collection host (fallback).
export function subdomainBaseUrl(serverUrl: string, subdomain: string): string {
  const trimmed = serverUrl.replace(/\/$/, "");
  if (trimmed.includes("://dev.azure.com/")) {
    return trimmed.replace("://dev.azure.com/", `://${subdomain}.dev.azure.com/`);
  }
  const legacy = trimmed.match(/^(https?:\/\/)([^./]+)\.visualstudio\.com(\/.*)?$/);
  if (legacy) {
    return `${legacy[1]}${legacy[2]}.${subdomain}.visualstudio.com${legacy[3] ?? ""}`;
  }
  return trimmed;
}

// Issues an authenticated Azure DevOps REST request. Declares UTF-8 on bodies so
// non-ASCII content is transmitted correctly.
export async function adoFetch(options: { url: string; method: string; token: string; userAgent: string; body?: unknown; contentType?: string }): Promise<Response> {
  const headers: Record<string, string> = {
    "Authorization": `Bearer ${options.token}`,
    "User-Agent": options.userAgent,
  };
  if (options.body !== undefined) {
    headers["Content-Type"] = `${options.contentType ?? "application/json"}; charset=utf-8`;
  }
  return fetch(options.url, {
    method: options.method,
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
}

// Past this an error body is noise: a model needs the message, not a stack trace.
const MAX_ERROR_TEXT = 1000;

export const HTML_INSTEAD_OF_JSON = "Azure DevOps returned an HTML page instead of JSON (usually a sign-in page: the token is missing, expired or lacks access)";

function contentTypeOf(response: Response): string {
  // Test doubles and some polyfills hand back a response without headers.
  return response.headers?.get?.("content-type")?.toLowerCase() ?? "";
}

/**
 * Whether Azure DevOps answered with a web page. A missing or expired token
 * often gets the sign-in page with 203 — a 2xx a caller would otherwise try to
 * read as JSON — so REST helpers treat it as an error. `body`, when given, is
 * also sniffed, for a page served without a content type.
 */
export function isHtmlResponse(response: Response, body?: string): boolean {
  if (contentTypeOf(response).includes("text/html")) return true;
  return body !== undefined && /^\s*<(!doctype html|html)[\s>]/i.test(body);
}

function truncate(text: string): string {
  const trimmed = text.trim();
  return trimmed.length > MAX_ERROR_TEXT ? `${trimmed.slice(0, MAX_ERROR_TEXT)}… (${trimmed.length - MAX_ERROR_TEXT} more characters)` : trimmed;
}

function jsonErrorMessage(body: string): string | undefined {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return undefined;
  }
  const error = parsed as { message?: unknown; Message?: unknown; value?: { Message?: unknown; message?: unknown }; error?: { message?: unknown } } | null;
  for (const candidate of [error?.message, error?.Message, error?.value?.Message, error?.value?.message, error?.error?.message]) {
    if (typeof candidate === "string" && candidate.trim()) return candidate.trim();
  }
  return undefined;
}

/**
 * What a failed Azure DevOps response has to say, without the status: the
 * `message` of a JSON error (Azure DevOps wraps it as `message`, `value.Message`
 * or OData's `error.message`), one sentence for an HTML page, otherwise the body
 * cut to 1000 characters. `body` is the already-read response text.
 */
export function adoErrorMessage(response: Response, body: string): string {
  if (isHtmlResponse(response, body)) return HTML_INSTEAD_OF_JSON;
  const trimmed = body.trim();
  if (contentTypeOf(response).includes("json") || trimmed.startsWith("{")) {
    const message = jsonErrorMessage(trimmed);
    if (message) return truncate(message);
  }
  return truncate(body);
}

/** `<status>: <message>` for a failed Azure DevOps response (see `adoErrorMessage`). */
export function adoErrorText(response: Response, body: string): string {
  return `${response.status}: ${adoErrorMessage(response, body)}`;
}
