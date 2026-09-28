// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

// The two shapes almost every tool handler returns. Each tool module used to
// spell them out inline — 328 identical catch blocks and seven local copies of
// an ok/failed pair — so they live here once.

import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

/**
 * A successful result carrying `value` as JSON. Compact on purpose: the reader
 * is a model, and indentation made typical Azure DevOps payloads 13–15% longer.
 */
export function jsonResult(value: unknown): CallToolResult {
  return { content: [{ type: "text", text: JSON.stringify(value) }] };
}

/** The text to show for something a handler caught. */
export function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return typeof error === "string" ? error : "Unknown error occurred";
}

/** A failed result: `Error <action>: <message>`. */
export function toolError(action: string, error: unknown): CallToolResult {
  return { content: [{ type: "text", text: `Error ${action}: ${errorMessage(error)}` }], isError: true };
}

/** The sentence a paged tool's description ends with, so the model knows to ask for the next page. */
export const PAGED_RESULT_NOTE = "Returns {hasMore, continuationToken, items}; while hasMore is true, pass continuationToken back to get the next page.";

/**
 * One page of a paged list: `{hasMore, continuationToken?, items}`. The token
 * comes first so a reader sees it even when a long page gets cut off; pass it
 * back as the tool's `continuationToken` for the next page.
 */
export function pagedResult(items: unknown, continuationToken?: string): CallToolResult {
  return jsonResult(continuationToken ? { hasMore: true, continuationToken, items } : { hasMore: false, items });
}
