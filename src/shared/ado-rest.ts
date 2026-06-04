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
